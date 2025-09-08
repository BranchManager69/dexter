# Server.js Cleanup Analysis

## Current State
The `token-ai/server.js` file contains ~1700 lines with many disabled routes using `if (false)` blocks.

## Disabled Routes Analysis

### 1. Realtime/Voice Routes (Lines 254-511)
**Disabled in server.js:**
- `/realtime/debug-log` (POST, GET, DELETE) - Voice debug logging
- `/realtime/debug-save` - Save debug logs to file
- `/realtime/health` - Health check endpoint
- `/realtime/sessions` (404-462) - DISABLED duplicate
- `/realtime/bootstrap` - Serve instructions + tools
- `/realtime/tools` - Expose tools list
- `/realtime/instructions` - Expose instructions
- `/realtime/tool-call` - Execute tool calls

**Active in server/routes/realtime.js:**
- Similar routes but with DIFFERENT implementations
- Uses `realtimeDebugSessions` instead of `voiceLog`
- Different authentication checks

**Key Differences:**
- server.js uses `voiceLog` object with lines/seq
- realtime.js uses `realtimeDebugSessions` with session arrays
- Different data structures and storage mechanisms

### 2. Active Realtime Route (Lines 404-462)
- `/realtime/sessions` POST - Creates OpenAI realtime sessions
- This is ACTIVE (not wrapped in `if (false)`)
- Duplicates functionality in realtime.js but remains enabled

### 3. OAuth/OIDC Routes (Lines 1221-1441)
**Disabled in server.js:**
- `/.well-known/oauth-authorization-server`
- `/.well-known/openid-configuration`
- `/mcp-proxy/*` routes (authorize, token, userinfo, callback)

**Active in server/routes/mcpProxy.js:**
- Complete MCP proxy implementation
- Different implementation than disabled code

### 4. Managed Wallets Routes (Lines 1443-1641)
**Disabled in server.js:**
- `/managed-wallets` - List wallets
- `/managed-wallets/aliases` - Manage aliases
- `/managed-wallets/default` - Set default wallet

**Active in server/routes/wallets.js:**
- Similar functionality
- Different API structure

## The Problem

The disabled code represents THREE different systems:

1. **Original Voice Debug System** (voiceLog)
   - Used by the live UI at `/agent-live.html`
   - Stores debug logs in memory
   - Different from the modular realtime routes

2. **Failed OAuth Implementation**
   - Attempted to build OAuth provider
   - Replaced by current MCP proxy

3. **Original Wallet Management**
   - Basic wallet listing/alias system
   - Replaced by more complete implementation

## Why This Matters

The disabled code isn't just old duplicates - it's THREE DIFFERENT SYSTEMS that were partially implemented then abandoned. The live UI (`/agent-live.html`) might be trying to use these disabled endpoints!

## Recommendations

### Option 1: Enable Voice Debug Routes
The voice debug routes (`/realtime/debug-log`, etc.) appear to be used by the live UI. They should either be:
- Enabled (remove `if (false)`)
- Or moved to a separate module

### Option 2: Complete Cleanup
Remove ALL disabled code and fix any dependent systems.

### Option 3: Selective Activation
1. Enable voice debug routes (they're unique)
2. Remove OAuth disabled code (replaced by mcpProxy)
3. Remove wallet disabled code (replaced by wallets.js)
4. Keep the duplicate `/realtime/sessions` (it's active)

## Code Dependencies

Files that might depend on disabled routes:
- `/public/agent-live.html` - Uses voice debug endpoints
- `/public/js/live/debug.js` - Calls debug endpoints
- `/public/js/live/voice.js` - Voice functionality

## Decision Required

The voice debug system in server.js is DIFFERENT from the one in realtime.js. They:
- Use different data structures
- Store data differently
- Have different endpoints

This appears to be TWO SEPARATE debug systems that got confused during refactoring.