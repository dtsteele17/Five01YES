import { createClient } from '@/lib/supabase/client';
import { clearMatchStorage } from './match-storage';

export interface CleanupCallbacks {
  stopCamera?: () => void;
  unsubscribeChannels?: () => void;
}

export async function cleanupMatchState(
  matchId?: string,
  callbacks?: CleanupCallbacks
): Promise<void> {
  console.log('[CLEANUP_MATCH_STATE] Starting comprehensive match cleanup', matchId ? `for match: ${matchId}` : '');

  const supabase = createClient();

  try {
    if (callbacks?.stopCamera) {
      console.log('[CLEANUP_MATCH_STATE] Stopping camera');
      callbacks.stopCamera();
    }

    if (callbacks?.unsubscribeChannels) {
      console.log('[CLEANUP_MATCH_STATE] Unsubscribing from channels');
      callbacks.unsubscribeChannels();
    }

    console.log('[CLEANUP_MATCH_STATE] Clearing storage');
    clearMatchStorage(matchId);

    if (matchId) {
      sessionStorage.removeItem(`match_context_${matchId}`);
      sessionStorage.removeItem(`lobby_id_${matchId}`);
    }

    console.log('[CLEANUP_MATCH_STATE] Clearing user presence/activity');
    try {
      const { error: presenceError } = await supabase.rpc('rpc_set_presence', {
        p_is_online: true,
        p_activity_type: null,
        p_activity_id: null,
        p_activity_label: null,
        p_score_snapshot: null,
      });

      if (presenceError) {
        console.error('[CLEANUP_MATCH_STATE] Failed to clear presence:', presenceError);
      } else {
        console.log('[CLEANUP_MATCH_STATE] User presence cleared successfully');
      }
    } catch (presenceErr) {
      console.error('[CLEANUP_MATCH_STATE] Error clearing presence:', presenceErr);
    }

    try {
      console.log('[CLEANUP_MATCH_STATE] Clearing activity');
      const { error: activityError } = await supabase.rpc('rpc_clear_my_activity');

      if (activityError) {
        console.error('[CLEANUP_MATCH_STATE] Failed to clear activity:', activityError);
      } else {
        console.log('[CLEANUP_MATCH_STATE] Activity cleared successfully');
      }
    } catch (activityErr) {
      console.error('[CLEANUP_MATCH_STATE] Error clearing activity:', activityErr);
    }

    console.log('[CLEANUP_MATCH_STATE] Match cleanup complete');
  } catch (error) {
    console.error('[CLEANUP_MATCH_STATE] Error during cleanup:', error);
  }
}
