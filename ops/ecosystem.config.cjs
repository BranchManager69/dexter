const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const API_DIR = path.resolve(ROOT, '../dexter-api');
const FE_DIR  = path.resolve(ROOT, '../dexter-fe');
const MCP_DIR = path.resolve(ROOT, '../dexter-mcp');

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
      },
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
        TOKEN_AI_MCP_PUBLIC_URL: process.env.TOKEN_AI_MCP_PUBLIC_URL || 'https://dexter.cash/mcp',
        TOKEN_AI_MCP_OAUTH: process.env.TOKEN_AI_MCP_OAUTH ?? 'true',
        TOKEN_AI_MCP_OAUTH_ALLOW_ANY: process.env.TOKEN_AI_MCP_OAUTH_ALLOW_ANY ?? '0',
        TOKEN_AI_OIDC_ISSUER: process.env.TOKEN_AI_OIDC_ISSUER || 'https://dexter.cash',
        TOKEN_AI_OIDC_AUTHORIZATION_ENDPOINT: process.env.TOKEN_AI_OIDC_AUTHORIZATION_ENDPOINT || 'https://dexter.cash/api/connector/oauth/authorize',
        TOKEN_AI_OIDC_TOKEN_ENDPOINT: process.env.TOKEN_AI_OIDC_TOKEN_ENDPOINT || 'https://dexter.cash/api/connector/oauth/token',
        TOKEN_AI_OIDC_USERINFO: process.env.TOKEN_AI_OIDC_USERINFO || 'https://dexter.cash/api/connector/oauth/userinfo',
        TOKEN_AI_OIDC_SCOPES: process.env.TOKEN_AI_OIDC_SCOPES || 'wallet.read wallet.trade',
      },
    },
  ],
};
