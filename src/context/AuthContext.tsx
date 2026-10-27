import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/admin';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, pharmacyName?: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

      // Profile missing — DB trigger should have created it on signup
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
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          pharmacy_name: pharmacyName || 'My Pharmacy',
        },
      },
    });
    if (error) throw error;

    // Best-effort update of pharmacy name (trigger may already have set it)
    if (data.user && pharmacyName) {
      try {
        await supabase
          .from('profiles')
          .update({ pharmacy_name: pharmacyName })
          .eq('id', data.user.id);
      } catch {
        // Non-fatal: signup already succeeded
      }
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
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
