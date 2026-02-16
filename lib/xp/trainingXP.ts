import { createClient } from '@/lib/supabase/client';

export interface XPResult {
  totalXP: number;
  breakdown: {
    baseXP: number;
    winBonus?: number;
    performanceBonus?: number;
    specialBonus?: number;
  };
  leveledUp: boolean;
  newLevel?: number;
}

// Calculate XP for 501 vs Bot
// Base: 50 XP
// Win: +50 XP
// Average 60+: +25 XP
// Average 70+: +50 XP (cumulative)
// Average 80+: +50 XP (cumulative)
// Each 180: +10 XP
// Each checkout: +5 XP
export function calculate501VsBotXP(params: {
  won: boolean;
  average: number;
  num180s: number;
  checkouts: number;
}): XPResult {
  const { won, average, num180s, checkouts } = params;
  
  let baseXP = 50;
  let winBonus = 0;
  let performanceBonus = 0;
  let specialBonus = 0;
  
  // Win bonus
  if (won) {
    winBonus = 50;
  }
  
  // Performance bonuses based on average (cumulative)
  if (average >= 80) {
    performanceBonus += 25 + 50 + 50; // 60+, 70+, 80+ tiers
  } else if (average >= 70) {
    performanceBonus += 25 + 50; // 60+, 70+ tiers
  } else if (average >= 60) {
    performanceBonus += 25; // 60+ tier only
  }
  
  // Special bonuses
  specialBonus += num180s * 10; // Each 180
  specialBonus += checkouts * 5; // Each checkout
  
  const totalXP = baseXP + winBonus + performanceBonus + specialBonus;
  
  return {
    totalXP,
    breakdown: {
      baseXP,
      winBonus: winBonus > 0 ? winBonus : undefined,
      performanceBonus: performanceBonus > 0 ? performanceBonus : undefined,
      specialBonus: specialBonus > 0 ? specialBonus : undefined,
    },
    leveledUp: false, // Will be set after checking current level
  };
}

// Calculate XP for Around the Clock
// Base: 30 XP for completion
// Accuracy >50%: +1 XP per % above 50
// Under 50 darts: +20 XP
export function calculateAroundTheClockXP(params: {
  completed: boolean;
  accuracy: number; // percentage 0-100
  dartsThrown: number;
}): XPResult {
  const { completed, accuracy, dartsThrown } = params;
  
  let baseXP = 0;
  let performanceBonus = 0;
  
  if (completed) {
    baseXP = 30;
    
    // Accuracy bonus: +1 XP per % above 50
    if (accuracy > 50) {
      performanceBonus += Math.floor(accuracy - 50);
    }
    
    // Speed bonus: under 50 darts
    if (dartsThrown < 50) {
      performanceBonus += 20;
    }
  }
  
  const totalXP = baseXP + performanceBonus;
  
  return {
    totalXP,
    breakdown: {
      baseXP,
      performanceBonus: performanceBonus > 0 ? performanceBonus : undefined,
    },
    leveledUp: false,
  };
}

// Calculate XP for Finish Training
// 10 XP per checkout hit
// Streak 3+: +25 XP
export function calculateFinishTrainingXP(params: {
  checkoutsHit: number;
  streak: number;
}): XPResult {
  const { checkoutsHit, streak } = params;
  
  const baseXP = checkoutsHit * 10;
  let specialBonus = 0;
  
  // Streak bonus
  if (streak >= 3) {
    specialBonus = 25;
  }
  
  const totalXP = baseXP + specialBonus;
  
  return {
    totalXP,
    breakdown: {
      baseXP,
      specialBonus: specialBonus > 0 ? specialBonus : undefined,
    },
    leveledUp: false,
  };
}

// Calculate XP for Bob's 27
// Score × 2
export function calculateBobs27XP(params: {
  score: number;
}): XPResult {
  const { score } = params;
  
  const totalXP = Math.max(0, score * 2);
  
  return {
    totalXP,
    breakdown: {
      baseXP: totalXP,
    },
    leveledUp: false,
  };
}

// Calculate level from total XP
// Level progression: Each level needs 500 more XP than previous
// Level 1: 0-999 XP
// Level 2: 1000-2499 XP
// etc.
export function calculateLevel(totalXP: number): { level: number; xpInLevel: number; xpToNext: number } {
  let level = 1;
  let xpForNextLevel = 1000; // Level 2 requires 1000 XP
  let accumulatedXP = 0;
  
  while (totalXP >= accumulatedXP + xpForNextLevel) {
    accumulatedXP += xpForNextLevel;
    level++;
    xpForNextLevel += 500; // Each level needs 500 more XP
  }
  
  const xpInLevel = totalXP - accumulatedXP;
  const xpToNext = xpForNextLevel - xpInLevel;
  
  return { level, xpInLevel, xpToNext };
}

// Calculate XP required for a specific level
export function getXPForLevel(level: number): number {
  if (level <= 1) return 0;
  
  let totalXP = 0;
  let xpForLevel = 1000;
  
  for (let i = 2; i <= level; i++) {
    totalXP += xpForLevel;
    xpForLevel += 500;
  }
  
  return totalXP;
}

// Award XP to user via Supabase
export async function awardXP(
  userId: string,
  gameType: string,
  xpResult: XPResult,
  sessionData?: Record<string, unknown>
): Promise<{ success: boolean; newLevel?: number; leveledUp: boolean; error?: string }> {
  const supabase = createClient();
  
  try {
    // Get current user XP and level
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('xp, level')
      .eq('id', userId)
      .single();
    
    if (profileError) {
      return { success: false, leveledUp: false, error: profileError.message };
    }
    
    const currentXP = profile?.xp || 0;
    const currentLevel = profile?.level || 1;
    const newTotalXP = currentXP + xpResult.totalXP;
    
    // Calculate new level
    const { level: newLevel } = calculateLevel(newTotalXP);
    const leveledUp = newLevel > currentLevel;
    
    // Update profile with new XP and level
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        xp: newTotalXP,
        level: newLevel,
      })
      .eq('id', userId);
    
    if (updateError) {
      return { success: false, leveledUp: false, error: updateError.message };
    }
    
    // Record training session
    const { error: sessionError } = await supabase
      .from('training_sessions')
      .insert({
        user_id: userId,
        game_type: gameType,
        score: sessionData?.score || 0,
        xp_earned: xpResult.totalXP,
        completed: true,
      });
    
    if (sessionError) {
      console.error('Failed to record training session:', sessionError);
      // Don't fail the entire operation if session recording fails
    }
    
    return {
      success: true,
      leveledUp,
      newLevel: leveledUp ? newLevel : undefined,
    };
  } catch (error) {
    return {
      success: false,
      leveledUp: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
