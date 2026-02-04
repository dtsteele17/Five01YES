'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Target, Trophy, TrendingUp, Zap, RotateCcw, Home, Shield, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { getCheckoutOptions } from '@/lib/match-logic';
import { toast } from 'sonner';
import { mapRoomToMatchState } from '@/lib/match/mapRoomToMatchState';

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
  const matchRoomId = params.matchRoomId as string;
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

  const [showResultsModal, setShowResultsModal] = useState(false);
  const [rankedResults, setRankedResults] = useState<RankedResult | null>(null);
  const [finalizingMatch, setFinalizingMatch] = useState(false);

  const isMyTurn = matchState ? matchState.youArePlayer === matchState.currentTurnPlayer : false;
  const myRemaining = matchState && matchState.youArePlayer
    ? matchState.players[matchState.youArePlayer - 1].remaining
    : 0;
  const opponentRemaining = matchState && matchState.youArePlayer
    ? matchState.players[matchState.youArePlayer === 1 ? 1 : 0].remaining
    : 0;

  useEffect(() => {
    loadMatch();
    subscribeToUpdates();
  }, [matchRoomId]);

  useEffect(() => {
    if (room?.status === 'finished' && room.winner_id && room.match_type === 'ranked' && !finalizingMatch && !rankedResults) {
      finalizeMatch();
    }
  }, [room?.status, room?.winner_id, room?.match_type]);

  async function loadMatch() {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Not authenticated');
      router.push('/login');
      return;
    }
    setCurrentUserId(user.id);

    // Retry logic: try loading room up to 5 times with delays (total ~2s)
    let roomData: any = null;
    let lastError: any = null;
    const maxRetries = 5;
    const retryDelays = [0, 200, 400, 600, 800]; // Total ~2 seconds

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        console.log(`[RankedMatch] Retry ${attempt}/${maxRetries - 1} after ${retryDelays[attempt]}ms`);
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
      }

      const { data, error } = await supabase
        .from('ranked_match_rooms')
        .select('*')
        .eq('id', matchRoomId)
        .maybeSingle();

      if (error) {
        console.error(`[RankedMatch] Error loading room (attempt ${attempt + 1}):`, error);
        lastError = error;
        continue;
      }

      if (data) {
        roomData = data;
        console.log('[RankedMatch] Room loaded successfully:', { id: data.id, status: data.status });
        break;
      }

      console.log(`[RankedMatch] Room not found yet (attempt ${attempt + 1})`);
    }

    if (!roomData) {
      console.error('[RankedMatch] Failed to load room after retries:', lastError);
      toast.error('Match room not found');
      router.push('/app/ranked');
      return;
    }

    // Verify this is a ranked match
    if (roomData.match_type !== 'ranked') {
      toast.error('This is not a ranked match');
      router.push('/app/ranked');
      return;
    }

    setRoom(roomData as MatchRoom);

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, username')
      .in('user_id', [roomData.player1_id, roomData.player2_id]);

    setProfiles(profilesData || []);

    const { data: eventsData } = await supabase
      .from('match_events')
      .select('*')
      .eq('room_id', matchRoomId)
      .order('seq', { ascending: true });

    setEvents(eventsData || []);
    setLoading(false);
  }

  function subscribeToUpdates() {
    const channel = supabase
      .channel(`ranked_match_room:${matchRoomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ranked_match_rooms',
        filter: `id=eq.${matchRoomId}`,
      }, (payload) => {
        console.log('[RankedMatch] Room update received:', payload.new);
        setRoom(payload.new as MatchRoom);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'match_events',
        filter: `room_id=eq.${matchRoomId}`,
      }, (payload) => {
        console.log('[RankedMatch] New event received:', payload.new);
        setEvents((prev) => [...prev, payload.new as MatchEvent]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  async function finalizeMatch() {
    if (!room || !room.winner_id) return;

    // Only finalize ranked matches (match_type === 'ranked')
    if (room.match_type !== 'ranked') {
      console.warn('Attempted to finalize non-ranked match');
      return;
    }

    // Validate game_mode is numeric (301 or 501)
    if (typeof room.game_mode !== 'number' || (room.game_mode !== 301 && room.game_mode !== 501)) {
      console.error('Invalid game_mode, expected 301 or 501, got:', room.game_mode);
      toast.error('Invalid match configuration');
      return;
    }

    setFinalizingMatch(true);

    try {
      const { data, error } = await supabase.rpc('rpc_ranked_finalize_match', {
        p_match_room_id: matchRoomId,
        p_winner_id: room.winner_id,
        p_legs_p1: room.summary?.player1_legs || 0,
        p_legs_p2: room.summary?.player2_legs || 0,
      });

      if (error) {
        console.error('Error finalizing match:', error);
        toast.error('Failed to finalize match');
        return;
      }

      setRankedResults(data as RankedResult);
      setShowResultsModal(true);
    } catch (err) {
      console.error('Unexpected error:', err);
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

    try {
      console.log("[SUBMIT] calling rpc_quick_match_submit_visit_v2", {
        p_room_id: matchRoomId,
        p_score: score,
        p_darts: [],
        p_is_bust: false
      });

      const { data, error } = await supabase.rpc('rpc_quick_match_submit_visit_v2', {
        p_room_id: matchRoomId,
        p_score: score,
        p_darts: [],
        p_is_bust: false
      });

      if (error) {
        console.error("[SUBMIT] Supabase error", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code
        });
        toast.error('Failed to submit score');
        return;
      }

      setCurrentVisit([]);
      setScoreInput('');
      toast.success('Score submitted');
    } catch (err) {
      console.error('Unexpected error:', err);
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

  const getPlayerName = (userId: string) => {
    const profile = profiles.find((p) => p.user_id === userId);
    return profile?.username || 'Player';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white">Loading match...</div>
      </div>
    );
  }

  if (!room || !matchState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white">Match not found</div>
      </div>
    );
  }

  const visitTotal = currentVisit.reduce((sum, dart) => sum + dart.value, 0);
  const checkoutOptions = myRemaining <= 170 ? getCheckoutOptions(myRemaining, true) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Shield className="w-8 h-8 text-amber-500" />
            <div>
              <h1 className="text-2xl font-bold text-white">Ranked Match</h1>
              <p className="text-sm text-gray-400">Best of 5 • First to 3 legs</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => router.push('/app/play')}
            className="border-white/10 text-white hover:bg-white/5"
          >
            <Home className="w-4 h-4 mr-2" />
            Dashboard
          </Button>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border-2 transition-all ${
                matchState.currentTurnPlayer === 1
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-white/10 bg-white/5'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Avatar className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500">
                      <AvatarFallback className="text-white font-bold">
                        {matchState.players[0].name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-white font-semibold">{matchState.players[0].name}</p>
                      <p className="text-sm text-gray-400">
                        {matchState.players[0].legsWon} {matchState.players[0].legsWon === 1 ? 'leg' : 'legs'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-white">{matchState.players[0].remaining}</p>
                    {matchState.currentTurnPlayer === 1 && matchState.youArePlayer === 1 && (
                      <Badge className="bg-emerald-500 text-white mt-1">Your Turn</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className={`p-4 rounded-xl border-2 transition-all ${
                matchState.currentTurnPlayer === 2
                  ? 'border-emerald-500 bg-emerald-500/10'
                  : 'border-white/10 bg-white/5'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Avatar className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500">
                      <AvatarFallback className="text-white font-bold">
                        {matchState.players[1].name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-white font-semibold">{matchState.players[1].name}</p>
                      <p className="text-sm text-gray-400">
                        {matchState.players[1].legsWon} {matchState.players[1].legsWon === 1 ? 'leg' : 'legs'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-white">{matchState.players[1].remaining}</p>
                    {matchState.currentTurnPlayer === 2 && matchState.youArePlayer === 2 && (
                      <Badge className="bg-emerald-500 text-white mt-1">Your Turn</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Current Leg</span>
                  <span className="text-white font-semibold">Leg {room.current_leg}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-gray-400">Format</span>
                  <span className="text-white font-semibold">{room.match_format.replace('best-of-', 'Best of ')}</span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Score Entry</h3>
                <Tabs value={scoringMode} onValueChange={(v) => setScoringMode(v as 'quick' | 'input')}>
                  <TabsList className="bg-slate-800/50">
                    <TabsTrigger value="quick">Dartboard</TabsTrigger>
                    <TabsTrigger value="input">Quick Input</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {scoringMode === 'quick' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center space-x-2">
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
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => handleDartClick(25, 'bull')}
                        disabled={!isMyTurn || currentVisit.length >= 3}
                        className="h-16 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        Bull (25)
                      </Button>
                      <Button
                        onClick={() => handleDartClick(50, 'bull')}
                        disabled={!isMyTurn || currentVisit.length >= 3}
                        className="h-16 bg-red-600 hover:bg-red-700 text-white"
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
                          className="h-12 bg-slate-800 hover:bg-slate-700 text-white"
                        >
                          {num}
                        </Button>
                      ))}
                    </div>
                  )}

                  <div className="bg-slate-800/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-gray-400">Current Visit</span>
                      <span className="text-2xl font-bold text-white">{visitTotal}</span>
                    </div>
                    <div className="flex space-x-2">
                      {currentVisit.map((dart, idx) => (
                        <Badge key={idx} className="bg-emerald-500 text-white">
                          {dart.type === 'single' && dart.value}
                          {dart.type === 'double' && `D${dart.number}`}
                          {dart.type === 'triple' && `T${dart.number}`}
                          {dart.type === 'bull' && (dart.value === 50 ? 'Bull' : '25')}
                        </Badge>
                      ))}
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
                      Bust
                    </Button>
                    <Button
                      onClick={handleSubmitVisit}
                      disabled={!isMyTurn || currentVisit.length === 0 || submitting}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      {submitting ? 'Submitting...' : 'Submit'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Enter Score (0-180)</label>
                    <Input
                      type="number"
                      value={scoreInput}
                      onChange={(e) => setScoreInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleQuickScoreSubmit()}
                      disabled={!isMyTurn}
                      placeholder="Enter score"
                      className="bg-slate-800/50 border-white/10 text-white text-2xl h-16 text-center"
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
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      {submitting ? 'Submitting...' : 'Submit'}
                    </Button>
                  </div>
                </div>
              )}

              {checkoutOptions.length > 0 && isMyTurn && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
                  <p className="text-amber-400 text-sm font-semibold mb-2">
                    <Trophy className="w-4 h-4 inline mr-1" />
                    Checkout Options ({myRemaining})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {checkoutOptions.map((option, idx) => (
                      <Badge key={idx} variant="outline" className="border-amber-500/50 text-amber-300">
                        {option.description}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Visit History</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {matchState.visitHistory.slice().reverse().map((visit, idx) => (
              <div
                key={visit.id || idx}
                className={`p-3 rounded-lg ${
                  visit.by === 'you'
                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                    : 'bg-white/5 border border-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-gray-400 text-sm">
                      {visit.playerName}
                    </span>
                    <Badge variant="outline" className="border-white/20 text-white">
                      Leg {visit.leg}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-2xl font-bold text-white">{visit.score}</span>
                    <span className="text-gray-400">→</span>
                    <span className="text-xl text-gray-300">{visit.remainingAfter}</span>
                    {visit.isBust && (
                      <Badge className="bg-red-500 text-white">BUST</Badge>
                    )}
                    {visit.isCheckout && (
                      <Badge className="bg-amber-500 text-white">CHECKOUT</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

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
                  {rankedResults.winner_id === currentUserId ? 'Victory!' : 'Defeat'}
                </p>
                <p className="text-gray-400 mt-1">
                  {getPlayerName(rankedResults.winner_id)} wins {' '}
                  {rankedResults.winner_id === rankedResults.player1.id
                    ? `${rankedResults.player1.legs_won}-${rankedResults.player2.legs_won}`
                    : `${rankedResults.player2.legs_won}-${rankedResults.player1.legs_won}`}
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
                  onClick={() => router.push('/app/play?queue=ranked')}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
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
                  Back to Dashboard
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
