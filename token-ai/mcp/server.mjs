#!/usr/bin/env node
// MCP stdio server (spawns via stdio)
// Usage: node mcp/server.mjs

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildMcpServer } from './common.mjs';
import dotenv from 'dotenv';
import path from 'node:path';

// Ensure env vars are loaded from Dexter repo root and local token-ai folder
try {
  const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname));
  const TA_ROOT = path.resolve(HERE, '..');
  const REPO_ROOT = path.resolve(TA_ROOT, '..');
  dotenv.config({ path: path.join(REPO_ROOT, '.env') });
  dotenv.config({ path: path.join(TA_ROOT, '.env') });
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
