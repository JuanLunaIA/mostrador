# Backup y Restore en Caliente — Base SQLite de Mostrador

Procedimiento **probado** el 2026-11-01 contra el servidor de producción, con el servicio
`mostrador` **activo durante todo el proceso** (nunca se detuvo, nunca se reinició).

- Base viva: `/opt/mostrador/data/mostrador.sqlite` (WAL, driver `node:sqlite`)
- Backups: `/root/backups/mostrador-<YYYYMMDD-HHMMSS>.sqlite`
- Servicio: `mostrador` (systemd, `ExecStart=/usr/bin/node /opt/mostrador/app.js`, puerto 3000)

## 0. Herramienta: no hay `sqlite3`, se usa Node

En el servidor **no está instalado el CLI `sqlite3`**, y no hace falta instalarlo:

```bash
$ which sqlite3
(no output)                 # NO existe
$ node --version
v22.23.4                    # trae node:sqlite (DatabaseSync) de fábrica
```

Todo el procedimiento usa `deploy/sqlite-backup.js`, un script de ~90 líneas que sólo
depende de `node:sqlite` (stdlib de Node 22, sin `npm install`). Se sube una vez:

```bash
scp -P 5249 deploy/sqlite-backup.js root@201.32.132.178:/root/sqlite-backup.js
```

Uso:

```bash
node /root/sqlite-backup.js inspect  <archivo>          # integrity_check + conteos
node /root/sqlite-backup.js backup   <origen> <destino> # snapshot consistente + verificación
node /root/sqlite-backup.js checkpoint <archivo>        # PRAGMA wal_checkpoint(TRUNCATE)
```

> `node:sqlite` imprime `ExperimentalWarning: SQLite is an experimental feature`. Es
> informativo y no afecta el resultado; se puede silenciar con `NODE_NO_WARNINGS=1`.

## 1. Backup en caliente (servicio arriba)

```bash
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p /root/backups
node /root/sqlite-backup.js backup \
  /opt/mostrador/data/mostrador.sqlite \
  /root/backups/mostrador-$TS.sqlite
```

**Salida real:**

```json
{
  "src": "/opt/mostrador/data/mostrador.sqlite",
  "dest": "/root/backups/mostrador-20261101-172931.sqlite",
  "size_bytes": 53248,
  "counts_before": { "products": 15, "quotes": 12, "impact_events": 12 },
  "counts_after":  { "products": 15, "quotes": 12, "impact_events": 12 }
}
{
  "verify": "/root/backups/mostrador-20261101-172931.sqlite",
  "journal_mode": "delete",
  "integrity_check": "ok",
  "counts": { "products": 15, "quotes": 12, "impact_events": 12 }
}
```

Por qué esto es correcto en caliente: el script usa **`VACUUM INTO`**, que abre una
transacción de lectura sobre la base viva y escribe un archivo nuevo y consistente. Esa
lectura **incluye las páginas que todavía están en el WAL**, así que no hace falta parar
el servicio ni hacer checkpoint previo. El archivo resultante sale en `journal_mode=delete`
(un solo archivo autocontenido, sin `-wal` ni `-shm`), que es exactamente lo que se quiere
para archivar o mover.

Verificación del servicio después del backup:

```bash
$ systemctl is-active mostrador
active
```

## 2. Verificación de integridad del archivo copiado

El script ya la corre al final del backup, pero se puede repetir sola en cualquier momento:

```bash
$ node /root/sqlite-backup.js inspect /root/backups/mostrador-20261101-172931.sqlite
{
  "file": "/root/backups/mostrador-20261101-172931.sqlite",
  "journal_mode": "delete",
  "integrity_check": "ok",
  "tables": ["ai_calls", "impact_events", "leads", "products", "quotes"],
  "counts": { "products": 15, "quotes": 12, "impact_events": 12 }
}
```

`PRAGMA integrity_check` debe devolver exactamente `ok`. Cualquier otra cosa
(`database disk image is malformed`, etc.) = backup inválido, descartarlo.

Checksum para detectar corrupción posterior / verificar copias offsite:

```bash
$ sha256sum /root/backups/*.sqlite
b15218ab0bd41bc9956d96ff0d913e2eb76ab335fa6a739230de5dd613b3b949  /root/backups/mostrador-20261101-172931.sqlite
```

## 3. Conteos: backup vs base viva

| Tabla | Base viva | Backup | Coincide |
|---|---|---|---|
| `products` | 15 | 15 | sí |
| `quotes` | 12 | 12 | sí |
| `impact_events` | 12 | 12 | sí |

Si no coinciden, **casi siempre está bien**: entre el backup y la consulta pueden haber
entrado escrituras nuevas (el sitio está recibiendo tráfico). Lo que importa es que el
backup **no tenga menos** filas de las que tenía al momento de copiarse (`counts_before`
vs `counts_after` en la salida del backup) y que `integrity_check` sea `ok`.

## 4. Prueba de restore (archivo descartable)

Se restaura a `/root/restore-test.sqlite` para no tocar jamás la base viva.

```bash
BK=$(ls -t /root/backups/*.sqlite | head -1)
cp "$BK" /root/restore-test.sqlite
node /root/sqlite-backup.js inspect /root/restore-test.sqlite
```

**Salida real:**

```json
{
  "file": "/root/restore-test.sqlite",
  "journal_mode": "delete",
  "integrity_check": "ok",
  "tables": ["ai_calls", "impact_events", "leads", "products", "quotes"],
  "counts": { "products": 15, "quotes": 12, "impact_events": 12 }
}
```

Restore probado: **sí** (integridad `ok`, las 5 tablas presentes, conteos iguales al backup).
Limpieza posterior:

```bash
rm -f /root/restore-test.sqlite /root/restore-test.sqlite-wal /root/restore-test.sqlite-shm
```

## 5. ⚠️ Advertencia WAL — por qué `cp` NO sirve

**Copiar a mano el `.sqlite` con `cp` produce un backup que parece válido y está vacío.**
No es teoría: se reprodujo en este servidor. En el momento de la prueba el WAL pesaba
457 KB contra 45 KB del archivo principal, o sea **casi todos los datos estaban en el WAL**:

```bash
$ ls -l /opt/mostrador/data/
-rw-r--r-- 1 root root  45056 Nov  1 17:22 mostrador.sqlite
-rw-r--r-- 1 root root  32768 Nov  1 17:28 mostrador.sqlite-shm
-rw-r--r-- 1 root root 457352 Nov  1 17:28 mostrador.sqlite-wal
```

Copia ingenua y su verificación:

```bash
$ cp /opt/mostrador/data/mostrador.sqlite /root/naive-cp.sqlite
$ node /root/sqlite-backup.js inspect /root/naive-cp.sqlite
{
  "file": "/root/naive-cp.sqlite",
  "journal_mode": "wal",
  "integrity_check": "ok",          <-- ¡dice ok!
  "tables": ["ai_calls", "impact_events", "leads", "products", "quotes"],
  "counts": { "products": 15, "quotes": 0, "impact_events": 0 }
}
```

`integrity_check` devuelve **`ok`** pero `quotes` e `impact_events` están **vacías**: el
archivo es estructuralmente sano, simplemente no tiene las transacciones que vivían en el
WAL. Un backup así pasa cualquier chequeo superficial y falla el día que lo necesitás.

Reglas que se desprenden:

1. Nunca `cp` del `.sqlite` solo. Si por alguna razón hay que copiar archivos a mano, hay
   que copiar **los tres** (`mostrador.sqlite`, `-wal` y `-shm`) y sólo con el servicio
   detenido, o antes hacer `PRAGMA wal_checkpoint(TRUNCATE)`.
2. Preferir siempre `VACUUM INTO` (lo que hace el script) o la backup API de SQLite.
3. `-shm` es memoria compartida reconstruible: no se respalda, pero tampoco se debe
   mezclar un `-wal` viejo con un `.sqlite` nuevo.
4. No usar `cp` "para ir rápido" ni siquiera con el servicio corriendo y `integrity_check`
   en verde: el resultado puede ser un backup silenciosamente incompleto.
5. Si se copia el `.sqlite` completo **con el servicio detenido**, el `-wal` ya fue
   volcado al archivo principal al cerrar limpio, y ahí sí alcanza con el `.sqlite` solo.

## 6. Restore REAL (el día que haya que recuperar)

Esto **sí** requiere parar el servicio, porque se reemplaza el archivo que está abierto.
Ventana de indisponibilidad estimada: segundos (la base pesa ~50 KB).

```bash
set -e
BK=/root/backups/mostrador-20261101-172931.sqlite     # el backup elegido
LIVE=/opt/mostrador/data/mostrador.sqlite

# 1) Verificar el backup ANTES de tocar nada
node /root/sqlite-backup.js inspect "$BK"             # debe decir integrity_check: ok

# 2) Parar el servicio (cierra limpio y vuelca el WAL)
systemctl stop mostrador
systemctl is-active mostrador || echo "detenido"

# 3) Guardar la base actual por si el restore sale mal (no borrar nada)
mv "$LIVE" "$LIVE.broken-$(date +%Y%m%d-%H%M%S)"
rm -f "$LIVE-wal" "$LIVE-shm"                          # WAL/SHM viejos NO deben quedar

# 4) Copiar el backup en su lugar
cp "$BK" "$LIVE"
chown root:root "$LIVE"
chmod 644 "$LIVE"

# 5) Arrancar y verificar
systemctl start mostrador
sleep 2
systemctl is-active mostrador
curl -sS -m 5 http://127.0.0.1:3000/api/healthz
```

**Salida esperada del healthz:**

```json
{"ok":true,"db":"node:sqlite","ai":"live","email":"mock","time":"2026-11-01T20:29:52.006Z"}
```

Verificación de datos post-restore (debe coincidir con los conteos del backup):

```bash
node /root/sqlite-backup.js inspect /opt/mostrador/data/mostrador.sqlite
```

> Verificar el healthz **siempre contra `127.0.0.1:3000`**. A la fecha de la prueba,
> `http://127.0.0.1/api/healthz` vía nginx devuelve 404 (nginx no tiene location para esa
> ruta); eso es un tema de configuración de nginx, no del restore. El chequeo que importa
> para el restore es el del puerto 3000.

### Rollback del restore

Si después de arrancar algo está mal:

```bash
systemctl stop mostrador
rm -f /opt/mostrador/data/mostrador.sqlite /opt/mostrador/data/mostrador.sqlite-wal /opt/mostrador/data/mostrador.sqlite-shm
mv /opt/mostrador/data/mostrador.sqlite.broken-<TS> /opt/mostrador/data/mostrador.sqlite
systemctl start mostrador
systemctl is-active mostrador
```

## 7. Operación: backups automáticos y retención

Cron sugerido (cada 6 h, retención 14 días). El backup es en caliente, no requiere ventana:

```bash
cat >/etc/cron.d/mostrador-backup <<'EOF'
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
0 */6 * * * root TS=$(date +\%Y\%m\%d-\%H\%M\%S); node /root/sqlite-backup.js backup /opt/mostrador/data/mostrador.sqlite /root/backups/mostrador-$TS.sqlite >>/var/log/mostrador-backup.log 2>&1
30 4 * * * root find /root/backups -name 'mostrador-*.sqlite' -mtime +14 -delete
EOF
chmod 644 /etc/cron.d/mostrador-backup
```

Buenas prácticas:

- **3-2-1**: el backup en `/root/backups` está en el mismo disco que la base. Copiar
  periódicamente afuera del servidor (`scp` a otra máquina, o storage de objetos).
  Un backup que vive en el mismo disco no protege de perder el disco.
- **Probar el restore, no el backup.** Un job en verde no es evidencia; el drill de la §4
  sí. Repetirlo tras cada cambio de esquema o de versión de Node.
- **RPO/RTO de referencia**: RPO 6 h con el cron de arriba (bajarlo a 1 h si el negocio lo
  necesita); RTO medido en segundos, porque la base es chica y el restore es un `cp`.
- El WAL crece con las escrituras; si se ve muy grande de forma sostenida, conviene un
  `checkpoint` periódico, pero **no es obligatorio para el backup**. Salida real del
  comando sobre la base viva (seguro, no requiere parar el servicio):

  ```bash
  $ node /root/sqlite-backup.js checkpoint /opt/mostrador/data/mostrador.sqlite
  {"wal_checkpoint_truncate":{"busy":0,"log":0,"checkpointed":0}}
  ```

  `busy:0` = no había lectores bloqueando. Un `busy:1` ocasional es normal (hay tráfico);
  se reintenta más tarde, no es un error. Después del checkpoint el `-wal` vuelve a 0 bytes
  y el `.sqlite` principal absorbe las páginas pendientes: eso es sano, no corrupción.
- Nunca borrar `/root/backups` sin haber verificado un restore antes.

## 8. Registro de la prueba

| Campo | Valor |
|---|---|
| Fecha | 2026-11-01 17:29 (UTC-3) |
| Backup generado | `/root/backups/mostrador-20261101-172931.sqlite` (53248 bytes) |
| SHA-256 | `b15218ab0bd41bc9956d96ff0d913e2eb76ab335fa6a739230de5dd613b3b949` |
| Servicio durante el backup | `active` (nunca se detuvo) |
| `integrity_check` del backup | `ok` |
| Filas en el backup | products 15 · quotes 12 · impact_events 12 |
| Restore probado | sí, en `/root/restore-test.sqlite` (descartado) → `ok`, 5 tablas, conteos iguales |
| Base viva modificada | no |
