'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface PlayerStats {
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  overall_3dart_avg: number;
  overall_first9_avg: number;
  highest_checkout: number;
  checkout_percentage: number;
  visits_100_plus: number;
  visits_140_plus: number;
  visits_180: number;
  total_darts_thrown: number;
}

interface UsePlayerStatsReturn {
  overallStats: PlayerStats | null;
  quickMatchStats: PlayerStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePlayerStats(userId?: string): UsePlayerStatsReturn {
  const [overallStats, setOverallStats] = useState<PlayerStats | null>(null);
  const [quickMatchStats, setQuickMatchStats] = useState<PlayerStats | null>(null);
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
        return;
      }

      // Fetch overall stats
      const { data: overallData, error: overallError } = await supabase
        .from('player_stats')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (overallError) throw overallError;

      // Fetch quick match stats
      const { data: quickMatchData, error: quickMatchError } = await supabase
        .from('player_quick_match_stats')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (quickMatchError) throw quickMatchError;

      setOverallStats(overallData);
      setQuickMatchStats(quickMatchData);
    } catch (err: any) {
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
    quickMatchStats,
    loading,
    error,
    refetch: fetchStats,
  };
}
