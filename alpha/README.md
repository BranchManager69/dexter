Alpha split scaffolding for the new multi-repo architecture. This is a working prototype in-place so we can iterate quickly before extracting to separate repos.

Repos to extract after validation:
- dexter-fe: Next.js 15 + TS frontend (voice + text chat)
- dexter-api: Node 20 + TS API using OpenAI Agents SDK and hosted MCP tools
- dexter-mcp: Existing MCP HTTP server (extract from token-ai/mcp)

What’s here now
- alpha/dexter-api: Express + TypeScript API with
  - GET /health
  - POST /realtime/session → OpenAI Realtime ephemeral session token (model: `gpt-realtime` by default)
  - POST /agent/run → run an Agent that uses hosted MCP tools (default text model: `gpt-5-mini`, override with `{ model: "gpt-5" }`)
  - Tests (vitest) including a production health probe to dexter.cash/mcp/health
- alpha/dexter-fe: Next.js TypeScript skeleton with two routes
  - /voice: connects via WebRTC using /realtime/session
  - /chat: text run via /agent/run

Quick start (API)
1) cd alpha/dexter-api
2) cp .env.example .env and fill OPENAI_API_KEY
3) npm install
4) npm run dev
5) curl http://127.0.0.1:3030/health

Quick start (FE)
1) cd alpha/dexter-fe
2) create .env.local with NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:3030
3) npm install
4) npm run dev
5) open http://localhost:3017/voice and http://localhost:3017/chat

Testing
- API unit/integration: cd alpha/dexter-api && npm test
- A production-like check validates https://dexter.cash/mcp/health

Notes
- TypeScript everywhere; ESM; Node 20+
- Agents SDK + hosted MCP tools to avoid duplicating tool logic
- Designed to split into standalone repos once we agree on the interfaces
