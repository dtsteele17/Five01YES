'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

type RematchStatus = 'none' | 'pending' | 'ready' | 'creating' | 'created';

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
  const processedRoomIdRef = useRef<string | null>(null);

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
          console.log('[REMATCH] Realtime update received:', payload);
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
    if (state.newRoomId && !isNavigatingRef.current && state.status === 'created') {
      if (processedRoomIdRef.current === state.newRoomId) {
        return; // Already processing this room
      }
      processedRoomIdRef.current = state.newRoomId;
      isNavigatingRef.current = true;
      
      console.log('[REMATCH] 🚀 NAVIGATING TO NEW ROOM:', state.newRoomId);
      
      // Small delay to ensure both players see "Starting..."
      setTimeout(() => {
        window.location.href = `/app/play/quick-match/match/${state.newRoomId}`;
      }, 500);
    }
  }, [state.newRoomId, state.status]);

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
            newRoomId: null,
          }));
        } else {
          // Map DB status to UI status
          let newStatus: RematchStatus = 'none';
          if (data.status === 'created') {
            newStatus = 'created';
          } else if (data.status === 'creating') {
            newStatus = 'creating';
          } else if (data.both_ready) {
            newStatus = 'ready';
          } else if (data.i_am_ready) {
            newStatus = 'pending';
          }
          
          setState(prev => ({
            ...prev,
            status: newStatus,
            player1Ready: data.player1_ready,
            player2Ready: data.player2_ready,
            bothReady: data.both_ready,
            requestId: data.request_id,
            newRoomId: data.new_room_id,
          }));

          // Auto-navigate if room already exists
          if (data.new_room_id && data.status === 'created' && !isNavigatingRef.current) {
            if (processedRoomIdRef.current !== data.new_room_id) {
              processedRoomIdRef.current = data.new_room_id;
              isNavigatingRef.current = true;
              console.log('[REMATCH] 🚀 Auto-navigating to existing room:', data.new_room_id);
              setTimeout(() => {
                window.location.href = `/app/play/quick-match/match/${data.new_room_id}`;
              }, 500);
            }
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

    // Map DB status to UI status
    let newStatus: RematchStatus = 'none';
    if (record.status === 'created') {
      newStatus = 'created';
    } else if (record.status === 'creating') {
      newStatus = 'creating';
    } else if (bothReady) {
      newStatus = 'ready';
    } else if (iAmReady) {
      newStatus = 'pending';
    }

    console.log('[REMATCH] State update:', {
      newStatus,
      player1Ready: record.player1_ready,
      player2Ready: record.player2_ready,
      bothReady,
      newRoomId: record.new_room_id,
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

    // Check if we should navigate
    if (record.new_room_id && record.status === 'created' && !isNavigatingRef.current) {
      if (processedRoomIdRef.current !== record.new_room_id) {
        processedRoomIdRef.current = record.new_room_id;
        isNavigatingRef.current = true;
        console.log('[REMATCH] 🚀 Navigating from realtime update:', record.new_room_id);
        setTimeout(() => {
          window.location.href = `/app/play/quick-match/match/${record.new_room_id}`;
        }, 500);
      }
    }
  };

  const requestRematch = useCallback(async () => {
    // Prevent duplicate requests
    if (state.isLoading) {
      console.log('[REMATCH] Already loading, ignoring click');
      return;
    }
    
    const iAmReady = isPlayer1 ? state.player1Ready : state.player2Ready;
    if (iAmReady) {
      console.log('[REMATCH] Already ready, ignoring click');
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      console.log('[REMATCH] Calling request_quick_match_rematch...');
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
        // Determine new status
        let newStatus: RematchStatus = 'none';
        if (data.both_ready) {
          newStatus = 'ready';
        } else {
          newStatus = 'pending';
        }
        
        setState(prev => ({
          ...prev,
          status: newStatus,
          player1Ready: data.player1_ready,
          player2Ready: data.player2_ready,
          bothReady: data.both_ready,
          requestId: data.request_id,
          newRoomId: data.new_room_id,
          isLoading: false,
        }));

        // If both ready and room created, navigate immediately
        if (data.both_ready && data.new_room_id && !isNavigatingRef.current) {
          if (processedRoomIdRef.current !== data.new_room_id) {
            processedRoomIdRef.current = data.new_room_id;
            isNavigatingRef.current = true;
            console.log('[REMATCH] 🚀 Both ready, navigating to:', data.new_room_id);
            setTimeout(() => {
              window.location.href = `/app/play/quick-match/match/${data.new_room_id}`;
            }, 800);
          }
        }
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
