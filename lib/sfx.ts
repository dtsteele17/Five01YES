let inviteAudio: HTMLAudioElement | null = null;

const INVITE_SOUND_URL = 'https://azrmgtukcgqslnilodky.supabase.co/storage/v1/object/public/public-assets/Invite%20Noti.mp3';
const PLAYED_IDS_KEY = 'invite_sfx_played_ids';
const SOUND_ENABLED_KEY = 'invite_sound_enabled';

export function playInviteNotificationSfx() {
  try {
    // Check if sound is enabled in settings (default: true)
    const soundEnabled = localStorage.getItem(SOUND_ENABLED_KEY);
    if (soundEnabled === 'false') {
      console.log('[INVITE_SFX] Sound disabled in settings');
      return;
    }

    // Create audio instance if it doesn't exist
    if (!inviteAudio) {
      inviteAudio = new Audio(INVITE_SOUND_URL);
      inviteAudio.volume = 0.6;
      console.log('[INVITE_SFX] Audio instance created');
    }

    // Reset to start and play
    inviteAudio.currentTime = 0;
    inviteAudio.play().catch((error) => {
      console.error('[INVITE_SFX] Failed to play invite sound:', error);
    });

    console.log('[INVITE_SFX] Playing invite notification sound');
  } catch (error) {
    console.error('[INVITE_SFX] Error in playInviteNotificationSfx:', error);
  }
}

export function hasPlayedNotification(notificationId: string): boolean {
  try {
    const playedIdsJson = sessionStorage.getItem(PLAYED_IDS_KEY);
    if (!playedIdsJson) return false;

    const playedIds: string[] = JSON.parse(playedIdsJson);
    return playedIds.includes(notificationId);
  } catch (error) {
    console.error('[INVITE_SFX] Error checking played notifications:', error);
    return false;
  }
}

export function markNotificationAsPlayed(notificationId: string): void {
  try {
    const playedIdsJson = sessionStorage.getItem(PLAYED_IDS_KEY);
    let playedIds: string[] = [];

    if (playedIdsJson) {
      playedIds = JSON.parse(playedIdsJson);
    }

    if (!playedIds.includes(notificationId)) {
      playedIds.push(notificationId);
      // Keep only last 100 IDs to prevent memory bloat
      if (playedIds.length > 100) {
        playedIds = playedIds.slice(-100);
      }
      sessionStorage.setItem(PLAYED_IDS_KEY, JSON.stringify(playedIds));
      console.log('[INVITE_SFX] Marked notification as played:', notificationId);
    }
  } catch (error) {
    console.error('[INVITE_SFX] Error marking notification as played:', error);
  }
}

export function isInviteSoundEnabled(): boolean {
  try {
    const soundEnabled = localStorage.getItem(SOUND_ENABLED_KEY);
    // Default to true if not set
    return soundEnabled !== 'false';
  } catch (error) {
    console.error('[INVITE_SFX] Error checking sound enabled:', error);
    return true;
  }
}

export function setInviteSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_ENABLED_KEY, enabled ? 'true' : 'false');
    console.log('[INVITE_SFX] Sound enabled set to:', enabled);
  } catch (error) {
    console.error('[INVITE_SFX] Error setting sound enabled:', error);
  }
}
