'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface PlayerStats {
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  matches_301: number;
  matches_501: number;
  overall_3dart_avg: number;
  overall_first9_avg: number;
  highest_checkout: number;
  checkout_percentage: number;
  total_checkouts: number;
  checkout_attempts: number;
  visits_100_plus: number;
  visits_140_plus: number;
  visits_180: number;
  total_darts_thrown: number;
  total_score: number;
}

interface UsePlayerStatsReturn {
  overallStats: PlayerStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePlayerStats(userId?: string): UsePlayerStatsReturn {
  const [overallStats, setOverallStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchStats = async () => {
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

      // Fetch from player_stats table (cumulative across all matches)
      console.log('[usePlayerStats] Fetching stats for user:', targetUserId);
      const { data, error: statsError } = await supabase
        .from('player_stats')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (statsError) {
        console.error('[usePlayerStats] Error fetching player stats:', statsError);
        setError(statsError.message);
        setLoading(false);
        return;
      }
      
      console.log('[usePlayerStats] Fetched stats:', data);

      // If no data yet, return zeros
      if (!data) {
        setOverallStats({
          total_matches: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          matches_301: 0,
          matches_501: 0,
          overall_3dart_avg: 0,
          overall_first9_avg: 0,
          highest_checkout: 0,
          checkout_percentage: 0,
          total_checkouts: 0,
          checkout_attempts: 0,
          visits_100_plus: 0,
          visits_140_plus: 0,
          visits_180: 0,
          total_darts_thrown: 0,
          total_score: 0,
        });
        setLoading(false);
        return;
      }

      setOverallStats(data as PlayerStats);
    } catch (err: any) {
      console.error('Error in usePlayerStats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [userId]);

  return {
    overallStats,
    loading,
    error,
    refetch: fetchStats,
  };
}
