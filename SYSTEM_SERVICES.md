# CRITICAL: System Service Management

## Production Services (ALWAYS use systemctl)

### Dexter Services
```bash
# UI Server (port 3017)
sudo systemctl restart dexter-ui.service
sudo systemctl status dexter-ui.service

# MCP HTTP Server (port 3930)
sudo systemctl restart dexter-mcp.service
sudo systemctl status dexter-mcp.service

# Restart both
sudo systemctl restart dexter-ui.service dexter-mcp.service
```

### File Locations
- UI Service: `/etc/systemd/system/dexter-ui.service`
- MCP Service: `/etc/systemd/system/dexter-mcp.service`
- Working Directory: `/home/branchmanager/websites/dexter/token-ai`

### Service Auto-Restart on File Changes
- `dexter-ui.path` - Watches UI files
- `dexter-mcp.path` - Watches MCP files
<!-- Asset stamping disabled; path unit removed. -->

## NEVER DO THIS IN PRODUCTION
- ❌ `kill <pid>` - Don't manually kill processes
- ❌ `node server.js` - Don't start services manually
- ❌ `pm2 restart` - PM2 is NOT used for these services
- ❌ `nohup ... &` - Don't use nohup for production services

## Quick Check Commands
```bash
# List all Dexter services
systemctl list-units --all | grep dexter

# Check what's running on specific ports
sudo netstat -tlnp | grep -E "3017|3930"
sudo lsof -i :3017
sudo lsof -i :3930
```

## Production vs Development

### Production (THIS SERVER)
- ALWAYS use systemctl
- Services run as systemd units
- Automatic restart on failure
- Proper logging via journalctl

### Development (Local only)
- Can use `node server.js --port 3013`
- Manual process management acceptable
- As documented in README.md

## Remember
**THIS IS A PRODUCTION SERVER. ALWAYS USE SYSTEMCTL.**

Last Updated: 2025-09-07
