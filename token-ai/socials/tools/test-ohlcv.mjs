import { analyze_token_ohlcv_range } from './market.js';

const mint = process.argv[2] || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
(async () => {
  const now = Math.floor(Date.now()/1000);
  const res = await analyze_token_ohlcv_range(mint, now-3600, now, 1);
  console.log({ provider: res.provider, candles: res.ohlcv?.length, interval: res.interval_minutes, note: res.note, error: res.error });
})();

