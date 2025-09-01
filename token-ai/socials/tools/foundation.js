// token-ai/socials/tools/foundation.js

import axios from 'axios';
import prisma from '../../../config/prisma.js';

function apiBase() {
  return (process.env.DEGENDUEL_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:3004').replace(/\/$/, '');
}
function adminBearer() {
  return process.env.ADMIN_BEARER_TOKEN || process.env.SUPERBEARER_TOKEN || process.env.SUPERADMIN_BEARER_TOKEN || null;
}

export async function ensure_token_activated(mint) {
  const token = await prisma.tokens.findFirst({ where: { address: mint } });
  if (token) return { activated: true, created: false, message: 'Already present' };
  const BEARER = adminBearer();
  if (!BEARER) return { activated: false, created: false, error: 'Missing admin bearer token' };
  const API = apiBase();
  const resp = await axios.post(`${API}/api/admin/token-activation/activate`, { addresses: [mint] }, { headers: { Authorization: `Bearer ${BEARER}` } });
  const data = resp?.data?.data || resp?.data || {};
  return {
    activated: !!(data.tokens_activated || data.enrichment_triggered || data.tokens_already_active),
    created: !!(data.tokens_created || data.tokens_missing_from_db),
    summary: data,
  };
}

export async function ensure_token_enriched(mint, { timeoutSec = 30, poll = true } = {}) {
  const BEARER = adminBearer();
  if (!BEARER) return { enriched: false, error: 'Missing admin bearer token' };
  const API = apiBase();
  try {
    await axios.post(`${API}/api/admin/token-activation/enrich`, { addresses: [mint], create_missing: false }, { headers: { Authorization: `Bearer ${BEARER}` }, timeout: 15000 });
  } catch (e) {
    return { enriched: false, error: e?.response?.data?.error || e.message };
  }
  if (!poll) return { enriched: true };
  const start = Date.now();
  const cutoff = timeoutSec * 1000;
  while (Date.now() - start < cutoff) {
    const t = await prisma.tokens.findFirst({ where: { address: mint }, include: { token_socials: true, token_websites: true } });
    const count = (t?.token_socials?.length || 0) + (t?.token_websites?.length || 0);
    if (count > 0) {
      return { enriched: true, socials: t.token_socials?.length || 0, websites: t.token_websites?.length || 0 };
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return { enriched: false, timeout: true };
}

export async function get_token_links_from_db(mint) {
  const t = await prisma.tokens.findFirst({ where: { address: mint }, include: { token_socials: true, token_websites: true } });
  return {
    exists: !!t,
    socials: (t?.token_socials || []).map(s => ({ type: s.type, url: s.url })),
    websites: (t?.token_websites || []).map(w => ({ label: w.label, url: w.url })),
  };
}

