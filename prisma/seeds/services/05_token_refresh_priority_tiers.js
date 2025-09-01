// prisma/seeds/services/05_token_refresh_priority_tiers.js

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * Seed token refresh priority tiers
 */
export async function seedTokenRefreshPriorityTiers() {
  console.log('🔄 Seeding token refresh priority tiers...');

  // Define the tiers based on current implementation
  const tiers = [
    {
      name: 'CRITICAL',
      description: 'Top 50 tokens and those used in active contests',
      priority_score: 1000,
      refresh_interval_seconds: 15,
      rank_threshold: 50,
      volatility_factor: 2.0,
      max_tokens_per_batch: 100,
      batch_delay_ms: 2000,
      is_active: true
    },
    {
      name: 'HIGH',
      description: 'Top 51-200 tokens with high trading volume',
      priority_score: 500,
      refresh_interval_seconds: 30,
      rank_threshold: 200,
      volatility_factor: 1.5,
      max_tokens_per_batch: 200,
      batch_delay_ms: 2500,
      is_active: true
    },
    {
      name: 'MEDIUM',
      description: 'Top 201-500 tokens with moderate trading activity',
      priority_score: 200,
      refresh_interval_seconds: 60,
      rank_threshold: 500,
      volatility_factor: 1.2,
      max_tokens_per_batch: 300,
      batch_delay_ms: 3000,
      is_active: true
    },
    {
      name: 'LOW',
      description: 'Top 501-1000 tokens with some trading activity',
      priority_score: 100,
      refresh_interval_seconds: 180,
      rank_threshold: 1000,
      volatility_factor: 1.0,
      max_tokens_per_batch: 400,
      batch_delay_ms: 3500,
      is_active: true
    },
    {
      name: 'MINIMAL',
      description: 'Top 1001-3000 tokens with limited trading',
      priority_score: 50,
      refresh_interval_seconds: 300,
      rank_threshold: 3000,
      volatility_factor: 0.8,
      max_tokens_per_batch: 400,
      batch_delay_ms: 4000,
      is_active: true
    },
    {
      name: 'INACTIVE',
      description: 'All other tokens below rank 3000 with minimal activity',
      priority_score: 10,
      refresh_interval_seconds: 600,
      rank_threshold: 100000, // Effectively unlimited
      volatility_factor: 0.5,
      max_tokens_per_batch: 500,
      batch_delay_ms: 5000,
      is_active: true
    }
  ];

  // Upsert each tier
  for (const tier of tiers) {
    await prisma.token_refresh_priority_tiers.upsert({
      where: { name: tier.name },
      update: tier,
      create: {
        ...tier,
        updated_by: 'system'
      }
    });
  }

  console.log('✅ Token refresh priority tiers seeded successfully!');
}

// Run directly if called from CLI
if (process.argv[1].includes('05_token_refresh_priority_tiers.js')) {
  seedTokenRefreshPriorityTiers()
    .then(() => console.log('Token refresh priority tiers seeded successfully.'))
    .catch(error => {
      console.error('Error seeding token refresh priority tiers:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}