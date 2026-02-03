'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Loader2, X, Trophy, Users, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  validateRoomBeforeNavigation,
  clearStaleMatchState,
} from '@/lib/utils/stale-state-cleanup';

interface EnqueueResponse {
  queue_id: string;
  status: string;
  match_room_id?: string;
  message: string;
}

interface PollResponse {
  ok: boolean;
  queue_id?: string;
  status: 'searching' | 'matched' | 'not_found' | 'cancelled';
  match_room_id?: string | null;
  matched_at?: string | null;
  message?: string;
}

// Helper to normalize Supabase RPC return shapes
function normalizePollResult(data: any): PollResponse | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

export default function RankedPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [queueData, setQueueData] = useState<PollResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTime, setSearchTime] = useState(0);

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollTickRef = useRef(0);

  useEffect(() => {
    checkAuth();

    // Resume polling if we have a stored queue_id
    const storedQueueId = localStorage.getItem('ranked_queue_id');
    if (storedQueueId) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Ranked] Resuming polling with stored queueId:', storedQueueId);
      }
      setQueueId(storedQueueId);
      setIsSearching(true);
      startPolling(storedQueueId);
      startSearchTimer();
    }

    return () => {
      stopPolling();
      stopSearchTimer();
    };
  }, []);

  const checkAuth = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
    } else {
      router.push('/login');
    }
  };

  const findMatch = async () => {
    // Prevent duplicate enqueue if already searching
    if (isSearching && queueId) {
      console.log('[Ranked] Already searching with queueId:', queueId);
      return;
    }

    const supabase = createClient();
    setError(null);
    setIsSearching(true);
    setSearchTime(0);

    try {
      console.log('[Ranked] Calling rpc_ranked_enqueue (no params)');
      // rpc_ranked_enqueue returns a single UUID string, not a JSON object
      const { data: newQueueId, error: rpcError } = await supabase.rpc('rpc_ranked_enqueue');

      if (rpcError) {
        console.error('[Ranked] Error enqueuing:', rpcError);
        setError(`Failed to join queue: ${rpcError.message}`);
        setIsSearching(false);
        toast.error('Failed to join ranked queue');
        return;
      }

      if (!newQueueId) {
        console.error('[Ranked] No queue ID returned from enqueue');
        setError('Failed to join queue: No queue ID returned');
        setIsSearching(false);
        toast.error('Failed to join ranked queue');
        return;
      }

      console.log('[Ranked] Enqueue response - queueId:', newQueueId);

      // Store queue ID in state and localStorage
      setQueueId(newQueueId);
      localStorage.setItem('ranked_queue_id', newQueueId);

      toast.success('Joined ranked queue');

      // Start polling to check status
      startPolling(newQueueId);
      startSearchTimer();
    } catch (err: any) {
      console.error('[Ranked] Unexpected error:', err);
      setError(err.message || 'An unexpected error occurred');
      setIsSearching(false);
      toast.error('Failed to start search');
    }
  };

  const startPolling = (qId: string) => {
    stopPolling();

    pollingIntervalRef.current = setInterval(async () => {
      await pollQueue(qId);
      pollTickRef.current++;
    }, 1000);
  };

  const pollQueue = async (qId: string) => {
    const supabase = createClient();

    // Safety check: don't poll if no queue ID
    if (!qId) {
      console.warn('[Ranked] pollQueue called without queueId, skipping');
      return;
    }

    try {
      // Poll for status update - MUST pass p_queue_id parameter
      const { data, error } = await supabase.rpc('rpc_ranked_poll', {
        p_queue_id: qId,
      });

      if (error) {
        console.error('[Ranked] Error polling queue:', error);
        setError(`Polling error: ${error.message}`);
        stopPolling();
        stopSearchTimer();
        setIsSearching(false);
        clearStoredQueue();
        return;
      }

      // Normalize the response (handles plain object, array, or null)
      const poll = normalizePollResult(data);

      // Defensive guard: if poll is null or invalid, treat as still searching
      if (!poll || typeof poll.status !== 'string') {
        console.warn('[Ranked] Poll returned null/invalid data, treating as still searching');
        return;
      }

      // Check ok field
      if (poll.ok !== true) {
        console.error('[Ranked] Poll returned ok=false:', poll);
        setError(poll.message || 'Polling failed');
        stopPolling();
        stopSearchTimer();
        setIsSearching(false);
        clearStoredQueue();
        return;
      }

      console.log('[Ranked] Poll result:', { status: poll.status, matchRoomId: poll.match_room_id });

      setQueueData(poll);

      // Check if matched and navigate to match room
      if (poll.status === 'matched' && poll.match_room_id) {
        console.log('[RESUME] Ranked match found, validating room:', poll.match_room_id);

        if (!userId) {
          console.error('[RESUME] No userId available for validation');
          stopPolling();
          stopSearchTimer();
          clearStoredQueue();
          setIsSearching(false);
          return;
        }

        // Validate room before navigation
        const validation = await validateRoomBeforeNavigation(poll.match_room_id, userId);

        if (!validation.valid) {
          console.log('[RESUME] invalid -> cleared room:', validation.reason);
          await clearStaleMatchState();
          stopPolling();
          stopSearchTimer();
          clearStoredQueue();
          setIsSearching(false);
          toast.error(`Match room unavailable: ${validation.reason}`);
          return;
        }

        console.log('[RESUME] ok -> navigating to:', poll.match_room_id);
        stopPolling();
        stopSearchTimer();
        toast.success('Match found!');
        clearStoredQueue();
        router.push(`/app/ranked/match/${poll.match_room_id}`);
        return;
      }

      // Handle not_found or cancelled status
      if (poll.status === 'not_found' || poll.status === 'cancelled') {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Ranked] Status changed to:', poll.status);
        }
        stopPolling();
        stopSearchTimer();
        setIsSearching(false);
        clearStoredQueue();
        if (poll.status === 'cancelled') {
          toast.info('Search was cancelled');
        } else {
          toast.error('Queue entry not found');
        }
        return;
      }

      // If status === 'searching', keep polling (do nothing, let interval continue)
    } catch (err) {
      console.error('[Ranked] Error in poll:', err);
    }
  };

  const cancelSearch = async () => {
    if (!queueId) {
      console.log('[Ranked] Cancel called but no queueId, resetting UI');
      setIsSearching(false);
      clearStoredQueue();
      return;
    }

    console.log('[Ranked] Cancelling search for queueId:', queueId);
    const supabase = createClient();
    stopPolling();
    stopSearchTimer();

    try {
      const { error: cancelError } = await supabase.rpc('rpc_ranked_cancel', {
        p_queue_id: queueId,
      });

      if (cancelError) {
        console.error('[Ranked] Error cancelling queue:', cancelError);
        setError(`Failed to cancel: ${cancelError.message}`);
        toast.error('Failed to cancel search');
      } else {
        console.log('[Ranked] Successfully cancelled');
        toast.info('Search cancelled');
      }
    } catch (err) {
      console.error('[Ranked] Unexpected error during cancel:', err);
    } finally {
      setIsSearching(false);
      setQueueId(null);
      setQueueData(null);
      clearStoredQueue();
    }
  };

  const startSearchTimer = () => {
    stopSearchTimer();
    setSearchTime(0);
    searchTimerRef.current = setInterval(() => {
      setSearchTime(prev => prev + 1);
    }, 1000);
  };

  const stopSearchTimer = () => {
    if (searchTimerRef.current) {
      clearInterval(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const clearStoredQueue = () => {
    localStorage.removeItem('ranked_queue_id');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = () => {
    if (!queueData) return null;

    const statusConfig = {
      searching: { label: 'Searching', variant: 'default' as const },
      matched: { label: 'Matched', variant: 'default' as const },
      cancelled: { label: 'Cancelled', variant: 'destructive' as const },
      not_found: { label: 'Not Found', variant: 'destructive' as const },
    };

    const config = statusConfig[queueData.status] || { label: 'Unknown', variant: 'secondary' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-blue-500" />
        <div>
          <h1 className="text-3xl font-bold">Ranked Matchmaking</h1>
          <p className="text-muted-foreground">Compete in ranked matches to climb the ladder</p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Find Ranked Match
          </CardTitle>
          <CardDescription>
            Join the ranked queue and compete against players of similar skill
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isSearching ? (
            <Button
              size="lg"
              className="w-full"
              onClick={findMatch}
              disabled={!userId}
            >
              <Shield className="h-5 w-5 mr-2" />
              Find Match
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4 p-6 border rounded-lg bg-muted/50">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <div className="text-center">
                  <div className="text-lg font-semibold">Searching for opponent...</div>
                  <div className="flex items-center gap-2 justify-center mt-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{formatTime(searchTime)}</span>
                  </div>
                  {queueData && (
                    <div className="mt-2">
                      {getStatusBadge()}
                    </div>
                  )}
                </div>
              </div>

              <Button
                variant="destructive"
                size="lg"
                className="w-full"
                onClick={cancelSearch}
              >
                <X className="h-5 w-5 mr-2" />
                Cancel Search
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            How Ranked Works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
              1
            </div>
            <div>
              <div className="font-semibold text-foreground">Join the Queue</div>
              <div>Click Find Match to join the ranked matchmaking queue</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
              2
            </div>
            <div>
              <div className="font-semibold text-foreground">Get Matched</div>
              <div>The system finds an opponent with similar ranking</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
              3
            </div>
            <div>
              <div className="font-semibold text-foreground">Compete</div>
              <div>Play your match and earn or lose Ranking Points based on the result</div>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
