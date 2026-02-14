/**
 * Achievement Tracker System
 * 
 * This module tracks player progress across all game modes and updates achievements in real-time.
 * It handles:
 * - Win-based achievements (ranked, tournaments, etc.)
 * - Score-based achievements (180s, 100+, 26s, 69s, etc.)
 * - Checkout achievements (checkouts above certain thresholds)
 * - Match-specific achievements (averages, win streaks, etc.)
 */

import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

// Achievement IDs from lib/achievements.ts
export const ACHIEVEMENT_IDS = {
  // Scoring achievements
  BOOM: 'boom',
  MAXIMUM_EFFORT: 'maximum-effort',
  TON_80_CLUB: 'ton-80-club',
  TREBLE_TROUBLE: 'treble-trouble',
  ONE_EIGHTY_MACHINE: '180-machine',
  MAXIMUM_OVERLOAD: 'maximum-overload',
  TREBLE_FACTORY: 'treble-factory',
  TREBLE_GOD: 'treble-god',
  BACK_TO_BACK: 'back-to-back',
  ONE_EIGHTY_UNDER_PRESSURE: '180-under-pressure',
  CHECKED_OUT: 'checked-out',
  COOL_HAND: 'cool-hand',
  BIG_FINISH: 'big-finish',
  CLUTCH_FINISHER: 'clutch-finisher',
  OUT_IN_STYLE: 'out-in-style',
  ICE_COLD: 'ice-cold',
  SHANGHAI_SURPRISE: 'shanghai-surprise',
  ONE_SEVENTY_CLUB: '170-club',
  TON_UP: 'ton-up',
  TON_MACHINE: 'ton-machine',
  
  // Funny achievements
  FEARED_NUMBER: 'feared-number',
  DOUBLE_13_SPECIALIST: 'double-13-specialist',
  PAIN_MERCHANT: 'pain-merchant',
  ANTI_CHECKOUT: 'anti-checkout',
  DARTBOARD_HATES_ME: 'dartboard-hates-me',
  NICE: 'nice',
  DOUBLE_TROUBLE: 'double-trouble',
  
  // Ranked achievements
  RANKED_ROOKIE: 'ranked-rookie',
  ON_THE_LADDER: 'on-the-ladder',
  RANKED_GRINDER: 'ranked-grinder',
  SWEATY_HANDS: 'sweaty-hands',
  THE_TRYHARD: 'the-tryhard',
  WIN_STREAK: 'win-streak',
  UNSTOPPABLE: 'unstoppable',
  PROMOTION_SECURED: 'promotion-secured',
  
  // Milestones
  HEAVY_SCORER: 'heavy-scorer',
  SERIOUS_BUSINESS: 'serious-business',
  CENTURION: 'centurion',
  THE_WALL: 'the-wall',
  EARLY_DOORS: 'early-doors',
  FRIENDLY_FIRE: 'friendly-fire',
  
  // Practice
  WARM_UP: 'warm-up',
  DEDICATED: 'dedicated',
  TRAINING_ARC: 'training-arc',
  BULLSEYE_HUNTER: 'bullseye-hunter',
  ROBIN_HOOD: 'robin-hood',
  
  // Around The Clock
  CLOCK_STARTER: 'clock-starter',
  CLOCK_MASTER: 'clock-master',
  CLOCK_LEGEND: 'clock-legend',
  SPEED_RUNNER: 'speed-runner',
} as const;

export interface AchievementProgress {
  achievementId: string;
  progress: number;
  goal: number;
  completed: boolean;
  title: string;
  description: string;
  reward: string;
}

export interface MatchEndData {
  winnerId: string;
  loserId: string;
  winnerLegs: number;
  loserLegs: number;
  gameMode: number;
  matchType: 'quick_match' | 'ranked' | 'tournament' | 'private' | 'dartbot';
  playerStats: {
    playerId: string;
    average: number;
    oneEighties: number;
    tonPlus: number;
    highestCheckout: number;
    checkouts: number;
    score26Count?: number;
    score69Count?: number;
  }[];
  durationMinutes?: number;
  isFirst180?: boolean;
  isBackToBack180s?: boolean;
  is180UnderPressure?: boolean;
}

/**
 * Show achievement unlock toast notification
 */
export function showAchievementToast(title: string, description: string, reward: string) {
  // Use a simple text-based toast (JSX not allowed in .ts files)
  toast.success(`🏆 Achievement Unlocked: ${title}\n${description}\nReward: ${reward}`, {
    duration: 5000,
    position: 'bottom-right',
  });
}

/**
 * Get or create user achievement progress
 */
export async function getUserAchievementProgress(achievementId: string): Promise<{ progress: number; completed: boolean } | null> {
  const supabase = createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // First check if achievement exists in achievements table
  const { data: achievementDef } = await supabase
    .from('achievements')
    .select('id, goal_value')
    .eq('code', achievementId)
    .maybeSingle();

  if (!achievementDef) {
    console.warn(`Achievement ${achievementId} not found in database`);
    return null;
  }

  // Get or create user progress
  const { data: existing } = await supabase
    .from('user_achievements')
    .select('*')
    .eq('user_id', user.id)
    .eq('achievement_id', achievementDef.id)
    .maybeSingle();

  if (existing) {
    return { progress: existing.progress || 0, completed: existing.completed || false };
  }

  // Create new progress entry
  const { data: created, error } = await supabase
    .from('user_achievements')
    .insert({
      user_id: user.id,
      achievement_id: achievementDef.id,
      progress: 0,
      completed: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating achievement progress:', error);
    return null;
  }

  return { progress: 0, completed: false };
}

/**
 * Update achievement progress
 */
export async function updateAchievementProgress(
  achievementId: string, 
  newProgress: number, 
  achievementData?: { title: string; description: string; reward: string; goal?: number }
): Promise<boolean> {
  const supabase = createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  // Get achievement definition
  const { data: achievementDef } = await supabase
    .from('achievements')
    .select('id, goal_value, name, description, xp, code')
    .eq('code', achievementId)
    .maybeSingle();

  if (!achievementDef) {
    console.warn(`Achievement ${achievementId} not found`);
    return false;
  }

  const goal = achievementData?.goal || achievementDef.goal_value || 1;

  // Get current progress
  const { data: existing } = await supabase
    .from('user_achievements')
    .select('*')
    .eq('user_id', user.id)
    .eq('achievement_id', achievementDef.id)
    .maybeSingle();

  const wasCompleted = existing?.completed || false;
  const isNowCompleted = newProgress >= goal;

  // Only update if progress increased or newly completed
  if (existing) {
    if (newProgress <= existing.progress && !(!wasCompleted && isNowCompleted)) {
      return false; // No progress to update
    }

    const { error } = await supabase
      .from('user_achievements')
      .update({
        progress: Math.min(newProgress, goal),
        completed: isNowCompleted,
        completed_at: (!wasCompleted && isNowCompleted) ? new Date().toISOString() : existing.completed_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) {
      console.error('Error updating achievement:', error);
      return false;
    }
  } else {
    const { error } = await supabase
      .from('user_achievements')
      .insert({
        user_id: user.id,
        achievement_id: achievementDef.id,
        progress: Math.min(newProgress, goal),
        completed: isNowCompleted,
        completed_at: isNowCompleted ? new Date().toISOString() : null,
      });

    if (error) {
      console.error('Error creating achievement:', error);
      return false;
    }
  }

  // Show toast if newly completed
  if (!wasCompleted && isNowCompleted) {
    showAchievementToast(
      achievementData?.title || achievementDef.name,
      achievementData?.description || achievementDef.description,
      achievementData?.reward || `${achievementDef.xp} XP`
    );
  }

  return isNowCompleted;
}

/**
 * Increment achievement progress by amount
 */
export async function incrementAchievementProgress(
  achievementId: string,
  increment: number = 1,
  achievementData?: { title: string; description: string; reward: string; goal?: number }
): Promise<boolean> {
  const supabase = createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  // Get achievement definition
  const { data: achievementDef } = await supabase
    .from('achievements')
    .select('id, goal_value, name, description, xp, code')
    .eq('code', achievementId)
    .maybeSingle();

  if (!achievementDef) {
    console.warn(`Achievement ${achievementId} not found`);
    return false;
  }

  // Get current progress
  const { data: existing } = await supabase
    .from('user_achievements')
    .select('*')
    .eq('user_id', user.id)
    .eq('achievement_id', achievementDef.id)
    .maybeSingle();

  const currentProgress = existing?.progress || 0;
  const newProgress = currentProgress + increment;
  const goal = achievementData?.goal || achievementDef.goal_value || 1;
  const wasCompleted = existing?.completed || false;
  const isNowCompleted = newProgress >= goal;

  // Don't update if already completed and no new progress needed
  if (wasCompleted && currentProgress >= goal) {
    return false;
  }

  if (existing) {
    const { error } = await supabase
      .from('user_achievements')
      .update({
        progress: Math.min(newProgress, goal),
        completed: isNowCompleted,
        completed_at: (!wasCompleted && isNowCompleted) ? new Date().toISOString() : existing.completed_at,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) {
      console.error('Error updating achievement:', error);
      return false;
    }
  } else {
    const { error } = await supabase
      .from('user_achievements')
      .insert({
        user_id: user.id,
        achievement_id: achievementDef.id,
        progress: Math.min(newProgress, goal),
        completed: isNowCompleted,
        completed_at: isNowCompleted ? new Date().toISOString() : null,
      });

    if (error) {
      console.error('Error creating achievement:', error);
      return false;
    }
  }

  // Show toast if newly completed
  if (!wasCompleted && isNowCompleted) {
    showAchievementToast(
      achievementData?.title || achievementDef.name,
      achievementData?.description || achievementDef.description,
      achievementData?.reward || `${achievementDef.xp} XP`
    );
  }

  return isNowCompleted;
}

/**
 * Track a score-based achievement (180, 100+, 26, 69, etc.)
 */
export async function trackScoreAchievement(score: number, context: 'quick_match' | 'dartbot' | 'training' | 'ranked' | 'tournament' | 'private' = 'quick_match') {
  // Track 180s
  if (score === 180) {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.BOOM, 1, {
      title: 'Boom!',
      description: 'Hit your first 180',
      reward: '150 XP',
      goal: 1,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.MAXIMUM_EFFORT, 1, {
      title: 'Maximum Effort',
      description: 'Hit 5x 180s',
      reward: '300 XP',
      goal: 5,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.TON_80_CLUB, 1, {
      title: 'The Ton 80 Club',
      description: 'Hit 10x 180s',
      reward: '600 XP',
      goal: 10,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.TREBLE_TROUBLE, 1, {
      title: 'Treble Trouble',
      description: 'Hit 25x 180s',
      reward: '1500 XP',
      goal: 25,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.ONE_EIGHTY_MACHINE, 1, {
      title: '180 Machine',
      description: 'Hit 50x 180s',
      reward: '3000 XP',
      goal: 50,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.MAXIMUM_OVERLOAD, 1, {
      title: 'Maximum Overload',
      description: 'Hit 100x 180s',
      reward: '6000 XP',
      goal: 100,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.TREBLE_FACTORY, 1, {
      title: 'Treble Factory',
      description: 'Hit 250x 180s',
      reward: '15000 XP',
      goal: 250,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.TREBLE_GOD, 1, {
      title: 'Treble God',
      description: 'Hit 500x 180s',
      reward: 'Treble God Badge',
      goal: 500,
    });
  }

  // Track 100+ scores
  if (score >= 100) {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.TON_UP, 1, {
      title: 'Ton Up',
      description: 'Hit 100+',
      reward: '100 XP',
      goal: 1,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.TON_MACHINE, 1, {
      title: 'Ton Machine',
      description: 'Hit 10x 100+',
      reward: '300 XP',
      goal: 10,
    });
  }

  // Track 26s (funny achievement)
  if (score === 26) {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.FEARED_NUMBER, 1, {
      title: 'The Feared Number',
      description: 'Score 26 for the first time',
      reward: '10 XP',
      goal: 1,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.DOUBLE_13_SPECIALIST, 1, {
      title: 'Double 13 Specialist',
      description: 'Score 26 ten times',
      reward: 'Pain Badge',
      goal: 10,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.PAIN_MERCHANT, 1, {
      title: 'Pain Merchant',
      description: 'Score 26 fifty times',
      reward: 'Suffering Badge',
      goal: 50,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.ANTI_CHECKOUT, 1, {
      title: 'Anti-Checkout',
      description: 'Score 26 one hundred times',
      reward: 'Masochist Badge',
      goal: 100,
    });
  }

  // Track 69s (funny achievement)
  if (score === 69) {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.NICE, 1, {
      title: 'Nice.',
      description: 'Score exactly 69 in a single visit',
      reward: '69 XP',
      goal: 1,
    });
  }
}

/**
 * Track a checkout achievement
 */
export async function trackCheckoutAchievement(checkoutValue: number) {
  // Track first checkout
  await incrementAchievementProgress(ACHIEVEMENT_IDS.CHECKED_OUT, 1, {
    title: 'Checked Out',
    description: 'Win a leg by checkout',
    reward: '50 XP',
    goal: 1,
  });

  // Track high checkouts
  if (checkoutValue >= 100) {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.COOL_HAND, 1, {
      title: 'Cool Hand',
      description: 'Checkout above 100',
      reward: '200 XP',
      goal: 1,
    });
  }
  if (checkoutValue >= 120) {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.BIG_FINISH, 1, {
      title: 'Big Finish',
      description: 'Checkout above 120',
      reward: '300 XP',
      goal: 1,
    });
  }
  if (checkoutValue >= 150) {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.CLUTCH_FINISHER, 1, {
      title: 'Clutch Finisher',
      description: 'Checkout above 150',
      reward: '500 XP',
      goal: 1,
    });
  }
  if (checkoutValue === 170) {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.ONE_SEVENTY_CLUB, 1, {
      title: '170 Club',
      description: 'Checkout 170',
      reward: '1000 XP',
      goal: 1,
    });
  }
}

/**
 * Track a match win achievement
 */
export async function trackMatchWin(matchType: 'quick_match' | 'ranked' | 'tournament' | 'private' | 'dartbot') {
  // Track ranked wins
  if (matchType === 'ranked' || matchType === 'quick_match') {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.ON_THE_LADDER, 1, {
      title: 'On The Ladder',
      description: 'Win 5 ranked matches',
      reward: '250 XP',
      goal: 5,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.RANKED_GRINDER, 1, {
      title: 'Ranked Grinder',
      description: 'Win 25 ranked matches',
      reward: '1000 XP',
      goal: 25,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.SWEATY_HANDS, 1, {
      title: 'Sweaty Hands',
      description: 'Win 50 ranked matches',
      reward: '2000 XP',
      goal: 50,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.THE_TRYHARD, 1, {
      title: 'The Tryhard',
      description: 'Win 100 ranked matches',
      reward: 'Tryhard Badge',
      goal: 100,
    });
  }

  // Track private match
  if (matchType === 'private') {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.FRIENDLY_FIRE, 1, {
      title: 'Friendly Fire',
      description: 'Play a private match',
      reward: '50 XP',
      goal: 1,
    });
  }

  // Track first ranked match
  if (matchType === 'ranked') {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.RANKED_ROOKIE, 1, {
      title: 'Ranked Rookie',
      description: 'Play your first ranked match',
      reward: '100 XP',
      goal: 1,
    });
  }
}

/**
 * Track average-based achievements
 */
export async function trackAverageAchievement(average: number) {
  if (average >= 60) {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.HEAVY_SCORER, 1, {
      title: 'Heavy Scorer',
      description: 'Average 60+ in a match',
      reward: '200 XP',
      goal: 1,
    });
  }
  if (average >= 80) {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.SERIOUS_BUSINESS, 1, {
      title: 'Serious Business',
      description: 'Average 80+ in a match',
      reward: '400 XP',
      goal: 1,
    });
  }
  if (average >= 100) {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.CENTURION, 1, {
      title: 'Centurion',
      description: 'Average 100+ in a match',
      reward: 'Centurion Badge',
      goal: 1,
    });
  }
}

/**
 * Track training/practice achievements
 */
export async function trackTrainingCompletion(trainingType: 'atc' | 'bobs27' | 'finish' | '121' | 'killer' | 'pdc' | 'jdc') {
  // Track practice sessions
  await incrementAchievementProgress(ACHIEVEMENT_IDS.WARM_UP, 1, {
    title: 'Warm Up',
    description: 'Complete 10 practice sessions',
    reward: '150 XP',
    goal: 10,
  });
  await incrementAchievementProgress(ACHIEVEMENT_IDS.DEDICATED, 1, {
    title: 'Dedicated',
    description: 'Practice 50 times',
    reward: '500 XP',
    goal: 50,
  });
  await incrementAchievementProgress(ACHIEVEMENT_IDS.TRAINING_ARC, 1, {
    title: 'Training Arc',
    description: 'Practice 100 times',
    reward: 'Dedicated Badge',
    goal: 100,
  });

  // Track Around The Clock
  if (trainingType === 'atc') {
    await incrementAchievementProgress(ACHIEVEMENT_IDS.CLOCK_STARTER, 1, {
      title: 'Clock Starter',
      description: 'Complete Around The Clock once',
      reward: '100 XP',
      goal: 1,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.CLOCK_MASTER, 1, {
      title: 'Clock Master',
      description: 'Complete 10 times',
      reward: '500 XP',
      goal: 10,
    });
    await incrementAchievementProgress(ACHIEVEMENT_IDS.CLOCK_LEGEND, 1, {
      title: 'Clock Legend',
      description: 'Complete 50 times',
      reward: 'Clock Legend Badge',
      goal: 50,
    });
  }
}

/**
 * Process match end and track all relevant achievements
 */
export async function processMatchEnd(data: MatchEndData) {
  console.log('[AchievementTracker] Processing match end:', data);

  const currentUserStats = data.playerStats.find(p => p.playerId === data.winnerId);
  if (!currentUserStats) return;

  // Track win achievements
  await trackMatchWin(data.matchType);

  // Track average achievements
  await trackAverageAchievement(currentUserStats.average);

  // Track 180 achievements
  if (currentUserStats.oneEighties > 0) {
    for (let i = 0; i < currentUserStats.oneEighties; i++) {
      await trackScoreAchievement(180, data.matchType);
    }
  }

  // Track 100+ achievements
  if (currentUserStats.tonPlus > 0) {
    for (let i = 0; i < currentUserStats.tonPlus; i++) {
      await trackScoreAchievement(100, data.matchType);
    }
  }

  // Track checkout achievements
  if (currentUserStats.checkouts > 0 && currentUserStats.highestCheckout > 0) {
    await trackCheckoutAchievement(currentUserStats.highestCheckout);
  }

  // Track 26s scored in this match
  if (currentUserStats.score26Count) {
    for (let i = 0; i < currentUserStats.score26Count; i++) {
      await trackScoreAchievement(26, data.matchType);
    }
  }

  // Track 69s scored in this match
  if (currentUserStats.score69Count) {
    for (let i = 0; i < currentUserStats.score69Count; i++) {
      await trackScoreAchievement(69, data.matchType);
    }
  }

  // Check win streak (would need to track this in database)
  // For now, this would require a separate win_streak tracking system
}

/**
 * Get all achievement progress for current user
 */
export async function getAllAchievementProgress(): Promise<AchievementProgress[]> {
  const supabase = createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Get all achievements
  const { data: achievements } = await supabase
    .from('achievements')
    .select('*')
    .order('code');

  if (!achievements) return [];

  // Get user progress
  const { data: userAchievements } = await supabase
    .from('user_achievements')
    .select('*')
    .eq('user_id', user.id);

  const progressMap = new Map(userAchievements?.map(ua => [ua.achievement_id, ua]) || []);

  return achievements.map(ach => {
    const userProgress = progressMap.get(ach.id);
    return {
      achievementId: ach.code,
      progress: userProgress?.progress || 0,
      goal: ach.goal_value || 1,
      completed: userProgress?.completed || false,
      title: ach.name,
      description: ach.description,
      reward: `${ach.xp} XP`,
    };
  });
}
