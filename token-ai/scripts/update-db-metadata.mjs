#!/usr/bin/env node

// Script to update database records with corrected metadata from JSON files
// This syncs the enhanced metadata we recovered back to the database

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANALYSIS_DIR = path.join(__dirname, '../reports/ai-token-analyses');

// Initialize Prisma
const prisma = new PrismaClient();

async function updateDatabaseRecords() {
  console.log('🔄 Updating database records with corrected metadata\n');
  console.log('=' .repeat(70));
  
  try {
    // Get all analyses from database
    const dbAnalyses = await prisma.ai_token_analyses.findMany({
      select: {
        id: true,
        token_address: true,
        file_path: true,
        created_at: true,
        analysis_json: true
      },
      orderBy: {
        created_at: 'desc'
      },
      take: 100 // Process last 100 records
    });
    
    console.log(`Found ${dbAnalyses.length} database records to check\n`);
    
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const dbRecord of dbAnalyses) {
      try {
        // Check if file_path exists and points to a real file
        if (!dbRecord.file_path) {
          console.log(`⚠️  Record ${dbRecord.id}: No file_path stored`);
          skipped++;
          continue;
        }
        
        // Check if the file exists
        if (!fs.existsSync(dbRecord.file_path)) {
          console.log(`⚠️  Record ${dbRecord.id}: File not found: ${path.basename(dbRecord.file_path)}`);
          skipped++;
          continue;
        }
        
        // Read the current JSON file (which has our recovered metadata)
        const fileContent = fs.readFileSync(dbRecord.file_path, 'utf8');
        const fileAnalysis = JSON.parse(fileContent);
        
        // Compare market metadata
        const dbMarket = dbRecord.analysis_json?.metadata?.market || {};
        const fileMarket = fileAnalysis?.metadata?.market || {};
        
        // Check if file has more complete data
        const dbHasSymbol = !!dbMarket.top_pool?.baseToken?.symbol;
        const fileHasSymbol = !!fileMarket.top_pool?.baseToken?.symbol;
        const dbHasPrice = dbMarket.price !== undefined;
        const fileHasPrice = fileMarket.price !== undefined;
        
        if (!dbHasSymbol && fileHasSymbol) {
          // File has better data - update the database
          console.log(`🔧 Updating record ${dbRecord.id} (${dbRecord.token_address.substring(0, 10)}...)`);
          console.log(`   Adding: ${fileMarket.top_pool?.baseToken?.symbol} - ${fileMarket.top_pool?.baseToken?.name}`);
          console.log(`   Price: ${fileMarket.price || 'N/A'}, Volume24h: ${fileMarket.volume24h || 'N/A'}`);
          
          // Update the database record with the complete analysis from file
          await prisma.ai_token_analyses.update({
            where: { id: dbRecord.id },
            data: {
              analysis_json: fileAnalysis
            }
          });
          
          updated++;
          console.log(`   ✅ Updated successfully\n`);
        } else if (dbHasSymbol && fileHasSymbol) {
          // Both have data - check if they match
          if (dbMarket.top_pool?.baseToken?.symbol === fileMarket.top_pool?.baseToken?.symbol) {
            console.log(`✓ Record ${dbRecord.id}: Already has complete metadata (${dbMarket.top_pool?.baseToken?.symbol})`);
          } else {
            console.log(`⚠️  Record ${dbRecord.id}: Metadata mismatch - DB: ${dbMarket.top_pool?.baseToken?.symbol}, File: ${fileMarket.top_pool?.baseToken?.symbol}`);
          }
          skipped++;
        } else if (!dbHasSymbol && !fileHasSymbol) {
          // Neither has symbol data
          if (fileHasPrice && !dbHasPrice) {
            // But file has price data - still update
            console.log(`💰 Updating record ${dbRecord.id} with price data`);
            await prisma.ai_token_analyses.update({
              where: { id: dbRecord.id },
              data: {
                analysis_json: fileAnalysis
              }
            });
            updated++;
          } else {
            console.log(`○ Record ${dbRecord.id}: No enhanced metadata available`);
            skipped++;
          }
        } else {
          skipped++;
        }
        
      } catch (error) {
        console.error(`❌ Failed to process record ${dbRecord.id}: ${error.message}`);
        failed++;
      }
    }
    
    console.log('=' .repeat(70));
    console.log('\n📊 UPDATE COMPLETE\n');
    console.log(`✅ Updated: ${updated} records`);
    console.log(`⏭️  Skipped: ${skipped} records`);
    console.log(`❌ Failed: ${failed} records`);
    
    if (updated > 0) {
      console.log('\n🎉 Successfully synchronized file metadata to database!');
      
      // Verify one of the updates
      const verifyAddress = '3qq54YqAKG3TcrwNHXFSpMCWoL8gmMuPceJ4FG9npump';
      const verification = await prisma.ai_token_analyses.findFirst({
        where: { token_address: verifyAddress },
        orderBy: { created_at: 'desc' },
        select: {
          analysis_json: true
        }
      });
      
      const market = verification?.analysis_json?.metadata?.market;
      if (market?.top_pool?.baseToken?.symbol) {
        console.log('\n✅ Verification successful! Example:');
        console.log(`   CLANKER now has symbol: ${market.top_pool.baseToken.symbol}`);
        console.log(`   Name: ${market.top_pool.baseToken.name}`);
        console.log(`   Price: ${market.price}`);
      }
    }
    
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the update
updateDatabaseRecords();