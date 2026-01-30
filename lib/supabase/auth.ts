import React from 'react';
import { createClient } from './client';

export async function getSession() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('[Auth] Error getting session:', error);
    return null;
  }

  return data.session;
}

export async function getUser() {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error('[Auth] Error getting user:', error);
    return null;
  }

  return data.user;
}

export async function requireUser() {
  const user = await getUser();

  if (!user) {
    throw new Error('You must be signed in to perform this action');
  }

  return user;
}

export function useAuthUser() {
  if (typeof window === 'undefined') {
    return null;
  }

  const supabase = createClient();
  const [user, setUser] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
      setLoading(false);
    };

    fetchUser();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
