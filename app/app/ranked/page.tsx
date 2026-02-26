'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, Loader2, X, Trophy, Clock, Target, Swords, ChevronRight, Crown, TrendingUp, Zap, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { getRankImageUrl } from '@/lib/rank-badge-helpers';
// Room validation removed — ranked RPC is trusted source of match_room_id
import Link from 'next/link';

interface PollResponse {
  ok: boolean;
  queue_id?: string;
  status: 'searching' | 'matched' | 'not_found' | 'cancelled';
  match_room_id?: string | null;
  matched_at?: string | null;
  message?: string;
}

interface PlayerState {
  rp: number;
  mmr: number;
  games_played: number;
  wins: number;
  losses: number;
  provisional_games_remaining: number;
  division_name: string;
}

function normalizePollResult(data: any): PollResponse | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

export default function RankedPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [queueId, setQueueId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTime, setSearchTime] = useState(0);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [loading, setLoading] = useState(true);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadPlayerData();
    const stored = localStorage.getItem('ranked_queue_id');
    if (stored) {
      setQueueId(stored);
      setIsSearching(true);
      startPolling(stored);
      startTimer();
    }
    return () => { stopPolling(); stopTimer(); };
  }, []);

  const loadPlayerData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      const { data, error } = await supabase.rpc('rpc_ranked_get_my_state');
      if (!error && data) {
        const state = Array.isArray(data) ? data[0] : data;
        setPlayerState(state);
      }
    } catch (err) {
      console.error('[Ranked] Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const findMatch = async () => {
    if (isSearching && queueId) return;
    setIsSearching(true);
    setSearchTime(0);

    try {
      const { data: newQueueId, error } = await supabase.rpc('rpc_ranked_enqueue');
      if (error || !newQueueId) {
        toast.error('Failed to join ranked queue');
        setIsSearching(false);
        return;
      }
      setQueueId(newQueueId);
      localStorage.setItem('ranked_queue_id', newQueueId);
      toast.success('Searching for opponent...');
      startPolling(newQueueId);
      startTimer();
    } catch (err) {
      toast.error('Failed to start search');
      setIsSearching(false);
    }
  };

  const cancelSearch = async () => {
    if (queueId) {
      try {
        await supabase.rpc('rpc_ranked_cancel', { p_queue_id: queueId });
      } catch (error) {
        // Ignore errors during cancellation
      }
    }
    stopPolling();
    stopTimer();
    setIsSearching(false);
    setQueueId(null);
    localStorage.removeItem('ranked_queue_id');
    toast.info('Search cancelled');
  };

  const startPolling = (qId: string) => {
    stopPolling();
    pollingRef.current = setInterval(() => pollQueue(qId), 1000);
  };

  const pollQueue = async (qId: string) => {
    if (!qId) return;
    try {
      const { data, error } = await supabase.rpc('rpc_ranked_poll', { p_queue_id: qId });
      if (error) { cleanup(); return; }
      const poll = normalizePollResult(data);
      if (!poll || poll.ok !== true) return;

      if (poll.status === 'matched' && poll.match_room_id) {
        cleanup();
        toast.success('Match found!');

        // Copy ranked room data into match_rooms so the full quick-match
        // game screen works (pregame lobby, coin toss, scoring, stats)
        try {
          const { data: rankedRoom } = await supabase
            .from('ranked_match_rooms')
            .select('*')
            .eq('id', poll.match_room_id)
            .maybeSingle();

          if (rankedRoom) {
            // Check if match_rooms entry already exists (other player may have created it)
            const { data: existing } = await supabase
              .from('match_rooms')
              .select('id')
              .eq('id', rankedRoom.id)
              .maybeSingle();

            if (!existing) {
              try {
                await supabase.from('match_rooms').insert({
                  id: rankedRoom.id,
                  player1_id: rankedRoom.player1_id,
                  player2_id: rankedRoom.player2_id,
                  game_mode: rankedRoom.game_mode || 501,
                  match_format: rankedRoom.match_format || 'best_of_5',
                  status: 'waiting',
                  current_leg: 1,
                  legs_to_win: 3,
                  player1_remaining: rankedRoom.game_mode || 501,
                  player2_remaining: rankedRoom.game_mode || 501,
                  current_turn: rankedRoom.player1_id,
                  source: 'ranked',
                  match_type: 'ranked',
                });
              } catch (insertErr) {
                // Other player may have just inserted, ignore error
              }
            }
          }
        } catch (err) {
          console.error('[Ranked] Error syncing room:', err);
        }

        // Use the full quick-match game screen with pregame lobby + coin toss
        router.push(`/app/play/quick-match/match/${poll.match_room_id}`);
      } else if (poll.status === 'not_found' || poll.status === 'cancelled') {
        cleanup();
      }
    } catch (err) {
      console.error('[Ranked] Poll error:', err);
    }
  };

  const cleanup = () => {
    stopPolling();
    stopTimer();
    setIsSearching(false);
    setQueueId(null);
    localStorage.removeItem('ranked_queue_id');
  };

  const startTimer = () => {
    stopTimer();
    setSearchTime(0);
    timerRef.current = setInterval(() => setSearchTime(p => p + 1), 1000);
  };
  const stopPolling = () => { if (pollingRef.current) clearInterval(pollingRef.current); pollingRef.current = null; };
  const stopTimer = () => { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const winRate = playerState && playerState.games_played > 0
    ? Math.round((playerState.wins / playerState.games_played) * 100)
    : 0;

  const isPlacement = playerState ? playerState.provisional_games_remaining > 0 : true;
  const placementsDone = playerState ? 5 - playerState.provisional_games_remaining : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 w-[600px] h-[300px] bg-purple-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            <Shield className="w-10 h-10 text-blue-400" />
            <h1 className="text-4xl font-black text-white tracking-tight">Ranked Arena</h1>
          </div>
          <p className="text-slate-400 text-lg">501 • Best of 5 • Double Out</p>
        </div>

        {/* Rank Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/80 via-slate-900/90 to-slate-950 border border-white/10 shadow-2xl"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />

          <div className="relative p-8">
            <div className="flex flex-col md:flex-row items-center gap-8">
              {/* Rank Badge */}
              <div className="relative flex-shrink-0">
                <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-3xl" />
                {playerState?.division_name ? (
                  <img
                    src={getRankImageUrl(playerState.division_name)}
                    alt={playerState.division_name}
                    className="relative w-36 h-36 object-contain"
                  />
                ) : (
                  <div className="relative w-36 h-36 rounded-full bg-slate-700/50 border-2 border-dashed border-slate-600 flex items-center justify-center">
                    <span className="text-slate-500 text-4xl font-black">?</span>
                  </div>
                )}
              </div>

              {/* Rank Info */}
              <div className="flex-1 text-center md:text-left space-y-3">
                {isPlacement ? (
                  <>
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs uppercase tracking-wider">
                      Placement Matches
                    </Badge>
                    <h2 className="text-3xl font-black text-white">Unranked</h2>
                    <div className="space-y-2 max-w-xs">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Progress</span>
                        <span className="text-white font-bold">{placementsDone}/5</span>
                      </div>
                      <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${placementsDone * 20}%` }}
                          transition={{ duration: 0.8 }}
                        />
                      </div>
                      <p className="text-slate-500 text-xs">{5 - placementsDone} games until your rank is revealed</p>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-blue-400 text-sm font-bold uppercase tracking-wider">Current Rank</p>
                    <h2 className="text-4xl font-black text-white">{playerState?.division_name}</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-400">
                        {playerState?.rp}
                      </span>
                      <span className="text-slate-400 text-sm font-bold uppercase tracking-wider">RP</span>
                    </div>
                  </>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                  <p className="text-2xl font-black text-white">{playerState?.games_played || 0}</p>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Played</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                  <p className="text-2xl font-black text-emerald-400">{playerState?.wins || 0}</p>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Wins</p>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-4 border border-white/5">
                  <p className="text-2xl font-black text-white">{winRate}%</p>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Win Rate</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Find Match Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <AnimatePresence mode="wait">
            {!isSearching ? (
              <motion.div key="find" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Button
                  onClick={findMatch}
                  disabled={!userId}
                  className="w-full h-20 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 hover:from-blue-500 hover:via-blue-400 hover:to-blue-500 text-white text-xl font-black rounded-2xl shadow-2xl shadow-blue-500/30 border border-blue-400/30 transition-all hover:shadow-blue-500/50 hover:scale-[1.01]"
                >
                  <Swords className="w-7 h-7 mr-3" />
                  FIND MATCH
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="searching"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-blue-500/30 p-8"
              >
                {/* Animated border pulse */}
                <div className="absolute inset-0 rounded-2xl border-2 border-blue-500/20 animate-pulse" />
                
                <div className="relative flex flex-col items-center gap-5">
                  {/* Spinning ring */}
                  <div className="relative w-20 h-20">
                    <motion.div
                      className="absolute inset-0 rounded-full border-4 border-blue-500/20"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-400"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Swords className="w-8 h-8 text-blue-400" />
                    </div>
                  </div>

                  <div className="text-center">
                    <h3 className="text-xl font-black text-white">Searching for opponent...</h3>
                    <div className="flex items-center justify-center gap-2 mt-2 text-blue-400">
                      <Clock className="w-4 h-4" />
                      <span className="text-lg font-mono font-bold">{formatTime(searchTime)}</span>
                    </div>
                    <p className="text-slate-500 text-sm mt-2">Finding a player near your skill level</p>
                  </div>

                  <Button
                    onClick={cancelSearch}
                    variant="outline"
                    className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 px-8"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Info Cards */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="bg-slate-800/30 border-white/5 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Target className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-white font-bold">501 Double Out</h3>
            </div>
            <p className="text-slate-400 text-sm">Every ranked match is 501 Best of 5 legs with double out finish. Pure skill.</p>
          </Card>

          <Card className="bg-slate-800/30 border-white/5 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-white font-bold">ELO Rating</h3>
            </div>
            <p className="text-slate-400 text-sm">Win to gain RP, lose to drop. Climb through Bronze, Silver, Gold, Platinum, Champion and Grand Champion.</p>
          </Card>

          <Card className="bg-slate-800/30 border-white/5 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Crown className="w-5 h-5 text-amber-400" />
              </div>
              <h3 className="text-white font-bold">Placements</h3>
            </div>
            <p className="text-slate-400 text-sm">Play 5 placement matches to calibrate your rank. Your hidden MMR determines your starting division.</p>
          </Card>
        </div>

        {/* View Divisions Link */}
        <Link href="/app/ranked-divisions">
          <div className="flex items-center justify-center gap-2 text-blue-400 hover:text-blue-300 transition-colors cursor-pointer py-4">
            <Trophy className="w-5 h-5" />
            <span className="font-semibold">View All Divisions & Rankings</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </Link>
      </div>
    </div>
  );
}
