# Verificación en producción — Mostrador

**Fecha:** 2026-11-01, 17:10 (UTC-3)
**URL pública:** https://vps-6576881-x.dattaweb.com/
**Commit verificado:** `af42b95` (+ correcciones de documentación posteriores)
**Servidor:** DonWeb Cloud Server **#6576881** · `vps-6576881-x` · Ubuntu 24.04.5 LTS · kernel 6.8.0-147 · 2 vCPU · 3.9 GB RAM · 22 GB libres

Todo lo de abajo se ejecutó **contra la URL pública**, no contra localhost. Los comandos
están escritos para poder re-correrlos y comparar.

---

## 1. Infraestructura

| Check | Comando | Resultado observado |
|---|---|---|
| DNS público | `dig +short vps-6576881-x.dattaweb.com` | `201.32.132.178` |
| DNS desde terceros | Cloudflare DNS + Google DNS | ambos devuelven `201.32.132.178` |
| TLS | `openssl s_client -connect ...:443` | `subject=CN=vps-6576881-x.dattaweb.com` · `issuer=Let's Encrypt YE2` · válido hasta **2027-01-30** |
| HTTP → HTTPS | `curl -o /dev/null -w '%{http_code} %{redirect_url}' http://...` | `301 → https://vps-6576881-x.dattaweb.com/` |
| Puerto SSH | placa del panel | **5249** (no 22, regla DonWeb) |
| Firewall del host | `iptables -S` · `ufw status` | políticas ACCEPT · ufw **inactive** (no se instaló nada) |
| Servicio | `systemctl is-enabled/is-active mostrador` | `enabled` · `active` |
| nginx | `ss -ltn` | `0.0.0.0:80`, `0.0.0.0:443` |
| Node escuchando | `ss -ltn` | **solo** `127.0.0.1:3000` |
| Permisos del `.env` | `stat -c %a /opt/mostrador/.env` | `600` |
| Código fuente en el server | `ls /opt/mostrador/context/raw` | no existe — `context/raw/` **no se subió** (tiene credenciales y PDFs) |

## 2. Runtime de la aplicación

```
$ curl -sS https://vps-6576881-x.dattaweb.com/api/healthz
{"ok":true,"db":"node:sqlite","ai":"live","email":"mock","time":"2026-11-01T20:06:37Z"}
```

- `db: node:sqlite` — `process.versions.sqlite` presente en Node **22.23.4**; cero compilación nativa.
- `ai: live` — gpt-4o-mini respondiendo.
- `email: mock` — declarado, no hay credencial de EnvíaloSimple con dominio verificado.

## 3. Core flow, de punta a punta, por HTTPS

```
$ curl -sS -X POST https://vps-6576881-x.dattaweb.com/api/quotes \
    -H 'content-type: application/json' \
    -d '{"texto":"..."}'
```

| Entrada (mensaje tal como llega) | Ítems | Total | Latencia |
|---|---|---|---|
| 300 tirafondos del 8 + 25 m cable 2 por 1,5 + 10 bolsas cemento, email embebido | 3 (conf 0.90 / 0.88 / 0.83) | **$143.750** | 1855 ms |
| 50 tirafondos del 8 + 4 bolsas de cemento | 2 | **$41.450** | 1533 ms |
| ejemplo 2 del sitio (10 cemento + 20 hierro) | 2 | **$247.000** | — |

Aritmética verificada a mano: `300×45 + 25×1290 + 10×9800 = 13.500 + 32.250 + 98.000 = 143.750`.

### Latencias medidas (10 corridas secuenciales contra la URL pública)

| Métrica | Valor |
|---|---|
| mínimo | 914 ms |
| **p50** | **1.135 ms** |
| **p95** | **1.185 ms** |
| máximo | 1.414 ms |

Las 10 entradas incluyeron frases invertidas, coma decimal, y una consulta de precio
("me pasas precio de un taladro?"). **9 devolvieron total > 0 y la décima fue el
comportamiento correcto**: `taladro` no está en el catálogo de 15 productos, así que salió
con `sku=null`, `confianza=0` y `requiere_revision=true` en vez de inventar un importe.
Sobre el criterio que importa —no inventar precios— son **10/10**.

## 4. Casos dorados contra producción

```
$ BASE_URL=https://vps-6576881-x.dattaweb.com node prompts/evals/run.js
```

```
caso-1-cantidad-explicita    PASS  1923 ms  live
caso-2-dos-items-unidades    PASS  1551 ms  live
caso-3-sin-contacto          PASS  1692 ms  live
caso-4-contacto-embebido     PASS  1486 ms  live
caso-5-vacio                 PASS    56 ms  -
5/5 casos dorados
```

## 5. Navegador real (no `curl`)

Pasada manual sobre la URL pública con Chrome, midiendo el DOM:

- Home carga, `<h1>` = *"Del WhatsApp al presupuesto enviado."*, badge **"IA en vivo"**.
- Botón `ejemplo 1/2/3` → llena el textarea → `Generar presupuesto` → tabla con ítems,
  unitario, subtotal y **Total**.
- `Ver artefacto` → `/q/<token>` con cabecera de la ferretería, total, y leyenda
  *"Generado con IA (live) en N ms · válido 7 días"*.
- `Enviar por email` → **"Modo mock: ver el email (EnvíaloSimple sin credencial)"**.
  La UI nunca dice "enviado" cuando fue mock.
- `/impacto` → contadores leídos de `impact_events`, etiquetados como indicador IRIS+.
- **Mobile 375×667:** `scrollWidth - innerWidth = 0` (sin scroll horizontal), tanto en la
  home como después de generar el presupuesto. Los tres contadores entran en su tarjeta
  (`sobra_derecha = -12 px`).

## 6. Vantage externo (equivalente al "probar desde un celular en 4G")

`r.jina.ai` (fetcher que corre en la infraestructura de Jina, fuera de la red local)
devolvió la home completa y renderizada:

```
Title: Mostrador IA · Ferretería San Luis
## Del WhatsApp al presupuesto enviado.
Pegá el mensaje del cliente tal como llegó. ...
```

Esto confirma que el sitio es alcanzable desde una red externa, no solo desde la red de
la autora. Dos proxies de terceros (codetabs, allorigins) devolvieron `522`, que es un
fallo **de ellos** (ambos corren sobre Cloudflare Workers con timeouts cortos); el mismo
contenido servido a Jina demuestra que el origen responde.

## 7. Suite local

```
$ node --test tests/          → tests 19 · pass 19 · fail 0
$ node prompts/evals/run.js   → 5/5 casos dorados
$ git status --short          → limpio
```

## 8. Qué NO está verificado (declarado, no escondido)

| Punto | Estado | Qué lo resolvería |
|---|---|---|
| Email real entregado | **mock**. Nunca se mandó un email de verdad | Crear cuenta EnvíaloSimple, verificar dominio remitente, `EMAIL_MODE=live` + `ENVIALOSIMPLE_API_KEY` |
| Los ~20 min por presupuesto | **SUPUESTO**, no medido | Cronometrar 5 presupuestos reales en 3 ferreterías del Gran Rosario |
| Concurrencia | 1 proceso, SQLite local. Sin prueba de carga | `ab`/`k6` contra `POST /api/quotes` con 50 usuarios |
| Autenticación | **no hay**. Cualquiera con la URL genera presupuestos | Login + cuota por comercio antes de un piloto real |
| Rate limit | en memoria, por IP, se reinicia con el proceso | Redis o tabla en SQLite si se corre más de una instancia |
| Backup | copiar el archivo SQLite; no hay cron | `sqlite3 .backup` diario + rotación |
| Prueba desde un teléfono físico en 4G | hecha con un fetcher externo, no con un celular propio | abrir la URL desde un celular con datos móviles en el predio |

## 9. Cómo re-verificar todo en 30 segundos

```bash
U=https://vps-6576881-x.dattaweb.com
curl -sS $U/api/healthz                 # esperado: {"ok":true,...,"ai":"live",...}
curl -sS -o /dev/null -w '%{http_code}\n' $U/
BASE_URL=$U node prompts/evals/run.js   # esperado: 5/5 casos dorados
node --test tests/                      # esperado: pass 19 / fail 0
```
