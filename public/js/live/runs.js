// public/js/live/runs.js
// Agent run management functionality for Live UI

// Run state
const activeRuns = new Map();
let RUN_LIMIT_HINT = 3;

// DOM elements
let runsbar = null;
let nowTag = null;

/**
 * Initialize runs functionality
 */
function initRuns() {
  runsbar = document.getElementById('runsbar');
  nowTag = document.getElementById('now');
  
  // Start polling for runs status
  pollRuns();
}

/**
 * Render runs counter
 */
function renderRuns() { 
  try { 
    if (runsbar) {
      runsbar.textContent = 'Active: ' + activeRuns.size + '/' + RUN_LIMIT_HINT; 
    }
  } catch {} 
  try { 
    renderNow(); 
  } catch {} 
}

/**
 * Render current time
 */
function renderNow() {
  try {
    if (nowTag) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      nowTag.textContent = timeStr;
    }
  } catch {}
}

/**
 * Create a new run
 */
async function createRun(mint) {
  try {
    if (!mint || !mint.trim()) {
      window.LiveUtils.showToast('Enter a mint address');
      return false;
    }

    // Check if run already exists for this mint
    for (const [pid, runData] of activeRuns) {
      if (runData.mint === mint.trim()) {
        window.LiveUtils.showToast('Run already active for this mint');
        return false;
      }
    }

    const hdr = { 'content-type': 'application/json' };
    if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN);
    if (window.X_USER_TOKEN) hdr['x-user-token'] = String(window.X_USER_TOKEN);

    // Create new analysis run
    const url = new URL(window.location.href);
    url.pathname = '/runs';
    
    const r = await fetch(url.toString(), {
      method: 'POST',
      headers: hdr,
      body: JSON.stringify({ 
        mint: mint.trim(),
        type: 'agent',
        quick: true // Use quick flags by default
      })
    });

    // Log the actual response for debugging
    const responseText = await r.text();
    console.log('Run response status:', r.status);
    console.log('Run response text:', responseText);
    
    let j;
    try {
      j = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse response:', parseError);
      console.error('Raw response:', responseText);
      window.LiveUtils.showToast('Invalid server response - check console');
      return false;
    }
    
    if (j.ok && j.pid) {
      // Add to active runs
      activeRuns.set(j.pid, {
        mint: mint.trim(),
        type: 'agent',
        startedAt: Date.now(),
        pid: j.pid
      });
      
      renderRuns();
      window.LiveUtils.showToast('Analysis started');
      
      // Trigger panel creation if panels module is available
      if (window.LivePanels?.createRun) {
        window.LivePanels.createRun(mint.trim(), j.pid);
      }
      
      return true;
    } else {
      console.error('Run failed:', j);
      window.LiveUtils.showToast('Failed to start: ' + (j.error || JSON.stringify(j)));
      return false;
    }
  } catch (e) {
    console.error('Create run error:', e);
    window.LiveUtils.showToast('Error starting analysis');
    return false;
  }
}

/**
 * Kill a run by PID
 */
async function killRun(pid) {
  try {
    if (!pid) return false;
    
    const url = new URL(window.location.href);
    url.pathname = `/runs/${pid}`;
    
    const r = await fetch(url.toString(), { method: 'DELETE' });
    const j = await r.json().catch(() => ({ ok: false }));
    
    if (j.ok) {
      activeRuns.delete(pid);
      renderRuns();
      window.LiveUtils.showToast('Run killed');
      return true;
    } else {
      window.LiveUtils.showToast('Kill failed: ' + (j.error || 'Unknown error'));
      return false;
    }
  } catch (e) {
    console.error('Kill run error:', e);
    window.LiveUtils.showToast('Error killing run');
    return false;
  }
}

/**
 * Poll for active runs status
 */
async function pollRuns() {
  try {
    const url = new URL(window.location.href);
    url.pathname = '/runs';
    
    const r = await fetch(url.toString());
    const j = await r.json().catch(() => ({ ok: false, active: [] }));
    
    if (j.ok && Array.isArray(j.active)) {
      // Update active runs map
      const newActiveRuns = new Map();
      
      for (const run of j.active) {
        if (run.pid && run.mint) {
          const existing = activeRuns.get(run.pid);
          newActiveRuns.set(run.pid, {
            mint: run.mint,
            type: run.type || 'agent',
            startedAt: existing?.startedAt || Date.now(),
            pid: run.pid,
            phase: run.phase || 'running'
          });
        }
      }
      
      // Check for completed runs
      for (const [pid, runData] of activeRuns) {
        if (!newActiveRuns.has(pid)) {
          // Run completed, notify panels if available
          if (window.LivePanels?.onRunCompleted) {
            window.LivePanels.onRunCompleted(pid, runData.mint);
          }
        }
      }
      
      // Update the active runs map
      activeRuns.clear();
      for (const [pid, runData] of newActiveRuns) {
        activeRuns.set(pid, runData);
      }
      
      renderRuns();
    }
  } catch (e) {
    console.error('Poll runs error:', e);
  }
  
  // Schedule next poll
  setTimeout(pollRuns, 5000); // Poll every 5 seconds
}

/**
 * Get active run for a mint
 */
function getRunForMint(mint) {
  if (!mint) return null;
  
  for (const [pid, runData] of activeRuns) {
    if (runData.mint === mint.trim()) {
      return { pid, ...runData };
    }
  }
  return null;
}

/**
 * Check if mint has active run
 */
function hasActiveRun(mint) {
  return getRunForMint(mint) !== null;
}

/**
 * Get all active runs as array
 */
function getAllActiveRuns() {
  return Array.from(activeRuns.entries()).map(([pid, runData]) => ({
    pid,
    ...runData
  }));
}

// Export runs functionality
window.LiveRuns = {
  activeRuns,
  RUN_LIMIT_HINT,
  createRun,
  killRun,
  renderRuns,
  renderNow,
  getRunForMint,
  hasActiveRun,
  getAllActiveRuns,
  init: initRuns
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRuns);
} else {
  initRuns();
}