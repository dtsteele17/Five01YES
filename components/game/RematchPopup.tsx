'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  Trophy, RotateCcw, Loader2, Check, History, User, ArrowRight, 
  Target, TrendingUp, Zap, Award, ChevronDown, Crown, Swords,
  BarChart3, Flame, Star
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { CoinTossModal } from './CoinTossModal';
import { Badge } from '@/components/ui/badge';

interface MatchRecord {
  id: string;
  room_id?: string;
  winner_id: string;
  user_id: string;
  opponent_id: string;
  played_at: string;
  game_mode: number;
  result: 'win' | 'loss' | 'draw';
  legs_won: number;
  legs_lost: number;
  // User stats (from the perspective of the user_id)
  three_dart_avg: number;
  first9_avg: number;
  highest_checkout: number;
  checkout_percentage: number;
  visits_100_plus: number;
  visits_140_plus: number;
  visits_180: number;
  // Opponent stats (saved during match completion)
  opponent_three_dart_avg: number;
  opponent_first9_avg: number;
  opponent_highest_checkout: number;
  opponent_checkout_percentage: number;
  opponent_visits_100_plus: number;
  opponent_visits_140_plus: number;
  opponent_visits_180: number;
}

interface MatchHistory {
  totalMatches: number;
  player1Wins: number;
  player2Wins: number;
  draws: number;
  lastMatch: MatchRecord | null;
  previousMatches: MatchRecord[];
  // Aggregated stats (calculated across all matches)
  player1Avg3Dart: number;
  player2Avg3Dart: number;
  player1AvgFirst9: number;
  player2AvgFirst9: number;
  player1HighestCheckout: number;
  player2HighestCheckout: number;
  player1Total180s: number;
  player2Total180s: number;
}

interface RematchPopupProps {
  isOpen: boolean;
  onClose: () => void;
  player1: { id: string; name: string };
  player2: { id: string; name: string };
  currentUserId: string;
  readyCount: number;
  iAmReady: boolean;
  opponentReady: boolean;
  onRequestRematch: () => void;
  onCancelRematch: () => void;
  isLoading: boolean;
}

export function RematchPopup({
  isOpen,
  onClose,
  player1,
  player2,
  currentUserId,
  readyCount,
  iAmReady,
  opponentReady,
  onRequestRematch,
  onCancelRematch,
  isLoading,
}: RematchPopupProps) {
  const [matchHistory, setMatchHistory] = useState<MatchHistory | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showCoinToss, setShowCoinToss] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
  const scrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const isPlayer1 = currentUserId === player1.id;
  const opponentName = isPlayer1 ? player2.name : player1.name;
  const myName = isPlayer1 ? player1.name : player2.name;

  // Fetch match history between these two players
  useEffect(() => {
    if (!isOpen || !player1.id || !player2.id) return;

    const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
        // Get all matches between these two players
        // We need both perspectives to get accurate stats for both players
        const { data: matches, error } = await supabase
          .from('match_history')
          .select(`
            id, room_id, user_id, opponent_id, played_at, game_mode, result,
            legs_won, legs_lost, winner_id,
            three_dart_avg, first9_avg, highest_checkout, checkout_percentage,
            visits_100_plus, visits_140_plus, visits_180,
            opponent_three_dart_avg, opponent_first9_avg, opponent_highest_checkout,
            opponent_checkout_percentage, opponent_visits_100_plus, 
            opponent_visits_140_plus, opponent_visits_180
          `)
          .or(
            `and(user_id.eq.${player1.id},opponent_id.eq.${player2.id}),and(user_id.eq.${player2.id},opponent_id.eq.${player1.id})`
          )
          .order('played_at', { ascending: false })
          .limit(50);

        if (error) throw error;

        if (matches && matches.length > 0) {
          // Each match has 2 records (one from each player's perspective)
          // We normalize them so player1 is always the reference point
          const processedMatches: MatchRecord[] = matches.map((m: any) => {
            // If this record is from player2's perspective, swap everything
            if (m.user_id === player2.id) {
              return {
                ...m,
                user_id: player1.id,  // Normalize to player1
                opponent_id: player2.id,
                winner_id: m.result === 'win' ? player2.id : player1.id,
                // Swap player and opponent stats
                three_dart_avg: m.opponent_three_dart_avg || 0,
                first9_avg: m.opponent_first9_avg || 0,
                highest_checkout: m.opponent_highest_checkout || 0,
                checkout_percentage: m.opponent_checkout_percentage || 0,
                visits_100_plus: m.opponent_visits_100_plus || 0,
                visits_140_plus: m.opponent_visits_140_plus || 0,
                visits_180: m.opponent_visits_180 || 0,
                opponent_three_dart_avg: m.three_dart_avg || 0,
                opponent_first9_avg: m.first9_avg || 0,
                opponent_highest_checkout: m.highest_checkout || 0,
                opponent_checkout_percentage: m.checkout_percentage || 0,
                opponent_visits_100_plus: m.visits_100_plus || 0,
                opponent_visits_140_plus: m.visits_140_plus || 0,
                opponent_visits_180: m.visits_180 || 0,
              };
            }
            // Already from player1's perspective, just return with winner_id calculated
            return {
              ...m,
              winner_id: m.result === 'win' ? player1.id : player2.id,
            };
          });

          // Remove duplicates (same room_id from both perspectives) - keep player1's perspective
          const uniqueMatches = processedMatches.filter((m, index, self) => 
            index === self.findIndex((t) => t.room_id === m.room_id)
          );

          const player1Wins = uniqueMatches.filter(m => m.winner_id === player1.id).length;
          const player2Wins = uniqueMatches.filter(m => m.winner_id === player2.id).length;
          const draws = uniqueMatches.filter(m => !m.winner_id).length;

          // Calculate averages from last 10 matches
          const recentMatches = uniqueMatches.slice(0, 10);
          const player1Avg3Dart = recentMatches.reduce((sum, m) => sum + (m.three_dart_avg || 0), 0) / (recentMatches.length || 1);
          const player2Avg3Dart = recentMatches.reduce((sum, m) => sum + (m.opponent_three_dart_avg || 0), 0) / (recentMatches.length || 1);
          const player1AvgFirst9 = recentMatches.reduce((sum, m) => sum + (m.first9_avg || 0), 0) / (recentMatches.length || 1);
          const player2AvgFirst9 = recentMatches.reduce((sum, m) => sum + (m.opponent_first9_avg || 0), 0) / (recentMatches.length || 1);

          setMatchHistory({
            totalMatches: uniqueMatches.length,
            player1Wins,
            player2Wins,
            draws,
            lastMatch: uniqueMatches[0] || null,
            previousMatches: uniqueMatches.slice(1, 6), // Next 5 matches after the most recent
            player1Avg3Dart,
            player2Avg3Dart,
            player1AvgFirst9,
            player2AvgFirst9,
            player1HighestCheckout: Math.max(...uniqueMatches.map(m => m.highest_checkout || 0), 0),
            player2HighestCheckout: Math.max(...uniqueMatches.map(m => m.opponent_highest_checkout || 0), 0),
            player1Total180s: uniqueMatches.reduce((sum, m) => sum + (m.visits_180 || 0), 0),
            player2Total180s: uniqueMatches.reduce((sum, m) => sum + (m.opponent_visits_180 || 0), 0),
          });
        } else {
          setMatchHistory(null);
        }
      } catch (err) {
        console.error('Error fetching match history:', err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [isOpen, player1.id, player2.id, supabase]);

  // Auto-scroll animation for match history
  useEffect(() => {
    if (!isOpen || !matchHistory?.previousMatches.length || activeTab !== 'history') return;
    
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let scrollPos = 0;
    const scrollSpeed = 0.5;
    let animationId: number;

    const animate = () => {
      if (!scrollContainer) return;
      scrollPos += scrollSpeed;
      
      // Reset when we've scrolled past all content
      if (scrollPos >= scrollContainer.scrollHeight - scrollContainer.clientHeight) {
        scrollPos = 0;
      }
      
      scrollContainer.scrollTop = scrollPos;
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationId);
  }, [isOpen, matchHistory, activeTab]);

  // Show coin toss when both ready
  useEffect(() => {
    if (readyCount === 2 && !showCoinToss) {
      setShowCoinToss(true);
    }
  }, [readyCount, showCoinToss]);

  const getRematchButtonText = () => {
    if (isLoading) return 'Processing...';
    if (readyCount === 2) return 'Starting...';
    if (iAmReady) return `Rematch ${readyCount}/2 - Waiting...`;
    if (opponentReady) return `Join Rematch (${readyCount}/2)`;
    return `Rematch (0/2)`;
  };

  const getRematchButtonIcon = () => {
    if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" />;
    if (readyCount === 2) return <Check className="w-4 h-4" />;
    if (iAmReady) return <Loader2 className="w-4 h-4 animate-spin" />;
    return <RotateCcw className="w-4 h-4" />;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getWinStreak = () => {
    if (!matchHistory) return { player1: 0, player2: 0 };
    let p1Streak = 0;
    let p2Streak = 0;
    
    for (const match of [matchHistory.lastMatch, ...matchHistory.previousMatches].filter(Boolean) as MatchRecord[]) {
      if (match.winner_id === player1.id) {
        p1Streak++;
        p2Streak = 0;
      } else if (match.winner_id === player2.id) {
        p2Streak++;
        p1Streak = 0;
      }
    }
    
    return { player1: p1Streak, player2: p2Streak };
  };

  const streak = getWinStreak();

  return (
    <>
      <Dialog open={isOpen && !showCoinToss} onOpenChange={onClose}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-xl">
              <div className="flex items-center gap-2">
                <Swords className="w-5 h-5 text-amber-400" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300">
                  Rematch
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Players Header */}
            <div className="flex items-center justify-center gap-6 py-2">
              {/* Player 1 */}
              <div className="text-center">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl mx-auto mb-2 ring-2 ring-blue-400/50">
                    {player1.name.charAt(0).toUpperCase()}
                  </div>
                  {streak.player1 > 1 && (
                    <div className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                      <Flame className="w-3 h-3" />
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium text-slate-200">{player1.name}</span>
                {streak.player1 > 1 && (
                  <div className="text-xs text-amber-400 font-medium">{streak.player1} win streak!</div>
                )}
              </div>

              {/* VS / Score */}
              <div className="text-center px-4">
                {matchHistory ? (
                  <div className="bg-slate-800 rounded-xl px-4 py-2 border border-slate-700">
                    <div className="text-3xl font-black text-white">
                      {matchHistory.player1Wins} - {matchHistory.player2Wins}
                    </div>
                    <div className="text-xs text-slate-400">All Time</div>
                  </div>
                ) : (
                  <div className="text-2xl font-bold text-slate-500">VS</div>
                )}
              </div>

              {/* Player 2 */}
              <div className="text-center">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-bold text-xl mx-auto mb-2 ring-2 ring-orange-400/50">
                    {player2.name.charAt(0).toUpperCase()}
                  </div>
                  {streak.player2 > 1 && (
                    <div className="absolute -top-1 -right-1 bg-amber-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                      <Flame className="w-3 h-3" />
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium text-slate-200">{player2.name}</span>
                {streak.player2 > 1 && (
                  <div className="text-xs text-amber-400 font-medium">{streak.player2} win streak!</div>
                )}
              </div>
            </div>

            {/* Tab Switcher */}
            {matchHistory && (
              <div className="flex gap-2 justify-center">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'overview'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Last Match
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === 'history'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Match History ({matchHistory.previousMatches.length + 1})
                </button>
              </div>
            )}

            {/* Match History Content */}
            {loadingHistory ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
              </div>
            ) : matchHistory ? (
              <AnimatePresence mode="wait">
                {activeTab === 'overview' ? (
                  <motion.div
                    key="overview"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-4"
                  >
                    {/* Last Match Hero Card */}
                    {matchHistory.lastMatch && (
                      <div className="bg-gradient-to-br from-amber-500/10 via-yellow-500/10 to-amber-500/10 rounded-xl p-4 border border-amber-500/20">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Crown className="w-5 h-5 text-amber-400" />
                            <span className="font-bold text-white">Last Match Result</span>
                          </div>
                          <Badge variant="outline" className="border-amber-500/30 text-amber-400">
                            {matchHistory.lastMatch.game_mode} • {formatDate(matchHistory.lastMatch.played_at)}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-center gap-4 mb-4">
                          <div className="text-center">
                            <div className={`text-3xl font-black ${matchHistory.lastMatch.winner_id === player1.id ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {matchHistory.lastMatch.legs_won}
                            </div>
                            <div className="text-xs text-slate-500">{player1.name}</div>
                          </div>
                          <div className="text-slate-600 font-bold">-</div>
                          <div className="text-center">
                            <div className={`text-3xl font-black ${matchHistory.lastMatch.winner_id === player2.id ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {matchHistory.lastMatch.legs_lost}
                            </div>
                            <div className="text-xs text-slate-500">{player2.name}</div>
                          </div>
                        </div>

                        <div className="bg-slate-900/50 rounded-lg p-3">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <Trophy className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">
                              {matchHistory.lastMatch.winner_id === player1.id ? player1.name : player2.name} Won!
                            </span>
                          </div>
                        </div>

                        {/* Stats Comparison - NOW WITH BOTH PLAYERS' STATS */}
                        <div className="grid grid-cols-2 gap-3 mt-4">
                          {/* Player 1 Stats */}
                          <div className="bg-slate-800/50 rounded-lg p-3 border border-blue-500/20">
                            <div className="text-xs text-blue-400 font-medium mb-2 text-center border-b border-slate-700 pb-2">
                              {player1.name}
                            </div>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <Target className="w-3 h-3" /> 3-Dart Avg
                                </span>
                                <span className="text-white font-medium">{matchHistory.lastMatch.three_dart_avg?.toFixed(1) || '0.0'}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <TrendingUp className="w-3 h-3" /> First 9 Avg
                                </span>
                                <span className="text-white font-medium">{matchHistory.lastMatch.first9_avg?.toFixed(1) || '0.0'}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <Award className="w-3 h-3" /> Best Checkout
                                </span>
                                <span className="text-white font-medium">{matchHistory.lastMatch.highest_checkout || 0}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <Star className="w-3 h-3" /> 100+ Scores
                                </span>
                                <span className="text-amber-400 font-medium">{matchHistory.lastMatch.visits_100_plus || 0}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <Zap className="w-3 h-3" /> 180s
                                </span>
                                <span className="text-emerald-400 font-medium">{matchHistory.lastMatch.visits_180 || 0}</span>
                              </div>
                            </div>
                          </div>

                          {/* Player 2 Stats - NOW PROPERLY SHOWING OPPONENT'S SAVED STATS */}
                          <div className="bg-slate-800/50 rounded-lg p-3 border border-orange-500/20">
                            <div className="text-xs text-orange-400 font-medium mb-2 text-center border-b border-slate-700 pb-2">
                              {player2.name}
                            </div>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <Target className="w-3 h-3" /> 3-Dart Avg
                                </span>
                                <span className="text-white font-medium">{matchHistory.lastMatch.opponent_three_dart_avg?.toFixed(1) || '0.0'}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <TrendingUp className="w-3 h-3" /> First 9 Avg
                                </span>
                                <span className="text-white font-medium">{matchHistory.lastMatch.opponent_first9_avg?.toFixed(1) || '0.0'}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <Award className="w-3 h-3" /> Best Checkout
                                </span>
                                <span className="text-white font-medium">{matchHistory.lastMatch.opponent_highest_checkout || 0}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <Star className="w-3 h-3" /> 100+ Scores
                                </span>
                                <span className="text-amber-400 font-medium">{matchHistory.lastMatch.opponent_visits_100_plus || 0}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-400 flex items-center gap-1">
                                  <Zap className="w-3 h-3" /> 180s
                                </span>
                                <span className="text-emerald-400 font-medium">{matchHistory.lastMatch.opponent_visits_180 || 0}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Career Stats Summary */}
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="w-4 h-4 text-emerald-400" />
                        <span className="font-semibold text-slate-200">Career Head-to-Head</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-slate-900/50 rounded-lg p-2">
                          <div className="text-xl font-bold text-emerald-400">{matchHistory.player1Wins}</div>
                          <div className="text-xs text-slate-400">{player1.name} Wins</div>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-2">
                          <div className="text-xl font-bold text-slate-400">{matchHistory.draws}</div>
                          <div className="text-xs text-slate-400">Draws</div>
                        </div>
                        <div className="bg-slate-900/50 rounded-lg p-2">
                          <div className="text-xl font-bold text-emerald-400">{matchHistory.player2Wins}</div>
                          <div className="text-xs text-slate-400">{player2.name} Wins</div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="history"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                  >
                    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                      <div className="flex items-center gap-2 mb-3">
                        <History className="w-4 h-4 text-amber-400" />
                        <span className="font-semibold text-slate-200">Previous Matches</span>
                        <span className="text-xs text-slate-500 ml-auto">Auto-scrolling</span>
                      </div>
                      
                      <div 
                        ref={scrollRef}
                        className="space-y-2 max-h-64 overflow-hidden"
                      >
                        {[matchHistory.lastMatch, ...matchHistory.previousMatches]
                          .filter(Boolean)
                          .map((match, index) => (
                          <motion.div
                            key={match!.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.1 }}
                            className={`p-3 rounded-lg border ${
                              index === 0 
                                ? 'bg-amber-500/10 border-amber-500/30' 
                                : 'bg-slate-900/50 border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-500 w-6">#{index + 1}</span>
                                <div className={`w-2 h-2 rounded-full ${
                                  match!.winner_id === player1.id ? 'bg-blue-400' : 'bg-orange-400'
                                }`} />
                                <span className={`text-sm font-medium ${
                                  match!.winner_id === player1.id ? 'text-blue-400' : 'text-orange-400'
                                }`}>
                                  {match!.winner_id === player1.id ? player1.name : player2.name} W
                                </span>
                                <span className="text-slate-400 text-sm">
                                  {match!.legs_won}-{match!.legs_lost}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500">
                                {formatDate(match!.played_at)}
                              </span>
                            </div>
                            {/* Show both players' stats for each match */}
                            <div className="grid grid-cols-2 gap-4 mt-2 text-xs pl-11">
                              <div className="text-slate-400">
                                <span className="text-blue-400">{player1.name}:</span>
                                <span className="text-white ml-1">{match!.three_dart_avg?.toFixed(1) || '0.0'}</span> avg
                                <span className="text-slate-500 ml-1">|</span>
                                <span className="text-white ml-1">{match!.highest_checkout || 0}</span> out
                                <span className="text-slate-500 ml-1">|</span>
                                <span className="text-emerald-400 ml-1">{match!.visits_180 || 0}</span> 180s
                              </div>
                              <div className="text-slate-400">
                                <span className="text-orange-400">{player2.name}:</span>
                                <span className="text-white ml-1">{match!.opponent_three_dart_avg?.toFixed(1) || '0.0'}</span> avg
                                <span className="text-slate-500 ml-1">|</span>
                                <span className="text-white ml-1">{match!.opponent_highest_checkout || 0}</span> out
                                <span className="text-slate-500 ml-1">|</span>
                                <span className="text-emerald-400 ml-1">{match!.opponent_visits_180 || 0}</span> 180s
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            ) : (
              <div className="bg-slate-800/50 rounded-xl p-8 border border-slate-700 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
                  <History className="w-8 h-8 text-slate-500" />
                </div>
                <p className="text-slate-400 mb-1">No previous matches found</p>
                <p className="text-slate-500 text-sm">This will be your first encounter!</p>
              </div>
            )}

            {/* Ready Status */}
            <div className="flex justify-center gap-4">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                player1.id === currentUserId 
                  ? (iAmReady ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400')
                  : (opponentReady ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400')
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  player1.id === currentUserId 
                    ? (iAmReady ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600')
                    : (opponentReady ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600')
                }`} />
                <span className="text-sm font-medium">{player1.name}</span>
                {player1.id === currentUserId && iAmReady && <Check className="w-3 h-3" />}
              </div>

              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                player2.id === currentUserId 
                  ? (iAmReady ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400')
                  : (opponentReady ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400')
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  player2.id === currentUserId 
                    ? (iAmReady ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600')
                    : (opponentReady ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600')
                }`} />
                <span className="text-sm font-medium">{player2.name}</span>
                {player2.id === currentUserId && iAmReady && <Check className="w-3 h-3" />}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <motion.div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${(readyCount / 2) * 100}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <span className="text-sm font-bold text-slate-300 min-w-[3rem] text-right">{readyCount}/2</span>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              {iAmReady ? (
                <Button
                  variant="outline"
                  onClick={onCancelRematch}
                  disabled={isLoading || readyCount === 2}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 h-12"
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={isLoading}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 h-12"
                >
                  Close
                </Button>
              )}

              <Button
                onClick={onRequestRematch}
                disabled={isLoading || iAmReady || readyCount === 2}
                className={`flex-1 h-12 font-bold text-lg ${
                  iAmReady 
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : opponentReady
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                    : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white'
                }`}
              >
                {getRematchButtonIcon()}
                <span className="ml-2">{getRematchButtonText()}</span>
              </Button>
            </div>

            {opponentReady && !iAmReady && (
              <motion.p 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center text-sm text-emerald-400 font-medium"
              >
                🔥 {opponentName} wants a rematch! Ready up to play again.
              </motion.p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Coin Toss Modal - shown when both ready */}
      <CoinTossModal
        isOpen={showCoinToss}
        player1Name={player1.name}
        player2Name={player2.name}
        player1Id={player1.id}
        player2Id={player2.id}
        currentUserId={currentUserId}
        onComplete={(winner) => {
          setShowCoinToss(false);
          onClose();
        }}
      />
    </>
  );
}
