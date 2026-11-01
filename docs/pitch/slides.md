---
marp: true
paginate: true
theme: default
---

# El problema

- Pérdida de ventas por atender pedidos a mano por WhatsApp
- Ferreterías de barrio de 2 a 6 empleados del Gran Rosario
- Releer el chat, buscar el precio en la planilla, reescribirlo a mano
- ~20 min por presupuesto: supuesto declarado, todavía sin medir
- 11,5% de desocupación en Gran Rosario, la más alta del país

*Fuente: INDEC, EPH 2° trimestre 2026, Cuadro 3.2 — 31 aglomerados.*

<!-- 0:00–0:20 · "Existe pérdida de ventas por atender pedidos a mano por WhatsApp en las ferreterías de barrio del Gran Rosario: cada presupuesto se arma releyendo el chat, buscando el precio en una planilla y reescribiéndolo a mano. Son veinte minutos por presupuesto. Y el Gran Rosario tiene 11,5% de desocupación, la tasa más alta del país — INDEC, segundo trimestre 2026."
Cue: los 20 minutos son SUPUESTO declarado, no medición. Si preguntan, se dice así. -->

---

# La demo está en vivo

- https://vps-6576881-x.dattaweb.com/ — abierta ahora
- Cloud Server DonWeb #6576881 · nginx → Node → SQLite
- HTTPS propio con certificado Let's Encrypt
- IA gpt-4o-mini en vivo: p50 1,1 s, p95 1,2 s (10 corridas medidas)
- Ahora pego un chat de WhatsApp y sale el presupuesto

<!-- 0:20–0:50 · "Esto no es un mockup: está corriendo ahora mismo en un Cloud Server de DonWeb, con HTTPS y certificado propio."
Cue: abrir la URL en el segundo 20 y no volver a las slides hasta 1:40. -->

---

<style scoped>
h1 { font-size: 34px; }
</style>

# Core flow: WhatsApp → IA → catálogo → presupuesto

- El dueño pega el mensaje del cliente, tal como llega
- La IA extrae ítems, cantidades y contacto; nunca precios
- El catálogo real de la ferretería pone SKU y precio
- Presupuesto cotizado en 1–4 s, listo para enviar
- Email en mock declarado: se genera y se renderiza en /outbox

<!-- 0:50–1:40 · "Este es el mensaje que le llegó a la ferretería por WhatsApp. Lo pego." → "La IA lee el pedido, el catálogo real pone los precios y el presupuesto sale en cerca de un segundo." → "Ahora lo mando por email."
Cue: nunca decir "acá llega el email al cliente". Se genera y se muestra el HTML real en /outbox/<token>. -->

---

# Arquitectura: el modelo extrae, el catálogo cotiza

- Navegador → nginx → Node → SQLite: todo sobre DonWeb
- OpenAI y EnvíaloSimple: las dos cajas externas
- El modelo nunca devuelve precios; solo ítems y cantidades
- Sin match con confianza ≥ 0,55: “revisar” en amarillo
- Auditoría por llamada: modelo, latencia, tokens, reparaciones

<!-- 1:40–2:20 · "El modelo de lenguaje nunca devuelve un precio: sólo extrae qué pidió el cliente. El precio lo pone el catálogo de la ferretería. Por eso no puede inventar un número: si un ítem no matchea con confianza suficiente, se muestra en amarillo como 'revisar' en vez de cotizarse. Cada llamada queda auditada con modelo, latencia y tokens — está en el panel de abajo del presupuesto."
Cue: no mostrar código; si preguntan, abrir el panel "¿Cómo se generó?". -->

---

# Evidencia e impacto

- impact_events: 1 fila por presupuesto, 18 min ahorrados
- El contador de /impacto sale de la base, no de una slide
- IRIS+: horas ahorradas, empleo sostenido, PyMEs alcanzadas
- ODS 8.3 formalización de MiPyMEs · 9.3 acceso a cadenas de valor
- UNRaf 2022: PyMEs manufactureras de Santa Fe, primeras etapas

*Los 18 min salen del baseline supuesto de 20 min: se cronometra en el piloto.*

<!-- 2:20–2:50 · "Corre sobre infraestructura DonWeb y está integrado con EnvíaloSimple. El impacto lo medimos en el producto: cada presupuesto registra 18 minutos ahorrados, y el contador sale de la base, no de una slide. Y hay contexto provincial: la UNRaf relevó que las PyMEs de Santa Fe están en las primeras etapas de digitalización y que la IA todavía no es una práctica extendida. Cadena de cambio y ODS 8.3 y 9.3 en el README."
Cue: el envío de email está en mock declarado; la integración está escrita contra el contrato real. Jobs Created no se puede afirmar en el hackatón. -->

---

# El ask

- Piloto con 5 ferreterías del Gran Rosario sobre infraestructura DonWeb
- Primer paso: cronometrar 5 presupuestos reales de mostrador
- \$12.000 ARS/mes por ferretería · infraestructura ≈ u\$s 3/mes
- Próximo paso: login por comercio y multi-sucursal
- https://vps-6576881-x.dattaweb.com/ · github.com/JuanLunaIA/mostrador

**Internet para todos.**

<!-- 2:50–3:00 · "Buscamos un piloto con 5 ferreterías del Gran Rosario sobre infraestructura DonWeb. Porque esto es exactamente lo que dice su lema: Internet para todos."
Cue: cerrar con la URL en pantalla. El QR queda para la versión impresa. -->

<!--
Exportar a HTML:
npx @marp-team/marp-cli docs/pitch/slides.md -o docs/pitch/slides.html

Exportar a PDF:
npx @marp-team/marp-cli docs/pitch/slides.md -o docs/pitch/slides.pdf --allow-local-files
-->
