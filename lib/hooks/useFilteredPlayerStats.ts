'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface FilteredPlayerStats {
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  avg_3dart: number;
  highest_checkout: number;
  checkout_pct: number;
  total_checkouts: number;
  checkout_attempts: number;
  visits_100_plus: number;
  visits_140_plus: number;
  visits_180: number;
  total_darts: number;
  total_score: number;
}

interface UseFilteredPlayerStatsReturn {
  stats: FilteredPlayerStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFilteredPlayerStats(
  gameMode: number | null = null,
  matchType: string | null = null,
  userId?: string
): UseFilteredPlayerStatsReturn {
  const [stats, setStats] = useState<FilteredPlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get current user if no userId provided
      let targetUserId = userId;
      if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        targetUserId = user?.id;
      }

      if (!targetUserId) {
        setError('No user ID provided');
        setLoading(false);
        return;
      }

      // If no filters, return null (use overall stats instead)
      if (gameMode === null && matchType === null) {
        setStats(null);
        setLoading(false);
        return;
      }

      // Call RPC function to get filtered stats
      const { data, error: statsError } = await supabase.rpc('fn_get_filtered_player_stats', {
        p_user_id: targetUserId,
        p_game_mode: gameMode,
        p_match_type: matchType,
      });

      if (statsError) {
        console.error('Error fetching filtered stats:', statsError);
        setError(statsError.message);
        setLoading(false);
        return;
      }

      // The function returns an array with one row
      if (data && Array.isArray(data) && data.length > 0) {
        const row = data[0];
        setStats({
          total_matches: Number(row.total_matches) || 0,
          wins: Number(row.wins) || 0,
          losses: Number(row.losses) || 0,
          draws: Number(row.draws) || 0,
          avg_3dart: Number(row.avg_3dart) || 0,
          highest_checkout: Number(row.highest_checkout) || 0,
          checkout_pct: Number(row.checkout_pct) || 0,
          total_checkouts: Number(row.total_checkouts) || 0,
          checkout_attempts: Number(row.checkout_attempts) || 0,
          visits_100_plus: Number(row.visits_100_plus) || 0,
          visits_140_plus: Number(row.visits_140_plus) || 0,
          visits_180: Number(row.visits_180) || 0,
          total_darts: Number(row.total_darts) || 0,
          total_score: Number(row.total_score) || 0,
        });
      } else {
        // No matches found for filters - show zeros
        setStats({
          total_matches: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          avg_3dart: 0,
          highest_checkout: 0,
          checkout_pct: 0,
          total_checkouts: 0,
          checkout_attempts: 0,
          visits_100_plus: 0,
          visits_140_plus: 0,
          visits_180: 0,
          total_darts: 0,
          total_score: 0,
        });
      }
    } catch (err: any) {
      console.error('Error in useFilteredPlayerStats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [supabase, gameMode, matchType, userId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats,
  };
}
