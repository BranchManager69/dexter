#!/usr/bin/env node

// Test script to verify that enhanced metadata extraction preserves all data
// and successfully extracts symbol/name from orchestrator reports

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORCHESTRATOR_DIR = path.join(__dirname, '../socials/reports');

// Current extraction logic (what's in production)
function currentExtraction(srcMarket) {
  const fdv = (typeof srcMarket.fdv === 'number') ? srcMarket.fdv : null;
  const liquidity = (typeof srcMarket.liquidity === 'number') ? srcMarket.liquidity : null;
  const volume = (typeof srcMarket.volume24h === 'number') ? srcMarket.volume24h : 
                 (typeof srcMarket.volume_24h === 'number' ? srcMarket.volume_24h : null);
  return { fdv, liquidity, volume24h: volume };
}

// Proposed enhanced extraction
function enhancedExtraction(srcMarket) {
  if (!srcMarket || typeof srcMarket !== 'object') {
    return { fdv: null, liquidity: null, volume24h: null };
  }
  
  // Preserve ALL market data
  const result = { ...srcMarket };
  
  // Normalize volume naming for compatibility
  if ('vol24h' in srcMarket && !('volume24h' in srcMarket)) {
    result.volume24h = srcMarket.vol24h;
  }
  
  return result;
}

// Test with real orchestrator data
function testOrchestratorReport() {
  console.log('📊 Testing with REAL orchestrator data\n');
  console.log('=' .repeat(60));
  
  // Load the most recent orchestrator report with CLANKER token
  const reportPath = path.join(ORCHESTRATOR_DIR, 'orchestrated-analysis-2025-08-28T14-14-49-488Z.json');
  
  if (!fs.existsSync(reportPath)) {
    console.error('❌ Report file not found:', reportPath);
    return;
  }
  
  const content = fs.readFileSync(reportPath, 'utf8');
  const data = JSON.parse(content);
  
  // Find the CLANKER token entry
  const clankerEntry = data.find(d => d.address === '3qq54YqAKG3TcrwNHXFSpMCWoL8gmMuPceJ4FG9npump');
  
  if (!clankerEntry) {
    console.error('❌ CLANKER token not found in report');
    return;
  }
  
  console.log('\n🔍 Source Market Data from Orchestrator:');
  console.log('   Symbol:', clankerEntry.symbol);
  console.log('   Name:', clankerEntry.name);
  console.log('   Market fields:', Object.keys(clankerEntry.market).join(', '));
  console.log('   Has baseToken:', !!clankerEntry.market.top_pool?.baseToken);
  console.log('   BaseToken symbol:', clankerEntry.market.top_pool?.baseToken?.symbol);
  console.log('   BaseToken name:', clankerEntry.market.top_pool?.baseToken?.name);
  
  // Run both extraction methods
  const current = currentExtraction(clankerEntry.market);
  const enhanced = enhancedExtraction(clankerEntry.market);
  
  console.log('\n📦 Current Extraction (Production):');
  console.log('   Fields preserved:', Object.keys(current).filter(k => current[k] !== null));
  console.log('   FDV:', current.fdv);
  console.log('   Liquidity:', current.liquidity);
  console.log('   Volume24h:', current.volume24h);
  console.log('   Has symbol?', 'symbol' in current);
  console.log('   Has name?', 'name' in current);
  console.log('   Has price?', 'price' in current);
  
  console.log('\n✨ Enhanced Extraction (Proposed):');
  console.log('   Fields preserved:', Object.keys(enhanced).filter(k => enhanced[k] !== null));
  console.log('   FDV:', enhanced.fdv);
  console.log('   Liquidity:', enhanced.liquidity);
  console.log('   Volume24h:', enhanced.volume24h);
  console.log('   Price:', enhanced.price);
  console.log('   Vol1h:', enhanced.vol1h);
  console.log('   Chain:', enhanced.top_pool?.chain);
  console.log('   DEX:', enhanced.top_pool?.dex);
  console.log('   Symbol (from baseToken):', enhanced.top_pool?.baseToken?.symbol);
  console.log('   Name (from baseToken):', enhanced.top_pool?.baseToken?.name);
  
  // Check backward compatibility
  // Note: current.volume24h is null because it looks for volume24h but data has vol24h
  // Enhanced version maps vol24h -> volume24h, so we get the data
  const isBackwardCompatible = 
    enhanced.fdv === current.fdv &&
    enhanced.liquidity === current.liquidity &&
    (current.volume24h === null || enhanced.volume24h === current.volume24h);
  
  console.log('\n🔒 Backward Compatibility Check:');
  console.log('   FDV matches:', enhanced.fdv === current.fdv);
  console.log('   Liquidity matches:', enhanced.liquidity === current.liquidity);
  console.log('   Volume24h:', `current=${current.volume24h} vs enhanced=${enhanced.volume24h}`);
  console.log('   Volume24h note: Current is null (bug), enhanced fixes it');
  console.log('   Overall:', isBackwardCompatible ? '✅ SAFE' : '❌ BREAKING');
  
  // Count new data
  const currentFields = Object.keys(current).filter(k => current[k] !== null).length;
  const enhancedFields = Object.keys(enhanced).filter(k => enhanced[k] !== null).length;
  
  console.log('\n📈 Data Enhancement Summary:');
  console.log('   Current fields with data:', currentFields);
  console.log('   Enhanced fields with data:', enhancedFields);
  console.log('   New data points:', enhancedFields - currentFields);
  
  // Show what we can extract from nested structure
  console.log('\n🎯 Extractable Token Information:');
  console.log('   Symbol:', enhanced.top_pool?.baseToken?.symbol || 'Not available');
  console.log('   Name:', enhanced.top_pool?.baseToken?.name || 'Not available');
  console.log('   Price:', enhanced.price || 'Not available');
  console.log('   Chain:', enhanced.top_pool?.chain || 'Not available');
  console.log('   DEX:', enhanced.top_pool?.dex || 'Not available');
  console.log('   Pair Address:', enhanced.top_pool?.pairAddress || 'Not available');
  
  if (isBackwardCompatible && enhancedFields > currentFields) {
    console.log('\n✅ SUCCESS: Enhanced extraction preserves all existing data');
    console.log('            while adding', enhancedFields - currentFields, 'new fields!');
    console.log('\n🚀 READY FOR PRODUCTION: Safe to deploy the enhanced extraction');
  }
}

// Run the test
testOrchestratorReport();