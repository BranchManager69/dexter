// token-ai/trade-manager/jupiter-api.js
// Jupiter swap API integration for trade execution

import fetch from 'node-fetch';
import { Transaction, VersionedTransaction } from '@solana/web3.js';

// Prefer paid Jupiter access via API key when available
const JUPITER_API_KEY = process.env.JUPITER_API_KEY || '';

const JUPITER_QUOTE_API = 'https://quote-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://quote-api.jup.ag/v6/swap';

// Token constants
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const SOL_DECIMALS = 9;
export const DUEL_MINT = '7p4FoJ8rCDirhkfeo3FgEsGgRc7EQcWVEaiSk5HDjupx';
export const DUEL_DECIMALS = 6;

// Get a quote from Jupiter
export async function getQuote({
  inputMint,
  outputMint,
  amount,
  slippageBps = 100,
  onlyDirectRoutes = false,
  swapMode, // 'ExactIn' | 'ExactOut' (optional)
}) {
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: amount.toString(),
    slippageBps: slippageBps.toString(),
    onlyDirectRoutes: onlyDirectRoutes.toString()
  });
  if (swapMode) params.set('swapMode', String(swapMode));

  const headers = { 'Accept': 'application/json' };
  if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;

  const response = await fetch(`${JUPITER_QUOTE_API}?${params}`, {
    method: 'GET',
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jupiter quote failed: ${response.status} ${text}`);
  }

  return await response.json();
}

// Get swap transaction from Jupiter
export async function getSwapTransaction({
  quoteResponse,
  userPublicKey,
  wrapAndUnwrapSol = true,
  priorityLamports = 10000
}) {
  const requestBody = {
    quoteResponse,
    userPublicKey: userPublicKey.toString(),
    wrapAndUnwrapSol,
    computeUnitPriceMicroLamports: priorityLamports,
    dynamicComputeUnitLimit: true,
    priorityLevelWithMaxLamports: {
      maxLamports: priorityLamports
    }
  };

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
  if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;

  const response = await fetch(JUPITER_SWAP_API, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jupiter swap failed: ${response.status} ${text}`);
  }

  const swapResponse = await response.json();
  return swapResponse;
}

// Deserialize transaction from Jupiter response
export function deserializeTransaction(swapTransaction) {
  const transactionBuf = Buffer.from(swapTransaction, 'base64');
  
  // Try versioned transaction first
  try {
    return VersionedTransaction.deserialize(transactionBuf);
  } catch (e) {
    // Fall back to legacy transaction
    return Transaction.from(transactionBuf);
  }
}

// Format amount for display
export function formatTokenAmount(amount, decimals) {
  return (Number(amount) / Math.pow(10, decimals)).toFixed(6);
}
