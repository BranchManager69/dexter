'use client';

import Link from 'next/link';
import { useAuth } from '../auth-context';

export default function LinkPage() {
  const { session } = useAuth();

  return (
    <div style={{ maxWidth: 640, margin: '24px auto', padding: 24, background: '#11131a', borderRadius: 16, border: '1px solid rgba(102,126,234,0.25)' }}>
      <h1 style={{ marginTop: 0, marginBottom: 12 }}>Dexter Account</h1>
      {session ? (
        <p style={{ lineHeight: 1.5 }}>
          You are signed in as <strong>{session.user?.email}</strong>. Connect Dexter to ChatGPT or Claude by
          adding the MCP server and completing the built-in OAuth flow. No manual link codes are required anymore.
        </p>
      ) : (
        <p style={{ lineHeight: 1.5 }}>
          Sign in with your email or Supabase magic link first. Once signed in, open ChatGPT or Claude, add the Dexter
          connector, and approve the sign-in popup powered by Supabase.
        </p>
      )}
      <div style={{ marginTop: 24 }}>
        <ul style={{ lineHeight: 1.6 }}>
          <li>ChatGPT: Settings → Connectors → “Add” → enter the MCP URL provided by Dexter.</li>
          <li>Claude: Settings → Tools → “Add tool” → paste the Dexter MCP URL.</li>
          <li>When prompted, approve the Dexter OAuth popup. That’s it — wallets are linked automatically.</li>
        </ul>
      </div>
      <p style={{ marginTop: 24 }}>
        Need help? Check the <Link href="/tools">Tools</Link> page or contact the team in Discord.
      </p>
    </div>
  );
}
