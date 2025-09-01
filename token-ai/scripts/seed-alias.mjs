#!/usr/bin/env node
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
// Load parent monorepo .env so DATABASE_URL is available
dotenv.config({ path: new URL('../../.env', import.meta.url).pathname });
const prisma = new PrismaClient();

function arg(name, def=null){
  const i = process.argv.findIndex(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i === -1) return def;
  const a = process.argv[i];
  if (a.includes('=')) return a.split('=')[1];
  return process.argv[i+1] || def;
}

const token = process.env.TOKEN_AI_DEV_USER_TOKEN || arg('token', 'branch-dev');
const walletId = arg('wallet-id') || arg('wallet', null);
const alias = arg('alias', 'trading');

if (!walletId) {
  console.error('Usage: node scripts/seed-alias.mjs --wallet-id <uuid> [--alias trading] [--token <dev-token>]');
  process.exit(2);
}

(async () => {
  try {
    let map = await prisma.ai_user_tokens.findUnique({ where: { token } });
    let userId = map?.user_id || null;
    if (!userId) {
      const user = await prisma.ai_app_users.create({ data: { name: 'Dev User', role: 'user' } });
      await prisma.ai_user_tokens.create({ data: { token, user_id: user.id } });
      userId = user.id;
    }
    const rec = await prisma.ai_wallet_aliases.upsert({
      where: { user_id_alias: { user_id: userId, alias } },
      update: { wallet_id: walletId },
      create: { user_id: userId, wallet_id: walletId, alias }
    });
    console.log(`Alias '${alias}' -> ${walletId} seeded for token '${token}' (user_id=${userId}).`);
  } catch (e) {
    console.error('Seed failed:', e?.message || e);
    process.exit(1);
  } finally {
    try { await prisma.$disconnect(); } catch {}
  }
})();
