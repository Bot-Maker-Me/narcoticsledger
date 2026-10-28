import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { reportError } from '@/lib/errors';
import type { Profile } from '@/types/admin';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, pharmacyName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Emails a recovery link that returns the user to `/reset-password`. */
  resetPassword: (email: string) => Promise<void>;
  /** Sets a new password for the signed-in user (used by the recovery screen). */
  updatePassword: (password: string) => Promise<void>;
  updatePharmacyName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Absolute app URLs for the flows that come back through a link. */
function callbackUrl(path: string): string {
  return new URL(path, window.location.origin).href;
}

/**
 * PostgREST returns an array for a set-returning RPC (`RETURNS TABLE`) and a bare object for
 * a single-row one. Normalising both stops a set-returning RPC such as `get_my_profile` from
 * producing a profile whose every field silently reads as undefined.
 */
function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  if (data && typeof data === 'object') return data as T;
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (!data.session) {
        setLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }

    let mounted = true;

    (async () => {
      const { data, error } = await supabase.rpc('get_my_profile');
      if (!mounted) return;

      const existing = firstRow<Profile>(data);
      if (!error && existing) {
        setProfile(existing);
        setLoading(false);
        return;
      }

      if (error) reportError(error, { scope: 'get_my_profile' });

      // No profile at all, so the signup trigger must have failed. Ask the database to
      // recreate it with safe defaults rather than leaving the account with no plan, which
      // also used to skip the paywall entirely.
      const { data: healed, error: healError } = await supabase.rpc('ensure_my_profile');
      if (!mounted) return;

      const repaired = firstRow<Profile>(healed);
      if (repaired) {
        setProfile(repaired);
        setLoading(false);
        return;
      }

      if (healError) reportError(healError, { scope: 'ensure_my_profile' });

      reportError(new Error('Could not load or create a profile for this account'), { scope: 'auth-profile' });
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [session]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, pharmacyName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callbackUrl('/auth/callback'),
        data: {
          pharmacy_name: pharmacyName || 'My Pharmacy',
        },
      },
    });
    if (error) {
      reportError(error, { scope: 'signup' });
      throw error;
    }

    // Update profile with pharmacy name after signup
    if (data.user && pharmacyName) {
      try {
        await supabase
          .from('profiles')
          .update({ pharmacy_name: pharmacyName })
          .eq('id', data.user.id);
      } catch (err) {
        reportError(err, { scope: 'signup-pharmacy-name' });
        // Don't throw error, signup was successful
      }
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: callbackUrl('/reset-password'),
    });
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  const updatePharmacyName = async (name: string) => {
    if (!session?.user) throw new Error('You need to be signed in to do that');

    const { error } = await supabase
      .from('profiles')
      .update({ pharmacy_name: name })
      .eq('id', session.user.id);

    if (error) throw error;
    setProfile((previous) => (previous ? { ...previous, pharmacy_name: name } : previous));
  };

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    updatePharmacyName,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
