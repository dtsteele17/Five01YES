'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface RematchState {
  status: 'none' | 'pending' | 'ready' | 'creating' | 'created';
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

  const subscriptionRef = useRef<any>(null);
  const isNavigatingRef = useRef(false);

  // Subscribe to rematch request changes
  useEffect(() => {
    if (!roomId || !matchFinished) return;

    // Initial fetch
    fetchRematchStatus();

    // Subscribe to changes on quick_match_rematch_requests
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
          handleRematchUpdate(payload.new);
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, matchFinished]);

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

      if (data?.success) {
        updateStateFromStatus(data);
      }
    } catch (err) {
      console.error('[REMATCH] Error:', err);
    }
  };

  const updateStateFromStatus = (data: any) => {
    if (!data.has_request) {
      setState(prev => ({
        ...prev,
        status: 'none',
        player1Ready: false,
        player2Ready: false,
        bothReady: false,
        requestId: null,
      }));
      return;
    }

    const status = data.status === 'created' ? 'created' : 
                   data.both_ready ? 'ready' : 
                   data.i_am_ready ? 'pending' : 'none';

    setState(prev => ({
      ...prev,
      status,
      player1Ready: data.player1_ready,
      player2Ready: data.player2_ready,
      bothReady: data.both_ready,
      requestId: data.request_id,
      newRoomId: data.new_room_id || prev.newRoomId,
    }));

    // Auto-navigate if room already exists
    if (data.new_room_id && !isNavigatingRef.current) {
      isNavigatingRef.current = true;
      setState(prev => ({ ...prev, newRoomId: data.new_room_id }));
    }
  };

  const handleRematchUpdate = (record: any) => {
    if (!record) return;

    const iAmReady = isPlayer1 ? record.player1_ready : record.player2_ready;
    const opponentReady = isPlayer1 ? record.player2_ready : record.player1_ready;
    const bothReady = record.player1_ready && record.player2_ready;

    let newStatus: RematchState['status'] = 'none';
    if (record.status === 'created' || record.new_room_id) {
      newStatus = 'created';
    } else if (bothReady) {
      newStatus = 'ready';
    } else if (iAmReady) {
      newStatus = 'pending';
    }

    setState(prev => ({
      ...prev,
      status: newStatus,
      player1Ready: record.player1_ready,
      player2Ready: record.player2_ready,
      bothReady,
      requestId: record.id,
      newRoomId: record.new_room_id || prev.newRoomId,
    }));

    // Auto-create room if both ready and not created yet
    if (bothReady && record.status === 'ready' && !record.new_room_id) {
      createRematchRoom(record.id);
    }

    // Navigate if room created
    if (record.new_room_id && !isNavigatingRef.current) {
      isNavigatingRef.current = true;
      setState(prev => ({ ...prev, newRoomId: record.new_room_id }));
    }
  };

  const requestRematch = useCallback(async () => {
    if (state.isLoading || state.status === 'created') return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const { data, error } = await supabase.rpc('request_quick_match_rematch', {
        p_original_room_id: roomId,
      });

      if (error) {
        console.error('[REMATCH] Error requesting:', error);
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: error.message 
        }));
        return;
      }

      console.log('[REMATCH] Request response:', data);

      if (data?.success) {
        const newStatus = data.both_ready ? 'ready' : 'pending';
        
        setState(prev => ({
          ...prev,
          status: newStatus,
          player1Ready: data.player1_ready,
          player2Ready: data.player2_ready,
          bothReady: data.both_ready,
          requestId: data.request_id,
          isLoading: false,
        }));

        // If both ready, create the room
        if (data.both_ready) {
          await createRematchRoom(data.request_id);
        }
      } else {
        setState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: data?.error || 'Unknown error' 
        }));
      }
    } catch (err: any) {
      console.error('[REMATCH] Error:', err);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: err.message 
      }));
    }
  }, [roomId, state.isLoading, state.status]);

  const createRematchRoom = async (requestId: string) => {
    if (state.status === 'creating' || state.status === 'created') return;

    setState(prev => ({ ...prev, status: 'creating' }));

    try {
      const { data, error } = await supabase.rpc('create_quick_match_rematch_room', {
        p_request_id: requestId,
      });

      if (error) {
        console.error('[REMATCH] Error creating room:', error);
        setState(prev => ({ ...prev, status: 'ready', error: error.message }));
        return;
      }

      console.log('[REMATCH] Create room response:', data);

      if (data?.success && data.room_id) {
        setState(prev => ({
          ...prev,
          status: 'created',
          newRoomId: data.room_id,
        }));
      }
    } catch (err: any) {
      console.error('[REMATCH] Error creating room:', err);
      setState(prev => ({ ...prev, status: 'ready', error: err.message }));
    }
  };

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

  const iAmReady = isPlayer1 ? state.player1Ready : state.player2Ready;
  const opponentReady = isPlayer1 ? state.player2Ready : state.player1Ready;
  const readyCount = (state.player1Ready ? 1 : 0) + (state.player2Ready ? 1 : 0);

  return {
    // State
    status: state.status,
    requestId: state.requestId,
    newRoomId: state.newRoomId,
    isLoading: state.isLoading,
    error: state.error,
    
    // Derived values
    iAmReady,
    opponentReady,
    bothReady: state.bothReady,
    readyCount,
    
    // Actions
    requestRematch,
    cancelRematch,
    refreshStatus: fetchRematchStatus,
  };
}
