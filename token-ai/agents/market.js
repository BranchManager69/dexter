// token-ai/agents/market.js

// Summarize OHLCV range into compact stats for memory storage
export function summarizeOHLCV(ohlcvResult) {
  try {
    if (!ohlcvResult || !Array.isArray(ohlcvResult.ohlcv)) return { note: 'no_data' };
    const arr = ohlcvResult.ohlcv;
    if (!arr.length) return { note: 'no_data' };
    const first = arr[0];
    const last = arr[arr.length - 1];
    let high = -Infinity, low = Infinity;
    let vol = 0, vol_usd = 0;
    for (const c of arr) {
      if (typeof c.h === 'number') high = Math.max(high, c.h);
      if (typeof c.l === 'number') low = Math.min(low, c.l);
      if (typeof c.v === 'number') vol += c.v;
      if (typeof c.v_usd === 'number') vol_usd += c.v_usd;
    }
    if (!isFinite(high) || !isFinite(low)) { high = null; low = null; }
    const firstPrice = (typeof first.o === 'number') ? first.o : (typeof first.c === 'number' ? first.c : null);
    const lastPrice = (typeof last.c === 'number') ? last.c : (typeof last.o === 'number' ? last.o : null);
    let change_pct = null;
    if (firstPrice && lastPrice && firstPrice !== 0) change_pct = ((lastPrice - firstPrice) / firstPrice) * 100;
    return {
      window: {
        time_from: Number(ohlcvResult.time_from) || null,
        time_to: Number(ohlcvResult.time_to) || null,
        interval_minutes: Number(ohlcvResult.interval_minutes) || null,
        candles: arr.length
      },
      price: {
        first: firstPrice,
        last: lastPrice,
        high,
        low,
        change_pct: change_pct != null ? Number(change_pct.toFixed(2)) : null
      },
      volume: {
        native: Number(vol.toFixed(3)),
        usd: vol_usd ? Number(vol_usd.toFixed(2)) : null
      },
      provider: ohlcvResult.provider || null,
      note: undefined
    };
  } catch {
    return { note: 'error' };
  }
}

// Return a privacy-preserving, relative-only view for memory persistence
export function sanitizeMarketForMemory(summary) {
  try {
    const w = summary?.window || {};
    const p = summary?.price || {};
    const candles = Number(w.candles || 0);
    const hlRatio = (p.high && p.low && p.low !== 0) ? Number((p.high / p.low).toFixed(2)) : null;
    return {
      window: {
        time_from: Number(w.time_from) || null,
        time_to: Number(w.time_to) || null,
        interval_minutes: Number(w.interval_minutes) || null,
        candles
      },
      price: {
        change_pct: (p.change_pct != null) ? Number(p.change_pct) : null,
        hl_ratio: hlRatio
      },
      // Strip absolute volumes/prices; keep provider for provenance
      provider: summary?.provider || null,
      note: summary?.note || undefined
    };
  } catch { return { note: 'error' }; }
}

export function updateStateMarket(state, ohlcvResult) {
  try {
    const summary = summarizeOHLCV(ohlcvResult);
    const mem = sanitizeMarketForMemory(summary);
    if (!state.memory) state.memory = {};
    state.memory.market = mem;
  } catch {}
  return state;
}

export function formatMarketLine(mkt) {
  try {
    if (!mkt || mkt.note === 'no_data') return '';
    const w = mkt.window || {};
    const p = mkt.price || {};
    const spanH = (w.time_from && w.time_to) ? Math.max(0, Math.round((w.time_to - w.time_from) / 3600)) : '';
    const intr = w.interval_minutes ? `${w.interval_minutes}m` : '';
    const change = (p.change_pct != null) ? `${p.change_pct>0?'+':''}${p.change_pct}%` : 'na';
    const hl = (p.hl_ratio != null) ? `HL ${p.hl_ratio}` : '';
    const bits = [change, spanH?`${spanH}h@${intr}`:intr, hl].filter(Boolean);
    return bits.length ? bits.join(' ') : '';
  } catch { return ''; }
}

function approxNum(n){
  const x = Math.abs(Number(n));
  if (x>=1e9) return (n/1e9).toFixed(1)+'B';
  if (x>=1e6) return (n/1e6).toFixed(1)+'M';
  if (x>=1e3) return (n/1e3).toFixed(1)+'k';
  return String(n);
}
