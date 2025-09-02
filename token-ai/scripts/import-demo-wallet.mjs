#!/usr/bin/env node
// Import the demo managed_wallet into Supabase from the latest backup JSON
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PrismaClient } from '@prisma/client';

const DEMO_ID = process.env.DEMO_WALLET_ID || 'e92af215-d498-47aa-b448-e649752f874c';

function latestBackup(){
  const dir = path.join(os.homedir(), 'dexter_backups');
  let files = [];
  try { files = fs.readdirSync(dir).filter(f=>f.startsWith('wallets-backup-') && f.endsWith('.json')); } catch {}
  if (!files.length) return null;
  files.sort((a,b)=> fs.statSync(path.join(dir,b)).mtimeMs - fs.statSync(path.join(dir,a)).mtimeMs);
  return path.join(dir, files[0]);
}

async function main(){
  const fp = latestBackup();
  if (!fp) throw new Error('no_backup_found');
  const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const wallets = Array.isArray(j.managed_wallets) ? j.managed_wallets : [];
  const demo = wallets.find(w=> String(w.id) === DEMO_ID);
  if (!demo) throw new Error('demo_wallet_not_in_backup');
  const prisma = new PrismaClient();
  const exists = await prisma.managed_wallets.findUnique({ where: { id: String(DEMO_ID) } });
  if (exists) { console.log('demo wallet already exists in Supabase'); return; }
  await prisma.managed_wallets.create({ data: {
    id: String(demo.id),
    public_key: String(demo.public_key),
    encrypted_private_key: String(demo.encrypted_private_key),
    label: demo.label || 'Clanka Trading Wallet',
    status: demo.status || 'active',
    metadata: demo.metadata || {},
    memo: demo.memo || null,
  }});
  console.log('imported demo wallet:', demo.id);
}

main().catch(e=>{ console.error('import_demo_wallet error:', e?.message||e); process.exit(1); });

