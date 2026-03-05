// Achievement tracking utilities for real-time progress updates
import { createClient } from '@/lib/supabase/client';

export interface MatchData {
  won: boolean;
  average: number;
  one_eighties: number;
  hundreds: number;
  highest_checkout: number;
  checkouts: number;
  match_type: 'career' | 'tournament' | 'ranked' | 'practice' | 'atc' | 'league';
  legs_won: number;
  legs_lost: number;
  scores?: number[]; // All scores for specific achievements like 69, 26, etc.
}

export async function trackMatchAchievements(matchData: MatchData) {
  try {
    const supabase = createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Track the match achievements via our RPC
    const { data, error } = await supabase.rpc('rpc_track_match_achievements', {
      p_match_data: matchData
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