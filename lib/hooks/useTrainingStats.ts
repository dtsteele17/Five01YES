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
  xpProgress: number; // Percentage to next level
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
  const [refreshKey, setRefreshKey] = useState(0);
  const supabase = createClient();

  const refresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    async function loadTrainingStats() {
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

        // Get match history for all training modes
        const { data: historyData, error: historyError } = await supabase
          .from('match_history')
          .select('result, played_at, highest_checkout, three_dart_avg, match_format')
          .eq('user_id', user.id)
          .in('match_format', TRAINING_FORMATS)
          .order('played_at', { ascending: false });

        if (historyError) {
          console.error('[useTrainingStats] Error fetching history:', historyError);
        }

        // Get training matches (for 121 and other training modes that use record_training_match)
        const { data: trainingMatches, error: trainingError } = await supabase
          .from('training_matches')
          .select('xp_earned, played_at, training_mode, completed')
          .eq('player_id', user.id)
          .order('played_at', { ascending: false });

        if (trainingError) {
          console.error('[useTrainingStats] Error fetching training matches:', trainingError);
        }

        const matches = historyData || [];
        const trainingData = trainingMatches || [];

        console.log('[useTrainingStats] Training matches:', trainingData);

        // Calculate XP from match_history
        const historyXp = matches.reduce((sum, match) => sum + calculateMatchXp(match), 0);
        
        // Calculate XP from training_matches (for 121, etc.)
        const trainingXp = trainingData.reduce((sum, match) => sum + (match.xp_earned || 0), 0);
        
        const totalXp = historyXp + trainingXp;
        console.log('[useTrainingStats] Total XP:', totalXp, '(history:', historyXp, '+ training:', trainingXp, ')');
        
        const levelInfo = getLevelFromXp(totalXp);

        // Calculate today's sessions from both sources
        const todayHistorySessions = matches.filter(m => new Date(m.played_at) >= today).length;
        const todayTrainingSessions = trainingData.filter(m => new Date(m.played_at) >= today).length;
        const todaySessions = todayHistorySessions + todayTrainingSessions;

        // Calculate streak (consecutive wins from most recent)
        let streak = 0;
        for (const match of matches) {
          if (match.result === 'win') {
            streak++;
          } else {
            break;
          }
        }

        // Calculate best checkout from training matches
        const bestCheckout = matches.reduce((max, match) => {
          return Math.max(max, match.highest_checkout || 0);
        }, 0);

        // Calculate average from training matches
        const validAverages = matches.filter(m => m.three_dart_avg > 0).map(m => m.three_dart_avg);
        const avgScore = validAverages.length > 0
          ? validAverages.reduce((a, b) => a + b, 0) / validAverages.length
          : 0;

        setStats({
          totalSessions: matches.length + trainingData.length,
          todaySessions,
          currentStreak: streak,
          averageScore: Math.round(avgScore * 10) / 10,
          bestCheckout: bestCheckout,
          xp: totalXp,
          level: levelInfo.level,
          xpToNextLevel: levelInfo.xpToNext,
          xpProgress: levelInfo.progress,
        });
      } catch (err) {
        console.error('[useTrainingStats] Unexpected error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadTrainingStats();
  }, [supabase, refreshKey]);

  return { stats, loading, refresh };
}
