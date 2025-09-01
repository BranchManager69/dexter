#!/usr/bin/env node

// Test script for trade manager tools
import { createToolExecutor } from '../core/exec-tools.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Create tool executor
const toolExecutor = createToolExecutor({
  PROJECT_ROOT: path.join(__dirname, '../..'),
  CACHE_TTL_MIN: 5,
  SKIP_OHLCV: false
});

async function testTools() {
  console.log('🧪 Testing Trade Manager Tools\n');
  
  try {
    // Test 1: List managed wallets
    console.log('1. Testing list_managed_wallets...');
    const walletsResult = await toolExecutor.executeTool('list_managed_wallets', {});
    console.log(`   ✅ Found ${walletsResult.count || 0} wallets`);
    
    if (walletsResult.wallets && walletsResult.wallets.length > 0) {
      const testWallet = walletsResult.wallets[0];
      console.log(`   Using wallet ID ${testWallet.id} for tests\n`);
      
      // Test 2: Get wallet balance
      console.log('2. Testing get_wallet_balance...');
      const balanceResult = await toolExecutor.executeTool('get_wallet_balance', {
        wallet_id: testWallet.id
      });
      if (balanceResult.error) {
        console.log(`   ❌ Error: ${balanceResult.error}`);
      } else {
        console.log(`   ✅ Wallet ${balanceResult.address?.substring(0,8)}...`);
        console.log(`      SOL Balance: ${balanceResult.sol} SOL\n`);
      }
      
      // Test 3: Get token price (DUEL)
      console.log('3. Testing get_token_price for DUEL...');
      const priceResult = await toolExecutor.executeTool('get_token_price', {
        token_mint: '7p4FoJ8rCDirhkfeo3FgEsGgRc7EQcWVEaiSk5HDjupx',
        amount_sol: 0.1
      });
      if (priceResult.error) {
        console.log(`   ❌ Error: ${priceResult.error}`);
      } else {
        console.log(`   ✅ 0.1 SOL = ${priceResult.token_amount} DUEL`);
        console.log(`      Price Impact: ${priceResult.price_impact}%\n`);
      }
      
      // Test 4: Check a known transaction (won't execute trades in test)
      console.log('4. Testing get_transaction_status with dummy hash...');
      const statusResult = await toolExecutor.executeTool('get_transaction_status', {
        tx_hash: '5VERwJ3YFqVHvNVpbmhbgAmVu4wWvqhEsTj4qaf9vBqGhXfhMzAkNpfBMj7JqwVHDxQeZxkqynDvpzLjpGmazzaD'
      });
      if (statusResult.error) {
        console.log(`   ❌ Error: ${statusResult.error}`);
      } else {
        console.log(`   ✅ Transaction status: ${statusResult.status}`);
        console.log(`      Confirmed: ${statusResult.confirmed}\n`);
      }
      
      // Note about actual trading
      console.log('📝 Note: execute_buy and execute_sell not tested (would require real funds)');
      console.log('   These use the same Jupiter API integration as pulse-buyer\n');
      
    } else {
      console.log('   ⚠️  No managed wallets found in database\n');
    }
    
    console.log('✅ Test suite completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

// Run tests
testTools();