'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Trophy, Calendar, Target, TrendingUp, User, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { MatchStatsModal } from '@/components/app/MatchStatsModal';

interface MatchHistoryItem {
  id: string;
  room_id: string;
  opponent_id: string;
  opponent_username?: string;
  opponent_avatar_url?: string | null;
  game_mode: number;
  match_format: string;
  result: 'win' | 'loss' | 'draw';
  legs_won: number;
  legs_lost: number;
  three_dart_avg: number;
  first9_avg: number;
  highest_checkout: number;
  checkout_percentage: number;
  darts_thrown: number;
  total_score: number;
  visits_100_plus: number;
  visits_140_plus: number;
  visits_180: number;
  played_at: string;
}

interface MatchHistoryListProps {
  userId?: string;
  limit?: number;
  gameMode?: number | null;  // Filter by game mode (301, 501)
  matchType?: string | null; // Filter by match type
}

export function MatchHistoryList({ userId, limit = 20, gameMode = null, matchType = null }: MatchHistoryListProps) {
  const [matches, setMatches] = useState<MatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<MatchHistoryItem | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadMatchHistory() {
      try {
        setLoading(true);
        
        let targetUserId = userId;
        if (!targetUserId) {
          const { data: { user } } = await supabase.auth.getUser();
          targetUserId = user?.id;
        }

        if (!targetUserId) return;

        // Build query with filters
        let query = supabase
          .from('match_history')
          .select(`
            *,
            opponent:opponent_id (username)
          `)
          .eq('user_id', targetUserId)
          .order('played_at', { ascending: false });

        // Apply game mode filter
        if (gameMode !== null) {
          query = query.eq('game_mode', gameMode);
        }

        // Apply match type filter
        if (matchType !== null) {
          query = query.eq('match_format', matchType);
        }

        // Apply limit
        query = query.limit(limit);

        const { data: historyData, error } = await query;

        if (error) throw error;

        // Transform data to include opponent username and avatar
        const transformedData = (historyData || []).map((match: any) => ({
          ...match,
          opponent_username: match.opponent?.username || 'Unknown',
          opponent_avatar_url: match.opponent?.avatar_url || null
        }));

        setMatches(transformedData);
      } catch (error) {
        console.error('Error loading match history:', error);
      } finally {
        setLoading(false);
      }
    }

    loadMatchHistory();
  }, [userId, limit, gameMode, matchType]);

  if (loading) {
    return (
      <Card className="bg-slate-900/50 border-slate-700 p-6">
        <div className="text-center text-slate-400">Loading match history...</div>
      </Card>
    );
  }

  if (matches.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-700 p-8">
        <div className="text-center">
          <Trophy className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No matches found for selected filters</p>
          <p className="text-slate-500 text-sm mt-1">Try changing your filter options</p>
        </div>
      </Card>
    );
  }

  const getResultColor = (result: string) => {
    switch (result) {
      case 'win': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
      case 'loss': return 'text-red-400 bg-red-400/10 border-red-400/30';
      case 'draw': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
      default: return 'text-slate-400 bg-slate-400/10 border-slate-400/30';
    }
  };

  const getResultLabel = (result: string) => {
    switch (result) {
      case 'win': return 'W';
      case 'loss': return 'L';
      case 'draw': return 'D';
      default: return '-';
    }
  };

  return (
    <>
    <div className="space-y-3">
      {matches.map((match) => (
        <Card 
          key={match.id} 
          onClick={() => setSelectedMatch(match)}
          className="bg-slate-900/50 border-slate-700 p-4 hover:bg-slate-800/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-4">
            {/* Result Badge */}
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center border-2 font-bold text-xl ${getResultColor(match.result)}`}>
              {getResultLabel(match.result)}
            </div>

            {/* Match Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-white truncate">
                  vs {match.opponent_username}
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400 text-sm">{match.game_mode}</span>
                <span className="text-slate-500">•</span>
                <span className="text-slate-400 text-sm capitalize">{match.match_format || 'Quick'}</span>
              </div>
              
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {format(new Date(match.played_at), 'MMM d, yyyy')}
                </span>
                <span className="flex items-center gap-1">
                  <Trophy className="w-3 h-3" />
                  {match.legs_won}-{match.legs_lost}
                </span>
              </div>
            </div>

            {/* Stats Summary */}
            <div className="hidden sm:grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="flex items-center justify-center gap-1 text-slate-500 text-xs mb-1">
                  <TrendingUp className="w-3 h-3" />
                  Avg
                </div>
                <div className="font-bold text-white">{match.three_dart_avg?.toFixed(1) || '-'}</div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 text-slate-500 text-xs mb-1">
                  <Target className="w-3 h-3" />
                  Co
                </div>
                <div className="font-bold text-white">{match.highest_checkout || '-'}</div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 text-slate-500 text-xs mb-1">
                  <span className="text-xs">180s</span>
                </div>
                <div className="font-bold text-white">{match.visits_180 || '0'}</div>
              </div>
            </div>
          </div>

          {/* Mobile Stats */}
          <div className="sm:hidden mt-3 pt-3 border-t border-slate-800 flex justify-between text-sm">
            <span className="text-slate-500">
              Avg: <span className="text-white font-bold">{match.three_dart_avg?.toFixed(1) || '-'}</span>
            </span>
            <span className="text-slate-500">
              Checkout: <span className="text-white font-bold">{match.highest_checkout || '-'}</span>
            </span>
            <span className="text-slate-500">
              180s: <span className="text-white font-bold">{match.visits_180 || '0'}</span>
            </span>
          </div>
        </Card>
      ))}
    </div>

    {/* Match Stats Modal */}
    <MatchStatsModal
      isOpen={!!selectedMatch}
      onClose={() => setSelectedMatch(null)}
      matchId={selectedMatch?.room_id || ''}
    />
    </>
  );
}
