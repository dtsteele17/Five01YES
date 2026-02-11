import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { computeMatchStats, PlayerMatchStats } from '@/lib/stats/computeMatchStats';
import { processAchievementEvent } from '@/lib/achievements/achievementService';

export interface MatchVisit {
  player: 'user' | 'opponent';
  legNumber: number;
  visitNumber: number;
  score: number;
  dartsThrown?: number;  // Number of darts thrown (3 for normal, 1-3 for checkout)
  d1?: string;
  d2?: string;
  d3?: string;
  wasCheckoutAttempt?: boolean;
  dartsAtDouble?: number;
  checkoutSuccess?: boolean;
  remainingScore: number;
  isBust: boolean;
  isCheckout: boolean;
}

export interface CompletedMatchData {
  matchType: 'training' | 'local' | 'quick' | 'ranked' | 'private' | 'league' | 'tournament';
  gameMode: '301' | '501';
  bestOf: number;
  doubleOut: boolean;
  straightIn: boolean;
  opponentType: 'user' | 'dartbot' | 'local';
  opponentId?: string;
  opponentName: string;
  dartbotLevel?: number;
  userLegs: number;
  opponentLegs: number;
  winner: 'user' | 'opponent';
  userAvg?: number;
  opponentAvg?: number;
  userFirst9Avg?: number;
  opponentFirst9Avg?: number;
  userCheckoutPct?: number;
  opponentCheckoutPct?: number;
  userCheckoutDartsAttempted?: number;
  userCheckoutsMade?: number;
  opponentCheckoutDartsAttempted?: number;
  opponentCheckoutsMade?: number;
  userHighestCheckout?: number;
  opponentHighestCheckout?: number;
  userCount100Plus?: number;
  userCount140Plus?: number;
  userCount180?: number;
  opponentCount100Plus?: number;
  opponentCount140Plus?: number;
  opponentCount180?: number;
  userHighestScore?: number;
  opponentHighestScore?: number;
  userTotalDartsThrown?: number;
  userTotalPointsScored?: number;
  opponentTotalDartsThrown?: number;
  opponentTotalPointsScored?: number;
  visits: MatchVisit[];
  userName?: string;
  startedAt?: string;
}

async function updateUserStats(
  userId: string,
  userStats: PlayerMatchStats,
  isWinner: boolean
): Promise<void> {
  const supabase = createClient();

  const { data: existing } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const newHighestCheckout = Math.max(existing.highest_checkout || 0, userStats.highestCheckout);
    const newBestAverage = Math.max(existing.best_average || 0, userStats.threeDartAverage);
    const newBestFirst9 = Math.max(existing.best_first9_average || 0, userStats.first9Average);

    await supabase
      .from('user_stats')
      .update({
        total_matches: (existing.total_matches || 0) + 1,
        wins: (existing.wins || 0) + (isWinner ? 1 : 0),
        losses: (existing.losses || 0) + (isWinner ? 0 : 1),
        total_points_scored: (existing.total_points_scored || 0) + userStats.totalPointsScored,
        total_darts_thrown: (existing.total_darts_thrown || 0) + userStats.totalDartsThrown,
        total_180s: (existing.total_180s || 0) + userStats.oneEighties,
        total_checkout_attempts: (existing.total_checkout_attempts || 0) + userStats.checkoutAttempts,
        total_checkouts_made: (existing.total_checkouts_made || 0) + userStats.checkoutsMade,
        highest_checkout: newHighestCheckout,
        best_average: newBestAverage,
        best_first9_average: newBestFirst9,
        total_100_plus: (existing.total_100_plus || 0) + userStats.count100Plus,
        total_140_plus: (existing.total_140_plus || 0) + userStats.count140Plus,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } else {
    await supabase
      .from('user_stats')
      .insert({
        user_id: userId,
        total_matches: 1,
        wins: isWinner ? 1 : 0,
        losses: isWinner ? 0 : 1,
        total_points_scored: userStats.totalPointsScored,
        total_darts_thrown: userStats.totalDartsThrown,
        total_180s: userStats.oneEighties,
        total_checkout_attempts: userStats.checkoutAttempts,
        total_checkouts_made: userStats.checkoutsMade,
        highest_checkout: userStats.highestCheckout,
        best_average: userStats.threeDartAverage,
        best_first9_average: userStats.first9Average,
        total_100_plus: userStats.count100Plus,
        total_140_plus: userStats.count140Plus,
      });
  }
}

async function updatePlayerStats(
  userId: string,
  isWinner: boolean,
  userStats: PlayerMatchStats
): Promise<void> {
  const supabase = createClient();

  const { data: existing } = await supabase
    .from('player_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    const newCurrentStreak = isWinner ? (existing.current_win_streak || 0) + 1 : 0;
    const newBestStreak = Math.max(existing.best_win_streak || 0, newCurrentStreak);
    const newHighestCheckout = Math.max(existing.highest_checkout_ever || 0, userStats.highestCheckout);
    const newBestAverage = Math.max(existing.best_average_ever || 0, userStats.threeDartAverage);
    const newMost180s = Math.max(existing.most_180s_in_match || 0, userStats.oneEighties);

    await supabase
      .from('player_stats')
      .update({
        wins_total: (existing.wins_total || 0) + (isWinner ? 1 : 0),
        losses_total: (existing.losses_total || 0) + (isWinner ? 0 : 1),
        current_win_streak: newCurrentStreak,
        best_win_streak: newBestStreak,
        total_matches: (existing.total_matches || 0) + 1,
        total_180s: (existing.total_180s || 0) + userStats.oneEighties,
        total_checkouts: (existing.total_checkouts || 0) + userStats.checkoutsMade,
        total_checkout_attempts: (existing.total_checkout_attempts || 0) + userStats.checkoutAttempts,
        highest_checkout_ever: newHighestCheckout,
        best_average_ever: newBestAverage,
        most_180s_in_match: newMost180s,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  } else {
    await supabase
      .from('player_stats')
      .insert({
        user_id: userId,
        wins_total: isWinner ? 1 : 0,
        losses_total: isWinner ? 0 : 1,
        current_win_streak: isWinner ? 1 : 0,
        best_win_streak: isWinner ? 1 : 0,
        total_matches: 1,
        total_180s: userStats.oneEighties,
        total_checkouts: userStats.checkoutsMade,
        total_checkout_attempts: userStats.checkoutAttempts,
        highest_checkout_ever: userStats.highestCheckout,
        best_average_ever: userStats.threeDartAverage,
        most_180s_in_match: userStats.oneEighties,
      });
  }
}

export async function saveCompletedMatch(matchData: CompletedMatchData): Promise<string | null> {
  console.log('📊 STARTING MATCH SAVE', {
    matchType: matchData.matchType,
    gameMode: matchData.gameMode,
    winner: matchData.winner,
  });

  try {
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ No authenticated user found');
      toast.error('Failed to save match: Not authenticated');
      return null;
    }

    console.log('✅ User authenticated:', user.id);

    const matchFormat = matchData.bestOf === 1 ? 'best-of-1'
      : matchData.bestOf === 3 ? 'best-of-3'
      : 'best-of-5';

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();

    const userName = matchData.userName || profile?.display_name || 'Player';

    const userVisits = matchData.visits.filter(v => v.player === 'user');
    const opponentVisits = matchData.visits.filter(v => v.player === 'opponent');

    console.log('📈 Computing stats for', userVisits.length, 'user visits and', opponentVisits.length, 'opponent visits');

    const userStats = computeMatchStats(
      userVisits,
      'user',
      matchData.gameMode,
      matchData.userCheckoutDartsAttempted,
      matchData.userCheckoutsMade
    );
    const opponentStats = computeMatchStats(
      opponentVisits,
      'opponent',
      matchData.gameMode,
      matchData.opponentCheckoutDartsAttempted,
      matchData.opponentCheckoutsMade
    );

    console.log('✅ Stats computed - User avg:', userStats.threeDartAverage, 'Opponent avg:', opponentStats.threeDartAverage);

    const { data: match, error: matchError } = await supabase
      .from('matches')
      .insert({
        user_id: user.id,
        match_type: matchData.matchType,
        game_mode: matchData.gameMode,
        match_format: matchFormat,
        double_out: matchData.doubleOut,
        straight_in: matchData.straightIn,
        status: 'completed',
        opponent_id: matchData.opponentId || null,
        opponent_type: matchData.opponentType,
        dartbot_level: matchData.dartbotLevel || null,
        player1_name: userName,
        player2_name: matchData.opponentName,
        player1_legs_won: matchData.userLegs,
        player2_legs_won: matchData.opponentLegs,
        winner_id: matchData.winner === 'user' ? user.id : null,
        winner_name: matchData.winner === 'user' ? userName : matchData.opponentName,
        user_avg: userStats.threeDartAverage,
        opponent_avg: opponentStats.threeDartAverage,
        user_first9_avg: userStats.first9Average,
        opponent_first9_avg: opponentStats.first9Average,
        user_checkout_pct: userStats.checkoutPercent,
        opponent_checkout_pct: opponentStats.checkoutPercent,
        started_at: matchData.startedAt || new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (matchError) {
      console.error('❌ Error saving match:', matchError);
      toast.error(`Failed to save match: ${matchError.message}`);
      return null;
    }

    if (!match) {
      console.error('❌ No match data returned after insert');
      toast.error('Failed to save match: No data returned');
      return null;
    }

    console.log('✅ Match saved with ID:', match.id);

    if (matchData.visits && matchData.visits.length > 0) {
      const visitInserts = matchData.visits.map(visit => ({
        match_id: match.id,
        leg_number: visit.legNumber,
        player: visit.player === 'user' ? 'player1' : 'player2',
        visit_number: visit.visitNumber,
        score: visit.score,
        d1: visit.d1 || null,
        d2: visit.d2 || null,
        d3: visit.d3 || null,
        was_checkout_attempt: visit.wasCheckoutAttempt || false,
        darts_at_double: visit.dartsAtDouble || null,
        checkout_success: visit.checkoutSuccess || false,
        remaining_score: visit.remainingScore,
        is_bust: visit.isBust,
        is_checkout: visit.isCheckout,
      }));

      const { error: visitsError } = await supabase
        .from('match_visits')
        .insert(visitInserts);

      if (visitsError) {
        console.error('❌ Error saving visits:', visitsError);
        toast.error(`Match saved but visits failed: ${visitsError.message}`);
      } else {
        console.log('✅ Saved', visitInserts.length, 'visits');
      }
    }

    console.log('📊 Updating user stats...');
    await updateUserStats(user.id, userStats, matchData.winner === 'user');
    console.log('✅ User stats updated');

    const startingScore = matchData.gameMode === '301' ? 301 : 501;

    const userCheckoutPercentage = userStats.checkoutDartsAttempted > 0
      ? (userStats.checkoutsMade / userStats.checkoutDartsAttempted) * 100
      : 0;
    const opponentCheckoutPercentage = opponentStats.checkoutDartsAttempted > 0
      ? (opponentStats.checkoutsMade / opponentStats.checkoutDartsAttempted) * 100
      : 0;

    await supabase.from('match_players').insert([
      {
        match_id: match.id,
        user_id: user.id,
        is_bot: false,
        seat: 1,
        player_name: userName,
        starting_score: startingScore,
        final_score: 0,
        legs_won: matchData.userLegs,
        legs_lost: matchData.opponentLegs,
        checkout_attempts: userStats.checkoutAttempts,
        checkout_hits: userStats.checkoutsMade,
        checkout_percentage: userCheckoutPercentage,
        checkout_darts_attempted: userStats.checkoutDartsAttempted,
        first_9_total: userStats.first9TotalScore,
        first_9_dart_avg: userStats.first9Average,
        first_9_darts_thrown: userStats.first9DartsThrown,
        first_9_points_scored: userStats.first9PointsScored,
        darts_thrown: userStats.totalDartsThrown,
        points_scored: userStats.totalPointsScored,
        avg_3dart: userStats.threeDartAverage,
        highest_score: userStats.highestVisit,
        highest_checkout: userStats.highestCheckout,
        count_100_plus: userStats.count100Plus,
        count_140_plus: userStats.count140Plus,
        count_180: userStats.oneEighties,
      },
      {
        match_id: match.id,
        user_id: matchData.opponentType === 'user' ? matchData.opponentId : null,
        is_bot: matchData.opponentType === 'dartbot',
        bot_level: matchData.dartbotLevel || null,
        seat: 2,
        player_name: matchData.opponentName,
        starting_score: startingScore,
        final_score: 0,
        legs_won: matchData.opponentLegs,
        legs_lost: matchData.userLegs,
        checkout_attempts: opponentStats.checkoutAttempts,
        checkout_hits: opponentStats.checkoutsMade,
        checkout_percentage: opponentCheckoutPercentage,
        checkout_darts_attempted: opponentStats.checkoutDartsAttempted,
        first_9_total: opponentStats.first9TotalScore,
        first_9_dart_avg: opponentStats.first9Average,
        first_9_darts_thrown: opponentStats.first9DartsThrown,
        first_9_points_scored: opponentStats.first9PointsScored,
        darts_thrown: opponentStats.totalDartsThrown,
        points_scored: opponentStats.totalPointsScored,
        avg_3dart: opponentStats.threeDartAverage,
        highest_score: opponentStats.highestVisit,
        highest_checkout: opponentStats.highestCheckout,
        count_100_plus: opponentStats.count100Plus,
        count_140_plus: opponentStats.count140Plus,
        count_180: opponentStats.oneEighties,
      },
    ]);

    console.log('👤 Updating player stats...');
    await updatePlayerStats(user.id, matchData.winner === 'user', userStats);
    console.log('✅ Player stats updated');

    await processAchievementEvent({
      type: 'MATCH_COMPLETED',
      userId: user.id,
      timestamp: new Date().toISOString(),
      matchId: match.id,
      matchType: matchData.matchType,
      gameMode: matchData.gameMode,
      won: matchData.winner === 'user',
      userLegsWon: matchData.userLegs,
      opponentLegsWon: matchData.opponentLegs,
      stats: {
        threeDartAverage: userStats.threeDartAverage,
        first9Average: userStats.first9Average,
        checkoutPercent: userStats.checkoutPercent,
        checkoutAttempts: userStats.checkoutAttempts,
        checkoutsMade: userStats.checkoutsMade,
        highestCheckout: userStats.highestCheckout,
        oneEighties: userStats.oneEighties,
        count100Plus: userStats.count100Plus,
        count140Plus: userStats.count140Plus,
      },
      opponentStats: {
        threeDartAverage: opponentStats.threeDartAverage,
      },
      durationMs: matchData.startedAt
        ? Date.now() - new Date(matchData.startedAt).getTime()
        : 0,
    });

    const userVisitsProcessed = matchData.visits.filter(v => v.player === 'user');
    for (const visit of userVisitsProcessed) {
      if (visit.score === 180) {
        await processAchievementEvent({
          type: 'SCORE_HIT',
          userId: user.id,
          timestamp: new Date().toISOString(),
          matchId: match.id,
          matchType: matchData.matchType,
          gameMode: matchData.gameMode,
          score: 180,
        });
      }

      if (visit.score >= 100) {
        await processAchievementEvent({
          type: 'VISIT_SUBMITTED',
          userId: user.id,
          timestamp: new Date().toISOString(),
          matchId: match.id,
          matchType: matchData.matchType,
          gameMode: matchData.gameMode,
          visitScore: visit.score,
          remainingBefore: 0,
          remainingAfter: visit.remainingScore,
          isBust: visit.isBust,
          isCheckout: visit.isCheckout,
        });
      }

      if (visit.score === 26 || visit.score === 69) {
        await processAchievementEvent({
          type: 'VISIT_SUBMITTED',
          userId: user.id,
          timestamp: new Date().toISOString(),
          matchId: match.id,
          matchType: matchData.matchType,
          gameMode: matchData.gameMode,
          visitScore: visit.score,
          remainingBefore: 0,
          remainingAfter: visit.remainingScore,
          isBust: visit.isBust,
          isCheckout: visit.isCheckout,
        });
      }

      if (visit.checkoutSuccess || visit.isCheckout) {
        await processAchievementEvent({
          type: 'CHECKOUT_MADE',
          userId: user.id,
          timestamp: new Date().toISOString(),
          matchId: match.id,
          matchType: matchData.matchType,
          gameMode: matchData.gameMode,
          checkoutValue: visit.score,
          dartsAtDouble: visit.dartsAtDouble || 3,
        });
      }
    }

    console.log('🎉 Match saved successfully:', match.id);
    console.log('📊 MATCH SAVE COMPLETE - All data persisted');
    toast.success('Match saved successfully!');
    return match.id;
  } catch (error) {
    console.error('❌ Unexpected error saving match:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message, error.stack);
    }
    toast.error('Failed to save match: Unexpected error');
    return null;
  }
}

export function calculateMatchStats(visits: MatchVisit[], player: 'user' | 'opponent', gameMode: '301' | '501') {
  const stats = computeMatchStats(visits, player, gameMode);
  return {
    avg: stats.threeDartAverage,
    first9Avg: stats.first9Average,
    checkoutPct: stats.checkoutPercent,
  };
}
