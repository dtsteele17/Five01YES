// Achievement tracking utilities for real-time progress updates
import { createClient } from '@/lib/supabase/client';

export interface MatchData {
  won: boolean;
  average: number;
  one_eighties?: number;
  hundreds?: number;
  highest_checkout?: number;
  checkouts?: number;
  match_type?: 'career' | 'tournament' | 'ranked' | 'practice' | 'atc' | 'league' | 'online' | 'private' | 'quick-match';
  matchType?: 'career' | 'tournament' | 'ranked' | 'practice' | 'atc' | 'league' | 'online' | 'private' | 'quick-match';
  legs_won?: number;
  legs_lost?: number;
  legsWon?: number;
  legsLost?: number;
  durationMinutes?: number;
  opponentAverage?: number;
  opponentId?: string;
  scores?: number[]; // All scores for specific achievements like 69, 26, etc.
}

export async function trackMatchAchievements(matchData: MatchData) {
  try {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Normalize match data to handle both naming conventions
    const normalizedData = {
      won: matchData.won,
      average: matchData.average,
      one_eighties: matchData.one_eighties || 0,
      hundreds: matchData.hundreds || 0,
      highest_checkout: matchData.highest_checkout || 0,
      checkouts: matchData.checkouts || 0,
      match_type: matchData.match_type || matchData.matchType || 'practice',
      legs_won: matchData.legs_won || matchData.legsWon || 0,
      legs_lost: matchData.legs_lost || matchData.legsLost || 0,
      scores: matchData.scores || []
    };

    // Track the match achievements via our RPC
    const { data, error } = await supabase.rpc('rpc_track_match_achievements', {
      p_match_data: normalizedData
    });

    if (error) {
      console.error('Failed to track achievements:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Achievement tracking error:', err);
    return null;
  }
}

export async function trackSingleAchievement(achievementCode: string, increment: number = 1) {
  try {
    const supabase = createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase.rpc('rpc_update_achievement_progress', {
      p_achievement_code: achievementCode,
      p_increment: increment
    });

    if (error) {
      console.error('Failed to track achievement:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Single achievement tracking error:', err);
    return null;
  }
}

// Track specific career achievements
export async function trackCareerAchievements(careerData: {
  action: 'started' | 'promoted' | 'tier_reached';
  tier?: number;
  season?: number;
}) {
  const achievements: string[] = [];

  switch (careerData.action) {
    case 'started':
      achievements.push('career-starter');
      break;
    case 'promoted':
      achievements.push('promotion-party');
      break;
    case 'tier_reached':
      if (careerData.tier === 3) achievements.push('tier-3-champion');
      if (careerData.tier === 5) achievements.push('career-legend');
      break;
  }

  for (const achievement of achievements) {
    await trackSingleAchievement(achievement);
  }
}

// Track tournament achievements
export async function trackTournamentAchievements(tournamentData: {
  action: 'match_won' | 'tournament_won';
  tournament_type?: string;
}) {
  const achievements: string[] = [];

  switch (tournamentData.action) {
    case 'match_won':
      achievements.push('first-blood');
      break;
    case 'tournament_won':
      achievements.push('champion', 'serial-winner', 'trophy-cabinet', 'elite-champion', 'tournament-monster', 'legendary');
      break;
  }

  for (const achievement of achievements) {
    await trackSingleAchievement(achievement);
  }
}

// Track training/practice achievements  
export async function trackTrainingAchievements(trainingData: {
  mode: 'practice' | 'atc';
  completed: boolean;
  time_taken?: number; // for ATC speed runs
}) {
  const achievements: string[] = [];

  if (trainingData.completed) {
    if (trainingData.mode === 'practice') {
      achievements.push('warm-up', 'dedicated', 'training-arc');
    } else if (trainingData.mode === 'atc') {
      achievements.push('clock-starter', 'clock-master', 'clock-legend');
      
      // Speed runner achievement
      if (trainingData.time_taken && trainingData.time_taken < 300000) { // Under 5 minutes
        achievements.push('speed-runner');
      }
    }
  }

  for (const achievement of achievements) {
    await trackSingleAchievement(achievement);
  }
}

// Track funny achievements based on scores
export async function trackScoreAchievements(scores: number[]) {
  const achievements: { [key: string]: number } = {};

  for (const score of scores) {
    // Track specific funny scores
    if (score === 69) {
      achievements['nice'] = (achievements['nice'] || 0) + 1;
    } else if (score === 26) {
      achievements['feared-number'] = (achievements['feared-number'] || 0) + 1;
      achievements['double-13-specialist'] = (achievements['double-13-specialist'] || 0) + 1;
      achievements['pain-merchant'] = (achievements['pain-merchant'] || 0) + 1;
      achievements['anti-checkout'] = (achievements['anti-checkout'] || 0) + 1;
    }
  }

  // Update achievements
  for (const [achievement, count] of Object.entries(achievements)) {
    await trackSingleAchievement(achievement, count);
  }
}

// Alias for trackMatchAchievements (legacy compatibility)
// Supports both old signature (matchData only) and new signature (userId, matchData)
export async function trackMatchEnd(userIdOrMatchData: string | MatchData, matchData?: MatchData) {
  // If first param is a string (userId), use the second param as matchData
  if (typeof userIdOrMatchData === 'string') {
    return trackMatchAchievements(matchData!);
  }
  // Otherwise, first param is matchData
  return trackMatchAchievements(userIdOrMatchData);
}

// Alias for trackScoreAchievements (legacy compatibility - singular vs plural)
// Supports both old signature (array of scores) and new signature (single score with metadata)
export async function trackScoreAchievement(
  scoreOrScores: number | number[],
  userId?: string,
  metadata?: {
    isCheckout?: boolean;
    checkoutValue?: number;
    matchType?: string;
    isBull?: boolean;
    dartsAtDouble?: number;
  }
) {
  // If it's an array, use the old behavior
  if (Array.isArray(scoreOrScores)) {
    return trackScoreAchievements(scoreOrScores);
  }

  // Otherwise, handle single score with metadata
  return trackScoreAchievements([scoreOrScores]);
}

// Generic stat tracking function (legacy compatibility)
// Supports both old signature (statType, value?) and new signature (userId, statType, value?)
export async function trackStat(
  userIdOrStatType: string,
  statTypeOrValue?: string | number,
  value?: number
) {
  // If second param is a string, it's the new signature (userId, statType, value?)
  if (typeof statTypeOrValue === 'string') {
    const statType = statTypeOrValue;
    const statMap: { [key: string]: string } = {
      'atc_completions': 'clock-starter',
      'atc_complete': 'clock-starter',
      'practice_complete': 'warm-up',
      'training_matches': 'dedicated',
      'training_session': 'dedicated',
    };

    const achievementCode = statMap[statType] || statType;
    return trackSingleAchievement(achievementCode, value || 1);
  }

  // Otherwise, it's the old signature (statType, value?)
  const statType = userIdOrStatType;
  const statMap: { [key: string]: string } = {
    'atc_completions': 'clock-starter',
    'atc_complete': 'clock-starter',
    'practice_complete': 'warm-up',
    'training_matches': 'dedicated',
    'training_session': 'dedicated',
  };

  const achievementCode = statMap[statType] || statType;
  return trackSingleAchievement(achievementCode, (statTypeOrValue as number) || 1);
}

// Award achievement directly (legacy compatibility)
// Supports both old signature (achievementCode) and new signature (userId, achievementCode, name?)
export async function awardAchievement(
  userIdOrCode: string,
  achievementCode?: string,
  name?: string
) {
  // If second param is provided, it's the new signature (userId, achievementCode, name?)
  if (achievementCode) {
    return trackSingleAchievement(achievementCode, 1);
  }
  // Otherwise, first param is the achievement code
  return trackSingleAchievement(userIdOrCode, 1);
}

export async function getUserAchievements() {
  try {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase.rpc('rpc_get_user_achievements');

    if (error) {
      console.error('Failed to get user achievements:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Get achievements error:', err);
    return null;
  }
}