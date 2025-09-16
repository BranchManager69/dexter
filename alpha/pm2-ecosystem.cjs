// PM2 ecosystem for Dexter alpha (FE + API). Run from repo root:
// pm2 start alpha/pm2-ecosystem.cjs --only dexter-api,dexter-fe
// pm2 save

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'dexter-api', '.env') });

const LOG_DIR = path.join(__dirname, '..', 'logs');
const FE_PORT = process.env.DEXTER_FE_PORT || 3017;
const API_PORT = process.env.DEXTER_API_PORT || process.env.PORT || 3030;

module.exports = {
  apps: [
    {
      name: 'dexter-api',
      cwd: path.join(__dirname, 'dexter-api'),
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
        OPENAI_REALTIME_MODEL: process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview',
        MCP_URL: process.env.MCP_URL || 'https://mcp.dexter.cash/mcp',
        PORT: API_PORT,
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '*',
      },
      out_file: path.join(LOG_DIR, 'pm2-dexter-api.out.log'),
      error_file: path.join(LOG_DIR, 'pm2-dexter-api.err.log'),
      time: true,
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'dexter-fe',
      cwd: path.join(__dirname, 'dexter-fe'),
      script: 'node_modules/next/dist/bin/next',
      args: `start -p ${FE_PORT}`,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        NEXT_PUBLIC_API_ORIGIN: process.env.NEXT_PUBLIC_API_ORIGIN || 'https://api.dexter.cash',
      },
      out_file: path.join(LOG_DIR, 'pm2-dexter-fe.out.log'),
      error_file: path.join(LOG_DIR, 'pm2-dexter-fe.err.log'),
      time: true,
      restart_delay: 2000,
      max_restarts: 10,
    },
  ],
};
