// core/tools-adapter.mjs
// Hybrid tool mapper: routes selected tools via MCP when enabled, with optional native fallback.

import { McpAdapter } from './mcp-adapter.mjs';

export class ToolsAdapter {
  constructor(opts = {}) {
    this.enableMcp = String(process.env.TOKEN_AI_ENABLE_MCP || (opts.enableMcp ? '1' : '0')) === '1';
    this.mcp = this.enableMcp ? new McpAdapter({ mcpUrl: process.env.TOKEN_AI_MCP_URL, xUserToken: process.env.TOKEN_AI_DEV_USER_TOKEN }) : null;
    this._connected = false;
  }

  async ensureConnected() {
    if (!this.enableMcp) return;
    if (!this._connected) { await this.mcp.connect(); this._connected = true; }
  }

  async resolveToken(query, { chain = 'solana', limit = 5 } = {}) {
    if (this.enableMcp) {
      try {
        await this.ensureConnected();
        const res = await this.mcp.callTool({ name: 'resolve_token', arguments: { query, chain, limit } });
        if (!res.isError) return res.structuredContent || res;
      } catch (e) { /* fall back */ }
    }
    throw new Error('resolveToken fallback not implemented');
  }

  async fetchUrl(url, { mode = 'readability' } = {}) {
    if (this.enableMcp) {
      try {
        await this.ensureConnected();
        const name = (mode === 'raw') ? 'fetch_url' : 'smart_fetch';
        const args = (name === 'fetch_url') ? { url, mode: 'raw' } : { url, min_len: 400, rendered_wait_ms: 0 };
        const res = await this.mcp.callTool({ name, arguments: args });
        if (!res.isError) return res.structuredContent || res;
      } catch (e) { /* fall back */ }
    }
    throw new Error('fetchUrl fallback not implemented');
  }

  async executeBuy({ wallet_id, token_mint, sol_amount, slippage_bps = 100, priority_lamports }) {
    if (this.enableMcp) {
      try {
        await this.ensureConnected();
        const res = await this.mcp.callTool({ name: 'execute_buy', arguments: { wallet_id, token_mint, sol_amount, slippage_bps, priority_lamports } });
        if (!res.isError) return res.structuredContent || res;
      } catch (e) { /* fall back */ }
    }
    throw new Error('executeBuy fallback not implemented');
  }

  async close(){ try { if (this.mcp) await this.mcp.close(); } catch {} }
}

