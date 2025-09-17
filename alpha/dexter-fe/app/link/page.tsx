'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

const CODE_LENGTH = 6;
const VALID_CODE = /^[A-HJ-NP-Z2-9]$/i;

const rawApiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN || '';
const apiOrigin = (rawApiOrigin === 'relative' ? '' : rawApiOrigin).replace(/\/$/, '');

function apiUrl(path: string) {
  if (apiOrigin) return `${apiOrigin}${path}`;
  if (typeof window !== 'undefined') return `${window.location.origin}${path}`;
  return path;
}

type LinkRecord = {
  provider: string;
  linked_at: string;
  initiated_by?: string | null;
  subject?: string | null;
};

type LinkStatusResponse = {
  ok: boolean;
  is_linked: boolean;
  links: LinkRecord[];
};

export default function LinkPage() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [configState, setConfigState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [configError, setConfigError] = useState<string>('');
  const [statusLoading, setStatusLoading] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [status, setStatus] = useState<LinkStatusResponse | null>(null);
  const [codeBoxes, setCodeBoxes] = useState<string[]>(Array.from({ length: CODE_LENGTH }, () => ''));
  const [linkMessage, setLinkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [linkBusy, setLinkBusy] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [authMsg, setAuthMsg] = useState<string>('');
  const [magicLinkBusy, setMagicLinkBusy] = useState<boolean>(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    async function bootstrap() {
      setConfigState('loading');
      setConfigError('');
      try {
        const response = await fetch(apiUrl('/auth/config'), { cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok || !data.supabaseUrl || !data.supabaseAnonKey) {
          throw new Error('Supabase configuration missing.');
        }
        if (cancelled) return;
        const client = createClient(data.supabaseUrl, data.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true },
        });
        const { data: initial } = await client.auth.getSession();
        if (cancelled) return;
        setSession(initial?.session ?? null);
        const { data: listener } = client.auth.onAuthStateChange((_event, newSession) => {
          setSession(newSession ?? null);
        });
        unsubscribe = () => listener?.subscription?.unsubscribe?.();
        setSupabase(client);
        setConfigState('ready');
      } catch (err: any) {
        if (!cancelled) {
          setConfigState('error');
          setConfigError(err?.message || 'Unable to load authentication config.');
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const accessToken = session?.access_token || null;

  const codeValue = useMemo(() => codeBoxes.join('').trim(), [codeBoxes]);

  async function authFetch(path: string, init?: RequestInit) {
    if (!accessToken) throw new Error('No active session');
    const headers = new Headers(init?.headers || {});
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    headers.set('Content-Type', 'application/json');
    const response = await fetch(apiUrl(path), {
      ...init,
      headers,
    });
    return response;
  }

  const refreshStatus = async () => {
    if (!accessToken) return;
    setStatusLoading(true);
    setStatusError(null);
    try {
      const response = await authFetch('/api/link/status');
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Request failed (${response.status})`);
      }
      setStatus(payload as LinkStatusResponse);
    } catch (err: any) {
      setStatus(null);
      setStatusError(err?.message || 'Unable to load link status.');
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) {
      setStatus(null);
      return;
    }
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const handleInput = (index: number, value: string) => {
    const char = value.slice(-1).toUpperCase();
    if (char && !VALID_CODE.test(char)) {
      return;
    }
    setCodeBoxes((prev) => {
      const next = [...prev];
      next[index] = char;
      return next;
    });
    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !codeBoxes[index] && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
      setCodeBoxes((prev) => {
        const next = [...prev];
        next[index - 1] = '';
        return next;
      });
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const paste = event.clipboardData.getData('text').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '');
    if (!paste) return;
    event.preventDefault();
    const chars = paste.slice(0, CODE_LENGTH).split('');
    setCodeBoxes((prev) => {
      const next = [...prev];
      for (let i = 0; i < CODE_LENGTH; i += 1) {
        next[i] = chars[i] || '';
      }
      return next;
    });
    const nextIndex = Math.min(chars.length, CODE_LENGTH - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleVerify = async () => {
    if (!accessToken) {
      setLinkMessage({ type: 'error', text: 'Sign in first.' });
      return;
    }
    if (codeValue.length !== CODE_LENGTH) {
      setLinkMessage({ type: 'error', text: 'Enter the 6-character code.' });
      return;
    }
    setLinkBusy(true);
    setLinkMessage(null);
    try {
      const response = await authFetch('/api/link/verify', {
        method: 'POST',
        body: JSON.stringify({ code: codeValue }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Link failed (${response.status})`);
      }
      setLinkMessage({ type: 'success', text: payload?.message || 'Account linked successfully.' });
      setCodeBoxes(Array.from({ length: CODE_LENGTH }, () => ''));
      refreshStatus();
    } catch (err: any) {
      setLinkMessage({ type: 'error', text: err?.message || 'Unable to link account.' });
    } finally {
      setLinkBusy(false);
    }
  };

  const handleGenerateCode = async () => {
    if (!accessToken) return;
    setLinkBusy(true);
    setLinkMessage(null);
    try {
      const response = await authFetch('/api/link/generate', { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Generate failed (${response.status})`);
      }
      setLinkMessage({
        type: 'success',
        text: `Code: ${payload?.code}. Enter this in your MCP client within 10 minutes.`,
      });
      setCodeBoxes(payload?.code?.split('')?.slice(0, CODE_LENGTH) ?? Array.from({ length: CODE_LENGTH }, () => ''));
      if (payload?.code) {
        inputRefs.current[CODE_LENGTH - 1]?.focus();
      }
    } catch (err: any) {
      setLinkMessage({ type: 'error', text: err?.message || 'Unable to generate code.' });
    } finally {
      setLinkBusy(false);
    }
  };

  const handleUnlink = async (provider?: string, subject?: string) => {
    if (!accessToken) return;
    setLinkBusy(true);
    setLinkMessage(null);
    try {
      const body = provider ? { provider, subject } : {};
      const response = await authFetch('/api/link/remove', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || `Unlink failed (${response.status})`);
      }
      setLinkMessage({ type: 'success', text: payload?.message || 'Unlinked successfully.' });
      refreshStatus();
    } catch (err: any) {
      setLinkMessage({ type: 'error', text: err?.message || 'Unable to unlink account.' });
    } finally {
      setLinkBusy(false);
    }
  };

  const handleSendMagicLink = async () => {
    if (!supabase) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setAuthMsg('Enter your email.');
      return;
    }
    setMagicLinkBusy(true);
    setAuthMsg('Sending magic link…');
    try {
      const redirectTo = typeof window !== 'undefined' ? window.location.href : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (error) throw error;
      setAuthMsg('Check your email for the sign-in link.');
    } catch (err: any) {
      setAuthMsg(err?.message || 'Unable to send magic link.');
    } finally {
      setMagicLinkBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setLinkMessage(null);
    setStatus(null);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 520, background: '#0f1119', border: '1px solid #1d2230', borderRadius: 16, padding: 28, boxShadow: '0 18px 40px rgba(0,0,0,0.35)' }}>
        <h1 style={{ fontSize: 28, margin: 0, marginBottom: 12 }}>Link Your Dexter Account</h1>
        <p style={{ color: '#9fb2c8', marginBottom: 24 }}>
          Connect your web account to MCP (Claude, ChatGPT, etc.) using the 6-character code generated inside the connector.
        </p>

        {configState === 'loading' && (
          <div style={{ color: '#9fb2c8' }}>Loading authentication…</div>
        )}
        {configState === 'error' && (
          <div style={{ background: '#2b0e0e', border: '1px solid #5a2323', color: '#ff9f9f', padding: 12, borderRadius: 8, marginBottom: 12 }}>
            {configError}
          </div>
        )}

        {configState === 'ready' && (
          <>
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 18, marginBottom: 12 }}>1. Sign in</h2>
              {session ? (
                <div style={{ background: '#101523', border: '1px solid #1d2740', borderRadius: 8, padding: 16, display: 'grid', gap: 12 }}>
                  <div style={{ color: '#9fb2c8' }}>Signed in as <strong>{session.user?.email || session.user?.id}</strong></div>
                  <button onClick={handleSignOut} style={buttonStyle}>Sign out</button>
                </div>
              ) : (
                <div style={{ background: '#101523', border: '1px solid #1d2740', borderRadius: 8, padding: 16, display: 'grid', gap: 12 }}>
                  <label style={{ fontSize: 13, color: '#9fb2c8' }}>Send a magic link to your email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    style={inputStyle}
                    autoComplete="email"
                  />
                  <button onClick={handleSendMagicLink} disabled={magicLinkBusy} style={buttonStyle}>
                    {magicLinkBusy ? 'Sending…' : 'Send magic link'}
                  </button>
                  {authMsg && <div style={{ fontSize: 12, color: '#9fb2c8' }}>{authMsg}</div>}
                </div>
              )}
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 18, marginBottom: 12 }}>2. Enter the code from MCP</h2>
              <p style={{ color: '#9fb2c8', marginBottom: 16 }}>
                In Claude or ChatGPT, run <code>generate_dexter_linking_code</code>. Paste the code below.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 16 }}>
                {codeBoxes.map((value, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    value={value}
                    onChange={(event) => handleInput(index, event.target.value)}
                    onKeyDown={(event) => handleKeyDown(index, event)}
                    onPaste={handlePaste}
                    maxLength={1}
                    style={codeInputStyle(value)}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={handleVerify} disabled={!session || linkBusy} style={{ ...buttonStyle, flex: '1 1 auto' }}>
                  {linkBusy ? 'Working…' : 'Link account'}
                </button>
                <button onClick={handleGenerateCode} disabled={!session || linkBusy} style={{ ...secondaryButtonStyle, flex: '0 0 auto' }}>
                  Generate code here
                </button>
              </div>
              {linkMessage && (
                <div
                  style={{
                    marginTop: 14,
                    padding: 12,
                    borderRadius: 8,
                    border: linkMessage.type === 'success' ? '1px solid #1f4a2e' : '1px solid #5a2323',
                    background: linkMessage.type === 'success' ? '#112117' : '#2b0e0e',
                    color: linkMessage.type === 'success' ? '#8bffb0' : '#ff9f9f',
                  }}
                >
                  {linkMessage.text}
                </div>
              )}
            </section>

            <section>
              <h2 style={{ fontSize: 18, marginBottom: 12 }}>3. Review linked accounts</h2>
              {statusLoading && <div style={{ color: '#9fb2c8' }}>Loading…</div>}
              {statusError && (
                <div style={{ background: '#2b0e0e', border: '1px solid #5a2323', color: '#ff9f9f', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                  {statusError}
                </div>
              )}
              {!statusLoading && status && status.links.length === 0 && (
                <div style={{ color: '#9fb2c8' }}>No MCP accounts linked yet.</div>
              )}
              {status && status.links.length > 0 && (
                <div style={{ display: 'grid', gap: 10 }}>
                  {status.links.map((link) => (
                    <div key={`${link.provider}:${link.subject || 'unknown'}`} style={{ background: '#101523', border: '1px solid #1d2740', borderRadius: 8, padding: 14, display: 'grid', gap: 6 }}>
                      <div style={{ fontWeight: 600 }}>{link.provider}</div>
                      <div style={{ color: '#9fb2c8', fontSize: 12 }}>Linked {new Date(link.linked_at).toLocaleString()}</div>
                      {link.subject && <div style={{ color: '#9fb2c8', fontSize: 12 }}>Subject: {link.subject}</div>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleUnlink(link.provider, link.subject || undefined)} style={secondaryButtonStyle}>
                          Unlink this provider
                        </button>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => handleUnlink()} style={secondaryButtonStyle}>Unlink all</button>
                </div>
              )}
              <div style={{ marginTop: 14 }}>
                <button onClick={refreshStatus} disabled={!session} style={tertiaryButtonStyle}>
                  Refresh status
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid #1d2740',
  background: '#0b0f18',
  color: '#e6edf3',
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid #3d5afe',
  background: 'linear-gradient(135deg, #667eea, #764ba2)',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid #283248',
  background: '#121a2b',
  color: '#9fb2c8',
  cursor: 'pointer',
};

const tertiaryButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #1d2740',
  background: '#0b0f18',
  color: '#9fb2c8',
  cursor: 'pointer',
};

function codeInputStyle(value: string): React.CSSProperties {
  return {
    width: 52,
    height: 64,
    textAlign: 'center',
    fontSize: 28,
    fontWeight: 700,
    borderRadius: 12,
    border: '2px solid ' + (value ? '#667eea' : '#1d2740'),
    background: value ? '#121c33' : '#0b0f18',
    color: '#e6edf3',
    textTransform: 'uppercase',
  };
}
