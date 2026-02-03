/**
 * Centralized utility for managing persisted match state
 *
 * This prevents users from getting stuck in old/ended matches by:
 * 1. Providing a single source of truth for match storage
 * 2. Tracking ended matches to prevent reopening them
 * 3. Clearing all related storage atomically
 */

export interface PersistedMatchState {
  matchId: string;
  matchType: 'quick' | 'ranked' | 'private' | 'tournament';
  lobbyId?: string;
  timestamp: number;
}

const STORAGE_KEYS = {
  // Legacy keys (for backwards compatibility)
  ACTIVE_MATCH: 'activeMatchId',
  ACTIVE_LOBBY: 'activeLobbyId',
  RESUME_MATCH: 'resumeMatchId',
  RANKED_MATCH: 'activeRankedMatchId',
  RANKED_ROOM: 'rankedMatchRoomId',

  // New unified key
  PERSISTED_MATCH: 'persistedMatchState',
} as const;

/**
 * Get the currently persisted match state
 */
export function getPersistedMatch(): PersistedMatchState | null {
  if (typeof window === 'undefined') return null;

  try {
    // Try new unified format first
    const stored = localStorage.getItem(STORAGE_KEYS.PERSISTED_MATCH);
    if (stored) {
      const parsed = JSON.parse(stored) as PersistedMatchState;

      // Check if match was marked as ended
      if (isMatchMarkedAsEnded(parsed.matchId)) {
        console.log('[MATCH_STORAGE] Match was ended, clearing storage:', parsed.matchId);
        clearPersistedMatch();
        return null;
      }

      return parsed;
    }

    // Fall back to legacy storage for backwards compatibility
    const activeMatch = localStorage.getItem(STORAGE_KEYS.ACTIVE_MATCH);
    const resumeMatch = localStorage.getItem(STORAGE_KEYS.RESUME_MATCH);
    const rankedMatch = localStorage.getItem(STORAGE_KEYS.RANKED_MATCH);

    const matchId = activeMatch || resumeMatch || rankedMatch;
    if (!matchId) return null;

    // Check if match was marked as ended
    if (isMatchMarkedAsEnded(matchId)) {
      console.log('[MATCH_STORAGE] Legacy match was ended, clearing storage:', matchId);
      clearPersistedMatch();
      return null;
    }

    // Migrate to new format
    const matchType = rankedMatch ? 'ranked' : 'quick';
    const lobbyId = localStorage.getItem(STORAGE_KEYS.ACTIVE_LOBBY) || undefined;

    const state: PersistedMatchState = {
      matchId,
      matchType,
      lobbyId,
      timestamp: Date.now(),
    };

    // Save in new format
    localStorage.setItem(STORAGE_KEYS.PERSISTED_MATCH, JSON.stringify(state));

    return state;
  } catch (error) {
    console.error('[MATCH_STORAGE] Error reading persisted match:', error);
    return null;
  }
}

/**
 * Persist a match state
 * Only call this AFTER confirming the match exists and is in_progress
 */
export function setPersistedMatch(
  matchId: string,
  matchType: 'quick' | 'ranked' | 'private' | 'tournament',
  lobbyId?: string
): void {
  if (typeof window === 'undefined') return;

  try {
    const state: PersistedMatchState = {
      matchId,
      matchType,
      lobbyId,
      timestamp: Date.now(),
    };

    localStorage.setItem(STORAGE_KEYS.PERSISTED_MATCH, JSON.stringify(state));
    console.log('[MATCH_STORAGE] Persisted match:', state);
  } catch (error) {
    console.error('[MATCH_STORAGE] Error persisting match:', error);
  }
}

/**
 * Clear all persisted match state
 */
export function clearPersistedMatch(): void {
  if (typeof window === 'undefined') return;

  try {
    // Clear new unified storage
    localStorage.removeItem(STORAGE_KEYS.PERSISTED_MATCH);

    // Clear all legacy keys
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_MATCH);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_LOBBY);
    localStorage.removeItem(STORAGE_KEYS.RESUME_MATCH);
    localStorage.removeItem(STORAGE_KEYS.RANKED_MATCH);
    localStorage.removeItem(STORAGE_KEYS.RANKED_ROOM);

    console.log('[MATCH_STORAGE] Cleared all persisted match state');
  } catch (error) {
    console.error('[MATCH_STORAGE] Error clearing persisted match:', error);
  }
}

/**
 * Clear all session storage for a specific match
 */
export function clearMatchSessionStorage(matchId: string): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.removeItem(`match_context_${matchId}`);
    sessionStorage.removeItem(`lobby_id_${matchId}`);
    sessionStorage.removeItem(`ranked_match_${matchId}`);
    sessionStorage.removeItem(`trust_prompted_${matchId}`);

    console.log('[MATCH_STORAGE] Cleared session storage for match:', matchId);
  } catch (error) {
    console.error('[MATCH_STORAGE] Error clearing match session storage:', error);
  }
}

/**
 * Mark a match as ended to prevent reopening it
 */
export function markMatchAsEnded(matchId: string): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.setItem(`ended_match_${matchId}`, 'true');
    console.log('[MATCH_STORAGE] Marked match as ended:', matchId);
  } catch (error) {
    console.error('[MATCH_STORAGE] Error marking match as ended:', error);
  }
}

/**
 * Check if a match was marked as ended
 */
export function isMatchMarkedAsEnded(matchId: string): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return sessionStorage.getItem(`ended_match_${matchId}`) === 'true';
  } catch (error) {
    return false;
  }
}

/**
 * Complete cleanup when a match ends
 */
export function cleanupEndedMatch(matchId: string): void {
  markMatchAsEnded(matchId);
  clearMatchSessionStorage(matchId);
  clearPersistedMatch();
  console.log('[MATCH_STORAGE] Complete cleanup for ended match:', matchId);
}
