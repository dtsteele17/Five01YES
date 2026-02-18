/**
 * Training Mode XP System
 * 
 * Difficulty Tiers (Easiest to Hardest):
 * 1. Beginner: Around the Clock (Singles), 121 vs DartBot
 * 2. Easy: Around the Clock (Doubles/Trebles), Bob's 27
 * 3. Intermediate: Finish Training, JDC Challenge, 501 vs DartBot
 * 4. Advanced: Killer, PDC Challenge
 * 5. Expert: Form Analysis
 * 
 * Base XP by Difficulty:
 * - Beginner: 40-60 XP
 * - Easy: 60-80 XP  
 * - Intermediate: 80-120 XP
 * - Advanced: 120-180 XP
 * - Expert: 200+ XP
 */

export type TrainingMode = 
  | 'around-the-clock-singles'
  | 'around-the-clock-doubles'
  | 'around-the-clock-trebles'
  | 'around-the-clock-mixed'
  | '121-dartbot'
  | '501-dartbot'
  | '301-dartbot'
  | 'bobs-27'
  | 'finish-training'
  | 'jdc-challenge'
  | 'killer'
  | 'pdc-challenge'
  | 'form-analysis';

export interface XPResult {
  baseXP: number;
  performanceBonus: number;
  completionBonus: number;
  totalXP: number;
  performanceRating: 'Poor' | 'Fair' | 'Good' | 'Great' | 'Excellent';
}

// Base XP values for each training mode
const BASE_XP: Record<TrainingMode, number> = {
  // Beginner (40-60 XP)
  'around-the-clock-singles': 40,
  '121-dartbot': 50,
  
  // Easy (60-80 XP)
  'around-the-clock-doubles': 60,
  'around-the-clock-trebles': 65,
  'bobs-27': 70,
  
  // Intermediate (80-120 XP)
  'around-the-clock-mixed': 80,
  'finish-training': 100,
  'jdc-challenge': 110,
  '301-dartbot': 90,
  '501-dartbot': 100,
  
  // Advanced (120-180 XP)
  'killer': 130,
  'pdc-challenge': 150,
  
  // Expert (200+ XP)
  'form-analysis': 200,
};

// Performance thresholds for different modes
interface PerformanceThresholds {
  poor: number;    // Below this: reduced XP
  fair: number;    // At this: base XP only
  good: number;    // At this: +10% bonus
  great: number;   // At this: +25% bonus
  excellent: number; // At this: +50% bonus
}

// Checkout XP tiers - higher checkouts = more XP
// These are per-checkout rewards for endless training modes
export const CHECKOUT_XP_TIERS = [
  { max: 20, baseXP: 5, description: 'Easy' },      // 2-20: Simple doubles
  { max: 40, baseXP: 10, description: 'Moderate' }, // 21-40: Standard finishes
  { max: 60, baseXP: 15, description: 'Tricky' },   // 41-60: Requires setup
  { max: 80, baseXP: 25, description: 'Hard' },     // 61-80: Multi-dart checkouts
  { max: 100, baseXP: 40, description: 'Expert' },  // 81-100: Advanced checkouts
  { max: 120, baseXP: 60, description: 'Master' },  // 101-120: High level
  { max: 140, baseXP: 80, description: 'Elite' },   // 121-140: Very difficult
  { max: 170, baseXP: 100, description: 'Legendary' }, // 141-170: Maximum reward
];

/**
 * Calculate XP for a single checkout in endless training modes
 * Higher checkouts = exponentially more XP
 */
export function calculateCheckoutXP(checkoutValue: number): number {
  if (checkoutValue <= 0 || checkoutValue > 170) return 0;
  
  for (const tier of CHECKOUT_XP_TIERS) {
    if (checkoutValue <= tier.max) {
      // Add a small bonus based on exact value within tier
      const tierMin = tier.max === 20 ? 2 : CHECKOUT_XP_TIERS.find(t => t.max === tier.max - 20)?.max || 0;
      const tierRange = tier.max - tierMin;
      const valueProgress = (checkoutValue - tierMin) / tierRange;
      const bonus = Math.floor(valueProgress * 5); // Up to 5 bonus XP for higher end of tier
      
      return tier.baseXP + bonus;
    }
  }
  
  return 5; // Fallback
}

// Mode-specific performance metrics
const PERFORMANCE_THRESHOLDS: Partial<Record<TrainingMode, PerformanceThresholds>> = {
  // Around the Clock - based on darts used (lower is better)
  'around-the-clock-singles': { poor: 100, fair: 80, good: 60, great: 45, excellent: 35 },
  'around-the-clock-doubles': { poor: 120, fair: 100, good: 80, great: 60, excellent: 45 },
  'around-the-clock-trebles': { poor: 140, fair: 120, good: 100, great: 75, excellent: 55 },
  
  // Bob's 27 - based on score (higher is better)
  'bobs-27': { poor: 0, fair: 27, good: 100, great: 200, excellent: 500 },
  
  // Finish Training - based on checkout success rate %
  'finish-training': { poor: 30, fair: 50, good: 70, great: 85, excellent: 95 },
  
  // JDC Challenge - based on total score (out of 840)
  'jdc-challenge': { poor: 200, fair: 350, good: 500, great: 650, excellent: 750 },
  
  // PDC Challenge - based on total score (out of variable)
  'pdc-challenge': { poor: 300, fair: 500, good: 700, great: 900, excellent: 1100 },
  
  // Killer - based on rounds survived / darts accuracy
  'killer': { poor: 3, fair: 5, good: 8, great: 12, excellent: 18 },
};

// DartBot matches - based on 3-dart average
const DARTBOT_THRESHOLDS: PerformanceThresholds = {
  poor: 30,
  fair: 45,
  good: 60,
  great: 75,
  excellent: 90,
};

/**
 * Calculate XP for a training session
 */
export function calculateXP(
  mode: TrainingMode,
  performanceMetric: number, // Meaning depends on mode (darts, score, %, etc.)
  options?: {
    completed?: boolean;      // Did they finish the session?
    won?: boolean;            // For vs DartBot modes
    threeDartAvg?: number;    // For DartBot matches
  }
): XPResult {
  const baseXP = BASE_XP[mode] || 50;
  let performanceBonus = 0;
  let completionBonus = 0;
  let performanceRating: XPResult['performanceRating'] = 'Fair';

  // Completion bonus (always given for completing)
  if (options?.completed !== false) {
    completionBonus = Math.floor(baseXP * 0.1); // 10% bonus for completion
  }

  // Performance bonus calculation
  const thresholds = PERFORMANCE_THRESHOLDS[mode];
  
  if (thresholds) {
    if (performanceMetric >= thresholds.excellent) {
      performanceBonus = Math.floor(baseXP * 0.5); // +50%
      performanceRating = 'Excellent';
    } else if (performanceMetric >= thresholds.great) {
      performanceBonus = Math.floor(baseXP * 0.25); // +25%
      performanceRating = 'Great';
    } else if (performanceMetric >= thresholds.good) {
      performanceBonus = Math.floor(baseXP * 0.1); // +10%
      performanceRating = 'Good';
    } else if (performanceMetric < thresholds.poor) {
      // Poor performance - reduce XP
      performanceBonus = -Math.floor(baseXP * 0.25); // -25%
      performanceRating = 'Poor';
    }
  }

  // Special handling for DartBot matches (use 3-dart average)
  if (mode.includes('dartbot') && options?.threeDartAvg) {
    const avg = options.threeDartAvg;
    if (avg >= DARTBOT_THRESHOLDS.excellent) {
      performanceBonus = Math.floor(baseXP * 0.5);
      performanceRating = 'Excellent';
    } else if (avg >= DARTBOT_THRESHOLDS.great) {
      performanceBonus = Math.floor(baseXP * 0.25);
      performanceRating = 'Great';
    } else if (avg >= DARTBOT_THRESHOLDS.good) {
      performanceBonus = Math.floor(baseXP * 0.1);
      performanceRating = 'Good';
    } else if (avg < DARTBOT_THRESHOLDS.poor) {
      performanceBonus = -Math.floor(baseXP * 0.25);
      performanceRating = 'Poor';
    }
    
    // Win bonus
    if (options?.won) {
      performanceBonus += Math.floor(baseXP * 0.15); // +15% for winning
    }
  }

  const totalXP = Math.max(10, baseXP + performanceBonus + completionBonus); // Minimum 10 XP

  return {
    baseXP,
    performanceBonus,
    completionBonus,
    totalXP,
    performanceRating,
  };
}

/**
 * Get XP breakdown description for display
 */
export function getXPBreakdown(result: XPResult): string {
  const parts: string[] = [];
  parts.push(`Base: ${result.baseXP}`);
  
  if (result.completionBonus > 0) {
    parts.push(`Completion: +${result.completionBonus}`);
  }
  
  if (result.performanceBonus > 0) {
    parts.push(`Performance: +${result.performanceBonus}`);
  } else if (result.performanceBonus < 0) {
    parts.push(`Performance: ${result.performanceBonus}`);
  }
  
  return parts.join(' • ');
}

/**
 * Get performance description for a specific mode
 */
export function getPerformanceDescription(mode: TrainingMode, metric: number): string {
  const thresholds = PERFORMANCE_THRESHOLDS[mode];
  if (!thresholds) return '';

  if (metric >= thresholds.excellent) return 'Outstanding performance!';
  if (metric >= thresholds.great) return 'Great job!';
  if (metric >= thresholds.good) return 'Good performance!';
  if (metric >= thresholds.fair) return 'Fair performance';
  return 'Keep practicing!';
}

// Export training mode info for display
export const TRAINING_MODE_INFO: Record<TrainingMode, { name: string; difficulty: string; description: string }> = {
  'around-the-clock-singles': { 
    name: 'Around the Clock (Singles)', 
    difficulty: 'Beginner', 
    description: 'Hit numbers 1-20 in order with singles' 
  },
  'around-the-clock-doubles': { 
    name: 'Around the Clock (Doubles)', 
    difficulty: 'Easy', 
    description: 'Hit numbers 1-20 in order with doubles' 
  },
  'around-the-clock-trebles': { 
    name: 'Around the Clock (Trebles)', 
    difficulty: 'Easy', 
    description: 'Hit numbers 1-20 in order with trebles' 
  },
  'around-the-clock-mixed': { 
    name: 'Around the Clock (Mixed)', 
    difficulty: 'Intermediate', 
    description: 'Progressive difficulty: singles, then doubles, then trebles' 
  },
  '121-dartbot': {
    name: '121',
    difficulty: 'Beginner',
    description: 'Quick checkout practice against AI'
  },
  '301-dartbot': { 
    name: '301 vs DartBot', 
    difficulty: 'Intermediate', 
    description: 'Standard 301 match against AI' 
  },
  '501-dartbot': { 
    name: '501 vs DartBot', 
    difficulty: 'Intermediate', 
    description: 'Standard 501 match against AI' 
  },
  'bobs-27': { 
    name: "Bob's 27", 
    difficulty: 'Easy', 
    description: 'Classic doubles practice game' 
  },
  'finish-training': { 
    name: 'Finish Training', 
    difficulty: 'Intermediate', 
    description: 'Practice checkouts from specific ranges' 
  },
  'jdc-challenge': { 
    name: 'JDC Challenge', 
    difficulty: 'Intermediate', 
    description: 'Junior Darts Corporation training routine' 
  },
  'killer': { 
    name: 'Killer', 
    difficulty: 'Advanced', 
    description: 'Strategic elimination game' 
  },
  'pdc-challenge': { 
    name: 'PDC Challenge', 
    difficulty: 'Advanced', 
    description: 'Professional practice routine' 
  },
  'form-analysis': { 
    name: 'Form Analysis', 
    difficulty: 'Expert', 
    description: 'AI-powered throwing form analysis' 
  },
};
