# Agent-Focused UI Improvements for Live Trenching

## Ranked by Implementation Score (Ease × Impact)

### 🥇 Score: 95/100 - Decision points highlight
- **Ease**: Just highlight existing log lines that contain "BUY", "SELL", "SKIP" with bright colors/animations
- **Impact**: HUGE - instantly see what matters most
- **Risk**: Zero - pure CSS/display change

### 🥈 Score: 90/100 - Cost meter  
- **Ease**: Server already tracks API calls, just sum and display running total
- **Impact**: Critical for budget awareness, prevents surprises
- **Risk**: Read-only display, can't break anything

### 🥉 Score: 85/100 - Tool call queue visualization
- **Ease**: Already logging tool_call events, just need to show pending vs completed
- **Impact**: See parallelization actually working (or not)
- **Risk**: Display only, uses existing event stream

### Score: 80/100 - API rate limit indicators
- **Ease**: Add counters to existing API calls, show remaining
- **Impact**: Prevent mysterious failures, know when to slow down
- **Risk**: Read-only metrics display

### Score: 75/100 - Confidence meters
- **Ease**: Extract confidence scores from agent responses (often already there)
- **Impact**: Know when agent is guessing vs certain
- **Risk**: Display only, no system changes

### Score: 70/100 - Bottleneck detection
- **Ease**: Timer on each phase (already have some), highlight slowest
- **Impact**: Immediately see what needs optimization
- **Risk**: Just timing display

### Score: 65/100 - Auto-retry visualization
- **Ease**: Hook into existing retry logic, show attempt counter
- **Impact**: Understand delays, see resilience in action
- **Risk**: Read-only visualization

### Score: 60/100 - Error pattern detection
- **Ease**: Keep error history, highlight repeats
- **Impact**: Spot systematic issues quickly
- **Risk**: Just pattern matching on display

### Score: 55/100 - Circuit breaker status
- **Ease**: If circuit breakers exist, show their state
- **Impact**: Know which services are down
- **Risk**: Display of existing state

### Score: 50/100 - Agent health/stuck detection
- **Ease**: Timeout timers on phases, highlight if stuck
- **Impact**: Know when to kill/restart
- **Risk**: Detection only, no auto-intervention

### Score: 45/100 - Parallel execution viewer
- **Ease**: Timeline view of overlapping operations
- **Impact**: See actual parallelization
- **Risk**: Complex UI but read-only

### Score: 40/100 - Live reasoning trace
- **Ease**: Need agent to emit reasoning (may need agent changes)
- **Impact**: Amazing insight but requires agent cooperation
- **Risk**: Depends on agent modifications

### Score: 35/100 - Fallback path display
- **Ease**: Need to track Plan A vs Plan B execution
- **Impact**: Good for understanding robustness
- **Risk**: Requires fallback detection logic

### Score: 30/100 - Resource competition
- **Ease**: Track which agent uses what (complex state)
- **Impact**: Useful for multi-agent but complex
- **Risk**: New tracking system needed

### Score: 25/100 - Socials deep-dive trigger
- **Ease**: New button that sends commands to agent
- **Impact**: Great feature but bidirectional
- **Risk**: Can affect running analyses

### Score: 20/100 - Agent spawn tree
- **Ease**: Need parent-child tracking across spawns
- **Impact**: Cool but requires architecture changes
- **Risk**: Complex state management

### Score: 15/100 - Inter-agent messaging
- **Ease**: Need message bus between agents
- **Impact**: Powerful but needs agent redesign
- **Risk**: Major architectural change

### Score: 10/100 - Comparison mode
- **Ease**: Run multiple analyses simultaneously (resource intensive)
- **Impact**: Great for testing but expensive
- **Risk**: Could overload system

### Score: 8/100 - Manual intervention points
- **Ease**: Pause/resume agent mid-flow (very complex)
- **Impact**: Powerful but dangerous
- **Risk**: Could break analysis state

### Score: 5/100 - A/B testing display
- **Ease**: Need entire A/B infrastructure
- **Impact**: Great for optimization but massive project
- **Risk**: Complex system-wide changes