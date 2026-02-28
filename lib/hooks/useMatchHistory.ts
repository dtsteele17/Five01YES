'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface MatchHistoryItem {
  id: string;
  room_id: string;
  opponent_id: string;
  opponent_username?: string;
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
  bot_level?: number;
  // Opponent stats (may be null for older matches)
  opponent_three_dart_avg?: number;
  opponent_first9_avg?: number;
  opponent_highest_checkout?: number;
  opponent_checkout_percentage?: number;
  opponent_visits_180?: number;
  opponent_avatar_url?: string | null;
}

interface UseMatchHistoryOptions {
  limit?: number;
  days?: number;
  gameMode?: number | null;
  matchType?: string | null;
  includeOpponentStats?: boolean;
}

export function useMatchHistory(options: UseMatchHistoryOptions = {}) {
  const { limit = 20, days, gameMode = null, matchType = null, includeOpponentStats = true } = options;
  const [matches, setMatches] = useState<MatchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const supabase = createClient();

  const fetchMatches = useCallback(async (offset: number = 0) => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Build query
      let query = supabase
        .from('match_history')
        .select('*')
        .eq('user_id', user.id)
        .in('match_format', ['quick', 'dartbot'])
        .in('game_mode', [301, 501])
        .order('played_at', { ascending: false });

      // Apply days filter
      if (days !== undefined) {
        const since = new Date();
        since.setDate(since.getDate() - days);
        query = query.gte('played_at', since.toISOString());
      }

      // Apply game mode filter
      if (gameMode !== null) {
        query = query.eq('game_mode', gameMode);
      }

      // Apply match type filter
      if (matchType !== null) {
        query = query.eq('match_format', matchType);
      }

      // Apply limit and offset
      query = query.range(offset, offset + limit - 1);

      const { data: historyData, error: fetchError, count } = await query;

      if (fetchError) {
        console.error('[useMatchHistory] Error fetching matches:', fetchError);
        setError(fetchError.message);
        return;
      }

      // Get unique opponent IDs for username lookup (only for first 10 matches)
      let opponentMap: Record<string, { username: string; avatar_url?: string | null }> = {};
      const opponentIds = [...new Set((historyData || [])
        .slice(0, 10) // Only fetch profiles for first 10 matches
        .map(m => m.opponent_id).filter(Boolean))];
      
      if (opponentIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, username, avatar_url')
          .in('user_id', opponentIds);
        
        opponentMap = (profilesData || []).reduce((acc, profile) => {
          acc[profile.user_id] = { username: profile.username, avatar_url: profile.avatar_url };
          return acc;
        }, {} as Record<string, { username: string; avatar_url?: string | null }>);
      }

      // Transform data
      const transformedData: MatchHistoryItem[] = (historyData || []).map((match: any, index: number) => {
        const overallIndex = offset + index; // Overall position in the full list
        const isRecent = overallIndex < 10; // First 10 matches overall have opponent stats
        return {
          id: match.id,
          room_id: match.room_id,
          opponent_id: match.opponent_id,
          opponent_username: match.match_format === 'dartbot' 
            ? `DartBot (${match.bot_level || '?'})`
            : opponentMap[match.opponent_id]?.username || 'Unknown',
          opponent_avatar_url: match.match_format === 'dartbot' ? null : (opponentMap[match.opponent_id]?.avatar_url || null),
          game_mode: match.game_mode,
          match_format: match.match_format,
          result: match.result,
          legs_won: match.legs_won,
          legs_lost: match.legs_lost,
          three_dart_avg: match.three_dart_avg || 0,
          first9_avg: match.first9_avg || 0,
          highest_checkout: match.highest_checkout || 0,
          checkout_percentage: match.checkout_percentage || 0,
          darts_thrown: match.darts_thrown || 0,
          total_score: match.total_score || 0,
          visits_100_plus: match.visits_100_plus || 0,
          visits_140_plus: match.visits_140_plus || 0,
          visits_180: match.visits_180 || 0,
          played_at: match.played_at,
          bot_level: match.bot_level,
          // Only include opponent stats for recent matches (first 10)
          opponent_three_dart_avg: isRecent ? match.opponent_three_dart_avg : undefined,
          opponent_first9_avg: isRecent ? match.opponent_first9_avg : undefined,
          opponent_highest_checkout: isRecent ? match.opponent_highest_checkout : undefined,
          opponent_checkout_percentage: isRecent ? match.opponent_checkout_percentage : undefined,
          opponent_visits_180: isRecent ? match.opponent_visits_180 : undefined,
        };
      });

      if (offset === 0) {
        setMatches(transformedData);
      } else {
        setMatches(prev => [...prev, ...transformedData]);
      }

      setHasMore(transformedData.length === limit);
    } catch (err) {
      console.error('[useMatchHistory] Unexpected error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [supabase, limit, days, gameMode, matchType, includeOpponentStats]);

  useEffect(() => {
    fetchMatches(0);
  }, [fetchMatches]);

  const refresh = useCallback(() => {
    fetchMatches(0);
  }, [fetchMatches]);

  const loadMore = useCallback(() => {
    fetchMatches(matches.length);
  }, [fetchMatches, matches.length]);

  return { 
    matches, 
    loading, 
    error, 
    hasMore,
    refresh, 
    loadMore,
    totalCount: matches.length 
  };
}
