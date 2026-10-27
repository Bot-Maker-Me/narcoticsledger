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

      if (!error && data) {
        setProfile(data as Profile);
        setLoading(false);
        return;
      }

      if (error) reportError(error, { scope: 'get_my_profile' });

      const { data: existing } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .limit(1)
        .maybeSingle();

      if (!mounted) return;

      if (existing) {
        setProfile(existing as Profile);
        setLoading(false);
        return;
      }

      // Profile creation failed - trigger should have handled this
      console.error('Profile not found and trigger failed to create it');
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
      console.error('Signup error:', error);
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
