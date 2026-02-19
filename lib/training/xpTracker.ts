/**
 * Training Mode XP Tracker
 * 
 * Awards XP for completing training modes and DartBot matches.
 * Updates training progress and handles level ups.
 */

import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export interface XPBreakdown {
  base: number;
  performanceBonus: number;
  winBonus: number;
  completionBonus: number;
  total: number;
}

export interface XPAwardResult {
  success: boolean;
  xpBreakdown: XPBreakdown;
  newTotalXP?: number;
  levelUp?: {
    oldLevel: number;
    newLevel: number;
  };
  error?: string;
}

// Base XP values for each training mode
const BASE_XP: Record<string, number> = {
  'bobs-27': 70,
  'around-the-clock-singles': 40,
  'around-the-clock-doubles': 60,
  'around-the-clock-trebles': 65,
  'around-the-clock-mixed': 80,
  'finish-training': 100,
  'jdc-challenge': 110,
  'killer': 130,
  'pdc-challenge': 150,
  'form-analysis': 200,
  '121-dartbot': 50,
  '301-dartbot': 90,
  '501-dartbot': 100,
};

// XP for failed attempts in 121 training
export const FAILED_ATTEMPT_XP = 2;

// XP for successful checkout in 121 training (based on target value)
// Formula: 15 + (target - 121) * 1.5, rounded
// 121: 15, 122: 17, 123: 18, 124: 20, etc.
export function calculate121CheckoutXP(targetValue: number): number {
  if (targetValue < 121) return 10;
  const xp = Math.round(15 + (targetValue - 121) * 1.5);
  return Math.max(15, xp);
}

// Performance thresholds for different modes
interface Thresholds {
  poor: number;
  fair: number;
  good: number;
  great: number;
  excellent: number;
}

const PERFORMANCE_THRESHOLDS: Record<string, Thresholds> = {
  'bobs-27': { poor: 0, fair: 27, good: 100, great: 200, excellent: 500 },
  'around-the-clock-singles': { poor: 100, fair: 80, good: 60, great: 45, excellent: 35 },
  'around-the-clock-doubles': { poor: 120, fair: 100, good: 80, great: 60, excellent: 45 },
  'around-the-clock-trebles': { poor: 140, fair: 120, good: 100, great: 75, excellent: 55 },
  'jdc-challenge': { poor: 200, fair: 350, good: 500, great: 650, excellent: 750 },
  'pdc-challenge': { poor: 300, fair: 500, good: 700, great: 900, excellent: 1100 },
  'killer': { poor: 3, fair: 5, good: 8, great: 12, excellent: 18 },
  'finish-training': { poor: 30, fair: 50, good: 70, great: 85, excellent: 95 },
};

// DartBot thresholds based on 3-dart average
const DARTBOT_THRESHOLDS: Thresholds = {
  poor: 30,
  fair: 45,
  good: 60,
  great: 75,
  excellent: 90,
};

/**
 * Calculate XP for a training mode
 */
export function calculateTrainingXP(
  mode: string,
  performanceMetric: number,
  options?: {
    completed?: boolean;
    won?: boolean;
    threeDartAvg?: number;
  }
): XPBreakdown {
  const baseXP = BASE_XP[mode] || 50;
  let performanceBonus = 0;
  let winBonus = 0;
  const completionBonus = options?.completed !== false ? Math.floor(baseXP * 0.1) : 0;

  // Handle DartBot matches with average
  if (mode.includes('dartbot') && options?.threeDartAvg) {
    const avg = options.threeDartAvg;
    if (avg >= DARTBOT_THRESHOLDS.excellent) {
      performanceBonus = Math.floor(baseXP * 0.5);
    } else if (avg >= DARTBOT_THRESHOLDS.great) {
      performanceBonus = Math.floor(baseXP * 0.25);
    } else if (avg >= DARTBOT_THRESHOLDS.good) {
      performanceBonus = Math.floor(baseXP * 0.1);
    } else if (avg < DARTBOT_THRESHOLDS.poor) {
      performanceBonus = -Math.floor(baseXP * 0.25);
    }
    
    if (options?.won) {
      winBonus = Math.floor(baseXP * 0.15);
    }
  } else {
    // Handle other training modes
    const thresholds = PERFORMANCE_THRESHOLDS[mode];
    if (thresholds) {
      if (performanceMetric >= thresholds.excellent) {
        performanceBonus = Math.floor(baseXP * 0.5);
      } else if (performanceMetric >= thresholds.great) {
        performanceBonus = Math.floor(baseXP * 0.25);
      } else if (performanceMetric >= thresholds.good) {
        performanceBonus = Math.floor(baseXP * 0.1);
      } else if (performanceMetric < thresholds.poor) {
        performanceBonus = -Math.floor(baseXP * 0.25);
      }
    }
  }

  const total = Math.max(10, baseXP + performanceBonus + winBonus + completionBonus);

  return {
    base: baseXP,
    performanceBonus,
    winBonus,
    completionBonus,
    total,
  };
}

/**
 * Award XP to the current user
 */
export async function awardXP(
  mode: string,
  performanceMetric: number,
  options?: {
    completed?: boolean;
    won?: boolean;
    threeDartAvg?: number;
    sessionData?: Record<string, any>;
    xpOverride?: number; // Use this exact XP value instead of calculating
  }
): Promise<XPAwardResult> {
  const supabase = createClient();
  
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('[XP Tracker] No user found');
      return { success: false, xpBreakdown: {} as XPBreakdown, error: 'Not authenticated' };
    }

    console.log('[XP Tracker] Awarding XP:', { mode, xpOverride: options?.xpOverride, userId: user.id });

    // Calculate XP or use override
    let xpBreakdown: XPBreakdown;
    if (options?.xpOverride !== undefined) {
      xpBreakdown = {
        base: options.xpOverride,
        performanceBonus: 0,
        winBonus: 0,
        completionBonus: 0,
        total: options.xpOverride,
      };
    } else {
      xpBreakdown = calculateTrainingXP(mode, performanceMetric, options);
    }

    console.log('[XP Tracker] XP Breakdown:', xpBreakdown);

    // Call the database function to record match with XP
    const { data, error } = await supabase.rpc('record_training_match', {
      p_player_id: user.id,
      p_training_mode: mode,
      p_game_mode: options?.sessionData?.gameMode || 501,
      p_score: performanceMetric,
      p_completed: options?.completed ?? true,
      p_won: options?.won ?? true,
      p_session_data: options?.sessionData || {},
      p_xp_earned: xpBreakdown.total,
    });

    if (error) {
      console.error('[XP Tracker] Error recording XP:', error);
      return { success: false, xpBreakdown, error: error.message };
    }

    console.log('[XP Tracker] Record training match result:', data);

    // Get updated training level
    const { data: levelData, error: levelError } = await supabase.rpc('get_player_training_level', {
      p_user_id: user.id,
    });

    if (levelError) {
      console.error('[XP Tracker] Error getting training level:', levelError);
    }

    console.log('[XP Tracker] Training level data:', levelData);

    // Show toast notification
    const modeName = mode.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let message = `+${xpBreakdown.total} XP Earned! ${modeName}`;
    if (xpBreakdown.performanceBonus > 0) {
      message += ` | Performance Bonus: +${xpBreakdown.performanceBonus}`;
    }
    if (xpBreakdown.winBonus > 0) {
      message += ` | Win Bonus: +${xpBreakdown.winBonus}`;
    }
    toast.success(message, { duration: 4000 });

    return {
      success: true,
      xpBreakdown,
      newTotalXP: levelData?.total_xp,
      levelUp: levelData?.leveled_up ? {
        oldLevel: levelData.old_level,
        newLevel: levelData.new_level,
      } : undefined,
    };
  } catch (err) {
    console.error('[XP Tracker] Unexpected error:', err);
    return { 
      success: false, 
      xpBreakdown: calculateTrainingXP(mode, performanceMetric, options),
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
}

/**
 * Award XP for DartBot match
 */
export async function awardDartBotXP(
  gameMode: 301 | 501,
  threeDartAvg: number,
  won: boolean,
  stats: {
    legsWon: number;
    legsLost: number;
    highestCheckout: number;
    totalDarts: number;
    visits100Plus: number;
    visits140Plus: number;
    visits180: number;
  }
): Promise<XPAwardResult> {
  const supabase = createClient();
  
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, xpBreakdown: {} as XPBreakdown, error: 'Not authenticated' };
    }

    const mode = `${gameMode}-dartbot`;
    const xpBreakdown = calculateTrainingXP(mode, 0, { won, threeDartAvg });

    // Record via DartBot-specific function
    const { data, error } = await supabase.rpc('record_dartbot_match_with_xp', {
      p_player_id: user.id,
      p_game_mode: gameMode,
      p_match_format: 'dartbot',
      p_dartbot_level: 4,
      p_player_legs_won: stats.legsWon,
      p_bot_legs_won: stats.legsLost,
      p_winner: won ? 'player' : 'dartbot',
      p_player_stats: {
        threeDartAverage: threeDartAvg,
        first9Average: threeDartAvg,
        highestCheckout: stats.highestCheckout,
        checkoutPercentage: 0,
        totalDartsThrown: stats.totalDarts,
        visits100Plus: stats.visits100Plus,
        visits140Plus: stats.visits140Plus,
        visits180: stats.visits180,
      },
    });

    if (error) {
      console.error('[XP Tracker] Error recording DartBot XP:', error);
      return { success: false, xpBreakdown, error: error.message };
    }

    // Show success toast
    let message = `+${xpBreakdown.total} XP Earned! ${gameMode} vs DartBot • ${won ? 'Victory!' : 'Defeat'}`;
    if (won) {
      message += ' | Win Bonus Applied';
    }
    toast.success(message, { duration: 4000 });

    return {
      success: true,
      xpBreakdown,
    };
  } catch (err) {
    console.error('[XP Tracker] DartBot error:', err);
    return { 
      success: false, 
      xpBreakdown: calculateTrainingXP(`${gameMode}-dartbot`, 0, { won, threeDartAvg }),
      error: err instanceof Error ? err.message : 'Unknown error' 
    };
  }
}

/**
 * Get XP breakdown description
 */
export function getXPDescription(xp: XPBreakdown): string {
  const parts: string[] = [`Base: ${xp.base}`];
  if (xp.completionBonus > 0) parts.push(`Completion: +${xp.completionBonus}`);
  if (xp.performanceBonus > 0) parts.push(`Performance: +${xp.performanceBonus}`);
  if (xp.winBonus > 0) parts.push(`Win: +${xp.winBonus}`);
  return parts.join(' • ');
}
