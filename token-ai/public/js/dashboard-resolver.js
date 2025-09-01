// token-ai/public/js/dashboard-resolver.js
(function(){
  const resSym = document.getElementById('resSym');
  const resChain = document.getElementById('resChain');
  const resBtn = document.getElementById('resBtn');
  const resOut = document.getElementById('resOut');
  if (!resSym || !resChain || !resBtn || !resOut) return; // Not on dashboard or missing UI

  function setRes(html){ resOut.innerHTML = html; }
  function esc(s){ return String(s||'').replace(/[&<>]/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  async function dexsSearch(q){
    const r=await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`);
    if(!r.ok) throw new Error('search '+r.status);
    const j=await r.json();
    return j.pairs||[];
  }
  async function tokenPairs(chain, addr){
    const r=await fetch(`https://api.dexscreener.com/token-pairs/v1/${chain}/${addr}`);
    if(!r.ok) return null; return r.json();
  }
  function rankCandidates(pairs, chain, symbol){
    const GENERIC_ADDR_SOL = 'So11111111111111111111111111111111111111112'.toLowerCase();
    const GENERIC_SYMS = new Set(['SOL','USDC','USDT']);
    const target = String(symbol||'').toUpperCase();
    const items = pairs.filter(p => (p.chainId||'').toLowerCase()===chain);
    const m = new Map();
    const push=(tok, role, p)=>{
      if (!tok?.address) return; 
      const k=tok.address.toLowerCase(); 
      
      // Calculate REAL liquidity from quote side
      const quoteSymbol = (p.quoteToken?.symbol || '').toUpperCase();
      const quoteLiq = Number(p?.liquidity?.quote||0)||0;
      let realLiqUsd = 0;
      if (quoteSymbol === 'SOL') {
        realLiqUsd = quoteLiq * 240; // Updated SOL price (more realistic)
      } else if (quoteSymbol === 'USDC' || quoteSymbol === 'USDT') {
        realLiqUsd = quoteLiq;
      }
      
      const totalLiq = Number(p?.liquidity?.usd||0)||0;
      const volume24h = Number(p?.volume?.h24||0)||0;
      const rec = m.get(k)||{ 
        address: tok.address, 
        symbol: String(tok.symbol||'').toUpperCase(), 
        name: tok.name||null, 
        liq: 0, 
        realLiq: 0,
        volume: 0,
        ev: 0, 
        quotePref: 0,
        roles: new Set(), 
        pairs: [] 
      };
      rec.liq += totalLiq; 
      rec.realLiq += realLiqUsd;
      rec.volume += volume24h;
      rec.ev++; 
      rec.roles.add(role); 
      if (quoteSymbol === 'SOL') rec.quotePref += 2;
      else if (quoteSymbol === 'USDC' || quoteSymbol === 'USDT') rec.quotePref += 1;
      
      if (rec.pairs.length < 3) {
        rec.pairs.push({ 
          dexId: p.dexId||null, 
          pairAddress: p.pairAddress||p.pair, 
          liquidity_usd: totalLiq, 
          quote_liquidity_usd: realLiqUsd,
          quote_token: quoteSymbol,
          volume_24h: volume24h,
          url: p.url||null 
        });
      }
      m.set(k, rec);
    };
    for (const p of items){ 
      const b=p.baseToken||p.base||null; 
      const q=p.quoteToken||p.quote||null; 
      // Only process if quote is SOL/USDC/USDT
      const quoteSymbol = (p.quoteToken?.symbol || '').toUpperCase();
      if (quoteSymbol === 'SOL' || quoteSymbol === 'USDC' || quoteSymbol === 'USDT') {
        if(b) push(b,'base',p); 
        if(q) push(q,'quote',p);
      }
    }
    let list = Array.from(m.values()).map(c=>{
      const exact = c.symbol===target?1:0; 
      const partial = (!exact && c.symbol.includes(target))?0.5:0; 
      // Use REAL liquidity for scoring
      const liqScore = Math.log10(1+c.realLiq)*20; 
      const baseRole = c.roles.has('base')?1:0; 
      
      // Volume score - real tokens have trading activity
      const volumeScore = Math.log10(1 + c.volume) * 15;
      
      // Momentum bonus - what's hot RIGHT NOW gets priority
      let momentumBonus = 0;
      if (c.volume > 1000000) {
        momentumBonus = 200;  // $1M+ daily volume = very hot
      } else if (c.volume > 500000) {
        momentumBonus = 100;  // $500K+ = hot
      } else if (c.volume > 100000) {
        momentumBonus = 50;   // $100K+ = warming up
      }
      
      const quoteBonus = c.quotePref * 5;
      
      // Scam detection
      const liqRatio = c.liq > 0 ? (c.realLiq / c.liq) : 1;
      const scamPenalty = liqRatio < 0.001 ? -500 : 0;
      
      // Dead token penalty - sliding scale based on volume
      let deadTokenPenalty = 0;
      if (c.volume < 1000) {
        deadTokenPenalty = -200;
      } else if (c.volume < 10000) {
        deadTokenPenalty = -100;
      }
      
      const score = exact*1000 + partial*200 + liqScore + volumeScore + momentumBonus + c.ev*5 + baseRole*10 + quoteBonus + scamPenalty + deadTokenPenalty; 
      return { 
        ...c, 
        roles:Array.from(c.roles), 
        score, 
        liquidity_ratio: liqRatio,
        is_likely_scam: scamPenalty < 0,
        score_breakdown:{ 
          exact: exact * 1000, 
          partial: partial * 200, 
          liquidity_score: liqScore,
          volume_score: volumeScore,
          momentum_bonus: momentumBonus,
          evidence_count: c.ev * 5, 
          base_role: baseRole * 10,
          quote_bonus: quoteBonus,
          scam_penalty: scamPenalty,
          dead_token_penalty: deadTokenPenalty,
          total: score
        } 
      };
    });
    list = list.filter(c => c.address.toLowerCase() !== GENERIC_ADDR_SOL && !GENERIC_SYMS.has(c.symbol));
    list = list.filter(c => c.roles.includes('base'));
    // Filter out likely scams (liquidity ratio < 0.1%)
    list = list.filter(c => !c.is_likely_scam);
    list.sort((a,b)=> b.score - a.score);
    return list;
  }
  async function resolveSymbol(){
    const sym = (resSym.value||'').trim(); const chain = (resChain.value||'solana').trim().toLowerCase();
    if (!sym) { setRes('<span class=small>Enter a symbol.</span>'); return; }
    setRes('<span class=small>Resolving…</span>');
    try {
      // Use the server's resolver with proper scoring
      const r = await fetch('/realtime/tool-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'resolve_token',
          args: { query: sym, chain: chain, limit: 5 }
        })
      });
      const result = await r.json();
      
      let cands = [];
      if (result.ok && Array.isArray(result.results)) {
        cands = result.results;
        // Enrich with top pairs
        for (const c of cands) {
          try {
            const pe = await tokenPairs(chain, c.address);
            const arr = Array.isArray(pe?.pairs)? pe.pairs.slice():[];
            arr.sort((a,b)=> ((b?.liquidity?.usd||0)-(a?.liquidity?.usd||0)) );
            c.top_pairs = arr.slice(0,3).map(p=>({ dexId:p.dexId, pairAddress:p.pairAddress, url:p.url||null, price_usd: Number(p.priceUsd||0), liquidity_usd: p.liquidity?.usd||null, volume24h_usd: (p.volume && (p.volume.h24||p.volume24h))||null }));
          } catch {}
        }
      } else {
        // Fallback to local ranking if server fails
        const pairs = await dexsSearch(sym);
        cands = rankCandidates(pairs, chain, sym).slice(0,5);
        const sum = cands.reduce((s,c)=> s + (Number(c.score)||0), 0) || 0;
        for (const c of cands) {
          c.confidence = sum>0 ? Math.round((c.score/sum) * 100) : 20;
        }
      }
      const best = cands[0] || null;
      if (!best) { setRes('<span class=small>No candidates found on '+esc(chain)+'</span>'); return; }
      const confPct = best.confidence; // Already a percentage from server
      const top = best.top_pairs?.[0] || null;
      const hdr = `<div class=row style="gap:8px;align-items:center"><div class=badge>Best</div><div class=badge>${esc(best.symbol)}</div><div class=small>${esc(best.name||'')}</div><div class=badge>Conf: ${confPct}%</div></div>`;
      const addr = `<div class=small>Mint: <code>${esc(best.address)}</code></div>`;
      const pair = top ? `<div class=small>Pair: <a href="${esc(top.url||'#')}" target=_blank>${esc(top.dexId||'')} • $${top.liquidity_usd?Math.round(top.liquidity_usd).toLocaleString():'—'} liq ${top.volume24h_usd?(' | $'+Math.round(top.volume24h_usd).toLocaleString()+' 24h vol'):''}</a></div>` : '';
      const btn = `<div style="margin-top:8px"><button id=analyzeBtn class=tinybtn>Analyze</button></div>`;
      const others = cands.slice(1).map(c=> `<div class=small>Alt: ${esc(c.symbol)} — <code>${esc(c.address)}</code> (${c.confidence}%)</div>`).join('');
      setRes(hdr + addr + pair + btn + (others?('<div style="margin-top:6px">'+others+'</div>'):'') );
      try {
        document.getElementById('analyzeBtn').addEventListener('click', async ()=>{
          try {
            const r = await fetch('/run', { method:'POST', headers:{ 'content-type':'application/json' }, body: JSON.stringify({ mint: best.address }) });
            if (r.ok) { setRes(resOut.innerHTML + '<div class=small style="margin-top:6px">Run started.</div>'); window.open('./agent-live.html', '_blank'); }
            else { const j = await r.json().catch(()=>({})); setRes(resOut.innerHTML + '<div class=small style="margin-top:6px;color:#ff7b7b">Run failed: '+esc(j.error||r.status)+'</div>'); }
          } catch (e) { setRes(resOut.innerHTML + '<div class=small style="margin-top:6px;color:#ff7b7b">Run error</div>'); }
        });
      } catch {}
    } catch (e) {
      setRes('<span class=small style="color:#ff7b7b">Resolve failed: '+esc(e.message||'error')+'</span>');
    }
  }
  try { resBtn.addEventListener('click', resolveSymbol); } catch {}
})();

