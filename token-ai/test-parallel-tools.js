#!/usr/bin/env node

/**
 * Proof of Concept: Parallel Tool Execution with OpenAI Agents SDK
 * 
 * This demonstrates how the SDK can execute multiple tools in parallel,
 * removing the "one tool per turn" limitation.
 */

import { z } from 'zod';
import { Agent, run, tool } from '@openai/agents';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Model to use
const model = 'gpt-4o-mini'; // Needs to be updated to a better, newer model

// Load environment variables from the parent directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Check for API key
if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_TOKEN) {
  console.error('❌ Error: OPENAI_API_KEY or OPENAI_API_TOKEN must be set in .env file');
  process.exit(1);
}

console.log('✅ API Key loaded successfully\n');

// Define multiple tools that can be called in parallel
const getTokenPriceTool = tool({
  name: 'get_token_price',
  description: 'Get the current price of a token',
  parameters: z.object({ 
    symbol: z.string().describe('Token symbol like BONK, WIF, etc.')
  }),
  execute: async (input) => {
    // Simulate API call with delay
    await new Promise(resolve => setTimeout(resolve, 500));
    const prices = {
      'BONK': '$0.00003421',
      'WIF': '$2.45',
      'JUP': '$0.89',
      'CLANKER': '$0.0234'
    };
    return prices[input.symbol] || 'Price not found';
  },
});

const getTokenLiquidityTool = tool({
  name: 'get_token_liquidity',
  description: 'Get the liquidity of a token',
  parameters: z.object({ 
    symbol: z.string().describe('Token symbol')
  }),
  execute: async (input) => {
    // Simulate API call with delay
    await new Promise(resolve => setTimeout(resolve, 600));
    const liquidity = {
      'BONK': '$45.2M',
      'WIF': '$89.7M',
      'JUP': '$234.5M',
      'CLANKER': '$1.2M'
    };
    return liquidity[input.symbol] || 'Liquidity not found';
  },
});

const getTokenVolumeTool = tool({
  name: 'get_token_volume',
  description: 'Get the 24h trading volume of a token',
  parameters: z.object({ 
    symbol: z.string().describe('Token symbol')
  }),
  execute: async (input) => {
    // Simulate API call with delay
    await new Promise(resolve => setTimeout(resolve, 400));
    const volume = {
      'BONK': '$12.3M',
      'WIF': '$45.6M',
      'JUP': '$78.9M',
      'CLANKER': '$456K'
    };
    return volume[input.symbol] || 'Volume not found';
  },
});

const getSocialSentimentTool = tool({
  name: 'get_social_sentiment',
  description: 'Get social sentiment analysis for a token',
  parameters: z.object({ 
    symbol: z.string().describe('Token symbol')
  }),
  execute: async (input) => {
    // Simulate API call with delay
    await new Promise(resolve => setTimeout(resolve, 700));
    const sentiment = {
      'BONK': 'Bullish (78% positive)',
      'WIF': 'Very Bullish (89% positive)',
      'JUP': 'Neutral (52% positive)',
      'CLANKER': 'Bearish (32% positive)'
    };
    return sentiment[input.symbol] || 'Sentiment not found';
  },
});

// Create an agent with multiple tools
const cryptoAgent = new Agent({
  name: 'Crypto Analyst',
  instructions: `You are a crypto analyst that provides comprehensive token analysis.
When asked about a token, gather ALL relevant data in parallel:
- Current price
- Liquidity
- 24h volume
- Social sentiment

Use all available tools simultaneously to provide fast, comprehensive analysis.`,
  tools: [
    getTokenPriceTool,
    getTokenLiquidityTool,
    getTokenVolumeTool,
    getSocialSentimentTool
  ],
  model: model,
  parallel_tool_calls: true // Explicitly enable parallel tool calls
});

async function testParallelExecution() {
  console.log('🚀 Testing Parallel Tool Execution\n');
  console.log('This will demonstrate calling multiple tools in parallel.\n');
  console.log('=' .repeat(50) + '\n');

  // Test 1: Single token, multiple tools
  console.log('Test 1: Analyzing BONK with all tools in parallel...\n');
  const startTime1 = Date.now();
  
  try {
    const result1 = await run(
      cryptoAgent,
      'Give me a complete analysis of BONK token including price, liquidity, volume, and sentiment.'
    );
    
    const elapsed1 = Date.now() - startTime1;
    console.log('Result:', result1.finalOutput);
    console.log(`\n⏱️  Time taken: ${elapsed1}ms`);
    console.log('(Note: If tools ran sequentially, it would take ~2200ms minimum)\n');
  } catch (error) {
    console.error('Error in Test 1:', error.message);
  }

  console.log('=' .repeat(50) + '\n');

  // Test 2: Multiple tokens comparison
  console.log('Test 2: Comparing multiple tokens in parallel...\n');
  const startTime2 = Date.now();
  
  try {
    const result2 = await run(
      cryptoAgent,
      'Compare WIF and JUP tokens - I need price, liquidity, and volume for both.'
    );
    
    const elapsed2 = Date.now() - startTime2;
    console.log('Result:', result2.finalOutput);
    console.log(`\n⏱️  Time taken: ${elapsed2}ms`);
    console.log('(This would be much slower with sequential execution)\n');
  } catch (error) {
    console.error('Error in Test 2:', error.message);
  }

  console.log('=' .repeat(50) + '\n');
  console.log('✅ Parallel tool execution test complete!');
}

// Run the test
testParallelExecution().catch(console.error);