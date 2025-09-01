#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function analyzeRecords() {
  const records = await prisma.ai_token_analyses.findMany({
    orderBy: { created_at: 'asc' },
    select: {
      id: true,
      created_at: true,
      token_address: true,
      file_path: true,
      analysis_json: true
    }
  });
  
  const stats = {
    total: records.length,
    withSymbol: 0,
    withoutSymbol: 0,
    noMarketData: 0,
    byDate: {},
    withoutSymbolSamples: []
  };
  
  records.forEach(r => {
    const date = r.created_at.toISOString().split('T')[0];
    const market = r.analysis_json?.metadata?.market || {};
    const hasSymbol = !!market.top_pool?.baseToken?.symbol;
    const hasAnyMarket = market.fdv !== undefined || market.liquidity !== undefined;
    
    if (!stats.byDate[date]) {
      stats.byDate[date] = { total: 0, withSymbol: 0, without: 0 };
    }
    stats.byDate[date].total++;
    
    if (hasSymbol) {
      stats.withSymbol++;
      stats.byDate[date].withSymbol++;
    } else {
      stats.withoutSymbol++;
      stats.byDate[date].without++;
      
      if (!hasAnyMarket) {
        stats.noMarketData++;
      }
      
      if (stats.withoutSymbolSamples.length < 5) {
        stats.withoutSymbolSamples.push({
          id: r.id,
          date: date,
          token: r.token_address.substring(0, 10),
          hasFile: !!r.file_path,
          hasFdv: market.fdv !== undefined,
          hasLiquidity: market.liquidity !== undefined
        });
      }
    }
  });
  
  console.log('📊 DATABASE RECORDS ANALYSIS\n');
  console.log('=' .repeat(60));
  console.log(`Total records: ${stats.total}`);
  console.log(`With symbol/name: ${stats.withSymbol} (${(stats.withSymbol/stats.total*100).toFixed(1)}%)`);
  console.log(`Without symbol: ${stats.withoutSymbol} (${(stats.withoutSymbol/stats.total*100).toFixed(1)}%)`);
  console.log(`No market data at all: ${stats.noMarketData}`);
  
  console.log('\n📅 By Date:');
  Object.entries(stats.byDate).forEach(([date, data]) => {
    const pct = (data.withSymbol / data.total * 100).toFixed(0);
    console.log(`  ${date}: ${data.total} total, ${data.withSymbol} with symbol (${pct}%), ${data.without} without`);
  });
  
  console.log('\n🔍 Sample records without symbol:');
  stats.withoutSymbolSamples.forEach(s => {
    console.log(`  ID ${s.id}: ${s.token}... on ${s.date}`);
    console.log(`    Has file: ${s.hasFile}, Has FDV: ${s.hasFdv}, Has liquidity: ${s.hasLiquidity}`);
  });
  
  await prisma.$disconnect();
}

analyzeRecords().catch(console.error);