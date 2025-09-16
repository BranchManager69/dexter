# Dexter FE (Alpha)

Next.js TypeScript UI for Dexter using OpenAI Realtime.

## Routes
- `/` — landing
- `/voice` — starts a WebRTC session using an ephemeral key from dexter-api
- `/chat` — text-only run via dexter-api `/agent/run`

## Config
Create `.env.local`:
```
NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:3030
```

## Dev
```
npm ci
npm run dev
# http://localhost:3017
```

## Notes
- Uses `@openai/agents` RealtimeSession in the browser
- All tools are provided by dexter-mcp via hosted MCP tools in the API

