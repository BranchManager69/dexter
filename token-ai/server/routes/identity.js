import prisma from '../../../config/prisma.js';

// Extract Supabase user id from Authorization: Bearer <access_token>
async function getSupabaseUserIdFromRequest(req) {
  try {
    const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const anonKey = process.env.SUPABASE_ANON_KEY || '';
    const auth = String(req.headers['authorization'] || '');
    if (!supabaseUrl || !anonKey || !auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7).trim();
    const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'authorization': `Bearer ${token}`, 'apikey': anonKey }
    });
    if (!resp.ok) return null;
    const data = await resp.json().catch(() => null);
    const id = data?.id || data?.user?.id;
    return id ? String(id) : null;
  } catch {
    return null;
  }
}

export function registerIdentityRoutes(app) {
  // Resolve Supabase user id from OAuth identity (provider + subject)
  app.get('/api/identity/resolve', async (req, res) => {
    try {
      const provider = String(req.query.provider || '').trim();
      const subject = String(req.query.subject || '').trim();
      if (!provider || !subject) return res.status(400).json({ ok: false, error: 'missing_params' });
      const link = await prisma.account_links.findUnique({
        where: { oauth_provider_oauth_subject: { oauth_provider: provider, oauth_subject: subject } }
      });
      if (!link) return res.status(404).json({ ok: false, error: 'not_found' });
      return res.json({ ok: true, supabase_user_id: link.supabase_user_id, linked_at: link.linked_at.toISOString(), provider: link.oauth_provider });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || 'internal_error' });
    }
  });

  // Link current Supabase user to an OAuth identity (direct API without codes)
  app.post('/api/identity/link', async (req, res) => {
    try {
      const supabaseUserId = await getSupabaseUserIdFromRequest(req);
      if (!supabaseUserId) return res.status(401).json({ ok: false, error: 'authentication_required' });
      const { provider, subject } = req.body || {};
      const p = String(provider || '').trim();
      const s = String(subject || '').trim();
      if (!p || !s) return res.status(400).json({ ok: false, error: 'missing_params' });
      // Check if this identity is already linked
      const existing = await prisma.account_links.findUnique({ where: { oauth_provider_oauth_subject: { oauth_provider: p, oauth_subject: s } } });
      if (existing && existing.supabase_user_id !== supabaseUserId) {
        return res.status(409).json({ ok: false, error: 'identity_claimed_by_another_user' });
      }
      if (existing && existing.supabase_user_id === supabaseUserId) {
        return res.json({ ok: true, already_linked: true });
      }
      await prisma.account_links.create({ data: { oauth_provider: p, oauth_subject: s, supabase_user_id: supabaseUserId, link_initiated_by: 'web' } });
      return res.status(201).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || 'internal_error' });
    }
  });

  // Unlink specific OAuth identity from current Supabase user
  app.post('/api/identity/unlink', async (req, res) => {
    try {
      const supabaseUserId = await getSupabaseUserIdFromRequest(req);
      if (!supabaseUserId) return res.status(401).json({ ok: false, error: 'authentication_required' });
      const { provider, subject } = req.body || {};
      const p = String(provider || '').trim();
      const s = String(subject || '').trim();
      if (!p || !s) return res.status(400).json({ ok: false, error: 'missing_params' });
      await prisma.account_links.deleteMany({ where: { supabase_user_id: supabaseUserId, oauth_provider: p, oauth_subject: s } });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || 'internal_error' });
    }
  });

  // List current user's identity links
  app.get('/api/identity/status', async (req, res) => {
    try {
      const supabaseUserId = await getSupabaseUserIdFromRequest(req);
      if (!supabaseUserId) return res.status(401).json({ ok: false, error: 'authentication_required' });
      const links = await prisma.account_links.findMany({ where: { supabase_user_id: supabaseUserId }, orderBy: { linked_at: 'desc' } });
      return res.json({ ok: true, links: links.map(l => ({ provider: l.oauth_provider, subject: l.oauth_subject, linked_at: l.linked_at.toISOString() })) });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e?.message || 'internal_error' });
    }
  });
}

export default { registerIdentityRoutes };

