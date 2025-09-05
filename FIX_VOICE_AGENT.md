# Issues and Fixes for GPT-Realtime Voice Agent in Dexter

## 1\. **Function Call Output Handling (Invalid call_id)**

**Issue:** The agent is sending function call results with the wrong identifier, causing the OpenAI Realtime API to reject them. In the logs, every tool result is followed by an error like:

ERROR realtime error {"code":"invalid_tool_call_id","message":"Tool call ID 'item_CCMsy0NBDKZORE6YoS36l' not found in conversation."}

This indicates the agent used a conversation _item ID_ (prefixed item_...) instead of the function _call ID_ (prefixed call_...) when returning results. As a result, the model never receives the function output, leading to repeated attempts and broken chaining.

**Cause:** In the client code, the conversation.item.create event for function outputs uses the wrong ID. For example, in **agent-live.html** the code sends:

voice.dc?.send(JSON.stringify({  
type: 'conversation.item.create',  
item: {  
type: 'function_call_output',  
call_id: id, // ⚠️ using conversation item id, not function call id  
output: JSON.stringify(outputData)  
}  
}));  
vd.add('info','sent function_call_output', { call_id: id });

Here id is taken from msg.id (the conversation item’s ID) instead of the actual function call ID provided by the model[\[1\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L1105-L1113). The OpenAI API expects the **call_id** that was in the response.function_call_arguments.done event (e.g. "call_PG12S5ER7l7HrvZz"), not the item ID.

**Fix:** Use the **function call ID** from the model’s event when sending the output. The Realtime API’s function call event includes a call_id field distinct from the item ID. Capture it and send it back unchanged. For example, if handling the event as in your code:

case 'response.function_call_arguments.done':  
const { name, arguments: args, call_id } = message;  
// ... execute tool ...  
voice.dc?.send(JSON.stringify({  
type: 'conversation.item.create',  
item: {  
type: 'function_call_output',  
call_id: call_id, // ✅ use the call_id from the model event  
output: JSON.stringify(result)  
}  
}));

In the **OpenAI example**, they do exactly this – note how msg.call_id is used for the output[\[2\]](https://github.com/craigsdennis/talk-to-javascript-openai-workers/blob/8100e2ca70a6e7b223027fca46bffd0edefaa0a5/public/script.js#L122-L130). Implementing this change in your handleToolFrames logic will stop the “tool call ID not found” errors. The model will then receive the tool results and can proceed to the next step instead of looping or failing. This is crucial for chaining multiple tool calls in one conversation turn (e.g. resolve token → get price → buy token) without breakdown.

After fixing this, you should see the model properly consuming the function output and continuing the response (via response.create) rather than re-invoking the same tool repeatedly.

**Outcome:** The assistant will correctly chain actions. For example, upon "Resolve Clanker", it will call resolve_token once, get the results, and then decide the next step (ask for clarification or proceed). The repeated calls and the final "Unexpected token '<' ... is not valid JSON" error (from a likely HTML error response due to rapid retry) will be eliminated.

## 2\. **Tool Registration and Parameter Schema (e.g. list_managed_wallets)**

**Issue:** The assistant attempted to call **list_managed_wallets** but got an "unknown_tool" error. This means the model knew about the tool (it was mentioned in your trading instructions) but the function wasn’t recognized during execution. Consequently, the agent failed to retrieve the trading wallet and couldn’t proceed with the buy operation.

**Causes:**

- **Tool not registered in session:** If list_managed_wallets was omitted from the tools list sent in session.update, the model would still try (because of the prompt guidance[\[3\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/prompts/system.domain/trading-execution.md#L6-L14)) but the API wouldn’t allow it. Ensure all tools referenced in your system/domain instructions are actually included in the boot.tools array. In **core/tools.js**, list_managed_wallets is defined as a function tool[\[4\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/core/tools.js#L520-L528). Make sure buildResponsesTools() is including it (it should, given the snippet). After bootstrapping, the debug log should list it among the tools count. If it’s missing, add it to the list explicitly.
- **Strict parameter requirements:** The OpenAI function schema for list_managed_wallets currently **requires** search, limit, offset, and include_admin parameters[\[5\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/core/tools.js#L524-L532), but the model called it with empty {}. This mismatch can lead to failure. The model likely just wanted “list all wallets” (per your instruction to find the _Clanka Trading Wallet_ by name). Requiring a search string etc. is too strict. In the MCP server, those fields are optional[\[6\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/mcp/tools/trading.mjs#L966-L974), so we should reflect that in the function definition for the model.

**Fixes:**

- **Include the tool in Session:** Verify that after fetching the bootstrap config, you send a session.update with _all_ trading tools. In **agent-live.html** we see the client sending the tools list if present[\[7\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L765-L769). Confirm that boot.tools from /realtime/bootstrap contains list_managed_wallets (along with execute_buy, execute_sell, etc.). If not, update the bootstrap generator on the server to add it. Consistency between the prompt and available tools is essential – the domain prompt explicitly tells the AI about list_managed_wallets[\[3\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/prompts/system.domain/trading-execution.md#L6-L14), so the absence of the tool function would cause the unknown_tool error at runtime.
- **Relax the schema or provide defaults:** Modify the function schema in tools.js to make parameters optional or give them defaults. For example, you can remove those fields from the required list and set a reasonable default limit (say 100) and offset (0), with search and include_admin defaulting to empty string/false if not provided. This way, the model can call list_managed_wallets{} with no arguments and your MCP handler will interpret it as “list all visible wallets” (which it already does by default[\[8\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/mcp/tools/trading.mjs#L976-L985)[\[9\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/mcp/tools/trading.mjs#L999-L1008)).
- **Handle tool response:** Once recognized, the list_managed_wallets call will return a list of wallets (IDs, public keys, names) from the MCP server[\[10\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/mcp/tools/trading.mjs#L1005-L1013). The assistant should then identify the correct wallet (e.g. filter by "Clanka Trading Wallet"). Your current design expects the model to do this reasoning. After fixing the function call output (Fix #1), the model will actually receive the list. Ensure the prompt or chain-of-thought encourages it to pick the right wallet_id. (Your domain instructions already say to look for that name[\[3\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/prompts/system.domain/trading-execution.md#L6-L14), so if the function output is delivered properly, the model should comply.)

With these fixes, when the user says "Let's buy some of it," the agent will successfully call list_managed_wallets, get the wallet UUID, and move on to the buy step instead of stalling. No more unknown_tool errors – the buy/sell tools will be usable.

## 3\. **Chaining Multi-Step Actions and Trade Execution Flow**

Beyond the technical fixes above, to make the voice assistant “perfect” and truly conversational, consider the following improvements using latest best practices:

- **Auto-chaining with MCP:** You’ve enabled the tool_choice: 'auto' setting[\[11\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L766-L769), which lets the model decide when to use tools. With the corrected tool call handling, the GPT-4 realtime model can chain multiple function calls within a single turn. Encourage this behavior in the prompt. For example, the system instructions can suggest: _“If a user requests a trade, first resolve the token, then get relevant market info (price, etc.), and preview the trade before executing. Use the available tools to gather data and confirm with the user if needed.”_ This nudges the model to plan a series of tool calls (it might even use the new multi-call planning abilities).
- **Preview and confirmation workflow:** Leverage the **buy/sell preview** tools for safer execution. Currently, the agent immediately tried execute_buy. A better sequence (as also hinted by your toolset) is:
- **Preview** – Call execute_buy_preview with the chosen wallet_id, token_mint, and amount (SOL or token quantity). This returns an estimated outcome (cost, price impact, etc.) without committing[\[12\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/TOOLS-DOCUMENTATION.md#L79-L88). The assistant can present this info (“It looks like ~0.0005 SOL will get you about 1234 CLANKER, shall I proceed?”).
- **Confirm** – Wait for user’s "yes" or "no". Your code already sets up a pending confirmation (pendingConfirm) and listens for a yes/no[\[13\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L980-L990). With the model now receiving function outputs, you could alternatively let the model itself ask “Do you want to buy now?” after a preview. Both approaches can work – just ensure only one confirmation path is active to avoid confusion.
- **Execute** – On confirmation, call execute_buy. Your backend is prepared to auto-select the wallet and finalize the trade (via MCP)[\[14\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/server.js#L773-L826)[\[15\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/server.js#L827-L836). Make sure the assistant conveys success or failure to the user (e.g. “Purchase completed, transaction signature ...”).

_Latest practice:_ Having the AI use a preview->confirm->execute flow builds trust. Update your prompts to reflect this recommended pattern. The model should know to prefer a preview first (unless the user explicitly says “buy now without preview”). This way, the voice assistant will chain tools intelligently: resolve token → list wallet (if needed) → preview buy → (user confirmation) → execute buy.

- **Error handling and context carry-over:** With function results properly returned, the model can handle errors more gracefully. For instance, if resolve_token returns multiple candidates, **your current implementation intercepts it and asks the user to choose** (listing the top 3 options via voice.dc.send(response.create)[\[16\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L1086-L1095)). This works, but it bypasses the model. Now that function outputs are fixed, you have the option to let the model handle disambiguation itself (by feeding the list back and having it ask “Which token did you mean?”). This would be more MCP-driven. However, given you already have a robust manual prompt for this, it’s acceptable to keep that logic. Just be sure that after the user selects a candidate (e.g. says “1” or the address suffix), the assistant knows which token to proceed with. Your code sets pendingConfirm with the choice and then instructs the user to say “yes” to start analysis[\[17\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L986-L990). You’ll want to tie this into the model’s chain: perhaps on user’s “yes”, the model should initiate a deep analysis or trading sequence for that token.
- **MCP Proxy usage:** You have attached an mcp tool in the session[\[18\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L780-L788). This is great for offloading complex multi-step tasks (research, analytics) to your backend. Ensure the model knows when to use the MCP proxy vs. direct tools. For trading, the direct tools are fine (as they themselves call MCP under the hood). For something like “deep research on this token,” you might let the model call a higher-level MCP function (if one exists, like run_agent_quick). The goal is to maximize autonomy: the model should be able to decide to invoke an entire analysis pipeline via MCP if the conversation warrants it. Verify that your MCP server’s tools are correctly exposed and that the model’s instructions mention them (the Tools Documentation shows many MCP server tools[\[19\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/TOOLS-DOCUMENTATION.md#L14-L22)[\[20\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/TOOLS-DOCUMENTATION.md#L77-L85)). If only a subset is relevant to voice, tailor the list accordingly to avoid confusion.

**Summary:** By fixing the call_id usage and ensuring all tools (and their schemas) are properly set up, you address the core breakdowns that were “constantly” happening. The assistant will seamlessly chain actions: it will resolve the token symbol to a mint address, retrieve the trading wallet, perhaps fetch price or balances, and execute trades using the preview/confirm flow. The buy/sell tools will now **work end-to-end** – for example, after a user says "Buy 0.05 SOL of CLANKER," the assistant can autonomously: find the token, identify the wallet, preview the purchase, get confirmation, and then execute the buy, finally confirming to the user that the transaction is complete.

With these corrections, your voice trading assistant will be much closer to the vision of a **fully conversational, MCP-driven agent**. It will leverage the latest OpenAI Realtime API capabilities correctly, avoid tool-call errors, and provide a fluid trading experience.

[\[1\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L1105-L1113) [\[7\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L765-L769) [\[11\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L766-L769) [\[13\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L980-L990) [\[16\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L1086-L1095) [\[17\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L986-L990) [\[18\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html#L780-L788) agent-live.html

<https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/public/agent-live.html>

[\[2\]](https://github.com/craigsdennis/talk-to-javascript-openai-workers/blob/8100e2ca70a6e7b223027fca46bffd0edefaa0a5/public/script.js#L122-L130) script.js

<https://github.com/craigsdennis/talk-to-javascript-openai-workers/blob/8100e2ca70a6e7b223027fca46bffd0edefaa0a5/public/script.js>

[\[3\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/prompts/system.domain/trading-execution.md#L6-L14) trading-execution.md

<https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/prompts/system.domain/trading-execution.md>

[\[4\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/core/tools.js#L520-L528) [\[5\]](https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/core/tools.js#L524-L532) tools.js

<https://github.com/BranchManager69/token-ai/blob/81f13354d1f0801db2107f95e5517fdae7d4c0a4/core/tools.js>

[\[6\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/mcp/tools/trading.mjs#L966-L974) [\[8\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/mcp/tools/trading.mjs#L976-L985) [\[9\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/mcp/tools/trading.mjs#L999-L1008) [\[10\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/mcp/tools/trading.mjs#L1005-L1013) trading.mjs

<https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/mcp/tools/trading.mjs>

[\[12\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/TOOLS-DOCUMENTATION.md#L79-L88) [\[19\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/TOOLS-DOCUMENTATION.md#L14-L22) [\[20\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/TOOLS-DOCUMENTATION.md#L77-L85) TOOLS-DOCUMENTATION.md

<https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/TOOLS-DOCUMENTATION.md>

[\[14\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/server.js#L773-L826) [\[15\]](https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/server.js#L827-L836) server.js

<https://github.com/BranchManager69/dexter/blob/cff4369c391faa9697678543a1a7213bf87f0589/token-ai/server.js>