import { createClient } from '@/lib/supabase/client';

const STALE_KEYS = [
  'activeRoomId',
  'matchRoomId',
  'currentRoomId',
  'lastRoomId',
  'resumeRoomId',
  'pendingInviteRoomId',
  'inviteRoomId',
];

export async function clearStaleMatchState() {
  console.log('[STALE_STATE_CLEANUP] Clearing all stale match state...');

  try {
    const supabase = createClient();

    // Clear database activity
    const { error: activityError } = await supabase.rpc('rpc_clear_my_activity');

    if (activityError) {
      console.error('[STALE_STATE_CLEANUP] Failed to clear activity in database:', activityError);
    } else {
      console.log('[STALE_STATE_CLEANUP] Successfully cleared database activity');
    }

    // Clear user presence
    try {
      console.log('[STALE_STATE_CLEANUP] Clearing user presence');
      const { error: presenceError } = await supabase.rpc('rpc_set_presence', {
        p_is_online: true,
        p_activity_type: null,
        p_activity_id: null,
        p_activity_label: null,
        p_score_snapshot: null,
      });

      if (presenceError) {
        console.error('[STALE_STATE_CLEANUP] Failed to clear presence:', presenceError);
      } else {
        console.log('[STALE_STATE_CLEANUP] Successfully cleared user presence');
      }
    } catch (presenceErr) {
      console.error('[STALE_STATE_CLEANUP] Error clearing presence:', presenceErr);
    }
  } catch (err) {
    console.error('[STALE_STATE_CLEANUP] Error calling database RPCs:', err);
  }

  // Clear localStorage and sessionStorage
  STALE_KEYS.forEach((key) => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch (err) {
      console.warn(`[STALE_STATE_CLEANUP] Failed to remove ${key}:`, err);
    }
  });

  console.log('[STALE_STATE_CLEANUP] Removed all stale keys from storage');
}

export async function validateRoomBeforeNavigation(
  roomId: string,
  userId: string
): Promise<{ valid: boolean; reason?: string }> {
  console.log('[ROOM_VALIDATION] Validating room before navigation:', { roomId, userId });

  try {
    const supabase = createClient();

    const { data: room, error } = await supabase
      .from('match_rooms')
      .select('id, status, player1_id, player2_id')
      .eq('id', roomId)
      .maybeSingle();

    if (error) {
      console.error('[ROOM_VALIDATION] Error fetching room:', error);
      return { valid: false, reason: 'Failed to fetch room' };
    }

    if (!room) {
      console.warn('[ROOM_VALIDATION] Room does not exist:', roomId);
      return { valid: false, reason: 'Room does not exist' };
    }

    if (room.status !== 'open' && room.status !== 'active') {
      console.warn('[ROOM_VALIDATION] Room has invalid status:', room.status);
      return { valid: false, reason: `Room status is ${room.status}` };
    }

    const isParticipant = room.player1_id === userId || room.player2_id === userId;
    if (!isParticipant) {
      console.warn('[ROOM_VALIDATION] User is not a participant in this room');
      return { valid: false, reason: 'User is not a participant' };
    }

    console.log('[ROOM_VALIDATION] Room is valid for navigation');
    return { valid: true };
  } catch (err) {
    console.error('[ROOM_VALIDATION] Unexpected error during validation:', err);
    return { valid: false, reason: 'Unexpected error' };
  }
}

export function markInviteAsHandled(roomId: string) {
  try {
    sessionStorage.setItem(`handled_invite_room_${roomId}`, 'true');
    console.log('[INVITE_TRACKING] Marked invite as handled:', roomId);
  } catch (err) {
    console.warn('[INVITE_TRACKING] Failed to mark invite as handled:', err);
  }
}

export function isInviteAlreadyHandled(roomId: string): boolean {
  try {
    const handled = sessionStorage.getItem(`handled_invite_room_${roomId}`) === 'true';
    if (handled) {
      console.log('[INVITE_TRACKING] Invite already handled, skipping:', roomId);
    }
    return handled;
  } catch (err) {
    console.warn('[INVITE_TRACKING] Failed to check invite status:', err);
    return false;
  }
}
