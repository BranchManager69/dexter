#!/usr/bin/env node
import prisma from '../../config/prisma.js';
import { TradingDecisionEngine } from './TradingDecisionEngine.js';
import { PositionManager } from './PositionManager.js';
import { TradeExecutor } from './TradeExecutor.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class TradingMonitor {
  constructor() {
    this.decisionEngine = new TradingDecisionEngine();
    this.positionManager = new PositionManager(process.env.RPC_URL);
    this.executor = new TradeExecutor();
    this.isRunning = false;
    this.scanInterval = 300000; // 5 minutes default
  }

  async initialize() {
    console.log('[Monitor] Initializing trading system...');
    
    // Initialize components
    await this.decisionEngine.initialize();
    await this.executor.initialize();
    await this.positionManager.loadOpenPositions();
    
    // Load scan interval from strategy
    const strategy = await prisma.ai_strategy_parameters.findFirst({
      where: { is_active: true }
    });
    
    if (strategy) {
      this.scanInterval = strategy.scan_interval_seconds * 1000;
    }
    
    console.log(`[Monitor] Initialized. Scan interval: ${this.scanInterval / 1000}s`);
  }

  /**
   * Main monitoring loop
   */
  async start() {
    if (this.isRunning) {
      console.log('[Monitor] Already running');
      return;
    }
    
    this.isRunning = true;
    console.log('[Monitor] Starting autonomous trading monitor...');
    
    while (this.isRunning) {
      try {
        await this.runCycle();
      } catch (error) {
        console.error('[Monitor] Cycle error:', error);
      }
      
      // Wait for next cycle
      await this.sleep(this.scanInterval);
    }
  }

  /**
   * Run a single monitoring cycle
   */
  async runCycle() {
    console.log(`[Monitor] Running cycle at ${new Date().toISOString()}`);
    
    // 1. Check circuit breakers
    const canTrade = await this.decisionEngine.checkCircuitBreakers();
    if (!canTrade) {
      console.log('[Monitor] Circuit breakers active, skipping trades');
      return;
    }
    
    // 2. Check exit conditions for open positions
    await this.checkExitConditions();
    
    // 3. Scan for new opportunities
    await this.scanForOpportunities();
    
    // 4. Log portfolio stats
    await this.logPortfolioStats();
  }

  /**
   * Check and execute exit conditions
   */
  async checkExitConditions() {
    console.log('[Monitor] Checking exit conditions...');
    
    const exitSignals = await this.positionManager.checkExitConditions();
    
    for (const signal of exitSignals) {
      try {
        console.log(`[Monitor] Exit signal for ${signal.position.token_address}: ${signal.reason}`);
        
        // Execute sell
        const execution = await this.executor.executeSell(signal.position, signal);
        
        // Close position
        await this.positionManager.closePosition(
          signal.position.id,
          execution,
          signal.reason,
          { signal }
        );
        
      } catch (error) {
        console.error(`[Monitor] Failed to execute exit for ${signal.position.token_address}:`, error);
      }
    }
  }

  /**
   * Scan for new trading opportunities
   */
  async scanForOpportunities() {
    console.log('[Monitor] Scanning for opportunities...');
    
    // Get recent token analyses
    const recentAnalyses = await prisma.ai_token_analyses.findMany({
      where: {
        created_at: {
          gte: new Date(Date.now() - 30 * 60 * 1000) // Last 30 minutes
        },
        branch_score: { gte: 50 }, // Minimum quality
        risk_score: { lte: 7 } // Maximum risk
      },
      orderBy: {
        created_at: 'desc'
      },
      take: 10
    });
    
    console.log(`[Monitor] Found ${recentAnalyses.length} recent analyses`);
    
    for (const analysis of recentAnalyses) {
      try {
        // Skip if we already have a position
        if (this.positionManager.hasOpenPosition(analysis.token_address)) {
          continue;
        }
        
        // Parse analysis JSON
        const analysisData = typeof analysis.analysis_json === 'string' 
          ? JSON.parse(analysis.analysis_json) 
          : analysis.analysis_json;
        
        // Add scores from database
        analysisData.branchScore = analysis.branch_score;
        analysisData.riskScore = analysis.risk_score;
        analysisData.tokenAddress = analysis.token_address;
        
        // Get decision from engine
        const decision = await this.decisionEngine.analyzeToken(analysisData);
        
        if (decision) {
          await this.executeTrade(decision);
        }
        
      } catch (error) {
        console.error(`[Monitor] Error processing ${analysis.token_address}:`, error);
      }
    }
    
    // Also trigger a fresh token scan
    await this.triggerTokenScan();
  }

  /**
   * Trigger a fresh token scan
   */
  async triggerTokenScan() {
    console.log('[Monitor] Triggering fresh token scan...');
    
    try {
      // Get trending tokens from Jupiter or DexScreener
      const tokens = await this.getTrendingTokens();
      
      for (const token of tokens.slice(0, 3)) { // Analyze top 3
        if (this.positionManager.hasOpenPosition(token.address)) {
          continue;
        }
        
        console.log(`[Monitor] Analyzing ${token.symbol} (${token.address})`);
        
        // Run AI analysis
        const analysis = await this.runTokenAnalysis(token.address);
        if (!analysis) continue;
        
        // Get trading decision
        const decision = await this.decisionEngine.analyzeToken(analysis);
        
        if (decision) {
          await this.executeTrade(decision);
        }
      }
      
    } catch (error) {
      console.error('[Monitor] Token scan error:', error);
    }
  }

  /**
   * Get trending tokens to analyze
   */
  async getTrendingTokens() {
    // TODO: Integrate with Jupiter or DexScreener API
    // For now, return empty array
    return [];
  }

  /**
   * Run AI analysis on a token
   */
  async runTokenAnalysis(tokenAddress) {
    return new Promise((resolve) => {
      const agentPath = path.join(__dirname, '..', 'index.js');
      
      console.log(`[Monitor] Running AI analysis for ${tokenAddress}`);
      
      const child = spawn('node', [agentPath, tokenAddress, '--json-only'], {
        env: { ...process.env }
      });
      
      let output = '';
      
      child.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      child.on('close', (code) => {
        if (code !== 0) {
          console.error(`[Monitor] Analysis failed for ${tokenAddress}`);
          resolve(null);
          return;
        }
        
        try {
          // Extract JSON from output
          const jsonMatch = output.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            resolve(analysis);
          } else {
            resolve(null);
          }
        } catch (error) {
          console.error(`[Monitor] Failed to parse analysis for ${tokenAddress}:`, error);
          resolve(null);
        }
      });
    });
  }

  /**
   * Execute a trading decision
   */
  async executeTrade(decision) {
    try {
      // Check wallet balance
      const hasBalance = await this.executor.hasBalance(Number(decision.amount_sol));
      if (!hasBalance) {
        console.log('[Monitor] Insufficient balance for trade');
        return;
      }
      
      // Save decision to database
      const savedDecision = await this.decisionEngine.saveDecision(decision);
      
      // Execute buy
      console.log(`[Monitor] Executing ${decision.decision_type} for ${decision.token_address}`);
      const execution = await this.executor.executeBuy(savedDecision);
      
      // Open position
      await this.positionManager.openPosition(execution, decision.analysis_data);
      
      // Send alert
      await this.sendTradeAlert(decision, execution);
      
    } catch (error) {
      console.error('[Monitor] Trade execution failed:', error);
    }
  }

  /**
   * Send trade alert to dashboard
   */
  async sendTradeAlert(decision, execution) {
    try {
      const event = {
        type: 'trade_executed',
        data: {
          token_address: decision.token_address,
          action: decision.decision_type,
          amount_sol: decision.amount_sol,
          confidence: decision.confidence_score,
          signature: execution.signature,
          timestamp: new Date()
        }
      };
      
      // Send to dashboard via HTTP event
      await fetch('http://localhost:3333/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-agent-token': 'clanka'
        },
        body: JSON.stringify(event)
      });
      
    } catch (error) {
      console.error('[Monitor] Failed to send alert:', error);
    }
  }

  /**
   * Log portfolio statistics
   */
  async logPortfolioStats() {
    const stats = await this.positionManager.getPortfolioStats();
    
    console.log('[Monitor] Portfolio Stats:');
    console.log(`  Open positions: ${stats.openPositions}`);
    console.log(`  Open value: ${stats.totalOpenValue.toFixed(4)} SOL`);
    console.log(`  Total P&L: ${stats.totalPnL.toFixed(4)} SOL`);
    console.log(`  Win rate: ${(stats.winRate * 100).toFixed(1)}%`);
    console.log(`  Sharpe ratio: ${stats.sharpeRatio.toFixed(2)}`);
  }

  /**
   * Stop the monitor
   */
  stop() {
    console.log('[Monitor] Stopping...');
    this.isRunning = false;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  const monitor = new TradingMonitor();
  
  // Handle shutdown gracefully
  process.on('SIGINT', () => {
    console.log('\n[Monitor] Received SIGINT, shutting down...');
    monitor.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n[Monitor] Received SIGTERM, shutting down...');
    monitor.stop();
    process.exit(0);
  });
  
  try {
    await monitor.initialize();
    await monitor.start();
  } catch (error) {
    console.error('[Monitor] Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(console.error);
}

export { TradingMonitor };