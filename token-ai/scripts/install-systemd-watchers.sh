#!/usr/bin/env bash
set -euo pipefail

UI_PATH_UNIT="/etc/systemd/system/dexter-ui.path"
UI_RESTART_UNIT="/etc/systemd/system/dexter-ui-restart.service"
MCP_PATH_UNIT="/etc/systemd/system/dexter-mcp.path"
MCP_RESTART_UNIT="/etc/systemd/system/dexter-mcp-restart.service"

REPO_ROOT="$(cd "$(dirname "$0")"/../.. && pwd)"

echo "This script installs/updates systemd .path watchers for dexter-ui and dexter-mcp."
echo "It requires sudo to write to /etc/systemd/system."

if [[ "$EUID" -ne 0 ]]; then
  echo "Re-running with sudo..."
  exec sudo bash "$0" "$@"
fi

install_unit() {
  local src="$1" dest="$2"
  echo "> Installing $dest"
  install -m 0644 "$src" "$dest"
}

install_unit "$REPO_ROOT/config/systemd/dexter-ui-restart.service" "$UI_RESTART_UNIT"
install_unit "$REPO_ROOT/config/systemd/dexter-ui.path" "$UI_PATH_UNIT"
install_unit "$REPO_ROOT/config/systemd/dexter-mcp-restart.service" "$MCP_RESTART_UNIT"
install_unit "$REPO_ROOT/config/systemd/dexter-mcp.path" "$MCP_PATH_UNIT"

echo "> Reloading systemd daemon"
systemctl daemon-reload

echo "> Enabling and starting path units"
systemctl enable --now dexter-ui.path dexter-mcp.path

echo "> Current status:"
systemctl status dexter-ui.path dexter-mcp.path --no-pager || true

echo "Done. These watchers will restart dexter-ui and dexter-mcp on relevant file changes."
echo "Note: Directory watches trigger on create/rename/delete (as in typical git deploys)."
echo "      Pure in-place writes that do not update directory entries may not trigger."

