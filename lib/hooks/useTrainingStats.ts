'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface TrainingStats {
  totalSessions: number;
  currentStreak: number;
  averageScore: number;
  bestCheckout: number;
}

export function useTrainingStats() {
  const [stats, setStats] = useState<TrainingStats>({
    totalSessions: 0,
    currentStreak: 0,
    averageScore: 0,
    bestCheckout: 0,
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadTrainingStats() {
      try {
        setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        // Get player stats for dartbot/training matches
        const { data: playerStats, error: statsError } = await supabase
          .from('player_stats')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (statsError && statsError.code !== 'PGRST116') {
          console.error('[useTrainingStats] Error fetching stats:', statsError);
        }

        // Get match history for training-specific stats
        const { data: historyData, error: historyError } = await supabase
          .from('match_history')
          .select('result, played_at, highest_checkout, three_dart_avg')
          .eq('user_id', user.id)
          .eq('match_format', 'dartbot')
          .order('played_at', { ascending: false });

        if (historyError) {
          console.error('[useTrainingStats] Error fetching history:', historyError);
        }

        // Calculate streak
        let streak = 0;
        if (historyData && historyData.length > 0) {
          for (const match of historyData) {
            if (match.result === 'win') {
              streak++;
            } else {
              break;
            }
          }
        }

        // Calculate best checkout from training matches
        const bestCheckout = historyData?.reduce((max, match) => {
          return Math.max(max, match.highest_checkout || 0);
        }, 0) || 0;

        // Calculate average from training matches
        const validAverages = historyData?.filter(m => m.three_dart_avg > 0).map(m => m.three_dart_avg) || [];
        const avgScore = validAverages.length > 0
          ? validAverages.reduce((a, b) => a + b, 0) / validAverages.length
          : 0;

        setStats({
          totalSessions: historyData?.length || 0,
          currentStreak: streak,
          averageScore: Math.round(avgScore * 10) / 10,
          bestCheckout: bestCheckout,
        });
      } catch (err) {
        console.error('[useTrainingStats] Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadTrainingStats();
  }, [supabase]);

  return { stats, loading };
}
