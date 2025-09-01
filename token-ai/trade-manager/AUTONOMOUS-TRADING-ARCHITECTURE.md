# Autonomous Trading System Architecture

## Overview
This document outlines the architecture for transforming the token-ai analysis system into a fully autonomous trading agent capable of making decisions, executing trades, tracking performance, and learning from outcomes.

## Vision Statement
Create a self-improving trading system that:
- Continuously analyzes tokens using existing token-ai infrastructure
- Makes autonomous buy/sell/hold decisions based on comprehensive analysis
- Executes trades with proper risk management
- Tracks performance and learns from both successes and failures
- Adapts strategy parameters based on empirical results

## System Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                     MONITORING LAYER                         │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Scanner   │  │   Watchlist  │  │  Position    │       │
│  │   Module    │  │   Manager    │  │   Tracker    │       │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘       │
│         └─────────────────┴─────────────────┘               │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                     DECISION ENGINE                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Signal    │  │  Confidence  │  │   Position   │       │
│  │  Extractor  │  │  Calculator  │  │    Sizer     │       │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘       │
│         └─────────────────┴─────────────────┘               │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                    EXECUTION LAYER                           │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │    Trade    │  │     Risk     │  │   Slippage   │       │
│  │   Executor  │  │   Manager    │  │   Control    │       │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘       │
│         └─────────────────┴─────────────────┘               │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                    LEARNING SYSTEM                           │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Performance │  │   Pattern    │  │   Strategy   │       │
│  │   Tracker   │  │ Recognition  │  │   Adapter    │       │
│  └─────────────┘  └──────────────┘  └──────────────┘       │
└──────────────────────────────────────────────────────────────┘
```

## Phase 1: Decision Infrastructure (Week 1)

### 1.1 Database Schema

```sql
-- Core decision tracking
CREATE TABLE ai_trade_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint VARCHAR(64) NOT NULL,
  token_symbol VARCHAR(32),
  decision_type ENUM('buy', 'sell', 'hold', 'skip') NOT NULL,
  confidence_score DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
  
  -- Market snapshot at decision time
  price_at_decision DECIMAL(20,10),
  mcap_at_decision BIGINT,
  volume_24h BIGINT,
  liquidity_usd DECIMAL(20,2),
  
  -- Analysis scores
  branch_score INTEGER,
  risk_score INTEGER,
  sentiment_score INTEGER,
  technical_score INTEGER,
  
  -- Position sizing
  recommended_amount_sol DECIMAL(10,6),
  position_size_reasoning TEXT,
  
  -- Full analysis context
  analysis_json JSONB,
  signals_json JSONB,
  
  -- Execution tracking
  executed BOOLEAN DEFAULT false,
  execution_id UUID,
  skip_reason TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Actual trade executions
CREATE TABLE ai_trade_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID REFERENCES ai_trade_decisions(id),
  wallet_id UUID NOT NULL,
  
  -- Trade details
  trade_type ENUM('buy', 'sell') NOT NULL,
  token_mint VARCHAR(64) NOT NULL,
  sol_amount DECIMAL(10,6),
  token_amount DECIMAL(20,10),
  
  -- Execution details
  price_executed DECIMAL(20,10),
  expected_price DECIMAL(20,10),
  slippage_bps INTEGER,
  slippage_actual DECIMAL(5,2),
  
  -- Transaction data
  transaction_hash VARCHAR(128) UNIQUE,
  block_time TIMESTAMP,
  
  -- Results
  success BOOLEAN NOT NULL,
  error_message TEXT,
  gas_used DECIMAL(10,6),
  
  executed_at TIMESTAMP DEFAULT NOW()
);

-- Performance tracking
CREATE TABLE ai_trade_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID REFERENCES ai_trade_executions(id),
  token_mint VARCHAR(64) NOT NULL,
  
  -- Entry details
  entry_price DECIMAL(20,10),
  entry_time TIMESTAMP,
  entry_mcap BIGINT,
  
  -- Exit details (NULL if still holding)
  exit_price DECIMAL(20,10),
  exit_time TIMESTAMP,
  exit_reason TEXT, -- 'target_hit', 'stop_loss', 'time_stop', 'sentiment_flip'
  
  -- Performance metrics
  pnl_sol DECIMAL(10,6),
  pnl_percent DECIMAL(10,2),
  max_gain_percent DECIMAL(10,2),
  max_drawdown_percent DECIMAL(10,2),
  hold_duration_minutes INTEGER,
  
  -- Opportunity analysis
  best_exit_price DECIMAL(20,10),
  best_exit_time TIMESTAMP,
  opportunity_cost DECIMAL(10,6),
  
  -- Learning
  outcome_category ENUM('big_win', 'win', 'breakeven', 'loss', 'big_loss', 'rug'),
  lessons_learned TEXT,
  pattern_matches TEXT[],
  
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Strategy parameters (evolving based on learning)
CREATE TABLE ai_strategy_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_name VARCHAR(64) NOT NULL,
  parameter_value DECIMAL(10,4),
  
  -- Context
  market_condition TEXT, -- 'bull', 'bear', 'crab'
  token_category TEXT, -- 'meme', 'utility', 'hybrid'
  
  -- Performance tracking
  trades_count INTEGER DEFAULT 0,
  win_rate DECIMAL(5,2),
  avg_gain DECIMAL(10,2),
  sharpe_ratio DECIMAL(5,2),
  
  -- Adaptation
  last_adjusted TIMESTAMP,
  adjustment_reason TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(parameter_name, market_condition, token_category)
);
```

### 1.2 Decision Module

```javascript
// token-ai/trade-manager/decision-engine.js

export class TradingDecisionEngine {
  constructor(config = {}) {
    // Position sizing limits
    this.maxPositionSol = config.maxPositionSol || 0.05;
    this.minPositionSol = config.minPositionSol || 0.005;
    this.maxPortfolioRisk = config.maxPortfolioRisk || 0.20;
    
    // Confidence thresholds
    this.minBuyConfidence = config.minBuyConfidence || 0.65;
    this.minSellConfidence = config.minSellConfidence || 0.60;
    
    // Risk parameters
    this.defaultStopLoss = config.defaultStopLoss || 0.10; // 10%
    this.defaultTakeProfit = config.defaultTakeProfit || 0.30; // 30%
  }

  async analyzeAndDecide(tokenMint, analysis) {
    // Extract all signals
    const signals = await this.extractSignals(analysis);
    
    // Calculate multi-factor confidence
    const confidence = this.calculateConfidence(signals);
    
    // Make decision
    const decision = this.determineAction(signals, confidence);
    
    // Size the position if buying
    const position = decision.action === 'buy' 
      ? await this.sizePosition(signals, confidence)
      : null;
    
    // Set exit parameters
    const exitStrategy = decision.action === 'buy'
      ? this.planExitStrategy(signals, confidence)
      : null;
    
    // Generate reasoning
    const reasoning = this.explainDecision(decision, signals, confidence);
    
    return {
      tokenMint,
      decision: decision.action,
      confidence,
      position,
      exitStrategy,
      reasoning,
      signals,
      timestamp: new Date()
    };
  }

  extractSignals(analysis) {
    return {
      // Technical signals from OHLCV
      technical: {
        trend: this.identifyTrend(analysis.ohlcv),
        momentum: this.calculateMomentum(analysis.ohlcv),
        volume: this.analyzeVolumeProfile(analysis.ohlcv),
        support: this.findSupportLevel(analysis.ohlcv),
        resistance: this.findResistanceLevel(analysis.ohlcv),
        volatility: this.calculateVolatility(analysis.ohlcv)
      },
      
      // Social sentiment signals
      social: {
        sentiment: analysis.memeSignals?.vibe,
        engagement: analysis.communicationAnalysis?.engagement,
        narrativeHeat: analysis.memeSignals?.narrativeHeat,
        coordinationStyle: analysis.memeSignals?.coordinationStyle,
        communitySize: analysis.communityMetrics?.totalMembers
      },
      
      // Fundamental analysis
      fundamental: {
        branchScore: analysis.branchScore || 0,
        riskScore: analysis.riskScore || 10,
        tokenType: analysis.tokenType,
        marketCap: analysis.market?.fdv,
        liquidity: analysis.market?.liquidity,
        volumeToMcap: (analysis.market?.vol24h || 0) / (analysis.market?.fdv || 1)
      },
      
      // Red/green flags
      flags: {
        redFlags: analysis.redFlags || [],
        greenFlags: analysis.greenFlags || [],
        flagBalance: (analysis.greenFlags?.length || 0) - (analysis.redFlags?.length || 0)
      }
    };
  }

  calculateConfidence(signals) {
    let confidence = 0;
    let weight = 0;
    
    // Technical confidence (40% weight)
    const technicalScore = this.scoreTechnicals(signals.technical);
    confidence += technicalScore * 0.4;
    weight += 0.4;
    
    // Social confidence (30% weight for memes, 15% for others)
    const socialWeight = signals.fundamental.tokenType === 'meme' ? 0.3 : 0.15;
    const socialScore = this.scoreSocials(signals.social);
    confidence += socialScore * socialWeight;
    weight += socialWeight;
    
    // Fundamental confidence (20% weight)
    const fundamentalScore = this.scoreFundamentals(signals.fundamental);
    confidence += fundamentalScore * 0.2;
    weight += 0.2;
    
    // Risk adjustment (10% weight)
    const riskAdjustment = (10 - signals.fundamental.riskScore) / 10;
    confidence += riskAdjustment * 0.1;
    weight += 0.1;
    
    // Normalize to 0-1
    return Math.min(Math.max(confidence / weight, 0), 1);
  }

  determineAction(signals, confidence) {
    const { technical, fundamental, social } = signals;
    
    // Strong sell signals override everything
    if (this.hasStrongSellSignals(signals)) {
      return { action: 'sell', urgency: 'immediate' };
    }
    
    // Check if we meet buy criteria
    if (confidence >= this.minBuyConfidence) {
      // Additional checks for buying
      if (technical.trend === 'up' && fundamental.liquidity > 50000) {
        return { action: 'buy', urgency: 'normal' };
      }
    }
    
    // Check hold conditions
    if (confidence >= 0.5 && confidence < this.minBuyConfidence) {
      return { action: 'hold', urgency: 'monitor' };
    }
    
    // Default to skip
    return { action: 'skip', urgency: 'low' };
  }

  async sizePosition(signals, confidence) {
    const { fundamental, technical } = signals;
    
    // Base position size
    let positionSol = this.minPositionSol;
    
    // Scale by confidence (linear scaling)
    positionSol *= (confidence / 0.65); // Normalize to min confidence
    
    // Adjust for risk score (inverse relationship)
    const riskMultiplier = Math.max(0.5, (10 - fundamental.riskScore) / 10);
    positionSol *= riskMultiplier;
    
    // Adjust for liquidity (ensure we don't move market)
    const maxLiquidityImpact = 0.01; // Max 1% of liquidity
    const liquidityLimit = (fundamental.liquidity || 10000) * maxLiquidityImpact / 200; // Assuming SOL at $200
    positionSol = Math.min(positionSol, liquidityLimit);
    
    // Cap at maximum
    positionSol = Math.min(positionSol, this.maxPositionSol);
    
    // Round to reasonable precision
    return Math.round(positionSol * 1000000) / 1000000;
  }

  planExitStrategy(signals, confidence) {
    const { technical, fundamental } = signals;
    
    // Dynamic stop loss based on volatility
    const stopLoss = Math.min(
      this.defaultStopLoss * (1 + technical.volatility),
      0.15 // Max 15% stop loss
    );
    
    // Multiple take profit targets
    const targets = [
      {
        percent: 0.15,
        amount: 0.33, // Sell 33% at +15%
        reason: 'conservative_target'
      },
      {
        percent: 0.30,
        amount: 0.33, // Sell 33% at +30%
        reason: 'moderate_target'
      },
      {
        percent: 0.60,
        amount: 0.34, // Sell remaining at +60%
        reason: 'aggressive_target'
      }
    ];
    
    // Time-based exit
    const maxHoldTime = fundamental.tokenType === 'meme' 
      ? 4 * 60 // 4 hours for memes
      : 24 * 60; // 24 hours for others
    
    return {
      stopLoss,
      targets,
      maxHoldTime,
      trailingStop: confidence > 0.75 // Enable trailing stop for high confidence
    };
  }
}
```

## Phase 2: Execution System (Week 2-3)

### 2.1 Trade Executor

```javascript
// token-ai/trade-manager/trade-executor.js

export class TradeExecutor {
  constructor(walletManager, jupiterApi) {
    this.walletManager = walletManager;
    this.jupiterApi = jupiterApi;
    this.pendingTrades = new Map();
  }

  async executeBuy(decision, dryRun = false) {
    const { tokenMint, position, confidence } = decision;
    
    // Pre-flight checks
    const checks = await this.performPreflightChecks(decision);
    if (!checks.passed) {
      return { success: false, reason: checks.reason };
    }
    
    // Get wallet
    const wallet = await this.walletManager.getTradeWallet();
    
    // Check balance
    const balance = await this.getSOLBalance(wallet);
    if (balance < position + 0.001) { // Include gas
      return { success: false, reason: 'insufficient_balance' };
    }
    
    if (dryRun) {
      return { 
        success: true, 
        dryRun: true, 
        wouldExecute: {
          action: 'buy',
          token: tokenMint,
          amount: position,
          estimatedTokens: await this.estimateTokensReceived(tokenMint, position)
        }
      };
    }
    
    // Execute the trade
    try {
      const result = await this.jupiterApi.swapSOLForToken({
        wallet,
        tokenMint,
        solAmount: position,
        slippageBps: 100
      });
      
      // Record execution
      await this.recordExecution(decision, result);
      
      return {
        success: true,
        transaction: result.txHash,
        executed: {
          solSpent: position,
          tokensReceived: result.tokensReceived,
          price: position / result.tokensReceived
        }
      };
    } catch (error) {
      return {
        success: false,
        reason: error.message,
        error
      };
    }
  }

  async executeSell(position, decision, dryRun = false) {
    // Similar structure to executeBuy but selling tokens for SOL
    // Handles partial sells based on exit strategy targets
  }

  async performPreflightChecks(decision) {
    const checks = [];
    
    // Check if token is still tradeable
    checks.push(await this.checkTokenActive(decision.tokenMint));
    
    // Check if we already have a position
    checks.push(await this.checkExistingPosition(decision.tokenMint));
    
    // Check if market conditions have changed dramatically
    checks.push(await this.checkMarketDrift(decision));
    
    // Check slippage estimate
    checks.push(await this.checkExpectedSlippage(decision));
    
    const failed = checks.find(c => !c.passed);
    return failed || { passed: true };
  }
}
```

### 2.2 Position Manager

```javascript
// token-ai/trade-manager/position-manager.js

export class PositionManager {
  constructor(executor, analyzer) {
    this.executor = executor;
    this.analyzer = analyzer;
    this.positions = new Map();
  }

  async updatePositions() {
    // Get all active positions from database
    const activePositions = await this.getActivePositions();
    
    for (const position of activePositions) {
      // Get fresh analysis
      const analysis = await this.analyzer.quickAnalyze(position.tokenMint);
      
      // Check exit conditions
      const exitSignal = await this.checkExitConditions(position, analysis);
      
      if (exitSignal.shouldExit) {
        await this.executeExit(position, exitSignal);
      } else {
        // Update trailing stop if applicable
        await this.updateTrailingStop(position, analysis);
      }
    }
  }

  async checkExitConditions(position, analysis) {
    const currentPrice = analysis.market.price;
    const entryPrice = position.entryPrice;
    const holdTime = Date.now() - position.entryTime;
    
    // Check stop loss
    if (currentPrice <= entryPrice * (1 - position.stopLoss)) {
      return { shouldExit: true, reason: 'stop_loss', urgency: 'immediate' };
    }
    
    // Check take profit targets
    for (const target of position.targets) {
      if (!target.executed && currentPrice >= entryPrice * (1 + target.percent)) {
        return { 
          shouldExit: true, 
          reason: 'target_hit', 
          partial: true,
          amount: target.amount 
        };
      }
    }
    
    // Check time stop
    if (holdTime > position.maxHoldTime * 60000) {
      return { shouldExit: true, reason: 'time_stop', urgency: 'normal' };
    }
    
    // Check sentiment flip
    if (analysis.memeSignals?.vibe === 'desperation' && position.entrySentiment !== 'desperation') {
      return { shouldExit: true, reason: 'sentiment_flip', urgency: 'high' };
    }
    
    // Check volume death (80% drop)
    if (analysis.market.vol1h < position.entryVolume * 0.2) {
      return { shouldExit: true, reason: 'volume_death', urgency: 'high' };
    }
    
    return { shouldExit: false };
  }
}
```

## Phase 3: Monitoring Loop (Week 4)

### 3.1 Main Monitor

```javascript
// token-ai/trade-manager/monitor.js

export class TradingMonitor {
  constructor(config) {
    this.scanner = new TokenScanner(config);
    this.analyzer = new TokenAnalyzer(config);
    this.decisionEngine = new TradingDecisionEngine(config);
    this.executor = new TradeExecutor(config);
    this.positionManager = new PositionManager(config);
    this.learningSystem = new LearningSystem(config);
    
    this.isRunning = false;
    this.config = config;
  }

  async start() {
    this.isRunning = true;
    console.log('🚀 Autonomous Trading System Started');
    
    while (this.isRunning) {
      try {
        // 1. Update existing positions
        await this.positionManager.updatePositions();
        
        // 2. Scan for new opportunities
        const candidates = await this.scanner.findCandidates();
        
        // 3. Analyze and decide on candidates
        for (const token of candidates.slice(0, 5)) { // Limit concurrent analysis
          await this.analyzeAndTrade(token);
        }
        
        // 4. Learn from recent trades
        await this.learningSystem.reviewRecentTrades();
        
        // 5. Adaptive sleep based on market conditions
        await this.adaptiveSleep();
        
      } catch (error) {
        console.error('Monitor loop error:', error);
        await this.handleError(error);
      }
    }
  }

  async analyzeAndTrade(tokenMint) {
    // Run full analysis
    const analysis = await this.analyzer.analyze(tokenMint);
    
    // Make decision
    const decision = await this.decisionEngine.analyzeAndDecide(tokenMint, analysis);
    
    // Store decision
    await this.storeDecision(decision);
    
    // Execute if confident
    if (decision.decision === 'buy' && decision.confidence >= this.config.minTradeConfidence) {
      const result = await this.executor.executeBuy(decision, this.config.dryRun);
      
      if (result.success) {
        console.log(`✅ Bought ${tokenMint}: ${result.executed.tokensReceived} tokens for ${decision.position} SOL`);
      }
    }
  }

  async adaptiveSleep() {
    // Base sleep time
    let sleepMs = 60000; // 1 minute base
    
    // Adjust based on market volatility
    const volatility = await this.getMarketVolatility();
    if (volatility > 0.5) {
      sleepMs = 30000; // 30 seconds in volatile markets
    } else if (volatility < 0.1) {
      sleepMs = 120000; // 2 minutes in quiet markets
    }
    
    // Adjust based on position count
    const positionCount = await this.positionManager.getActiveCount();
    if (positionCount > 5) {
      sleepMs = Math.min(sleepMs, 45000); // More frequent checks with more positions
    }
    
    await new Promise(resolve => setTimeout(resolve, sleepMs));
  }
}
```

### 3.2 Token Scanner

```javascript
// token-ai/trade-manager/scanner.js

export class TokenScanner {
  constructor(config) {
    this.config = config;
    this.recentlyAnalyzed = new Set();
  }

  async findCandidates() {
    const candidates = [];
    
    // Source 1: Trending on DexScreener
    const trending = await this.getTrendingTokens();
    candidates.push(...trending);
    
    // Source 2: Volume spikes
    const volumeSpikes = await this.findVolumeSpikes();
    candidates.push(...volumeSpikes);
    
    // Source 3: Social mentions
    const socialBuzz = await this.findSocialBuzz();
    candidates.push(...socialBuzz);
    
    // Source 4: Technical breakouts
    const breakouts = await this.findBreakouts();
    candidates.push(...breakouts);
    
    // Deduplicate and filter
    const unique = [...new Set(candidates)];
    
    // Filter out recently analyzed
    const fresh = unique.filter(token => {
      if (this.recentlyAnalyzed.has(token)) return false;
      this.recentlyAnalyzed.add(token);
      
      // Clear after 30 minutes
      setTimeout(() => this.recentlyAnalyzed.delete(token), 30 * 60000);
      return true;
    });
    
    // Prioritize by initial metrics
    return this.prioritizeCandidates(fresh);
  }

  async getTrendingTokens() {
    // Fetch from DexScreener API
    const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/trending');
    const data = await response.json();
    
    return data.tokens
      .filter(t => t.chainId === 'solana')
      .filter(t => t.fdv > 100000 && t.fdv < 10000000) // Sweet spot market cap
      .filter(t => t.volume24h > 50000) // Minimum volume
      .map(t => t.address);
  }
}
```

## Phase 4: Learning System (Week 5-6)

### 4.1 Performance Analyzer

```javascript
// token-ai/trade-manager/learning-system.js

export class LearningSystem {
  constructor(config) {
    this.config = config;
  }

  async reviewRecentTrades() {
    // Get trades from last 24 hours
    const recentTrades = await this.getRecentTrades(24);
    
    for (const trade of recentTrades) {
      // Calculate actual vs optimal performance
      const performance = await this.analyzeTradePerformance(trade);
      
      // Identify patterns
      const patterns = this.identifyPatterns(trade, performance);
      
      // Store lessons
      await this.recordLessons(trade, performance, patterns);
      
      // Update strategy parameters if needed
      await this.adaptStrategy(patterns);
    }
  }

  async analyzeTradePerformance(trade) {
    const currentPrice = await this.getCurrentPrice(trade.tokenMint);
    const priceHistory = await this.getPriceHistory(trade.tokenMint, trade.entryTime);
    
    // Calculate metrics
    const actualReturn = (trade.exitPrice - trade.entryPrice) / trade.entryPrice;
    const maxPrice = Math.max(...priceHistory.map(p => p.price));
    const optimalReturn = (maxPrice - trade.entryPrice) / trade.entryPrice;
    const efficiency = actualReturn / optimalReturn;
    
    // Categorize outcome
    let category;
    if (actualReturn > 0.5) category = 'big_win';
    else if (actualReturn > 0.1) category = 'win';
    else if (actualReturn > -0.05) category = 'breakeven';
    else if (actualReturn > -0.2) category = 'loss';
    else category = 'big_loss';
    
    return {
      actualReturn,
      optimalReturn,
      efficiency,
      category,
      maxDrawdown: this.calculateMaxDrawdown(priceHistory, trade.entryPrice),
      timeToOptimal: this.findTimeToPrice(priceHistory, maxPrice)
    };
  }

  identifyPatterns(trade, performance) {
    const patterns = [];
    
    // Entry patterns
    if (trade.signals.technical.momentum > 0.7 && performance.actualReturn > 0.2) {
      patterns.push('high_momentum_entry_success');
    }
    
    if (trade.signals.social.sentiment === 'party' && performance.actualReturn > 0.3) {
      patterns.push('party_sentiment_profitable');
    }
    
    // Exit patterns
    if (trade.exitReason === 'stop_loss' && performance.optimalReturn > 0.3) {
      patterns.push('premature_stop_loss');
    }
    
    if (trade.exitReason === 'time_stop' && Math.abs(performance.actualReturn) < 0.05) {
      patterns.push('effective_time_stop');
    }
    
    // Risk patterns
    if (trade.signals.fundamental.liquidity < 50000 && performance.category === 'big_loss') {
      patterns.push('low_liquidity_high_risk');
    }
    
    return patterns;
  }

  async adaptStrategy(patterns) {
    // Count pattern frequencies
    const patternCounts = await this.getPatternFrequencies(patterns);
    
    // Adjust parameters based on patterns
    for (const [pattern, count] of patternCounts) {
      if (pattern === 'premature_stop_loss' && count > 5) {
        // Widen stop loss slightly
        await this.adjustParameter('stop_loss_percent', 0.01, 'increase');
      }
      
      if (pattern === 'party_sentiment_profitable' && count > 10) {
        // Increase weight of sentiment in meme tokens
        await this.adjustParameter('sentiment_weight_meme', 0.05, 'increase');
      }
      
      if (pattern === 'low_liquidity_high_risk' && count > 3) {
        // Increase minimum liquidity requirement
        await this.adjustParameter('min_liquidity', 10000, 'increase');
      }
    }
  }
}
```

## Implementation Timeline

### Day 1: Core Infrastructure (Hours 0-24) ✅ COMPLETED

**🎯 DAY 1 STATUS: CORE COMPLETE**
- ✅ Database: 4 tables created with migrations
- ✅ Decision Engine: TradingDecisionEngine.js with confidence scoring
- ✅ Position Manager: PositionManager.js tracking open/closed positions  
- ✅ Trade Executor: TradeExecutor.js integrated with Jupiter
- ✅ Monitor Loop: monitor.js autonomous trading loop
- ✅ Circuit Breakers: Safety limits implemented
- ⏳ Token-AI Integration: Pending flag addition
- ⏳ Dashboard: Not yet implemented

**Files Created:**
- `/token-ai/trade-manager/TradingDecisionEngine.js` - Decision making with confidence scores
- `/token-ai/trade-manager/PositionManager.js` - Position tracking and exit management
- `/token-ai/trade-manager/TradeExecutor.js` - Trade execution via Jupiter
- `/token-ai/trade-manager/monitor.js` - Main autonomous loop

**Database Tables Added:**
- `ai_trade_decisions` - All trading decisions
- `ai_trade_executions` - Actual trade executions  
- `ai_trade_performance` - Position P&L tracking
- `ai_strategy_parameters` - Configurable strategy (v1.0 active)

#### Morning Sprint (Hours 0-8): Foundation & Decision Layer

**Database Schema Creation** ⏰ 1 hour ✅ COMPLETED
- [x] Run migrations for all 4 tables (ai_trade_decisions, ai_trade_executions, ai_trade_performance, ai_strategy_parameters)
- [x] Add indexes for token_address, created_at, execution_id, status, is_active
- [x] Test with sample inserts (created default strategy v1.0 with ID 182ebc5e-a671-443b-95d9-8bfa238f66d0)
- [x] **Done when**: Can insert/query a test decision in <50ms ✅ Verified

**Decision Engine Implementation** ⏰ 2 hours ✅ COMPLETED
- [x] Port the TradingDecisionEngine class exactly as specified in `/token-ai/trade-manager/TradingDecisionEngine.js`
- [x] Implement calculateTechnicalScore(), calculateSocialScore(), calculateFundamentalScore(), calculateRiskAdjustedScore()
- [x] Create calculateConfidence() with weighted scoring (40% technical, 30% social, 20% fundamental, 10% risk)
- [x] Add determineAction() with buy/sell logic based on confidence and RSI
- [x] **Done when**: Engine outputs decision JSON with confidence score for test token ✅ Complete

**Token-AI Integration** ⏰ 1 hour
- [ ] Add `--decision` flag to index.js
- [ ] Append tradeDecision object to final analysis JSON
- [ ] Include: action, confidence, amount_sol, reasoning, targets, stopLoss, timeframe
- [ ] **Done when**: `node index.js TOKEN --decision` outputs analysis WITH trade decision

**Position Sizing Logic** ⏰ 1 hour ✅ COMPLETED
- [x] Implement dynamic sizing in calculatePositionSize() method
- [x] Linear scaling: 60% confidence = 30% of max, 100% confidence = 100% of max
- [x] Set bounds: 0.5 SOL max (configurable via max_position_size_sol in strategy params)
- [x] **Done when**: Given confidence 0.72 and risk 6, outputs valid position size ✅ Implemented

**Trade Executor Base** ⏰ 3 hours ✅ COMPLETED
- [x] Create TradeExecutor class with executeBuy/executeSell methods in `/token-ai/trade-manager/TradeExecutor.js`
- [x] Integrate Jupiter swaps via exec-tools.js subprocess execution
- [x] Add pre-flight checks: wallet balance check, position duplicate check
- [x] Wire up to Clanka Trading Wallet (finds by label "Clanka Trading Wallet")
- [x] **Done when**: Can execute paper trade with full logging ✅ Complete

#### Afternoon Sprint (Hours 8-16): Execution & Management

**Wallet Management Integration** ⏰ 30 minutes ✅ COMPLETED
- [x] Connect to managed_wallets table via Prisma
- [x] Find wallet by label "Clanka Trading Wallet"
- [x] Add hasBalance() and getWalletBalance() methods
- [x] **Done when**: Can read balance and decrypt key in <100ms ✅ Integrated

**Dry Run Mode** ⏰ 1 hour
- [ ] Add `dryRun` flag to all execution methods
- [ ] Log what WOULD happen without executing
- [ ] Calculate estimated tokens, fees, slippage
- [ ] **Done when**: Dry run shows full trade simulation without spending SOL

**Position Tracker** ⏰ 2 hours ✅ COMPLETED
- [ ] Create PositionManager class
- [ ] Implement getActivePositions() from database
- [ ] Add updatePositions() method that runs every 30 seconds
- [ ] Store entry price, time, size, current P&L
- [ ] **Done when**: Can track 5 concurrent positions with real-time P&L

**Exit Strategy Implementation** ⏰ 2.5 hours
- [ ] Implement checkExitConditions() with 5 exit types:
  - Stop loss: price < entry * 0.9
  - Target hit: price > entry * 1.3 (partial exits at 15%, 30%, 60%)
  - Time stop: held > 4 hours for memes, 24 hours for others
  - Sentiment flip: vibe changes to "desperation"
  - Volume death: 1h volume < 20% of entry volume
- [ ] **Done when**: Position exits automatically on any condition

**Partial Exit Logic** ⏰ 2 hours
- [ ] Implement multi-target selling (33% at +15%, 33% at +30%, 34% at +60%)
- [ ] Update position size in database after partial
- [ ] Recalculate stop loss after partials
- [ ] **Done when**: Can execute 3-tier exit on a test position

#### Evening Sprint (Hours 16-24): Monitoring & Deployment

**Main Monitor Loop** ⏰ 2 hours
- [ ] Create monitor.js with start/stop methods
- [ ] Implement main while loop with error handling
- [ ] Add graceful shutdown on SIGINT
- [ ] Include health checks every minute
- [ ] **Done when**: Loop runs continuously for 1 hour without crashes

**Token Scanner Implementation** ⏰ 3 hours
- [ ] Implement 4 candidate sources:
  - DexScreener trending (filter: Solana, 100K-10M mcap, >50K volume)
  - Volume spike detection (>5x average)
  - Social buzz via Twitter mentions
  - Technical breakouts (price above 20-period high)
- [ ] Deduplicate candidates
- [ ] Track recently analyzed (30-min cooldown)
- [ ] **Done when**: Returns 10-20 unique candidates per scan

**Candidate Prioritization** ⏰ 1 hour
- [ ] Score by: volume/mcap ratio, social heat, technical setup
- [ ] Sort by composite score
- [ ] Limit to top 5 for analysis
- [ ] **Done when**: Best opportunities bubble to top consistently

**Adaptive Timing** ⏰ 1 hour
- [ ] Base: 60-second loop
- [ ] Volatile market (>50% hourly change): 30 seconds
- [ ] Quiet market (<10% daily change): 120 seconds
- [ ] Many positions (>5): cap at 45 seconds
- [ ] **Done when**: Timing adjusts based on conditions

**Initial Deployment** ⏰ 1 hour
- [ ] Deploy to PM2 with paper trading flag
- [ ] Set up logs in token-ai/logs/trading/
- [ ] Configure 0.001 SOL position sizes
- [ ] Start monitoring first 10 trades
- [ ] **Done when**: System running autonomously in paper mode

### Day 2: Intelligence Layer (Hours 24-48)

#### Morning Sprint (Hours 24-32): Learning System Core

**Performance Analyzer** ⏰ 2 hours
- [ ] Create LearningSystem class with reviewRecentTrades() method
- [ ] Implement analyzeTradePerformance() calculating:
  - Actual return vs optimal return (best possible exit)
  - Efficiency score (actual/optimal)
  - Max drawdown during hold
  - Time to optimal price
- [ ] Categorize outcomes: big_win (>50%), win (>10%), breakeven (-5% to 10%), loss (-20% to -5%), big_loss (<-20%)
- [ ] **Done when**: Can analyze last 24h trades and output efficiency scores

**Pattern Recognition** ⏰ 2.5 hours
- [ ] Implement identifyPatterns() with 10 initial patterns:
  - Entry: high_momentum_success, party_sentiment_profitable, volume_spike_entry
  - Exit: premature_stop_loss, effective_time_stop, panic_sell
  - Risk: low_liquidity_loss, rug_pull_detected
  - Success: breakout_continuation, support_bounce
- [ ] Store pattern occurrences with context in database
- [ ] Track pattern success rates
- [ ] **Done when**: Identifies 3+ patterns from paper trades

**Strategy Adaptation Engine** ⏰ 2 hours
- [ ] Create adaptStrategy() that adjusts parameters based on patterns:
  - If premature_stop_loss > 5 times: widen stop by 1%
  - If party_sentiment_profitable > 10 times: increase sentiment weight 5%
  - If low_liquidity_loss > 3 times: raise min liquidity by 10K
- [ ] Log all adjustments with reasoning
- [ ] Set minimum sample size (10 instances) before adapting
- [ ] **Done when**: Makes first parameter adjustment based on patterns

**Lesson Storage** ⏰ 1.5 hours
- [ ] Create lessons table linking trades to patterns
- [ ] Implement recordLessons() storing:
  - What worked (patterns that led to profit)
  - What failed (patterns that led to loss)
  - Market conditions during trade
- [ ] Add queryLessons() for retrieving relevant past experiences
- [ ] **Done when**: 20+ lessons stored and retrievable

#### Afternoon Sprint (Hours 32-40): Safety & Monitoring

**Error Handling System** ⏰ 1.5 hours
- [ ] Wrap all async functions in try-catch
- [ ] Create error categories: CRITICAL, WARNING, INFO
- [ ] Implement retry logic with exponential backoff for network errors
- [ ] Add dead letter queue for failed trades
- [ ] **Done when**: System gracefully handles 10 different error types

**Circuit Breakers** ⏰ 2 hours ✅ COMPLETED
- [x] Implement circuit breakers via checkCircuitBreakers() in TradingDecisionEngine:
  - Stop after 3 consecutive losses (max_consecutive_losses)
  - Pause if daily loss > 1 SOL (max_daily_loss_sol)
  - Halt if daily trades > 10 (max_daily_trades)
  - Configurable via ai_strategy_parameters table
  - Emergency stop via pause_on_circuit_break flag
- [x] Circuit breaker checks run before each trade
- [x] Log all circuit breaker events
- [x] **Done when**: Each breaker tested and triggers correctly ✅ Complete

**Real-Time Dashboard** ⏰ 2.5 hours ⚠️ **TIME BOXED - NO FANCY UI**
- [ ] Create simple HTML dashboard at /trade-manager/dashboard.html
- [ ] Display only essential metrics:
  - Active positions with live P&L
  - Recent decisions (last 10)
  - Total portfolio value
  - Win rate and daily P&L
- [ ] Update via WebSocket every second
- [ ] **Done when**: Shows live data, no styling needed

**Analytics Dashboard** ⏰ 2 hours ⚠️ **TIME BOXED - DATA ONLY**
- [ ] Create /trade-manager/analytics.html
- [ ] Show only:
  - Pattern success rates (table)
  - Hourly P&L chart (basic line chart)
  - Top 5 winning/losing trades
  - Parameter evolution over time
- [ ] Static refresh every minute
- [ ] **Done when**: Data visible, no beautification

#### Evening Sprint (Hours 40-48): Optimization & Enhancement

**Multi-Source Discovery** ⏰ 2 hours
- [ ] Add 3 more candidate sources:
  - Fresh listings (tokens < 1 hour old with > $10K volume)
  - Whale activity (wallets > $100K making moves)
  - Influencer mentions (track 10 key accounts)
- [ ] Weight sources by historical success
- [ ] **Done when**: Candidate pool increases by 50%

**Correlation Analysis** ⏰ 2 hours
- [ ] Implement cross-token correlation checker
- [ ] Avoid buying similar tokens (correlation > 0.7)
- [ ] Track SOL correlation for market beta adjustment
- [ ] Identify leading/lagging indicators
- [ ] **Done when**: Prevents duplicate exposure

**Backtesting Framework** ⏰ 2 hours
- [ ] Create historical test harness
- [ ] Load last 7 days of data
- [ ] Simulate trades with actual slippage
- [ ] Compare strategy variations
- [ ] **Done when**: Can test strategy on 100 historical decisions

**Execution Speed Optimization** ⏰ 2 hours
- [ ] Profile all hot paths
- [ ] Parallelize independent operations
- [ ] Cache frequent database queries (5-min TTL)
- [ ] Optimize OHLCV calculations
- [ ] **Done when**: Full cycle < 10 seconds per token

### Day 3: Production Deployment (Hours 48-72)

#### Morning Sprint (Hours 48-56): Testing & Validation

**Comprehensive Test Suite** ⏰ 2 hours
- [ ] Run unit tests on all classes:
  - DecisionEngine: 20 test cases for different market scenarios
  - TradeExecutor: Mock Jupiter API responses
  - PositionManager: Exit condition triggers
  - LearningSystem: Pattern recognition accuracy
- [ ] Integration tests with test database
- [ ] Load test with 100 concurrent tokens
- [ ] **Done when**: 95% test coverage, all passing

**Paper Trading Validation** ⏰ 2 hours
- [ ] Execute 50 paper trades on live data
- [ ] Verify decision logging completeness
- [ ] Check position tracking accuracy
- [ ] Validate P&L calculations
- [ ] **Done when**: 50 trades executed, all data verified

**Safety Mechanism Testing** ⏰ 2 hours
- [ ] Trigger each circuit breaker manually:
  - Force 3 consecutive losses
  - Simulate 5% daily loss
  - Create high slippage scenario
  - Generate error spam
  - Test emergency stop
- [ ] Verify auto-recovery works
- [ ] Confirm all events logged
- [ ] **Done when**: All breakers tested 3x each

**Performance Tuning** ⏰ 2 hours
- [ ] Profile database queries, add missing indexes
- [ ] Optimize hot paths identified by profiler
- [ ] Reduce API calls via batching
- [ ] Tune garbage collection settings
- [ ] **Done when**: 90% of operations < 100ms

#### Afternoon Sprint (Hours 56-64): Real Money Launch

**Initial Real Deployment** ⏰ 1.5 hours
- [ ] Set position size to 0.001 SOL (~ $0.20)
- [ ] Enable real trading flag in config
- [ ] Deploy via PM2 with auto-restart
- [ ] Set up separate log streams for trades
- [ ] **Done when**: First real trade executes

**Live Execution Monitoring** ⏰ 2.5 hours
- [ ] Watch first 10 real trades execute:
  - Verify slippage matches estimates
  - Check transaction confirmations
  - Monitor gas costs
  - Track execution latency
- [ ] Compare paper vs real performance
- [ ] Document any discrepancies
- [ ] **Done when**: 10 trades complete with data

**Parameter Adjustment** ⏰ 2 hours
- [ ] Based on first 10 trades, adjust:
  - Confidence thresholds if too conservative/aggressive
  - Slippage tolerances if consistently off
  - Position sizes if fills are problematic
  - Exit targets if premature/late
- [ ] Update config without restart
- [ ] **Done when**: Parameters optimized for live market

**Learning System Activation** ⏰ 2 hours
- [ ] Enable pattern recording on real trades
- [ ] Start efficiency tracking
- [ ] Activate adaptation engine (observation mode)
- [ ] Begin lesson generation
- [ ] **Done when**: Learning from real trades

#### Evening Sprint (Hours 64-72): Scale & Monitor

**Gradual Scale-Up** ⏰ 2 hours
- [ ] Hour 64-66: Increase to 0.005 SOL positions
- [ ] Hour 66-68: Increase to 0.01 SOL positions
- [ ] Hour 68-70: Increase to 0.02 SOL positions
- [ ] Monitor fill quality at each level
- [ ] **Done when**: Trading at target size

**Full Autonomous Mode** ⏰ 2 hours
- [ ] Remove all manual approval requirements
- [ ] Enable 24/7 operation
- [ ] Set max daily loss limit (0.1 SOL initially)
- [ ] Configure auto-recovery from errors
- [ ] **Done when**: Running without intervention for 2 hours

**Alert System Setup** ⏰ 2 hours
- [ ] Configure alerts for:
  - Large wins (> 50% gain)
  - Large losses (> 20% loss)
  - Circuit breaker triggers
  - Error rate spikes
  - Unusual patterns detected
- [ ] Set up Telegram/Discord notifications
- [ ] Create alert fatigue prevention (grouping/throttling)
- [ ] **Done when**: Receiving relevant alerts only

**Operational Documentation** ⏰ 2 hours ⚠️ **TIME BOXED - ESSENTIAL ONLY**
- [ ] Create README with:
  - Start/stop commands
  - Config parameter meanings
  - Common error fixes
  - Emergency procedures
  - Performance metrics to watch
- [ ] Add inline code comments for complex logic
- [ ] Document API rate limits and quotas
- [ ] **Done when**: New engineer can operate system

## Configuration

### Initial Conservative Settings
```javascript
{
  // Position sizing
  maxPositionSol: 0.01,        // Start with 0.01 SOL max
  minPositionSol: 0.005,        // Minimum 0.005 SOL
  maxPortfolioRisk: 0.10,       // Max 10% portfolio at risk
  
  // Confidence thresholds
  minBuyConfidence: 0.70,       // Require 70% confidence to buy
  minSellConfidence: 0.60,      // 60% confidence to sell
  
  // Risk management
  defaultStopLoss: 0.08,        // 8% stop loss
  defaultTakeProfit: 0.25,      // 25% take profit
  maxConcurrentPositions: 3,    // Max 3 positions at once
  
  // Monitoring
  scanInterval: 60000,          // Scan every minute
  positionCheckInterval: 30000, // Check positions every 30s
  
  // Learning
  learningEnabled: true,        // Enable learning system
  adaptationThreshold: 10,      // Need 10 instances before adapting
  
  // Safety
  dryRun: true,                 // Start in dry-run mode
  paperTradingDays: 7           // Paper trade for 7 days first
}
```

## Monitoring & Observability

### Key Metrics to Track
- Win rate (% profitable trades)
- Average return per trade
- Maximum drawdown
- Sharpe ratio
- Time in position (average hold time)
- Slippage analysis
- Pattern success rates

### Dashboards
1. **Real-time Dashboard** (`/trade-manager/dashboard`)
   - Active positions
   - Recent decisions
   - P&L tracker
   - Market conditions

2. **Analytics Dashboard** (`/trade-manager/analytics`)
   - Historical performance
   - Pattern analysis
   - Strategy parameter evolution
   - Learning system insights

## Safety Features

### Circuit Breakers
- Stop trading after 3 consecutive losses
- Pause if daily loss exceeds 5%
- Halt if slippage exceeds 3%
- Emergency stop button

### Risk Controls
- Maximum position size limits
- Portfolio concentration limits
- Correlation checks (avoid similar tokens)
- Liquidity requirements

### Audit Trail
- Every decision logged with full context
- All trades recorded with execution details
- Performance tracked against benchmarks
- Learning system adjustments documented

## Next Steps

1. **Review and approve architecture**
2. **Set up development environment**
3. **Create test harness with historical data**
4. **Implement Phase 1 (Decision Infrastructure)**
5. **Begin paper trading**
6. **Iterate based on paper trading results**
7. **Deploy with minimal real funds**
8. **Scale gradually based on performance**

## Success Criteria

### Day 1 (Hours 0-24)
- Database fully operational with all tables
- Decision engine making accurate confidence assessments
- Successfully executing paper trades
- Monitor loop running continuously

### Day 2 (Hours 24-48)
- Pattern recognition identifying at least 3 patterns
- Dashboard showing real-time positions and P&L
- Circuit breakers tested and functional
- 50+ paper trade decisions executed

### Day 3 (Hours 48-72)
- First real trades executed successfully
- Learning system making first adaptations
- Fully autonomous operation achieved
- Positive returns on initial positions

## Resources & References

- [Jupiter API Documentation](https://station.jup.ag/docs)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [DexScreener API](https://docs.dexscreener.com/)
- [Risk Management Best Practices](https://www.investopedia.com/articles/trading/09/risk-management.asp)

---

*This architecture is designed to be modular, testable, and gradually deployable. Start small, test thoroughly, and scale based on proven performance.*