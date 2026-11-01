# Deploy de Mostrador en el Cloud Server de DonWeb

Proceso oficial DonWeb de 3 pasos. **Leer las 4 advertencias antes de tocar nada.**

## Advertencias críticas

1. **El puerto SSH NO es 22.** Está en el panel: *Mi Cuenta → Cloud Server → servidor → "Puerto"*. Usar siempre `ssh -p <PUERTO>` y `scp -P <PUERTO>`.
2. **NO instalar ufw ni iptables.** El firewall es virtual y se administra desde el panel de DonWeb, con 80/443 y el puerto SSH ya abiertos.
3. **La base y los servicios internos escuchan sólo en `127.0.0.1`.** A internet sólo se expone nginx.
4. **El `.env` va con permisos 600** y nunca se imprime en pantalla.

## Paso 1 — Crear el Cloud Server

Panel DonWeb → Cloud Server → configuración recomendada (1 vCPU / 1 GB). En minutos el panel muestra: **IP**, **Hostname** (ej. `vps-XXXXX-x.dattaweb.com`), **Puerto SSH**, usuario `root`, y el SO (Ubuntu 24.04 mínimo).

## Paso 2 — Instalar la clave SSH (una sola vez)

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519      # si no existe
ssh-copy-id -p <PUERTO_SSH> root@<IP>                  # acá se escribe la contraseña UNA vez
ssh -o StrictHostKeyChecking=accept-new -p <PUERTO_SSH> root@<IP> "echo key ok"
```

## Paso 3 — Deploy automatizado

```bash
cd /home/luna/proyectohackhaton
./deploy/deploy.sh <IP> <PUERTO_SSH>
```

El script: empaqueta el repo (sin `node_modules`, sin `data`, sin `.env`), lo sube a `/opt/mostrador`, instala Node desde NodeSource (el de Ubuntu es viejo), `npm ci --omit=dev`, crea el `.env` con permisos 600 si no existe, instala el servicio systemd, configura nginx como proxy inverso, y verifica con `curl` local y externo.

## Paso 4 — Verificar

```bash
# desde el servidor
curl -sS http://127.0.0.1:3000/api/healthz

# desde afuera (la prueba que importa)
curl -sS http://<IP>/api/healthz
```

**Y desde un celular en 4G, no desde el wifi del lugar** (§3.7: sin URL pública, descalificado).

## Rollback

```bash
systemctl stop mostrador
# DonWeb: panel → Cloud Server → Snapshots → restaurar el snapshot previo al deploy
```

## Notas

- Si el servidor tiene 1-2 GB de RAM: `fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`.
- Para pasar a HTTPS hace falta un dominio apuntado por DNS a la IP (DonWeb Dominios o Cloudflare) y después `certbot --nginx`.
