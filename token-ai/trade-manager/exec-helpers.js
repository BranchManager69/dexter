// token-ai/trade-manager/exec-helpers.js

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token';
import { getQuote, getSwapTransaction, deserializeTransaction, SOL_MINT, SOL_DECIMALS, formatTokenAmount } from './jupiter-api.js';

async function getWalletUtils(){
  const mod = await import('./wallet-utils.js');
  return { loadWallet: mod.loadWallet, listManagedWallets: mod.listManagedWallets };
}

export async function executeSellInternal(args) {
  try {
    const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com');
    const { loadWallet } = await getWalletUtils();
    const { wallet, keypair, publicKey } = await loadWallet(args.wallet_id);

    const tokenMint = new PublicKey(args.token_mint);
    const tokenAccount = await getAssociatedTokenAddress(tokenMint, publicKey);
    const account = await getAccount(connection, tokenAccount);
    const tokenInfo = await connection.getParsedAccountInfo(tokenMint);
    const decimals = tokenInfo.value?.data?.parsed?.info?.decimals || 9;

    let amountToSell;
    if (args.sell_all) {
      amountToSell = account.amount; // BigInt
    } else if (args.token_amount != null) {
      amountToSell = BigInt(Math.floor(Number(args.token_amount) * Math.pow(10, decimals)));
    } else {
      return { error: 'Must specify either token_amount or sell_all=true' };
    }

    const quote = await getQuote({
      inputMint: args.token_mint,
      outputMint: SOL_MINT,
      amount: String(amountToSell),
      slippageBps: args.slippage_bps || 100
    });

    const swapResponse = await getSwapTransaction({
      quoteResponse: quote,
      userPublicKey: publicKey,
      wrapAndUnwrapSol: true,
      priorityLamports: Number(process.env.PRIORITY_LAMPORTS)||10000
    });

    const transaction = deserializeTransaction(swapResponse.swapTransaction);
    transaction.sign([keypair]);
    const serialized = transaction.serialize();
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const signature = await connection.sendRawTransaction(serialized, { skipPreflight: false, maxRetries: 3 });
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');

    return {
      success: true,
      tx_hash: signature,
      wallet_id: wallet.id,
      wallet_address: wallet.public_key,
      action: 'sell',
      token_mint: args.token_mint,
      tokens_sold: formatTokenAmount(amountToSell, decimals),
      sol_received: formatTokenAmount(quote.outAmount, SOL_DECIMALS),
      price_impact: quote.priceImpactPct,
      solscan_url: `https://solscan.io/tx/${signature}`
    };
  } catch (e) {
    return { error: `Failed to execute sell: ${e.message}` };
  }
}

export async function getQuoteSafe({ inputMint, outputMint, amount, slippageBps = 100 }){
  try {
    const quote = await getQuote({ inputMint, outputMint, amount: String(amount), slippageBps });
    return quote;
  } catch (e) {
    return { error: e?.message || 'quote_failed' };
  }
}

