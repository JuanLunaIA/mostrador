# Guion de video — Mostrador

**3:00 exactos · 6 bloques · 420 palabras de narración**

Se lee tal cual está escrito. Cada punto y aparte es un respiro de medio segundo, ya contado dentro del tiempo del bloque. No se leen los títulos ni las notas: solo la narración.

- **Ritmo:** 140 palabras por minuto. Ni más rápido ni más lento.
- **Tono:** ferretero explicándole algo a un colega. Voz de mostrador, no de locutor. Sin subir el tono al final de la frase.
- **Cifras:** se leen enteras. `11,5%` es "once coma cinco por ciento". `1,13 segundos` es "uno con trece". `8.3` es "ocho punto tres".
- **Regla:** lo que no está en este guion, no se dice. Las tres frases que sostienen todo: el precio lo pone el catálogo, el email está en mock declarado, los veinte minutos son un supuesto.

---

## Bloque 1 · El problema

**0:00–0:27 · 27 s · 63 palabras**

### Narración

Una ferretería de barrio de Rosario vende por WhatsApp. El pedido llega así, desordenado: veinte tarugos del ocho, una lata de thinner. El que atiende relee el chat, busca el precio en la planilla y lo pasa a mano. Veinte minutos por presupuesto, un supuesto declarado.

Y Gran Rosario tiene 11,5% de desocupación, la tasa más alta del país: INDEC, segundo trimestre 2026.

### Producción

- **En pantalla:** slide 1 del deck. El 11,5% grande, con el pie "INDEC, EPH 2° trimestre 2026, Cuadro 3.2, 31 aglomerados".
- **Apoyo:** a los 0:04 entra por la derecha una captura del chat de WhatsApp con el pedido, con el nombre y el número tapados. Se queda hasta el final del bloque.
- **Respiro:** uno después de "a mano" (0:19). El segundo, antes de "Y Gran Rosario".
- **No:** no leer la fuente completa en voz alta, va en pantalla. No decir cuánta plata se pierde: no hay dato.

---

## Bloque 2 · La demo está en vivo

**0:27–0:48 · 21 s · 49 palabras**

### Narración

Esto no es un mockup. Está corriendo ahora, en un Cloud Server de DonWeb, con nginx, HTTPS y certificado propio. La URL está en pantalla y la abro.

Este es Mostrador: una ferretería de barrio con su catálogo real, quince productos, cada uno con SKU y precio de lista.

### Producción

- **En pantalla:** pantalla completa del navegador, con la barra de direcciones visible: candado, HTTPS y `vps-6576881-x.dattaweb.com`. A los 0:36 se ve el refresco real de la página, sin corte ni transición.
- **Cámara:** nada de zoom ni de paneo. La página se mueve sola cuando scrollea.
- **Respiro:** 2 s de silencio después de "la abro", mientras carga. No tapar con música.
- **No:** no leer la URL en voz alta, se lee mal y suena a dictado. No mostrar otras pestañas ni la consola.

---

## Bloque 3 · El flujo: WhatsApp, IA, catálogo, presupuesto

**0:48–1:40 · 52 s · 121 palabras**

### Narración

Este es el mensaje que le llegó a la ferretería. Lo copio tal cual, sin corregir nada, y lo pego. Le doy generar.

La IA lee el pedido: saca ítems, cantidades y contacto. Los precios no los toca.

El catálogo matchea cada ítem, le asigna su SKU y le pone el precio de lista.

El presupuesto sale en un segundo. Diez corridas medidas: mediana de 1,13 segundos, percentil 95 de 1,19.

Ahora lo mando por email. El envío corre en modo mock declarado: la API de EnvíaloSimple es un add-on pago que esta cuenta no tiene, y el dominio remitente no está verificado. Pero el HTML del correo es real: se genera y se ve acá, en la bandeja de salida.

### Producción

- **0:48:** pegar el mensaje real, el mismo de la demo, con el cursor visible en el botón.
- **0:56:** click en generar. Se ve el estado de carga.
- **0:58:** la tabla: SKU, descripción, cantidad, precio unitario, subtotal.
- **1:02:** el total. Freno de un segundo acá, sin hablar.
- **1:22:** click en "Enviar por email". Se ve el badge de mock en la pantalla de confirmación.
- **1:26:** abrir `/outbox/<token>` en la pestaña ya cargada y scrollear el HTML del correo, lento, hasta el pie con el total.
- **Respiro:** uno en cada punto y aparte. El más largo, de 1 s, antes de "Ahora lo mando por email".
- **No:** no decir "y acá le llega el mail al cliente". No llega: se genera y se renderiza. No mostrar el token ni ninguna clave.

---

## Bloque 4 · Arquitectura: el modelo extrae, el catálogo cotiza

**1:40–2:19 · 39 s · 92 palabras**

### Narración

Acá está la arquitectura. Navegador, nginx, Node, SQLite: todo en el mismo servidor de DonWeb. Dos cajas externas: OpenAI y EnvíaloSimple.

El modelo nunca devuelve un precio. Solo extrae qué pidió el cliente. El precio lo pone el catálogo. Por eso no puede inventar un número.

Si un ítem no matchea, no se cotiza: queda en amarillo, marcado revisar. Miralo: pido precio de un taladro, que no está en el catálogo, y el total da cero.

Cada llamada queda auditada: modelo, latencia, tokens, reparaciones. Está en el panel de abajo del presupuesto.

### Producción

- **En pantalla:** diagrama simple, cuatro cajas adentro de un recuadro que dice DonWeb, y OpenAI y EnvíaloSimple afuera con flechas. Sin iconos, sin sombras.
- **1:58:** volver a la app y pegar "me pasas precio de un taladro?". Se ve el ítem en amarillo, la etiqueta "revisar", confianza 0 y total en cero.
- **2:09:** abrir el panel "¿Cómo se generó?" y dejar a la vista modelo, latencia y tokens.
- **Respiro:** 1 s después de "y el total da cero", para que se lea la pantalla.
- **No:** no mostrar código ni terminal. No decir "la IA aprende" ni "se entrena sola".

---

## Bloque 5 · Evidencia e impacto

**2:19–2:49 · 30 s · 69 palabras**

### Narración

Todavía no tenemos clientes: esto es un prototipo con datos de demo.

El impacto lo mide el producto. Cada presupuesto registra dieciocho minutos ahorrados sobre el supuesto de veinte, y el contador sale de la base, no de una slide. En el piloto lo cronometramos con presupuestos reales.

Los indicadores son IRIS+: horas ahorradas y PyMEs alcanzadas. Los ODS, 8.3 y 9.3, formalización y acceso a cadenas de valor.

### Producción

- **En pantalla:** slide 5 con los indicadores IRIS+ y los ODS.
- **2:24:** cortar a `/impacto` en la app, con el contador ya cargado: presupuestos, minutos ahorrados. Que se vea la tabla de abajo, no solo el número grande.
- **2:40:** volver a la slide, con el pie "18 min = baseline supuesto de 20 min. Se cronometra en el piloto".
- **Respiro:** 1 s después de "datos de demo". Es la frase que más va a mirar el jurado.
- **No:** no decir "nuestros clientes". No decir "empleos creados". No mostrar facturación ni proyecciones.

---

## Bloque 6 · El ask y el cierre

**2:49–3:00 · 11 s · 26 palabras**

### Narración

Buscamos un piloto con cinco ferreterías del Gran Rosario, sobre infraestructura DonWeb. El primer paso es cronometrar esos cinco presupuestos reales de mostrador.

Internet para todos.

### Producción

- **En pantalla:** slide final. URL, `github.com/JuanLunaIA/mostrador` y el lema. Último frame congelado medio segundo. El QR va solo en la versión impresa.
- **Respiro:** pausa corta antes de "Internet para todos". Después, silencio: no hay música que suba.
- **No:** no agregar "gracias". El cierre es el lema.

---

## Conteo de palabras

| Bloque | Slide | Entrada | Duración | Palabras | ppm |
|---|---|---|---|---|---|
| 1 · El problema | 1 | 0:00 | 27 s | 63 | 140 |
| 2 · Demo en vivo | 2 | 0:27 | 21 s | 49 | 140 |
| 3 · Flujo completo | 3 | 0:48 | 52 s | 121 | 140 |
| 4 · Arquitectura | 4 | 1:40 | 39 s | 92 | 142 |
| 5 · Evidencia e impacto | 5 | 2:19 | 30 s | 69 | 138 |
| 6 · Ask y cierre | 6 | 2:49 | 11 s | 26 | 142 |
| **Total** | | | **3:00** | **420** | **140** |

Conteo por espacios, solo narración: no incluye títulos, notas de producción ni esta tabla. 420 palabras a 140 ppm dan 180 segundos clavados.

---

## Antes de grabar

1. Grabar primero la pantalla sin voz, con el flujo del bloque 3 completo. Ese video manda los tiempos; la voz se graba después, mirándolo.
2. Dejar `/outbox/<token>` de una corrida anterior ya cargado en otra pestaña, por si el envío en vivo tarda.
3. Cargar `/impacto` con datos de demo: no puede arrancar en cero.
4. Zoom del navegador al 110%, notificaciones apagadas, barra de marcadores oculta, cero pestañas personales.
5. Grabar una toma por bloque con 3 s de cola y ajustar cada pista a la duración de la tabla (`apad`/`atrim` en ffmpeg). Si un bloque se pasa, regrabar más rápido: no agregar silencio, porque el total se va de 3:00.

Si se arma con `docs/pitch/video/armar-video.sh`, ojo: hoy suma 0,5 s de entrada y 0,8 s de salida por bloque, o sea 7,8 s de más. Con este guion hay que poner `LEAD=0` y `TAIL=0`, o recortar el aire en el montaje.

## Qué no se dice en ningún bloque

- Que el email llega al cliente. Se genera y se renderiza; el envío está en mock declarado.
- Que hay usuarios, clientes o tracción. Todavía no hay ninguno.
- "Inteligencia artificial de última generación", "revolucionario", "solución integral". No dicen nada.
- Que los veinte minutos están medidos. Son un supuesto, y se dice con esa palabra.
- Precios, facturación o cantidad de empleos que no salgan de la base.
