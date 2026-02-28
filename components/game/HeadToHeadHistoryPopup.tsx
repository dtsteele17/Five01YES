'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Target, TrendingUp, History, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

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
  player1OverallAvg: number;
  player2OverallAvg: number;
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
    if (isOpen) fetchHeadToHeadHistory();
  }, [isOpen]);

  const fetchHeadToHeadHistory = async () => {
    setLoading(true);
    try {
      const { data: matches, error } = await supabase
        .from('match_rooms')
        .select('id, winner_id, player1_id, player2_id, player1_legs, player2_legs, game_mode, created_at')
        .or(`and(player1_id.eq.${player1.id},player2_id.eq.${player2.id}),and(player1_id.eq.${player2.id},player2_id.eq.${player1.id})`)
        .eq('status', 'finished')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      const { data: matchHistory } = await supabase
        .from('match_history')
        .select('room_id, user_id, three_dart_avg, result')
        .in('room_id', matches?.map(m => m.id) || []);

      const processedMatches = matches?.map(match => {
        const p1History = matchHistory?.find(h => h.room_id === match.id && h.user_id === player1.id);
        const p2History = matchHistory?.find(h => h.room_id === match.id && h.user_id === player2.id);
        return {
          ...match,
          player1_avg: p1History?.three_dart_avg || 0,
          player2_avg: p2History?.three_dart_avg || 0,
        };
      }) || [];

      const totalMatches = processedMatches.length;
      const player1Wins = processedMatches.filter(m => m.winner_id === player1.id).length;
      const player2Wins = processedMatches.filter(m => m.winner_id === player2.id).length;

      // Calculate overall averages across all h2h matches
      const p1Avgs = processedMatches.filter(m => (m.player1_avg || 0) > 0 && m.player1_id === player1.id || (m.player2_avg || 0) > 0 && m.player2_id === player1.id);
      const p2Avgs = processedMatches.filter(m => (m.player1_avg || 0) > 0 && m.player1_id === player2.id || (m.player2_avg || 0) > 0 && m.player2_id === player2.id);
      
      let p1Total = 0, p1Count = 0, p2Total = 0, p2Count = 0;
      processedMatches.forEach(m => {
        const p1a = m.player1_id === player1.id ? m.player1_avg : m.player2_avg;
        const p2a = m.player1_id === player2.id ? m.player1_avg : m.player2_avg;
        if (p1a && p1a > 0) { p1Total += p1a; p1Count++; }
        if (p2a && p2a > 0) { p2Total += p2a; p2Count++; }
      });

      setStats({
        totalMatches,
        player1Wins,
        player2Wins,
        draws: processedMatches.filter(m => !m.winner_id).length,
        lastMatch: processedMatches[0] || null,
        recentMatches: processedMatches.slice(0, 5),
        player1OverallAvg: p1Count > 0 ? p1Total / p1Count : 0,
        player2OverallAvg: p2Count > 0 ? p2Total / p2Count : 0,
      });
    } catch (err) {
      console.error('Error fetching head-to-head:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  };

  const getMatchScore = (match: MatchHistory) => {
    const p1Legs = match.player1_id === player1.id ? match.player1_legs : match.player2_legs;
    const p2Legs = match.player1_id === player1.id ? match.player2_legs : match.player1_legs;
    return { p1: p1Legs, p2: p2Legs };
  };

  const getPlayerAvg = (match: MatchHistory, playerId: string) => {
    if (match.player1_id === playerId) return match.player1_avg || 0;
    return match.player2_avg || 0;
  };

  const p1Leading = (stats?.player1Wins || 0) > (stats?.player2Wins || 0);
  const p2Leading = (stats?.player2Wins || 0) > (stats?.player1Wins || 0);

  return (
    <Dialog open={isOpen} modal>
      <DialogContent 
        className="bg-slate-900 border-slate-700 text-white w-full max-w-lg p-0 overflow-hidden"
        style={{ maxHeight: '85vh' }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Compact Header */}
        <div className="bg-gradient-to-r from-amber-600/20 via-yellow-500/20 to-amber-600/20 border-b border-amber-500/30 px-5 py-3">
          <div className="flex items-center justify-center gap-3">
            <Swords className="w-6 h-6 text-amber-400" />
            <DialogTitle className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300">
              Head-to-Head
            </DialogTitle>
          </div>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-amber-400 border-t-transparent rounded-full" />
          </div>
        ) : stats ? (
          <div className="px-5 py-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 60px)' }}>
            {/* Players + Record */}
            <div className="flex items-center justify-between">
              {/* Player 1 */}
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-16 h-16 rounded-full overflow-hidden border-2 ${p1Leading ? 'border-emerald-400 shadow-lg shadow-emerald-500/20' : 'border-slate-600'}`}>
                  {player1.avatar_url ? (
                    <img src={player1.avatar_url} alt={player1.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-black text-xl">
                      {player1.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <p className="font-bold text-white text-sm truncate max-w-[100px]">{player1.username}</p>
                <p className="text-xs text-slate-400">
                  Avg: <span className="text-amber-400 font-bold">{stats.player1OverallAvg.toFixed(1)}</span>
                </p>
              </div>

              {/* Record */}
              <div className="text-center px-4">
                <div className="text-3xl font-black">
                  <span className={p1Leading ? 'text-emerald-400' : 'text-white'}>{stats.player1Wins}</span>
                  <span className="text-slate-500 mx-1">-</span>
                  <span className={p2Leading ? 'text-emerald-400' : 'text-white'}>{stats.player2Wins}</span>
                </div>
                <p className="text-slate-500 text-xs">{stats.totalMatches} games</p>
              </div>

              {/* Player 2 */}
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-16 h-16 rounded-full overflow-hidden border-2 ${p2Leading ? 'border-emerald-400 shadow-lg shadow-emerald-500/20' : 'border-slate-600'}`}>
                  {player2.avatar_url ? (
                    <img src={player2.avatar_url} alt={player2.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white font-black text-xl">
                      {player2.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <p className="font-bold text-white text-sm truncate max-w-[100px]">{player2.username}</p>
                <p className="text-xs text-slate-400">
                  Avg: <span className="text-amber-400 font-bold">{stats.player2OverallAvg.toFixed(1)}</span>
                </p>
              </div>
            </div>

            {/* Last Match Result - compact */}
            {stats.lastMatch && (() => {
              const score = getMatchScore(stats.lastMatch);
              const p1Won = stats.lastMatch.winner_id === player1.id;
              const winnerName = p1Won ? player1.username : player2.username;
              return (
                <div className="bg-gradient-to-r from-slate-800/80 to-slate-800/40 rounded-xl p-3 border border-slate-700/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Trophy className={`w-4 h-4 ${p1Won ? 'text-emerald-400' : 'text-orange-400'}`} />
                      <span className="text-white text-sm font-semibold">{winnerName} won</span>
                      <span className="text-slate-400 text-sm">{score.p1}-{score.p2}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-slate-400">{getPlayerAvg(stats.lastMatch, player1.id).toFixed(1)}</span>
                      <span className="text-slate-600">vs</span>
                      <span className="text-slate-400">{getPlayerAvg(stats.lastMatch, player2.id).toFixed(1)}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Recent Matches - visual timeline style */}
            {stats.recentMatches.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                  <h3 className="font-bold text-white text-sm">Recent Form</h3>
                </div>
                <div className="space-y-1.5">
                  {stats.recentMatches.map((match, index) => {
                    const score = getMatchScore(match);
                    const p1Won = match.winner_id === player1.id;
                    const p1Avg = getPlayerAvg(match, player1.id);
                    const p2Avg = getPlayerAvg(match, player2.id);
                    
                    return (
                      <div 
                        key={match.id}
                        className={`flex items-center rounded-lg px-3 py-2 text-sm border ${
                          p1Won 
                            ? 'bg-emerald-500/5 border-emerald-500/20' 
                            : 'bg-orange-500/5 border-orange-500/20'
                        }`}
                      >
                        {/* P1 avg */}
                        <div className="w-12 text-right">
                          <span className={`font-mono font-bold text-xs ${p1Avg > p2Avg ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {p1Avg > 0 ? p1Avg.toFixed(1) : '—'}
                          </span>
                        </div>

                        {/* Score bar */}
                        <div className="flex-1 flex items-center justify-center gap-2 px-3">
                          <span className={`font-black text-base ${p1Won ? 'text-emerald-400' : 'text-slate-500'}`}>{score.p1}</span>
                          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden flex">
                            <div 
                              className={`h-full rounded-l-full ${p1Won ? 'bg-emerald-500' : 'bg-slate-600'}`}
                              style={{ width: `${(score.p1 / Math.max(score.p1 + score.p2, 1)) * 100}%` }}
                            />
                            <div 
                              className={`h-full rounded-r-full ${!p1Won ? 'bg-orange-500' : 'bg-slate-600'}`}
                              style={{ width: `${(score.p2 / Math.max(score.p1 + score.p2, 1)) * 100}%` }}
                            />
                          </div>
                          <span className={`font-black text-base ${!p1Won ? 'text-orange-400' : 'text-slate-500'}`}>{score.p2}</span>
                        </div>

                        {/* P2 avg */}
                        <div className="w-12">
                          <span className={`font-mono font-bold text-xs ${p2Avg > p1Avg ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {p2Avg > 0 ? p2Avg.toFixed(1) : '—'}
                          </span>
                        </div>

                        {/* Date */}
                        <span className="text-slate-600 text-xs w-14 text-right ml-1">{formatDate(match.created_at)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Rematch Button */}
            <Button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white py-5 h-auto text-lg font-black shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all hover:scale-[1.02]"
            >
              <Swords className="w-5 h-5 mr-2" />
              {isRematch ? 'Start Rematch!' : 'Start Match!'}
            </Button>
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-slate-400 mb-4">No previous matches found</p>
            <Button
              onClick={onClose}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 text-white py-5 h-auto text-lg font-black"
            >
              {isRematch ? 'Start Rematch!' : 'Start Match!'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
