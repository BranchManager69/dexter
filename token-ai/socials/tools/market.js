// token-ai/socials/tools/market.js

import axios from 'axios';

function normalizeWindowByInterval(tf, tt, interval) {
  const now = Math.floor(Date.now()/1000);
  if (!tt || tt > now) tt = now;
  if (!tf || tf >= tt) tf = tt - (6*3600);
  let maxSpan;
  if (interval <= 1) {
    maxSpan = 6 * 3600; // 6h @1m
  } else if (interval <= 5) {
    maxSpan = 48 * 3600; // 48h @5m
  } else {
    maxSpan = 14 * 24 * 3600; // 14d @15m
  }
  const span = tt - tf;
  if (span > maxSpan) tf = tt - maxSpan;
  return { tf, tt };
}

export async function fetch_market_overview(mint) {
  try {
    const ds = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { timeout: 8000 });
    const pairs = ds.data?.pairs || [];
    const best = pairs.sort((a,b)=> (b.liquidity?.usd||0) - (a.liquidity?.usd||0))[0];
    if (!best) return { success: true, pairs: 0 };
    return {
      success: true,
      price: best.priceUsd ? Number(best.priceUsd) : null,
      fdv: best.fdv ?? null,
      liquidity: best.liquidity?.usd ?? null,
      vol1h: best.volume?.h1 ?? null,
      vol24h: best.volume?.h24 ?? best.volume24h ?? null,
      top_pool: {
        chain: best.chainId || best.chain || null,
        dex: best.dexId || null,
        pairAddress: best.pairAddress || null,
        baseToken: best.baseToken || null,
        quoteToken: best.quoteToken || null,
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function analyze_token_ohlcv_range(mint, time_from, time_to, interval_minutes = 1) {
  try {
    const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    if (!BASE58.test(String(mint||'').trim())) {
      return { error: 'Invalid mint address', mint_address: mint };
    }
    const apiKey = process.env.BIRDEYE_API_KEY;
    if (!apiKey) return { error: 'Missing BIRDEYE_API_KEY' };
    const interval = Math.min(Math.max(Number(interval_minutes)||1, 1), 60);
    let { tf, tt } = normalizeWindowByInterval(Number(time_from)||0, Number(time_to)||0, interval);
    const MAX_CANDLES = 5000;
    const requested = Math.floor((tt - tf) / (interval * 60));
    if (requested > MAX_CANDLES) tf = tt - (MAX_CANDLES * interval * 60);
    const type = interval <= 1 ? '1m' : (interval <= 5 ? '5m' : '15m');
    const url = `https://public-api.birdeye.so/defi/v3/ohlcv`;
    const params = {
      address: mint,
      type,
      currency: 'native',
      time_from: tf,
      time_to: tt,
      ui_amount_mode: 'both',
      mode: 'range'
    };
    const resp = await axios.get(url, {
      params,
      headers: { 'X-API-KEY': apiKey, 'accept': 'application/json', 'x-chain': 'solana' },
      timeout: 20000
    });
    const items = resp.data?.data?.items || [];
    const ohlcv = items.map(it => ({
      t: it.unix_time || it.time || 0,
      o: it.o,
      h: it.h,
      l: it.l,
      c: it.c,
      v: it.v,
      v_usd: it.v_usd
    })).filter(x => x.t && x.c != null);
    if (ohlcv.length) {
      return { provider: 'birdeye', time_from: tf, time_to: tt, interval_minutes: interval, ohlcv };
    }
    // Fallback: try a recent practical window matching interval
    const now = Math.floor(Date.now()/1000);
    const fb = normalizeWindowByInterval(now - (14*24*3600), now, interval <= 1 ? 1 : interval <= 5 ? 5 : 15);
    const resp2 = await axios.get(url, {
      params: { ...params, time_from: fb.tf, time_to: fb.tt },
      headers: { 'X-API-KEY': apiKey, 'accept': 'application/json', 'x-chain': 'solana' },
      timeout: 20000
    });
    const items2 = resp2.data?.data?.items || [];
    const ohlcv2 = items2.map(it => ({ t: it.unix_time || it.time || 0, o: it.o, h: it.h, l: it.l, c: it.c, v: it.v, v_usd: it.v_usd })).filter(x => x.t && x.c != null);
    return { provider: 'birdeye', time_from: fb.tf, time_to: fb.tt, interval_minutes: interval, ohlcv: ohlcv2, note: ohlcv2.length ? undefined : 'no_data' };
  } catch (e) {
    return { error: 'Failed to fetch OHLCV', details: e?.message };
  }
}
