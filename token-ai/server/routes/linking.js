import prisma from '../../../config/prisma.js';

// Helper to get Supabase user from request
async function getSupabaseUser(req) {
  try {
    const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const anonKey = process.env.SUPABASE_ANON_KEY || '';
    const auth = String(req.headers['authorization'] || '');
    
    if (!supabaseUrl || !anonKey || !auth.startsWith('Bearer ')) {
      return null;
    }
    
    const token = auth.slice(7).trim();
    const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'authorization': `Bearer ${token}`,
        'apikey': anonKey
      }
    });
    
    if (resp.ok) {
      const data = await resp.json().catch(() => null);
      const id = data?.id || data?.user?.id;
      if (id) return String(id);
    }
  } catch {}
  return null;
}

// Generate secure 6-char code (avoiding confusing characters)
function generateLinkingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0/O, 1/I/L
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function registerLinkingRoutes(app) {
  // Verify a linking code and create the link
  app.post('/api/link/verify', async (req, res) => {
    try {
      // Require Supabase auth
      const supabaseUserId = await getSupabaseUser(req);
      if (!supabaseUserId) {
        return res.status(401).json({ ok: false, error: 'authentication_required' });
      }
      
      const { code } = req.body;
      if (!code || typeof code !== 'string' || code.length < 6) {
        return res.status(400).json({ ok: false, error: 'invalid_code' });
      }
      
      // Normalize code (uppercase, trim)
      const normalizedCode = code.toUpperCase().trim();
      
      // Find the code
      const linkingCode = await prisma.linking_codes.findUnique({
        where: { code: normalizedCode }
      });
      
      if (!linkingCode) {
        return res.status(404).json({ ok: false, error: 'code_not_found' });
      }
      
      // Check if expired
      if (linkingCode.expires_at < new Date()) {
        return res.status(410).json({ ok: false, error: 'code_expired' });
      }
      
      // Check if already used
      if (linkingCode.used) {
        return res.status(410).json({ ok: false, error: 'code_already_used' });
      }
      
      // Check attempts
      if (linkingCode.attempts >= 3) {
        return res.status(429).json({ ok: false, error: 'too_many_attempts' });
      }
      
      // Increment attempts
      await prisma.linking_codes.update({
        where: { code: normalizedCode },
        data: { attempts: linkingCode.attempts + 1 }
      });
      
      // Check if this code was initiated from MCP (has oauth info)
      if (linkingCode.oauth_provider && linkingCode.oauth_subject) {
        // Check if already linked
        const existing = await prisma.account_links.findUnique({
          where: {
            oauth_provider_oauth_subject: {
              oauth_provider: linkingCode.oauth_provider,
              oauth_subject: linkingCode.oauth_subject
            }
          }
        });
        
        if (existing) {
          return res.status(409).json({ ok: false, error: 'already_linked' });
        }
        
        // Create the link
        await prisma.account_links.create({
          data: {
            oauth_provider: linkingCode.oauth_provider,
            oauth_subject: linkingCode.oauth_subject,
            supabase_user_id: supabaseUserId,
            link_initiated_by: 'mcp'
          }
        });
        
        // Mark code as used
        await prisma.linking_codes.update({
          where: { code: normalizedCode },
          data: { used: true }
        });
        
        return res.json({
          ok: true,
          message: 'Successfully linked MCP account',
          provider: linkingCode.oauth_provider
        });
      }
      
      // Code was initiated from web (reverse flow - not implemented yet)
      if (linkingCode.supabase_user_id) {
        return res.status(501).json({ ok: false, error: 'reverse_flow_not_implemented' });
      }
      
      return res.status(400).json({ ok: false, error: 'invalid_code_type' });
    } catch (error) {
      console.error('Link verify error:', error);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });
  
  // Check if current user has linked MCP accounts
  app.get('/api/link/status', async (req, res) => {
    try {
      // Require Supabase auth
      const supabaseUserId = await getSupabaseUser(req);
      if (!supabaseUserId) {
        return res.status(401).json({ ok: false, error: 'authentication_required' });
      }
      
      // Find all linked accounts
      const links = await prisma.account_links.findMany({
        where: { supabase_user_id: supabaseUserId },
        orderBy: { linked_at: 'desc' }
      });
      
      return res.json({
        ok: true,
        is_linked: links.length > 0,
        links: links.map(link => ({
          provider: link.oauth_provider,
          linked_at: link.linked_at.toISOString(),
          initiated_by: link.link_initiated_by
        }))
      });
    } catch (error) {
      console.error('Link status error:', error);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });
  
  // Generate a code from web side (for reverse flow - optional)
  app.post('/api/link/generate', async (req, res) => {
    try {
      // Require Supabase auth
      const supabaseUserId = await getSupabaseUser(req);
      if (!supabaseUserId) {
        return res.status(401).json({ ok: false, error: 'authentication_required' });
      }
      
      // Check if already has linked accounts
      const existingLinks = await prisma.account_links.count({
        where: { supabase_user_id: supabaseUserId }
      });
      
      // Clean up old expired codes for this user
      await prisma.linking_codes.deleteMany({
        where: {
          supabase_user_id: supabaseUserId,
          expires_at: { lt: new Date() }
        }
      });
      
      // Check for recent code (rate limiting)
      const recentCode = await prisma.linking_codes.findFirst({
        where: {
          supabase_user_id: supabaseUserId,
          expires_at: { gt: new Date() },
          used: false
        },
        orderBy: { created_at: 'desc' }
      });
      
      if (recentCode && recentCode.created_at > new Date(Date.now() - 60000)) {
        // Return existing code if created less than 1 minute ago
        return res.json({
          ok: true,
          code: recentCode.code,
          expires_at: recentCode.expires_at.toISOString(),
          instructions: `Enter this code in your MCP tool: ${recentCode.code}`
        });
      }
      
      // Generate new code
      const code = generateLinkingCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      await prisma.linking_codes.create({
        data: {
          code,
          supabase_user_id: supabaseUserId,
          expires_at: expiresAt,
          used: false,
          attempts: 0
        }
      });
      
      return res.json({
        ok: true,
        code,
        expires_at: expiresAt.toISOString(),
        instructions: `Enter this code in your MCP tool: ${code}`,
        has_existing_links: existingLinks > 0
      });
    } catch (error) {
      console.error('Generate code error:', error);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });
  
  // Unlink an MCP account
  app.post('/api/link/remove', async (req, res) => {
    try {
      // Require Supabase auth
      const supabaseUserId = await getSupabaseUser(req);
      if (!supabaseUserId) {
        return res.status(401).json({ ok: false, error: 'authentication_required' });
      }
      
      const { provider, subject } = req.body;
      if (!provider) {
        // Remove all links
        await prisma.account_links.deleteMany({
          where: { supabase_user_id: supabaseUserId }
        });
        
        return res.json({
          ok: true,
          message: 'All linked accounts removed'
        });
      }
      
      // Remove specific link
      const where = subject
        ? { oauth_provider_oauth_subject: { oauth_provider: provider, oauth_subject: subject } }
        : { supabase_user_id: supabaseUserId, oauth_provider: provider };
      
      await prisma.account_links.deleteMany({ where });
      
      return res.json({
        ok: true,
        message: `Unlinked ${provider} account`
      });
    } catch (error) {
      console.error('Unlink error:', error);
      return res.status(500).json({ ok: false, error: 'internal_error' });
    }
  });
}