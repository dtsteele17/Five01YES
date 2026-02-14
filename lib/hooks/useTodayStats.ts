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
}

export function useTodayStats() {
  const [stats, setStats] = useState<TodayStats>({
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    threeDartAverage: 0,
    currentStreak: 0,
    bestStreak: 0,
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadTodayStats() {
      try {
        setLoading(true);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // Get start of today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        // Fetch matches from today (both quick matches and dartbot)
        const { data: todayMatches, error: matchesError } = await supabase
          .from('match_history')
          .select('result, three_dart_avg, darts_thrown, total_score')
          .eq('user_id', user.id)
          .gte('played_at', todayISO)
          .order('played_at', { ascending: false });

        if (matchesError) {
          console.error('[useTodayStats] Error fetching today matches:', matchesError);
        }

        // Calculate today's stats
        const matches = todayMatches || [];
        const matchesPlayed = matches.length;
        const wins = matches.filter(m => m.result === 'win').length;
        const losses = matches.filter(m => m.result === 'loss').length;
        
        // Calculate 3-dart average for today
        let threeDartAverage = 0;
        if (matches.length > 0) {
          const totalDarts = matches.reduce((sum, m) => sum + (m.darts_thrown || 0), 0);
          const totalScore = matches.reduce((sum, m) => sum + (m.total_score || 0), 0);
          threeDartAverage = totalDarts > 0 ? (totalScore / totalDarts) * 3 : 0;
        }

        // Get current and best streak from player_stats
        const { data: playerStats, error: statsError } = await supabase
          .from('player_stats')
          .select('current_win_streak, best_win_streak')
          .eq('user_id', user.id)
          .single();

        if (statsError && statsError.code !== 'PGRST116') {
          console.error('[useTodayStats] Error fetching player stats:', statsError);
        }

        setStats({
          matchesPlayed,
          wins,
          losses,
          threeDartAverage: Math.round(threeDartAverage * 10) / 10,
          currentStreak: playerStats?.current_win_streak || 0,
          bestStreak: playerStats?.best_win_streak || 0,
        });
      } catch (err) {
        console.error('[useTodayStats] Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadTodayStats();
  }, [supabase]);

  return { stats, loading };
}
