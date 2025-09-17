'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';

function apiUrl(path: string) {
  // Always use relative URLs to go through Next.js rewrites
  return path;
}

interface AuthContextType {
  supabase: SupabaseClient | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  sendMagicLink: (email: string) => Promise<{ success: boolean; message: string }>;
}

const AuthContext = createContext<AuthContextType>({
  supabase: null,
  session: null,
  loading: true,
  error: null,
  signOut: async () => {},
  sendMagicLink: async () => ({ success: false, message: 'Not initialized' }),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    async function bootstrap() {
      setLoading(true);
      setError(null);
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
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Unable to load authentication config.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setSession(null);
  };

  const sendMagicLink = async (email: string): Promise<{ success: boolean; message: string }> => {
    if (!supabase) return { success: false, message: 'Authentication not initialized' };

    const trimmed = email.trim();
    if (!trimmed) {
      return { success: false, message: 'Enter your email.' };
    }

    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/link` : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      if (error) throw error;
      return { success: true, message: 'Check your email for the sign-in link.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Unable to send magic link.' };
    }
  };

  return (
    <AuthContext.Provider value={{ supabase, session, loading, error, signOut, sendMagicLink }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}