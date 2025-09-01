// prisma/seeds/services/02_contest_wallet_config.js

import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

// Create a custom ID generator
const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 10);

/**
 * Seed the Contest Wallet Service configuration
 */
export async function seedContestWalletConfig() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Checking for existing Contest Wallet configuration...');
    
    // Check if config already exists
    const existingConfig = await prisma.config_contest_wallet.findFirst();
    
    if (existingConfig) {
      console.log('✅ Contest Wallet configuration already exists, skipping seed.');
      return;
    }
    
    console.log('🌱 Creating initial Contest Wallet configuration...');
    
    // Create default configuration
    await prisma.config_contest_wallet.create({
      data: {
        id: nanoid(),
        // Core Configuration
        check_interval_ms: 60000, // 1 minute
        
        // Reclaim Settings
        min_balance_to_reclaim: 0.05,
        min_amount_to_transfer: 0.01,
        reclaim_contest_statuses: ["completed", "cancelled"],
        
        // Vanity Wallet Settings
        vanity_wallet_paths: {
          "DUEL": "/home/websites/degenduel/addresses/keypairs/public/_DUEL",
          "DEGEN": "/home/websites/degenduel/addresses/keypairs/public/_DEGEN"
        },
        
        // Wallet Encryption
        encryption_algorithm: "aes-256-gcm",
        
        // Circuit Breaker
        failure_threshold: 5,
        reset_timeout_ms: 60000,
        min_healthy_period_ms: 120000,
        
        // Backoff Settings
        initial_delay_ms: 1000,
        max_delay_ms: 30000,
        backoff_factor: 2,
        
        // Admin Features
        enable_vanity_wallets: true,
        
        // Metadata
        updated_by: 'system',
      }
    });
    
    console.log('✅ Initial Contest Wallet configuration created successfully.');
  } catch (error) {
    console.error('❌ Error seeding Contest Wallet configuration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run directly if called from CLI
if (process.argv[1].includes('02_contest_wallet_config.js')) {
  seedContestWalletConfig()
    .then(() => console.log('Contest Wallet config seed complete.'))
    .catch(console.error);
}