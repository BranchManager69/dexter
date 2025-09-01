// prisma/seeds/services/01_solana_engine_config.js

import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

// Create a custom ID generator
const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 10);

/**
 * Seed the SolanaEngine configuration
 */
export async function seedSolanaEngineConfig() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Checking for existing SolanaEngine configuration...');
    
    // Check if config already exists
    const existingConfig = await prisma.config_solana_engine.findFirst();
    
    if (existingConfig) {
      console.log('✅ SolanaEngine configuration already exists, skipping seed.');
      return;
    }
    
    console.log('🌱 Creating initial SolanaEngine configuration...');
    
    // Create default configuration
    await prisma.config_solana_engine.create({
      data: {
        id: nanoid(),
        // Cache Configuration
        token_metadata_ttl: 86400,    // 24 hours
        token_price_ttl: 3600,        // 1 hour
        wallet_data_ttl: 300,         // 5 minutes
        
        // RPC Configuration
        connection_strategy: 'adaptive',
        health_check_interval: 60000, // 1 minute
        failure_threshold: 2,         // Failures before marking endpoint unhealthy
        recovery_threshold: 3,        // Successes before marking endpoint healthy again
        
        // Rate Limiting
        max_concurrent_requests: 5,   // Maximum concurrent requests
        request_spacing_ms: 100,      // Minimum time between operations
        base_backoff_ms: 250,         // Base backoff time for retries
        
        // Endpoint Weights (empty default)
        endpoint_weights: {},         // No specific weights by default
        
        // Admin Features
        admin_bypass_cache: false,    // Admin operations subject to cache by default
        
        // Metadata
        updated_by: 'system',
      }
    });
    
    console.log('✅ Initial SolanaEngine configuration created successfully.');
  } catch (error) {
    console.error('❌ Error seeding SolanaEngine configuration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run directly if called from CLI
if (process.argv[1].includes('01_solana_engine_config.js')) {
  seedSolanaEngineConfig()
    .then(() => console.log('SolanaEngine config seed complete.'))
    .catch(console.error);
}