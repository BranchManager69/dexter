#!/usr/bin/env node

// Dry run script to recover missing metadata from orchestrator reports
// Matches analysis reports with orchestrator reports and shows what can be recovered

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANALYSIS_DIR = path.join(__dirname, '../reports/ai-token-analyses');
const ORCHESTRATOR_DIR = path.join(__dirname, '../socials/reports');

// Helper to parse timestamp from filename
function parseTimestamp(filename) {
  const match = filename.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
  if (match) {
    // Convert format like 2025-08-28T14-20-36 to 2025-08-28T14:20:36
    const [date, time] = match[1].split('T');
    const fixedTime = time.replace(/-/g, ':');
    return new Date(`${date}T${fixedTime}`);
  }
  return null;
}

// Find matching orchestrator report for an analysis
function findMatchingOrchestrator(mint, analysisTime) {
  const orchestratorFiles = fs.readdirSync(ORCHESTRATOR_DIR)
    .filter(f => f.startsWith('orchestrated-analysis-') && f.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a)); // Sort newest first
  
  let closestMatch = null;
  let closestTimeDiff = Infinity;
  
  for (const file of orchestratorFiles) {
    try {
      const content = fs.readFileSync(path.join(ORCHESTRATOR_DIR, file), 'utf8');
      const data = JSON.parse(content);
      
      // Check if this report contains our mint
      if (Array.isArray(data)) {
        const entry = data.find(d => d.address === mint);
        if (entry?.market) {
          const orchTime = parseTimestamp(file);
          if (!orchTime) continue;
          
          // Find the closest time match (within 30 minutes either direction)
          const timeDiff = Math.abs(analysisTime - orchTime);
          if (timeDiff <= 30 * 60 * 1000 && timeDiff < closestTimeDiff) {
            closestMatch = { file, data: entry, timeDiff: Math.floor(timeDiff / 1000) };
            closestTimeDiff = timeDiff;
          }
        }
      }
    } catch (e) {
      // Skip invalid files
    }
  }
  return closestMatch;
}

// Main recovery function
function recoverMetadata() {
  console.log('🔍 Scanning for recoverable metadata...\n');
  console.log('=' .repeat(70));
  
  // Get recent analysis files
  const analysisFiles = fs.readdirSync(ANALYSIS_DIR)
    .filter(f => f.startsWith('gpt5-analysis-') && f.endsWith('.json'))
    .sort((a, b) => {
      const statA = fs.statSync(path.join(ANALYSIS_DIR, a));
      const statB = fs.statSync(path.join(ANALYSIS_DIR, b));
      return statB.mtimeMs - statA.mtimeMs;
    })
    .slice(0, 20); // Check last 20 reports
  
  let recoverable = 0;
  let notRecoverable = 0;
  const results = [];
  
  for (const file of analysisFiles) {
    try {
      const analysisPath = path.join(ANALYSIS_DIR, file);
      const content = fs.readFileSync(analysisPath, 'utf8');
      const analysis = JSON.parse(content);
      
      const mint = analysis.metadata?.token_address || analysis.tokenAddress;
      const analysisTime = parseTimestamp(file);
      
      if (!mint || !analysisTime) continue;
      
      // Check current state
      const currentMarket = analysis.metadata?.market || {};
      const hasFullData = currentMarket.top_pool?.baseToken?.symbol;
      
      if (hasFullData) {
        console.log(`✅ ${file.substring(0, 50)}...`);
        console.log(`   Already has full metadata (fixed version)\n`);
        continue;
      }
      
      // Try to find matching orchestrator report
      const match = findMatchingOrchestrator(mint, analysisTime);
      
      if (match) {
        recoverable++;
        const recoveredData = {
          symbol: match.data.symbol,
          name: match.data.name,
          price: match.data.market.price,
          vol1h: match.data.market.vol1h,
          vol24h: match.data.market.vol24h,
          chain: match.data.market.top_pool?.chain,
          dex: match.data.market.top_pool?.dex,
          baseTokenSymbol: match.data.market.top_pool?.baseToken?.symbol,
          baseTokenName: match.data.market.top_pool?.baseToken?.name
        };
        
        results.push({
          analysisFile: file,
          orchestratorFile: match.file,
          mint,
          recoveredData
        });
        
        console.log(`🔧 ${file.substring(0, 50)}...`);
        console.log(`   Mint: ${mint.substring(0, 10)}...`);
        console.log(`   Current: fdv=${currentMarket.fdv}, liquidity=${currentMarket.liquidity}, volume24h=${currentMarket.volume24h}`);
        console.log(`   Can recover from: ${match.file} (${match.timeDiff}s before analysis)`);
        console.log(`   - Symbol: ${recoveredData.symbol}`);
        console.log(`   - Name: ${recoveredData.name}`);
        console.log(`   - Price: ${recoveredData.price}`);
        console.log(`   - Vol24h: ${recoveredData.vol24h}`);
        console.log(`   - Chain/DEX: ${recoveredData.chain}/${recoveredData.dex}\n`);
      } else {
        notRecoverable++;
        console.log(`❌ ${file.substring(0, 50)}...`);
        console.log(`   No matching orchestrator report found\n`);
      }
    } catch (e) {
      console.log(`⚠️  Error processing ${file}: ${e.message}\n`);
    }
  }
  
  console.log('=' .repeat(70));
  console.log('\n📊 RECOVERY SUMMARY\n');
  console.log(`✅ Recoverable: ${recoverable} reports`);
  console.log(`❌ Not recoverable: ${notRecoverable} reports`);
  console.log(`📁 Total scanned: ${analysisFiles.length} reports`);
  
  if (recoverable > 0) {
    console.log('\n💡 RECOMMENDATION:');
    console.log('We can recover metadata for', recoverable, 'reports!');
    console.log('Run the actual recovery script to update these files.');
    
    console.log('\n📋 Sample of recoverable data:');
    results.slice(0, 3).forEach(r => {
      console.log(`\n${r.analysisFile}:`);
      console.log(`  Symbol: ${r.recoveredData.symbol}`);
      console.log(`  Name: ${r.recoveredData.name}`);
      console.log(`  Price: $${r.recoveredData.price}`);
    });
  }
  
  return results;
}

// Run the dry run
const results = recoverMetadata();

// Save recovery plan for potential use
if (results.length > 0) {
  const planPath = path.join(__dirname, 'metadata-recovery-plan.json');
  fs.writeFileSync(planPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Recovery plan saved to: ${planPath}`);
}