// Shared MCP server builder: tools, resources, and helpers (modular version)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

// Import modular tools
import { registerWalletAuthTools, sessionWalletOverrides } from './tools/wallet-auth.mjs';
import { registerProgramAccountsTools } from './tools/program-accounts.mjs';
import { registerAgentRunTools } from './tools/agent-run.mjs';
import { registerReportAnalysisTools } from './tools/report-analysis.mjs';
import { registerVoiceDebugTools } from './tools/voice-debug.mjs';
import { registerWebResearchTools } from './tools/web-research.mjs';
import { registerTradingTools } from './tools/trading.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_AI_DIR = path.resolve(HERE, '..');
const REPORTS_DIR = path.join(TOKEN_AI_DIR, 'reports', 'ai-token-analyses');
const RESEARCH_DIR = path.join(TOKEN_AI_DIR, 'reports', 'deep-research');

const ENABLE_RUN_TOOLS = String(process.env.TOKEN_AI_MCP_ENABLE_RUN_TOOLS || '1') !== '0';

// Helper functions for resources
function extractMintFromReport(j, filename){
  try {
    let m = j?.tokenAddress || j?.mint || j?.metadata?.tokenAddress || j?.metadata?.token_address || j?.metadata?.token?.address || j?.token?.address || '';
    if (typeof m === 'string') m = m.trim(); else m = '';
    if (m.startsWith('--mint=')) m = m.slice(7);
    if (m && !m.startsWith('--')) return m;
    // Fallback: filename patterns
    const name = String(filename || '');
    const mintEq = name.match(/mint=([A-Za-z0-9_-]+)/);
    if (mintEq && mintEq[1]) return mintEq[1];
    const base58Matches = name.match(/[1-9A-HJ-NP-Za-km-z]{32,64}/g);
    if (base58Matches && base58Matches.length) {
      return base58Matches.sort((a,b)=> b.length - a.length)[0];
    }
  } catch {}
  return null;
}

function extractMeta(j){
  try {
    const symbol = j?.symbol || j?.ticker || j?.token?.symbol || null;
    const name = j?.name || j?.token?.name || null;
    const created_at = j?.created_at || j?.metadata?.timestamp || j?.metadata?.started_at || null;
    const market = j?.metadata?.market || j?.market || {};
    const fdv = (typeof market?.fdv === 'number') ? market.fdv : null;
    const liquidity = (typeof market?.liquidity === 'number') ? market.liquidity : null;
    const volume24h = (typeof market?.volume24h === 'number' || typeof market?.volume_24h === 'number') ? (market.volume24h ?? market.volume_24h) : null;
    return { symbol: symbol || null, name: name || null, created_at: created_at || null, fdv, liquidity, volume24h };
  } catch {
    return { symbol: null, name: null, created_at: null, fdv: null, liquidity: null, volume24h: null };
  }
}

export function buildMcpServer(){
  const server = new McpServer({ name: 'token-ai-mcp', version: '0.2.0' }, {
    capabilities: { logging: {}, tools: { listChanged: true } },
    instructions: `Tools and resources for Token-AI analyses.\n- Tools: list_reports_page, list_resource_uris, list_recent_analyses, read_report_uri, get_report, get_latest_analysis${ENABLE_RUN_TOOLS ? ', run_agent, run_socials, list_runs, get_run_logs, kill_run' : ''}.\n- Resources: report://ai-token-analyses/{file} (application/json), report://ai-token-analyses/by-mint/{mint}.\n- Note: set TOKEN_AI_MCP_ENABLE_RUN_TOOLS=0 to hide run/kill tools.`
  });

  // Register all modular tools
  registerWalletAuthTools(server);
  registerProgramAccountsTools(server);
  registerAgentRunTools(server);
  registerReportAnalysisTools(server);
  registerVoiceDebugTools(server);
  registerWebResearchTools(server);
  registerTradingTools(server);

  // Resources (use new McpServer.resource API)
  // report://ai-token-analyses/{file}
  server.resource(
    'ai-token-analyses:file',
    new ResourceTemplate('report://ai-token-analyses/{file}', 'Analysis report by filename', 'application/json'),
    async (_uri, vars) => {
      const file = vars?.file;
      if (!/^[A-Za-z0-9._-]+\.json$/.test(String(file))) throw new Error('Invalid filename');
      const abs = path.join(REPORTS_DIR, String(file));
      if (!fs.existsSync(abs)) throw new Error('File not found');
      const data = fs.readFileSync(abs, 'utf8');
      return { contents: [{ type: 'text', text: data }] };
    }
  );

  // report://ai-token-analyses/by-mint/{mint}
  server.resource(
    'ai-token-analyses:by-mint',
    new ResourceTemplate('report://ai-token-analyses/by-mint/{mint}', 'Analysis report by mint address', 'application/json'),
    async (_uri, vars) => {
      const mint = vars?.mint;
      // Find most recent report for this mint
      try {
        const files = (fs.readdirSync(REPORTS_DIR) || [])
          .filter(f => f.endsWith('.json'))
          .map(f => ({
            file: path.join(REPORTS_DIR, f),
            name: f,
            mtime: (()=>{ try { return fs.statSync(path.join(REPORTS_DIR, f)).mtimeMs || 0; } catch { return 0; } })()
          }))
          .sort((a,b)=> b.mtime - a.mtime);

        const m = String(mint || '').toLowerCase();
        for (const f of files) {
          try {
            const raw = fs.readFileSync(f.file, 'utf8');
            const j = JSON.parse(raw);
            const jm = String(extractMintFromReport(j, f.name) || '').toLowerCase();
            if (jm && (jm === m || jm.includes(m))) {
              return { contents: [{ type: 'text', text: raw }] };
            }
          } catch {}
        }
      } catch {}
      throw new Error('No report found for mint');
    }
  );

  // research://deep-research/notes/{id}
  server.resource(
    'deep-research:note',
    new ResourceTemplate('research://deep-research/notes/{id}', 'Deep research note by ID', 'application/json'),
    async (_uri, vars) => {
      const id = vars?.id;
      const safe = String(id||'').replace(/[^A-Za-z0-9_-]/g,'');
      const file = path.join(RESEARCH_DIR, 'notes', `${safe}.json`);
      if (!fs.existsSync(file)) throw new Error('Note not found');
      const data = fs.readFileSync(file, 'utf8');
      return { contents: [{ type: 'text', text: data }] };
    }
  );

  // research://deep-research/{file}
  server.resource(
    'deep-research:file',
    new ResourceTemplate('research://deep-research/{file}', 'Deep research report by filename', 'application/json'),
    async (_uri, vars) => {
      const file = vars?.file;
      if (!/^[A-Za-z0-9._-]+\.json$/.test(String(file))) throw new Error('Invalid filename');
      const abs = path.join(RESEARCH_DIR, 'reports', String(file));
      if (!fs.existsSync(abs)) throw new Error('File not found');
      const data = fs.readFileSync(abs, 'utf8');
      return { contents: [{ type: 'text', text: data }] };
    }
  );

  return server;
}

// Make helper functions and maps available for backward compatibility
export { sessionWalletOverrides, extractMintFromReport, extractMeta };
