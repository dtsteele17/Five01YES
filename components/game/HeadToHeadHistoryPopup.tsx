'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Target, TrendingUp, History, User, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { getRankImageUrl } from '@/lib/rank-badge-helpers';

interface MatchHistory {
  id: string;
  winner_id: string;
  player1_id: string;
  player2_id: string;
  player1_legs: number;
  player2_legs: number;
  game_mode: number;
  created_at: string;
  player1_avg?: number;
  player2_avg?: number;
}

interface HeadToHeadStats {
  totalMatches: number;
  player1Wins: number;
  player2Wins: number;
  draws: number;
  lastMatch: MatchHistory | null;
  recentMatches: MatchHistory[];
}

interface Player {
  id: string;
  username: string;
  avatar_url?: string;
  division_name?: string;
}

interface HeadToHeadHistoryPopupProps {
  isOpen: boolean;
  onClose: () => void;
  player1: Player;
  player2: Player;
  currentUserId: string;
  isRematch: boolean;
  originalRoomId?: string;
}

export function HeadToHeadHistoryPopup({
  isOpen,
  onClose,
  player1,
  player2,
  currentUserId,
  isRematch,
  originalRoomId,
}: HeadToHeadHistoryPopupProps) {
  const supabase = createClient();
  const [stats, setStats] = useState<HeadToHeadStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchHeadToHeadHistory();
    }
  }, [isOpen]);

  const fetchHeadToHeadHistory = async () => {
    setLoading(true);
    try {
      // Get all matches between these two players
      const { data: matches, error } = await supabase
        .from('match_rooms')
        .select(`
          id,
          winner_id,
          player1_id,
          player2_id,
          player1_legs,
          player2_legs,
          game_mode,
          created_at
        `)
        .or(`and(player1_id.eq.${player1.id},player2_id.eq.${player2.id}),and(player1_id.eq.${player2.id},player2_id.eq.${player1.id})`)
        .eq('status', 'finished')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Get match history records for averages
      const { data: matchHistory } = await supabase
        .from('match_history')
        .select('room_id, user_id, three_dart_avg, result')
        .in('room_id', matches?.map(m => m.id) || []);

      // Process matches with averages
      const processedMatches = matches?.map(match => {
        const p1History = matchHistory?.find(h => h.room_id === match.id && h.user_id === player1.id);
        const p2History = matchHistory?.find(h => h.room_id === match.id && h.user_id === player2.id);
        
        return {
          ...match,
          player1_avg: p1History?.three_dart_avg || 0,
          player2_avg: p2History?.three_dart_avg || 0,
        };
      }) || [];

      // Calculate stats
      const totalMatches = processedMatches.length;
      const player1Wins = processedMatches.filter(m => m.winner_id === player1.id).length;
      const player2Wins = processedMatches.filter(m => m.winner_id === player2.id).length;
      const draws = processedMatches.filter(m => !m.winner_id).length;

      setStats({
        totalMatches,
        player1Wins,
        player2Wins,
        draws,
        lastMatch: processedMatches[0] || null,
        recentMatches: processedMatches.slice(0, 5),
      });
    } catch (err) {
      console.error('Error fetching head-to-head:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getWinnerName = (match: MatchHistory) => {
    if (!match.winner_id) return 'Draw';
    return match.winner_id === player1.id ? player1.username : player2.username;
  };

  const getMatchScore = (match: MatchHistory) => {
    const p1Legs = match.player1_id === player1.id ? match.player1_legs : match.player2_legs;
    const p2Legs = match.player1_id === player1.id ? match.player2_legs : match.player1_legs;
    return `${p1Legs}-${p2Legs}`;
  };

  const getPlayerAvg = (match: MatchHistory, playerId: string) => {
    if (match.player1_id === playerId) return match.player1_avg || 0;
    return match.player2_avg || 0;
  };

  return (
    <Dialog open={isOpen} modal>
      <DialogContent 
        className="bg-slate-900 border-slate-700 text-white w-full max-w-4xl p-0 overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-r from-amber-600/20 via-yellow-500/20 to-amber-600/20 border-b border-amber-500/30 p-6">
          <div className="flex items-center justify-center gap-4">
            <Swords className="w-8 h-8 text-amber-400" />
            <div>
              <DialogTitle className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300">
                Head-to-Head History
              </DialogTitle>
              <p className="text-slate-400 text-sm text-center mt-1">
                {isRematch ? 'Rematch Time!' : 'Match Preview'}
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-12 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full" />
          </div>
        ) : stats ? (
          <div className="p-6 space-y-6">
            {/* Players Header */}
            <div className="flex items-center justify-center gap-8">
              {/* Player 1 */}
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-amber-500/30 flex items-center justify-center mb-2">
                  <User className="w-10 h-10 text-slate-400" />
                </div>
                <p className="font-bold text-white">{player1.username}</p>
                {player1.division_name && (
                  <img 
                    src={getRankImageUrl(player1.division_name)} 
                    alt={player1.division_name}
                    className="w-8 h-8 mx-auto mt-1"
                  />
                )}
              </div>

              {/* VS / Record */}
              <div className="text-center px-8">
                <div className="text-4xl font-black text-amber-400 mb-2">
                  {stats.player1Wins} - {stats.player2Wins}
                </div>
                <p className="text-slate-400 text-sm">{stats.totalMatches} Games Played</p>
                {stats.draws > 0 && (
                  <p className="text-slate-500 text-xs">({stats.draws} draws)</p>
                )}
              </div>

              {/* Player 2 */}
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-amber-500/30 flex items-center justify-center mb-2">
                  <User className="w-10 h-10 text-slate-400" />
                </div>
                <p className="font-bold text-white">{player2.username}</p>
                {player2.division_name && (
                  <img 
                    src={getRankImageUrl(player2.division_name)} 
                    alt={player2.division_name}
                    className="w-8 h-8 mx-auto mt-1"
                  />
                )}
              </div>
            </div>

            {/* Last Match Result */}
            {stats.lastMatch && (
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <History className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-white">Last Match Result</h3>
                </div>
                <div className="flex items-center justify-between bg-slate-900/50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Trophy className={`w-6 h-6 ${stats.lastMatch.winner_id === player1.id ? 'text-emerald-400' : 'text-slate-600'}`} />
                    <div>
                      <p className="text-white font-bold">
                        {getWinnerName(stats.lastMatch)} won {getMatchScore(stats.lastMatch)}
                      </p>
                      <p className="text-slate-400 text-sm">
                        {stats.lastMatch.game_mode} • {formatDate(stats.lastMatch.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-slate-400">{player1.username}: <span className="text-amber-400">{getPlayerAvg(stats.lastMatch, player1.id).toFixed(1)}</span></p>
                    <p className="text-slate-400">{player2.username}: <span className="text-amber-400">{getPlayerAvg(stats.lastMatch, player2.id).toFixed(1)}</span></p>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Matches Table */}
            {stats.recentMatches.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-white">Last 5 Matches</h3>
                </div>
                <div className="space-y-2">
                  {stats.recentMatches.map((match, index) => (
                    <div 
                      key={match.id}
                      className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500 w-6">#{index + 1}</span>
                        <span className={match.winner_id === player1.id ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                          {match.winner_id === player1.id ? player1.username : player2.username} W
                        </span>
                        <span className="text-slate-400">{getMatchScore(match)}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1">
                          <Target className="w-3 h-3 text-amber-400" />
                          <span className="text-slate-300">{getPlayerAvg(match, player1.id).toFixed(1)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Target className="w-3 h-3 text-amber-400" />
                          <span className="text-slate-300">{getPlayerAvg(match, player2.id).toFixed(1)}</span>
                        </div>
                        <span className="text-slate-500">{formatDate(match.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Button */}
            <div className="pt-4">
              <Button
                onClick={onClose}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white py-4 h-auto text-lg font-bold"
              >
                {isRematch ? 'Start Rematch!' : 'Start Match!'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-400">
            No previous matches found between these players.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
