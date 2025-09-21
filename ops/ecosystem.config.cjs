const path = require('path');
const fs = require('fs');

const ROOT    = path.resolve(__dirname, '..');
const API_DIR = path.resolve(ROOT, '../dexter-api');
const FE_DIR  = path.resolve(ROOT, '../dexter-fe');
const MCP_DIR = path.resolve(ROOT, '../dexter-mcp');

// Single source of truth for secrets: parse ../dexter-ops/.env once here
const ENV_PATH = path.resolve(ROOT, '.env');
function parseEnv(contents) {
  const out = {};
  const lines = String(contents || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^(\w[\w\d_\-]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    // strip inline comments (# ...)
    value = value.replace(/\s+#.*$/, '').trim();
    // strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
const PARSED_ENV = fs.existsSync(ENV_PATH) ? parseEnv(fs.readFileSync(ENV_PATH, 'utf8')) : {};
const val = (k, fallback) => (PARSED_ENV[k] ?? process.env[k] ?? fallback);

module.exports = {
  apps: [
    {
      name: 'dexter-api',
      cwd: API_DIR,
      script: 'dist/server.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.DEXTER_API_PORT || 3030,
        // Supabase / DB — set explicitly here to avoid drift
        SUPABASE_URL: val('SUPABASE_URL', ''),
        SUPABASE_SERVICE_ROLE_KEY: val('SUPABASE_SERVICE_ROLE_KEY', ''),
        SUPABASE_ANON_KEY: val('SUPABASE_ANON_KEY', ''),
        SUPABASE_JWT_SECRET: val('SUPABASE_JWT_SECRET', ''),
        DATABASE_URL: val('DATABASE_URL', ''),
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'dexter-fe',
      cwd: FE_DIR,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p ' + (process.env.DEXTER_FE_PORT || 43017),
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_API_ORIGIN: process.env.NEXT_PUBLIC_API_ORIGIN || 'https://api.dexter.cash',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'dexter-mcp',
      cwd: MCP_DIR,
      script: 'http-server-oauth.mjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        TOKEN_AI_MCP_PORT: process.env.TOKEN_AI_MCP_PORT || 3930,
        TOKEN_AI_MCP_PUBLIC_URL: val('TOKEN_AI_MCP_PUBLIC_URL', 'https://dexter.cash/mcp'),
        TOKEN_AI_MCP_OAUTH: process.env.TOKEN_AI_MCP_OAUTH ?? 'true',
        TOKEN_AI_MCP_OAUTH_ALLOW_ANY: process.env.TOKEN_AI_MCP_OAUTH_ALLOW_ANY ?? '0',
        // Ensure MCP forwards API-bound calls to the dedicated API host
        DEXTER_API_BASE_URL: process.env.DEXTER_API_BASE_URL || 'https://api.dexter.cash/api',
        // Align issuer to path-aware MCP base to avoid resolver mismatch
        TOKEN_AI_OIDC_ISSUER: 'https://dexter.cash/mcp',
        // Single client id (cid_…)
        TOKEN_AI_OIDC_CLIENT_ID: val('TOKEN_AI_OIDC_CLIENT_ID', ''),
        // Do not force external OIDC mode via connector endpoints; MCP serves /mcp/* itself
        TOKEN_AI_OIDC_SCOPES: val('TOKEN_AI_OIDC_SCOPES', 'openid profile email wallet.read wallet.trade'),
        // Provide Supabase basics for token validation paths
        SUPABASE_URL: val('SUPABASE_URL', ''),
        SUPABASE_ANON_KEY: val('SUPABASE_ANON_KEY', ''),
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
