#!/usr/bin/env bash
# Deploy de Mostrador en un Cloud Server de DonWeb.
# Uso: ./deploy/deploy.sh <IP> <PUERTO_SSH> [USUARIO]
# Requisitos: clave SSH ya instalada (ver deploy/DEPLOY.md paso 2).
set -euo pipefail

IP="${1:?falta la IP del servidor}"
SSH_PORT="${2:?falta el puerto SSH (en DonWeb NO es 22)}"
USER_="${3:-root}"
APP_DIR="/opt/mostrador"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SSH=(ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -p "$SSH_PORT" "${USER_}@${IP}")
SCP=(scp -o StrictHostKeyChecking=accept-new -P "$SSH_PORT")

echo "==> 1/7 empaquetando $REPO_DIR"
TMP_TAR="$(mktemp -d)/mostrador.tar.gz"
tar -czf "$TMP_TAR" -C "$REPO_DIR" \
  --exclude=node_modules --exclude=.git --exclude=data --exclude=.env \
  --exclude='context/raw' --exclude='*.log' .
echo "    $(du -h "$TMP_TAR" | cut -f1)"

echo "==> 2/7 subiendo a $IP:$SSH_PORT"
"${SCP[@]}" "$TMP_TAR" "${USER_}@${IP}:/tmp/mostrador.tar.gz"

echo "==> 3/7 preparando el servidor"
"${SSH[@]}" 'bash -s' <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
mkdir -p /opt/mostrador
tar -xzf /tmp/mostrador.tar.gz -C /opt/mostrador
rm -f /tmp/mostrador.tar.gz

# swap si hay poca RAM
if [ ! -f /swapfile ] && [ "$(free -m | awk '/Mem:/{print $2}')" -lt 1800 ]; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap -q /swapfile >/dev/null && swapon /swapfile
fi

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 22 ]; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg nginx >/dev/null
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
else
  apt-get update -qq && apt-get install -y -qq nginx >/dev/null 2>&1 || true
fi
echo "    node $(node -v) · nginx $(nginx -v 2>&1 | sed 's#.*/##')"
REMOTE

echo "==> 4/7 dependencias"
"${SSH[@]}" "cd $APP_DIR && (npm ci --omit=dev --no-fund --no-audit || npm install --omit=dev --no-fund --no-audit) >/tmp/npm.log 2>&1 && echo '    deps ok' || { tail -20 /tmp/npm.log; exit 1; }"

echo "==> 5/7 .env (no se imprime nunca)"
"${SSH[@]}" "bash -s" <<'REMOTE'
set -euo pipefail
cd /opt/mostrador
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s/^NODE_ENV=.*/NODE_ENV=production/" .env
  echo "    .env creado desde .env.example"
else
  echo "    .env existente: se respeta"
fi
chmod 600 .env
node src/seed.js
REMOTE

echo "==> 6/7 systemd + nginx"
"${SCP[@]}" "$REPO_DIR/deploy/mostrador.service" "${USER_}@${IP}:/etc/systemd/system/mostrador.service"
"${SSH[@]}" "bash -s" <<'REMOTE'
set -euo pipefail
systemctl daemon-reload
systemctl enable mostrador >/dev/null 2>&1
systemctl restart mostrador
sleep 2
systemctl is-active mostrador

cat > /etc/nginx/sites-available/mostrador <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 2m;
    proxy_buffering off;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 5s;
    }
}
NGINX
ln -sf /etc/nginx/sites-available/mostrador /etc/nginx/sites-enabled/mostrador
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 && systemctl reload nginx
echo "    nginx recargado"
REMOTE

echo "==> 7/7 verificacion"
"${SSH[@]}" "curl -sS -m 5 http://127.0.0.1:3000/api/healthz || { journalctl -u mostrador -n 30 --no-pager; exit 1; }"
echo "    --- desde afuera ---"
curl -sS -m 8 "http://${IP}/api/healthz" || echo "    (todavia no responde desde afuera: revisar firewall del panel)"
echo
echo "LISTO -> http://${IP}/"
