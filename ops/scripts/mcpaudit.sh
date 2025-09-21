#!/usr/bin/env bash
set -euo pipefail

banner() {
  printf '\n%s\n' "--- $1 ---"
}

banner "MCP root"
curl -sS -i https://dexter.cash/mcp | sed -n '1,80p'

banner "well-known (PRM)"
curl -sS https://dexter.cash/.well-known/oauth-protected-resource/mcp | jq . || true

banner "~/.well-known/oauth-authorization-server (root)"
curl -sS https://dexter.cash/.well-known/oauth-authorization-server | \
  jq '{issuer,authorization_endpoint,token_endpoint,mcp}' || true

banner "~/.well-known/oauth-authorization-server (path aware)"
curl -sS -i https://dexter.cash/.well-known/oauth-authorization-server/mcp | sed -n '1,40p'

banner "MCP manifest"
curl -sS https://dexter.cash/.well-known/mcp.json | jq . || true
