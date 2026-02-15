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

        // Get start of today (midnight)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        // Fetch matches from today (quick matches and dartbot only)
        const { data: todayMatches, error: matchesError } = await supabase
          .from('match_history')
          .select('result, three_dart_avg, darts_thrown, total_score, match_format, played_at')
          .eq('user_id', user.id)
          .gte('played_at', todayISO)
          .in('match_format', ['quick', 'dartbot']) // Only quick matches and dartbot
          .order('played_at', { ascending: false });

        if (matchesError) {
          console.error('[useTodayStats] Error fetching today matches:', matchesError);
        }

        // Calculate today's stats
        const matches = todayMatches || [];
        
        console.log('[useTodayStats] Today matches found:', matches.length);
        console.log('[useTodayStats] Matches:', matches.map(m => ({ 
          format: m.match_format, 
          result: m.result, 
          darts: m.darts_thrown, 
          score: m.total_score,
          avg: m.three_dart_avg 
        })));

        const matchesPlayed = matches.length;
        const wins = matches.filter(m => m.result === 'win').length;
        const losses = matches.filter(m => m.result === 'loss').length;
        
        // Calculate 3-dart average for today
        // Formula: (totalScore / totalDarts) * 3
        let threeDartAverage = 0;
        if (matches.length > 0) {
          const totalDarts = matches.reduce((sum, m) => sum + (m.darts_thrown || 0), 0);
          const totalScore = matches.reduce((sum, m) => sum + (m.total_score || 0), 0);
          
          console.log('[useTodayStats] Total darts:', totalDarts, 'Total score:', totalScore);
          
          if (totalDarts > 0) {
            threeDartAverage = (totalScore / totalDarts) * 3;
            console.log('[useTodayStats] Calculated 3-dart avg:', threeDartAverage);
          }
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

        const finalStats = {
          matchesPlayed,
          wins,
          losses,
          threeDartAverage: Math.round(threeDartAverage * 10) / 10,
          currentStreak: playerStats?.current_win_streak || 0,
          bestStreak: playerStats?.best_win_streak || 0,
        };
        
        console.log('[useTodayStats] Final stats:', finalStats);
        setStats(finalStats);
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
