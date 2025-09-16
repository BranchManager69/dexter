#!/usr/bin/env bash
set -euo pipefail

CONF_SRC="$(cd "$(dirname "$0")/.." && pwd)/notes/NGINX-ALPHA-SPLIT.conf"
CONF_DIR="/etc/nginx/sites-available"
ENABLED_DIR="/etc/nginx/sites-enabled"

echo "This script will copy example NGINX server blocks. Review before enabling."
echo "Source: $CONF_SRC"

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo)." 1>&2
  exit 1
fi

cp "$CONF_SRC" "$CONF_DIR/dexter-alpha-split.conf"
ln -sf "$CONF_DIR/dexter-alpha-split.conf" "$ENABLED_DIR/dexter-alpha-split.conf"
nginx -t
systemctl reload nginx
echo "Applied and reloaded NGINX."

