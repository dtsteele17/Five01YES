/**
 * Centralized utility for managing persisted match state
 * Clears ALL match-related storage to prevent auto-resume trap
 */

export interface PersistedMatchState {
  matchId: string;
  matchType: 'quick' | 'ranked' | 'private' | 'tournament';
  lobbyId?: string;
  timestamp: number;
}

/**
 * Get the currently persisted match state
 */
export function getPersistedMatch(): PersistedMatchState | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem('persistedMatchState');
    if (stored) {
      return JSON.parse(stored) as PersistedMatchState;
    }
    return null;
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

    localStorage.setItem('persistedMatchState', JSON.stringify(state));
    console.log('[MATCH_STORAGE] Persisted match:', state);
  } catch (error) {
    console.error('[MATCH_STORAGE] Error persisting match:', error);
  }
}

/**
 * Clear all persisted match state
 * This is the ONLY way to clear storage - prevents auto-resume trap
 */
export function clearPersistedMatch(): void {
  if (typeof window === 'undefined') return;

  try {
    // Clear new unified storage
    localStorage.removeItem('persistedMatchState');

    // Clear all legacy keys
    localStorage.removeItem('activeMatchId');
    localStorage.removeItem('activeLobbyId');
    localStorage.removeItem('resumeMatchId');
    localStorage.removeItem('currentMatchId');
    localStorage.removeItem('activeRankedMatchId');
    localStorage.removeItem('rankedMatchRoomId');
    localStorage.removeItem('currentLobbyId');

    console.log('[MATCH_STORAGE] Cleared all persisted match state');
  } catch (error) {
    console.error('[MATCH_STORAGE] Error clearing persisted match:', error);
  }
}
