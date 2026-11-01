# Mostrador

**De WhatsApp al presupuesto cotizado contra el catálogo real de la ferretería, en segundos.**

## Descripción corta

Mostrador es una herramienta para una ferretería de barrio de Rosario. El dueño pega el mensaje de WhatsApp del cliente tal como llegó —mal escrito, con coma decimal, sin formato— y en 1,2 a 4,6 segundos sale un presupuesto con SKU, precio unitario y total, listo para enviar. La IA sólo extrae ítems, cantidades y datos de contacto: el precio lo pone el catálogo de la ferretería. Si un ítem no se reconoce con confianza suficiente, se marca "revisar" en lugar de inventar un importe. Corre en un Cloud Server de DonWeb con Node 22 y SQLite. Hoy el envío de email está en modo mock declarado; el HTML exacto del correo se puede ver en `/outbox/<token>`.

## Descripción larga

En una ferretería de barrio de 2 a 6 empleados del Gran Rosario, cada pedido que entra por WhatsApp se arma a mano: se relee el chat, se busca el precio en una planilla de Excel, se calcula y se reescribe el presupuesto. El resultado es de aproximadamente 20 minutos por presupuesto y unas 4 horas por semana por mostrador, y el presupuesto sale cuando el mostrador se libera, no cuando el cliente pregunta. El contexto: el Gran Rosario tiene 11,5% de desocupación, la tasa más alta entre los 31 aglomerados del país (INDEC, EPH 2º trimestre 2026, Cuadro 3.2). La UNRaf relevó en 2022 que las PyMEs manufactureras de Santa Fe están en las primeras etapas de digitalización y que la IA no es una tendencia extendida; el alcance de ese estudio son manufactureras, no comercios minoristas, y se cita como contexto provincial.

Mostrador resuelve el paso que hace perder la venta. El dueño pega el mensaje del cliente y el sistema devuelve un presupuesto con ítems, cantidades, SKU del catálogo, precio unitario, subtotal y total. El presupuesto queda en una URL pública e imprimible (`/q/<token>`) y se puede enviar por email; el HTML exacto del correo se renderiza en `/outbox/<token>`.

La decisión de arquitectura que sostiene el producto es una sola: **el modelo extrae, el catálogo cotiza**. El LLM devuelve únicamente descripciones, cantidades y datos de contacto, con `json_schema` estricto, validación zod y un reintento de reparación. Tiene prohibido por prompt devolver importes o SKUs. El precio sale siempre de la tabla `products` de la ferretería. Un ítem que el matcher no vincula con confianza mayor o igual a 0,55 se marca `requiere_revision` en amarillo, en vez de cotizarse con un número inventado. Cada llamada queda auditada con modelo, latencia, tokens y reparaciones de schema. Si falta la clave de OpenAI, la app funciona con un extractor determinístico y lo dice en pantalla.

El impacto se mide dentro del producto: cada presupuesto registra los minutos ahorrados en `impact_events` y el contador de `/impacto` sale de la base, no de una slide. La suite tiene 19 tests y los 5 casos dorados se corrieron contra la URL pública. El baseline de 20 minutos sigue siendo un supuesto: el primer paso del piloto es cronometrar presupuestos reales en cinco ferreterías del Gran Rosario.

## Links

- **App en vivo:** https://vps-6576881-x.dattaweb.com/
- **Repo:** https://github.com/JuanLunaIA/mostrador

## Stack y cómo se corre

Node.js 22 LTS o superior, Express 5, EJS, SQLite (`node:sqlite` con fallback a `better-sqlite3`), OpenAI `gpt-4o-mini` con structured outputs y zod, Tailwind compilado local (sin CDN). En producción: DonWeb Cloud Server, Ubuntu 24.04, nginx como proxy y systemd.

```bash
git clone https://github.com/JuanLunaIA/mostrador.git
cd mostrador
npm ci
cp .env.example .env      # OPENAI_API_KEY es opcional: sin ella arranca en modo degradado
node src/seed.js          # 15 productos de ferretería
npm start                 # http://127.0.0.1:3000
```

Requiere Node `>= 22` (el deploy corre 22.23.4). `npm test` corre la suite y `npm run evals` los casos dorados contra el servidor levantado. El email sale en modo mock por defecto (`EMAIL_MODE=mock`); `EMAIL_MODE=live` con `ENVIALOSIMPLE_API_KEY` y un dominio remitente verificado usa la API real.

## Qué es real y qué no

| Qué | Estado | Detalle |
|---|---|---|
| URL pública | **Real** | HTTPS con Let's Encrypt, nginx → Node en `127.0.0.1:3000` → SQLite. `/api/healthz` responde `ok:true`. |
| IA en vivo | **Real** | `gpt-4o-mini`, 1,2 a 4,6 s por presupuesto, medido contra la URL pública. |
| Precios | **Real** | Salen de la tabla `products`, nunca del modelo. El catálogo de demo tiene 15 productos. |
| Email | **Mock declarado** | La API transaccional de EnvíaloSimple es un add-on pago que esta cuenta no tiene contratado, y falta verificar el dominio remitente. Nunca se envió un email real. El HTML se ve en `/outbox/<token>` y la UI dice "Modo mock", no "enviado". |
| 20 minutos por presupuesto | **Supuesto** | No está medido. Es el número que sostiene el caso de negocio y el primer paso del piloto es cronometrarlo. |
| Autenticación | **No hay** | Cualquiera con la URL puede generar presupuestos. Sirve para la demo, no para un piloto real. |
| Rate limit | **Parcial** | En memoria y por IP: se reinicia con el proceso y no se comparte entre instancias. |
| Persistencia | **Limitada** | SQLite de un solo archivo; no soporta más de un proceso escribiendo. |
| Tests | **Real** | 19 tests locales y 5/5 casos dorados ejecutados contra la URL pública. |
| 11,5% de desocupación | **Evidencia** | INDEC, EPH 2º trimestre 2026, Cuadro 3.2. Es la tasa más alta de los 31 aglomerados. |
| UNRaf 2022 | **Evidencia con alcance** | Relevamiento de PyMEs **manufactureras** de Santa Fe, no de comercios. Se usa como contexto provincial. |

## Pitch de 30 segundos

En una ferretería de barrio de Rosario, armar a mano un presupuesto de WhatsApp lleva unos veinte minutos: releer el chat, buscar el precio en una planilla y reescribirlo. Mostrador lo hace en segundos: el dueño pega el mensaje, la IA extrae los ítems y el precio lo pone el catálogo, nunca el modelo. Corre en un Cloud Server de DonWeb, con la IA en vivo y el email en modo mock declarado. Buscamos cinco ferreterías del Gran Rosario para el piloto.
