# Token‑AI Live Event Flow and Panel Map

This document describes the complete, end‑to‑end event flow for a single run, how each event is emitted over WebSocket, and where it appears on the Live Trenching UI (`/agent-live.html`). It also shows the structure of a panel and a condensed swimlane.

## Event Flow (A → Z)

Agent (index.js) | WebSocket Event(s) | UI (agent-live.html)
---|---|---
Start session | `agent:session_start` | Header timers/phase
Load memory digest | `agent:memory` (initial) | Context/Memory (left)
Bootstrap step | `process:step_start` (bootstrap) | Timeline badges
Round 1 start | `agent:status` (llm_round1_start) | Narrative “…” line; Phase → Socials
Model streams text | `agent:partial_output` (stream) | Narrative (center)
Call socials tool | `agent:tool_call` (socials_…) | Terminal (panel console)
Socials active | `process:step_start` (socials) | Timeline
Socials complete | `agent:tool_result` (socials_…), `process:step_end` (socials) | Terminal, Timeline (done)
Meta + links | `token:meta`, `process:source` | Header name/symbol/address, Links grid
Quick badges (optional) | `metrics:update` | Header market chips
Socials checkpoint (save) | `agent:memory` (socials_checkpoint) | Context/Memory (left refresh)
Socials AI one‑liner | `agent:partial_output` | Narrative (center, short line)

### OHLCV Phase (two modes)

Autonomy (`--no-force-ohlcv`):
- If the model calls OHLCV:
  - `agent:tool_call` (analyze_token_ohlcv_range) → Terminal
  - `process:step_start` (market) → Timeline
  - `agent:tool_result` (…ohlcv_range) → Terminal
  - `process:step_end` (market) → Timeline (done)
  - `agent:memory` (market_checkpoint) → Context/Memory (left refresh)
  - `agent:partial_output` (AI one‑liner) → Narrative (center)

Enforced (default):
- `agent:status` (finalize_round_start) → Narrative “…” line
- Enforce OHLCV (non‑stream, no explicit event; creates server `function_call`)
- Then same sequence as above (tool_call → tool_result → checkpoint → AI one‑liner)

### Finalize + Output
- Auto‑continue outputs (silent, per round): attaches this round’s tool outputs on server (no event)
- `agent:status` (finalize_round_start) → Narrative “…” line
- `agent:final_json` (final analysis JSON + file path) → Narrative “final”; scores/market update UI
- `agent:session_end` → Header phase → Idle; footer log
- (Optional) `metrics:update` → Header chips refresh from `analysis.metadata.market`

### Runner Events (when launched via `server.js` /run)
- `runner:started` → Creates/attaches panel with pid/mint
- `runner:log` → Child process stdout/stderr → Terminal (panel console)
- `runner:ended` → Panel idle; session closed

## Panel Structure (one per mint)

```
+───────────────────────────────────────────────────────────────+
| Header: [Title | Symbol]  [Status]  [Elapsed]                 |
|    - updates via: token:meta, agent:session_*                 |
|                                                               |
| Context/Memory (left)                                         |
|    - set by: agent:memory (initial, socials_checkpoint,       |
|                          market_checkpoint)                   |
|                                                               |
| Narrative (center)                                            |
|    - model stream: agent:partial_output (stream)              |
|    - AI mini-lines: agent:partial_output (socials/ohlcv)      |
|    - final: agent:final_json (rendered summary)               |
|                                                               |
| Signals (right)                                               |
|    - process:status / signal / source                         |
|    - metrics:update (header badges)                           |
|                                                               |
| Links grid                                                    |
|    - process:source (site/TG/Twitter links)                   |
|                                                               |
| Timeline                                                      |
|    - process:step_start / process:step_end                    |
|                                                               |
| Terminal (panel console)                                      |
|    - agent:tool_call / agent:tool_result / agent:error        |
+───────────────────────────────────────────────────────────────+
```

## Swimlane Summary (condensed)

Agent → WS Events → UI Slot

- Memory load → `agent:memory` (initial) → Context/Memory
- Socials tool → `tool_call/result`, `step start/end` → Terminal, Timeline
- Socials checkpoint → `agent:memory` (socials_checkpoint) → Context/Memory
- Socials AI one‑liner → `agent:partial_output` → Narrative
- OHLCV tool → `tool_call/result`, `step start/end` → Terminal, Timeline
- Market checkpoint → `agent:memory` (market_checkpoint) → Context/Memory
- OHLCV AI one‑liner → `agent:partial_output` → Narrative
- Finalize JSON → `agent:final_json` → Narrative (final), Scores
- Session end → `agent:session_end` → Header → Idle

## Legend

- `agent:memory`: compact digest text that updates the left pane (initial + mid‑run checkpoints)
- `agent:partial_output`: model‑written text (streams + short AI one‑liners) in the Narrative body
- `process:*`: step/status/signal/source appear as small chips and link cards (right Signals area)
- `agent:tool_*`: tool lifecycle lines in the panel’s Terminal console (with elapsed timings)
- `metrics:update`: quick market chips in panel header

## Notes

- AI mini‑summaries (one‑liners) are generated by the model through the Responses API and emitted as `agent:partial_output`, so they appear in the center Narrative stream (not the Signals rail).
- Mid‑run memory checkpoints surface the compact digest in the left Context/Memory pane and keep continuity even if later steps fail.
- The Live Runner (`server.js`) automatically injects `TOKEN_AI_EVENTS_URL` for runs started via `/run`. For manual CLI runs, export `TOKEN_AI_EVENTS_URL=http://localhost:3013/events` (and `TOKEN_AI_EVENTS_TOKEN` if needed) so events appear live.
