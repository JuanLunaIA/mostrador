# Guion 3 minutos — Mostrador

> Regla: nunca prometer, siempre mostrar. La URL pública se abre en el segundo 20 y no se vuelve a una slide hasta el 1:40.

## Estado real de la demo (leer antes de subir al escenario)

| Qué | Estado hoy | Qué decir si preguntan |
|---|---|---|
| URL pública | **En vivo**: https://vps-6576881-x.dattaweb.com/ | Nada, se muestra |
| IA | **gpt-4o-mini en vivo**, 1,2–4,6 s por presupuesto | "El modelo extrae; el catálogo pone el precio" |
| Email | **Mock**, declarado en la UI | "El cliente HTTP está escrito contra el contrato de EnvíaloSimple. Corre en mock porque la API transaccional es un add-on pago que esta cuenta no tiene contratado, y además hay que verificar el dominio remitente. Pasar a live es una variable de entorno, y la UI nunca dice 'enviado' cuando fue mock" |
| Email visible | **Sí**, renderizado en `/outbox/<token>` | Se puede mostrar: es el HTML real que sale |
| Datos de impacto | En vivo desde `impact_events` | — |

**No decir nunca:** "y acá llega el email al cliente". No llega: se genera y se renderiza.

---

| Bloque | Qué se dice | Qué se muestra |
|---|---|---|
| **0:00–0:20** Problema | "Existe pérdida de ventas por atender pedidos a mano por WhatsApp en las ferreterías de barrio del Gran Rosario: cada presupuesto se arma releyendo el chat, buscando el precio en una planilla y reescribiéndolo a mano. Son veinte minutos por presupuesto. Y el Gran Rosario tiene 11,5% de desocupación, la tasa más alta del país — INDEC, segundo trimestre 2026." | Slide 1: la frase del problema + el 11,5% citado con fuente |
| **0:20–0:50** Demo en frío | "Esto no es un mockup: está corriendo ahora mismo en un Cloud Server de DonWeb, con HTTPS y certificado propio." | **URL pública en pantalla.** Pantalla de inicio de Mostrador |
| **0:50–1:40** Core flow | "Este es el mensaje que le llegó a la ferretería por WhatsApp. Lo pego." → "La IA lee el pedido, el catálogo real pone los precios y el presupuesto sale en uno a cuatro segundos." → "Ahora lo mando por email." | Pegar el ejemplo → tabla con SKU y precios → total → "Enviar por email" → **el email renderizado** (se abre el HTML del correo) → `/impacto` sumando |
| **1:40–2:20** Arquitectura | "El modelo de lenguaje **nunca** devuelve un precio: sólo extrae qué pidió el cliente. El precio lo pone el catálogo de la ferretería. Por eso no puede inventar un número: si un ítem no matchea con confianza suficiente, se muestra en amarillo como 'revisar' en vez de cotizarse. Cada llamada queda auditada con modelo, latencia y tokens — está en el panel de abajo del presupuesto." | Slide con el C4: navegador → nginx → Node → SQLite, con OpenAI y EnvíaloSimple como cajas externas. Todas las cajas son productos de DonWeb salvo OpenAI |
| **2:20–2:50** Evidencia e impacto | "Corre sobre infraestructura DonWeb y está integrado con EnvíaloSimple. El impacto lo medimos en el producto: cada presupuesto registra 18 minutos ahorrados, y el contador sale de la base, no de una slide. Cadena de cambio y ODS 8.3 y 9.3 en el README." | Slide con la cadena de cambio y los 3 indicadores IRIS+ |
| **2:50–3:00** Ask y cierre | "Buscamos un piloto con 5 ferreterías del Gran Rosario sobre infraestructura DonWeb. Porque esto es exactamente lo que dice su lema: Internet para todos." | Slide final: URL + repo + QR |

## Qué NO decir

- No decir "usamos inteligencia artificial de última generación". Decir qué hace el modelo y qué no hace.
- No mostrar el código en pantalla. Mostrar el panel de auditoría si preguntan.
- No decir que el email "llega": se genera y se renderiza, el envío real está en mock declarado.
- No pedir disculpas por lo que falta. Encuadrar como roadmap ("próximo paso: cuentas de usuario y multi-sucursal").

## Preguntas probables del jurado

| Pregunta | Respuesta (2 líneas) |
|---|---|
| "¿Qué pasa si la IA se equivoca con un precio?" | No puede: el modelo no devuelve precios, sólo descripciones y cantidades. El precio sale del catálogo, y un ítem que no matchea con confianza suficiente queda marcado "revisar" en amarillo en vez de cotizarse. |
| "¿Y si el cliente escribe algo que no está en el catálogo?" | El ítem aparece con la descripción literal del cliente y la marca "revisar". El mostradorista lo resuelve en un segundo y el resto del presupuesto no se frena. |
| "¿Por qué no usaron un chatbot de WhatsApp directo?" | Porque el cuello de botella no es responder, es **cotizar**. Un bot que responde sin precios reales no cierra ventas. Mostrador resuelve la parte que hace perder la venta. |
| "¿Cómo se integra con DonWeb más allá de hospedarse?" | Cloud Server hoy, con nginx y HTTPS propio; el cliente de EnvíaloSimple Transaccional ya está escrito contra el contrato publicado y corre en mock declarado; a escala, Dominios para el white-label de cada ferretería y SitioSimple para su landing generada desde el catálogo. |
| "¿Cuánto cuesta operarlo?" | El Cloud Server más chico de DonWeb alcanza de sobra (esto corre en 2 vCPU / 4 GB con SQLite) más tokens: del orden de un centavo de dólar por presupuesto. |
| "¿Esto ya existe?" | Para e-commerce sí; para el mostrador de una ferretería de barrio que atiende por WhatsApp, no. La diferencia es que acá el catálogo y los precios son los reales de esa PyME, no los de un marketplace. |
| "¿Cómo sabés que tardan 20 minutos?" | Ese es el supuesto más débil y lo declaramos como supuesto en el README. El primer paso del piloto es cronometrar 5 presupuestos reales; si son 5 minutos, el producto cambia de argumento pero no de utilidad. |
| "¿Quién paga?" | La ferretería. El beneficiario es distinto: el empleado que no pierde la tarde reescribiendo pedidos y el cliente que recibe el presupuesto en el momento. |
| "¿Qué te faltó por el tiempo?" | Autenticación y multi-usuario. Hoy cualquiera con la URL genera presupuestos; para un piloto real hace falta login por comercio. Está declarado como deuda en el README, no escondido. |

## Antes de subir al escenario

1. Abrir la URL pública en una pestaña y dejarla cargada.
2. Tener el ejemplo de WhatsApp copiado en el portapapeles.
3. Batería y notificaciones del celular apagadas.
4. Tener `/impacto` ya con datos de la demo (no arrancar en cero).
5. Tener una pestaña con `/outbox/<token>` de una corrida previa, por si el envío en vivo tarda.
6. Video de respaldo de 60 s grabado antes de las 18:30, por si falla el wifi.
7. **Probar la URL desde el celular con datos móviles**, no desde el wifi del lugar.
