# Email para enviar

**Para:** galgodevv@gmail.com
**Asunto:** Mostrador — del WhatsApp de la ferretería al presupuesto en 1 segundo (demo en vivo + repo)

---

Hola,

Te paso Mostrador, terminado y corriendo en producción. Es un mostradorista de IA para
ferreterías de barrio: agarra el mensaje desordenado que llega por WhatsApp y devuelve un
presupuesto con precios reales del catálogo, listo para mandar.

**Demo (está viva ahora):** https://vps-6576881-x.dattaweb.com
**Repo:** https://github.com/JuanLunaIA/mostrador

## Qué se puede ver en 60 segundos

1. En la portada hay tres ejemplos de mensajes reales: click en "ejemplo 1".
2. En ~1,1 s sale la tabla con SKU, cantidad, precio unitario y total.
3. Botón "Enviar por email": se genera el HTML del email y se puede abrir el artefacto.
4. `/impacto` muestra los contadores en vivo, leídos de la base.

El caso que más me interesa mostrar: si le pedís algo que **no está en el catálogo**
("¿cuánto sale un taladro?"), no inventa un precio. Devuelve el ítem marcado *revisar*
con confianza 0 y total $0. La decisión de diseño es que el modelo de lenguaje **nunca
pone precios**: solo lee el mensaje y extrae descripciones, cantidades, medidas y
contacto. El precio lo pone siempre el catálogo, con un matcher determinístico. Si no
está seguro, lo dice.

## Qué hay construido y funcionando

| Componente | Estado |
|---|---|
| Sitio público | `/` (producto + demo), `/contratar` (tres planes), `/terminos`, `/privacidad` |
| Panel de usuario | `/config` — login, registro, edición de perfil, cambio de contraseña y "mis presupuestos" |
| Artefacto compartible | `/q/<token>`, con hoja de impresión A4 para guardar como PDF |
| Bandeja de salida | `/outbox/<token>` — el HTML real del email que se manda |
| Impacto | `/impacto` — presupuestos, monto cotizado, minutos ahorrados |
| API | `POST /api/quotes`, `POST /api/quotes/:token/send`, `/api/healthz`, `/api/impact` |
| Base de datos | SQLite (WAL): productos, presupuestos, ítems, leads, llamadas de IA, impacto, usuarios y sesiones |

**Sobre el "CRM":** te lo digo derecho, no hay CRM. Lo que hay es la capa de datos que
un CRM necesitaría: cada presupuesto guarda el contacto detectado, y `leads` registra
los envíos. Una vista de seguimiento de leads encima de eso es trabajo de una tarde, pero
hoy no está y no te la quiero vender.

## Cómo está hecho

- **Node 22 en el servidor** (26 en local), Express + EJS, sin framework de front.
- **SQLite nativo** (`node:sqlite`), cero compilación nativa, WAL y foreign keys.
- **Tailwind compilado y servido local**: la página no hace **ninguna** petición a un
  dominio externo, así que no depende del wifi del lugar.
- **Cuentas**: hash `scrypt` con salt por usuario, sesiones con token de 32 bytes
  guardado **hasheado** (un dump de la base no sirve como credencial), CSRF por
  double-submit, rate limit por IP.
- **Deploy**: DonWeb Cloud Server, systemd, nginx reverso, TLS Let's Encrypt (vence
  30/01/2027), el proceso escucha solo en 127.0.0.1.

## Evidencia, no adjetivos

- **69 tests** (`node --test`), incluidos los de seguridad: validación de token de
  outbox, URL pública sin confiar en el header `Host`, auth y CSRF.
- **5/5 casos dorados** corridos contra la URL pública.
- **Latencia medida en producción**, 10 corridas: p50 **1.135 ms**, p95 **1.185 ms**.
- **39 commits** con mensajes que explican el porqué de cada decisión.
- El repo se clona y corre **sin ninguna clave**: arranca en modo degradado, siembra el
  catálogo solo y cotiza igual.

## Lo que todavía no es

- **El email corre en modo mock declarado.** La API transaccional de EnvíaloSimple es un
  add-on pago que esta cuenta no tiene contratado, y el dominio remitente no está
  verificado. El cliente HTTP está escrito contra el contrato publicado; pasar a real es
  una variable de entorno. La interfaz nunca dice "enviado" cuando fue mock.
- **Los ~20 minutos ahorrados por presupuesto son un supuesto**, no una medición. El
  primer paso de un piloto sería cronometrar presupuestos reales.
- **No hay clientes todavía.** El contador de `/impacto` refleja pruebas, no tracción.
- Sin integración con la API de WhatsApp: el mensaje se pega a mano.

## Por qué creo que gana

Porque el artefacto que produce es el que ya existe en el negocio: un presupuesto con
precios del catálogo. No hay que cambiar el proceso de nadie, ni migrar datos, ni
capacitar. El ferretero sigue vendiendo igual; lo único que cambia es que el presupuesto
sale en un segundo en vez de a la noche. Y la parte riesgosa —inventar precios— está
resuelta por arquitectura, no por prompt.

También hay un video de 2:23 con la demo narrada, un deck de 6 slides y un guion de 3
minutos para presentarlo. Si te sirve, te los mando.

Quedo a disposición para una demo en vivo o para que me marques qué cambiarías.

Saludos,
Juan Luna
juan.c.luna04@gmail.com
