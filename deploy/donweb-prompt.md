# Prompt oficial DonWeb — "Publica tu App con IA en tu Cloud Server"

Pegar este bloque completo en Claude Code / Codex **después de completar los 4 campos entre `<>`** que se leen del panel de DonWeb
(*Mi Cuenta → Cloud Server → servidor*): `IP`, `HOSTNAME`, `PUERTO_SSH`, `SISTEMA_OPERATIVO`.

> Alternativa más rápida y auditable: `./deploy/deploy.sh <IP> <PUERTO_SSH>` (hace exactamente los mismos pasos, sin intervención).

---

Actúa como mi ingeniero DevOps. Vas a publicar mi aplicación en mi Cloud Server de Donweb. Yo no sé de servidores, así que explícame cada paso importante en una frase simple antes de ejecutarlo.

**DATOS DEL SERVIDOR** (de mi panel de Donweb):
* IP: `<IP_DEL_SERVIDOR>`
* Hostname: `<HOSTNAME>` (ej: vps-XXXXX-x.dattaweb.com)
* Puerto SSH: `<PUERTO_SSH>` — atención: en Donweb no es el 22
* Usuario: root
* Sistema operativo del servidor: `<SISTEMA_OPERATIVO>` (ej: Ubuntu 24.04 instalación mínima, recién creado)

**MI APLICACIÓN**
* Ubicación: `https://github.com/JuanLunaIA/mostrador` — repositorio **público**
* Tipo: Node.js (Express 5). Puerto interno: **3000**
* Variables de entorno que necesita: ver `.env.example` del repo (`OPENAI_API_KEY`, `EMAIL_MODE`, `ENVIALOSIMPLE_API_KEY`, `ENVIALOSIMPLE_FROM`, `ENVIALOSIMPLE_BASE`, `PORT`, `DB_PATH`, `NODE_ENV`). **Si falta alguna, detente y pregúntame.**
* Mi dominio propio: por ahora no, usar la IP.

**CONTEXTO DEL SERVIDOR**
* Mi Cloud Server ya tiene un firewall virtual administrado desde el panel de Donweb, con los puertos 80, 443 y el puerto SSH indicado arriba abiertos. **NO instales ni actives otro firewall (ufw/iptables) dentro del servidor**: no hace falta y podría dejarme afuera.
* Si mi aplicación necesita recibir tráfico de internet en algún otro puerto, no intentes abrirlo desde el servidor: ese firewall se gestiona desde el panel y lo hago yo.

**REGLAS DE SEGURIDAD (obligatorias)**
1. Nunca escribas, muestres ni guardes mi contraseña en texto plano. La única vez que se necesita es al instalar la clave SSH (paso 1): ahí me detendré a escribirla yo. No uses `sshpass` ni ningún método que requiera ponerla en un comando o archivo.
2. Antes de cualquier acción destructiva (borrar archivos, formatear, reinstalar servicios existentes), avísame y espera mi confirmación.
3. No leas, resumas ni reportes `/var/log/auth.log`, la salida de `lastb`, el correo del sistema ni los intentos de login fallidos, salvo que yo te lo pida explícitamente.
4. Nunca muestres en pantalla el contenido de archivos `.env` ni valores de API keys, tokens o contraseñas.
5. La base de datos y cualquier servicio interno deben escuchar sólo en `localhost` (`127.0.0.1`), nunca en `0.0.0.0`. A internet sólo se expone lo que sirve nginx.
6. No modifiques la configuración de acceso SSH del servidor (puerto, `PasswordAuthentication`, `PermitRootLogin`) salvo que un paso de este prompt lo pida explícitamente — y nunca sin haber probado antes, en una sesión nueva, que existe otra vía de acceso funcionando.
7. Instala sólo lo que mi aplicación necesita: sin paneles, herramientas de monitoreo ni software extra que yo no haya pedido.

**REGLAS DE EJECUCIÓN**
* En la PRIMERA conexión SSH usa `-o StrictHostKeyChecking=accept-new`.
* En el servidor, ejecuta `apt` siempre con `DEBIAN_FRONTEND=noninteractive` y `NEEDRESTART_MODE=a`.
* No hagas un upgrade completo del sistema en este primer deploy: sólo `apt update` e instala lo que haga falta.
* Si el servidor tiene 1-2 GB de RAM, crea un archivo swap de 1 GB.

**PASOS**
0. Verifica que el repositorio existe y es accesible. Si no, detente y pregúntame antes de tocar el servidor.
1. Configura el acceso por clave SSH (genera la clave si no tengo una, instálala con `ssh-copy-id` usando la IP y el puerto indicados). Ahí el sistema me pedirá la contraseña y la escribo yo. Verifica después que puedes entrar sin contraseña.
2. Conéctate por SSH y muéstrame sistema, memoria y disco disponibles.
3. Prepara el servidor: `apt update` e instala `nginx` y Node.js **desde NodeSource** (la versión de los repos de Ubuntu es vieja). La app necesita Node ≥ 22.
4. Baja la aplicación a `/opt/mostrador` y ejecuta `npm ci --omit=dev`.
5. Si falta el `.env` o alguna variable de entorno, detente y pregúntame los valores. Guarda el `.env` con permisos `600`. Después corre `node src/seed.js` (carga el catálogo de 15 productos).
6. Configura la app como servicio **systemd** (`/etc/systemd/system/mostrador.service`, ver `deploy/mostrador.service` del repo) para que arranque sola, y verifica que quede corriendo.
7. Configura nginx como proxy inverso: el puerto 80 debe servir mi aplicación, respondiendo tanto por la IP como por el hostname. Verifica la configuración con `nginx -t` antes de recargar.
8. Verifica el resultado: `curl -sS http://127.0.0.1:3000/api/healthz` en el servidor, y después `curl -sS http://<IP>/api/healthz` desde afuera.
9. Dame la URL pública final.

**FASE OPCIONAL A — MI DOMINIO + HTTPS** (sólo si le doy un dominio; si no, preguntarme al terminar)
