# Mini-arc42 — Mostrador

## 1. Objetivos y requisitos

Convertir el mensaje de WhatsApp de un cliente de ferretería en un presupuesto cotizado, enviado y contabilizado en menos de 40 segundos. Requisito duro del hackatón: URL pública funcionando antes de las 18:30 (§3.7 del reglamento: sin URL no hay evaluación).

## 2. Restricciones

Individual; 3 h 15 min; Node.js + Express; SQLite local; una única API key de OpenAI compartida y sólo para la IA del producto; Cloud Server Ubuntu 24.04 con firewall administrado desde el panel; sin bundler ni SPA (el tiempo de un build no está en el presupuesto).

## 3. Contexto y alcance

| Actor / sistema | Relación |
|---|---|
| Mostradorista (dueño o empleado) | Pega el chat, revisa el presupuesto, lo envía |
| Cliente de la ferretería | Recibe el presupuesto por email; nunca toca la app |
| OpenAI API | Extrae ítems del texto libre. **No** cotiza |
| EnvíaloSimple Transaccional | Entrega el email |
| DonWeb Cloud Server | Aloja el proceso y nginx |

Fuera de alcance: facturación electrónica, stock real, multi-sucursal, login de usuarios.

## 4. Estrategia

Un proceso, un archivo de base, tres pantallas. Toda la complejidad se concentra en una sola frontera: `src/services/ai.js` (entrada ruidosa → estructura) y `src/services/catalog.js` (estructura → precio real). El resto es EJS y `fetch`.

## 5. Bloques

| Bloque | Responsabilidad |
|---|---|
| `app.js` | Bootstrap, carga de `.env`, montaje de routers, manejadores de error |
| `src/db.js` | Apertura de la base; `better-sqlite3` con fallback a `node:sqlite` |
| `src/routes/index.js` | `GET /`, `GET /q/:token`, `GET /impacto`, `GET /outbox/:token` |
| `src/routes/api.js` | `POST /api/quotes`, `POST /api/quotes/:token/send`, `GET /api/impact`, `GET /api/healthz` |
| `src/services/ai.js` | Prompt, `json_schema` estricto, zod, reparación, modo degradado |
| `src/services/catalog.js` | Matcher léxico con stemming y umbral de confianza |
| `src/services/presupuesto.js` | Orquesta el core flow y persiste |
| `src/services/email.js` | EnvíaloSimple real + mock con preview |
| `src/services/impact.js` | `impact_events` y contadores |
| `src/views/` | EJS: index, quote, impacto, 404 |

## 6. Vista de runtime (core flow)

```
UI ──POST /api/quotes──► api.js
                          └─► presupuesto.crearPresupuesto()
                               ├─► ai.extractOrder()      → OpenAI (o degradado)
                               ├─► catalog.matchItem()    → products
                               ├─► INSERT quotes
                               ├─► INSERT ai_calls        (auditoría)
                               └─► impact.logQuote()
       ◄──201 {token, quote, meta}──
UI ──POST /api/quotes/:token/send──► email.sendQuoteEmail()
                                     ├─ modo mock  → data/outbox/<token>.html
                                     └─ modo live  → POST api.envialosimple.email
                                    └─ INSERT leads + impact.logEmail()
```

## 7. Vista de despliegue

```
Internet
   │  :80 (y :443 cuando haya dominio)
   ▼
nginx  ──proxy_pass──►  127.0.0.1:3000 (node app.js, servicio systemd)
                              │
                              └──►  data/mostrador.sqlite  (WAL, sólo localhost)
```

Firewall: virtual, administrado desde el panel de DonWeb. **No se instala `ufw`.** El puerto SSH no es el 22. El `.env` vive en `/opt/mostrador/.env` con permisos 600.

## 8. Conceptos transversales

- **Errores:** envelope único `{error:{code,message}}` (Zalando §errors). Ningún 500 con stack al cliente.
- **Auditoría de IA:** toda llamada al modelo deja una fila en `ai_calls` (modelo, modo, tokens, latencia, `schema_ok`, reparaciones, error). Es lo que se muestra en el panel "¿Cómo se generó?".
- **Degradación honesta:** sin clave de OpenAI, `ai_mode='degraded'` viaja en la fila y se pinta en la UI. Nunca se presenta como IA en vivo.
- **Idempotencia del seed:** `INSERT OR REPLACE`, se puede re-ejecutar sin romper nada.
- **Configuración:** sólo por variables de entorno; `.env.example` versionado, `.env` ignorado.

## 9. Decisiones

[ADR-001 SQLite con fallback](adr-001-sqlite.md) · [ADR-002 sin SSE](adr-002-no-sse.md) · [ADR-003 email mock por defecto](adr-003-email-mock-default.md).

## 10. Requisitos de calidad

| Atributo | Escenario | Cómo se cumple |
|---|---|---|
| Latencia | presupuesto en < 5 s con la IA en vivo | una sola llamada estructurada, sin streaming, timeout 20 s |
| Disponibilidad | la app sigue funcionando si OpenAI falla | extractor determinístico de respaldo |
| Auditabilidad | poder explicar cualquier precio | el precio sale del catálogo; `ai_calls` guarda la traza |
| Portabilidad | correr en 1 vCPU / 1 GB | sin bundler, sin ORM, sin servicios externos salvo OpenAI |

## 11. Riesgos y deuda técnica

1. **Matcher léxico:** no resuelve sinónimos fuera de `aliases`; un ítem desconocido queda en `requiere_revision` (correcto pero incompleto).
2. **Sin autenticación:** cualquiera con la URL genera presupuestos. Inaceptable en un piloto real.
3. **Sin rate limit** en `/api/quotes`: con una clave compartida es un riesgo de costo.
4. **SQLite de un proceso:** no escala a más de una instancia sin migrar a Postgres.
5. **El número de 20 min del baseline no está medido** — es el supuesto más riesgoso de todo el caso de negocio.

## 12. Glosario

- **Presupuesto:** documento con ítems, cantidades, precios unitarios y total, enviable por email.
- **Modo degradado:** extracción por reglas cuando no hay modelo disponible.
- **Confianza:** score 0–1 del matcher contra el catálogo; < 0,55 exige revisión humana.
- **`impact_events`:** registro de impacto (minutos ahorrados, monto cotizado) que alimenta `/impacto`.
