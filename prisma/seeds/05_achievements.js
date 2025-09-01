import prisma from '../../config/prisma.js';

const ACHIEVEMENT_CATEGORIES = [
    {
        name: 'CONTESTS',
        description: 'Achievements related to contest participation and performance'
    },
    {
        name: 'TRADING',
        description: 'Achievements related to trading volume and profit'
    },
    {
        name: 'SOCIAL',
        description: 'Achievements related to social engagement and community'
    },
    {
        name: 'PROGRESSION',
        description: 'Achievements related to user progression and experience'
    }
];

const ACHIEVEMENT_TIERS = [
    {
        name: 'BRONZE',
        color_hex: '#CD7F32',
        points: 100
    },
    {
        name: 'SILVER',
        color_hex: '#C0C0C0',
        points: 250
    },
    {
        name: 'GOLD',
        color_hex: '#FFD700',
        points: 500
    },
    {
        name: 'PLATINUM',
        color_hex: '#E5E4E2',
        points: 1000
    },
    {
        name: 'DIAMOND',
        color_hex: '#B9F2FF',
        points: 2500
    }
];

const ACHIEVEMENT_REQUIREMENTS = [
    // Contest Achievements
    {
        type: 'CONTESTS_ENTERED',
        tiers: {
            BRONZE: 1,
            SILVER: 5,
            GOLD: 25,
            PLATINUM: 100,
            DIAMOND: 500
        },
        category: 'CONTESTS'
    },
    {
        type: 'CONTESTS_WON',
        tiers: {
            BRONZE: 1,
            SILVER: 3,
            GOLD: 10,
            PLATINUM: 25,
            DIAMOND: 100
        },
        category: 'CONTESTS'
    },
    {
        type: 'CONSECUTIVE_WINS',
        tiers: {
            BRONZE: 2,
            SILVER: 3,
            GOLD: 5,
            PLATINUM: 7,
            DIAMOND: 10
        },
        category: 'CONTESTS'
    },
    // Trading Achievements
    {
        type: 'TOTAL_PROFIT',
        tiers: {
            BRONZE: 100,
            SILVER: 1000,
            GOLD: 10000,
            PLATINUM: 100000,
            DIAMOND: 1000000
        },
        category: 'TRADING'
    },
    {
        type: 'TRADING_VOLUME',
        tiers: {
            BRONZE: 1000,
            SILVER: 10000,
            GOLD: 100000,
            PLATINUM: 1000000,
            DIAMOND: 10000000
        },
        category: 'TRADING'
    },
    {
        type: 'TOKENS_TRADED',
        tiers: {
            BRONZE: 5,
            SILVER: 20,
            GOLD: 50,
            PLATINUM: 100,
            DIAMOND: 200
        },
        category: 'TRADING'
    },
    // Social Achievements
    {
        type: 'SOCIAL_ENGAGEMENT',
        tiers: {
            BRONZE: 1,
            SILVER: 2,
            GOLD: 3,
            PLATINUM: 4,
            DIAMOND: 5
        },
        category: 'SOCIAL'
    },
    {
        type: 'REFERRALS',
        tiers: {
            BRONZE: 1,
            SILVER: 5,
            GOLD: 25,
            PLATINUM: 100,
            DIAMOND: 500
        },
        category: 'SOCIAL'
    },
    // Progression Achievements
    {
        type: 'EXPERIENCE_POINTS',
        tiers: {
            BRONZE: 1000,
            SILVER: 5000,
            GOLD: 25000,
            PLATINUM: 100000,
            DIAMOND: 500000
        },
        category: 'PROGRESSION'
    },
    {
        type: 'ACHIEVEMENT_COUNT',
        tiers: {
            BRONZE: 5,
            SILVER: 15,
            GOLD: 30,
            PLATINUM: 50,
            DIAMOND: 100
        },
        category: 'PROGRESSION'
    }
];

export async function seedAchievements() {
    // Create categories
    await Promise.all(
        ACHIEVEMENT_CATEGORIES.map(category =>
            prisma.achievement_categories.create({
                data: category
            })
        )
    );

    // Create tiers
    await Promise.all(
        ACHIEVEMENT_TIERS.map(tier =>
            prisma.achievement_tiers.create({
                data: tier
            })
        )
    );

    // Create requirements
    const tiers = await prisma.achievement_tiers.findMany();
    const categories = await prisma.achievement_categories.findMany();

    for (const requirement of ACHIEVEMENT_REQUIREMENTS) {
        for (const [tierName, value] of Object.entries(requirement.tiers)) {
            const tier = tiers.find(t => t.name === tierName);
            const category = categories.find(c => c.name === requirement.category);

            if (!tier || !category) continue;

            await prisma.achievement_tier_requirements.create({
                data: {
                    achievement_type: requirement.type,
                    tier_id: tier.id,
                    requirement_value: { value, category: category.name }
                }
            });
        }
    }
} 