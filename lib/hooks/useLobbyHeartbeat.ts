import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface UseLobbyHeartbeatOptions {
  lobbyId: string | null;
  enabled: boolean;
  intervalMs?: number;
}

/**
 * Hook to maintain lobby heartbeat
 * Sends periodic heartbeats to prevent zombie lobbies/matches
 */
export function useLobbyHeartbeat({
  lobbyId,
  enabled,
  intervalMs = 10000, // 10 seconds
}: UseLobbyHeartbeatOptions) {
  const supabase = createClient();
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isCleanedUpRef = useRef(false);

  // Send heartbeat function
  const sendHeartbeat = async () => {
    if (!lobbyId || !enabled) return;

    try {
      const { data, error } = await supabase.rpc('rpc_lobby_heartbeat', {
        p_lobby_id: lobbyId,
      });

      if (error) {
        console.error('[HEARTBEAT] Error sending heartbeat:', error);
        return;
      }

      console.log('[HEARTBEAT] Heartbeat sent:', data);
    } catch (error) {
      console.error('[HEARTBEAT] Exception sending heartbeat:', error);
    }
  };

  // Start heartbeat timer
  useEffect(() => {
    if (!lobbyId || !enabled) {
      // Clear timer if disabled
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      return;
    }

    console.log('[HEARTBEAT] Starting heartbeat for lobby:', lobbyId);

    // Send initial heartbeat immediately
    sendHeartbeat();

    // Start interval
    heartbeatTimerRef.current = setInterval(() => {
      sendHeartbeat();
    }, intervalMs);

    return () => {
      if (heartbeatTimerRef.current) {
        console.log('[HEARTBEAT] Stopping heartbeat for lobby:', lobbyId);
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };
  }, [lobbyId, enabled, intervalMs]);

  // Handle visibility change (tab hidden/shown)
  useEffect(() => {
    if (!lobbyId || !enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('[HEARTBEAT] Tab hidden, sending final heartbeat');
        sendHeartbeat();
      } else {
        console.log('[HEARTBEAT] Tab visible again');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [lobbyId, enabled]);

  // Handle beforeunload (tab/window closing)
  useEffect(() => {
    if (!lobbyId || !enabled) return;

    const handleBeforeUnload = () => {
      if (isCleanedUpRef.current) return;

      console.log('[HEARTBEAT] Page unloading, sending final heartbeat');
      isCleanedUpRef.current = true;

      // Use sendBeacon for reliable delivery during page unload
      // Note: This requires converting RPC to a POST endpoint, or we accept it might not reach
      // For now, we'll try a synchronous call (may not complete)
      sendHeartbeat();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [lobbyId, enabled]);

  return {
    sendHeartbeat,
  };
}
