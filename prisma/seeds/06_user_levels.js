import prisma from '../../config/prisma.js';

const USER_LEVELS = [
    {
        level_number: 1,
        class_name: 'NOVICE',
        title: 'Novice Trader',
        min_exp: 0,
        bronze_achievements_required: 0,
        silver_achievements_required: 0,
        gold_achievements_required: 0,
        platinum_achievements_required: 0,
        diamond_achievements_required: 0,
        icon_url: '/assets/levels/novice.svg'
    },
    {
        level_number: 2,
        class_name: 'APPRENTICE',
        title: 'Apprentice Trader',
        min_exp: 1000,
        bronze_achievements_required: 3,
        silver_achievements_required: 0,
        gold_achievements_required: 0,
        platinum_achievements_required: 0,
        diamond_achievements_required: 0,
        icon_url: '/assets/levels/apprentice.svg'
    },
    {
        level_number: 3,
        class_name: 'JOURNEYMAN',
        title: 'Journeyman Trader',
        min_exp: 5000,
        bronze_achievements_required: 5,
        silver_achievements_required: 2,
        gold_achievements_required: 0,
        platinum_achievements_required: 0,
        diamond_achievements_required: 0,
        icon_url: '/assets/levels/journeyman.svg'
    },
    {
        level_number: 4,
        class_name: 'EXPERT',
        title: 'Expert Trader',
        min_exp: 15000,
        bronze_achievements_required: 8,
        silver_achievements_required: 4,
        gold_achievements_required: 1,
        platinum_achievements_required: 0,
        diamond_achievements_required: 0,
        icon_url: '/assets/levels/expert.svg'
    },
    {
        level_number: 5,
        class_name: 'MASTER',
        title: 'Master Trader',
        min_exp: 50000,
        bronze_achievements_required: 10,
        silver_achievements_required: 6,
        gold_achievements_required: 3,
        platinum_achievements_required: 1,
        diamond_achievements_required: 0,
        icon_url: '/assets/levels/master.svg'
    },
    {
        level_number: 6,
        class_name: 'GRANDMASTER',
        title: 'Grandmaster Trader',
        min_exp: 150000,
        bronze_achievements_required: 12,
        silver_achievements_required: 8,
        gold_achievements_required: 5,
        platinum_achievements_required: 2,
        diamond_achievements_required: 1,
        icon_url: '/assets/levels/grandmaster.svg'
    },
    {
        level_number: 7,
        class_name: 'LEGEND',
        title: 'Legendary Trader',
        min_exp: 500000,
        bronze_achievements_required: 15,
        silver_achievements_required: 10,
        gold_achievements_required: 7,
        platinum_achievements_required: 4,
        diamond_achievements_required: 2,
        icon_url: '/assets/levels/legend.svg'
    }
];

export async function seedUserLevels() {
    // Create user levels
    await Promise.all(
        USER_LEVELS.map(level =>
            prisma.user_levels.create({
                data: level
            })
        )
    );
} 