#!/usr/bin/env node

// Script to identify and optionally delete broken database records with no market data

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function cleanupBrokenRecords(dryRun = true) {
  console.log(`🧹 ${dryRun ? 'DRY RUN - ' : ''}Cleaning up broken database records\n`);
  console.log('=' .repeat(70));
  
  // Find all records with no market data
  const allRecords = await prisma.ai_token_analyses.findMany({
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      created_at: true,
      token_address: true,
      file_path: true,
      branch_score: true,
      risk_score: true,
      analysis_json: true
    }
  });
  
  const brokenRecords = [];
  const filesToDelete = [];
  
  allRecords.forEach(r => {
    const market = r.analysis_json?.metadata?.market || {};
    const hasSymbol = !!market.top_pool?.baseToken?.symbol;
    const hasFdv = market.fdv !== undefined && market.fdv !== null;
    const hasLiquidity = market.liquidity !== undefined && market.liquidity !== null;
    const hasAnyMarketData = hasSymbol || hasFdv || hasLiquidity;
    
    if (!hasAnyMarketData) {
      brokenRecords.push({
        id: r.id,
        date: r.created_at.toISOString().split('T')[0],
        token: r.token_address.substring(0, 10),
        file: r.file_path,
        hasScores: r.branch_score !== null || r.risk_score !== null
      });
      
      if (r.file_path && fs.existsSync(r.file_path)) {
        filesToDelete.push(r.file_path);
      }
    }
  });
  
  console.log(`Found ${brokenRecords.length} broken records (no market data)\n`);
  
  // Group by date for better visualization
  const byDate = {};
  brokenRecords.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });
  
  console.log('📅 Broken records by date:');
  Object.entries(byDate).forEach(([date, records]) => {
    console.log(`\n${date}: ${records.length} broken records`);
    records.slice(0, 3).forEach(r => {
      console.log(`  ID ${r.id}: ${r.token}... ${r.hasScores ? '(has scores)' : '(no scores)'}`);
    });
    if (records.length > 3) {
      console.log(`  ... and ${records.length - 3} more`);
    }
  });
  
  console.log('\n' + '=' .repeat(70));
  
  if (dryRun) {
    console.log('\n🔍 DRY RUN SUMMARY:');
    console.log(`Would delete ${brokenRecords.length} database records`);
    console.log(`Would delete ${filesToDelete.length} JSON files`);
    console.log('\nTo actually delete, run with --delete flag');
  } else {
    console.log('\n🗑️  DELETING BROKEN RECORDS...\n');
    
    // Delete database records
    const deleteResult = await prisma.ai_token_analyses.deleteMany({
      where: {
        id: {
          in: brokenRecords.map(r => r.id)
        }
      }
    });
    
    console.log(`✅ Deleted ${deleteResult.count} database records`);
    
    // Delete associated files
    let filesDeleted = 0;
    filesToDelete.forEach(file => {
      try {
        fs.unlinkSync(file);
        filesDeleted++;
      } catch (e) {
        console.log(`  ⚠️  Could not delete ${file}: ${e.message}`);
      }
    });
    
    console.log(`✅ Deleted ${filesDeleted} JSON files`);
    
    // Show remaining stats
    const remaining = await prisma.ai_token_analyses.count();
    console.log(`\n📊 Database now has ${remaining} records (was ${allRecords.length})`);
  }
  
  await prisma.$disconnect();
}

// Check for --delete flag
const shouldDelete = process.argv.includes('--delete');
cleanupBrokenRecords(!shouldDelete).catch(console.error);