// public/js/live/market.js
// Market data display functionality for Live UI

// Market data cache
const mintMetaCache = new Map();

// DOM elements for global market display
let fdvTag = null;
let liqTag = null;
let volTag = null;
let branchTag = null;
let riskTag = null;

/**
 * Initialize market functionality
 */
function initMarket() {
  fdvTag = document.getElementById('fdv');
  liqTag = document.getElementById('liq');
  volTag = document.getElementById('vol');
  branchTag = document.getElementById('branch');
  riskTag = document.getElementById('risk');
}

/**
 * Fetch mint metadata and cache it
 */
async function fetchMintMeta(mint) {
  if (!mint || mintMetaCache.has(mint)) return mintMetaCache.get(mint);
  
  try {
    const hdr = {};
    if (window.AGENT_TOKEN) hdr['x-agent-token'] = String(window.AGENT_TOKEN);
    if (window.X_USER_TOKEN) hdr['x-user-token'] = String(window.X_USER_TOKEN);
    
    const r = await fetch(window.LiveUtils.api(`/token-meta/${encodeURIComponent(mint)}`), { 
      headers: hdr,
      cache: 'force-cache' 
    });
    
    if (!r.ok) {
      mintMetaCache.set(mint, null);
      return null;
    }
    
    const meta = await r.json();
    mintMetaCache.set(mint, meta);
    return meta;
  } catch {
    mintMetaCache.set(mint, null);
    return null;
  }
}

/**
 * Apply mint metadata to suggestion item
 */
function applyMintMetaToItem(el, mint) {
  const meta = mintMetaCache.get(mint);
  if (!meta) return;
  
  try {
    const symEl = el.querySelector('.sym');
    const nmEl = el.querySelector('.nm');
    const mxEl = el.querySelector('.mx');
    
    if (symEl && meta.symbol) symEl.textContent = meta.symbol.toUpperCase();
    if (nmEl && meta.name) nmEl.textContent = meta.name;
    if (mxEl && meta.market_cap_usd) {
      const mc = Number(meta.market_cap_usd);
      const mcTxt = mc >= 1_000_000 ? `$${(mc / 1_000_000).toFixed(1)}M` : 
                   (mc >= 1_000 ? `$${(mc / 1_000).toFixed(0)}K` : `$${mc.toFixed(0)}`);
      mxEl.textContent = mcTxt;
    }
  } catch {}
}

/**
 * Update global market display
 */
function updateGlobalMarket(data) {
  try {
    if (fdvTag && data.fdv != null) {
      fdvTag.textContent = window.LiveUtils.fmtUSD(data.fdv);
    }
    if (liqTag && data.liquidity != null) {
      liqTag.textContent = window.LiveUtils.fmtUSD(data.liquidity);
    }
    if (volTag && data.volume24h != null) {
      volTag.textContent = window.LiveUtils.fmtUSD(data.volume24h);
    }
  } catch {}
}

/**
 * Update global scores display
 */
function updateGlobalScores(data) {
  try {
    if (branchTag && data.branchScore != null) {
      branchTag.textContent = `Branch: ${data.branchScore}`;
      branchTag.classList.remove('ok', 'warn', 'bad');
      const cls = getBadgeClassForScore(data.branchScore, 'branch');
      if (cls) branchTag.classList.add(cls);
    }
    if (riskTag && data.riskScore != null) {
      riskTag.textContent = `Risk: ${data.riskScore}`;
      riskTag.classList.remove('ok', 'warn', 'bad');
      const cls = getBadgeClassForScore(data.riskScore, 'risk');
      if (cls) riskTag.classList.add(cls);
    }
  } catch {}
}

/**
 * Get badge class for score
 */
function getBadgeClassForScore(val, kind) {
  try {
    if (typeof val !== 'number') return '';
    if (kind === 'risk') { 
      if (val <= 3) return 'ok'; 
      if (val <= 6) return 'warn'; 
      return 'bad'; 
    }
    if (kind === 'branch') { 
      if (val >= 70) return 'ok'; 
      if (val >= 40) return 'warn'; 
      return 'bad'; 
    }
  } catch {}
  return '';
}

/**
 * Format market value for display
 */
function formatMarketValue(value, type = 'usd') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  
  if (type === 'usd') {
    return window.LiveUtils.fmtUSD(value);
  }
  
  if (type === 'percentage') {
    return value.toFixed(2) + '%';
  }
  
  // Large numbers formatting
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(1) + 'B';
  }
  if (abs >= 1_000_000) {
    return (value / 1_000_000).toFixed(1) + 'M';
  }
  if (abs >= 1_000) {
    return (value / 1_000).toFixed(1) + 'K';
  }
  
  return value.toLocaleString();
}

/**
 * Draw sparkline on canvas
 */
function drawSparkline(canvas, data, options = {}) {
  if (!canvas || !data || !Array.isArray(data) || data.length < 2) return;
  
  const ctx = canvas.getContext('2d');
  const { width = canvas.width, height = canvas.height } = options;
  const { color = '#79e08f', lineWidth = 1.5 } = options;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Find min/max for scaling
  const values = data.map(d => typeof d === 'number' ? d : (d.price || d.value || 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  
  if (range === 0) return; // No variation
  
  // Setup drawing
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // Draw line
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((values[i] - min) / range) * height;
    
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  
  // Optional: draw dots at data points
  if (options.showDots) {
    ctx.fillStyle = color;
    for (let i = 0; i < values.length; i++) {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((values[i] - min) / range) * height;
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * Get market status color based on change
 */
function getMarketStatusColor(changePercent) {
  if (typeof changePercent !== 'number') return '#9fb2c8';
  if (changePercent > 5) return '#79e08f';
  if (changePercent > 0) return '#8ab4ff';
  if (changePercent > -5) return '#ffb347';
  return '#ff7b7b';
}

/**
 * Create market metrics element
 */
function createMarketMetrics(data = {}) {
  const container = document.createElement('div');
  container.className = 'market-metrics';
  
  const metrics = [
    { label: 'Price', value: data.price, type: 'usd' },
    { label: 'FDV', value: data.fdv || data.market_cap, type: 'usd' },
    { label: 'Liquidity', value: data.liquidity, type: 'usd' },
    { label: 'Volume 24h', value: data.volume24h, type: 'usd' }
  ];
  
  for (const metric of metrics) {
    const el = document.createElement('div');
    el.className = 'metric';
    
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = metric.label;
    
    const value = document.createElement('div');
    value.className = 'value';
    value.textContent = formatMarketValue(metric.value, metric.type);
    
    el.appendChild(label);
    el.appendChild(value);
    container.appendChild(el);
  }
  
  return container;
}

// Export market functionality
window.LiveMarket = {
  mintMetaCache,
  fetchMintMeta,
  applyMintMetaToItem,
  updateGlobalMarket,
  updateGlobalScores,
  getBadgeClassForScore,
  formatMarketValue,
  drawSparkline,
  getMarketStatusColor,
  createMarketMetrics,
  init: initMarket
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMarket);
} else {
  initMarket();
}