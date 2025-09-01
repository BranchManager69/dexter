import { seedAchievements } from './seeds/05_achievements';
import { seedUserLevels } from './seeds/06_user_levels';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting achievement system seeding...');
  
  try {
    console.log('Seeding achievement categories, tiers, and requirements...');
    await seedAchievements();
    console.log('✅ Achievement data seeded successfully');

    console.log('Seeding user levels and requirements...');
    await seedUserLevels();
    console.log('✅ User levels seeded successfully');

    console.log('🎉 Achievement system seeding completed!');
  } catch (error) {
    console.error('Error during seeding:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  }); 