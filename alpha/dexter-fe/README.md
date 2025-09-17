# Dexter FE (Alpha)

Next.js TypeScript UI for Dexter using OpenAI Realtime.

## Routes
- `/` — landing
- `/voice` — starts a WebRTC session using an ephemeral key from dexter-api
- `/chat` — text-only run via dexter-api `/agent/run`

## Config
Copy `.env.example` to `.env.local` and adjust `NEXT_PUBLIC_API_ORIGIN` to point at your API instance.

## Dev
```
npm ci
npm run dev
# http://localhost:3017
```

## Notes
- Uses `@openai/agents` RealtimeSession in the browser
- All tools are provided by dexter-mcp via hosted MCP tools in the API
