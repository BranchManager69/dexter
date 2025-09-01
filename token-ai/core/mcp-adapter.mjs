// core/mcp-adapter.mjs
// Minimal MCP client adapter (HTTP or stdio) with a stable callTool interface.
// - Prefers HTTP when TOKEN_AI_MCP_URL is set; otherwise uses stdio to mcp/server.mjs
// - Supports optional per-user identity via X-User-Token (HTTP transport)

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export class McpAdapter {
  constructor(opts = {}) {
    this.opts = opts;
    this.client = null;
    this.transport = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;
    const { mcpUrl = process.env.TOKEN_AI_MCP_URL, xUserToken = null, stdioCommand = 'node', stdioArgs = null } = this.opts;
    const useHttp = !!mcpUrl;
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    this.client = new Client({ name: 'token-ai-mcp-adapter', version: '0.1.0' }, { capabilities: { tools: {}, resources: {}, prompts: {}, logging: {} } });
    if (useHttp) {
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const headers = {};
      const token = process.env.TOKEN_AI_MCP_TOKEN || '';
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (xUserToken) headers['X-User-Token'] = String(xUserToken);
      this.transport = new StreamableHTTPClientTransport(mcpUrl, { requestInit: { headers } });
    } else {
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      const HERE = path.dirname(fileURLToPath(import.meta.url));
      const ROOT = path.resolve(HERE, '..');
      const cmd = stdioCommand || 'node';
      const args = Array.isArray(stdioArgs) && stdioArgs.length ? stdioArgs : [path.join(ROOT, 'mcp', 'server.mjs')];
      this.transport = new StdioClientTransport({ command: cmd, args, cwd: ROOT, stderr: 'pipe' });
    }
    await this.client.connect(this.transport);
    this.connected = true;
    return true;
  }

  async close() {
    try { if (this.client) await this.client.close(); } catch {}
    try { if (this.transport?.close) await this.transport.close(); } catch {}
    this.client = null;
    this.transport = null;
    this.connected = false;
  }

  async callTool({ name, arguments: args }) {
    if (!this.connected) await this.connect();
    return await this.client.callTool({ name, arguments: args || {} });
  }
}

export async function withMcpAdapter(opts, fn) {
  const mcp = new McpAdapter(opts);
  try {
    await mcp.connect();
    return await fn(mcp);
  } finally { try { await mcp.close(); } catch {} }
}

