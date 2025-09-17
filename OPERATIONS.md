# Dexter Operations Manual

_Last updated: 2025-09-17_

Dexter now ships as three independent repositories. This repo only stores shared ops notes and utility scripts.
Keep the service repos checked out alongside this one (for example under `/home/branchmanager/websites/`):

| Service      | Repo URL                                           | Default Port |
|--------------|----------------------------------------------------|--------------|
| dexter-api   | https://github.com/BranchManager69/dexter-api      | 3030         |
| dexter-fe    | https://github.com/BranchManager69/dexter-fe       | 43017        |
| dexter-mcp   | https://github.com/BranchManager69/dexter-mcp      | 3930         |

## 1. Directory Layout

```
~/websites/
├── dexter-ops/        # this repo
├── dexter-api/        # API service repo
├── dexter-fe/         # Next.js frontend repo
├── dexter-mcp/        # MCP server repo
└── token-ai/          # archived legacy tooling (reference only)
```

Each service repo carries its own `.env.example`, README, build scripts, and deployment instructions.

## 2. Health Monitoring

`npm run smoke:prod` (from this repo) calls:
- `https://api.dexter.cash/health`
- `https://dexter.cash/mcp/health`
- `https://dexter.cash/.well-known/openid-configuration`

Use it after deploys or when checking stability.

## 3. PM2 / Deployment

Manage each service from its own repo following the instructions in that repo’s README. Typical flow:

```bash
cd ~/websites/dexter-api   && git pull && npm ci && npm run build
cd ~/websites/dexter-fe    && git pull && npm ci && npm run build
cd ~/websites/dexter-mcp   && git pull && npm ci
```

Start or restart via the PM2 configs defined in the service repos (e.g., `pm2 start ecosystem.config.cjs`).

## 4. Environment Variables

- Each repo has an `.env.example`; copy to `.env` and adjust for the environment.
- Production secrets are stored per service. This repo no longer carries authoritative env files.

## 5. Logs

- `~/.pm2/logs/dexter-api-*.log`
- `~/.pm2/logs/dexter-fe-*.log`
- `~/.pm2/logs/dexter-mcp-*.log`

Use the PM2 helpers defined in each service repo (e.g., `pm2 logs dexter-api`).

## 6. Legacy Artifacts

- `token-ai/` remains for historical reference only.
- Old mono-repo scripts in the root `package.json` have been removed; use the new service repos for
development tasks.

For anything not covered here, consult the README in the respective service repository.
