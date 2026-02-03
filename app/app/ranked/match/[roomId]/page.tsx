'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Target, Trophy, TrendingUp, Shield, RotateCcw, Home, X, ArrowUp, ArrowDown, Minus, Flag } from 'lucide-react';
import { getCheckoutOptions } from '@/lib/match-logic';
import { toast } from 'sonner';
import { mapRoomToMatchState } from '@/lib/match/mapRoomToMatchState';
import { TrustRatingModal } from '@/components/TrustRatingModal';
import { TrustLetter } from '@/components/TrustBadge';
import { setPersistedMatch, clearPersistedMatch } from '@/lib/utils/match-storage';

interface Dart {
  type: 'single' | 'double' | 'triple' | 'bull';
  number: number;
  value: number;
}

interface MatchRoom {
  id: string;
  player1_id: string;
  player2_id: string;
  game_mode: number;
  match_format: string;
  match_type: string;
  status: string;
  current_leg: number;
  legs_to_win: number;
  player1_remaining: number;
  player2_remaining: number;
  current_turn: string;
  winner_id: string | null;
  summary: {
    player1_legs?: number;
    player2_legs?: number;
  };
}

interface Profile {
  user_id: string;
  username: string;
}

interface MatchEvent {
  id: string;
  player_id: string;
  seq: number;
  event_type: string;
  payload: {
    score: number;
    remaining: number;
    is_bust: boolean;
    is_checkout: boolean;
    leg: number;
  };
  created_at: string;
}

interface RankedResult {
  success: boolean;
  winner_id: string;
  player1: {
    id: string;
    rp_before: number;
    rp_after: number;
    delta: number;
    division: string;
    legs_won: number;
  };
  player2: {
    id: string;
    rp_before: number;
    rp_after: number;
    delta: number;
    division: string;
    legs_won: number;
  };
}

export default function RankedMatchPage() {
  const router = useRouter();
  const params = useParams();
  const roomId = params.roomId as string;
  const supabase = createClient();

  const [room, setRoom] = useState<MatchRoom | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const matchState = mapRoomToMatchState(room, events, profiles, currentUserId);

  const [currentVisit, setCurrentVisit] = useState<Dart[]>([]);
  const [dartboardGroup, setDartboardGroup] = useState<'singles' | 'doubles' | 'triples' | 'bulls'>('singles');
  const [scoringMode, setScoringMode] = useState<'quick' | 'input'>('quick');
  const [scoreInput, setScoreInput] = useState('');

  const [showForfeitDialog, setShowForfeitDialog] = useState(false);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [rankedResults, setRankedResults] = useState<RankedResult | null>(null);
  const [finalizingMatch, setFinalizingMatch] = useState(false);
  const hasHandledMatchEndRef = useRef(false);
  const hasRedirectedRef = useRef(false);

  // Trust Rating Modal state
  const [showTrustModal, setShowTrustModal] = useState(false);
  const [trustPromptedForMatchId, setTrustPromptedForMatchId] = useState<string | null>(() => {
    // Check if we already prompted for this match (prevents re-prompt on refresh)
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(`trust_prompted_${roomId}`);
    }
    return null;
  });

  const isMyTurn = matchState ? matchState.youArePlayer === matchState.currentTurnPlayer : false;
  const myRemaining = matchState && matchState.youArePlayer
    ? matchState.players[matchState.youArePlayer - 1].remaining
    : 0;

  useEffect(() => {
    loadMatch();
    const cleanup = subscribeToUpdates();
    return cleanup;
  }, [roomId]);

  useEffect(() => {
    // Show trust modal first when match ends (finished or forfeited)
    if ((room?.status === 'finished' || room?.status === 'forfeited') && room.match_type === 'ranked') {
      const opponentId = currentUserId && room
        ? (currentUserId === room.player1_id ? room.player2_id : room.player1_id)
        : null;

      // Show trust modal first (only once per match)
      if (trustPromptedForMatchId !== roomId && opponentId) {
        console.log('[TRUST_RATING] Ranked match ended, showing trust modal first');
        setTrustPromptedForMatchId(roomId);
        // Store in sessionStorage to prevent re-prompt on refresh
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(`trust_prompted_${roomId}`, roomId);
        }
        setShowTrustModal(true);
        return; // Don't finalize yet, wait for trust modal to complete
      }

      // Trust modal already shown or skipped, proceed with finalization
      if (!showTrustModal && room.winner_id && !finalizingMatch && !rankedResults) {
        finalizeMatch();
      }
    }
  }, [room?.status, room?.winner_id, room?.match_type, trustPromptedForMatchId, currentUserId, showTrustModal, finalizingMatch, rankedResults]);

  function clearMatchStorage() {
    console.log('[CLEANUP] Clearing ranked match storage');
    clearPersistedMatch();
  }

  async function loadMatch() {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('[RankedMatch] Not authenticated');
      toast.error('Not authenticated');
      router.push('/login');
      return;
    }
    setCurrentUserId(user.id);

    // Load match room - check if it exists and its status
    console.log(`[RankedMatch] Loading match room: ${roomId}`);

    const { data: roomData, error: roomError } = await supabase
      .from('ranked_match_rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle();

    // On query error: log it but DON'T redirect (could be temporary network issue)
    if (roomError) {
      console.error('[RankedMatch] Failed to load room:', roomError);
      toast.error(`Failed to load match room: ${roomError.message}`);
      setLoading(false);
      return;
    }

    // Only redirect if match doesn't exist
    if (!roomData) {
      if (hasRedirectedRef.current) return;
      hasRedirectedRef.current = true;
      console.error('[RankedMatch] Match not found');
      toast.error('Match not found');
      clearMatchStorage();
      router.push('/app/ranked');
      return;
    }

    // Check if match is already finished or forfeited
    if (roomData.status === 'finished' || roomData.status === 'forfeited') {
      if (hasRedirectedRef.current) return;
      hasRedirectedRef.current = true;
      console.log('[RankedMatch] Match already ended, status:', roomData.status);
      toast.info('Match has already ended');
      clearMatchStorage();
      router.push('/app/ranked');
      return;
    }

    console.log('[RankedMatch] Room loaded successfully:', {
      id: roomData.id,
      status: roomData.status,
      match_type: roomData.match_type,
      game_mode: roomData.game_mode
    });

    // Verify this is a ranked match
    if (roomData.match_type !== 'ranked') {
      if (hasRedirectedRef.current) return;
      hasRedirectedRef.current = true;
      console.error('[RankedMatch] Wrong match type:', roomData.match_type);
      toast.error('This is not a ranked match');
      clearMatchStorage();
      router.push('/app/ranked');
      return;
    }

    setRoom(roomData as MatchRoom);

    // Persist match state now that we've confirmed it's active
    setPersistedMatch(roomId, 'ranked');

    // Load profiles
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, username')
      .in('user_id', [roomData.player1_id, roomData.player2_id]);

    if (profilesData) {
      console.log('[RankedMatch] Profiles loaded:', profilesData.length);
      setProfiles(profilesData);
    }

    // Load events
    const { data: eventsData } = await supabase
      .from('match_events')
      .select('*')
      .eq('room_id', roomId)
      .order('seq', { ascending: true });

    if (eventsData) {
      console.log('[RankedMatch] Events loaded:', eventsData.length);
      setEvents(eventsData);
    }

    setLoading(false);
  }

  function subscribeToUpdates() {
    console.log('[RankedMatch] Setting up realtime subscriptions');

    const channel = supabase
      .channel(`ranked_match:${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ranked_match_rooms',
        filter: `id=eq.${roomId}`,
      }, (payload) => {
        console.log('[RankedMatch] Room update received:', payload.new);
        const updatedRoom = payload.new as MatchRoom;
        setRoom(updatedRoom);

        // Handle match end (forfeited or finished)
        if ((updatedRoom.status === 'forfeited' || updatedRoom.status === 'finished') && !hasHandledMatchEndRef.current) {
          console.log('[RankedMatch] Match ended, status:', updatedRoom.status);
          hasHandledMatchEndRef.current = true;

          // Clear persisted match storage
          clearPersistedMatch();

          console.log('[RankedMatch] Cleanup complete, will show results modal');
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'match_events',
        filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        console.log('[RankedMatch] New event received:', payload.new);
        setEvents((prev) => [...prev, payload.new as MatchEvent]);
      })
      .subscribe();

    return () => {
      console.log('[RankedMatch] Cleaning up subscriptions');
      supabase.removeChannel(channel);
    };
  }

  async function finalizeMatch() {
    if (!room || !room.winner_id) return;

    if (room.match_type !== 'ranked') {
      console.warn('[RankedMatch] Attempted to finalize non-ranked match');
      return;
    }

    if (typeof room.game_mode !== 'number' || (room.game_mode !== 301 && room.game_mode !== 501)) {
      console.error('[RankedMatch] Invalid game_mode:', room.game_mode);
      toast.error('Invalid match configuration');
      return;
    }

    setFinalizingMatch(true);
    console.log('[RankedMatch] Finalizing match:', roomId);

    try {
      const { data, error } = await supabase.rpc('rpc_ranked_finalize_match', {
        p_match_room_id: roomId,
        p_winner_id: room.winner_id,
        p_legs_p1: room.summary?.player1_legs || 0,
        p_legs_p2: room.summary?.player2_legs || 0,
      });

      if (error) {
        console.error('[RankedMatch] Error finalizing match:', error);
        toast.error('Failed to finalize match');
        return;
      }

      console.log('[RankedMatch] Match finalized successfully:', data);
      setRankedResults(data as RankedResult);
      setShowResultsModal(true);
    } catch (err) {
      console.error('[RankedMatch] Unexpected error:', err);
      toast.error('Failed to finalize match');
    } finally {
      setFinalizingMatch(false);
    }
  }

  const handleDartClick = (number: number, dartType: 'single' | 'double' | 'triple' | 'bull') => {
    if (!isMyTurn || currentVisit.length >= 3) return;

    let value = 0;
    if (dartType === 'bull') {
      value = number === 25 ? 25 : 50;
    } else if (dartType === 'single') {
      value = number;
    } else if (dartType === 'double') {
      value = number * 2;
    } else if (dartType === 'triple') {
      value = number * 3;
    }

    const dart: Dart = { type: dartType, number, value };
    setCurrentVisit([...currentVisit, dart]);
  };

  const handleClearVisit = () => {
    setCurrentVisit([]);
  };

  const handleSubmitVisit = async () => {
    if (!room || !currentUserId || submitting) return;

    const visitTotal = currentVisit.reduce((sum, dart) => sum + dart.value, 0);

    if (visitTotal === 0 && currentVisit.length === 0) {
      toast.error('Please enter darts or use the Bust button');
      return;
    }

    await submitScore(visitTotal);
  };

  const handleInputScoreSubmit = async (score: number) => {
    if (!room || !currentUserId || submitting) return;
    await submitScore(score);
  };

  const handleBust = async () => {
    if (!room || !currentUserId || submitting) return;
    await submitScore(0);
  };

  async function submitScore(score: number) {
    if (!room || !matchState || !currentUserId) return;

    if (!isMyTurn) {
      toast.error('Not your turn');
      return;
    }

    if (score < 0 || score > 180) {
      toast.error('Invalid score (0-180)');
      return;
    }

    setSubmitting(true);
    console.log('[RankedMatch] Submitting score:', score);

    try {
      const { data, error } = await supabase.rpc('submit_quick_match_throw', {
        p_room_id: roomId,
        p_score: score,
      });

      if (error) {
        console.error('[RankedMatch] Error submitting score:', error);
        toast.error('Failed to submit score');
        return;
      }

      console.log('[RankedMatch] Score submitted successfully');
      setCurrentVisit([]);
      setScoreInput('');
      toast.success('Score submitted');
    } catch (err) {
      console.error('[RankedMatch] Unexpected error:', err);
      toast.error('Failed to submit score');
    } finally {
      setSubmitting(false);
    }
  }

  const handleQuickScoreSubmit = () => {
    const score = parseInt(scoreInput);
    if (isNaN(score)) {
      toast.error('Invalid score');
      return;
    }
    handleInputScoreSubmit(score);
  };

  const handleForfeit = async () => {
    console.log('[RankedMatch] Forfeit requested');
    setShowForfeitDialog(false);

    try {
      const { data, error } = await supabase.rpc('rpc_forfeit_match', {
        p_match_room_id: roomId,
      });

      console.log('[RankedMatch] Forfeit RPC response:', data);

      if (error) {
        console.error('[RankedMatch] Forfeit error:', error);
        toast.error(`Failed to forfeit: ${error.message}`);
        return;
      }

      if (data?.already_ended) {
        if (hasRedirectedRef.current) return;
        hasRedirectedRef.current = true;
        console.log('[RankedMatch] Match already ended');
        toast.info('Match has already ended');
        clearMatchStorage();
        router.push('/app/ranked');
        return;
      }

      if (data?.status !== 'forfeited') {
        console.error('[RankedMatch] Unexpected status:', data?.status);
        toast.error('Failed to forfeit match');
        return;
      }

      console.log('[RankedMatch] Match forfeited successfully, waiting for realtime update');
      toast.info('Match forfeited');

      // Let realtime update trigger cleanup and show results modal
    } catch (error: any) {
      console.error('[RankedMatch] Forfeit failed:', error);
      toast.error(`Failed to forfeit: ${error.message}`);
    }
  };

  function handleTrustRatingDone() {
    console.log('[TRUST_RATING] Modal done, proceeding with match finalization');
    setShowTrustModal(false);

    // Now finalize the match and show results modal
    if (room?.winner_id && !finalizingMatch && !rankedResults) {
      finalizeMatch();
    }
  }

  const getPlayerName = (userId: string) => {
    const profile = profiles.find((p) => p.user_id === userId);
    return profile?.username || 'Player';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 text-amber-500 mx-auto animate-pulse" />
          <div className="text-white text-lg">Loading ranked match...</div>
        </div>
      </div>
    );
  }

  if (!room || !matchState) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="text-center space-y-4">
          <div className="text-white text-lg">Match not found</div>
          <Button onClick={() => router.push('/app/ranked')} className="bg-amber-500 hover:bg-amber-600">
            Back to Ranked
          </Button>
        </div>
      </div>
    );
  }

  const visitTotal = currentVisit.reduce((sum, dart) => sum + dart.value, 0);
  const checkoutOptions = myRemaining <= 170 ? getCheckoutOptions(myRemaining, true) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Top Bar */}
      <div className="border-b border-amber-500/20 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
                FIVE01
              </div>
              <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 px-4 py-1 text-sm font-bold shadow-lg shadow-amber-500/20">
                RANKED MATCH
              </Badge>
              <div className="hidden md:flex items-center space-x-2 text-sm text-gray-400">
                <span>{room.game_mode}</span>
                <span>•</span>
                <span>{room.match_format.replace('best-of-', 'Best of ')}</span>
                <span>•</span>
                <span>Double Out</span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowForfeitDialog(true)}
              disabled={!isMyTurn}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
              title={isMyTurn ? 'Forfeit match' : 'You can only forfeit on your turn'}
            >
              <Flag className="w-4 h-4 mr-2" />
              Forfeit
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-4 space-y-4">
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Left Column: Player Info + Current Leg + Visit History */}
          <div className="space-y-4">
            {/* Player 1 */}
            <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-sm border-2 border-transparent hover:border-amber-500/30 transition-all">
              <div className={`p-6 rounded-xl ${
                matchState.currentTurnPlayer === 1
                  ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-2 border-emerald-500'
                  : ''
              }`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <Avatar className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 border-2 border-white/10">
                      <AvatarFallback className="text-white font-bold">
                        {matchState.players[0].name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-white font-bold text-lg">{matchState.players[0].name}</p>
                      <p className="text-sm text-gray-400">
                        {matchState.players[0].legsWon} {matchState.players[0].legsWon === 1 ? 'leg' : 'legs'}
                      </p>
                    </div>
                  </div>
                  {matchState.currentTurnPlayer === 1 && matchState.youArePlayer === 1 && (
                    <Badge className="bg-emerald-500 text-white animate-pulse">YOUR TURN</Badge>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-5xl font-black text-white mb-2">{matchState.players[0].remaining}</div>
                  <div className="text-sm text-gray-400">Remaining</div>
                </div>
              </div>
            </Card>

            {/* Player 2 */}
            <Card className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-sm border-2 border-transparent hover:border-amber-500/30 transition-all">
              <div className={`p-6 rounded-xl ${
                matchState.currentTurnPlayer === 2
                  ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-2 border-emerald-500'
                  : ''
              }`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <Avatar className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 border-2 border-white/10">
                      <AvatarFallback className="text-white font-bold">
                        {matchState.players[1].name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-white font-bold text-lg">{matchState.players[1].name}</p>
                      <p className="text-sm text-gray-400">
                        {matchState.players[1].legsWon} {matchState.players[1].legsWon === 1 ? 'leg' : 'legs'}
                      </p>
                    </div>
                  </div>
                  {matchState.currentTurnPlayer === 2 && matchState.youArePlayer === 2 && (
                    <Badge className="bg-emerald-500 text-white animate-pulse">YOUR TURN</Badge>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-5xl font-black text-white mb-2">{matchState.players[1].remaining}</div>
                  <div className="text-sm text-gray-400">Remaining</div>
                </div>
              </div>
            </Card>

            {/* Current Leg Info */}
            <Card className="bg-slate-900/50 backdrop-blur-sm border border-amber-500/20">
              <div className="p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Current Leg</span>
                  <span className="text-white font-bold">Leg {room.current_leg}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-gray-400">Status</span>
                  <Badge className="bg-emerald-500 text-white">{room.status}</Badge>
                </div>
              </div>
            </Card>

            {/* Visit History */}
            <Card className="bg-slate-900/50 backdrop-blur-sm border border-white/10">
              <div className="p-4">
                <h3 className="text-sm font-semibold text-white mb-3">Visit History</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {matchState.visitHistory.slice().reverse().slice(0, 10).map((visit, idx) => (
                    <div
                      key={visit.id || idx}
                      className={`p-2 rounded-lg text-sm ${
                        visit.by === 'you'
                          ? 'bg-emerald-500/10 border border-emerald-500/30'
                          : 'bg-white/5 border border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400 text-xs">{visit.playerName}</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-white font-bold">{visit.score}</span>
                          <span className="text-gray-500">→</span>
                          <span className="text-gray-300">{visit.remainingAfter}</span>
                          {visit.isBust && (
                            <Badge className="bg-red-500 text-white text-xs">BUST</Badge>
                          )}
                          {visit.isCheckout && (
                            <Badge className="bg-amber-500 text-white text-xs">WIN</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column: Scoring Interface */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="bg-slate-900/50 backdrop-blur-sm border border-white/10">
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">Score Entry</h3>
                  <Tabs value={scoringMode} onValueChange={(v) => setScoringMode(v as 'quick' | 'input')}>
                    <TabsList className="bg-slate-800/50">
                      <TabsTrigger value="quick">Dartboard</TabsTrigger>
                      <TabsTrigger value="input">Quick Input</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {scoringMode === 'quick' ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center">
                      <Tabs value={dartboardGroup} onValueChange={(v) => setDartboardGroup(v as any)}>
                        <TabsList className="bg-slate-800/50">
                          <TabsTrigger value="singles">Singles</TabsTrigger>
                          <TabsTrigger value="doubles">Doubles</TabsTrigger>
                          <TabsTrigger value="triples">Triples</TabsTrigger>
                          <TabsTrigger value="bulls">Bulls</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </div>

                    {dartboardGroup === 'bulls' ? (
                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          onClick={() => handleDartClick(25, 'bull')}
                          disabled={!isMyTurn || currentVisit.length >= 3}
                          className="h-16 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg"
                        >
                          Bull (25)
                        </Button>
                        <Button
                          onClick={() => handleDartClick(50, 'bull')}
                          disabled={!isMyTurn || currentVisit.length >= 3}
                          className="h-16 bg-red-600 hover:bg-red-700 text-white font-bold text-lg"
                        >
                          Double Bull (50)
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-5 gap-2">
                        {[20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5].map((num) => (
                          <Button
                            key={num}
                            onClick={() => handleDartClick(num, dartboardGroup === 'singles' ? 'single' : dartboardGroup === 'doubles' ? 'double' : 'triple')}
                            disabled={!isMyTurn || currentVisit.length >= 3}
                            className="h-14 bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg"
                          >
                            {num}
                          </Button>
                        ))}
                      </div>
                    )}

                    <div className="bg-slate-800/50 rounded-lg p-4 border border-amber-500/20">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-gray-400 font-semibold">Current Visit</span>
                        <span className="text-3xl font-black text-amber-400">{visitTotal}</span>
                      </div>
                      <div className="flex space-x-2">
                        {currentVisit.map((dart, idx) => (
                          <Badge key={idx} className="bg-emerald-500 text-white text-sm px-3 py-1">
                            {dart.type === 'single' && dart.value}
                            {dart.type === 'double' && `D${dart.number}`}
                            {dart.type === 'triple' && `T${dart.number}`}
                            {dart.type === 'bull' && (dart.value === 50 ? 'Bull' : '25')}
                          </Badge>
                        ))}
                        {currentVisit.length === 0 && (
                          <span className="text-gray-500 text-sm">No darts thrown</span>
                        )}
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <Button
                        onClick={handleClearVisit}
                        disabled={!isMyTurn || currentVisit.length === 0}
                        variant="outline"
                        className="flex-1 border-white/10 text-white hover:bg-white/5"
                      >
                        Clear
                      </Button>
                      <Button
                        onClick={handleBust}
                        disabled={!isMyTurn || submitting}
                        variant="outline"
                        className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      >
                        Bust (0)
                      </Button>
                      <Button
                        onClick={handleSubmitVisit}
                        disabled={!isMyTurn || currentVisit.length === 0 || submitting}
                        className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold"
                      >
                        {submitting ? 'Submitting...' : 'Submit Visit'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block font-semibold">Enter Score (0-180)</label>
                      <Input
                        type="number"
                        value={scoreInput}
                        onChange={(e) => setScoreInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleQuickScoreSubmit()}
                        disabled={!isMyTurn}
                        placeholder="Enter score"
                        className="bg-slate-800/50 border-amber-500/20 text-white text-3xl h-20 text-center font-bold"
                      />
                    </div>

                    <div className="flex space-x-2">
                      <Button
                        onClick={handleBust}
                        disabled={!isMyTurn || submitting}
                        variant="outline"
                        className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      >
                        Bust (0)
                      </Button>
                      <Button
                        onClick={handleQuickScoreSubmit}
                        disabled={!isMyTurn || !scoreInput || submitting}
                        className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold"
                      >
                        {submitting ? 'Submitting...' : 'Submit'}
                      </Button>
                    </div>
                  </div>
                )}

                {checkoutOptions.length > 0 && isMyTurn && (
                  <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-lg p-4">
                    <p className="text-amber-400 text-sm font-bold mb-2 flex items-center">
                      <Trophy className="w-4 h-4 mr-2" />
                      Checkout Available ({myRemaining})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {checkoutOptions.map((option, idx) => (
                        <Badge key={idx} variant="outline" className="border-amber-500/50 text-amber-300 bg-amber-500/5">
                          {option.description}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Forfeit Dialog */}
      <AlertDialog open={showForfeitDialog} onOpenChange={setShowForfeitDialog}>
        <AlertDialogContent className="bg-slate-900 border-red-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Forfeit Ranked Match?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Forfeiting will result in a loss and you will lose ranked points. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-white border-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleForfeit}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Forfeit Match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Trust Rating Modal - shows before results modal */}
      {room && currentUserId && (
        <TrustRatingModal
          open={showTrustModal}
          matchId={roomId}
          opponentId={currentUserId === room.player1_id ? room.player2_id : room.player1_id}
          onDone={handleTrustRatingDone}
        />
      )}

      {/* Results Modal */}
      <Dialog open={showResultsModal} onOpenChange={setShowResultsModal}>
        <DialogContent className="bg-slate-900 border-amber-500/30 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-3xl font-bold text-center">
              <Shield className="w-12 h-12 text-amber-500 mx-auto mb-2" />
              Ranked Match Complete
            </DialogTitle>
          </DialogHeader>

          {rankedResults && (
            <div className="space-y-6 py-4">
              <div className="text-center">
                <Trophy className="w-16 h-16 text-amber-500 mx-auto mb-3" />
                <p className="text-2xl font-bold">
                  {rankedResults.winner_id
                    ? rankedResults.winner_id === currentUserId ? 'Victory!' : 'Defeat'
                    : 'Match Complete'}
                </p>
                <p className="text-gray-400 mt-1">
                  {rankedResults.winner_id
                    ? `${getPlayerName(rankedResults.winner_id)} wins ${
                        rankedResults.winner_id === rankedResults.player1.id
                          ? `${rankedResults.player1.legs_won}-${rankedResults.player2.legs_won}`
                          : `${rankedResults.player2.legs_won}-${rankedResults.player1.legs_won}`
                      }`
                    : 'Match ended'}
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {[rankedResults.player1, rankedResults.player2].map((player) => {
                  const isMe = player.id === currentUserId;
                  const isWinner = player.id === rankedResults.winner_id;

                  return (
                    <Card
                      key={player.id}
                      className={`p-6 ${
                        isWinner
                          ? 'bg-gradient-to-br from-amber-600/20 to-orange-600/20 border-amber-500/30'
                          : 'bg-slate-800/50 border-white/10'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-white">
                            {getPlayerName(player.id)} {isMe && '(You)'}
                          </p>
                          {isWinner && (
                            <Trophy className="w-5 h-5 text-amber-500" />
                          )}
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">RP Change</span>
                            <span className={`font-bold flex items-center ${
                              player.delta > 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}>
                              {player.delta > 0 ? (
                                <ArrowUp className="w-4 h-4 mr-1" />
                              ) : player.delta < 0 ? (
                                <ArrowDown className="w-4 h-4 mr-1" />
                              ) : (
                                <Minus className="w-4 h-4 mr-1" />
                              )}
                              {Math.abs(player.delta)} RP
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">New Rating</span>
                            <span className="font-bold text-white">{player.rp_after} RP</span>
                          </div>

                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Division</span>
                            <Badge className="bg-amber-500 text-white">
                              {player.division}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              <div className="flex space-x-3">
                <Button
                  onClick={() => router.push('/app/ranked')}
                  className="flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Play Again
                </Button>
                <Button
                  onClick={() => router.push('/app')}
                  variant="outline"
                  className="flex-1 border-white/10 text-white hover:bg-white/5"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Dashboard
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
