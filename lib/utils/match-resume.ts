/**
 * Utility for safely resuming matches
 * Prevents infinite redirect loops and validates match state before redirecting
 */

import { createClient } from '@/lib/supabase/client';
import { clearMatchStorage } from './match-storage';

const RESUME_ATTEMPTED_KEY = 'match_resume_attempted';

/**
 * Check if we've already attempted to resume a match in this session
 */
export function hasAttemptedResume(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(RESUME_ATTEMPTED_KEY) === 'true';
}

/**
 * Mark that we've attempted to resume a match
 */
export function markResumeAttempted(): void {
  if (typeof window === 'undefined') return;
  console.log('[MATCH_RESUME] Marking resume as attempted for this session');
  sessionStorage.setItem(RESUME_ATTEMPTED_KEY, 'true');
}

/**
 * Clear the resume attempt flag (call when user manually navigates away)
 */
export function clearResumeAttempt(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(RESUME_ATTEMPTED_KEY);
}

/**
 * Clear user presence activity
 */
async function clearPresence(): Promise<void> {
  const supabase = createClient();
  try {
    console.log('[MATCH_RESUME] Clearing user presence');
    await supabase.rpc('rpc_set_presence', {
      p_is_online: true,
      p_activity_type: null,
      p_activity_id: null,
      p_activity_label: null,
      p_score_snapshot: null,
    });
  } catch (err) {
    console.error('[MATCH_RESUME] Error clearing presence:', err);
  }
}

/**
 * Clear match state completely - storage and presence
 * Call this on match end, forfeit, or leave
 */
export async function clearMatchState(matchId?: string): Promise<void> {
  console.log('[MATCH_RESUME] Clearing match state', matchId ? `for match: ${matchId}` : '');
  clearMatchStorage(matchId);
  await clearPresence();
}

/**
 * Validate that a match room exists and is active for the given user
 */
export async function validateMatchRoom(
  roomId: string,
  userId: string
): Promise<{ valid: boolean; shouldRedirect: boolean; path?: string }> {
  const supabase = createClient();

  try {
    console.log('[MATCH_RESUME] Validating room:', roomId, 'for user:', userId);

    const { data: room, error } = await supabase
      .from('match_rooms')
      .select('id, status, player1_id, player2_id, match_type')
      .eq('id', roomId)
      .maybeSingle();

    if (error) {
      console.error('[MATCH_RESUME] Error fetching room:', error);
      clearMatchStorage(roomId);
      await clearPresence();
      return { valid: false, shouldRedirect: false };
    }

    if (!room) {
      console.log('[MATCH_RESUME] Room not found, clearing storage and presence');
      clearMatchStorage(roomId);
      await clearPresence();
      return { valid: false, shouldRedirect: false };
    }

    // Check if user is a player in this room
    const isPlayer = room.player1_id === userId || room.player2_id === userId;
    if (!isPlayer) {
      console.log('[MATCH_RESUME] User not a player in this room, clearing storage and presence');
      clearMatchStorage(roomId);
      await clearPresence();
      return { valid: false, shouldRedirect: false };
    }

    // Check if room is in a resumable state (active or open only)
    const resumableStatuses = ['active', 'open'];
    if (!resumableStatuses.includes(room.status)) {
      console.log('[MATCH_RESUME] Room status not resumable:', room.status, 'clearing storage and presence');
      clearMatchStorage(roomId);
      await clearPresence();
      return { valid: false, shouldRedirect: false };
    }

    // Determine the correct path based on match type
    let path = `/app/play/quick-match/match/${roomId}`;
    if (room.match_type === 'ranked') {
      path = `/app/ranked/match/${roomId}`;
    } else if (room.match_type === 'tournament') {
      path = `/app/match/online/${roomId}`;
    } else if (room.match_type === 'private') {
      path = `/app/play/quick-match/match/${roomId}`;
    }

    console.log('[MATCH_RESUME] Room is valid and resumable, path:', path);
    return { valid: true, shouldRedirect: true, path };
  } catch (err) {
    console.error('[MATCH_RESUME] Exception validating room:', err);
    clearMatchStorage(roomId);
    await clearPresence();
    return { valid: false, shouldRedirect: false };
  }
}

/**
 * Attempt to find and resume an active match for the user
 * Returns the path to redirect to, or null if no active match
 * Only attempts once per session to prevent infinite loops
 */
export async function attemptMatchResume(userId: string): Promise<string | null> {
  // Prevent multiple resume attempts in same session
  if (hasAttemptedResume()) {
    console.log('[MATCH_RESUME] Already attempted resume in this session, skipping');
    return null;
  }

  markResumeAttempted();

  const supabase = createClient();

  try {
    console.log('[MATCH_RESUME] Checking for active matches for user:', userId);

    // Find any active match rooms for this user
    const { data: rooms, error } = await supabase
      .from('match_rooms')
      .select('id, status, match_type, player1_id, player2_id, updated_at')
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .in('status', ['open', 'active'])
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('[MATCH_RESUME] Error finding active matches:', error);
      return null;
    }

    if (!rooms || rooms.length === 0) {
      console.log('[MATCH_RESUME] No active matches found');
      return null;
    }

    const room = rooms[0];
    console.log('[MATCH_RESUME] Found active room:', room.id, 'status:', room.status, 'type:', room.match_type);

    // Validate the room
    const validation = await validateMatchRoom(room.id, userId);
    if (validation.shouldRedirect && validation.path) {
      console.log('[MATCH_RESUME] Redirecting to:', validation.path);
      return validation.path;
    }

    return null;
  } catch (err) {
    console.error('[MATCH_RESUME] Exception in resume attempt:', err);
    return null;
  }
}
