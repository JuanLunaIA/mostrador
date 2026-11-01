# Cuatro audiencias, cuatro conversaciones

El mismo producto, contado distinto según quién escucha. La regla: no cambia el
producto ni los números, cambia el marco y el *ask*.

| Audiencia | Valor que recibe | Ask concreto |
|---|---|---|
| **Gobierno municipal / provincial** (Rosario, Santa Fe) | Trazabilidad de precios y pedidos en comercios de barrio sin obligarlos a comprar un ERP. Cada presupuesto emitido deja un registro digital ordenado: insumo directo para programas de formalización y para medir actividad comercial por zona. | Un piloto en **5 corralones o ferreterías** de un distrito productivo, con datos agregados y anonimizados hacia la Secretaría de Producción. 90 días. |
| **Banco** (BIND, Banco Municipal, bancos con línea PyME) | Reducción del costo de originación: un comercio que ya emite presupuestos digitales tiene historial de ventas verificable, que es justo lo que falta para precalificar una línea de capital de trabajo. | Acceso a la línea PyME para los comercios del piloto, usando el volumen de presupuestos emitidos como señal complementaria — no como sustituto del scoring. |
| **Multilateral** (BID, CAF) | Un caso de digitalización PyME replicable a escala regional con costo marginal casi nulo: 1 vCPU, 1 GB de RAM, software abierto, infraestructura local de DonWeb. Encaja en agendas de productividad de mipymes y de adopción digital. | Financiamiento de un **escalamiento a 500 comercios** en 12 meses, con evaluación de impacto precomprometida sobre los indicadores IRIS+ ya definidos en `docs/impact/cadena-de-cambio.md`. |
| **Inversor** | SaaS de ARS ~15.000/mes por comercio, costo de infraestructura despreciable, distribución apalancada en el canal DonWeb (≈400.000 servicios activos). Margen bruto alto y CAC bajo si el canal funciona. | **Pre-seed** para cubrir 12 meses de runway con foco en el canal DonWeb como motor de adquisición; el hito es 100 comercios pagando. |

## Por qué este orden y no otro

- **Gobierno primero**: es el único que puede abrir la puerta a un piloto real sin
  que el producto tenga que estar terminado, y su validación es un activo de
  credibilidad para las otras tres.
- **Banco segundo**: convierte el dato que el producto ya genera en una razón
  económica concreta para el comerciante (acceso a crédito), que es más fuerte que
  "ahorrás 18 minutos".
- **Multilateral tercero**: financia el escalamiento, no la construcción. Pedirle
  plata antes de tener el piloto del gobierno es prematuro.
- **Inversor último**: es el que menos necesita que le expliquen el problema y el
  que más rápido decide, pero también el que más castiga un producto sin tracción.
  Se le habla después de que las otras tres conversaciones existan.

## Lo que NO se promete a nadie

- No se promete integración con AFIP, bancos ni sistemas de gestión: el MVP emite
  presupuestos y los manda por email. Punto.
- No se promete precisión de precios mejor que el catálogo cargado: el LLM extrae,
  el catálogo pone el precio. Si el producto no está, se muestra "revisar".
- No se promete que el comercio deje de usar WhatsApp: la entrada del producto
  **es** WhatsApp, no su reemplazo.
