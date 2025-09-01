// prisma/seeds/07_service_configs.js

import { seedSolanaEngineConfig } from './services/01_solana_engine_config.js';
import { seedContestWalletConfig } from './services/02_contest_wallet_config.js';
import { seedAdminWalletConfig } from './services/03_admin_wallet_config.js';
import { seedAiServiceConfig } from './services/04_ai_service_config.js';
import { seedTokenRefreshPriorityTiers } from './services/05_token_refresh_priority_tiers.js';

/**
 * Seed all service configuration tables
 */
export async function seedServiceConfigs() {
  console.log('🚀 Starting service configuration seeding...');
  
  // Seed all service configurations
  await seedSolanaEngineConfig();
  await seedContestWalletConfig();
  await seedAdminWalletConfig();
  await seedAiServiceConfig();
  await seedTokenRefreshPriorityTiers();
  
  console.log('✅ Service configuration seeding complete!');
}

// Run directly if called from CLI
if (process.argv[1].includes('07_service_configs.js')) {
  seedServiceConfigs()
    .then(() => console.log('All service configs seeded successfully.'))
    .catch(console.error);
}