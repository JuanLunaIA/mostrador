# Diccionario de datos de Mostrador

Qué hay adentro de `mostrador.sqlite`, columna por columna. Si tocás `src/schema.sql`,
actualizá este archivo en el mismo commit: el exportador y estos apuntes son lo que usa
alguien para mirar los datos sin tener que leer el código.

- Motor: SQLite (WAL activo en la app, `foreign_keys = ON`).
- Plata: todos los montos son **enteros en pesos argentinos** (`ARS`), sin centavos.
- Fechas: `TEXT` en formato `YYYY-MM-DD HH:MM:SS`, **UTC**, generadas por `datetime('now')`.
- Nombres de tablas y columnas: `snake_case`, sin tildes ni `ñ`.
- Cinco tablas de negocio: `products`, `quotes`, `ai_calls`, `impact_events`, `leads`.
  (`sqlite_sequence` es interna de SQLite, la crea el `AUTOINCREMENT` y no se exporta.)

## Cómo mirar los datos

```bash
# Export completo (CSV por tabla + resumen.json con totales) contra la base local
node scripts/export.js --db data/mostrador.sqlite --out data/export

# Contra produccion, sin escribirle nada a la base (abre en solo lectura)
node scripts/export.js --db /opt/mostrador/data/mostrador.sqlite --out /tmp/export-prod

# Solo algunas tablas
node scripts/export.js --tablas quotes,leads --out /tmp/export

# Estado y respaldo consistente (incluye el WAL, cosa que un cp no hace)
node deploy/sqlite-backup.js inspect data/mostrador.sqlite
node deploy/sqlite-backup.js backup /opt/mostrador/data/mostrador.sqlite /tmp/mostrador-$(date +%F).sqlite
```

El exportador abre la base con `readOnly: true` **y** `PRAGMA query_only = 1`, lee todo
dentro de una única transacción (los `COUNT(*)` y las filas salen de la misma foto) y
corta con error si el conteo no coincide. Nunca escribe en la base.

## Aclaración importante: no existe `quote_items`

Los ítems de un presupuesto **no** están en una tabla aparte: viven adentro de
`quotes.items_json`, un array JSON. Por eso el export sale de `quotes`, `leads`,
`ai_calls`, `impact_events` y `products`, que son las cinco tablas reales del esquema.

Cada elemento de `items_json` tiene esta forma (precios congelados al momento de cotizar):

```json
{
  "descripcion_raw": "cemento",
  "descripcion": "Cemento Loma Negra 50 kg",
  "cantidad": 10,
  "unidad": "bolsa",
  "sku": "CEM-50",
  "precio_unitario_ars": 9800,
  "subtotal_ars": 98000,
  "confianza": 0.83,
  "requiere_revision": false
}
```

`sku` puede ser `null` si no hubo match en el catálogo, y `descripcion` cae al texto crudo
del cliente. Para analizar ítems se usa `json_each`, como en el ejemplo de `quotes`.

---

## `products` — catálogo de la ferretería

Una fila por producto vendible. Es la fuente de precios que usa el cotizador; si cambia
el precio acá, los presupuestos viejos **no** se recalculan (guardan su propio precio).

| Columna | Tipo | NULL | Default | Qué significa |
|---|---|---|---|---|
| `sku` | TEXT | no | — | Clave primaria. Código corto del producto (`CEM-50`, `HIE-8`). |
| `nombre` | TEXT | no | — | Nombre que ve el cliente en el presupuesto. |
| `unidad` | TEXT | no | — | Unidad de venta: `bolsa`, `barra`, `unidad`, `balde`, `lata`, `metro`, `kg`. |
| `precio_ars` | INTEGER | no | — | Precio unitario en pesos, `CHECK (precio_ars >= 0)`. |
| `aliases` | TEXT | no | `''` | Sinónimos separados por coma que usa el matcher (`"cemento,loma negra,cal"`). Vacío si no hay. |

Índices: solo la PK. El catálogo se carga entero en memoria (`loadProducts`), son decenas
de filas.

```sql
-- Los cinco productos más caros del catálogo
SELECT sku, nombre, unidad, precio_ars
FROM products
WHERE precio_ars > 5000
ORDER BY precio_ars DESC
LIMIT 5;
```

---

## `quotes` — presupuestos emitidos

El corazón del negocio: un mensaje de WhatsApp entró, la IA (o el modo degradado) lo
interpretó y salió un presupuesto con token público. Una fila por presupuesto.

| Columna | Tipo | NULL | Default | Qué significa |
|---|---|---|---|---|
| `id` | INTEGER | no | autoincrement | PK interna. Es la que referencian las tablas hijas. |
| `token` | TEXT | no | — | Código público de 8 caracteres (`/q/<token>`), `UNIQUE`. Es lo que se comparte, no el `id`. |
| `created_at` | TEXT | no | `datetime('now')` | Cuándo se generó, UTC. |
| `raw_text` | TEXT | no | — | Mensaje original del cliente, recortado a 4000 caracteres. |
| `customer_name` | TEXT | sí | `NULL` | Nombre detectado en el mensaje. `NULL` si no se pudo. |
| `customer_phone` | TEXT | sí | `NULL` | Teléfono detectado. `NULL` si no vino. |
| `customer_email` | TEXT | sí | `NULL` | Email detectado. `NULL` si no vino. |
| `items_json` | TEXT | no | — | Array JSON con los ítems cotizados (ver arriba). Puede ser `[]`. |
| `total_ars` | INTEGER | no | `0` | Suma de `subtotal_ars` de los ítems, en pesos. |
| `ai_mode` | TEXT | no | — | `live` (respondió el modelo) o `degraded` (fallback sin IA). |
| `ai_latency_ms` | INTEGER | no | `0` | Latencia de la extracción en milisegundos; `0` en degradado. |
| `status` | TEXT | no | `'draft'` | `draft` (generado, sin enviar) o `sent` (email enviado al cliente). |
| `sent_at` | TEXT | sí | `NULL` | Cuándo se envió por email. `NULL` mientras está en `draft`. |

Índices: `idx_quotes_token` sobre `token`. Ojo: borrar un quote borra en cascada sus
`ai_calls` e `impact_events`, y deja los `leads` con `quote_id = NULL`. No hay borrado
lógico ni historial de cambios.

```sql
-- Presupuestos sin enviar, del más nuevo al más viejo
SELECT id, token, created_at, customer_name, total_ars, status
FROM quotes
WHERE status = 'draft'
ORDER BY created_at DESC
LIMIT 10;
```

```sql
-- Los ítems de un presupuesto, desarmando el JSON
SELECT q.id,
       json_extract(i.value, '$.sku')          AS sku,
       json_extract(i.value, '$.cantidad')     AS cantidad,
       json_extract(i.value, '$.subtotal_ars') AS subtotal_ars
FROM quotes q, json_each(q.items_json) i
WHERE q.id = 1;
```

---

## `ai_calls` — traza de cada llamada al modelo

Una fila por intento de extracción, atada al presupuesto que generó. Sirve para medir
calidad y costo de la IA: cuántos tokens, cuánta latencia, si hubo que reparar el JSON.
En modo degradado igual se inserta una fila, con `mode = 'degraded'` y el error.

| Columna | Tipo | NULL | Default | Qué significa |
|---|---|---|---|---|
| `id` | INTEGER | no | autoincrement | PK. |
| `quote_id` | INTEGER | sí | `NULL` | FK a `quotes(id)`, `ON DELETE CASCADE`. |
| `model` | TEXT | sí | `NULL` | Modelo usado (`gpt-4o-mini`). `NULL` en degradado. |
| `mode` | TEXT | no | — | `live` o `degraded`. |
| `prompt_tokens` | INTEGER | no | `0` | Tokens de entrada. |
| `completion_tokens` | INTEGER | no | `0` | Tokens de salida. |
| `latency_ms` | INTEGER | no | `0` | Latencia total de la llamada. |
| `schema_ok` | INTEGER | no | `0` | Booleano 0/1: la respuesta pasó el schema Zod sin reparar. |
| `repair_attempts` | INTEGER | no | `0` | Cuántas veces se reintentó reparar el JSON. |
| `error` | TEXT | sí | `NULL` | Mensaje de error si falló (por ejemplo `OPENAI_API_KEY ausente`). |
| `created_at` | TEXT | no | `datetime('now')` | Cuándo se registró, UTC. |

Índices: solo la PK. La FK no tiene índice propio: si algún día se borran quotes en
masa, conviene agregarlo.

```sql
-- Salud de la IA por modo: volumen, latencia promedio y respuestas válidas
SELECT mode,
       COUNT(*)                AS llamadas,
       ROUND(AVG(latency_ms))  AS latencia_prom_ms,
       SUM(schema_ok)          AS respuestas_validas,
       SUM(repair_attempts)    AS reparaciones
FROM ai_calls
GROUP BY mode;
```

---

## `impact_events` — eventos de impacto del negocio

Cada evento es una cosa que pasó y que se puede contar para el pitch: un presupuesto
emitido o un email enviado. Los minutos ahorrados son una constante del código
(18 minutos por presupuesto contra 20 a mano), no una medición por caso.

| Columna | Tipo | NULL | Default | Qué significa |
|---|---|---|---|---|
| `id` | INTEGER | no | autoincrement | PK. |
| `quote_id` | INTEGER | sí | `NULL` | FK a `quotes(id)`, `ON DELETE CASCADE`. |
| `tipo` | TEXT | no | — | `presupuesto_emitido` o `email_enviado`. |
| `minutos_ahorrados` | INTEGER | no | `0` | Minutos que se habrían tardado a mano. `0` en `email_enviado`. |
| `monto_ars` | INTEGER | no | `0` | Monto del presupuesto asociado, en pesos. |
| `created_at` | TEXT | no | `datetime('now')` | Cuándo ocurrió, UTC. |

Índices: `idx_impact_created` sobre `created_at` (para series por día).

```sql
-- Impacto acumulado por tipo de evento
SELECT tipo,
       COUNT(*)                  AS eventos,
       SUM(minutos_ahorrados)    AS minutos,
       SUM(monto_ars)            AS monto_ars
FROM impact_events
GROUP BY tipo
ORDER BY eventos DESC;
```

---

## `leads` — contactos captados

Personas que dejaron el email para recibir el presupuesto. Un mismo email puede repetirse
(es intención de compra, no un usuario único). Es la tabla que se usa para el seguimiento
comercial.

| Columna | Tipo | NULL | Default | Qué significa |
|---|---|---|---|---|
| `id` | INTEGER | no | autoincrement | PK. |
| `quote_id` | INTEGER | sí | `NULL` | FK a `quotes(id)`, `ON DELETE SET NULL`: si se borra el presupuesto, el lead queda huérfano pero no se pierde. |
| `email` | TEXT | no | — | Email declarado por el cliente. Tal cual lo escribió, sin normalizar. |
| `nombre` | TEXT | sí | `NULL` | Nombre si lo dio. `NULL` si solo dejó el email. |
| `origen` | TEXT | no | `'demo'` | De dónde vino: hoy siempre `demo` (la demo del hackatón). |
| `created_at` | TEXT | no | `datetime('now')` | Cuándo se captó, UTC. |

Índices: solo la PK.

```sql
-- Leads con el token del presupuesto que los originó
SELECT l.id, l.email, l.nombre, l.origen, l.created_at, q.token
FROM leads l
LEFT JOIN quotes q ON q.id = l.quote_id
ORDER BY l.created_at DESC
LIMIT 20;
```

---

## Relaciones

```
quotes 1 ──── n ai_calls        (quote_id, ON DELETE CASCADE)
quotes 1 ──── n impact_events   (quote_id, ON DELETE CASCADE)
quotes 1 ──── n leads           (quote_id, ON DELETE SET NULL)
quotes.items_json  --  array JSON, no es tabla
```

## Trampas conocidas (leelas antes de escribir una consulta)

- **Montos enteros**: no hay centavos. Si dividís, hacelo al final y redondeá.
- **Fechas UTC**: `created_at` está en UTC, no en hora de Rosario (UTC-3). Para reportes
  por día, restá 3 horas: `date(created_at, '-3 hours')`.
- **`status` no es un historial**: solo dice el estado actual (`draft`/`sent`). El cuándo
  está en `sent_at`.
- **`items_json` es texto**: si lo necesitás tabulado, `json_each`; si el JSON estuviera
  roto, `json_each` tira error y hay que filtrar con `json_valid(items_json)`.
- **Precios históricos**: `items_json` y `quotes.total_ars` guardan el precio del momento.
  No los recalcules contra `products`, porque el catálogo cambia.
- **Borrar un quote es destructivo**: se lleva `ai_calls` e `impact_events`. Para auditar,
  exportá antes.
- **La base de producción está viva**: los conteos cambian entre una consulta y otra. El
  export los toma de una sola transacción justamente para que el CSV y el resumen cierren.
