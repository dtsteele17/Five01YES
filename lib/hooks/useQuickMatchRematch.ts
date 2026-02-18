'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

type RematchStatus = 'none' | 'pending' | 'ready' | 'created';

interface RematchState {
  status: RematchStatus;
  player1Ready: boolean;
  player2Ready: boolean;
  bothReady: boolean;
  requestId: string | null;
  newRoomId: string | null;
  isLoading: boolean;
  error: string | null;
}

interface UseQuickMatchRematchProps {
  roomId: string;
  currentUserId: string;
  isPlayer1: boolean;
  matchFinished: boolean;
}

export function useQuickMatchRematch({
  roomId,
  currentUserId,
  isPlayer1,
  matchFinished,
}: UseQuickMatchRematchProps) {
  const supabase = createClient();
  
  const [state, setState] = useState<RematchState>({
    status: 'none',
    player1Ready: false,
    player2Ready: false,
    bothReady: false,
    requestId: null,
    newRoomId: null,
    isLoading: false,
    error: null,
  });

  const isNavigatingRef = useRef(false);
  const hasRequestedRef = useRef(false);

  // Subscribe to rematch request changes
  useEffect(() => {
    if (!roomId || !matchFinished || !currentUserId) return;

    console.log('[REMATCH] Setting up subscription for room:', roomId);

    // Initial fetch
    fetchRematchStatus();

    // Subscribe to changes
    const channel = supabase
      .channel(`rematch-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'quick_match_rematch_requests',
          filter: `original_room_id=eq.${roomId}`,
        },
        (payload) => {
          console.log('[REMATCH] Realtime update:', payload);
          const record = payload.new as any;
          if (record) {
            updateStateFromRecord(record);
          }
        }
      )
      .subscribe((status) => {
        console.log('[REMATCH] Subscription status:', status);
      });

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, matchFinished, currentUserId]);

  // Navigate when new room is created
  useEffect(() => {
    if (state.newRoomId && !isNavigatingRef.current) {
      isNavigatingRef.current = true;
      console.log('[REMATCH] Navigating to new room:', state.newRoomId);
      window.location.href = `/app/play/quick-match/match/${state.newRoomId}`;
    }
  }, [state.newRoomId]);

  const fetchRematchStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('get_rematch_status', {
        p_original_room_id: roomId,
      });

      if (error) {
        console.error('[REMATCH] Error fetching status:', error);
        return;
      }

      console.log('[REMATCH] Status fetched:', data);

      if (data?.success) {
        if (!data.has_request) {
          setState(prev => ({
            ...prev,
            status: 'none',
            player1Ready: false,
            player2Ready: false,
            bothReady: false,
            requestId: null,
          }));
        } else {
          const newStatus: RematchStatus = data.status === 'created' ? 'created' : 
                                          data.both_ready ? 'ready' : 
                                          data.i_am_ready ? 'pending' : 'none';
          
          setState(prev => ({
            ...prev,
            status: newStatus,
            player1Ready: data.player1_ready,
            player2Ready: data.player2_ready,
            bothReady: data.both_ready,
            requestId: data.request_id,
            newRoomId: data.new_room_id || prev.newRoomId,
          }));

          if (data.new_room_id && !isNavigatingRef.current) {
            isNavigatingRef.current = true;
            setState(prev => ({ ...prev, newRoomId: data.new_room_id }));
          }
        }
      }
    } catch (err) {
      console.error('[REMATCH] Error:', err);
    }
  };

  const updateStateFromRecord = (record: any) => {
    const iAmReady = isPlayer1 ? record.player1_ready : record.player2_ready;
    const opponentReady = isPlayer1 ? record.player2_ready : record.player1_ready;
    const bothReady = record.player1_ready && record.player2_ready;

    let newStatus: RematchStatus = 'none';
    if (record.status === 'created' || record.new_room_id) {
      newStatus = 'created';
    } else if (bothReady) {
      newStatus = 'ready';
    } else if (iAmReady) {
      newStatus = 'pending';
    }

    console.log('[REMATCH] Updating state:', {
      newStatus,
      player1Ready: record.player1_ready,
      player2Ready: record.player2_ready,
      iAmReady,
      opponentReady,
      bothReady,
    });

    setState(prev => ({
      ...prev,
      status: newStatus,
      player1Ready: record.player1_ready,
      player2Ready: record.player2_ready,
      bothReady,
      requestId: record.id,
      newRoomId: record.new_room_id || prev.newRoomId,
    }));

    if (record.new_room_id && !isNavigatingRef.current) {
      isNavigatingRef.current = true;
      setState(prev => ({ ...prev, newRoomId: record.new_room_id }));
    }
  };

  const requestRematch = useCallback(async () => {
    // Prevent duplicate requests
    if (state.isLoading) {
      console.log('[REMATCH] Already loading, ignoring');
      return;
    }
    
    const iAmReady = isPlayer1 ? state.player1Ready : state.player2Ready;
    if (iAmReady) {
      console.log('[REMATCH] Already ready, ignoring');
      return;
    }

    hasRequestedRef.current = true;
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      console.log('[REMATCH] Calling RPC request_quick_match_rematch');
      const { data, error } = await supabase.rpc('request_quick_match_rematch', {
        p_original_room_id: roomId,
      });

      if (error) {
        console.error('[REMATCH] RPC error:', error);
        setState(prev => ({ ...prev, isLoading: false, error: error.message }));
        return;
      }

      console.log('[REMATCH] RPC response:', data);

      if (data?.success) {
        const newStatus: RematchStatus = data.both_ready ? 'ready' : 'pending';
        
        setState(prev => ({
          ...prev,
          status: newStatus,
          player1Ready: data.player1_ready,
          player2Ready: data.player2_ready,
          bothReady: data.both_ready,
          requestId: data.request_id,
          isLoading: false,
        }));
      } else {
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: data?.error || 'Unknown error' 
        }));
      }
    } catch (err: any) {
      console.error('[REMATCH] Exception:', err);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: err.message 
      }));
    }
  }, [roomId, state.isLoading, state.player1Ready, state.player2Ready, isPlayer1]);

  const cancelRematch = useCallback(async () => {
    if (!state.requestId) return;

    try {
      await supabase.rpc('cancel_rematch_request', {
        p_request_id: state.requestId,
      });

      hasRequestedRef.current = false;
      setState({
        status: 'none',
        player1Ready: false,
        player2Ready: false,
        bothReady: false,
        requestId: null,
        newRoomId: null,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      console.error('[REMATCH] Error cancelling:', err);
    }
  }, [state.requestId]);

  // Derived values
  const iAmReady = isPlayer1 ? state.player1Ready : state.player2Ready;
  const opponentReady = isPlayer1 ? state.player2Ready : state.player1Ready;
  const readyCount = (state.player1Ready ? 1 : 0) + (state.player2Ready ? 1 : 0);

  return {
    status: state.status,
    requestId: state.requestId,
    newRoomId: state.newRoomId,
    isLoading: state.isLoading,
    error: state.error,
    iAmReady,
    opponentReady,
    bothReady: state.bothReady,
    readyCount,
    requestRematch,
    cancelRematch,
    refreshStatus: fetchRematchStatus,
  };
}
