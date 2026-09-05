#!/usr/bin/env bash
# One-time bootstrap for the Court Files API EC2 instance (Ubuntu 22.04/24.04).
# Run as a sudo-capable user: bash deploy/ec2-setup.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/court-files-server}"
APP_USER="${APP_USER:-$USER}"

echo "==> Updating packages"
sudo apt-get update -y
sudo apt-get install -y curl git nginx rsync ufw

echo "==> Installing Node.js 22"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v
npm -v

echo "==> Installing PM2"
sudo npm install -g pm2

echo "==> App directory: $APP_DIR"
sudo mkdir -p "$APP_DIR"
sudo mkdir -p /var/log/court-files-api
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR" /var/log/court-files-api

echo "==> Firewall (SSH + HTTP/HTTPS)"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable || true

echo "==> Nginx site"
if [ -f "$(dirname "$0")/nginx-api.conf" ]; then
  sudo cp "$(dirname "$0")/nginx-api.conf" /etc/nginx/sites-available/court-files-api
  sudo ln -sf /etc/nginx/sites-available/court-files-api /etc/nginx/sites-enabled/court-files-api
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t
  sudo systemctl enable nginx
  sudo systemctl reload nginx
fi

echo "==> PM2 startup on reboot"
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" || true

cat <<EOF

Setup complete.

Next steps:
  1. Create $APP_DIR/.env with production secrets (see .env.example).
  2. Edit /etc/nginx/sites-available/court-files-api — set server_name.
  3. Point DNS A record for api.yourdomain.com to this EC2 public IP.
  4. TLS: sudo apt-get install -y certbot python3-certbot-nginx
         sudo certbot --nginx -d api.yourdomain.com
  5. Add GitHub Actions secrets (see deploy/README.md).
  6. Push to master/main to trigger deploy, or run workflow_dispatch.

EOF
