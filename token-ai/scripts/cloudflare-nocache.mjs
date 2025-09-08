#!/usr/bin/env node
// Create Cloudflare rules to bypass cache for /js/* and /css/* and purge cache.
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Load .env next to repo root
try {
  const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  const ENV = path.join(HERE, '.env');
  if (fs.existsSync(ENV)) {
    const data = fs.readFileSync(ENV, 'utf8');
    for (const line of data.split(/\n+/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
} catch {}

const EMAIL = process.env.CLOUDFLARE_EMAIL || '';
const KEY = process.env.CLOUDFLARE_GLOBAL_KEY || '';
const ZONE_NAME = process.env.CLOUDFLARE_ZONE || 'dexter.cash';

if (!EMAIL || !KEY) {
  console.error('Missing CLOUDFLARE_EMAIL or CLOUDFLARE_GLOBAL_KEY');
  process.exit(1);
}

const cf = axios.create({
  baseURL: 'https://api.cloudflare.com/client/v4',
  headers: { 'X-Auth-Email': EMAIL, 'X-Auth-Key': KEY }
});

async function main(){
  const z = await cf.get('/zones', { params: { name: ZONE_NAME, status: 'active' } });
  const zone = (z.data.result||[])[0];
  if (!zone) throw new Error('Zone not found for '+ZONE_NAME);
  const zoneId = zone.id;

  const patterns = [
    'https://dexter.cash/js/*',
    'https://dexter.cash/css/*',
    'https://www.dexter.cash/js/*',
    'https://www.dexter.cash/css/*'
  ];

  for (const p of patterns) {
    try {
      const body = {
        targets: [ { target: 'url', constraint: { operator: 'matches', value: p } } ],
        actions: [ { id: 'cache_level', value: 'bypass' }, { id: 'browser_cache_ttl', value: 0 } ],
        status: 'active',
        priority: 1
      };
      const r = await cf.post(`/zones/${zoneId}/pagerules`, body);
      if (!r.data.success) {
        console.warn('Page rule create failed for', p, r.data.errors||r.data);
      } else {
        console.log('Page rule created for', p);
      }
    } catch (e) {
      console.warn('Page rule error for', p, e.response?.data || e.message);
    }
  }

  // Purge cache
  try {
    const pur = await cf.post(`/zones/${zoneId}/purge_cache`, { purge_everything: true });
    console.log('Purge', pur.data.success ? 'ok' : 'failed');
  } catch (e) {
    console.warn('Purge error', e.response?.data || e.message);
  }
}

main().catch(e=>{ console.error('cloudflare-nocache failed', e.response?.data || e.message); process.exit(1); });

