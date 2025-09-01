// public/js/live/wallets.js
// Wallet management functionality for Live UI

// Wallet state
const wallets = { 
  list: [], 
  defaultId: null, 
  aliases: [] 
};

// DOM elements
let walletsBtn = null;
let walletsOverlay = null;
let walletListEl = null;
let walletDefaultTag = null;

/**
 * Initialize wallet functionality
 */
function initWallets() {
  walletsBtn = document.getElementById('walletsBtn');
  walletsOverlay = document.getElementById('walletsOverlay');
  walletListEl = document.getElementById('walletList');
  walletDefaultTag = document.getElementById('walletDefaultTag');
  
  setupWalletEventListeners();
}

/**
 * Refresh wallets data from server
 */
async function refreshWallets() {
  try {
    const hdr = {}; 
    if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN); 
    if (window.X_USER_TOKEN) hdr['x-user-token'] = String(window.X_USER_TOKEN);
    
    const [rList, rDef, rAliases] = await Promise.all([
      fetch(window.LiveUtils.api('/managed-wallets'), { headers: hdr }),
      fetch(window.LiveUtils.api('/managed-wallets/default'), { headers: hdr }),
      fetch(window.LiveUtils.api('/managed-wallets/aliases'), { headers: hdr })
    ]);
    
    const jl = await rList.json().catch(() => ({}));
    const jd = await rDef.json().catch(() => ({}));
    const ja = await rAliases.json().catch(() => ({}));
    
    wallets.list = Array.isArray(jl?.wallets) ? jl.wallets : [];
    wallets.defaultId = jd?.wallet_id || null;
    wallets.aliases = Array.isArray(ja?.items) ? ja.items : [];
    
    renderWalletHeader();
    renderWalletOverlay();
  } catch {}
}

/**
 * Render wallet header button
 */
function renderWalletHeader() {
  try {
    if (!walletsBtn) return;
    const d = wallets.list.find(w => String(w.id) === String(wallets.defaultId));
    const alias = (wallets.aliases || []).find(a => String(a.wallet_id) === String(wallets.defaultId));
    const label = alias ? `${alias.alias} (${window.LiveUtils.shortPk(d?.public_key || '')})` : (d ? (d.wallet_name || window.LiveUtils.shortPk(d.public_key)) : '—');
    walletsBtn.textContent = d ? `Wallets: ${label}` : 'Wallets';
    if (walletDefaultTag) {
      walletDefaultTag.textContent = `Default: ${d ? (d.wallet_name || window.LiveUtils.shortPk(d.public_key)) : '—'}`;
    }
  } catch {}
}

/**
 * Render wallet overlay content
 */
function renderWalletOverlay() {
  try {
    if (!walletListEl) return;
    
    walletListEl.innerHTML = '';
    
    // Inline alias manager
    const aliasBox = document.createElement('div'); 
    aliasBox.style.border = '1px solid #1a1e27'; 
    aliasBox.style.borderRadius = '6px'; 
    aliasBox.style.padding = '8px'; 
    aliasBox.style.marginBottom = '8px';
    
    const aliasTitle = document.createElement('div'); 
    aliasTitle.textContent = 'Aliases'; 
    aliasTitle.style.fontSize = '12px'; 
    aliasTitle.style.fontWeight = '600'; 
    aliasTitle.style.marginBottom = '6px'; 
    aliasBox.appendChild(aliasTitle);
    
    const aliasList = document.createElement('div'); 
    aliasList.style.display = 'grid'; 
    aliasList.style.gap = '6px';
    
    const byWallet = (id) => wallets.list.find(w => String(w.id) === String(id));
    
    const renderAliases = () => {
      aliasList.innerHTML = '';
      const arr = Array.isArray(wallets.aliases) ? wallets.aliases : [];
      if (!arr.length) { 
        const empty = document.createElement('div'); 
        empty.textContent = 'No aliases yet'; 
        empty.style.fontSize = '12px'; 
        empty.style.color = '#9fb2c8'; 
        aliasList.appendChild(empty); 
      }
      
      for (const a of arr) {
        const row = document.createElement('div'); 
        row.style.display = 'flex'; 
        row.style.alignItems = 'center'; 
        row.style.justifyContent = 'space-between';
        
        const left = document.createElement('div'); 
        left.style.fontSize = '12px'; 
        const w = byWallet(a.wallet_id); 
        const label = w ? (w.wallet_name || window.LiveUtils.shortPk(w.public_key)) : (a.wallet_id); 
        left.textContent = `${a.alias} → ${label}`; 
        row.appendChild(left);
        
        const del = document.createElement('button'); 
        del.className = 'vd-btn'; 
        del.textContent = 'Delete'; 
        del.addEventListener('click', async () => {
          try {
            const hdr = { 'content-type': 'application/json' }; 
            if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN); 
            if (window.X_USER_TOKEN) hdr['x-user-token'] = String(window.X_USER_TOKEN);
            const r = await fetch(window.LiveUtils.api('/managed-wallets/aliases'), { 
              method: 'DELETE', 
              headers: hdr, 
              body: JSON.stringify({ alias: a.alias }) 
            });
            const j = await r.json(); 
            if (j?.ok) { 
              window.LiveUtils.showToast('Alias deleted'); 
              await refreshWallets(); 
            } else { 
              window.LiveUtils.showToast('Delete failed'); 
            }
          } catch { 
            window.LiveUtils.showToast('Delete failed'); 
          }
        });
        row.appendChild(del);
        aliasList.appendChild(row);
      }
    };
    
    renderAliases();
    aliasBox.appendChild(aliasList);
    walletListEl.appendChild(aliasBox);
    
    // Wallet list
    for (const w of wallets.list) {
      const row = document.createElement('div');
      row.style.border = '1px solid #1a1e27'; 
      row.style.borderRadius = '6px'; 
      row.style.padding = '8px';
      
      const name = document.createElement('div'); 
      name.style.fontSize = '12px'; 
      name.style.fontWeight = '600'; 
      name.textContent = w.wallet_name || '(unnamed)'; 
      row.appendChild(name);
      
      const meta = document.createElement('div'); 
      meta.style.fontSize = '12px'; 
      meta.style.color = '#9fb2c8'; 
      meta.textContent = `${window.LiveUtils.shortPk(w.public_key)} • ${w.id}`; 
      row.appendChild(meta);
      
      const actions = document.createElement('div'); 
      actions.style.marginTop = '6px'; 
      actions.style.display = 'flex'; 
      actions.style.gap = '6px';
      
      // Set Default button
      const btnDefault = document.createElement('button'); 
      btnDefault.className = 'vd-btn'; 
      btnDefault.textContent = 'Set Default'; 
      btnDefault.addEventListener('click', async () => {
        try { 
          const hdr = { 'content-type': 'application/json' }; 
          if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN); 
          if (window.X_USER_TOKEN) hdr['x-user-token'] = String(window.X_USER_TOKEN); 
          const r = await fetch(window.LiveUtils.api('/managed-wallets/default'), { 
            method: 'POST', 
            headers: hdr, 
            body: JSON.stringify({ wallet_id: w.id }) 
          }); 
          const j = await r.json(); 
          if (j?.ok) { 
            wallets.defaultId = String(w.id); 
            renderWalletHeader(); 
            window.LiveUtils.showToast('Default wallet set'); 
          } else { 
            window.LiveUtils.showToast('Failed to set default'); 
          } 
        } catch {}
      });
      
      // Add Alias button
      const btnAlias = document.createElement('button'); 
      btnAlias.className = 'vd-btn'; 
      btnAlias.textContent = 'Add Alias'; 
      btnAlias.addEventListener('click', async () => {
        try {
          const alias = prompt('Enter alias for this wallet (e.g., "trading")');
          if (!alias) return;
          const hdr = { 'content-type': 'application/json' }; 
          if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN); 
          if (window.X_USER_TOKEN) hdr['x-user-token'] = String(window.X_USER_TOKEN);
          const r = await fetch(window.LiveUtils.api('/managed-wallets/aliases'), { 
            method: 'POST', 
            headers: hdr, 
            body: JSON.stringify({ wallet_id: w.id, alias: String(alias).trim() }) 
          });
          const j = await r.json();
          if (j?.ok) { 
            window.LiveUtils.showToast('Alias saved'); 
            try { 
              await refreshWallets(); 
            } catch {} 
          } else { 
            window.LiveUtils.showToast('Alias failed'); 
          }
        } catch {}
      });
      
      // Copy ID button
      const btnCopyId = document.createElement('button'); 
      btnCopyId.className = 'vd-btn'; 
      btnCopyId.textContent = 'Copy ID'; 
      btnCopyId.addEventListener('click', () => { 
        try { 
          navigator.clipboard.writeText(String(w.id)); 
          window.LiveUtils.showToast('Copied wallet id'); 
        } catch {} 
      });
      
      // Copy PK button
      const btnCopyPk = document.createElement('button'); 
      btnCopyPk.className = 'vd-btn'; 
      btnCopyPk.textContent = 'Copy PK'; 
      btnCopyPk.addEventListener('click', () => { 
        try { 
          navigator.clipboard.writeText(String(w.public_key)); 
          window.LiveUtils.showToast('Copied public key'); 
        } catch {} 
      });
      
      actions.appendChild(btnDefault); 
      actions.appendChild(btnAlias); 
      actions.appendChild(btnCopyId); 
      actions.appendChild(btnCopyPk); 
      row.appendChild(actions);
      walletListEl.appendChild(row);
    }
  } catch {}
}

/**
 * Setup wallet event listeners
 */
function setupWalletEventListeners() {
  try {
    if (walletsBtn && walletsOverlay) {
      walletsBtn.addEventListener('click', async () => { 
        if (walletsOverlay.style.display === 'none') { 
          await refreshWallets(); 
          walletsOverlay.style.display = 'block'; 
        } else { 
          walletsOverlay.style.display = 'none'; 
        } 
      });
    }
    
    const walletClose = document.getElementById('walletClose');
    if (walletClose && walletsOverlay) {
      walletClose.addEventListener('click', () => walletsOverlay.style.display = 'none');
    }
  } catch {}
}

// Export wallet functionality
window.LiveWallets = {
  wallets,
  refreshWallets,
  renderWalletHeader,
  renderWalletOverlay,
  init: initWallets
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWallets);
} else {
  initWallets();
}