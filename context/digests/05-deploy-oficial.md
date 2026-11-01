# Digest 05 — Deploy oficial DonWeb (y las cuatro trampas)

**Fuente:** https://donweb.com/es-int/cloud-server-con-despliegue-ia

## Los 3 pasos oficiales

1. **Crear el Cloud Server.** El panel muestra: IP, Hostname (`vps-XXXXX-x.dattaweb.com`), **Puerto SSH**, usuario `root`, SO.
2. **Pedirle a la IA que lo publique.** Prompt oficial rellenado en `deploy/donweb-prompt.md`.
3. **La app queda online.**

## Las cuatro trampas

| # | Trampa | Consecuencia si la pisás |
|---|---|---|
| 1 | **El puerto SSH NO es 22** | `ssh` se cuelga y parece un servidor caído |
| 2 | **NO instalar ufw/iptables** | El firewall es virtual y se maneja desde el panel; instalar uno te deja afuera |
| 3 | **La DB y servicios internos sólo en `127.0.0.1`** | SQLite expuesta = cualquier cosa |
| 4 | **Node de los repos de Ubuntu es viejo** | Hay que instalarlo desde NodeSource |

## Reglas de seguridad del prompt oficial

1. Nunca escribir ni mostrar la contraseña. Se escribe **una sola vez**, al instalar la clave SSH.
2. Confirmar antes de cualquier acción destructiva.
3. No leer `/var/log/auth.log` ni `lastb` ni reportar intentos de login fallidos como hallazgo.
4. Nunca mostrar el contenido del `.env` ni valores de API keys.
5. Servicios internos sólo en localhost.
6. No tocar la configuración de SSH sin probar antes otra vía de acceso.
7. Instalar sólo lo que la app necesita.

## Reglas de ejecución

- Primera conexión: `ssh -o StrictHostKeyChecking=accept-new`.
- `apt` siempre con `DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a`.
- Sin upgrade completo del sistema en el primer deploy.
- 1–2 GB de RAM → crear swap de 1 GB.

## Alternativa más rápida

`./deploy/deploy.sh <IP> <PUERTO_SSH>` hace los mismos pasos sin intervención (asume que la clave SSH ya está instalada). Ver `deploy/DEPLOY.md`.

## Verificación real

```bash
curl -sS http://<IP>/api/healthz     # desde afuera
```

Y **desde un celular en 4G, no desde el wifi del lugar**. Si funciona en wifi y falla en 4G, es el firewall del panel, no la app.
