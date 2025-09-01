// prisma/seeds/services/03_admin_wallet_config.js

import { PrismaClient } from '@prisma/client';
import { customAlphabet } from 'nanoid';

// Create a custom ID generator
const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 10);

/**
 * Seed the Admin Wallet Service configuration
 */
export async function seedAdminWalletConfig() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔄 Checking for existing Admin Wallet configuration...');
    
    // Check if config already exists
    const existingConfig = await prisma.config_admin_wallet.findFirst();
    
    if (existingConfig) {
      console.log('✅ Admin Wallet configuration already exists, skipping seed.');
      return;
    }
    
    console.log('🌱 Creating initial Admin Wallet configuration...');
    
    // Create default configuration
    await prisma.config_admin_wallet.create({
      data: {
        id: nanoid(),
        // Core Configuration
        check_interval_ms: 60000, // 1 minute
        
        // Wallet Settings
        min_sol_balance: 0.05,
        max_parallel_transfers: 5,
        transfer_timeout_ms: 30000,
        max_batch_size: 50,
        
        // Wallet Encryption
        encryption_algorithm: "aes-256-gcm",
        key_length: 32,
        iv_length: 16,
        tag_length: 16,
        
        // Circuit Breaker
        failure_threshold: 7,
        reset_timeout_ms: 80000,
        min_healthy_period_ms: 150000,
        
        // Backoff Settings
        initial_delay_ms: 1000,
        max_delay_ms: 30000,
        backoff_factor: 2,
        
        // Security Settings
        require_admin_approval: true,
        large_transfer_threshold: 10.0,
        
        // Metadata
        updated_by: 'system',
      }
    });
    
    console.log('✅ Initial Admin Wallet configuration created successfully.');
  } catch (error) {
    console.error('❌ Error seeding Admin Wallet configuration:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run directly if called from CLI
if (process.argv[1].includes('03_admin_wallet_config.js')) {
  seedAdminWalletConfig()
    .then(() => console.log('Admin Wallet config seed complete.'))
    .catch(console.error);
}