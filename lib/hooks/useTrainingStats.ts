'use client';

import { useEffect, useState } from 'react';
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

// Calculate XP for a match
// Base: 50 XP
// Win bonus: +25 XP
// Average bonus: +1 XP per point of 3-dart average (capped at 50)
function calculateMatchXp(match: any): number {
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
        const todayISO = today.toISOString();

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

        const matches = historyData || [];

        // Calculate total XP from all matches
        const totalXp = matches.reduce((sum, match) => sum + calculateMatchXp(match), 0);
        const levelInfo = getLevelFromXp(totalXp);

        // Calculate today's sessions
        const todaySessions = matches.filter(m => new Date(m.played_at) >= today).length;

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
          totalSessions: matches.length,
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
  }, [supabase]);

  return { stats, loading };
}
