import prisma from '../../../config/prisma.js';

export function registerWalletRoutes(app) {
  // List managed wallets (labels + public keys) via local DB (no secrets exposed)
  app.get('/managed-wallets', async (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || '';
      const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
      const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
      const provided = req.headers['x-agent-token'] || '';
      if (!allowLocal && required && provided !== required) {
        return res.status(403).json({ ok:false, error:'forbidden' });
      }
      const { listManagedWallets } = await import('../../trade-manager/wallet-utils.js');
      const includeAdmin = String(process.env.TOKEN_AI_EXPOSE_ADMIN_WALLETS || '0') === '1';
      const externalUserId = (req.aiUser && req.aiUser.extUserId != null) ? req.aiUser.extUserId : null;
      const list = await listManagedWallets({ externalUserId, includeAdmin });
      return res.json({ ok:true, wallets: list });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });

  // List aliases for current AI user (optionally filter by wallet_id)
  app.get('/managed-wallets/aliases', async (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || '';
      const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
      const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
      const provided = req.headers['x-agent-token'] || '';
      if (!allowLocal && required && provided !== required) {
        return res.status(403).json({ ok:false, error:'forbidden' });
      }
      if (!req.aiUser || !req.aiUser.id) return res.status(401).json({ ok:false, error:'no_user_token' });
      const walletId = String(req.query.wallet_id || '').trim();
      const where = walletId ? { user_id: req.aiUser.id, wallet_id: walletId } : { user_id: req.aiUser.id };
      const items = await prisma.ai_wallet_aliases.findMany({ where, orderBy: { created_at: 'desc' } });
      return res.json({ ok:true, items });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });

  // Add or update an alias for a wallet (per current AI user)
  app.post('/managed-wallets/aliases', async (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || '';
      const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
      const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
      const provided = req.headers['x-agent-token'] || '';
      if (!allowLocal && required && provided !== required) {
        return res.status(403).json({ ok:false, error:'forbidden' });
      }
      if (!req.aiUser || !req.aiUser.id) return res.status(401).json({ ok:false, error:'no_user_token' });
      const alias = String(req.body?.alias || '').trim();
      const walletId = String(req.body?.wallet_id || '').trim();
      if (!alias || !walletId) return res.status(400).json({ ok:false, error:'missing_fields' });
      const { listManagedWallets } = await import('../../trade-manager/wallet-utils.js');
      const includeAdmin = String(process.env.TOKEN_AI_EXPOSE_ADMIN_WALLETS || '0') === '1';
      const externalUserId = (req.aiUser && req.aiUser.extUserId != null) ? req.aiUser.extUserId : null;
      const list = await listManagedWallets({ externalUserId, includeAdmin });
      const exists = (list || []).some(w => String(w.id) === walletId);
      if (!exists) return res.status(404).json({ ok:false, error:'wallet_not_visible' });
      const rec = await prisma.ai_wallet_aliases.upsert({
        where: { user_id_alias: { user_id: req.aiUser.id, alias } },
        update: { wallet_id: walletId },
        create: { user_id: req.aiUser.id, wallet_id: walletId, alias }
      });
      return res.json({ ok:true, alias: rec });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });

  // Delete an alias for the current AI user
  app.delete('/managed-wallets/aliases', async (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || '';
      const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
      const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
      const provided = req.headers['x-agent-token'] || '';
      if (!allowLocal && required && provided !== required) {
        return res.status(403).json({ ok:false, error:'forbidden' });
      }
      if (!req.aiUser || !req.aiUser.id) return res.status(401).json({ ok:false, error:'no_user_token' });
      const alias = String(req.body?.alias || '').trim();
      if (!alias) return res.status(400).json({ ok:false, error:'missing_alias' });
      const out = await prisma.ai_wallet_aliases.deleteMany({ where: { user_id: req.aiUser.id, alias } });
      return res.json({ ok:true, deleted: out.count });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });

  // Get/set runtime default wallet id (does not persist across restarts)
  let RUNTIME_DEFAULT_WALLET_ID = process.env.TOKEN_AI_DEFAULT_WALLET_ID || '';

  app.get('/managed-wallets/default', (req, res) => {
    try {
      const send = async () => {
        try {
          if (req.aiUser && req.aiUser.id) {
            const us = await prisma.ai_user_settings.findUnique({ where: { user_id: req.aiUser.id } });
            if (us && us.default_wallet_id) return res.json({ ok:true, wallet_id: us.default_wallet_id });
          }
        } catch {}
        const envDefault = process.env.TOKEN_AI_DEFAULT_WALLET_ID || '';
        return res.json({ ok:true, wallet_id: RUNTIME_DEFAULT_WALLET_ID || envDefault || null });
      };
      return send();
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });

  app.post('/managed-wallets/default', async (req, res) => {
    try {
      const ip = req.ip || req.connection?.remoteAddress || '';
      const allowLocal = (ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1'));
      const required = process.env.TOKEN_AI_EVENTS_TOKEN || '';
      const provided = req.headers['x-agent-token'] || '';
      if (!allowLocal && required && provided !== required) {
        return res.status(403).json({ ok:false, error:'forbidden' });
      }
      const wid = String(req.body?.wallet_id || '').trim();
      if (!wid) return res.status(400).json({ ok:false, error:'missing_wallet_id' });
      const { listManagedWallets } = await import('../../trade-manager/wallet-utils.js');
      const includeAdmin = String(process.env.TOKEN_AI_EXPOSE_ADMIN_WALLETS || '0') === '1';
      const externalUserId = (req.aiUser && req.aiUser.extUserId != null) ? req.aiUser.extUserId : null;
      const list = await listManagedWallets({ externalUserId, includeAdmin });
      const exists = (list || []).some(w => String(w.id) === wid);
      if (!exists) return res.status(404).json({ ok:false, error:'not_found' });
      if (req.aiUser && req.aiUser.id) {
        try {
          await prisma.ai_user_settings.upsert({
            where: { user_id: req.aiUser.id },
            update: { default_wallet_id: wid, updated_at: new Date() },
            create: { user_id: req.aiUser.id, default_wallet_id: wid, last_used_wallet_id: wid }
          });
        } catch (e) {
          return res.status(500).json({ ok:false, error: 'persist_failed', details: e?.message || String(e) });
        }
      } else {
        RUNTIME_DEFAULT_WALLET_ID = wid;
      }
      return res.json({ ok:true, wallet_id: wid });
    } catch (e) {
      return res.status(500).json({ ok:false, error: e?.message || 'error' });
    }
  });
}

export default { registerWalletRoutes };

