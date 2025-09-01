// public/js/live/forms.js
// Form handling and validation functionality for Live UI

// Form state
let suggestIndex = -1; // Current active suggestion index
let suggestTimer = null;

// DOM elements
let runForm = null;
let mintInput = null;
let mintClear = null;
let runBtn = null;
let mintWrap = null;
let mintSuggest = null;

/**
 * Initialize forms functionality
 */
function initForms() {
  runForm = document.getElementById('runForm');
  mintInput = document.getElementById('mintInput');
  mintClear = document.getElementById('mintClear');
  runBtn = document.getElementById('runBtn');
  mintWrap = document.getElementById('mintWrap');
  
  // Create suggestions dropdown if it doesn't exist
  createSuggestionsDropdown();
  
  setupFormEventListeners();
  updateMintClear();
}

/**
 * Create suggestions dropdown
 */
function createSuggestionsDropdown() {
  mintSuggest = document.getElementById('mintSuggest');
  if (!mintSuggest && mintWrap) {
    mintSuggest = document.createElement('div');
    mintSuggest.id = 'mintSuggest';
    mintSuggest.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: #0f1117;
      border: 1px solid #1a1e27;
      border-top: none;
      border-radius: 0 0 6px 6px;
      max-height: 300px;
      overflow-y: auto;
      z-index: 1000;
      display: none;
    `;
    mintWrap.style.position = 'relative';
    mintWrap.appendChild(mintSuggest);
  }
}

/**
 * Update mint clear button visibility
 */
function updateMintClear() { 
  try { 
    const has = !!(mintInput && mintInput.value.trim()); 
    if (mintClear) {
      mintClear.style.display = has ? 'inline-block' : 'none'; 
      mintClear.disabled = !has; 
    }
  } catch {} 
}

/**
 * Clear mint input
 */
function doClear(e) { 
  try { 
    if (e) { 
      e.preventDefault(); 
      e.stopPropagation(); 
    } 
    if (mintInput) {
      mintInput.value = ''; 
      mintInput.dispatchEvent(new Event('input', { bubbles: true })); 
    }
    updateMintClear(); 
    if (mintSuggest) { 
      mintSuggest.style.display = 'none'; 
      mintSuggest.innerHTML = ''; 
    } 
    setTimeout(() => mintInput && mintInput.focus(), 0); 
  } catch {} 
}

/**
 * Get datalist options
 */
function datalistOptions() {
  const dl = document.getElementById('mintPresets');
  if (!dl) return [];
  return Array.from(dl.querySelectorAll('option'))
    .map(o => ({ 
      value: o.value || '', 
      label: o.label || (o.value || '').slice(0, 8) + '…' 
    }))
    .filter(x => x.value);
}

/**
 * Check if suggestions are visible
 */
function suggestionsVisible() { 
  return mintSuggest && mintSuggest.style.display !== 'none' && mintSuggest.innerHTML.trim() !== ''; 
}

/**
 * Get all suggestion items
 */
function suggestItems() { 
  return mintSuggest ? Array.from(mintSuggest.querySelectorAll('.item')) : []; 
}

/**
 * Set active suggestion
 */
function setSuggestActive(idx) {
  const items = suggestItems();
  items.forEach(el => el.classList.remove('active'));
  if (!items.length) { 
    suggestIndex = -1; 
    return; 
  }
  if (idx < 0) idx = 0;
  if (idx >= items.length) idx = items.length - 1;
  suggestIndex = idx;
  const el = items[idx];
  if (el) { 
    el.classList.add('active'); 
    try { 
      el.scrollIntoView({ block: 'nearest' }); 
    } catch {} 
  }
}

/**
 * Pick active suggestion
 */
function pickSuggestActive() {
  const items = suggestItems();
  const el = (suggestIndex >= 0 && suggestIndex < items.length) ? items[suggestIndex] : null;
  const v = el ? (el.getAttribute('data-v') || '') : '';
  if (v && mintInput) { 
    mintInput.value = v; 
    hideSuggestionsSoon(); 
  }
}

/**
 * Hide suggestions with delay
 */
function hideSuggestionsSoon() { 
  setTimeout(() => { 
    if (mintSuggest) mintSuggest.style.display = 'none'; 
  }, 120); 
}

/**
 * Position suggestions dropdown
 */
function positionSuggest() {
  if (!mintSuggest || !mintWrap) return;
  try {
    const rect = mintWrap.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    if (spaceBelow < 200 && spaceAbove > spaceBelow) {
      // Show above
      mintSuggest.style.top = 'auto';
      mintSuggest.style.bottom = '100%';
      mintSuggest.style.borderRadius = '6px 6px 0 0';
    } else {
      // Show below (default)
      mintSuggest.style.top = '100%';
      mintSuggest.style.bottom = 'auto';
      mintSuggest.style.borderRadius = '0 0 6px 6px';
    }
  } catch {}
}

/**
 * Check if target is inside suggestions or input
 */
function isInsideSuggestOrInput(target) { 
  try { 
    return (mintSuggest && mintSuggest.contains(target)) || (mintWrap && mintWrap.contains(target)); 
  } catch { 
    return false; 
  } 
}

/**
 * Render mint suggestions
 */
async function renderMintSuggestions(filter) {
  if (!mintSuggest) return;
  
  const opts = datalistOptions();
  const q = String(filter || '').toLowerCase();
  const list = q ? opts.filter(o => 
    o.value.toLowerCase().includes(q) || (o.label || '').toLowerCase().includes(q)
  ) : opts.slice();
  
  if (!list.length) { 
    mintSuggest.style.display = 'none'; 
    mintSuggest.innerHTML = ''; 
    return; 
  }
  
  mintSuggest.innerHTML = list.map(o => {
    const addrShort = `${o.value.slice(0, 8)}…${o.value.slice(-4)}`;
    const symInit = o.label || '—';
    return `<div class="item" data-v="${o.value}" style="padding:4px 8px;cursor:pointer;border-bottom:1px solid #121521;font-size:12px;line-height:1.25">`
      + `<div class="t1" style="display:flex;align-items:center;gap:6px"><span class="sym" style="font-weight:600">${symInit}</span> <span class="nm" style="color:#c8d1dc"></span><span class="mx" style="margin-left:auto;color:#98a6b3;font-size:10px"></span></div>`
      + `<div class="t2" style="color:#98a6b3;font-size:11px">${addrShort}</div>`
      + `</div>`;
  }).join('');
  
  // Add event listeners
  Array.from(mintSuggest.querySelectorAll('.item')).forEach(el => {
    el.addEventListener('mousedown', (e) => { // mousedown to beat blur
      e.preventDefault(); 
      const v = el.getAttribute('data-v') || ''; 
      if (mintInput) mintInput.value = v; 
      hideSuggestionsSoon();
    });
    // Hover marks active for keyboard clarity
    el.addEventListener('mouseover', () => setSuggestActive(Array.from(mintSuggest.querySelectorAll('.item')).indexOf(el)));
  });
  
  // Enrich with symbol/name asynchronously
  Array.from(mintSuggest.querySelectorAll('.item')).forEach(async (el) => {
    const mint = el.getAttribute('data-v') || '';
    if (!mint) return;
    if (window.LiveMarket && window.LiveMarket.mintMetaCache) {
      if (!window.LiveMarket.mintMetaCache.has(mint)) {
        await window.LiveMarket.fetchMintMeta(mint);
      }
      window.LiveMarket.applyMintMetaToItem(el, mint);
    }
  });
  
  mintSuggest.style.display = 'block';
  positionSuggest();
  suggestIndex = -1;
}

/**
 * Remote search augmentation
 */
async function augmentSuggestionsRemote() {
  if (!mintInput || !mintSuggest) return;
  
  const q = String(mintInput.value || '').toLowerCase();
  if (!q || q.length < 2) return;
  
  try {
    // Use the resolver endpoint with proper scoring
    const r = await fetch(window.LiveUtils.api('/realtime/tool-call'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'resolve_token',
        args: { query: q, chain: 'solana', limit: 8 }
      })
    });
    const result = await r.json().catch(() => ({ ok: false }));
    
    let remote = [];
    if (result.ok && Array.isArray(result.results)) {
      // Use resolver's ranked results with confidence scores
      remote = result.results.map(token => ({
        value: token.address,
        label: token.symbol,
        confidence: token.confidence,
        quoteLiq: token.quote_liquidity_usd,
        volume: token.volume_24h,
        isScam: token.is_likely_scam
      }));
    } else {
      // Fallback to DexScreener if resolver fails
      const r2 = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`);
      const jj = await r2.json().catch(() => ({}));
      const pairs = Array.isArray(jj?.pairs) ? jj.pairs : [];
      const m = new Map();
      for (const p of pairs) {
        if ((p?.chainId || '').toLowerCase() !== 'solana') continue;
        const base = p.baseToken || p.base || null;
        if (!base?.address) continue;
        const addr = String(base.address);
        const liq = Number(p?.liquidity?.usd || 0) || 0;
        const rec = m.get(addr) || { value: addr, label: (base.symbol || '').toUpperCase(), liq: 0 };
        rec.liq += liq; 
        m.set(addr, rec);
      }
      remote = Array.from(m.values()).sort((a, b) => b.liq - a.liq).slice(0, 8);
    }
    
    // Merge with local datalist results
    const opts = datalistOptions();
    const local = q ? opts.filter(o => 
      o.value.toLowerCase().includes(q) || (o.label || '').toLowerCase().includes(q)
    ) : opts.slice();
    const seen = new Set();
    const combined = [];
    for (const it of remote) { 
      if (!seen.has(it.value)) { 
        combined.push(it); 
        seen.add(it.value); 
      } 
    }
    for (const it of local) { 
      if (!seen.has(it.value)) { 
        combined.push(it); 
        seen.add(it.value); 
      } 
    }
    
    // Re-render suggestions with confidence/liquidity indicators
    mintSuggest.innerHTML = combined.slice(0, 20).map(o => {
      const addrShort = `${o.value.slice(0, 8)}…${o.value.slice(-4)}`;
      const symInit = o.label || '—';
      // Show confidence or liquidity info
      let extra = '';
      if (o.confidence !== undefined) {
        extra = `${o.confidence}%`;
        if (o.quoteLiq) {
          const liq = o.quoteLiq >= 1000 ? `$${(o.quoteLiq / 1000).toFixed(0)}k` : `$${o.quoteLiq.toFixed(0)}`;
          extra += ` • ${liq}`;
        }
      }
      return `<div class="item" data-v="${o.value}" style="padding:4px 8px;cursor:pointer;border-bottom:1px solid #121521;font-size:12px;line-height:1.25">`
        + `<div class="t1" style="display:flex;align-items:center;gap:6px"><span class="sym" style="font-weight:600">${symInit}</span> <span class="nm" style="color:#c8d1dc"></span><span class="mx" style="margin-left:auto;color:#98a6b3;font-size:10px">${extra}</span></div>`
        + `<div class="t2" style="color:#98a6b3;font-size:11px">${addrShort}</div>`
        + `</div>`;
    }).join('');
    
    Array.from(mintSuggest.querySelectorAll('.item')).forEach(el => {
      el.addEventListener('mousedown', (e) => { 
        e.preventDefault(); 
        const v = el.getAttribute('data-v') || ''; 
        if (mintInput) mintInput.value = v; 
        hideSuggestionsSoon(); 
      });
    });
    Array.from(mintSuggest.querySelectorAll('.item')).forEach((el, idx) => 
      el.addEventListener('mouseover', () => setSuggestActive(idx))
    );
    Array.from(mintSuggest.querySelectorAll('.item')).forEach(async (el) => { 
      const mint = el.getAttribute('data-v') || ''; 
      if (!mint) return; 
      if (window.LiveMarket && window.LiveMarket.mintMetaCache) {
        if (!window.LiveMarket.mintMetaCache.has(mint)) {
          await window.LiveMarket.fetchMintMeta(mint);
        }
        window.LiveMarket.applyMintMetaToItem(el, mint);
      }
    });
    
    mintSuggest.style.display = 'block';
    positionSuggest();
    suggestIndex = -1;
  } catch {}
}

/**
 * Schedule suggestions
 */
function scheduleSuggest() { 
  try { 
    clearTimeout(suggestTimer); 
    suggestTimer = setTimeout(async () => { 
      if (mintInput) {
        await renderMintSuggestions(mintInput.value); 
        await augmentSuggestionsRemote(); 
      }
    }, 150); 
  } catch {} 
}

/**
 * Handle form submission
 */
async function handleFormSubmit(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  
  if (!mintInput || !mintInput.value.trim()) {
    window.LiveUtils.showToast('Enter a mint address');
    return false;
  }
  
  const mint = mintInput.value.trim();
  
  // Create run using runs module
  if (window.LiveRuns?.createRun) {
    const success = await window.LiveRuns.createRun(mint);
    if (success) {
      mintInput.value = '';
      updateMintClear();
      if (mintSuggest) {
        mintSuggest.style.display = 'none';
        mintSuggest.innerHTML = '';
      }
    }
    return success;
  }
  
  return false;
}

/**
 * Setup form event listeners
 */
function setupFormEventListeners() {
  try {
    // Form submission
    if (runForm) {
      runForm.addEventListener('submit', handleFormSubmit);
    }
    if (runBtn) {
      runBtn.addEventListener('click', handleFormSubmit);
    }
    
    // Mint input events
    if (mintInput) {
      mintInput.addEventListener('input', () => {
        updateMintClear();
        scheduleSuggest();
      });
      
      mintInput.addEventListener('focus', () => {
        renderMintSuggestions(mintInput.value); 
        positionSuggest(); 
      });
      
      mintInput.addEventListener('click', () => {
        renderMintSuggestions(mintInput.value); 
        positionSuggest(); 
      });
      
      mintInput.addEventListener('paste', (e) => { 
        setTimeout(() => {
          updateMintClear();
          scheduleSuggest();
        }, 10);
      });
      
      mintInput.addEventListener('blur', hideSuggestionsSoon);
      
      mintInput.addEventListener('keydown', (e) => {
        // Escape: clear & close
        if (e.key === 'Escape') {
          e.stopPropagation(); 
          e.preventDefault();
          mintInput.value = ''; 
          updateMintClear();
          if (mintSuggest) { 
            mintSuggest.style.display = 'none'; 
            mintSuggest.innerHTML = ''; 
          }
          return;
        }
        
        // Keyboard navigation in suggestions
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          if (!suggestionsVisible()) { 
            renderMintSuggestions(mintInput.value); 
            return; 
          }
          e.preventDefault();
          const items = suggestItems();
          if (!items.length) return;
          if (e.key === 'ArrowDown') {
            setSuggestActive(suggestIndex < 0 ? 0 : suggestIndex + 1);
          }
          if (e.key === 'ArrowUp') {
            setSuggestActive(suggestIndex < 0 ? items.length - 1 : suggestIndex - 1);
          }
          return;
        }
        
        if (e.key === 'Enter') {
          if (suggestionsVisible()) {
            e.preventDefault(); 
            pickSuggestActive();
          }
        }
      });
    }
    
    // Clear button events
    if (mintClear) {
      // Use multiple event types to ensure clearing works
      try { 
        mintClear.addEventListener('pointerdown', doClear, { capture: true }); 
      } catch {}
      mintClear.addEventListener('mousedown', doClear, { capture: true });
      mintClear.addEventListener('touchstart', doClear, { passive: true, capture: true });
      mintClear.addEventListener('click', doClear, { capture: true });
    }
    
    // Close suggestions on outside click
    document.addEventListener('mousedown', (e) => { 
      if (!isInsideSuggestOrInput(e.target)) { 
        hideSuggestionsSoon(); 
      } 
    }, true);
    
    document.addEventListener('touchstart', (e) => { 
      if (!isInsideSuggestOrInput(e.target)) { 
        hideSuggestionsSoon(); 
      } 
    }, { passive: true, capture: true });
    
    // Reposition on window events
    window.addEventListener('resize', positionSuggest);
    window.addEventListener('scroll', positionSuggest, { passive: true });
    
  } catch {}
}

// Export forms functionality
window.LiveForms = {
  suggestIndex,
  updateMintClear,
  renderMintSuggestions,
  augmentSuggestionsRemote,
  scheduleSuggest,
  handleFormSubmit,
  setSuggestActive,
  pickSuggestActive,
  suggestionsVisible,
  hideSuggestionsSoon,
  init: initForms
};