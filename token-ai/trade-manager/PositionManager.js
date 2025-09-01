import prisma from '../../config/prisma.js';
import { Connection, PublicKey } from '@solana/web3.js';

export class PositionManager {
  constructor(rpcUrl) {
    this.connection = new Connection(rpcUrl);
    this.positions = new Map(); // token_address -> position data
  }

  /**
   * Load all open positions from database
   */
  async loadOpenPositions() {
    const openPositions = await prisma.ai_trade_performance.findMany({
      where: { status: 'open' },
      include: {
        entry_execution: true
      }
    });
    
    for (const position of openPositions) {
      this.positions.set(position.token_address, position);
    }
    
    console.log(`[PositionManager] Loaded ${openPositions.length} open positions`);
    return openPositions;
  }

  /**
   * Check all open positions for exit conditions
   */
  async checkExitConditions() {
    const strategy = await prisma.ai_strategy_parameters.findFirst({
      where: { is_active: true }
    });
    
    if (!strategy) {
      console.error('[PositionManager] No active strategy found');
      return [];
    }
    
    const exitSignals = [];
    
    for (const [tokenAddress, position] of this.positions) {
      const signal = await this.checkPositionExitConditions(position, strategy);
      if (signal) {
        exitSignals.push(signal);
      }
    }
    
    return exitSignals;
  }

  /**
   * Check exit conditions for a single position
   */
  async checkPositionExitConditions(position, strategy) {
    try {
      // Get current price
      const currentPrice = await this.getCurrentPrice(position.token_address);
      if (!currentPrice) return null;
      
      const entryPrice = Number(position.entry_price);
      const priceChange = (currentPrice - entryPrice) / entryPrice;
      
      // Check stop loss
      const stopLoss = Number(strategy.stop_loss_percentage);
      if (priceChange <= -stopLoss) {
        return {
          position,
          reason: 'stop_loss',
          currentPrice,
          priceChange,
          action: 'market_sell'
        };
      }
      
      // Check take profit
      const takeProfit = Number(strategy.take_profit_percentage);
      if (priceChange >= takeProfit) {
        return {
          position,
          reason: 'take_profit',
          currentPrice,
          priceChange,
          action: 'market_sell'
        };
      }
      
      // Check max holding duration
      const holdingMinutes = (Date.now() - position.entry_timestamp.getTime()) / (1000 * 60);
      const maxHoldHours = strategy.max_hold_duration_hours;
      
      if (holdingMinutes > maxHoldHours * 60) {
        return {
          position,
          reason: 'time_stop',
          currentPrice,
          priceChange,
          action: 'market_sell'
        };
      }
      
      // Update max profit/drawdown
      await this.updatePositionMetrics(position, priceChange);
      
    } catch (error) {
      console.error(`[PositionManager] Error checking exit conditions for ${position.token_address}:`, error);
    }
    
    return null;
  }

  /**
   * Get current price of a token
   */
  async getCurrentPrice(tokenAddress) {
    try {
      // TODO: Integrate with Birdeye or Jupiter price API
      // For now, return a mock price
      return Math.random() * 0.01; // Mock price in SOL
    } catch (error) {
      console.error(`[PositionManager] Error getting price for ${tokenAddress}:`, error);
      return null;
    }
  }

  /**
   * Update position metrics (max profit, max drawdown)
   */
  async updatePositionMetrics(position, currentPriceChange) {
    const maxProfit = Math.max(
      Number(position.max_profit || 0),
      currentPriceChange
    );
    
    const maxDrawdown = Math.min(
      Number(position.max_drawdown || 0),
      currentPriceChange
    );
    
    if (maxProfit !== Number(position.max_profit) || maxDrawdown !== Number(position.max_drawdown)) {
      await prisma.ai_trade_performance.update({
        where: { id: position.id },
        data: {
          max_profit: maxProfit,
          max_drawdown: maxDrawdown
        }
      });
      
      // Update local cache
      position.max_profit = maxProfit;
      position.max_drawdown = maxDrawdown;
    }
  }

  /**
   * Open a new position
   */
  async openPosition(execution, entryAnalysis) {
    const position = await prisma.ai_trade_performance.create({
      data: {
        token_address: execution.token_address,
        entry_execution_id: execution.id,
        entry_price: execution.execution_price,
        entry_amount_sol: execution.amount_in,
        entry_timestamp: execution.confirmed_at || new Date(),
        entry_confidence: execution.decision.confidence_score,
        entry_analysis: entryAnalysis,
        strategy_version: 'v1.0', // TODO: Get from active strategy
        market_regime: this.detectMarketRegime(),
        status: 'open'
      }
    });
    
    // Add to cache
    this.positions.set(execution.token_address, position);
    
    console.log(`[PositionManager] Opened position for ${execution.token_address}`);
    return position;
  }

  /**
   * Close a position
   */
  async closePosition(positionId, exitExecution, exitReason, exitAnalysis = {}) {
    const position = await prisma.ai_trade_performance.findUnique({
      where: { id: positionId }
    });
    
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }
    
    const entryAmount = Number(position.entry_amount_sol);
    const exitAmount = Number(exitExecution.amount_out);
    const pnl = exitAmount - entryAmount;
    const pnlPercentage = (pnl / entryAmount) * 100;
    
    const holdingMinutes = Math.floor(
      (exitExecution.confirmed_at.getTime() - position.entry_timestamp.getTime()) / (1000 * 60)
    );
    
    const updatedPosition = await prisma.ai_trade_performance.update({
      where: { id: positionId },
      data: {
        exit_execution_id: exitExecution.id,
        exit_price: exitExecution.execution_price,
        exit_amount_sol: exitAmount,
        exit_timestamp: exitExecution.confirmed_at,
        exit_reason: exitReason,
        exit_analysis: exitAnalysis,
        pnl_sol: pnl,
        pnl_percentage: pnlPercentage,
        holding_period_minutes: holdingMinutes,
        is_winner: pnl > 0,
        status: 'closed',
        lessons_learned: this.extractLessons(position, exitExecution, pnl)
      }
    });
    
    // Remove from cache
    this.positions.delete(position.token_address);
    
    console.log(`[PositionManager] Closed position for ${position.token_address}: PnL ${pnl.toFixed(4)} SOL (${pnlPercentage.toFixed(2)}%)`);
    return updatedPosition;
  }

  /**
   * Extract lessons learned from a trade
   */
  extractLessons(position, exitExecution, pnl) {
    const lessons = {
      profitable: pnl > 0,
      holding_minutes: Math.floor(
        (exitExecution.confirmed_at.getTime() - position.entry_timestamp.getTime()) / (1000 * 60)
      ),
      entry_confidence: Number(position.entry_confidence),
      max_profit_reached: Number(position.max_profit || 0),
      max_drawdown_reached: Number(position.max_drawdown || 0)
    };
    
    // Patterns to learn
    if (pnl > 0) {
      lessons.winning_patterns = {
        held_through_drawdown: position.max_drawdown < -0.05,
        quick_profit: lessons.holding_minutes < 60,
        high_confidence_win: position.entry_confidence > 0.7
      };
    } else {
      lessons.losing_patterns = {
        stop_loss_hit: position.exit_reason === 'stop_loss',
        time_stop: position.exit_reason === 'time_stop',
        low_confidence_loss: position.entry_confidence < 0.6
      };
    }
    
    return lessons;
  }

  /**
   * Get current portfolio statistics
   */
  async getPortfolioStats() {
    const openPositions = await prisma.ai_trade_performance.findMany({
      where: { status: 'open' }
    });
    
    const closedPositions = await prisma.ai_trade_performance.findMany({
      where: { status: 'closed' }
    });
    
    const totalOpenValue = openPositions.reduce(
      (sum, p) => sum + Number(p.entry_amount_sol),
      0
    );
    
    const totalPnL = closedPositions.reduce(
      (sum, p) => sum + Number(p.pnl_sol || 0),
      0
    );
    
    const winRate = closedPositions.length > 0
      ? closedPositions.filter(p => p.is_winner).length / closedPositions.length
      : 0;
    
    return {
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      totalOpenValue,
      totalPnL,
      winRate,
      avgWin: this.calculateAvgWin(closedPositions),
      avgLoss: this.calculateAvgLoss(closedPositions),
      sharpeRatio: this.calculateSharpeRatio(closedPositions)
    };
  }

  calculateAvgWin(positions) {
    const wins = positions.filter(p => p.is_winner);
    if (wins.length === 0) return 0;
    return wins.reduce((sum, p) => sum + Number(p.pnl_sol), 0) / wins.length;
  }

  calculateAvgLoss(positions) {
    const losses = positions.filter(p => !p.is_winner);
    if (losses.length === 0) return 0;
    return losses.reduce((sum, p) => sum + Number(p.pnl_sol), 0) / losses.length;
  }

  calculateSharpeRatio(positions) {
    if (positions.length < 2) return 0;
    
    const returns = positions.map(p => Number(p.pnl_percentage || 0));
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    // Annualized Sharpe ratio (assuming ~100 trades per year)
    return (avgReturn / stdDev) * Math.sqrt(100);
  }

  /**
   * Detect current market regime
   */
  detectMarketRegime() {
    // TODO: Implement market regime detection based on SOL price action
    // For now, return a default
    return 'neutral';
  }

  /**
   * Get position by token address
   */
  getPosition(tokenAddress) {
    return this.positions.get(tokenAddress);
  }

  /**
   * Check if we have an open position for a token
   */
  hasOpenPosition(tokenAddress) {
    return this.positions.has(tokenAddress);
  }
}