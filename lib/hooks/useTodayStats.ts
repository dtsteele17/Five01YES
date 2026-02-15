'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface TodayStats {
  matchesPlayed: number;
  wins: number;
  losses: number;
  threeDartAverage: number;
  currentStreak: number;
  bestStreak: number;
  last5Results: string[];
}

export function useTodayStats() {
  const [stats, setStats] = useState<TodayStats>({
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    threeDartAverage: 0,
    currentStreak: 0,
    bestStreak: 0,
    last5Results: [],
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadStats() {
      try {
        setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // Get today's matches
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: todayMatches, error: todayError } = await supabase
          .from('match_history')
          .select('*')
          .eq('user_id', user.id)
          .gte('played_at', today.toISOString())
          .order('played_at', { ascending: false });

        if (todayError) {
          console.error('[useTodayStats] Error fetching today matches:', todayError);
        }

        // Get player stats for streaks
        const { data: playerStats, error: statsError } = await supabase
          .from('player_stats')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (statsError && statsError.code !== 'PGRST116') {
          console.error('[useTodayStats] Error fetching player stats:', statsError);
        }

        // Calculate today's stats
        const matches = todayMatches || [];
        const wins = matches.filter(m => m.result === 'win').length;
        const losses = matches.filter(m => m.result === 'loss').length;
        
        // Calculate average from today's matches
        const validAvgs = matches
          .filter(m => m.three_dart_avg > 0)
          .map(m => m.three_dart_avg);
        const avg = validAvgs.length > 0
          ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length
          : 0;

        setStats({
          matchesPlayed: matches.length,
          wins,
          losses,
          threeDartAverage: Math.round(avg * 10) / 10,
          currentStreak: playerStats?.current_win_streak || 0,
          bestStreak: playerStats?.best_win_streak || 0,
          last5Results: playerStats?.last_5_results || [],
        });
      } catch (err) {
        console.error('[useTodayStats] Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, [supabase]);

  return { stats, loading };
}

// Hook for dashboard stats using the RPC function
export function useDashboardStats() {
  const [stats, setStats] = useState({
    today_matches: 0,
    today_wins: 0,
    current_streak: 0,
    last_5_results: [],
    avg_3dart: 0,
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadDashboardStats() {
      try {
        setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.rpc('get_dashboard_stats', {
          p_user_id: user.id,
        });

        if (error) {
          console.error('[useDashboardStats] Error:', error);
          // Fallback to manual calculation
          const { data: matches } = await supabase
            .from('match_history')
            .select('*')
            .eq('user_id', user.id)
            .gte('played_at', new Date().toISOString().split('T')[0])
            .order('played_at', { ascending: false });

          const { data: playerStats } = await supabase
            .from('player_stats')
            .select('*')
            .eq('user_id', user.id)
            .single();

          setStats({
            today_matches: matches?.length || 0,
            today_wins: matches?.filter(m => m.result === 'win').length || 0,
            current_streak: playerStats?.current_win_streak || 0,
            last_5_results: playerStats?.last_5_results || [],
            avg_3dart: 0,
          });
        } else {
          setStats(data);
        }
      } catch (err) {
        console.error('[useDashboardStats] Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardStats();
  }, [supabase]);

  return { stats, loading };
}
