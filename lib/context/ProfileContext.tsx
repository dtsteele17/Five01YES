'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  location: string | null;
  about: string | null;
  favorite_format: '301' | '501' | null;
  playing_since: number | null;
  preferred_hand: 'Left' | 'Right' | null;
  ranked_points: number;
  trust_rating_letter?: string | null;
  trust_rating_avg?: number | null;
  trust_rating_count?: number | null;
  safety_rating_letter?: string | null;
  safety_rating_avg?: number | null;
  safety_rating_count?: number | null;
  created_at: string;
  updated_at: string | null;
}

interface ProfileContextType {
  profile: UserProfile | null;
  loading: boolean;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          safety_rating_letter,
          safety_rating_avg,
          safety_rating_count,
          trust_rating_letter,
          trust_rating_avg,
          trust_rating_count
        `)
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('profiles')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      setProfile((prev) => (prev ? { ...prev, ...updates } : null));
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  };

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        updateProfile,
        refreshProfile: fetchProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (context === undefined) {
    if (typeof window !== 'undefined') {
      console.error('useProfile must be used within a ProfileProvider');
    }
    return {
      profile: null,
      loading: true,
      updateProfile: async () => {},
      refreshProfile: async () => {},
    };
  }
  return context;
}
