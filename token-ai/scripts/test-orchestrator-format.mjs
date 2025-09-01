#!/usr/bin/env node

// Test script to verify the formatted orchestrator output

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from parent .env file that has everything
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// Test token - using CLANKER since we have data for it
const TEST_MINT = '3qq54YqAKG3TcrwNHXFSpMCWoL8gmMuPceJ4FG9npump';

async function testOrchestratorFormat() {
  console.log('🧪 Testing Enhanced Orchestrator Output\n');
  console.log('=' .repeat(60));
  
  try {
    // Run orchestrator
    console.log('Running orchestrator for test token...\n');
    
    const output = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        path.join(__dirname, '../socials/orchestrator.js'),
        TEST_MINT,
        '--steps=market,twitter',  // Just market and twitter for quick test
        '--x-concurrency=1'
      ], {
        cwd: path.join(__dirname, '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env  // Pass current environment (after dotenv loaded)
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });
      
      child.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`Orchestrator exited ${code}: ${stderr.slice(0, 200)}`));
      });
      
      child.on('error', (e) => reject(e));
    });
    
    // Extract report path
    const match = output.match(/REPORT_FILE:(.+)$/m);
    if (!match) {
      console.error('❌ No report file found in output');
      return;
    }
    
    const reportPath = match[1].trim();
    console.log(`✅ Report generated: ${path.basename(reportPath)}\n`);
    
    // Load and format the data
    const json = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const data = Array.isArray(json) ? json[0] : json;
    
    // Import the formatter
    const { formatOrchestratorData } = await import('../core/format-orchestrator.js');
    
    // Generate formatted summary
    const formatted = formatOrchestratorData(data);
    
    console.log('📄 FORMATTED SUMMARY:');
    console.log('-' .repeat(60));
    console.log(formatted);
    console.log('-' .repeat(60));
    
    // Check what the AI would receive
    console.log('\n📊 ANALYSIS:');
    console.log(`Original JSON size: ${JSON.stringify(data).length} chars`);
    console.log(`Formatted text size: ${formatted.length} chars`);
    
    // Verify tweets are not truncated
    if (data.twitter?.recentTweets) {
      const tweets = data.twitter.recentTweets;
      console.log(`\n✅ Found ${tweets.length} tweets`);
      
      // Check if all tweet text is in the formatted output
      let allTweetsIncluded = true;
      tweets.forEach((tweet, idx) => {
        if (!formatted.includes(tweet.text)) {
          console.log(`❌ Tweet ${idx + 1} text missing or truncated!`);
          allTweetsIncluded = false;
        }
      });
      
      if (allTweetsIncluded) {
        console.log('✅ All tweets included in full (no truncation)');
      }
    }
    
    console.log('\n✅ Test complete! Formatted summary is being added to orchestrator output.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testOrchestratorFormat().catch(console.error);