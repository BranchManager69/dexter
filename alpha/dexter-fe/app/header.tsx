'use client';

import { useState } from 'react';
import { useAuth } from './auth-context';

const VERSION_TAG = 'rev-2025-09-17-1';

export function Header() {
  const { session, loading, signOut, sendMagicLink } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [email, setEmail] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [magicLinkBusy, setMagicLinkBusy] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const detectEmailProvider = (emailAddress: string): string => {
    const domain = emailAddress.split('@')[1]?.toLowerCase();
    if (!domain) return '';

    const providerMap: Record<string, string> = {
      'gmail.com': 'gmail',
      'googlemail.com': 'gmail',
      'outlook.com': 'outlook',
      'hotmail.com': 'outlook',
      'live.com': 'outlook',
      'msn.com': 'outlook',
      'yahoo.com': 'yahoo',
      'yahoo.co.uk': 'yahoo',
      'yahoo.fr': 'yahoo',
      'icloud.com': 'icloud',
      'me.com': 'icloud',
      'mac.com': 'icloud',
      'protonmail.com': 'proton',
      'proton.me': 'proton',
      'pm.me': 'proton',
    };

    for (const [key, provider] of Object.entries(providerMap)) {
      if (domain === key) return provider;
    }
    return '';
  };

  const getInboxUrl = (provider: string): string => {
    const urls: Record<string, string> = {
      'gmail': 'https://mail.google.com',
      'outlook': 'https://outlook.live.com/mail',
      'yahoo': 'https://mail.yahoo.com',
      'icloud': 'https://www.icloud.com/mail',
      'proton': 'https://mail.proton.me',
    };
    return urls[provider] || '';
  };

  const handleSendMagicLink = async () => {
    setMagicLinkBusy(true);
    setMagicLinkSent(false);
    setAuthMessage('');

    const result = await sendMagicLink(email);

    if (result.success) {
      setMagicLinkSent(true);
    } else {
      setAuthMessage(result.message);
    }

    setMagicLinkBusy(false);
  };

  const handleSignOut = async () => {
    await signOut();
    setShowAuthModal(false);
    setEmail('');
    setAuthMessage('');
    setMagicLinkSent(false);
  };

  const userEmailProvider = detectEmailProvider(email);

  return (
    <>
      <style jsx global>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .auth-modal-enter {
          animation: slideDown 0.2s ease-out;
        }
      `}</style>

      <header style={{
        position: 'sticky',
        top: 0,
        background: '#11131a',
        borderBottom: '1px solid #222633',
        padding: '10px 16px',
        zIndex: 100
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16
        }}>
          <nav style={{ display: 'flex', gap: 12 }}>
            <a href="/voice" style={{ color: '#e6edf3' }}>Voice</a>
            <a href="/chat" style={{ color: '#e6edf3' }}>Chat</a>
            <a href="/tools" style={{ color: '#e6edf3' }}>Tools</a>
            <a href="/link" style={{ color: '#e6edf3' }}>Link</a>
          </nav>

          <span style={{
            color: '#7aa2f7',
            fontSize: 12,
            letterSpacing: 0.5,
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)'
          }}>
            dexter · {VERSION_TAG}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {loading ? (
              <div style={{ color: '#9fb2c8', fontSize: 14 }}>Loading...</div>
            ) : session ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                position: 'relative'
              }}>
                <button
                  onClick={() => setShowAuthModal(!showAuthModal)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid rgba(102, 126, 234, 0.3)',
                    background: 'rgba(102, 126, 234, 0.1)',
                    color: '#e6edf3',
                    fontSize: 14,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(102, 126, 234, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.3)';
                  }}
                >
                  <div style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #667eea, #764ba2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 'bold'
                  }}>
                    {(session.user?.email || 'U')[0].toUpperCase()}
                  </div>
                  <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {session.user?.email || 'User'}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {showAuthModal && (
                  <div className="auth-modal-enter" style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 8,
                    background: 'rgba(17, 21, 35, 0.98)',
                    border: '1px solid rgba(102, 126, 234, 0.3)',
                    borderRadius: 12,
                    padding: 16,
                    minWidth: 250,
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(10px)'
                  }}>
                    <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid rgba(102, 126, 234, 0.2)' }}>
                      <div style={{ color: '#9fb2c8', fontSize: 12, marginBottom: 4 }}>Signed in as</div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{session.user?.email}</div>
                    </div>
                    <button
                      onClick={handleSignOut}
                      style={{
                        width: '100%',
                        padding: '8px 16px',
                        borderRadius: 8,
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        fontSize: 14,
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowAuthModal(!showAuthModal)}
                  style={{
                    padding: '6px 16px',
                    borderRadius: 8,
                    border: '1px solid #3d5afe',
                    background: 'linear-gradient(135deg, #667eea, #764ba2)',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  Sign in
                </button>

                {showAuthModal && (
                  <div className="auth-modal-enter" style={{
                    position: 'absolute',
                    top: 48,
                    right: 16,
                    background: 'rgba(17, 21, 35, 0.98)',
                    border: '1px solid rgba(102, 126, 234, 0.3)',
                    borderRadius: 12,
                    padding: 20,
                    minWidth: 320,
                    boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(10px)',
                    zIndex: 101
                  }}>
                    <h3 style={{ margin: 0, marginBottom: 16, fontSize: 18 }}>Sign in to Dexter</h3>

                    {!magicLinkSent ? (
                      <>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            marginBottom: 12,
                            borderRadius: 8,
                            border: '2px solid rgba(102, 126, 234, 0.2)',
                            background: 'rgba(11, 15, 24, 0.6)',
                            color: '#e6edf3',
                            fontSize: 14,
                            transition: 'border-color 0.2s'
                          }}
                          onFocus={(e) => e.target.style.borderColor = 'rgba(102, 126, 234, 0.5)'}
                          onBlur={(e) => e.target.style.borderColor = 'rgba(102, 126, 234, 0.2)'}
                          onKeyDown={(e) => e.key === 'Enter' && handleSendMagicLink()}
                        />

                        <button
                          onClick={handleSendMagicLink}
                          disabled={magicLinkBusy}
                          style={{
                            width: '100%',
                            padding: '10px 16px',
                            borderRadius: 8,
                            border: '1px solid #3d5afe',
                            background: 'linear-gradient(135deg, #667eea, #764ba2)',
                            color: '#fff',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: magicLinkBusy ? 'not-allowed' : 'pointer',
                            opacity: magicLinkBusy ? 0.7 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8
                          }}
                        >
                          {magicLinkBusy ? (
                            <>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="60" strokeDashoffset="15" />
                              </svg>
                              Sending...
                            </>
                          ) : (
                            'Send magic link'
                          )}
                        </button>

                        {authMessage && (
                          <div style={{
                            marginTop: 12,
                            padding: 8,
                            borderRadius: 6,
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#ef4444',
                            fontSize: 13
                          }}>
                            {authMessage}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        borderRadius: 8,
                        padding: 16,
                        textAlign: 'center'
                      }}>
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ margin: '0 auto 12px' }}>
                          <circle cx="12" cy="12" r="10" stroke="#22c55e" strokeWidth="2"/>
                          <path d="M8 12L11 15L16 9" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <h4 style={{ margin: 0, marginBottom: 8, color: '#22c55e', fontSize: 16 }}>Magic link sent!</h4>
                        <p style={{ margin: 0, marginBottom: 12, color: '#9fb2c8', fontSize: 13 }}>
                          Check your email for the sign-in link.
                        </p>

                        {userEmailProvider && (
                          <a
                            href={getInboxUrl(userEmailProvider)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '8px 16px',
                              borderRadius: 6,
                              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                              color: '#fff',
                              fontSize: 13,
                              fontWeight: 600,
                              textDecoration: 'none'
                            }}
                          >
                            Open {userEmailProvider.charAt(0).toUpperCase() + userEmailProvider.slice(1)}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                              <path d="M10 6H6C4.89543 6 4 6.89543 4 8V18C4 19.1046 4.89543 20 6 20H16C17.1046 20 18 19.1046 18 18V14M14 4H20M20 4V10M20 4L10 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </a>
                        )}

                        <button
                          onClick={() => {
                            setMagicLinkSent(false);
                            setEmail('');
                            setShowAuthModal(false);
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            marginTop: 12,
                            padding: '8px',
                            background: 'transparent',
                            border: '1px solid rgba(102, 126, 234, 0.3)',
                            borderRadius: 6,
                            color: '#9fb2c8',
                            fontSize: 13,
                            cursor: 'pointer'
                          }}
                        >
                          Close
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {showAuthModal && (
        <div
          onClick={() => setShowAuthModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99,
            background: 'transparent'
          }}
        />
      )}
    </>
  );
}