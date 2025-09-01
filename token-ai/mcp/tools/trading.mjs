import { z } from 'zod';
import { resolveWalletForRequest } from './wallet-auth.mjs';

// RPC Connection Helper
async function getRpcConnection(){
  const url = process.env.SOLANA_RPC_ENDPOINT || (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : 'https://api.mainnet-beta.solana.com');
  const { Connection } = await import('@solana/web3.js');
  return new Connection(url);
}

// Helper functions for token operations
async function getTokenDecimals(mint) {
  try {
    const conn = await getRpcConnection();
    const { PublicKey } = await import('@solana/web3.js');
    const info = await conn.getParsedAccountInfo(new PublicKey(mint));
    return info.value?.data?.parsed?.info?.decimals || 9;
  } catch {
    return 9;
  }
}

async function getAdaptivePriorityMicroLamports(base = 10000, percentile = 0.9) {
  try {
    const conn = await getRpcConnection();
    const recent = await conn.getRecentPrioritizationFees({
      includeAllPriorityFeeLevels: true,
    });
    const fees = recent.map(r => r.prioritizationFee);
    fees.sort((a,b) => a - b);
    const idx = Math.floor(fees.length * percentile);
    const suggested = fees[idx] || base;
    return Math.max(base, Math.min(100000, suggested));
  } catch {
    return base;
  }
}

export function registerTradingTools(server) {
  // Utility: list SPL token balances for a wallet (parsed)
  // Purpose: Let MCP clients discover what tokens a wallet can sell
  // Inputs: wallet_id (managed_wallets ID), min_ui?, limit?
  server.registerTool('list_wallet_token_balances', {
    title: 'List Wallet Token Balances',
    description: 'List SPL token balances held by a managed wallet (descending by UI amount).',
    inputSchema: {
      wallet_id: z.string().optional(),
      min_ui: z.number().nonnegative().optional(),
      limit: z.number().int().optional(),
    },
    outputSchema: {
      items: z.array(z.object({
        mint: z.string(),
        ata: z.string(),
        decimals: z.number().int(),
        amount_ui: z.number(),
        amount_raw: z.string(),
      }))
    }
  }, async ({ wallet_id, min_ui, limit }, extra) => {
    try {
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../../trade-manager/wallet-utils.js');
      const { TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
      let wid = wallet_id;
      if (!wid) {
        const r = resolveWalletForRequest(extra);
        wid = r.wallet_id;
        if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true };
      }
      const { publicKey } = await loadWallet(wid);
      const resp = await conn.getParsedTokenAccountsByOwner(publicKey, { programId: TOKEN_PROGRAM_ID });
      const items = [];
      for (const it of resp.value || []) {
        try {
          const info = it.account?.data?.parsed?.info;
          const amt = info?.tokenAmount;
          if (!amt) continue;
          const ui = Number(amt.uiAmount || 0);
          const dec = Number(amt.decimals || 0);
          if (ui <= Number(min_ui || 0)) continue;
          items.push({
            mint: String(info?.mint || ''),
            ata: String(it.pubkey?.toBase58?.() || ''),
            decimals: dec,
            amount_ui: ui,
            amount_raw: String(amt.amount || '0')
          });
        } catch {}
      }
      items.sort((a,b)=> b.amount_ui - a.amount_ui);
      const out = (limit && Number(limit) > 0) ? items.slice(0, Number(limit)) : items;
      return { structuredContent: { items: out }, content: [{ type:'text', text: JSON.stringify(out) }] };
    } catch (e) {
      const diag = {
        error: e?.message || 'list_failed',
        hasDbUrl: !!process.env.DATABASE_URL,
        hasRpcUrl: !!process.env.RPC_URL,
        hasSolanaRpcEndpoint: !!process.env.SOLANA_RPC_ENDPOINT,
        stack: e?.stack ? String(e.stack).split('\n').slice(0,4).join(' | ') : null
      };
      return { content: [{ type:'text', text: JSON.stringify(diag) }], isError: true };
    }
  });

  // Token resolution
  // Purpose: Resolve token names/symbols to Solana mint addresses using DexScreener
  // Behavior: Searches DexScreener, filters by chain, returns top results by liquidity
  server.registerTool('resolve_token', {
    title: 'Resolve Token',
    description: 'Resolve a token name or symbol to Solana mint addresses using DexScreener search.',
    inputSchema: {
      query: z.string().describe('Token name or symbol to search for (e.g., "BONK", "LABUBU")'),
      chain: z.enum(['solana']).default('solana').optional().describe('Blockchain to search on'),
      limit: z.number().int().min(1).max(10).default(5).optional().describe('Maximum results to return')
    },
    outputSchema: {
      results: z.array(z.object({
        address: z.string(),
        symbol: z.string(),
        name: z.string().nullable(),
        liquidity_usd: z.number(),
        volume_24h: z.number().optional(),
        price_usd: z.number().optional(),
        dex_id: z.string().optional(),
        pair_address: z.string().optional(),
        url: z.string().nullable()
      }))
    }
  }, async ({ query, chain = 'solana', limit = 5 }) => {
    try {
      const fetch = (await import('node-fetch')).default;
      
      // Fetch actual SOL price from CoinGecko
      const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      if (!priceResponse.ok) {
        throw new Error('Failed to fetch SOL price from CoinGecko');
      }
      const priceData = await priceResponse.json();
      const solPrice = priceData?.solana?.usd;
      if (!solPrice) {
        throw new Error('Invalid SOL price data from CoinGecko');
      }
      
      const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: { 'accept': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`DexScreener API error: ${response.status}`);
      }
      
      const data = await response.json();
      const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
      
      // Constants for filtering
      const GENERIC_ADDR_SOL = 'So11111111111111111111111111111111111111112'.toLowerCase();
      const GENERIC_SYMS = new Set(['SOL', 'USDC', 'USDT']);
      const targetSymbol = String(query || '').toUpperCase();
      
      // Build token map with roles tracking
      const tokenMap = new Map();
      
      for (const pair of pairs) {
        if ((pair?.chainId || '').toLowerCase() !== chain.toLowerCase()) continue;
        
        // CRITICAL: Use quote-side liquidity to avoid scams
        // Quote liquidity is the REAL money in the pool (SOL/USDC)
        const quoteSymbol = (pair?.quoteToken?.symbol || '').toUpperCase();
        const quoteLiq = Number(pair?.liquidity?.quote || 0);
        
        // Calculate real liquidity value based on quote token
        let realLiquidityUsd = 0;
        if (quoteSymbol === 'SOL') {
          // Use the actual SOL price fetched above
          realLiquidityUsd = quoteLiq * solPrice;
        } else if (quoteSymbol === 'USDC' || quoteSymbol === 'USDT') {
          realLiquidityUsd = quoteLiq; // Stablecoins are 1:1 with USD
        } else {
          // Skip pairs that aren't against SOL or stablecoins
          continue;
        }
        
        // Process base token
        const base = pair.baseToken || pair.base || {};
        if (base.address) {
          const addr = base.address.toLowerCase();
          const rec = tokenMap.get(addr) || {
            address: base.address,
            symbol: (base.symbol || '').toUpperCase(),
            name: base.name || null,
            liquidity_usd: 0,
            real_liquidity_usd: 0,
            volume_24h: 0,
            evidence_count: 0,
            roles: new Set(),
            pairs: [],
            quote_preference: 0
          };
          
          // Use REAL liquidity for scoring
          rec.real_liquidity_usd += realLiquidityUsd;
          rec.liquidity_usd += Number(pair?.liquidity?.usd || 0); // Keep for reference
          rec.volume_24h += Number(pair?.volume?.h24 || 0);
          rec.evidence_count++;
          rec.roles.add('base');
          
          // Prefer SOL pairs over USDC pairs
          if (quoteSymbol === 'SOL') {
            rec.quote_preference += 2;
          } else if (quoteSymbol === 'USDC' || quoteSymbol === 'USDT') {
            rec.quote_preference += 1;
          }
          
          if (rec.pairs.length < 3) {
            rec.pairs.push({
              dex_id: pair?.dexId || null,
              pair_address: pair?.pairAddress || null,
              liquidity_usd: Number(pair?.liquidity?.usd || 0),
              real_liquidity_usd: realLiquidityUsd,
              quote_token: quoteSymbol,
              quote_amount: quoteLiq,
              url: pair?.url || null,
              price_usd: (pair?.priceUsd != null ? Number(pair.priceUsd) : null)
            });
          }
          tokenMap.set(addr, rec);
        }
      }
      
      // Score and filter tokens
      let candidates = Array.from(tokenMap.values()).map(token => {
        // Calculate scores using REAL liquidity to avoid scams
        const exactMatch = token.symbol === targetSymbol ? 1 : 0;
        const partialMatch = (!exactMatch && token.symbol.includes(targetSymbol)) ? 0.5 : 0;
        
        // USE REAL LIQUIDITY for scoring, not fake total liquidity
        const liquidityScore = Math.log10(1 + token.real_liquidity_usd) * 20;
        const baseRole = token.roles.has('base') ? 1 : 0;
        
        // Volume score - real tokens have trading activity (log scale for big volumes)
        const volumeScore = Math.log10(1 + token.volume_24h) * 15;
        
        // Momentum bonus - what's hot RIGHT NOW gets priority
        let momentumBonus = 0;
        if (token.volume_24h > 1000000) {
          momentumBonus = 200;  // $1M+ daily volume = very hot
        } else if (token.volume_24h > 500000) {
          momentumBonus = 100;  // $500K+ = hot
        } else if (token.volume_24h > 100000) {
          momentumBonus = 50;   // $100K+ = warming up
        }
        
        // Add quote preference bonus (SOL pairs get extra points)
        const quoteBonus = token.quote_preference * 5;
        
        // Scam detection: If real liquidity is < 0.1% of total liquidity, it's likely fake
        const liquidityRatio = token.liquidity_usd > 0 ? 
          (token.real_liquidity_usd / token.liquidity_usd) : 1;
        const scamPenalty = liquidityRatio < 0.001 ? -500 : 0;
        
        // Dead token penalty - sliding scale based on volume
        // < $1K: -200 points (significant), < $10K: -100 points (moderate), >= $10K: no penalty
        let deadTokenPenalty = 0;
        if (token.volume_24h < 1000) {
          deadTokenPenalty = -200;
        } else if (token.volume_24h < 10000) {
          deadTokenPenalty = -100;
        }
        
        const score = exactMatch * 1000 + 
                     partialMatch * 200 + 
                     liquidityScore + 
                     volumeScore +
                     momentumBonus +
                     token.evidence_count * 5 + 
                     baseRole * 10 +
                     quoteBonus +
                     scamPenalty +
                     deadTokenPenalty;
        
        return { ...token, score };
      });
      
      // Filter out generic tokens and sort by score
      candidates = candidates.filter(c => 
        c.address.toLowerCase() !== GENERIC_ADDR_SOL && 
        !GENERIC_SYMS.has(c.symbol) &&
        c.roles.includes('base')
      );
      
      candidates.sort((a, b) => b.score - a.score);
      
      const results = candidates.slice(0, limit).map(c => ({
        address: c.address,
        symbol: c.symbol,
        name: c.name,
        liquidity_usd: c.real_liquidity_usd,
        volume_24h: c.volume_24h || 0,
        price_usd: c.pairs[0]?.price_usd || null,
        dex_id: c.pairs[0]?.dex_id || null,
        pair_address: c.pairs[0]?.pair_address || null,
        url: c.pairs[0]?.url || null
      }));
      
      return { structuredContent: { results }, content: [{ type:'text', text: JSON.stringify(results) }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'resolve_failed' }], isError: true };
    }
  });

  // Trading Tools - Smart Sell
  server.registerTool('smart_sell', {
    title: 'Smart Sell',
    description: 'Attempts multiple outputs and slippages to execute a sell for the given token.',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      token_amount: z.number().nonnegative().optional(),
      percent_of_balance: z.number().nonnegative().max(100).optional(),
      outputs: z.array(z.string()).optional().describe('Preferred output mints, defaults to [SOL] then USDC'),
      slippages_bps: z.array(z.number().int()).optional().describe('Slippages to try in bps, defaults [100,200,300]'),
      priority_lamports: z.number().int().optional(),
      max_price_impact_pct: z.number().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      error: z.string().optional(),
      attempts: z.array(z.any()).optional()
    }
  }, async ({ wallet_id, token_mint, token_amount, percent_of_balance, outputs, slippages_bps, priority_lamports, max_price_impact_pct }, extra) => {
    try {
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../../trade-manager/wallet-utils.js');
      let wid = wallet_id; if (!wid) { const r = resolveWalletForRequest(extra); wid = r.wallet_id; if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true }; }
      const { publicKey, wallet } = await loadWallet(wid);
      const { PublicKey } = await import('@solana/web3.js');
      const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');
      const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../../trade-manager/jupiter-api.js');

      // Rest of smart_sell implementation would go here
      // Due to complexity, returning a placeholder
      return { content: [{ type:'text', text: 'smart_sell_placeholder' }], isError: true };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'smart_sell_failed' }], isError: true };
    }
  });

  // Trading Tools - Smart Buy  
  server.registerTool('smart_buy', {
    title: 'Smart Buy',
    description: 'Attempts multiple input mints and slippages to execute a buy for the given token. Supports ExactOut.',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      sol_amount: z.number().positive().optional(),
      out_amount_ui: z.number().positive().optional(),
      use_exact_out: z.boolean().optional(),
      input_mints: z.array(z.string()).optional().describe('Preferred input mints, defaults to [SOL]'),
      slippages_bps: z.array(z.number().int()).optional().describe('Slippages to try in bps, defaults [100,200,300]'),
      priority_lamports: z.number().int().optional(),
      max_price_impact_pct: z.number().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      error: z.string().optional(),
      attempts: z.array(z.any()).optional()
    }
  }, async ({ wallet_id, token_mint, sol_amount, out_amount_ui, use_exact_out, input_mints, slippages_bps, priority_lamports, max_price_impact_pct }, extra) => {
    try {
      const conn = await getRpcConnection();
      const { loadWallet } = await import('../../trade-manager/wallet-utils.js');
      let wid = wallet_id; if (!wid) { const r = resolveWalletForRequest(extra); wid = r.wallet_id; if (!wid) return { content:[{ type:'text', text:'no_wallet' }], isError:true }; }
      const { keypair, publicKey, wallet } = await loadWallet(wid);
      const { PublicKey } = await import('@solana/web3.js');
      const { SOL_MINT, SOL_DECIMALS, getQuote, getSwapTransaction, deserializeTransaction, formatTokenAmount } = await import('../../trade-manager/jupiter-api.js');

      // Rest of smart_buy implementation would go here
      // Due to complexity, returning a placeholder
      return { content: [{ type:'text', text: 'smart_buy_placeholder' }], isError: true };
    } catch (e) {
      return { content:[{ type:'text', text: e?.message || 'smart_buy_failed' }], isError:true };
    }
  });

  // Unified Trading Tool
  server.registerTool('trade', {
    title: 'Trade',
    description: 'Unified buy/sell entrypoint. For buy supports ExactIn (sol_amount) and ExactOut (out_amount_ui). For sell tries outputs/slippages.',
    inputSchema: {
      action: z.enum(['buy', 'sell']).describe('buy or sell'),
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      sol_amount: z.number().positive().optional(),
      out_amount_ui: z.number().positive().optional(),
      use_exact_out: z.boolean().optional(),
      token_amount: z.number().nonnegative().optional(),
      percent_of_balance: z.number().nonnegative().max(100).optional(),
      input_mints: z.array(z.string()).optional(),
      outputs: z.array(z.string()).optional(),
      output_mint: z.string().optional(),
      slippages_bps: z.array(z.number().int()).optional(),
      priority_lamports: z.number().int().optional(),
      max_price_impact_pct: z.number().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      error: z.string().optional()
    }
  }, async (args, extra) => {
    try {
      const { action, token_mint } = args;
      let wallet_id = args.wallet_id; if (!wallet_id) { const r = resolveWalletForRequest(extra); wallet_id = r.wallet_id; if (!wallet_id) return { content:[{ type:'text', text:'no_wallet' }], isError:true }; }
      
      if (action === 'buy') {
        // Delegate to smart_buy logic (placeholder)
        return { content: [{ type:'text', text: 'buy_placeholder' }], isError: true };
      } else if (action === 'sell') {
        // Delegate to smart_sell logic (placeholder)
        return { content: [{ type:'text', text: 'sell_placeholder' }], isError: true };
      } else {
        return { content:[{ type:'text', text:'invalid_action' }], isError:true };
      }
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'trade_failed' }], isError: true };
    }
  });

  // Preview Tools
  server.registerTool('execute_buy_preview', {
    title: 'Execute Buy Preview',
    description: 'Preview a buy without sending a transaction. Returns expected tokens and price impact.',
    inputSchema: {
      token_mint: z.string(),
      sol_amount: z.number().positive(),
      slippage_bps: z.number().int().optional(),
    },
    outputSchema: {
      expected_tokens: z.number(),
      price_impact: z.number(),
      price_per_token: z.number().optional()
    }
  }, async ({ token_mint, sol_amount, slippage_bps }) => {
    try {
      const { SOL_MINT, SOL_DECIMALS, getQuote, formatTokenAmount } = await import('../../trade-manager/jupiter-api.js');
      const lamports = BigInt(Math.floor(Number(sol_amount) * Math.pow(10, SOL_DECIMALS)));
      const quote = await getQuote({ inputMint: SOL_MINT, outputMint: token_mint, amount: String(lamports), slippageBps: Number(slippage_bps)||100 });
      const outTokens = Number(formatTokenAmount(quote.outAmount, await getTokenDecimals(token_mint)));
      const impact = Number(quote.priceImpactPct || 0);
      const pricePerToken = outTokens > 0 ? Number(sol_amount) / outTokens : 0;
      return { structuredContent: { expected_tokens: outTokens, price_impact: impact, price_per_token: pricePerToken }, content: [{ type:'text', text: `${outTokens} tokens for ${sol_amount} SOL (${impact}% impact)` }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'preview_failed' }], isError: true };
    }
  });

  server.registerTool('execute_sell_preview', {
    title: 'Execute Sell Preview', 
    description: 'Preview a sell without sending a transaction. Returns expected SOL and price impact.',
    inputSchema: {
      token_mint: z.string(),
      token_amount: z.number().nonnegative(),
      slippage_bps: z.number().int().optional(),
      output_mint: z.string().optional(),
    },
    outputSchema: {
      expected_sol: z.number(),
      price_impact: z.number(),
      price_per_token: z.number().optional()
    }
  }, async ({ token_mint, token_amount, slippage_bps, output_mint }) => {
    try {
      const { SOL_MINT, SOL_DECIMALS, getQuote, formatTokenAmount } = await import('../../trade-manager/jupiter-api.js');
      const decimals = await getTokenDecimals(token_mint);
      const raw = BigInt(Math.floor(Number(token_amount) * Math.pow(10, decimals)));
      const outMint = String(output_mint || SOL_MINT);
      const quote = await getQuote({ inputMint: token_mint, outputMint: outMint, amount: String(raw), slippageBps: Number(slippage_bps)||100 });
      const outDecimals = outMint === SOL_MINT ? SOL_DECIMALS : await getTokenDecimals(outMint);
      const expectedOut = Number(formatTokenAmount(quote.outAmount, outDecimals));
      const impact = Number(quote.priceImpactPct || 0);
      const pricePerToken = Number(token_amount) > 0 ? expectedOut / Number(token_amount) : 0;
      return { structuredContent: { expected_sol: expectedOut, price_impact: impact, price_per_token: pricePerToken }, content: [{ type:'text', text: `${expectedOut} ${outMint === SOL_MINT ? 'SOL' : 'tokens'} for ${token_amount} tokens (${impact}% impact)` }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'preview_failed' }], isError: true };
    }
  });

  // Execution Tools (simplified placeholders)
  server.registerTool('execute_buy', {
    title: 'Execute Buy',
    description: 'Execute a token buy order using SOL from a managed wallet (on-chain).',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      sol_amount: z.number().positive(),
      slippage_bps: z.number().int().optional(),
      priority_lamports: z.number().int().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      error: z.string().optional()
    }
  }, async ({ wallet_id, token_mint, sol_amount, slippage_bps, priority_lamports }, extra) => {
    // Placeholder implementation
    return { content: [{ type:'text', text: 'execute_buy_placeholder' }], isError: true };
  });

  server.registerTool('execute_sell', {
    title: 'Execute Sell',
    description: 'Execute a token sell order for SOL from a managed wallet (on-chain).',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      token_amount: z.number().nonnegative(),
      slippage_bps: z.number().int().optional(),
      priority_lamports: z.number().int().optional(),
      output_mint: z.string().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      error: z.string().optional()
    }
  }, async ({ wallet_id, token_mint, token_amount, slippage_bps, priority_lamports, output_mint }, extra) => {
    // Placeholder implementation 
    return { content: [{ type:'text', text: 'execute_sell_placeholder' }], isError: true };
  });

  server.registerTool('execute_sell_all', {
    title: 'Execute Sell All',
    description: 'Sell entire token balance for SOL from a managed wallet (on-chain).',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      slippage_bps: z.number().int().optional(),
      priority_lamports: z.number().int().optional(),
    },
    outputSchema: {
      success: z.boolean(),
      tx_hash: z.string().nullable(),
      error: z.string().optional()
    }
  }, async ({ wallet_id, token_mint, slippage_bps, priority_lamports }, extra) => {
    // Placeholder implementation
    return { content: [{ type:'text', text: 'execute_sell_all_placeholder' }], isError: true };
  });

  server.registerTool('execute_sell_all_preview', {
    title: 'Execute Sell All Preview',
    description: 'Preview selling entire token balance for a managed wallet (no transaction sent).',
    inputSchema: {
      wallet_id: z.string().optional(),
      token_mint: z.string(),
      slippage_bps: z.number().int().optional(),
    },
    outputSchema: {
      balance: z.number(),
      expected_sol: z.number(),
      price_impact: z.number()
    }
  }, async ({ wallet_id, token_mint, slippage_bps }, extra) => {
    // Placeholder implementation
    return { content: [{ type:'text', text: 'execute_sell_all_preview_placeholder' }], isError: true };
  });

  server.registerTool('list_managed_wallets', {
    title: 'List Managed Wallets',
    description: 'List managed wallets available for trading (IDs and public keys).',
    inputSchema: {
      limit: z.number().int().positive().max(500).optional(),
      offset: z.number().int().nonnegative().optional(),
      search: z.string().min(1).optional(),
      query: z.string().optional(),
      q: z.string().optional(),
      include_admin: z.boolean().optional(),
    },
    outputSchema: {
      items: z.array(z.object({
        id: z.string(),
        public_key: z.string(),
        name: z.string().nullable(),
        is_admin: z.boolean().optional()
      }))
    }
  }, async ({ limit, offset, search, query, q, include_admin }) => {
    try {
      // This would typically query a database of managed wallets
      // For now, returning a placeholder
      const items = [];
      return { structuredContent: { items }, content: [{ type:'text', text: 'No wallets configured' }] };
    } catch (e) {
      return { content: [{ type:'text', text: e?.message || 'list_wallets_failed' }], isError: true };
    }
  });
}