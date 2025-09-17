// ecosystem.config.cjs for the new Dexter suite (API + FE + MCP)

// PM2 ecosystem for the new Dexter suite (API + FE + MCP).
// Run from repo root:
//   pm2 start ecosystem.config.cjs --only dexter-api,dexter-fe,dexter-mcp
//   pm2 save

const path = require('path');
// Load env from repo root (Dexter), legacy token-ai/.env, and local MCP overrides
// TODO: Simplify this
//         Not sure the best way, but we should *not* rely on the parent directory's .env!
//         I would sooner have each of the 3 apps load its own .env file before loading .env from the parent directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); // Bad!
require('dotenv').config({ path: path.join(__dirname, 'dexter-api', '.env') });
require('dotenv').config({ path: path.join(__dirname, 'dexter-mcp', '.env') });
// why is there no .env in alpha or ANY of the three apps WTF!?

// Log directory
const LOG_DIR = path.join(__dirname, '..', 'logs');

// Ports
const API_PORT = Number(process.env.DEXTER_API_PORT || process.env.PORT) || 3030;
const FE_PORT = Number(process.env.DEXTER_FE_PORT) || 43017;
const MCP_PORT = Number(process.env.TOKEN_AI_MCP_PORT) || 3930;

module.exports = {
  apps: [
    
    // Backend API (Express + TypeScript)
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
        DEXTER_API_PORT: API_PORT,
        ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '*',
      },
      out_file: path.join(LOG_DIR, 'pm2-dexter-api.out.log'),
      error_file: path.join(LOG_DIR, 'pm2-dexter-api.err.log'),
      time: true,
      restart_delay: 2000,
      max_restarts: 10,
    },
    
    // Frontend (Next.js + TypeScript)
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
        DEXTER_FE_PORT: FE_PORT,
      },
      out_file: path.join(LOG_DIR, 'pm2-dexter-fe.out.log'),
      error_file: path.join(LOG_DIR, 'pm2-dexter-fe.err.log'),
      time: true,
      restart_delay: 2000,
      max_restarts: 10,
    },

    // MCP (Streamable HTTP + OAuth) (Node ESM)
    {
      name: 'dexter-mcp',
      cwd: path.join(__dirname, 'dexter-mcp'),
      script: 'http-server-oauth.mjs',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        TOKEN_AI_MCP_PORT: MCP_PORT,
        TOKEN_AI_MCP_PUBLIC_URL: process.env.TOKEN_AI_MCP_PUBLIC_URL || 'https://dexter.cash/mcp',
      },
      out_file: path.join(LOG_DIR, 'pm2-dexter-mcp.out.log'),
      error_file: path.join(LOG_DIR, 'pm2-dexter-mcp.err.log'),
      time: true,
      restart_delay: 2000,
      max_restarts: 10,
    },

  ],
};
