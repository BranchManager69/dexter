Modular Prompt Fragments

Overview

- Purpose: Let you edit safety/core/voice/domain/section nudges without code changes.
- Location: token-ai/prompts/
- Behavior: Fragments are concatenated (missing files ignored) and then core analysis blocks are appended; private memory digest is added last.

Fragment Files

- system.safety.md: Non‑disclosure and injection resistance (always first).
- system.core.md: High‑level flow and tool policy.
- system.voice/<voice>.md: Voice and tone (e.g., trencher).
- system.domain/<domain>.md: Domain context (e.g., trenches for memes/microcaps).
- overrides/section.<name>.md: Short nudges for specific sections (e.g., currentStatus, communicationAnalysis, summary).

Precedence (merge order)

1) system.safety.md
2) system.core.md
3) system.voice/<voice>.md
4) system.domain/<domain>.md
5) overrides/section.<name>.md (comma list)
6) Private memory digest (appended last)

Quick Check Command

- Full prompt: `npm run check:prompts`
- With fragments: `npm run check:prompts -- --voice trencher --domain trenches --overrides currentStatus,summary`
- Head/Tail preview: `--head=40` or `--tail=40`
- Inject memory text directly: `--memory "previous notes here"`
- Load memory digest from local agent state file: `--token <MINT> [--digest-scope summary] [--digest-chars 800]`

Private Fragments

- Always-on private heuristics (gitignored): create `token-ai/prompts/system.private.md`.
- Or specify a filename via flag/env: `--private <file>` or `TOKEN_AI_PRIVATE=<file>`.
  - The loader searches `token-ai/prompts/<file>` first, then `prompts/internal-data/<file>`.
- You can also add private section overrides (gitignored): `token-ai/prompts/overrides/section.<name>.private.md`.
- Keep private content concise to avoid prompt bloat. Use section private nudges for scoped guidance.

Private Overrides (auto-preference)

- When you pass `--overrides name1,name2`, the loader will auto-prefer private files when they exist:
  - Tries `overrides/section.<name>.private.md` first, then falls back to `overrides/section.<name>.md`.
- You can also force private by naming it explicitly: `--overrides currentStatus.private,summary.private`.

Common Run Examples

- Meme analysis with private backbone + private overrides:
  - `npm run token-agent -- --agent-memory --voice trencher --domain trenches --overrides currentStatus,summary`
  - (Create `system.private.md` and private overrides to have them picked up automatically.)
- Serious/utility tone + domain:
  - `npm run token-agent -- --voice utility --domain serious --overrides communicationAnalysis,summary`

Env/Flags

- Flags (CLI): `--voice <name> --domain <name> --overrides a,b`
- Envs (equiv): `TOKEN_AI_VOICE`, `TOKEN_AI_DOMAIN`, `TOKEN_AI_OVERRIDES`
 - Private (optional): `TOKEN_AI_PRIVATE=<file>` (e.g., `system.private.md`)

Defaults via .env (recommended)

Add to `.env` once to avoid passing flags every run:

```
TOKEN_AI_VOICE=trencher
TOKEN_AI_DOMAIN=trenches
TOKEN_AI_OVERRIDES=currentStatus,communicationAnalysis,summary
TOKEN_AI_PRIVATE=system.private.md
```

Notes

- If no fragments/flags are present, a concise neutral fallback voice is used.
- The analysis deep‑dive and correlation playbook are appended after fragments automatically.
- Runtime behavior of the agent is unchanged unless fragments/flags are provided.
