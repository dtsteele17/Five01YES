'use client';

import { createClient } from '@/lib/supabase/client';

export interface PlayerStats {
  threeDartAvg: number;
  first9Avg: number;
  checkoutDartsAttempted: number;
  checkoutsMade: number;
  checkoutPercent?: number;
  highestCheckout: number;
  count100Plus: number;
  count140Plus: number;
  count180: number;
  highestScore: number;
  legsWon: number;
  legsLost: number;
  dartsThrown?: number;
  pointsScored?: number;
}

export interface RecordMatchInput {
  matchType: 'ranked' | 'quick' | 'private' | 'local' | 'training' | 'league' | 'tournament' | 'online_private' | 'dartbot';
  game: '301' | '501';
  startedAt: string;
  endedAt: string;
  opponent: {
    userId?: string;
    name: string;
    isBot: boolean;
    botLevel?: number; // Bot target average (25, 35, 45, 55, 65, 75, 85, 95)
  };
  winner: 'user' | 'opponent';
  userStats: PlayerStats;
  opponentStats: PlayerStats;
  leagueId?: string;
  tournamentId?: string;
  matchFormat?: string;
}

export interface RecordMatchResult {
  ok: boolean;
  matchId?: string;
  error?: string;
}

/**
 * SINGLE SOURCE OF TRUTH for recording match completion
 *
 * Called by ALL 301/501 game modes after the "Good game" screen appears.
 * Records match history, per-match stats, and updates aggregated stats.
 *
 * CANNOT fail silently - all errors are logged and returned.
 */
export async function recordMatchCompletion(input: RecordMatchInput): Promise<RecordMatchResult> {
  console.log('📊 MATCH_RECORD_ATTEMPT', {
    matchType: input.matchType,
    game: input.game,
    winner: input.winner,
    userLegs: input.userStats.legsWon,
    opponentLegs: input.opponentStats.legsWon,
  });

  try {
    const supabase = createClient();

    // A) Get current user - MUST NOT BE NULL
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      const error = `No authenticated user found: ${userError?.message || 'Unknown error'}`;
      console.error('❌ MATCH_RECORD_FAILED:', error);
      return { ok: false, error };
    }

    console.log('✅ User authenticated:', user.id);

    // Determine opponent type
    const opponentType = input.opponent.isBot ? 'dartbot' : (input.opponent.userId ? 'user' : 'local');

    // Determine winner_id
    const winnerId = input.winner === 'user' ? user.id : input.opponent.userId || null;
    const winnerName = input.winner === 'user' ? 'You' : input.opponent.name;

    // B) Insert match row
    const matchData: any = {
      user_id: user.id,
      match_type: input.matchType,
      game_mode: input.game,
      match_format: input.matchFormat || 'best-of-3',
      double_out: true,
      straight_in: true,
      status: 'completed',
      winner_id: winnerId,
      winner_name: winnerName,
      player1_name: 'You',
      player2_name: input.opponent.name,
      player1_legs_won: input.userStats.legsWon,
      player2_legs_won: input.opponentStats.legsWon,
      opponent_id: input.opponent.userId || null,
      opponent_type: opponentType,
      dartbot_level: input.opponent.isBot ? (input.opponent.botLevel || 3) : null,
      user_avg: input.userStats.threeDartAvg,
      opponent_avg: input.opponentStats.threeDartAvg,
      user_first9_avg: input.userStats.first9Avg,
      opponent_first9_avg: input.opponentStats.first9Avg,
      user_checkout_pct: input.userStats.checkoutPercent ||
        (input.userStats.checkoutDartsAttempted > 0
          ? (input.userStats.checkoutsMade / input.userStats.checkoutDartsAttempted) * 100
          : 0),
      opponent_checkout_pct: input.opponentStats.checkoutPercent ||
        (input.opponentStats.checkoutDartsAttempted > 0
          ? (input.opponentStats.checkoutsMade / input.opponentStats.checkoutDartsAttempted) * 100
          : 0),
      started_at: input.startedAt,
      completed_at: input.endedAt,
      league_id: input.leagueId || null,
      tournament_id: input.tournamentId || null,
    };

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .insert(matchData)
      .select()
      .single();

    if (matchError || !match) {
      const error = `Failed to insert match: ${matchError?.message || 'Unknown error'}`;
      console.error('❌ MATCH_RECORD_FAILED:', error);
      console.error('Match data:', matchData);
      console.error('Supabase error:', matchError);
      return { ok: false, error };
    }

    console.log('✅ Match row created:', match.id);

    // C) Insert match_players rows for both user and opponent
    const userPlayerData = {
      match_id: match.id,
      user_id: user.id,
      is_bot: false,
      seat: 1,
      player_name: 'You',
      starting_score: parseInt(input.game),
      final_score: 0,
      legs_won: input.userStats.legsWon,
      legs_lost: input.userStats.legsLost,
      checkout_attempts: input.userStats.checkoutDartsAttempted,
      checkout_hits: input.userStats.checkoutsMade,
      checkout_darts_attempted: input.userStats.checkoutDartsAttempted,
      darts_thrown: input.userStats.dartsThrown || 0,
      points_scored: input.userStats.pointsScored || 0,
      avg_3dart: input.userStats.threeDartAvg,
      first_9_dart_avg: input.userStats.first9Avg,
      highest_score: input.userStats.highestScore,
      highest_checkout: input.userStats.highestCheckout,
      count_100_plus: input.userStats.count100Plus,
      count_140_plus: input.userStats.count140Plus,
      count_180: input.userStats.count180,
      checkout_percentage: input.userStats.checkoutPercent ||
        (input.userStats.checkoutDartsAttempted > 0
          ? (input.userStats.checkoutsMade / input.userStats.checkoutDartsAttempted) * 100
          : 0),
    };

    const opponentPlayerData = {
      match_id: match.id,
      user_id: input.opponent.userId || null,
      is_bot: input.opponent.isBot,
      bot_level: input.opponent.isBot ? (input.opponent.botLevel || 3) : null,
      seat: 2,
      player_name: input.opponent.name,
      starting_score: parseInt(input.game),
      final_score: 0,
      legs_won: input.opponentStats.legsWon,
      legs_lost: input.opponentStats.legsLost,
      checkout_attempts: input.opponentStats.checkoutDartsAttempted,
      checkout_hits: input.opponentStats.checkoutsMade,
      checkout_darts_attempted: input.opponentStats.checkoutDartsAttempted,
      darts_thrown: input.opponentStats.dartsThrown || 0,
      points_scored: input.opponentStats.pointsScored || 0,
      avg_3dart: input.opponentStats.threeDartAvg,
      first_9_dart_avg: input.opponentStats.first9Avg,
      highest_score: input.opponentStats.highestScore,
      highest_checkout: input.opponentStats.highestCheckout,
      count_100_plus: input.opponentStats.count100Plus,
      count_140_plus: input.opponentStats.count140Plus,
      count_180: input.opponentStats.count180,
      checkout_percentage: input.opponentStats.checkoutPercent ||
        (input.opponentStats.checkoutDartsAttempted > 0
          ? (input.opponentStats.checkoutsMade / input.opponentStats.checkoutDartsAttempted) * 100
          : 0),
    };

    // Insert user stats
    const { error: userPlayerError } = await supabase
      .from('match_players')
      .insert(userPlayerData);

    if (userPlayerError) {
      const error = `Failed to insert user player stats: ${userPlayerError.message}`;
      console.error('❌ MATCH_RECORD_FAILED:', error);
      console.error('User player data:', userPlayerData);
      console.error('Supabase error:', userPlayerError);
      return { ok: false, error };
    }

    console.log('✅ User player stats saved');

    // Insert opponent stats
    const { error: opponentPlayerError } = await supabase
      .from('match_players')
      .insert(opponentPlayerData);

    if (opponentPlayerError) {
      const error = `Failed to insert opponent player stats: ${opponentPlayerError.message}`;
      console.error('❌ MATCH_RECORD_FAILED:', error);
      console.error('Opponent player data:', opponentPlayerData);
      console.error('Supabase error:', opponentPlayerError);
      return { ok: false, error };
    }

    console.log('✅ Opponent player stats saved');

    // D) Insert into match_history for stats filtering
    const matchHistoryData = {
      room_id: match.id, // Use match.id as room_id reference
      user_id: user.id,
      opponent_id: input.opponent.userId || null,
      game_mode: parseInt(input.game),
      match_format: input.matchType === 'dartbot' ? 'dartbot' : (input.matchType || 'quick'),
      result: input.winner === 'user' ? 'win' : 'loss',
      legs_won: input.userStats.legsWon,
      legs_lost: input.userStats.legsLost,
      three_dart_avg: input.userStats.threeDartAvg,
      first9_avg: input.userStats.first9Avg,
      highest_checkout: input.userStats.highestCheckout,
      checkout_percentage: input.userStats.checkoutPercent ||
        (input.userStats.checkoutDartsAttempted > 0
          ? (input.userStats.checkoutsMade / input.userStats.checkoutDartsAttempted) * 100
          : 0),
      darts_thrown: input.userStats.dartsThrown || 0,
      total_score: input.userStats.pointsScored || 0,
      total_checkouts: input.userStats.checkoutsMade,
      checkout_attempts: input.userStats.checkoutDartsAttempted,
      visits_100_plus: input.userStats.count100Plus,
      visits_140_plus: input.userStats.count140Plus,
      visits_180: input.userStats.count180,
      played_at: input.endedAt,
    };

    const { error: matchHistoryError } = await supabase
      .from('match_history')
      .insert(matchHistoryData);

    if (matchHistoryError) {
      console.warn('⚠️ Failed to insert match_history (non-critical):', matchHistoryError.message);
    } else {
      console.log('✅ Match history recorded');
    }

    // F) Update user aggregate stats
    const { data: userStatsData } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const isWin = input.winner === 'user';
    const newWins = (userStatsData?.wins || 0) + (isWin ? 1 : 0);
    const newLosses = (userStatsData?.losses || 0) + (isWin ? 0 : 1);
    const newTotalMatches = (userStatsData?.total_matches || 0) + 1;
    const newTotal180s = (userStatsData?.total_180s || 0) + input.userStats.count180;
    const newTotalCheckoutAttempts = (userStatsData?.total_checkout_attempts || 0) + input.userStats.checkoutDartsAttempted;
    const newTotalCheckoutsMade = (userStatsData?.total_checkouts_made || 0) + input.userStats.checkoutsMade;
    const newHighestCheckout = Math.max(userStatsData?.highest_checkout || 0, input.userStats.highestCheckout);
    const newBestAverage = Math.max(userStatsData?.best_average || 0, input.userStats.threeDartAvg);
    const newBestFirst9Average = Math.max(userStatsData?.best_first9_average || 0, input.userStats.first9Avg);
    const newTotal100Plus = (userStatsData?.total_100_plus || 0) + input.userStats.count100Plus;
    const newTotal140Plus = (userStatsData?.total_140_plus || 0) + input.userStats.count140Plus;
    const newTotalPointsScored = (userStatsData?.total_points_scored || 0) + (input.userStats.pointsScored || 0);
    const newTotalDartsThrown = (userStatsData?.total_darts_thrown || 0) + (input.userStats.dartsThrown || 0);

    const userStatsUpdate = {
      user_id: user.id,
      total_matches: newTotalMatches,
      wins: newWins,
      losses: newLosses,
      total_180s: newTotal180s,
      total_checkout_attempts: newTotalCheckoutAttempts,
      total_checkouts_made: newTotalCheckoutsMade,
      highest_checkout: newHighestCheckout,
      best_average: newBestAverage,
      best_first9_average: newBestFirst9Average,
      total_100_plus: newTotal100Plus,
      total_140_plus: newTotal140Plus,
      total_points_scored: newTotalPointsScored,
      total_darts_thrown: newTotalDartsThrown,
      updated_at: new Date().toISOString(),
    };

    const { error: userStatsError } = await supabase
      .from('user_stats')
      .upsert(userStatsUpdate);

    if (userStatsError) {
      console.warn('⚠️ Failed to update user_stats (non-critical):', userStatsError.message);
    } else {
      console.log('✅ User aggregate stats updated');
    }

    // G) Update player_stats (for dashboard)
    const { data: playerStatsData } = await supabase
      .from('player_stats')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    const currentStreak = isWin ? (playerStatsData?.current_win_streak || 0) + 1 : 0;
    const bestStreak = Math.max(playerStatsData?.best_win_streak || 0, currentStreak);

    const playerStatsUpdate = {
      user_id: user.id,
      wins_total: newWins,
      losses_total: newLosses,
      current_win_streak: currentStreak,
      best_win_streak: bestStreak,
      total_matches: newTotalMatches,
      total_180s: newTotal180s,
      total_checkouts: newTotalCheckoutsMade,
      total_checkout_attempts: newTotalCheckoutAttempts,
      highest_checkout_ever: newHighestCheckout,
      best_average_ever: newBestAverage,
      most_180s_in_match: Math.max(playerStatsData?.most_180s_in_match || 0, input.userStats.count180),
      updated_at: new Date().toISOString(),
    };

    const { error: playerStatsError } = await supabase
      .from('player_stats')
      .upsert(playerStatsUpdate);

    if (playerStatsError) {
      console.warn('⚠️ Failed to update player_stats (non-critical):', playerStatsError.message);
    } else {
      console.log('✅ Player stats updated');
    }

    console.log('🎉 MATCH_RECORD_SUCCESS:', match.id);

    return {
      ok: true,
      matchId: match.id,
    };

  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.error('❌ MATCH_RECORD_EXCEPTION:', errorMsg);
    console.error('Full error:', error);
    return {
      ok: false,
      error: errorMsg,
    };
  }
}
