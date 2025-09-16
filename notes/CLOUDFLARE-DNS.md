# Cloudflare DNS (alpha split)

Two options:

1) Subdomains (recommended for clean separation)
- Create A or CNAME records pointing to the same origin as dexter.cash:
  - `api.dexter.cash` → your server IP (Proxy: ON)
  - `mcp.dexter.cash` → your server IP (Proxy: OFF recommended for simpler streaming)

2) Path-based (no new DNS):
- Keep only `dexter.cash` and proxy `/api/*` and `/mcp/*` in NGINX. No DNS changes needed.

## Cloudflare API example
Replace placeholders: `CF_API_TOKEN`, `CF_ZONE_ID`, `SERVER_IP`.
```
# API subdomain (proxied)
curl -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "A",
    "name": "api",
    "content": "SERVER_IP",
    "ttl": 120,
    "proxied": true
  }'

# MCP subdomain (DNS only)
curl -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "A",
    "name": "mcp",
    "content": "SERVER_IP",
    "ttl": 120,
    "proxied": false
  }'
```

Verify:
```
dig +short api.dexter.cash
dig +short mcp.dexter.cash
```

