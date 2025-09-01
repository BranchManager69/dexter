# Prompt Files Usage Guide

## ✅ ACTIVE FILES (System Loads These)

### Always Loaded (in order):
1. `system.safety.md` - Safety guidelines
2. `system.core.md` - Core behavior
3. `system.private.md` - Private overrides (if exists)

### Conditionally Loaded:

#### Via --domain=NAME or TOKEN_AI_DOMAIN=NAME:
- `system.domain/trenches.md` - Meme/microcap focus
- `system.domain/serious.md` - Institutional analysis  
- `system.domain/knowledge-base.md` - **FULL WISDOM** (recommended)
- `system.domain/pump-detection.md` - Pump pattern focus
- `system.domain/insider-patterns.md` - Wallet analysis focus
- `system.domain/social-manipulation.md` - Fake engagement focus

#### Via --voice=NAME or TOKEN_AI_VOICE=NAME:
- `system.voice/trencher.md` - Degen speak
- `system.voice/utility.md` - Professional tone

#### Via --overrides=NAME1,NAME2 or TOKEN_AI_OVERRIDES=NAME1,NAME2:
- `overrides/section.*.md` - Section-specific overrides
- `overrides/section.*.private.md` - Private variants (preferred if exist)

## 📝 Note on Knowledge Base

The `knowledge-base.md` file contains ALL institutional knowledge including:
- Stage-specific guidance (pre-social, post-OHLCV, final synthesis)
- Heuristic patterns (Telegram, Twitter, website analysis)
- Token age differentiation (new vs established)
- Pattern detection (pumps, insiders, manipulation)

## 📊 Usage Examples

```bash
# Basic analysis (only core prompts)
npm run socials:agent -- <MINT>

# Full institutional knowledge
npm run socials:agent -- <MINT> --domain=knowledge-base

# Trenching mode with degen voice
npm run socials:agent -- <MINT> --domain=trenches --voice=trencher

# Pump detection focus
npm run socials:agent -- <MINT> --domain=pump-detection

# Multiple overrides
TOKEN_AI_OVERRIDES=communicationAnalysis,summary npm run socials:agent -- <MINT>

# Everything combined
npm run socials:agent -- <MINT> \
  --domain=knowledge-base \
  --voice=trencher \
  --overrides=communicationAnalysis,currentStatus
```

## 🎯 Recommendation

For maximum trenching wisdom, use:
```bash
npm run socials:agent -- <MINT> --domain=knowledge-base --voice=trencher
```

This loads ALL institutional knowledge including:
- Token age differentiation
- Pump/insider/manipulation patterns
- Stage-specific analysis guidance
- All heuristics and signals
- Degen communication style