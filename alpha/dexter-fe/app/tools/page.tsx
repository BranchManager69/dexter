'use client';

import { useEffect, useMemo, useState } from 'react';

type McpTool = {
  name?: string;
  description?: string;
  summary?: string;
  input_schema?: any;
  output_schema?: any;
  parameters?: any; // alternative field name in some MCP servers
};

export default function ToolsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<any>(null);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [filter, setFilter] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const r = await fetch('/api/tools');
        const ct = r.headers.get('content-type') || '';
        const text = await r.text();
        if (!r.ok) {
          setError(`${r.status} ${r.statusText} — ${text.slice(0, 400)}`);
          setRaw(text);
          return;
        }
        let data: any;
        try { data = ct.includes('json') ? JSON.parse(text) : JSON.parse(text); } catch {
          // Fall back to treating body as plain text
          data = { raw: text };
        }
        if (!alive) return;
        setRaw(data);
        const arr: McpTool[] = Array.isArray(data?.tools) ? data.tools : (Array.isArray(data) ? data : []);
        setTools(arr);
      } catch (e: any) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(t =>
      (t.name || '').toLowerCase().includes(q) ||
      (t.description || t.summary || '').toLowerCase().includes(q)
    );
  }, [tools, filter]);

  return (
    <div>
      <h1>MCP Tools</h1>
      <p style={{opacity:.8}}>Fetched from /api/tools (proxied to dexter-mcp). Shows name, description, and schemas for quick visibility.</p>

      <div style={{display:'flex', gap:8, alignItems:'center', margin:'8px 0'}}>
        <input
          placeholder="Filter by name or description"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{flex:'1 1 auto', padding:'8px', background:'#0b0c10', color:'#e6edf3', border:'1px solid #2c3242', borderRadius:4}}
        />
        <button onClick={() => setShowRaw(v => !v)} style={{padding:'8px 12px'}}>{showRaw ? 'Hide Raw' : 'Show Raw'}</button>
      </div>

      {loading && <div>Loading…</div>}
      {error && (
        <div style={{color:'#ff9f9f', border:'1px solid #5a2323', background:'#2b0e0e', padding:8, borderRadius:4, margin:'8px 0'}}>
          <div style={{fontWeight:600}}>Error</div>
          <div style={{whiteSpace:'pre-wrap'}}>{error}</div>
          <div style={{marginTop:6, opacity:.8}}>If you see 401/403, ensure TOKEN_AI_MCP_TOKEN is configured on the API.</div>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{opacity:.8}}>No tools found.</div>
      )}

      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:12}}>
        {filtered.map((t, idx) => (
          <div key={(t.name || 'tool') + ':' + idx} style={{border:'1px solid #2c3242', borderRadius:6, padding:12, background:'#0b0c10'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6}}>
              <div style={{fontWeight:600}}>{t.name || '(unnamed tool)'}</div>
            </div>
            {t.description || t.summary ? (
              <div style={{opacity:.9, marginBottom:8}}>{t.description || t.summary}</div>
            ) : null}
            <SchemaBlock title="Input Schema" value={(t as any).input_schema ?? (t as any).parameters} />
            <SchemaBlock title="Output Schema" value={(t as any).output_schema} />
          </div>
        ))}
      </div>

      {showRaw && (
        <div style={{marginTop:12}}>
          <div style={{fontSize:12, opacity:.8, marginBottom:4}}>Raw response</div>
          <pre style={{whiteSpace:'pre-wrap', background:'#0b0c10', color:'#9fb2c8', border:'1px solid #2c3242', borderRadius:4, padding:12}}>
            {safeStringify(raw)}
          </pre>
        </div>
      )}
    </div>
  );
}

function SchemaBlock({ title, value }: { title: string; value: any }) {
  if (!value) return null;
  return (
    <div style={{marginTop:8}}>
      <div style={{fontSize:12, opacity:.8, marginBottom:4}}>{title}</div>
      <pre style={{whiteSpace:'pre-wrap', background:'#0b0c10', color:'#9fb2c8', border:'1px solid #2c3242', borderRadius:4, padding:10, maxHeight:220, overflow:'auto'}}>
        {safeStringify(value)}
      </pre>
    </div>
  );
}

function safeStringify(v: any) {
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

