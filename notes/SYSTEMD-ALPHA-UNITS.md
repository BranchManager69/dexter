# systemd units (alpha split)

## dexter-fe.service (Next.js)
```
[Unit]
Description=Dexter FE (Next.js)
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/branchmanager/websites/dexter/alpha/dexter-fe
ExecStart=/usr/bin/node node_modules/.bin/next start -p 43017
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

## dexter-api.service
```
[Unit]
Description=Dexter API (Agents + MCP)
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/branchmanager/websites/dexter/alpha/dexter-api
EnvironmentFile=/home/branchmanager/websites/dexter/alpha/dexter-api/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Reload + restart:
```
sudo systemctl daemon-reload
sudo systemctl enable --now dexter-fe dexter-api
sudo systemctl status dexter-fe dexter-api --no-pager
```
