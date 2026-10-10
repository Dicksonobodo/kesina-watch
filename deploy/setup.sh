#!/usr/bin/env bash
# One-time setup of the Dixon Watch server on a fresh Ubuntu VM (Oracle Cloud Always Free).
#
#   cd ~/dixon/deploy
#   DOMAIN=dixonwatch.duckdns.org DUCKDNS_TOKEN=your-token bash setup.sh
#
# Safe to run again: it skips what's already done and rebuilds the server.
set -euo pipefail

: "${DOMAIN:?Set DOMAIN, e.g. DOMAIN=dixonwatch.duckdns.org}"
DUCKDNS_TOKEN="${DUCKDNS_TOKEN:-}"
cd "$(dirname "$0")"

step() { printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }

step "System updates"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo apt-get install -y curl ca-certificates netfilter-persistent iptables-persistent

# Small VMs (1 GB) need swap for Chromium; the 4-core / 24 GB Ampere one doesn't, but it doesn't hurt.
if ! swapon --show | grep -q swapfile; then
  step "Adding 2 GB swap"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if ! command -v docker >/dev/null; then
  step "Installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi

# Oracle's Ubuntu images block everything except SSH at the OS firewall, even after you open
# the ports in the Oracle console. Open 80 (certificate check) and 443 (HTTPS) here too.
step "Opening ports 80 and 443 in the OS firewall"
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null ||
    sudo iptables -I INPUT 6 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
done
sudo netfilter-persistent save

if [ -n "$DUCKDNS_TOKEN" ]; then
  step "Pointing $DOMAIN at this server (DuckDNS, refreshed every 5 minutes)"
  SUB="${DOMAIN%%.duckdns.org}"
  URL="https://www.duckdns.org/update?domains=${SUB}&token=${DUCKDNS_TOKEN}&ip="
  curl -fsS "$URL" && echo
  ( crontab -l 2>/dev/null | grep -v duckdns.org; echo "*/5 * * * * curl -fsS '$URL' >/dev/null 2>&1" ) | crontab -
fi

if [ ! -f server.env ]; then
  step "Creating server.env"
  cp server.env.example server.env
  SECRET="$(openssl rand -hex 32)"
  sed -i "s/^RELAY_SECRET=.*/RELAY_SECRET=${SECRET}/" server.env
  echo "Edit deploy/server.env if your Vercel address differs from kesina-watch.vercel.app."
fi

echo "DOMAIN=${DOMAIN}" > .env

step "Building and starting (first build takes a few minutes)"
sudo docker compose up -d --build

step "Waiting for HTTPS on https://${DOMAIN}"
for i in $(seq 1 40); do
  if curl -fsS "https://${DOMAIN}/health" >/dev/null 2>&1; then
    echo
    curl -fsS "https://${DOMAIN}/health"; echo
    printf '\n\033[1;32m✔ Dixon Watch server is live at https://%s\033[0m\n' "$DOMAIN"
    echo "Next: set VITE_API_URL=https://${DOMAIN} in Vercel → Settings → Environment Variables, then redeploy."
    exit 0
  fi
  sleep 6
done

echo "HTTPS isn't answering yet. Check: (1) ports 80/443 open in the Oracle console (Security List),"
echo "(2) ${DOMAIN} points at this server's public IP, (3) logs: sudo docker compose logs caddy server"
exit 1
