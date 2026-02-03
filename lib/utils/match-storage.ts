/**
 * Utility for managing match-related storage keys
 * Helps prevent stale match data from causing infinite retry loops
 */

/**
 * Clear all match-related keys from localStorage and sessionStorage
 * Call this when a match room is not found or no longer available
 */
export function clearMatchStorage(matchId?: string): void {
  if (typeof window === 'undefined') return;

  console.log('[MATCH_STORAGE] Clearing all match-related storage', matchId ? `for match: ${matchId}` : '');

  // Keys to search for and remove
  const matchKeyPatterns = [
    'match',
    'room',
    'lobby',
    'activeMatch',
    'resumeMatch',
    'match_context',
    'lobby_id',
    'ranked_queue',
  ];

  // Clear from localStorage
  const localKeys = Object.keys(localStorage);
  for (const key of localKeys) {
    const shouldClear = matchKeyPatterns.some(pattern =>
      key.toLowerCase().includes(pattern.toLowerCase())
    );

    if (shouldClear) {
      console.log('[MATCH_STORAGE] Removing localStorage key:', key);
      localStorage.removeItem(key);
    }
  }

  // Clear from sessionStorage
  const sessionKeys = Object.keys(sessionStorage);
  for (const key of sessionKeys) {
    const shouldClear = matchKeyPatterns.some(pattern =>
      key.toLowerCase().includes(pattern.toLowerCase())
    );

    if (shouldClear) {
      console.log('[MATCH_STORAGE] Removing sessionStorage key:', key);
      sessionStorage.removeItem(key);
    }
  }

  // If specific matchId provided, also clear specific keys
  if (matchId) {
    localStorage.removeItem(`match-${matchId}`);
    localStorage.removeItem(`match-result-${matchId}`);
    sessionStorage.removeItem(`match_context_${matchId}`);
    sessionStorage.removeItem(`lobby_id_${matchId}`);
  }

  console.log('[MATCH_STORAGE] Storage cleanup complete');
}

/**
 * Clear only specific match-related storage for a given match ID
 */
export function clearMatchStorageById(matchId: string): void {
  if (typeof window === 'undefined') return;

  console.log('[MATCH_STORAGE] Clearing storage for match:', matchId);

  localStorage.removeItem(`match-${matchId}`);
  localStorage.removeItem(`match-result-${matchId}`);
  sessionStorage.removeItem(`match_context_${matchId}`);
  sessionStorage.removeItem(`lobby_id_${matchId}`);
}

/**
 * Check if we've already attempted to load this match in this session
 * Prevents infinite retry loops
 */
const attemptedMatches = new Set<string>();

export function hasAttemptedMatch(matchId: string): boolean {
  return attemptedMatches.has(matchId);
}

export function markMatchAttempted(matchId: string): void {
  console.log('[MATCH_STORAGE] Marking match as attempted:', matchId);
  attemptedMatches.add(matchId);
}

export function clearMatchAttempts(): void {
  attemptedMatches.clear();
}
