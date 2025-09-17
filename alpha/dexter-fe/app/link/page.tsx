// app/link/page.tsx

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth-context';

const CODE_LENGTH = 6;
const VALID_CODE = /^[A-HJ-NP-Z2-9]$/i;

const rawApiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN ?? '';
const API_ORIGIN = (rawApiOrigin === 'relative' ? '' : rawApiOrigin).replace(/\/$/, '');

function apiUrl(path: string) {
  if (API_ORIGIN) return `${API_ORIGIN}${path}`;
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
  const { session, loading: authLoading, error: authError } = useAuth();
  const [statusLoading, setStatusLoading] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [status, setStatus] = useState<LinkStatusResponse | null>(null);
  const [codeBoxes, setCodeBoxes] = useState<string[]>(Array.from({ length: CODE_LENGTH }, () => ''));
  const [linkMessage, setLinkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [linkBusy, setLinkBusy] = useState<boolean>(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [resolvedApiOrigin, setResolvedApiOrigin] = useState<string>(API_ORIGIN || '');


  const accessToken = session?.access_token || null;

  const codeValue = useMemo(() => codeBoxes.join('').trim(), [codeBoxes]);

  useEffect(() => {
    if (!API_ORIGIN && typeof window !== 'undefined') {
      setResolvedApiOrigin(window.location.origin);
    }
    if (typeof window !== 'undefined') {
      const origin = API_ORIGIN || window.location.origin;
      console.info('[link-page] using API origin', origin);
    }
  }, []);

  async function authFetch(path: string, init?: RequestInit) {
    if (!accessToken) throw new Error('No active session');
    const headers = new Headers(init?.headers || {});
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    headers.set('Content-Type', 'application/json');
    const target = API_ORIGIN ? `${API_ORIGIN}${path}` : (typeof window !== 'undefined' ? `${window.location.origin}${path}` : path);
    if (typeof window !== 'undefined') {
      console.info('[link-page] authFetch', target);
    }
    const response = await fetch(target, {
      ...init,
      credentials: init?.credentials ?? 'include',
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
        if (typeof window !== 'undefined') {
          console.error('[link-page] status request failed', response.status, payload);
        }
        throw new Error(payload?.error || `Request failed (${response.status})`);
      }
      setStatus(payload as LinkStatusResponse);
    } catch (err: any) {
      if (typeof window !== 'undefined') {
        console.error('[link-page] status request error', err);
      }
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


  return (
    <div style={{ minHeight: 'calc(100vh - 60px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', background: 'linear-gradient(135deg, #0b0c10 0%, #1a1d29 50%, #0b0c10 100%)' }}>
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes successCheck {
          from {
            stroke-dashoffset: 100;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(102, 126, 234, 0.3); }
          50% { box-shadow: 0 0 40px rgba(102, 126, 234, 0.6); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .magic-sending {
          animation: pulse 1.5s ease-in-out infinite;
        }
        .slide-up {
          animation: slideUp 0.5s ease-out;
        }
        .glow-effect {
          animation: glow 2s ease-in-out infinite;
        }
      `}</style>
      <div style={{ width: '100%', maxWidth: 680, position: 'relative' }}>
        <div style={{
          position: 'absolute',
          top: -40,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 120,
          background: 'linear-gradient(135deg, #667eea, #764ba2)',
          borderRadius: '50%',
          opacity: 0.1,
          filter: 'blur(40px)'
        }} />
        <h1 style={{
          fontSize: 42,
          margin: 0,
          marginBottom: 16,
          textAlign: 'center',
          background: 'linear-gradient(135deg, #667eea, #764ba2)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.5px'
        }}>Link Your Dexter Account</h1>
        <p style={{ color: '#9fb2c8', marginBottom: 48, textAlign: 'center', fontSize: 18, lineHeight: 1.6 }}>
          Connect your web account to MCP (Claude, ChatGPT, etc.)
        </p>
        <div style={{ color: '#607499', textAlign: 'center', fontSize: 12, marginBottom: 32 }}>
          API endpoint: {resolvedApiOrigin || '(relative)'}
        </div>

        {authLoading && (
          <div style={{ color: '#9fb2c8', textAlign: 'center', padding: 40 }}>Loading authentication…</div>
        )}
        {authError && (
          <div style={{ background: '#2b0e0e', border: '1px solid #5a2323', color: '#ff9f9f', padding: 16, borderRadius: 12, marginBottom: 24, textAlign: 'center' }}>
            {authError}
          </div>
        )}

        {!authLoading && !authError && (
          <>
            {!session && (
              <section style={{ marginBottom: 48, background: 'rgba(17, 21, 35, 0.4)', backdropFilter: 'blur(10px)', borderRadius: 20, padding: 32, border: '1px solid rgba(102, 126, 234, 0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'rgba(102, 126, 234, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    fontWeight: 'bold'
                  }}>✓</div>
                  <h2 style={{ fontSize: 22, margin: 0 }}>Sign in required</h2>
                </div>
                <p style={{ color: '#9fb2c8', lineHeight: 1.6 }}>
                  Please sign in using the button in the top right corner to link your Dexter account with MCP.
                </p>
              </section>
            )}

            <section style={{ marginBottom: 48, background: 'rgba(17, 21, 35, 0.4)', backdropFilter: 'blur(10px)', borderRadius: 20, padding: 32, border: '1px solid rgba(102, 126, 234, 0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: session ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(102, 126, 234, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 'bold',
                  transition: 'all 0.3s'
                }}>1</div>
                <h2 style={{ fontSize: 22, margin: 0 }}>Enter linking code</h2>
              </div>
              <p style={{ color: '#9fb2c8', marginBottom: 24, lineHeight: 1.6 }}>
                In Claude or ChatGPT, run <code style={{
                  background: 'rgba(102, 126, 234, 0.1)',
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid rgba(102, 126, 234, 0.2)',
                  fontSize: 14
                }}>generate_dexter_linking_code</code> and paste the code below.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 24 }}>
                {codeBoxes.map((value, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    value={value}
                    onChange={(event) => handleInput(index, event.target.value)}
                    onKeyDown={(event) => handleKeyDown(index, event)}
                    onPaste={handlePaste}
                    maxLength={1}
                    className={value ? 'glow-effect' : ''}
                    style={codeInputStyle(value)}
                    disabled={!session}
                  />
                ))}
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                <button
                  onClick={handleVerify}
                  disabled={!session || linkBusy || codeValue.length !== CODE_LENGTH}
                  style={{
                    ...buttonStyle,
                    padding: '14px 20px',
                    fontSize: 16,
                    opacity: (!session || codeValue.length !== CODE_LENGTH) ? 0.5 : 1,
                    cursor: (!session || codeValue.length !== CODE_LENGTH) ? 'not-allowed' : 'pointer'
                  }}>
                  {linkBusy ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="60" strokeDashoffset="15" />
                      </svg>
                      Linking account...
                    </span>
                  ) : 'Link account'}
                </button>
                <div style={{ textAlign: 'center', color: '#9fb2c8', fontSize: 14 }}>— or —</div>
                <button
                  onClick={handleGenerateCode}
                  disabled={!session || linkBusy}
                  style={{
                    ...secondaryButtonStyle,
                    padding: '12px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    opacity: !session ? 0.5 : 1,
                    cursor: !session ? 'not-allowed' : 'pointer'
                  }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7V12C2 16.55 4.84 20.74 9 22C13.16 20.74 16 16.55 16 12V7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Generate code here instead
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

            <section style={{ background: 'rgba(17, 21, 35, 0.4)', backdropFilter: 'blur(10px)', borderRadius: 20, padding: 32, border: '1px solid rgba(102, 126, 234, 0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: (session && status?.links?.length) ? 'linear-gradient(135deg, #667eea, #764ba2)' : 'rgba(102, 126, 234, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 'bold',
                  transition: 'all 0.3s'
                }}>2</div>
                <h2 style={{ fontSize: 22, margin: 0 }}>Linked accounts</h2>
              </div>
              {statusLoading && <div style={{ color: '#9fb2c8' }}>Loading…</div>}
              {statusError && (
                <div style={{ background: '#2b0e0e', border: '1px solid #5a2323', color: '#ff9f9f', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                  {statusError}
                </div>
              )}
              {!statusLoading && status && status.links.length === 0 && (
                <div style={{ color: '#9fb2c8', textAlign: 'center', padding: '20px 0' }}>No MCP accounts linked yet.</div>
              )}
              {status && status.links.length > 0 && (
                <div style={{ display: 'grid', gap: 16 }}>
                  {status.links.map((link) => (
                    <div
                      key={`${link.provider}:${link.subject || 'unknown'}`}
                      className="slide-up"
                      style={{
                        background: 'rgba(16, 21, 35, 0.6)',
                        borderRadius: 12,
                        padding: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: '1px solid rgba(102, 126, 234, 0.1)',
                        transition: 'all 0.3s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.border = '1px solid rgba(102, 126, 234, 0.3)'}
                      onMouseLeave={(e) => e.currentTarget.style.border = '1px solid rgba(102, 126, 234, 0.1)'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{
                          width: 48,
                          height: 48,
                          borderRadius: 12,
                          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.2), rgba(118, 75, 162, 0.2))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>{link.provider}</div>
                          <div style={{ color: '#9fb2c8', fontSize: 13 }}>Linked {new Date(link.linked_at).toLocaleString()}</div>
                          {link.subject && <div style={{ color: '#9fb2c8', fontSize: 12, marginTop: 2 }}>ID: {link.subject}</div>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleUnlink(link.provider, link.subject || undefined)}
                        style={{
                          ...secondaryButtonStyle,
                          padding: '8px 16px',
                          fontSize: 14,
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: '#ef4444'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                      >
                        Unlink
                      </button>
                    </div>
                  ))}
                  {status.links.length > 1 && (
                    <button
                      onClick={() => handleUnlink()}
                      style={{
                        ...secondaryButtonStyle,
                        marginTop: 8,
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        background: 'rgba(239, 68, 68, 0.05)',
                        color: '#ef4444'
                      }}
                    >
                      Unlink all accounts
                    </button>
                  )}
                </div>
              )}
              <div style={{ marginTop: 20, textAlign: 'center' }}>
                <button
                  onClick={refreshStatus}
                  disabled={!session}
                  style={{
                    ...tertiaryButtonStyle,
                    opacity: !session ? 0.5 : 1,
                    cursor: !session ? 'not-allowed' : 'pointer'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M1 4V10H1M1 10H7M1 10L5.64 5.64C6.71 4.57 8.03 3.78 9.5 3.37C10.97 2.96 12.53 2.94 14.01 3.31C15.49 3.68 16.84 4.43 17.93 5.48C19.02 6.53 19.82 7.85 20.26 9.32M23 20V14H23M23 14H17M23 14L18.36 18.36C17.29 19.43 15.97 20.22 14.5 20.63C13.03 21.04 11.47 21.06 9.99 20.69C8.51 20.32 7.16 19.57 6.07 18.52C4.98 17.47 4.18 16.15 3.74 14.68" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Refresh status
                  </span>
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
    width: 56,
    height: 68,
    textAlign: 'center',
    fontSize: 32,
    fontWeight: 700,
    borderRadius: 16,
    border: '2px solid ' + (value ? '#667eea' : 'rgba(102, 126, 234, 0.2)'),
    background: value ? 'rgba(102, 126, 234, 0.1)' : 'rgba(11, 15, 24, 0.6)',
    color: value ? '#667eea' : '#e6edf3',
    textTransform: 'uppercase',
    transition: 'all 0.3s',
    cursor: 'text',
  };
}
