#!/usr/bin/env node
// Export managed_wallets and oauth_user_wallets to a JSON backup
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

async function main(){
  const prisma = new PrismaClient();
  const wallets = await prisma.managed_wallets.findMany({ orderBy: { created_at: 'asc' } });
  let links = [];
  try { links = await prisma.oauth_user_wallets.findMany({ orderBy: { created_at: 'asc' } }); } catch {}
  const out = { exported_at: new Date().toISOString(), managed_wallets: wallets, oauth_user_wallets: links };
  const dir = process.env.WALLET_EXPORT_DIR || path.join(process.env.HOME || '.', 'dexter_backups');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const fp = path.join(dir, `wallets-backup-${Date.now()}.json`);
  fs.writeFileSync(fp, JSON.stringify(out, null, 2));
  console.log('exported:', fp, 'counts:', { wallets: wallets.length, links: links.length });
}

main().catch(e=>{ console.error('export_wallets error:', e?.message || e); process.exit(1); });

