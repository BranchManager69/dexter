import prisma from '../../config/prisma.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TradeExecutor {
  constructor() {
    this.walletId = null;
    this.walletPublicKey = null;
  }

  /**
   * Initialize with Clanka Trading Wallet
   */
  async initialize() {
    // Find the Clanka Trading Wallet
    const wallet = await prisma.managed_wallets.findFirst({
      where: {
        label: 'Clanka Trading Wallet',
        status: 'active'
      }
    });
    
    if (!wallet) {
      throw new Error('Clanka Trading Wallet not found');
    }
    
    this.walletId = wallet.id;
    this.walletPublicKey = wallet.public_key;
    
    console.log(`[TradeExecutor] Initialized with wallet ${this.walletPublicKey}`);
  }

  /**
   * Execute a buy decision
   */
  async executeBuy(decision) {
    if (!this.walletId) await this.initialize();
    
    console.log(`[TradeExecutor] Executing BUY for ${decision.token_address}`);
    
    // Create execution record
    const execution = await prisma.ai_trade_executions.create({
      data: {
        decision_id: decision.id,
        wallet_id: this.walletId,
        token_address: decision.token_address,
        signature: '', // Will be updated after execution
        transaction_type: 'buy',
        amount_in: decision.amount_sol,
        amount_out: 0, // Will be updated after execution
        token_in: 'So11111111111111111111111111111111111112', // SOL
        token_out: decision.token_address,
        execution_price: 0, // Will be updated
        status: 'pending'
      }
    });
    
    try {
      // Execute the trade using the trading tool
      const result = await this.executeTradeTool({
        action: 'buy',
        wallet_id: this.walletId,
        token_address: decision.token_address,
        amount: Number(decision.amount_sol),
        slippage: Number(decision.slippage_tolerance) * 100 // Convert to percentage
      });
      
      // Update execution record
      await prisma.ai_trade_executions.update({
        where: { id: execution.id },
        data: {
          signature: result.signature,
          amount_out: result.amount_out,
          execution_price: result.execution_price,
          slippage: result.actual_slippage,
          gas_fee: result.gas_fee,
          platform_fee: result.platform_fee,
          position_size_after: result.token_balance,
          status: 'confirmed',
          confirmed_at: new Date()
        }
      });
      
      // Mark decision as executed
      await prisma.ai_trade_decisions.update({
        where: { id: decision.id },
        data: {
          executed: true,
          execution_id: execution.id,
          executed_at: new Date()
        }
      });
      
      console.log(`[TradeExecutor] BUY executed: ${result.signature}`);
      return { ...execution, ...result };
      
    } catch (error) {
      console.error(`[TradeExecutor] BUY failed:`, error);
      
      // Update execution as failed
      await prisma.ai_trade_executions.update({
        where: { id: execution.id },
        data: {
          status: 'failed',
          error_message: error.message
        }
      });
      
      // Mark decision as cancelled
      await prisma.ai_trade_decisions.update({
        where: { id: decision.id },
        data: {
          cancelled: true,
          cancel_reason: `Execution failed: ${error.message}`
        }
      });
      
      throw error;
    }
  }

  /**
   * Execute a sell decision
   */
  async executeSell(position, exitSignal) {
    if (!this.walletId) await this.initialize();
    
    console.log(`[TradeExecutor] Executing SELL for ${position.token_address} (${exitSignal.reason})`);
    
    // Create sell decision
    const decision = await prisma.ai_trade_decisions.create({
      data: {
        token_address: position.token_address,
        decision_type: 'sell',
        action: exitSignal.action,
        confidence_score: 1.0, // Exit signals have full confidence
        confidence_components: {
          exit_reason: exitSignal.reason,
          price_change: exitSignal.priceChange
        },
        amount_sol: 0, // Will be determined by token balance
        slippage_tolerance: 0.03, // 3% for exits
        analysis_data: { exitSignal }
      }
    });
    
    // Create execution record
    const execution = await prisma.ai_trade_executions.create({
      data: {
        decision_id: decision.id,
        wallet_id: this.walletId,
        token_address: position.token_address,
        signature: '', // Will be updated after execution
        transaction_type: 'sell',
        amount_in: 0, // Will be updated after execution
        amount_out: 0, // Will be updated after execution
        token_in: position.token_address,
        token_out: 'So11111111111111111111111111111111111112', // SOL
        execution_price: 0, // Will be updated
        position_size_before: 0, // Will be updated
        status: 'pending'
      }
    });
    
    try {
      // Get current token balance
      const balance = await this.getTokenBalance(position.token_address);
      
      // Execute the trade
      const result = await this.executeTradeTool({
        action: 'sell',
        wallet_id: this.walletId,
        token_address: position.token_address,
        amount: balance, // Sell all
        slippage: 3 // 3% slippage for exits
      });
      
      // Update execution record
      await prisma.ai_trade_executions.update({
        where: { id: execution.id },
        data: {
          signature: result.signature,
          amount_in: balance,
          amount_out: result.amount_out,
          execution_price: result.execution_price,
          slippage: result.actual_slippage,
          gas_fee: result.gas_fee,
          platform_fee: result.platform_fee,
          position_size_before: balance,
          position_size_after: 0,
          status: 'confirmed',
          confirmed_at: new Date()
        }
      });
      
      // Mark decision as executed
      await prisma.ai_trade_decisions.update({
        where: { id: decision.id },
        data: {
          executed: true,
          execution_id: execution.id,
          executed_at: new Date()
        }
      });
      
      console.log(`[TradeExecutor] SELL executed: ${result.signature}`);
      return { ...execution, ...result, decision };
      
    } catch (error) {
      console.error(`[TradeExecutor] SELL failed:`, error);
      
      // Update execution as failed
      await prisma.ai_trade_executions.update({
        where: { id: execution.id },
        data: {
          status: 'failed',
          error_message: error.message
        }
      });
      
      // Mark decision as cancelled
      await prisma.ai_trade_decisions.update({
        where: { id: decision.id },
        data: {
          cancelled: true,
          cancel_reason: `Execution failed: ${error.message}`
        }
      });
      
      throw error;
    }
  }

  /**
   * Execute trade using the trading tool
   */
  async executeTradeTool(params) {
    return new Promise((resolve, reject) => {
      const toolPath = path.join(__dirname, '..', 'core', 'exec-tools.js');
      
      const toolInput = {
        tool: params.action === 'buy' ? 'buy_token_jupiter' : 'sell_token_jupiter',
        parameters: {
          wallet_id: params.wallet_id,
          token_address: params.token_address,
          amount: params.amount,
          slippage_bps: Math.round(params.slippage * 10000) // Convert to basis points
        }
      };
      
      const child = spawn('node', [toolPath], {
        env: { ...process.env }
      });
      
      let output = '';
      let error = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Trade execution failed: ${error || output}`));
          return;
        }
        
        try {
          // Parse the output to extract trade details
          const lines = output.split('\n');
          let result = {
            signature: '',
            amount_out: 0,
            execution_price: 0,
            actual_slippage: 0,
            gas_fee: 0.005, // Estimate
            platform_fee: 0,
            token_balance: 0
          };
          
          // Look for signature in output
          for (const line of lines) {
            if (line.includes('Transaction signature:')) {
              result.signature = line.split(':')[1].trim();
            } else if (line.includes('Amount received:')) {
              result.amount_out = parseFloat(line.match(/[\d.]+/)[0]);
            } else if (line.includes('Execution price:')) {
              result.execution_price = parseFloat(line.match(/[\d.]+/)[0]);
            } else if (line.includes('Token balance:')) {
              result.token_balance = parseFloat(line.match(/[\d.]+/)[0]);
            }
          }
          
          if (!result.signature) {
            // Try parsing as JSON
            const jsonMatch = output.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              result = {
                signature: parsed.signature || parsed.tx || '',
                amount_out: parsed.amount_out || parsed.outputAmount || 0,
                execution_price: parsed.price || 0,
                actual_slippage: parsed.slippage || 0,
                gas_fee: parsed.gas_fee || 0.005,
                platform_fee: parsed.platform_fee || 0,
                token_balance: parsed.balance || 0
              };
            }
          }
          
          if (!result.signature) {
            reject(new Error('No transaction signature in output'));
            return;
          }
          
          resolve(result);
        } catch (parseError) {
          reject(new Error(`Failed to parse trade output: ${parseError.message}`));
        }
      });
      
      // Send input to the tool
      child.stdin.write(JSON.stringify(toolInput));
      child.stdin.end();
    });
  }

  /**
   * Get token balance for the wallet
   */
  async getTokenBalance(tokenAddress) {
    // TODO: Implement actual balance check
    // For now, return the position size from database
    const position = await prisma.ai_trade_performance.findFirst({
      where: {
        token_address: tokenAddress,
        status: 'open'
      },
      include: {
        entry_execution: true
      }
    });
    
    if (position && position.entry_execution) {
      return Number(position.entry_execution.position_size_after || 0);
    }
    
    return 0;
  }

  /**
   * Get wallet SOL balance
   */
  async getWalletBalance() {
    if (!this.walletId) await this.initialize();
    
    // TODO: Implement actual balance check
    // For now, return a mock balance
    return 10.0; // 10 SOL
  }

  /**
   * Check if we have enough balance for a trade
   */
  async hasBalance(amountSol) {
    const balance = await this.getWalletBalance();
    return balance >= amountSol + 0.01; // Keep 0.01 SOL for fees
  }
}