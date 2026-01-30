'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface TournamentReadyMatch {
  match_id: string;
  tournament_id: string;
  round: number;
  match_index: number;
  player1_id: string;
  player2_id: string;
  status: string;
  match_room_id: string | null;
  ready_open_at: string | null;
  ready_deadline: string | null;
  ready_count: number;
  my_ready: boolean;
  tournament_name: string;
  opponent_id: string;
  opponent_username: string;
  opponent_avatar_url: string | null;
}

const DISMISSED_MATCHES_KEY = 'tournament_dismissed_matches';

export function useTournamentReadyUp() {
  const supabase = createClient();
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeMatch, setActiveMatch] = useState<TournamentReadyMatch | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isReadyingUp, setIsReadyingUp] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasSubscribedRef = useRef(false);
  const readyChannelRef = useRef<any>(null);

  const getDismissedMatches = (): Set<string> => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(DISMISSED_MATCHES_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  };

  const dismissMatch = useCallback((matchId: string) => {
    if (typeof window === 'undefined') return;
    try {
      const dismissed = getDismissedMatches();
      dismissed.add(matchId);
      localStorage.setItem(DISMISSED_MATCHES_KEY, JSON.stringify(Array.from(dismissed)));
    } catch (error) {
      console.error('Error saving dismissed match:', error);
    }
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setActiveMatch((prev) => {
      if (prev) {
        dismissMatch(prev.match_id);
      }
      return null;
    });
  }, [dismissMatch]);

  const checkForReadyMatch = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const now = new Date();

      const { data: matches, error } = await supabase
        .from('v_tournament_match_ready_status')
        .select('*')
        .eq('status', 'ready')
        .not('ready_open_at', 'is', null)
        .not('ready_deadline', 'is', null)
        .or(`player1_id.eq.${currentUserId},player2_id.eq.${currentUserId}`)
        .order('ready_deadline', { ascending: true });

      if (error) throw error;

      if (!matches || matches.length === 0) {
        if (activeMatch) {
          setShowModal(false);
          setActiveMatch(null);
        }
        return;
      }

      const dismissed = getDismissedMatches();

      for (const match of matches) {
        const readyOpenAt = match.ready_open_at ? new Date(match.ready_open_at) : null;
        const readyDeadline = match.ready_deadline ? new Date(match.ready_deadline) : null;

        if (!readyOpenAt || !readyDeadline) continue;

        if (now < readyOpenAt || now > readyDeadline) {
          continue;
        }

        if (dismissed.has(match.match_id)) {
          continue;
        }

        if (match.match_room_id !== null) {
          continue;
        }

        const secondsRemaining = Math.max(0, Math.floor((readyDeadline.getTime() - now.getTime()) / 1000));

        setActiveMatch(match);
        setTimeRemaining(secondsRemaining);
        setShowModal(true);
        return;
      }

      if (activeMatch) {
        setShowModal(false);
        setActiveMatch(null);
      }
    } catch (error) {
      console.error('Error checking for ready match:', error);
    }
  }, [currentUserId, activeMatch, supabase, router, closeModal]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        setCurrentUserId(user.id);
      } catch (error) {
        console.error('Error initializing tournament ready:', error);
      }
    };

    initialize();
  }, [supabase]);

  useEffect(() => {
    if (currentUserId) {
      checkForReadyMatch();

      checkIntervalRef.current = setInterval(checkForReadyMatch, 5000);
    }

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [currentUserId, checkForReadyMatch]);

  useEffect(() => {
    if (!currentUserId || hasSubscribedRef.current) return;

    console.log('[TOURNAMENT READY] Setting up realtime subscriptions once for user:', currentUserId);
    hasSubscribedRef.current = true;

    const matchesChannel = supabase
      .channel('tournament-ready-matches')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tournament_matches',
          filter: `player1_id=eq.${currentUserId}`,
        },
        async (payload) => {
          if (payload.new) {
            const match = payload.new as any;
            if (match.status === 'in_game' && match.match_room_id) {
              console.log('[TOURNAMENT READY] Realtime: Match in_game, navigating to room:', match.match_room_id);
              const delay = 300 + Math.random() * 200;
              await new Promise(resolve => setTimeout(resolve, delay));
              router.push(`/app/match/online/${match.match_room_id}`);
              setShowModal(false);
              setActiveMatch(null);
              return;
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tournament_matches',
          filter: `player2_id=eq.${currentUserId}`,
        },
        async (payload) => {
          if (payload.new) {
            const match = payload.new as any;
            if (match.status === 'in_game' && match.match_room_id) {
              console.log('[TOURNAMENT READY] Realtime: Match in_game, navigating to room:', match.match_room_id);
              const delay = 300 + Math.random() * 200;
              await new Promise(resolve => setTimeout(resolve, delay));
              router.push(`/app/match/online/${match.match_room_id}`);
              setShowModal(false);
              setActiveMatch(null);
              return;
            }
          }
        }
      )
      .subscribe();

    const readyChannel = supabase
      .channel('tournament-ready-inserts')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'tournament_match_ready',
        },
        () => {
          console.log('[TOURNAMENT READY] Realtime: Ready status updated');
        }
      )
      .subscribe();

    return () => {
      console.log('[TOURNAMENT READY] Cleaning up realtime subscriptions');
      supabase.removeChannel(matchesChannel);
      supabase.removeChannel(readyChannel);
      hasSubscribedRef.current = false;
    };
  }, [currentUserId, supabase, router]);

  const refetchActiveMatch = useCallback(async () => {
    if (!activeMatch || !currentUserId) return;

    try {
      const { data, error } = await supabase
        .from('v_tournament_match_ready_status')
        .select('*')
        .eq('match_id', activeMatch.match_id)
        .single();

      if (error) {
        console.error('[TOURNAMENT READY] Error refetching match:', error);
        return;
      }

      if (!data) {
        console.log('[TOURNAMENT READY] No data returned from refetch');
        return;
      }

      console.log('[TOURNAMENT READY] Refetched match data:', {
        match_id: data.match_id,
        ready_count: data.ready_count,
        my_ready: data.my_ready,
        status: data.status,
        match_room_id: data.match_room_id
      });

      if (data.status === 'in_game' && data.match_room_id) {
        console.log('[TOURNAMENT READY] Match in_game with room_id, navigating to:', data.match_room_id);
        const delay = 300 + Math.random() * 200;
        await new Promise(resolve => setTimeout(resolve, delay));

        setShowModal(false);
        setActiveMatch(null);
        router.push(`/app/match/online/${data.match_room_id}`);
        return;
      }

      // When both players are ready but match isn't in_game yet, call RPC to get room_id
      if (data.ready_count === 2 && data.my_ready && !data.match_room_id) {
        console.log('[TOURNAMENT READY] Both players ready, calling RPC to get room_id...');
        try {
          const { data: roomId, error: rpcError } = await supabase.rpc('rpc_tourn_ready', {
            p_match_id: data.match_id,
          });

          if (rpcError) {
            console.error('[TOURNAMENT READY] RPC Error in refetch:', {
              message: rpcError.message,
              details: rpcError.details,
              hint: rpcError.hint,
              code: rpcError.code,
            });
          } else if (roomId) {
            console.log('[TOURNAMENT READY] Got room_id from RPC, navigating to:', roomId);
            const delay = 300 + Math.random() * 200;
            await new Promise(resolve => setTimeout(resolve, delay));

            setShowModal(false);
            setActiveMatch(null);
            router.push(`/app/match/online/${roomId}`);
            return;
          } else {
            console.log('[TOURNAMENT READY] RPC returned null room_id in refetch');
          }
        } catch (rpcError) {
          console.error('[TOURNAMENT READY] Exception calling RPC:', rpcError);
        }
      }

      console.log('[TOURNAMENT READY] Updating activeMatch state with ready_count:', data.ready_count);
      setActiveMatch(prev => {
        if (!prev) return data;
        return { ...data };
      });
    } catch (error) {
      console.error('[TOURNAMENT READY] Error refetching active match:', error);
    }
  }, [activeMatch, currentUserId, supabase, router]);

  // Realtime subscription for tournament_match_ready updates (per modal open)
  useEffect(() => {
    if (!showModal || !activeMatch || !currentUserId) {
      // Clean up subscription when modal closes
      if (readyChannelRef.current) {
        console.log('[TOURNAMENT READY] Cleaning up match-specific realtime subscription');
        supabase.removeChannel(readyChannelRef.current);
        readyChannelRef.current = null;
      }
      return;
    }

    // Create subscription once per modal open
    if (readyChannelRef.current) return;

    console.log('[TOURNAMENT READY] Creating realtime subscription for match:', activeMatch.match_id);

    const channel = supabase
      .channel(`tournament-ready-${activeMatch.match_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_match_ready',
          filter: `match_id=eq.${activeMatch.match_id}`,
        },
        async (payload) => {
          console.log('[TOURNAMENT READY] Realtime update on tournament_match_ready:', payload);

          // Refetch the full match data to get updated ready_count and my_ready status
          try {
            const { data, error } = await supabase
              .from('v_tournament_match_ready_status')
              .select('*')
              .eq('match_id', activeMatch.match_id)
              .single();

            if (error) {
              console.error('[TOURNAMENT READY] Error fetching updated match:', error);
              return;
            }

            if (!data) return;

            console.log('[TOURNAMENT READY] Updated match data:', {
              ready_count: data.ready_count,
              my_ready: data.my_ready,
              status: data.status,
              match_room_id: data.match_room_id,
            });

            // Update active match state
            setActiveMatch(data);

            // If match is in_game with room_id, navigate
            if (data.status === 'in_game' && data.match_room_id) {
              console.log('[TOURNAMENT READY] Match started, navigating to room:', data.match_room_id);
              const delay = 300 + Math.random() * 200;
              await new Promise(resolve => setTimeout(resolve, delay));
              setShowModal(false);
              setActiveMatch(null);
              router.push(`/app/match/online/${data.match_room_id}`);
            }
          } catch (err) {
            console.error('[TOURNAMENT READY] Error handling realtime update:', err);
          }
        }
      )
      .subscribe((status) => {
        console.log('[TOURNAMENT READY] Subscription status:', status);
      });

    readyChannelRef.current = channel;

    return () => {
      console.log('[TOURNAMENT READY] Cleaning up match-specific realtime subscription on unmount');
      if (readyChannelRef.current) {
        supabase.removeChannel(readyChannelRef.current);
        readyChannelRef.current = null;
      }
    };
  }, [showModal, activeMatch, currentUserId, supabase, router]);

  useEffect(() => {
    if (!showModal || !activeMatch) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          return 0;
        }
        return newTime;
      });
    }, 1000);

    // Keep a lighter polling for backup (every 5 seconds instead of 2)
    pollIntervalRef.current = setInterval(() => {
      refetchActiveMatch();
    }, 5000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [showModal, activeMatch, refetchActiveMatch]);

  const readyUp = useCallback(async (retryCount = 0) => {
    if (!activeMatch || activeMatch.my_ready || isReadyingUp) return;

    setIsReadyingUp(true);

    try {
      // Get current user and session info
      const { data: { session } } = await supabase.auth.getSession();

      console.log('[TOURNAMENT READY] === Ready Up Request ===');
      console.log('[TOURNAMENT READY] Current User ID:', session?.user?.id);
      console.log('[TOURNAMENT READY] Match ID:', activeMatch.match_id);
      console.log('[TOURNAMENT READY] Session exists:', !!session);
      console.log('[TOURNAMENT READY] Retry count:', retryCount);

      if (!session?.user) {
        console.error('[TOURNAMENT READY] No authenticated user found');
        toast.error('You must be logged in to ready up');
        setIsReadyingUp(false);
        return;
      }

      // Call RPC with authenticated session
      const { data: roomId, error } = await supabase.rpc('rpc_tourn_ready', {
        p_match_id: activeMatch.match_id,
      });

      if (error) {
        console.error('[TOURNAMENT READY] RPC Error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });

        // Handle "Not authenticated" error with session refresh retry
        if (error.message?.toLowerCase().includes('not authenticated') && retryCount === 0) {
          console.log('[TOURNAMENT READY] Authentication error detected, refreshing session and retrying...');
          toast.info('Refreshing session...');

          const { error: refreshError } = await supabase.auth.refreshSession();

          if (refreshError) {
            console.error('[TOURNAMENT READY] Session refresh failed:', refreshError);
            toast.error('Session refresh failed. Please log in again.');
            setIsReadyingUp(false);
            return;
          }

          // Retry once after session refresh
          setIsReadyingUp(false);
          await new Promise(resolve => setTimeout(resolve, 500));
          return readyUp(1);
        }

        toast.error(error.message || 'Failed to ready up. Please try again.');
        setIsReadyingUp(false);
        return;
      }

      console.log('[TOURNAMENT READY] RPC Success - Room ID:', roomId);
      console.log('[TOURNAMENT READY] Room ID type:', typeof roomId);
      console.log('[TOURNAMENT READY] Room ID is null:', roomId === null);

      // If room_id is returned, navigate immediately
      if (roomId) {
        console.log('[TOURNAMENT READY] Both players ready! Navigating to room:', roomId);
        toast.success('Both players ready! Starting match...');

        const delay = 300 + Math.random() * 200;
        await new Promise(resolve => setTimeout(resolve, delay));

        setShowModal(false);
        setActiveMatch(null);
        router.push(`/app/match/online/${roomId}`);
        return;
      }

      // Otherwise, realtime subscription will handle updates
      console.log('[TOURNAMENT READY] Ready up successful, waiting for opponent');
      toast.success('You are ready! Waiting for opponent...');

      // Refetch to update the UI with my_ready status
      await refetchActiveMatch();
      setIsReadyingUp(false);
    } catch (error: any) {
      console.error('[TOURNAMENT READY] Exception during ready up:', error);
      toast.error(error.message || 'Failed to ready up. Please try again.');
      setIsReadyingUp(false);
    }
  }, [activeMatch, supabase, isReadyingUp, router, refetchActiveMatch]);

  return {
    showModal,
    activeMatch,
    timeRemaining,
    isReadyingUp,
    readyUp,
    closeModal,
  };
}
