// token-ai/core/ohlcv-util.js

import chalk from 'chalk';
import fetch from 'node-fetch';

// Fetch OHLCV range from Birdeye v3 fast API
export async function fetchBirdeyeOHLCVRange(mint, time_from, time_to, interval) {
  try {
    const key = process.env.BIRDEYE_API_KEY;
    if (!key) return null;

    const type = interval <= 1 ? '1m' : (interval <= 5 ? '5m' : '15m');
    const url = `https://public-api.birdeye.so/defi/v3/ohlcv?address=${encodeURIComponent(mint)}&type=${encodeURIComponent(type)}&currency=native&time_from=${time_from}&time_to=${time_to}&ui_amount_mode=both&mode=range`;
    const resp = await fetch(url, { headers: { 'X-API-KEY': key, 'accept': 'application/json', 'x-chain': 'solana' }, timeout: 20000 });
    if (!resp.ok) {
      const text = await resp.text();
      console.log(chalk.yellow(`    Birdeye HTTP ${resp.status}: ${text.slice(0,200)}`));
      return null;
    }
    const json = await resp.json();
    const items = json.data?.items || [];
    const ohlcv = items
      .map(it => ({ t: it.unix_time || it.time || 0, o: it.o, h: it.h, l: it.l, c: it.c, v: it.v, v_usd: it.v_usd }))
      .filter(x => x.t && x.c != null);
    return { mint, time_from, time_to, interval_minutes: interval, ohlcv };
  } catch (e) {
    console.log(chalk.yellow(`    Birdeye fetch error: ${e?.message}`));
    return null;
  }
}

// Normalize time window by interval to avoid impractical ranges
export function normalizeWindowByInterval(tf, tt, interval) {
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
  if (span > maxSpan) {
    const newTf = tt - maxSpan;
    console.log(chalk.yellow(`    Normalizing OHLCV window: requested span ${Math.round(span/3600)}h; using ${Math.round(maxSpan/3600)}h based on interval ${interval}m`));
    tf = newTf;
  }
  return { tf, tt };
}

