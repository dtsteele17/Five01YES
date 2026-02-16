'use client';

// Notification settings keys
const NOTIFICATION_KEYS = {
  matchReminders: 'settings_notifications_matchReminders',
  tournamentUpdates: 'settings_notifications_tournamentUpdates',
  leagueAnnouncements: 'settings_notifications_leagueAnnouncements',
  achievementUnlocked: 'settings_notifications_achievementUnlocked',
  newMessages: 'settings_notifications_newMessages',
} as const;

// Appearance settings keys
const APPEARANCE_KEYS = {
  darkMode: 'settings_appearance_darkMode',
  reduceMotion: 'settings_appearance_reduceMotion',
} as const;

// Default values
const DEFAULTS = {
  notifications: {
    matchReminders: true,
    tournamentUpdates: true,
    leagueAnnouncements: true,
    achievementUnlocked: true,
    newMessages: true,
  },
  appearance: {
    darkMode: true,
    reduceMotion: false,
  },
};

// Notification settings helpers
export function getMatchReminders(): boolean {
  if (typeof window === 'undefined') return DEFAULTS.notifications.matchReminders;
  const value = localStorage.getItem(NOTIFICATION_KEYS.matchReminders);
  return value === null ? DEFAULTS.notifications.matchReminders : value === 'true';
}

export function setMatchReminders(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTIFICATION_KEYS.matchReminders, String(enabled));
}

export function getTournamentUpdates(): boolean {
  if (typeof window === 'undefined') return DEFAULTS.notifications.tournamentUpdates;
  const value = localStorage.getItem(NOTIFICATION_KEYS.tournamentUpdates);
  return value === null ? DEFAULTS.notifications.tournamentUpdates : value === 'true';
}

export function setTournamentUpdates(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTIFICATION_KEYS.tournamentUpdates, String(enabled));
}

export function getLeagueAnnouncements(): boolean {
  if (typeof window === 'undefined') return DEFAULTS.notifications.leagueAnnouncements;
  const value = localStorage.getItem(NOTIFICATION_KEYS.leagueAnnouncements);
  return value === null ? DEFAULTS.notifications.leagueAnnouncements : value === 'true';
}

export function setLeagueAnnouncements(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTIFICATION_KEYS.leagueAnnouncements, String(enabled));
}

export function getAchievementUnlocked(): boolean {
  if (typeof window === 'undefined') return DEFAULTS.notifications.achievementUnlocked;
  const value = localStorage.getItem(NOTIFICATION_KEYS.achievementUnlocked);
  return value === null ? DEFAULTS.notifications.achievementUnlocked : value === 'true';
}

export function setAchievementUnlocked(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTIFICATION_KEYS.achievementUnlocked, String(enabled));
}

export function getNewMessages(): boolean {
  if (typeof window === 'undefined') return DEFAULTS.notifications.newMessages;
  const value = localStorage.getItem(NOTIFICATION_KEYS.newMessages);
  return value === null ? DEFAULTS.notifications.newMessages : value === 'true';
}

export function setNewMessages(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(NOTIFICATION_KEYS.newMessages, String(enabled));
}

// Appearance settings helpers
export function getDarkMode(): boolean {
  if (typeof window === 'undefined') return DEFAULTS.appearance.darkMode;
  const value = localStorage.getItem(APPEARANCE_KEYS.darkMode);
  return value === null ? DEFAULTS.appearance.darkMode : value === 'true';
}

export function setDarkMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(APPEARANCE_KEYS.darkMode, String(enabled));
  
  // Apply dark mode class to document
  if (enabled) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function initDarkMode(): void {
  if (typeof window === 'undefined') return;
  const enabled = getDarkMode();
  if (enabled) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export function getReduceMotion(): boolean {
  if (typeof window === 'undefined') return DEFAULTS.appearance.reduceMotion;
  const value = localStorage.getItem(APPEARANCE_KEYS.reduceMotion);
  return value === null ? DEFAULTS.appearance.reduceMotion : value === 'true';
}

export function setReduceMotion(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(APPEARANCE_KEYS.reduceMotion, String(enabled));
  
  // Apply reduce motion class to document
  if (enabled) {
    document.documentElement.classList.add('reduce-motion');
  } else {
    document.documentElement.classList.remove('reduce-motion');
  }
}

export function initReduceMotion(): void {
  if (typeof window === 'undefined') return;
  const enabled = getReduceMotion();
  if (enabled) {
    document.documentElement.classList.add('reduce-motion');
  } else {
    document.documentElement.classList.remove('reduce-motion');
  }
}
