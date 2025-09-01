import prisma from '../../config/prisma.js';

export class TradingDecisionEngine {
  constructor() {
    this.strategy = null;
  }

  async initialize() {
    // Load active strategy parameters
    this.strategy = await prisma.ai_strategy_parameters.findFirst({
      where: { is_active: true }
    });
    
    if (!this.strategy) {
      throw new Error('No active trading strategy found');
    }
    
    console.log(`[TradingDecisionEngine] Initialized with strategy ${this.strategy.version}`);
  }

  /**
   * Analyze a token and decide whether to trade
   * @param {Object} analysis - Token analysis from AI agent
   * @returns {Object|null} Trading decision or null
   */
  async analyzeToken(analysis) {
    if (!this.strategy) await this.initialize();
    
    // Extract scores from analysis
    const branchScore = analysis.branchScore || 0;
    const riskScore = analysis.riskScore || 0;
    const liquidityUSD = analysis.liquidityUSD || 0;
    const volume24hUSD = analysis.volume24hUSD || 0;
    
    // Check minimum requirements
    if (liquidityUSD < Number(this.strategy.min_liquidity_usd)) {
      console.log(`[Decision] ${analysis.tokenAddress}: Liquidity too low ($${liquidityUSD})`);
      return null;
    }
    
    if (volume24hUSD < Number(this.strategy.min_volume_24h_usd)) {
      console.log(`[Decision] ${analysis.tokenAddress}: Volume too low ($${volume24hUSD})`);
      return null;
    }
    
    // Calculate confidence score
    const confidence = this.calculateConfidence(analysis);
    
    if (confidence < Number(this.strategy.min_confidence_score)) {
      console.log(`[Decision] ${analysis.tokenAddress}: Confidence too low (${confidence.toFixed(4)})`);
      return null;
    }
    
    // Check cooldown period
    const recentDecision = await this.checkRecentDecision(analysis.tokenAddress);
    if (recentDecision) {
      console.log(`[Decision] ${analysis.tokenAddress}: Still in cooldown period`);
      return null;
    }
    
    // Determine action type
    const action = this.determineAction(analysis, confidence);
    
    if (!action) {
      console.log(`[Decision] ${analysis.tokenAddress}: No action determined`);
      return null;
    }
    
    // Calculate position size
    const amountSol = this.calculatePositionSize(confidence);
    
    // Create decision
    const decision = {
      token_address: analysis.tokenAddress,
      decision_type: action.type,
      action: action.action,
      confidence_score: confidence,
      confidence_components: {
        technical: this.calculateTechnicalScore(analysis),
        social: this.calculateSocialScore(analysis),
        fundamental: this.calculateFundamentalScore(analysis),
        risk_adjusted: this.calculateRiskAdjustedScore(analysis)
      },
      amount_sol: amountSol,
      slippage_tolerance: this.strategy.max_price_impact,
      analysis_data: analysis,
      indicators: analysis.indicators || {},
      market_conditions: {
        timestamp: new Date(),
        solPrice: analysis.solPrice || null,
        marketCap: analysis.marketCapUSD || null,
        liquidity: liquidityUSD,
        volume24h: volume24hUSD
      }
    };
    
    console.log(`[Decision] ${analysis.tokenAddress}: ${action.type} with confidence ${confidence.toFixed(4)}`);
    return decision;
  }

  /**
   * Calculate overall confidence score
   */
  calculateConfidence(analysis) {
    const technical = this.calculateTechnicalScore(analysis) * Number(this.strategy.technical_weight);
    const social = this.calculateSocialScore(analysis) * Number(this.strategy.social_weight);
    const fundamental = this.calculateFundamentalScore(analysis) * Number(this.strategy.fundamental_weight);
    const risk = this.calculateRiskAdjustedScore(analysis) * Number(this.strategy.risk_weight);
    
    return technical + social + fundamental + risk;
  }

  /**
   * Calculate technical analysis score (0-1)
   */
  calculateTechnicalScore(analysis) {
    let score = 0;
    let factors = 0;
    
    // Price action
    if (analysis.priceChange24h > 0) {
      score += Math.min(analysis.priceChange24h / 100, 1);
      factors++;
    }
    
    // Volume trend
    if (analysis.volumeTrend === 'increasing') {
      score += 0.8;
      factors++;
    } else if (analysis.volumeTrend === 'stable') {
      score += 0.5;
      factors++;
    }
    
    // Support/resistance levels
    if (analysis.nearSupport) {
      score += 0.7;
      factors++;
    }
    
    // RSI
    if (analysis.rsi && analysis.rsi < 30) {
      score += 0.8; // Oversold
      factors++;
    } else if (analysis.rsi && analysis.rsi > 70) {
      score += 0.2; // Overbought
      factors++;
    }
    
    return factors > 0 ? score / factors : 0.5;
  }

  /**
   * Calculate social sentiment score (0-1)
   */
  calculateSocialScore(analysis) {
    // Use branch score as primary social indicator
    const branchScore = (analysis.branchScore || 0) / 100;
    
    let additionalScore = 0;
    let factors = 0;
    
    // Twitter activity
    if (analysis.twitterFollowers > 1000) {
      additionalScore += Math.min(analysis.twitterFollowers / 10000, 1);
      factors++;
    }
    
    // Telegram activity
    if (analysis.telegramMembers > 500) {
      additionalScore += Math.min(analysis.telegramMembers / 5000, 1);
      factors++;
    }
    
    // Website quality
    if (analysis.hasWebsite) {
      additionalScore += 0.6;
      factors++;
    }
    
    if (factors > 0) {
      return branchScore * 0.7 + (additionalScore / factors) * 0.3;
    }
    
    return branchScore;
  }

  /**
   * Calculate fundamental score (0-1)
   */
  calculateFundamentalScore(analysis) {
    let score = 0;
    let factors = 0;
    
    // Market cap to liquidity ratio
    if (analysis.marketCapUSD && analysis.liquidityUSD) {
      const ratio = analysis.liquidityUSD / analysis.marketCapUSD;
      score += Math.min(ratio * 2, 1); // Good if liquidity is >50% of mcap
      factors++;
    }
    
    // Holder distribution
    if (analysis.holderCount > 100) {
      score += Math.min(analysis.holderCount / 1000, 1);
      factors++;
    }
    
    // Token age
    if (analysis.tokenAge) {
      const daysOld = analysis.tokenAge / (24 * 60 * 60 * 1000);
      if (daysOld > 7) score += 0.7; // Survived first week
      else if (daysOld > 1) score += 0.4;
      factors++;
    }
    
    return factors > 0 ? score / factors : 0.5;
  }

  /**
   * Calculate risk-adjusted score (0-1)
   */
  calculateRiskAdjustedScore(analysis) {
    // Invert risk score (lower risk = higher score)
    const riskScore = analysis.riskScore || 10;
    return Math.max(0, (10 - riskScore) / 10);
  }

  /**
   * Determine trading action based on analysis
   */
  determineAction(analysis, confidence) {
    // Check if we already have a position
    // TODO: Check existing positions
    
    // High confidence + good technicals = buy
    if (confidence > 0.7 && this.calculateTechnicalScore(analysis) > 0.6) {
      return { type: 'buy', action: 'market_buy' };
    }
    
    // Medium confidence + oversold = buy
    if (confidence > 0.6 && analysis.rsi && analysis.rsi < 35) {
      return { type: 'buy', action: 'limit_buy' };
    }
    
    return null;
  }

  /**
   * Calculate position size based on confidence
   */
  calculatePositionSize(confidence) {
    const maxSize = Number(this.strategy.max_position_size_sol);
    
    // Linear scaling: 60% confidence = 30% of max, 100% confidence = 100% of max
    const scaleFactor = Math.max(0, (confidence - 0.6) * 2.5);
    return Math.min(maxSize * scaleFactor, maxSize);
  }

  /**
   * Check if we recently made a decision on this token
   */
  async checkRecentDecision(tokenAddress) {
    const cooldownMinutes = this.strategy.decision_cooldown_minutes;
    const cutoffTime = new Date(Date.now() - cooldownMinutes * 60 * 1000);
    
    const recent = await prisma.ai_trade_decisions.findFirst({
      where: {
        token_address: tokenAddress,
        created_at: { gte: cutoffTime }
      },
      orderBy: { created_at: 'desc' }
    });
    
    return recent;
  }

  /**
   * Save decision to database
   */
  async saveDecision(decision) {
    return await prisma.ai_trade_decisions.create({
      data: decision
    });
  }

  /**
   * Check circuit breakers
   */
  async checkCircuitBreakers() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Check daily trade count
    const tradeCount = await prisma.ai_trade_decisions.count({
      where: {
        created_at: { gte: today },
        executed: true
      }
    });
    
    if (tradeCount >= this.strategy.max_daily_trades) {
      console.log('[CircuitBreaker] Daily trade limit reached');
      return false;
    }
    
    // Check daily loss
    const losses = await prisma.ai_trade_performance.aggregate({
      where: {
        created_at: { gte: today },
        status: 'closed',
        is_winner: false
      },
      _sum: { pnl_sol: true }
    });
    
    const totalLoss = Math.abs(losses._sum.pnl_sol || 0);
    if (totalLoss >= Number(this.strategy.max_daily_loss_sol)) {
      console.log('[CircuitBreaker] Daily loss limit reached');
      return false;
    }
    
    // Check consecutive losses
    const recentTrades = await prisma.ai_trade_performance.findMany({
      where: { status: 'closed' },
      orderBy: { created_at: 'desc' },
      take: this.strategy.max_consecutive_losses
    });
    
    const consecutiveLosses = recentTrades.filter(t => !t.is_winner).length;
    if (consecutiveLosses >= this.strategy.max_consecutive_losses) {
      console.log('[CircuitBreaker] Consecutive loss limit reached');
      return false;
    }
    
    return true;
  }
}