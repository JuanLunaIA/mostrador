# ADR-002 — Sin streaming SSE en el MVP

**Estado:** aceptado · 2026-11-01

## Contexto

El blueprint original pedía Server-Sent Events para mostrar la respuesta del modelo token por token. Pero la respuesta del modelo es un **objeto JSON estructurado** (`response_format: json_schema`, `strict: true`): el usuario no puede consumir tokens sueltos de un JSON, y el render final depende de tener el objeto completo. Además SSE obliga a desactivar el buffering de nginx (`proxy_buffering off`) y a manejar reconexión en el cliente — superficie de fallo en la parte más visible del demo.

## Decisión

`POST /api/quotes` responde 201 con el presupuesto terminado. La UI muestra un indicador de progreso por etapas ("Leyendo el mensaje… / Extrayendo ítems con IA… / Cotizando contra el catálogo…"), que comunica el mismo trabajo sin streaming real.

## Consecuencias

- (+) Una sola ruta, un solo punto de fallo, nada que reconciliar.
- (+) El objeto llega validado por zod; no hay estado parcial que la UI tenga que tolerar.
- (−) Sin sensación de "la IA está escribiendo". Mitigado con las etapas.
- **Disparador de revisión:** si la latencia p95 con la IA en vivo supera los 6 segundos, evaluar SSE o un paso asíncrono con polling.

## Nota de despliegue

`deploy/nginx.conf` deja `proxy_buffering off` igual, para que activar SSE más adelante no requiera tocar el servidor.
