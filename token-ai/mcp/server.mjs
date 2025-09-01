#!/usr/bin/env node
// MCP stdio server (spawns via stdio)
// Usage: node mcp/server.mjs

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpServer } from './common.mjs';
import dotenv from 'dotenv';
import path from 'node:path';

// Ensure env vars from repo .env are loaded when launched outside PM2
try {
  const envPath = path.resolve('/home/branchmanager/websites/degenduel/.env');
  dotenv.config({ path: envPath, quiet: true });
} catch {}

const server = buildMcpServer();
const transport = new StdioServerTransport();
(async () => {
  try {
    await server.connect(transport);
    process.stdin.resume();
  } catch (e) {
    console.error('[mcp-stdio] failed to start:', e?.message || e);
    process.exit(1);
  }
})();
