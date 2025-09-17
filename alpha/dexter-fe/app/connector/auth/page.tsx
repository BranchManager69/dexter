'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../auth-context';

type AuthRequestInfo = {
  client_id: string;
  redirect_uri: string;
  state: string | null;
  scope: string | null;
};

function ConnectorAuthContent() {
  const searchParams = useSearchParams();
  const requestId = searchParams.get('request_id');

  const { session, loading, error, sendMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [requestInfo, setRequestInfo] = useState<AuthRequestInfo | null>(null);
  const [status, setStatus] = useState<'init' | 'fetching' | 'waiting' | 'sending' | 'exchanging' | 'redirecting' | 'error'>('init');
  const [message, setMessage] = useState<string>('');
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicError, setMagicError] = useState<string>('');
  const [exchangeError, setExchangeError] = useState<string>('');

  useEffect(() => {
    if (!requestId) {
      setStatus('error');
      setMessage('Missing connector request identifier. Close this window and retry.');
      return;
    }
    setStatus('fetching');
    fetch(`/api/connector/oauth/request?request_id=${encodeURIComponent(requestId)}`)
      .then(async (resp) => {
        if (!resp.ok) {
          throw new Error('Request not found or expired. Close this window and reconnect.');
        }
        const data = await resp.json();
        setRequestInfo(data.request);
        setStatus('waiting');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err?.message || 'Unable to load connector request.');
      });
  }, [requestId]);

  useEffect(() => {
    if (!requestId || !requestInfo || !session) return;
    const refreshToken = session.refresh_token;
    if (!refreshToken) {
      setExchangeError('Active Supabase session missing refresh token. Please sign out and sign in again.');
      return;
    }
    let cancelled = false;
    async function exchange() {
      try {
        setExchangeError('');
        setStatus('exchanging');
        const resp = await fetch('/api/connector/oauth/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_id: requestId,
            refresh_token: refreshToken,
          }),
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => null);
          throw new Error(data?.error || 'exchange_failed');
        }
        const data = await resp.json();
        const redirect = new URL(data.redirect_uri);
        redirect.searchParams.set('code', data.code);
        if (data.state) redirect.searchParams.set('state', data.state);
        setStatus('redirecting');
        if (!cancelled) window.location.replace(redirect.toString());
      } catch (err: any) {
        if (!cancelled) {
          setExchangeError(err?.message || 'Unable to complete authorization.');
          setStatus('error');
        }
      }
    }
    exchange();
    return () => {
      cancelled = true;
    };
  }, [requestId, requestInfo, session]);

  const header = useMemo(() => {
    if (requestInfo?.scope?.includes('voice')) return 'Connect Dexter Voice';
    return 'Authorize Dexter Connector';
  }, [requestInfo]);

  const handleSendMagicLink = async () => {
    setMagicError('');
    setMagicLinkSent(false);
    setStatus('sending');
    const result = await sendMagicLink(email.trim());
    if (result.success) {
      setMagicLinkSent(true);
      setStatus('waiting');
    } else {
      setMagicError(result.message);
      setStatus('waiting');
    }
  };

  const renderLoginForm = () => (
    <div style={{ marginTop: 24 }}>
      <p style={{ lineHeight: 1.5 }}>
        Enter the email associated with your Dexter account and we will send a sign-in link. Open it in the same browser,
        then return to this window.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(102,126,234,0.35)', background: 'rgba(17,19,26,0.8)', color: '#e6edf3' }}
        />
        <button
          onClick={handleSendMagicLink}
          disabled={!email.trim() || status === 'sending'}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: '#667eea',
            color: '#fff',
            fontWeight: 600,
            cursor: status === 'sending' ? 'wait' : 'pointer',
          }}
        >
          {status === 'sending' ? 'Sending…' : 'Send Link'}
        </button>
      </div>
      {magicLinkSent && (
        <p style={{ marginTop: 12, color: '#7aa2f7' }}>
          Magic link sent! Check your inbox and open the link in this browser to continue.
        </p>
      )}
      {magicError && (
        <p style={{ marginTop: 12, color: '#f37f97' }}>{magicError}</p>
      )}
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#07080c',
      color: '#e6edf3',
      fontFamily: 'system-ui, sans-serif',
      padding: 24,
    }}>
      <div style={{ maxWidth: 520, width: '100%', background: '#11131a', borderRadius: 18, padding: 32, border: '1px solid rgba(102,126,234,0.25)', boxShadow: '0 30px 70px rgba(0,0,0,0.45)' }}>
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>{header}</h1>
        {requestInfo ? (
          <p style={{ marginTop: 0, marginBottom: 16, lineHeight: 1.5 }}>
            Approve access so that Dexter can interact with your wallets and tools inside the connector.
          </p>
        ) : (
          <p style={{ lineHeight: 1.5 }}>Preparing authorization…</p>
        )}

        {error && (
          <p style={{ color: '#f37f97', marginBottom: 16 }}>{error}</p>
        )}
        {message && (
          <p style={{ color: '#f37f97', marginBottom: 16 }}>{message}</p>
        )}
        {exchangeError && (
          <p style={{ color: '#f37f97', marginBottom: 16 }}>{exchangeError}</p>
        )}

        {!session && !loading && renderLoginForm()}
        {loading && (
          <p style={{ color: '#9fb2c8' }}>Loading authentication…</p>
        )}
        {session && requestInfo && (
          <div style={{ marginTop: 16 }}>
            <p style={{ color: '#7aa2f7' }}>
              Signed in as <strong>{session.user?.email}</strong>. Completing authorization…
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConnectorAuthPage() {
  return (
    <Suspense fallback={(
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#07080c',
        color: '#e6edf3',
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
      }}>
        <p style={{ color: '#9fb2c8' }}>Preparing authorization…</p>
      </div>
    )}>
      <ConnectorAuthContent />
    </Suspense>
  );
}
