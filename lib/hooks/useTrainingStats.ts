'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface TrainingStats {
  totalSessions: number;
  todaySessions: number;
  currentStreak: number;
  averageScore: number;
  bestCheckout: number;
  xp: number;
  level: number;
  xpToNextLevel: number;
  xpProgress: number;
}

// Training match formats (including dartbot and all training modes)
const TRAINING_FORMATS = [
  'dartbot',
  'jdc-challenge',
  'pdc-challenge',
  'finish-training',
  'around-the-clock',
  'bobs-27',
  'killer',
  '121',
];

// Calculate XP required to reach a specific level
// Formula: Total XP to reach level N = (N-1) * (50 + 25 * N)
// Level 1: 0 XP (starting level)
// Level 2: 100 XP
// Level 3: 250 XP
// Level 4: 450 XP
// etc.
function getXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return (level - 1) * (50 + 25 * level);
}

// Calculate level from total XP
function getLevelFromXp(xp: number): { level: number; xpToNext: number; progress: number } {
  let level = 1;
  while (getXpForLevel(level + 1) <= xp) {
    level++;
  }
  
  const xpForCurrentLevel = getXpForLevel(level);
  const xpForNextLevel = getXpForLevel(level + 1);
  const xpIntoLevel = xp - xpForCurrentLevel;
  const xpNeeded = xpForNextLevel - xpForCurrentLevel;
  const progress = xpNeeded > 0 ? Math.round((xpIntoLevel / xpNeeded) * 100) : 100;
  
  return {
    level,
    xpToNext: xpForNextLevel - xp,
    progress,
  };
}

// Calculate XP for a match (fallback if xp_earned not stored)
function calculateMatchXp(match: any): number {
  // If xp_earned is stored in session_data, use that
  if (match.session_data?.xp_breakdown?.total) {
    return match.session_data.xp_breakdown.total;
  }
  if (match.xp_earned) {
    return match.xp_earned;
  }
  
  // Fallback calculation
  let xp = 50; // Base XP
  
  if (match.result === 'win') {
    xp += 25;
  }
  
  // Average bonus (capped at 50)
  if (match.three_dart_avg && match.three_dart_avg > 0) {
    xp += Math.min(Math.round(match.three_dart_avg), 50);
  }
  
  return xp;
}

export function useTrainingStats() {
  const [stats, setStats] = useState<TrainingStats>({
    totalSessions: 0,
    todaySessions: 0,
    currentStreak: 0,
    averageScore: 0,
    bestCheckout: 0,
    xp: 0,
    level: 1,
    xpToNextLevel: 100,
    xpProgress: 0,
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadTrainingStats = useCallback(async () => {
    try {
      setLoading(true);
      console.log('[useTrainingStats] Loading stats...');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[useTrainingStats] No user found');
        setLoading(false);
        return;
      }
      console.log('[useTrainingStats] User:', user.id);

      // Get total XP using the database function (now includes both match_history and training_stats)
      const { data: totalXpData, error: totalXpError } = await supabase.rpc('get_player_total_xp', {
        p_user_id: user.id,
      });
      
      if (totalXpError) {
        console.error('[useTrainingStats] Error getting total XP:', totalXpError);
      }
      console.log('[useTrainingStats] Total XP from DB function:', totalXpData);

      // Get level info using the database function
      const { data: levelData, error: levelError } = await supabase.rpc('get_player_training_level', {
        p_user_id: user.id,
      });
      
      if (levelError) {
        console.error('[useTrainingStats] Error getting level:', levelError);
      }
      console.log('[useTrainingStats] Level data from DB:', levelData);

      // Get all training_stats for session counting
      const { data: trainingStats, error: statsError } = await supabase
        .from('training_stats')
        .select('xp_earned, created_at')
        .eq('player_id', user.id);

      if (statsError) {
        console.error('[useTrainingStats] Error fetching training_stats:', statsError);
      }

      // Get start of today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get match history for additional stats
      const { data: historyData } = await supabase
        .from('match_history')
        .select('result, played_at, highest_checkout, three_dart_avg, match_format')
        .eq('user_id', user.id)
        .in('match_format', TRAINING_FORMATS)
        .order('played_at', { ascending: false });

      const matches = historyData || [];

      // Use XP from database function (now includes both tables)
      const totalXp = totalXpData || 0;
      console.log('[useTrainingStats] Final total XP:', totalXp);

      // Calculate level info from database response or compute locally
      const levelInfo = levelData 
        ? { 
            level: levelData.level, 
            xpToNext: levelData.xp_to_next_level,
            progress: levelData.progress
          }
        : getLevelFromXp(totalXp);

      // Calculate today's sessions
      const todaySessions = matches.filter(m => new Date(m.played_at) >= today).length +
        (trainingStats?.filter(s => new Date(s.created_at) >= today).length || 0);

      // Calculate streak
      let streak = 0;
      for (const match of matches) {
        if (match.result === 'win') streak++;
        else break;
      }

      // Best checkout
      const bestCheckout = matches.reduce((max, match) => 
        Math.max(max, match.highest_checkout || 0), 0);

      // Average
      const validAverages = matches.filter(m => m.three_dart_avg > 0).map(m => m.three_dart_avg);
      const avgScore = validAverages.length > 0
        ? validAverages.reduce((a, b) => a + b, 0) / validAverages.length
        : 0;

      setStats({
        totalSessions: matches.length + (trainingStats?.length || 0),
        todaySessions,
        currentStreak: streak,
        averageScore: Math.round(avgScore * 10) / 10,
        bestCheckout,
        xp: totalXp,
        level: levelInfo.level,
        xpToNextLevel: levelInfo.xpToNext,
        xpProgress: levelInfo.progress,
      });
      
      console.log('[useTrainingStats] Stats updated:', { xp: totalXp, level: levelInfo.level });
    } catch (err) {
      console.error('[useTrainingStats] Unexpected error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadTrainingStats();
  }, [loadTrainingStats]);

  return { stats, loading, refresh: loadTrainingStats };
}
