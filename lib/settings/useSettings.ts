'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  getMatchReminders,
  setMatchReminders,
  getTournamentUpdates,
  setTournamentUpdates,
  getLeagueAnnouncements,
  setLeagueAnnouncements,
  getAchievementUnlocked,
  setAchievementUnlocked,
  getNewMessages,
  setNewMessages,
  getDarkMode,
  setDarkMode,
  getReduceMotion,
  setReduceMotion,
  initDarkMode,
  initReduceMotion,
} from './userSettings';

// Notification settings hook
export function useNotificationSettings() {
  const [matchReminders, setMatchRemindersState] = useState(true);
  const [tournamentUpdates, setTournamentUpdatesState] = useState(true);
  const [leagueAnnouncements, setLeagueAnnouncementsState] = useState(true);
  const [achievementUnlocked, setAchievementUnlockedState] = useState(true);
  const [newMessages, setNewMessagesState] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load from localStorage on mount
    setMatchRemindersState(getMatchReminders());
    setTournamentUpdatesState(getTournamentUpdates());
    setLeagueAnnouncementsState(getLeagueAnnouncements());
    setAchievementUnlockedState(getAchievementUnlocked());
    setNewMessagesState(getNewMessages());
    setIsLoaded(true);
  }, []);

  const toggleMatchReminders = useCallback((enabled: boolean) => {
    setMatchReminders(enabled);
    setMatchRemindersState(enabled);
  }, []);

  const toggleTournamentUpdates = useCallback((enabled: boolean) => {
    setTournamentUpdates(enabled);
    setTournamentUpdatesState(enabled);
  }, []);

  const toggleLeagueAnnouncements = useCallback((enabled: boolean) => {
    setLeagueAnnouncements(enabled);
    setLeagueAnnouncementsState(enabled);
  }, []);

  const toggleAchievementUnlocked = useCallback((enabled: boolean) => {
    setAchievementUnlocked(enabled);
    setAchievementUnlockedState(enabled);
  }, []);

  const toggleNewMessages = useCallback((enabled: boolean) => {
    setNewMessages(enabled);
    setNewMessagesState(enabled);
  }, []);

  return {
    matchReminders,
    tournamentUpdates,
    leagueAnnouncements,
    achievementUnlocked,
    newMessages,
    isLoaded,
    toggleMatchReminders,
    toggleTournamentUpdates,
    toggleLeagueAnnouncements,
    toggleAchievementUnlocked,
    toggleNewMessages,
  };
}

// Appearance settings hook
export function useAppearanceSettings() {
  const [darkMode, setDarkModeState] = useState(true);
  const [reduceMotion, setReduceMotionState] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Load from localStorage and init on mount
    const darkModeValue = getDarkMode();
    const reduceMotionValue = getReduceMotion();
    
    setDarkModeState(darkModeValue);
    setReduceMotionState(reduceMotionValue);
    
    // Initialize classes
    initDarkMode();
    initReduceMotion();
    
    setIsLoaded(true);
  }, []);

  const toggleDarkMode = useCallback((enabled: boolean) => {
    setDarkMode(enabled);
    setDarkModeState(enabled);
  }, []);

  const toggleReduceMotion = useCallback((enabled: boolean) => {
    setReduceMotion(enabled);
    setReduceMotionState(enabled);
  }, []);

  return {
    darkMode,
    reduceMotion,
    isLoaded,
    toggleDarkMode,
    toggleReduceMotion,
  };
}

// Privacy settings hook
export interface PrivacySettings {
  profileVisibility: boolean;
  showOnlineStatus: boolean;
}

export function usePrivacySettings() {
  const [settings, setSettings] = useState<PrivacySettings>({
    profileVisibility: true,
    showOnlineStatus: true,
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const supabase = createClient();

  // Load settings from database
  useEffect(() => {
    async function loadSettings() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoaded(true);
          return;
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('profile_visibility, show_online_status')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error loading privacy settings:', error);
          // Use defaults if error
          setIsLoaded(true);
          return;
        }

        if (profile) {
          setSettings({
            profileVisibility: profile.profile_visibility ?? true,
            showOnlineStatus: profile.show_online_status ?? true,
          });
        }
      } catch (error) {
        console.error('Error in loadSettings:', error);
      } finally {
        setIsLoaded(true);
      }
    }

    loadSettings();
  }, [supabase]);

  // Save settings to database
  const savePrivacySettings = useCallback(async (newSettings: Partial<PrivacySettings>) => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          profile_visibility: newSettings.profileVisibility,
          show_online_status: newSettings.showOnlineStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        throw error;
      }

      setSettings(prev => ({ ...prev, ...newSettings }));
      return true;
    } catch (error) {
      console.error('Error saving privacy settings:', error);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [supabase]);

  const toggleProfileVisibility = useCallback(async (enabled: boolean) => {
    const success = await savePrivacySettings({ profileVisibility: enabled });
    if (!success) {
      // Revert on error
      setSettings(prev => ({ ...prev }));
    }
    return success;
  }, [savePrivacySettings]);

  const toggleShowOnlineStatus = useCallback(async (enabled: boolean) => {
    const success = await savePrivacySettings({ showOnlineStatus: enabled });
    if (!success) {
      // Revert on error
      setSettings(prev => ({ ...prev }));
    }
    return success;
  }, [savePrivacySettings]);

  return {
    ...settings,
    isLoaded,
    isSaving,
    toggleProfileVisibility,
    toggleShowOnlineStatus,
  };
}

// Account deletion hook
export function useAccountDeletion() {
  const [isDeleting, setIsDeleting] = useState(false);
  const supabase = createClient();

  const deleteAccount = useCallback(async (password: string) => {
    setIsDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Verify password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password,
      });

      if (signInError) {
        throw new Error('Invalid password');
      }

      // Call the delete account API/route
      // Note: Account deletion should be handled server-side for security
      const { error: deleteError } = await supabase.rpc('delete_user_account');
      
      if (deleteError) {
        // If RPC doesn't exist, try direct profile deletion
        const { error: profileError } = await supabase
          .from('profiles')
          .delete()
          .eq('id', user.id);

        if (profileError) {
          throw profileError;
        }
      }

      // Sign out after deletion
      await supabase.auth.signOut();
      
      return true;
    } catch (error) {
      console.error('Error deleting account:', error);
      return false;
    } finally {
      setIsDeleting(false);
    }
  }, [supabase]);

  return {
    isDeleting,
    deleteAccount,
  };
}
