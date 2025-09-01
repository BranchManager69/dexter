#!/usr/bin/env node

// A/B Test for metadata extraction improvements
// Tests current vs proposed extraction without modifying production

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '../reports/ai-token-analyses');
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

// Extract top-level metadata from market data
function extractTopLevelMetadata(market) {
  const metadata = {};
  
  if (market?.top_pool?.baseToken) {
    metadata.symbol = market.top_pool.baseToken.symbol || null;
    metadata.name = market.top_pool.baseToken.name || null;
  }
  
  if (market?.price !== undefined) {
    metadata.price = market.price;
  }
  
  if (market?.vol1h !== undefined) {
    metadata.vol1h = market.vol1h;
  }
  
  if (market?.chain !== undefined) {
    metadata.chain = market.chain;
  }
  
  if (market?.dex !== undefined) {
    metadata.dex = market.dex;
  }
  
  if (market?.pairAddress !== undefined) {
    metadata.pairAddress = market.pairAddress;
  }
  
  return metadata;
}

// Test a single report
function testReport(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    const srcMarket = data.metadata?.market || data.market || {};
    
    // Run both extraction methods
    const current = currentExtraction(srcMarket);
    const enhanced = enhancedExtraction(srcMarket);
    const topLevel = extractTopLevelMetadata(enhanced);
    
    // Analyze differences
    const currentKeys = Object.keys(current).filter(k => current[k] !== null);
    const enhancedKeys = Object.keys(enhanced).filter(k => enhanced[k] !== null);
    const topLevelKeys = Object.keys(topLevel).filter(k => topLevel[k] !== null);
    
    // Check for data loss
    const preservedData = currentKeys.every(key => 
      enhanced[key] !== undefined && enhanced[key] === current[key]
    );
    
    // Count new data
    const newDataCount = enhancedKeys.length - currentKeys.length;
    
    return {
      file: path.basename(filePath),
      mint: data.metadata?.token_address || data.tokenAddress || 'unknown',
      current: {
        fields: currentKeys.length,
        data: current
      },
      enhanced: {
        fields: enhancedKeys.length,
        data: enhanced
      },
      topLevel: {
        fields: topLevelKeys.length,
        data: topLevel
      },
      preservedData,
      newDataCount,
      missingSymbol: !topLevel.symbol && srcMarket?.top_pool?.baseToken?.symbol,
      missingName: !topLevel.name && srcMarket?.top_pool?.baseToken?.name,
      missingPrice: !topLevel.price && srcMarket?.price !== undefined,
      missingVol1h: !topLevel.vol1h && srcMarket?.vol1h !== undefined
    };
  } catch (error) {
    return {
      file: path.basename(filePath),
      error: error.message
    };
  }
}

// Load orchestrator report to check source data
async function checkOrchestratorData(mint) {
  try {
    const files = fs.readdirSync(ORCHESTRATOR_DIR)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => {
        const statA = fs.statSync(path.join(ORCHESTRATOR_DIR, a));
        const statB = fs.statSync(path.join(ORCHESTRATOR_DIR, b));
        return statB.mtimeMs - statA.mtimeMs;
      });
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(ORCHESTRATOR_DIR, file), 'utf8');
      const data = JSON.parse(content);
      
      // Check if this report contains our mint
      if (Array.isArray(data)) {
        const entry = data.find(d => d.address === mint);
        if (entry?.market) {
          return {
            hasSymbol: !!entry.symbol,
            hasName: !!entry.name,
            marketHasBaseToken: !!entry.market.top_pool?.baseToken,
            baseTokenSymbol: entry.market.top_pool?.baseToken?.symbol,
            baseTokenName: entry.market.top_pool?.baseToken?.name,
            hasPrice: entry.market.price !== undefined,
            hasVol1h: entry.market.vol1h !== undefined,
            hasVol24h: entry.market.vol24h !== undefined
          };
        }
      }
    }
  } catch (error) {
    return { error: error.message };
  }
  return null;
}

// Main test runner
async function main() {
  console.log('🧪 A/B Testing Metadata Extraction Enhancement\n');
  console.log('=' .repeat(60));
  
  // Get recent report files
  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('latest-'))
    .sort((a, b) => {
      const statA = fs.statSync(path.join(REPORTS_DIR, a));
      const statB = fs.statSync(path.join(REPORTS_DIR, b));
      return statB.mtimeMs - statA.mtimeMs;
    })
    .slice(0, 10); // Test last 10 reports
  
  console.log(`Testing ${files.length} recent reports...\n`);
  
  const results = [];
  let totalPreserved = 0;
  let totalNewData = 0;
  let symbolsFound = 0;
  let namesFound = 0;
  let pricesFound = 0;
  
  for (const file of files) {
    const result = testReport(path.join(REPORTS_DIR, file));
    results.push(result);
    
    if (result.preservedData) totalPreserved++;
    totalNewData += result.newDataCount || 0;
    if (result.topLevel?.data?.symbol) symbolsFound++;
    if (result.topLevel?.data?.name) namesFound++;
    if (result.topLevel?.data?.price) pricesFound++;
    
    console.log(`📄 ${file}`);
    console.log(`   Mint: ${result.mint}`);
    console.log(`   Current fields: ${result.current?.fields || 0}`);
    console.log(`   Enhanced fields: ${result.enhanced?.fields || 0}`);
    console.log(`   New extractable data: +${result.newDataCount || 0} fields`);
    console.log(`   Data preserved: ${result.preservedData ? '✅' : '❌'}`);
    
    if (result.topLevel?.data?.symbol || result.topLevel?.data?.name) {
      console.log(`   Symbol/Name: ${result.topLevel.data.symbol || 'null'} / ${result.topLevel.data.name || 'null'}`);
    }
    
    // Check orchestrator source
    const orchData = await checkOrchestratorData(result.mint);
    if (orchData?.marketHasBaseToken) {
      console.log(`   📊 Orchestrator has: symbol="${orchData.baseTokenSymbol}", name="${orchData.baseTokenName}"`);
    }
    
    console.log();
  }
  
  // Summary
  console.log('=' .repeat(60));
  console.log('\n📊 SUMMARY\n');
  console.log(`✅ Backward Compatibility: ${totalPreserved}/${files.length} reports preserve all current data`);
  console.log(`📈 Data Enhancement: ${totalNewData} total new fields extracted`);
  console.log(`🏷️  Symbols Found: ${symbolsFound}/${files.length}`);
  console.log(`📝 Names Found: ${namesFound}/${files.length}`);
  console.log(`💰 Prices Found: ${pricesFound}/${files.length}`);
  
  if (totalPreserved === files.length) {
    console.log('\n✅ SAFE TO DEPLOY: All existing data preserved, only additions');
  } else {
    console.log('\n⚠️  WARNING: Some data might be affected, review changes');
  }
  
  // Show example of enhanced metadata structure
  const exampleResult = results.find(r => r.topLevel?.fields > 0);
  if (exampleResult) {
    console.log('\n📋 Example Enhanced Metadata:');
    console.log(JSON.stringify(exampleResult.topLevel.data, null, 2));
  }
}

main().catch(console.error);