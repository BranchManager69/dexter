// public/js/live/main.js
// Main initialization and coordination for Live UI modular architecture

/**
 * Initialize all Live UI modules
 */
function initializeLiveUI() {
  console.log('Initializing Live UI modules...');
  
  try {
    // Initialize modules in dependency order
    
    // 1. Initialize utilities first (no dependencies)
    if (window.LiveUtils?.detectApiBase) {
      console.log('✓ Utils module loaded');
    } else {
      console.warn('⚠ Utils module not loaded');
    }
    
    // 2. Initialize debug module (depends on utils)
    if (window.LiveDebug?.init) {
      window.LiveDebug.init();
      console.log('✓ Debug module initialized');
    } else {
      console.warn('⚠ Debug module not loaded');
    }
    
    // 3. Initialize market module (depends on utils)
    if (window.LiveMarket?.init) {
      window.LiveMarket.init();
      console.log('✓ Market module initialized');
    } else {
      console.warn('⚠ Market module not loaded');
    }
    
    // 4. Initialize tools module (depends on utils, debug, voice for DC access)
    if (window.LiveTools) {
      console.log('✓ Tools module loaded');
    } else {
      console.warn('⚠ Tools module not loaded');
    }
    
    // 5. Initialize voice module (depends on utils, debug, tools)
    if (window.LiveVoice?.init) {
      window.LiveVoice.init();
      console.log('✓ Voice module initialized');
    } else {
      console.warn('⚠ Voice module not loaded');
    }
    
    // 6. Initialize wallets module (depends on utils)
    if (window.LiveWallets?.init) {
      window.LiveWallets.init();
      console.log('✓ Wallets module initialized');
    } else {
      console.warn('⚠ Wallets module not loaded');
    }
    
    // 7. Initialize panels module (depends on utils, market for sparklines)
    if (window.LivePanels?.init) {
      window.LivePanels.init();
      console.log('✓ Panels module initialized');
    } else {
      console.warn('⚠ Panels module not loaded');
    }
    
    // 8. Initialize runs module (depends on utils, panels for creating runs)
    if (window.LiveRuns?.init) {
      window.LiveRuns.init();
      console.log('✓ Runs module initialized');
    } else {
      console.warn('⚠ Runs module not loaded');
    }
    
    // 9. Initialize forms module (depends on utils, market for suggestions, runs for submission)
    if (window.LiveForms?.init) {
      window.LiveForms.init();
      console.log('✓ Forms module initialized');
    } else {
      console.warn('⚠ Forms module not loaded');
    }
    
    // 10. Setup global event handlers
    setupGlobalEventHandlers();
    
    // 11. Start periodic tasks
    startPeriodicTasks();
    
    console.log('🚀 Live UI initialization complete');
    
    // Dispatch initialization complete event
    window.dispatchEvent(new CustomEvent('ai:live-ui-ready'));
    
  } catch (error) {
    console.error('❌ Error during Live UI initialization:', error);
  }
}

/**
 * Setup global event handlers
 */
function setupGlobalEventHandlers() {
  try {
    // Handle debug load button if present
    const debugLoadBtn = document.getElementById('debugLoadBtn');
    if (debugLoadBtn) {
      debugLoadBtn.addEventListener('click', async () => {
        try {
          const hdr = {};
          if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN);
          if (window.X_USER_TOKEN) hdr['x-user-token'] = String(window.X_USER_TOKEN);
          
          const r = await fetch(window.LiveUtils.api('/realtime/debug-log'), { headers: hdr });
          const j = await r.json().catch(() => ({ ok: false }));
          
          // Accept either {lines:[]} or {items:[]} shapes
          const arr = Array.isArray(j?.lines) ? j.lines : (Array.isArray(j?.items) ? j.items : []);
          if (j.ok && Array.isArray(arr)) {
            // Display debug logs
            const lines = arr.slice(-50); // Show last 50
            const text = lines.map(l => `[${l.t||''}] ${(l.level||'').toUpperCase()} ${l.msg||''}`).join('\n');
            
            // Create or update debug display
            let debugDisplay = document.getElementById('debugDisplay');
            if (!debugDisplay) {
              debugDisplay = document.createElement('pre');
              debugDisplay.id = 'debugDisplay';
              debugDisplay.style.cssText = 'background:#0f1117;color:#e6edf3;padding:12px;border:1px solid #1a1e27;border-radius:6px;font-size:11px;line-height:1.4;max-height:300px;overflow:auto;margin:8px 0;white-space:pre-wrap;';
              debugLoadBtn.parentNode.insertBefore(debugDisplay, debugLoadBtn.nextSibling);
            }
            debugDisplay.textContent = text;
            
            window.LiveUtils.showToast('Debug logs loaded');
          } else {
            window.LiveUtils.showToast('Failed to load debug logs');
          }
        } catch {
          window.LiveUtils.showToast('Error loading debug logs');
        }
      });
    }
    
    // Setup API base detection event handler
    window.addEventListener('ai:api-base-detected', (e) => {
      if (window.LiveDebug?.vd) {
        window.LiveDebug.vd.add('frame', 'API base detected', { base: e.detail?.base || '/' });
      }
    });
    
    // Handle keyboard shortcuts globally
    document.addEventListener('keydown', (e) => {
      // Don't interfere with form inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      // ESC - Close any open overlays
      if (e.key === 'Escape') {
        // Close wallets overlay
        const walletsOverlay = document.getElementById('walletsOverlay');
        if (walletsOverlay && walletsOverlay.style.display !== 'none') {
          walletsOverlay.style.display = 'none';
          e.preventDefault();
          return;
        }
        
        // Close other overlays as needed
      }
    });
    
  } catch (error) {
    console.warn('Error setting up global event handlers:', error);
  }
}

/**
 * Start periodic tasks
 */
function startPeriodicTasks() {
  try {
    // Update time display every second
    setInterval(() => {
      if (window.LiveRuns?.renderNow) {
        window.LiveRuns.renderNow();
      }
    }, 1000);
    
    // Additional periodic tasks can be added here
    
  } catch (error) {
    console.warn('Error starting periodic tasks:', error);
  }
}

/**
 * Check if DOM is ready and initialize
 */
function checkDOMAndInitialize() {
  if (document.readyState === 'loading') {
    // DOM is still loading, wait for it
    document.addEventListener('DOMContentLoaded', initializeLiveUI);
  } else {
    // DOM is already loaded, initialize immediately
    initializeLiveUI();
  }
}

/**
 * Graceful shutdown (cleanup)
 */
function shutdownLiveUI() {
  try {
    // Stop voice connection
    if (window.LiveVoice?.stopVoice) {
      window.LiveVoice.stopVoice();
    }
    
    // Clear any running timers
    if (window.LivePanels?.panels) {
      for (const [key, panel] of window.LivePanels.panels) {
        if (panel.collapse) {
          panel.collapse();
        }
      }
    }
    
    // Clear debug timers
    if (window.LiveDebug?.vd?._ft) {
      clearTimeout(window.LiveDebug.vd._ft);
    }
    
    console.log('Live UI shutdown complete');
  } catch (error) {
    console.warn('Error during Live UI shutdown:', error);
  }
}

/**
 * Handle page visibility changes
 */
function handleVisibilityChange() {
  try {
    if (document.hidden) {
      // Page is hidden, potentially pause some activities
      if (window.LiveDebug?.vd) {
        window.LiveDebug.vd.add('frame', 'page hidden');
      }
    } else {
      // Page is visible, resume activities
      if (window.LiveDebug?.vd) {
        window.LiveDebug.vd.add('frame', 'page visible');
      }
    }
  } catch (error) {
    console.warn('Error handling visibility change:', error);
  }
}

/**
 * Handle page unload
 */
function handlePageUnload() {
  shutdownLiveUI();
}

// Setup event listeners for lifecycle events
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('beforeunload', handlePageUnload);
window.addEventListener('pagehide', handlePageUnload);

// Initialize when DOM is ready
checkDOMAndInitialize();

// Export main functionality
window.LiveMain = {
  initializeLiveUI,
  shutdownLiveUI,
  setupGlobalEventHandlers,
  startPeriodicTasks
};
