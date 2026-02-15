/**
 * Achievement Tracker
 * Tracks user progress and awards achievements
 */

import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export interface AchievementProgress {
  achievement_id: string;
  progress: number;
  completed: boolean;
  completed_at?: string;
}

export interface StatUpdate {
  userId: string;
  statKey: string;
  value: number;
  increment?: boolean;
}

// Achievement definitions with their stat keys and goals
export const ACHIEVEMENT_DEFINITIONS: Record<string, { goal: number; statKey: string; title: string }> = {
  // 180s
  'boom': { goal: 1, statKey: 'oneEighties', title: 'Boom!' },
  'maximum-effort': { goal: 5, statKey: 'oneEighties', title: 'Maximum Effort' },
  'ton-80-club': { goal: 10, statKey: 'oneEighties', title: 'The Ton 80 Club' },
  'treble-trouble': { goal: 25, statKey: 'oneEighties', title: 'Treble Trouble' },
  '180-machine': { goal: 50, statKey: 'oneEighties', title: '180 Machine' },
  'maximum-overload': { goal: 100, statKey: 'oneEighties', title: 'Maximum Overload' },
  'treble-factory': { goal: 250, statKey: 'oneEighties', title: 'Treble Factory' },
  'treble-god': { goal: 500, statKey: 'oneEighties', title: 'Treble God' },
  
  // 100+ scores
  'ton-up': { goal: 1, statKey: 'count100Plus', title: 'Ton Up' },
  'ton-machine': { goal: 10, statKey: 'count100Plus', title: 'Ton Machine' },
  
  // 26s (Funny)
  'feared-number': { goal: 1, statKey: 'score_26', title: 'The Feared Number' },
  'double-13-specialist': { goal: 10, statKey: 'score_26', title: 'Double 13 Specialist' },
  'pain-merchant': { goal: 50, statKey: 'score_26', title: 'Pain Merchant' },
  'anti-checkout': { goal: 100, statKey: 'score_26', title: 'Anti-Checkout' },
  
  // Checkouts
  'checked-out': { goal: 1, statKey: 'checkoutsMade', title: 'Checked Out' },
  
  // Practice
  'warm-up': { goal: 10, statKey: 'training_matches', title: 'Warm Up' },
  'dedicated': { goal: 50, statKey: 'training_matches', title: 'Dedicated' },
  'training-arc': { goal: 100, statKey: 'training_matches', title: 'Training Arc' },
  
  // Around The Clock
  'clock-starter': { goal: 1, statKey: 'atc_completions', title: 'Clock Starter' },
  'clock-master': { goal: 10, statKey: 'atc_completions', title: 'Clock Master' },
  'clock-legend': { goal: 50, statKey: 'atc_completions', title: 'Clock Legend' },
  
  // Ranked
  'ranked-rookie': { goal: 1, statKey: 'ranked_matches_played', title: 'Ranked Rookie' },
  'on-the-ladder': { goal: 5, statKey: 'ranked_wins', title: 'On The Ladder' },
  'ranked-grinder': { goal: 25, statKey: 'ranked_wins', title: 'Ranked Grinder' },
  'sweaty-hands': { goal: 50, statKey: 'ranked_wins', title: 'Sweaty Hands' },
  'the-tryhard': { goal: 100, statKey: 'ranked_wins', title: 'The Tryhard' },
  
  // Tournaments
  'first-blood': { goal: 1, statKey: 'tournament_matches_won', title: 'First Blood' },
  'champion': { goal: 1, statKey: 'tournaments_won', title: 'Champion' },
  'serial-winner': { goal: 5, statKey: 'tournaments_won', title: 'Serial Winner' },
  'trophy-cabinet': { goal: 10, statKey: 'tournaments_won', title: 'Trophy Cabinet' },
  'elite-champion': { goal: 25, statKey: 'tournaments_won', title: 'Elite Champion' },
  'tournament-monster': { goal: 50, statKey: 'tournaments_won', title: 'Tournament Monster' },
  'legendary': { goal: 100, statKey: 'tournaments_won', title: 'Legendary' },
  
  // League
  'joined-ranks': { goal: 1, statKey: 'leagues_joined', title: 'Joined the Ranks' },
  'league-winner': { goal: 1, statKey: 'leagues_won', title: 'League Winner' },
  'dominant-season': { goal: 5, statKey: 'leagues_won', title: 'Dominant Season' },
  'dynasty': { goal: 10, statKey: 'leagues_won', title: 'Dynasty' },
  'immortal': { goal: 25, statKey: 'leagues_won', title: 'Immortal' },
  'the-gaffer': { goal: 1, statKey: 'leagues_created', title: 'The Gaffer' },
  'promotion-party': { goal: 1, statKey: 'promotions', title: 'Promotion Party' },
  'relegation-tears': { goal: 2, statKey: 'relegations', title: 'Relegation Tears' },
};

// Special boolean achievements (one-time events)
export const BOOLEAN_ACHIEVEMENTS: Record<string, { title: string; description: string }> = {
  'back-to-back': { title: 'Back-to-Back', description: 'Hit 2 consecutive 180s in one match' },
  '180-under-pressure': { title: '180 Under Pressure', description: 'Hit a 180 to win a deciding leg' },
  'cool-hand': { title: 'Cool Hand', description: 'Checkout above 100' },
  'big-finish': { title: 'Big Finish', description: 'Checkout above 120' },
  'clutch-finisher': { title: 'Clutch Finisher', description: 'Checkout above 150' },
  '170-club': { title: '170 Club', description: 'Checkout 170' },
  'out-in-style': { title: 'Out in Style', description: 'Checkout with bull' },
  'ice-cold': { title: 'Ice Cold', description: 'Checkout on first dart at double' },
  'shanghai-surprise': { title: 'Shanghai Surprise', description: 'Hit a Shanghai finish' },
  'the-wall': { title: 'The Wall', description: 'Win a match without dropping a leg' },
  'early-doors': { title: 'Early Doors', description: 'Win a match in under 10 minutes' },
  'dartboard-hates-me': { title: 'Dartboard Hates Me', description: 'Score 26 three times in one match' },
  'win-streak': { title: 'Win Streak', description: 'Win 5 ranked matches in a row' },
  'unstoppable': { title: 'Unstoppable', description: 'Win 10 ranked matches in a row' },
  'revenge-arc': { title: 'Revenge Arc', description: 'Beat a player who beat you last time' },
  'bracket-buster': { title: 'Bracket Buster', description: 'Win a tournament without losing a leg' },
  'final-boss': { title: 'Final Boss', description: 'Win a tournament final from behind' },
  'weekend-warrior': { title: 'Weekend Warrior', description: 'Win a weekend tournament' },
  'invincible-season': { title: 'Invincible Season', description: 'Finish a league unbeaten' },
  'great-escape': { title: 'Great Escape', description: 'Avoid relegation on the final match' },
  'robin-hood': { title: 'Robin Hood', description: 'Hit the same treble 3 darts in a row' },
  'speed-runner': { title: 'Speed Runner', description: 'Complete Around The Clock under 5 minutes' },
  'pub-thrower': { title: 'The Pub Thrower', description: 'Win with lower average than opponent' },
  'bottle-job': { title: 'The Bottle Job', description: 'Lose a match from 1 dart away' },
  'wall-inspector': { title: 'The Wall Inspector', description: 'Miss the board 10 times in 1 game' },
  'nice': { title: 'Nice.', description: 'Score exactly 69' },
  'double-trouble': { title: 'Double Trouble', description: 'Miss 5 doubles in a row' },
};

/**
 * Track a stat update and check for achievement unlocks
 */
export async function trackStat(userId: string, statKey: string, value: number, increment: boolean = true) {
  const supabase = createClient();
  
  try {
    // Get current user stats
    const { data: userStats } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    // Calculate new value
    let newValue = value;
    if (increment && userStats) {
      const currentValue = userStats[statKey] || 0;
      newValue = currentValue + value;
    }
    
    // Update user_stats
    await supabase
      .from('user_stats')
      .upsert({ 
        user_id: userId, 
        [statKey]: newValue,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    
    // Check for achievements with this stat key
    const achievementsToCheck = Object.entries(ACHIEVEMENT_DEFINITIONS)
      .filter(([_, def]) => def.statKey === statKey);
    
    for (const [achievementId, definition] of achievementsToCheck) {
      if (newValue >= definition.goal) {
        await awardAchievement(userId, achievementId, definition.title);
      }
    }
    
    return newValue;
  } catch (error) {
    console.error('[AchievementTracker] Error tracking stat:', error);
    return value;
  }
}

/**
 * Award an achievement to a user
 */
export async function awardAchievement(userId: string, achievementId: string, title?: string) {
  const supabase = createClient();
  
  try {
    // Check if already completed
    const { data: existing } = await supabase
      .from('user_achievements')
      .select('completed')
      .eq('user_id', userId)
      .eq('achievement_id', achievementId)
      .single();
    
    if (existing?.completed) return false;
    
    // Award the achievement
    const { error } = await supabase
      .from('user_achievements')
      .upsert({
        user_id: userId,
        achievement_id: achievementId,
        progress: 100,
        completed: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,achievement_id' });
    
    if (error) {
      console.error('[AchievementTracker] Error awarding achievement:', error);
      return false;
    }
    
    // Show toast notification
    const displayTitle = title || ACHIEVEMENT_DEFINITIONS[achievementId]?.title || BOOLEAN_ACHIEVEMENTS[achievementId]?.title || achievementId;
    toast.success(`Achievement Unlocked: ${displayTitle}!`, {
      icon: '🏆',
      duration: 4000
    });
    
    return true;
  } catch (error) {
    console.error('[AchievementTracker] Error awarding achievement:', error);
    return false;
  }
}

/**
 * Update achievement progress (for counter achievements)
 */
export async function updateAchievementProgress(userId: string, achievementId: string, progress: number, goal: number) {
  const supabase = createClient();
  
  try {
    const completed = progress >= goal;
    
    const { error } = await supabase
      .from('user_achievements')
      .upsert({
        user_id: userId,
        achievement_id: achievementId,
        progress: Math.min(progress, goal),
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,achievement_id' });
    
    if (error) {
      console.error('[AchievementTracker] Error updating progress:', error);
      return false;
    }
    
    // Show toast if just completed
    if (completed) {
      const title = ACHIEVEMENT_DEFINITIONS[achievementId]?.title || achievementId;
      toast.success(`Achievement Unlocked: ${title}!`, {
        icon: '🏆',
        duration: 4000
      });
    }
    
    return true;
  } catch (error) {
    console.error('[AchievementTracker] Error updating progress:', error);
    return false;
  }
}

/**
 * Track a visit score and check for achievements
 */
export async function trackScoreAchievement(score: number, userId: string, context?: {
  isDecidingLeg?: boolean;
  isCheckout?: boolean;
  checkoutValue?: number;
  isBull?: boolean;
  dartsAtDouble?: number;
  matchType?: 'ranked' | 'tournament' | 'league' | 'practice' | 'atc' | 'private';
}) {
  if (!userId) return;
  
  // Track 180s
  if (score === 180) {
    await trackStat(userId, 'oneEighties', 1);
  }
  
  // Track 100+ scores
  if (score >= 100 && score < 180) {
    await trackStat(userId, 'count100Plus', 1);
  }
  
  // Track 26s (the feared number)
  if (score === 26) {
    await trackStat(userId, 'score_26', 1);
  }
  
  // Track 69 (Nice.)
  if (score === 69) {
    await awardAchievement(userId, 'nice', 'Nice.');
  }
  
  // Track checkout achievements
  if (context?.isCheckout) {
    await trackStat(userId, 'checkoutsMade', 1);
    
    // Checkout value achievements
    if (context.checkoutValue && context.checkoutValue >= 170) {
      await awardAchievement(userId, '170-club', '170 Club');
    } else if (context.checkoutValue && context.checkoutValue >= 150) {
      await awardAchievement(userId, 'clutch-finisher', 'Clutch Finisher');
    } else if (context.checkoutValue && context.checkoutValue >= 120) {
      await awardAchievement(userId, 'big-finish', 'Big Finish');
    } else if (context.checkoutValue && context.checkoutValue >= 100) {
      await awardAchievement(userId, 'cool-hand', 'Cool Hand');
    }
    
    // Bull checkout
    if (context.isBull) {
      await awardAchievement(userId, 'out-in-style', 'Out in Style');
    }
    
    // First dart checkout
    if (context.dartsAtDouble === 1) {
      await awardAchievement(userId, 'ice-cold', 'Ice Cold');
    }
  }
}

/**
 * Track match end and check for match-based achievements
 */
export async function trackMatchEnd(userId: string, matchData: {
  won: boolean;
  matchType: 'ranked' | 'tournament' | 'league' | 'practice' | 'atc' | 'private';
  legsWon: number;
  legsLost: number;
  average: number;
  durationMinutes: number;
  opponentAverage?: number;
  opponentId?: string;
  isDecidingLeg?: boolean;
  wonFromBehind?: boolean;
  isWeekend?: boolean;
}) {
  if (!userId) return;
  
  const supabase = createClient();
  
  // Track wins by type
  if (matchData.won) {
    // Ranked wins
    if (matchData.matchType === 'ranked') {
      await trackStat(userId, 'ranked_wins', 1);
    }
    
    // Tournament wins
    if (matchData.matchType === 'tournament') {
      await trackStat(userId, 'tournament_matches_won', 1);
    }
    
    // The Wall (win without dropping a leg)
    if (matchData.legsLost === 0) {
      await awardAchievement(userId, 'the-wall', 'The Wall');
      
      if (matchData.matchType === 'tournament') {
        await awardAchievement(userId, 'bracket-buster', 'Bracket Buster');
      }
    }
    
    // Early Doors (win in under 10 minutes)
    if (matchData.durationMinutes < 10) {
      await awardAchievement(userId, 'early-doors', 'Early Doors');
    }
    
    // Pub Thrower (win with lower average)
    if (matchData.opponentAverage && matchData.average < matchData.opponentAverage) {
      await awardAchievement(userId, 'pub-thrower', 'The Pub Thrower');
    }
    
    // Final Boss (won from behind in final)
    if (matchData.wonFromBehind && matchData.isDecidingLeg) {
      await awardAchievement(userId, 'final-boss', 'Final Boss');
    }
    
    // Weekend Warrior
    if (matchData.isWeekend) {
      await awardAchievement(userId, 'weekend-warrior', 'Weekend Warrior');
    }
  } else {
    // Lost - check for bottle job (lost from 1 dart away)
    // This would need to be tracked during the match
  }
  
  // Track average achievements
  if (matchData.average >= 100) {
    await awardAchievement(userId, 'centurion', 'Centurion');
  } else if (matchData.average >= 80) {
    await awardAchievement(userId, 'serious-business', 'Serious Business');
  } else if (matchData.average >= 60) {
    await awardAchievement(userId, 'heavy-scorer', 'Heavy Scorer');
  }
  
  // Track match played
  if (matchData.matchType === 'ranked') {
    await trackStat(userId, 'ranked_matches_played', 1);
  }
  
  if (matchData.matchType === 'private') {
    await awardAchievement(userId, 'friendly-fire', 'Friendly Fire');
  }
}

/**
 * Get all achievement progress for a user
 */
export async function getUserAchievementProgress(userId: string): Promise<AchievementProgress[]> {
  const supabase = createClient();
  
  try {
    const { data, error } = await supabase
      .from('user_achievements')
      .select('achievement_id, progress, completed, completed_at')
      .eq('user_id', userId);
    
    if (error) {
      console.error('[AchievementTracker] Error fetching progress:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('[AchievementTracker] Error fetching progress:', error);
    return [];
  }
}

/**
 * Get recent achievements for dashboard
 */
export async function getRecentAchievements(userId: string, limit: number = 5): Promise<AchievementProgress[]> {
  const supabase = createClient();
  
  try {
    const { data, error } = await supabase
      .from('user_achievements')
      .select('achievement_id, progress, completed, completed_at')
      .eq('user_id', userId)
      .eq('completed', true)
      .order('completed_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('[AchievementTracker] Error fetching recent:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('[AchievementTracker] Error fetching recent:', error);
    return [];
  }
}
