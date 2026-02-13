/**
 * Dartbot Match System - Client Library
 * 
 * Mirrors the quick match system for dartbot matches.
 * Stats are recorded to match_history with match_format = 'dartbot'
 */

import { createClient } from './supabase/client';

// ============================================================
// TYPES
// ============================================================

export type DartbotLevel = 1 | 2 | 3 | 4 | 5;

export type GameMode = 301 | 501;

export type MatchFormat = 'best-of-1' | 'best-of-3' | 'best-of-5' | 'best-of-7' | 'best-of-9';

export type DartbotMatchStatus = 'active' | 'finished' | 'forfeited';

export type PlayerType = 'player' | 'dartbot';

export interface Dart {
  segment: number; // 1-20, 25 (bull)
  ring: 'S' | 'D' | 'T' | 'B' | 'O'; // Single, Double, Triple, Bull, Outer (miss)
  value: number; // Actual score value
}

export interface DartbotVisit {
  id: string;
  leg: number;
  turn_no: number;
  player_type: PlayerType;
  score: number;
  remaining_before: number;
  remaining_after: number;
  is_bust: boolean;
  is_checkout: boolean;
  darts_thrown: number;
  darts_at_double: number;
  darts: Dart[];
  bust_reason?: string;
  created_at: string;
}

export interface DartbotMatchRoom {
  id: string;
  player_id: string;
  dartbot_level: DartbotLevel;
  game_mode: GameMode;
  match_format: MatchFormat;
  double_out: boolean;
  status: DartbotMatchStatus;
  current_leg: number;
  legs_to_win: number;
  player_legs: number;
  dartbot_legs: number;
  player_remaining: number;
  dartbot_remaining: number;
  current_turn: PlayerType;
  winner_id: string | null;
  player_first9_score: number;
  player_first9_darts: number;
  dartbot_first9_score: number;
  dartbot_first9_darts: number;
  summary: Record<string, any>;
  created_at: string;
  completed_at?: string;
}

export interface DartbotMatchState {
  success: boolean;
  match: DartbotMatchRoom;
  visits: DartbotVisit[];
  error?: string;
}

export interface SubmitVisitParams {
  roomId: string;
  playerType: PlayerType;
  score: number;
  remainingAfter: number;
  isBust?: boolean;
  isCheckout?: boolean;
  dartsThrown?: number;
  dartsAtDouble?: number;
  darts?: Dart[];
  bustReason?: string;
}

export interface SubmitVisitResult {
  success: boolean;
  visit_recorded: boolean;
  leg_won: boolean;
  match_won: boolean;
  winner_id?: string | null;
  match_finalized?: boolean;
  room_state?: {
    id: string;
    status: DartbotMatchStatus;
    current_leg: number;
    player_legs: number;
    dartbot_legs: number;
    player_remaining: number;
    dartbot_remaining: number;
    current_turn: PlayerType;
    game_mode: GameMode;
    legs_to_win: number;
  };
  error?: string;
}

export interface CreateMatchParams {
  dartbotLevel: DartbotLevel;
  gameMode: GameMode;
  matchFormat: MatchFormat;
  doubleOut?: boolean;
}

export interface CreateMatchResult {
  success: boolean;
  room_id: string;
  player_id: string;
  dartbot_level: DartbotLevel;
  game_mode: GameMode;
  match_format: MatchFormat;
  double_out: boolean;
  legs_to_win: number;
  player_remaining: number;
  dartbot_remaining: number;
  current_turn: PlayerType;
  error?: string;
}

export interface DartbotMatchSummary {
  id: string;
  dartbot_level: DartbotLevel;
  game_mode: GameMode;
  match_format: MatchFormat;
  status: DartbotMatchStatus;
  player_legs: number;
  dartbot_legs: number;
  winner: 'player' | 'dartbot';
  summary: Record<string, any>;
  created_at: string;
  completed_at?: string;
}

export interface DartbotStats {
  success: boolean;
  match_format: 'dartbot';
  game_mode_filter: number | null;
  stats: {
    total_matches: number;
    wins: number;
    losses: number;
    total_darts: number;
    total_score: number;
    three_dart_avg: number;
    highest_score: number;
    total_checkouts: number;
    visits_100_plus: number;
    visits_140_plus: number;
    visits_180: number;
  };
  by_dartbot_level: Record<string, {
    matches: number;
    wins: number;
    win_rate: number;
  }>;
}

// ============================================================
// DARTBOT CONFIGURATION
// ============================================================

export const DARTBOT_CONFIG = {
  levels: {
    1: { name: 'Beginner', avg: 35, variance: 15 },
    2: { name: 'Intermediate', avg: 50, variance: 20 },
    3: { name: 'Advanced', avg: 65, variance: 25 },
    4: { name: 'Expert', avg: 80, variance: 30 },
    5: { name: 'Professional', avg: 95, variance: 35 },
  },
};

// ============================================================
// API FUNCTIONS
// ============================================================

const supabase = createClient();

/**
 * Create a new dartbot match
 */
export async function createDartbotMatch(
  params: CreateMatchParams
): Promise<CreateMatchResult> {
  const { data, error } = await supabase.rpc('create_dartbot_match', {
    p_dartbot_level: params.dartbotLevel,
    p_game_mode: params.gameMode,
    p_match_format: params.matchFormat,
    p_double_out: params.doubleOut ?? true,
  });

  if (error) {
    console.error('Error creating dartbot match:', error);
    return {
      success: false,
      error: error.message,
    } as CreateMatchResult;
  }

  return data as CreateMatchResult;
}

/**
 * Submit a visit (for player or dartbot)
 */
export async function submitDartbotVisit(
  params: SubmitVisitParams
): Promise<SubmitVisitResult> {
  const { data, error } = await supabase.rpc('submit_dartbot_visit', {
    p_room_id: params.roomId,
    p_player_type: params.playerType,
    p_score: params.score,
    p_remaining_after: params.remainingAfter,
    p_is_bust: params.isBust ?? false,
    p_is_checkout: params.isCheckout ?? false,
    p_darts_thrown: params.dartsThrown ?? 3,
    p_darts_at_double: params.dartsAtDouble ?? 0,
    p_darts: params.darts ?? [],
    p_bust_reason: params.bustReason ?? null,
  });

  if (error) {
    console.error('Error submitting dartbot visit:', error);
    return {
      success: false,
      error: error.message,
    } as SubmitVisitResult;
  }

  return data as SubmitVisitResult;
}

/**
 * Get current match state with visit history
 */
export async function getDartbotMatch(roomId: string): Promise<DartbotMatchState> {
  const { data, error } = await supabase.rpc('get_dartbot_match', {
    p_room_id: roomId,
  });

  if (error) {
    console.error('Error getting dartbot match:', error);
    return {
      success: false,
      match: null as any,
      visits: [],
      error: error.message,
    };
  }

  return data as DartbotMatchState;
}

/**
 * Forfeit the current match
 */
export async function forfeitDartbotMatch(roomId: string): Promise<{
  success: boolean;
  message?: string;
  winner?: string;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('forfeit_dartbot_match', {
    p_room_id: roomId,
  });

  if (error) {
    console.error('Error forfeiting dartbot match:', error);
    return {
      success: false,
      error: error.message,
    };
  }

  return data;
}

/**
 * Request a rematch with same settings
 */
export async function requestDartbotRematch(roomId: string): Promise<{
  success: boolean;
  new_room_id?: string;
  settings?: {
    dartbot_level: DartbotLevel;
    game_mode: GameMode;
    match_format: MatchFormat;
    double_out: boolean;
  };
  error?: string;
}> {
  const { data, error } = await supabase.rpc('request_dartbot_rematch', {
    p_room_id: roomId,
  });

  if (error) {
    console.error('Error requesting dartbot rematch:', error);
    return {
      success: false,
      error: error.message,
    };
  }

  return data;
}

/**
 * Get match history for the current player
 */
export async function getDartbotMatchHistory(
  limit: number = 20,
  offset: number = 0
): Promise<{
  success: boolean;
  matches: DartbotMatchSummary[];
  total: number;
  limit: number;
  offset: number;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('get_dartbot_match_history', {
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error('Error getting dartbot match history:', error);
    return {
      success: false,
      matches: [],
      total: 0,
      limit,
      offset,
      error: error.message,
    };
  }

  return data as any;
}

/**
 * Get dartbot-specific stats
 */
export async function getDartbotStats(
  gameMode?: GameMode
): Promise<DartbotStats> {
  const { data, error } = await supabase.rpc('get_dartbot_player_stats', {
    p_game_mode: gameMode ?? null,
  });

  if (error) {
    console.error('Error getting dartbot stats:', error);
    return {
      success: false,
      match_format: 'dartbot',
      game_mode_filter: gameMode ?? null,
      stats: {
        total_matches: 0,
        wins: 0,
        losses: 0,
        total_darts: 0,
        total_score: 0,
        three_dart_avg: 0,
        highest_score: 0,
        total_checkouts: 0,
        visits_100_plus: 0,
        visits_140_plus: 0,
        visits_180: 0,
      },
      by_dartbot_level: {},
    } as DartbotStats;
  }

  return data as DartbotStats;
}

// ============================================================
// REALTIME SUBSCRIPTIONS
// ============================================================

/**
 * Subscribe to match state changes
 */
export function subscribeToDartbotMatch(
  roomId: string,
  callback: (payload: { new: DartbotMatchRoom; old: DartbotMatchRoom | null }) => void
) {
  return supabase
    .channel(`dartbot_match_${roomId}`)
    .on(
      'postgres_changes' as any,
      {
        event: '*',
        schema: 'public',
        table: 'dartbot_match_rooms',
        filter: `id=eq.${roomId}`,
      },
      callback as any
    )
    .subscribe();
}

/**
 * Subscribe to new visits
 */
export function subscribeToDartbotVisits(
  roomId: string,
  callback: (payload: { new: DartbotVisit }) => void
) {
  return supabase
    .channel(`dartbot_visits_${roomId}`)
    .on(
      'postgres_changes' as any,
      {
        event: 'INSERT',
        schema: 'public',
        table: 'dartbot_visits',
        filter: `room_id=eq.${roomId}`,
      },
      callback as any
    )
    .subscribe();
}

// ============================================================
// STATS INTEGRATION
// ============================================================

/**
 * Get filtered stats using the standard stats function
 * This ensures dartbot stats appear alongside other match types
 */
export async function getFilteredStats(
  gameMode?: GameMode
): Promise<{
  success: boolean;
  filters: {
    game_mode: number | null;
    match_format: string | null;
  };
  stats: {
    total_matches: number;
    wins: number;
    losses: number;
    draws: number;
    three_dart_average: number;
    first9_average: number;
    highest_checkout: number;
    checkout_percentage: number;
    visits_100_plus: number;
    visits_140_plus: number;
    visits_180: number;
    total_darts_thrown: number;
    total_score: number;
    total_checkouts: number;
    checkout_attempts: number;
  };
}> {
  const { data, error } = await supabase.rpc('fn_get_filtered_player_stats', {
    p_user_id: (await supabase.auth.getUser()).data.user?.id,
    p_game_mode: gameMode ?? null,
    p_match_format: 'dartbot', // Filter for dartbot matches only
  });

  if (error) {
    console.error('Error getting filtered dartbot stats:', error);
    throw error;
  }

  return data as any;
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Calculate legs to win from match format
 */
export function getLegsToWin(format: MatchFormat): number {
  switch (format) {
    case 'best-of-1': return 1;
    case 'best-of-3': return 2;
    case 'best-of-5': return 3;
    case 'best-of-7': return 4;
    case 'best-of-9': return 5;
    default: return 1;
  }
}

/**
 * Get dartbot display name for level
 */
export function getDartbotName(level: DartbotLevel): string {
  return DARTBOT_CONFIG.levels[level]?.name ?? 'Unknown';
}

/**
 * Check if a score is a valid checkout
 */
export function isValidCheckout(score: number, doubleOut: boolean): boolean {
  if (!doubleOut) return score >= 2 && score <= 180;

  // Valid double-out checkouts (2-170, excluding 159, 162, 163, 165, 166, 168, 169)
  const validCheckouts = [
    2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
    61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
    81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100,
    101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
    121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140,
    141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 160,
    161, 164, 167, 170
  ];

  return validCheckouts.includes(score);
}

// ============================================================
// LEGACY BOT FUNCTIONS (for training mode compatibility)
// ============================================================

export interface BotMatchState {
  checkoutAttemptsThisLeg: number;
  totalScoredThisMatch: number;
  totalDartsThisMatch: number;
  stallCount: number;
  lastRemaining?: number;
}

/**
 * Generate bot darts for legacy training mode
 */
export function generateBotDarts(
  botAverage: number,
  currentScore: number,
  doubleOut: boolean,
  state: BotMatchState
): any[] {
  const darts: any[] = [];
  let remaining = currentScore;

  for (let i = 0; i < 3; i++) {
    if (remaining === 0) break;

    const variance = Math.random() * 20 - 10;
    const targetAvg = Math.max(20, Math.min(80, botAverage + variance));
    const dartScore = Math.floor(Math.random() * targetAvg);

    if (doubleOut && remaining <= 40 && remaining % 2 === 0) {
      if (Math.random() < 0.3) {
        darts.push({ double: remaining / 2 });
        remaining = 0;
        break;
      }
    }

    darts.push({ single: Math.min(20, dartScore) });
    remaining -= Math.min(20, dartScore);
  }

  return darts;
}

/**
 * Get bot thinking delay
 */
export function getBotThinkingDelay(): number {
  return 1000 + Math.random() * 500;
}

/**
 * Reset bot leg state
 */
export function resetBotLegState(state?: BotMatchState): BotMatchState {
  return {
    checkoutAttemptsThisLeg: 0,
    totalScoredThisMatch: state?.totalScoredThisMatch || 0,
    totalDartsThisMatch: state?.totalDartsThisMatch || 0,
    stallCount: 0,
  };
}

// ============================================================
// STATS RECORDING (VIA RPC)
// ============================================================

export interface DartbotMatchStats {
  gameMode: 301 | 501;
  matchFormat: string;
  dartbotLevel: number;
  playerLegsWon: number;
  botLegsWon: number;
  winner: 'player' | 'dartbot';
  playerStats: {
    threeDartAverage: number;
    first9Average: number;
    checkoutPercentage: number;
    highestCheckout: number;
    dartsAtDouble: number;
    totalDartsThrown: number;
    visits100Plus: number;
    visits140Plus: number;
    visits180: number;
  };
  botStats?: {
    threeDartAverage: number;
    first9Average: number;
    checkoutPercentage: number;
    highestCheckout: number;
    dartsAtDouble: number;
    totalDartsThrown: number;
    visits100Plus: number;
    visits140Plus: number;
    visits180: number;
    totalScore: number;
  };
}

/**
 * Record dartbot match completion via RPC
 * This bypasses the matches view and inserts directly to match_history
 */
export async function recordDartbotMatchCompletion(
  stats: DartbotMatchStats
): Promise<{ success: boolean; roomId?: string; error?: string }> {
  console.log('📊 RECORDING DARTBOT STATS:', {
    legsWon: stats.playerLegsWon,
    botLegsWon: stats.botLegsWon,
    winner: stats.winner,
    playerAvg: stats.playerStats.threeDartAverage,
    botAvg: stats.botStats?.threeDartAverage ?? 0,
  });

  const { data, error } = await supabase.rpc('record_dartbot_match_completion', {
    p_game_mode: stats.gameMode,
    p_match_format: stats.matchFormat,
    p_dartbot_level: stats.dartbotLevel,
    p_player_legs_won: stats.playerLegsWon,
    p_bot_legs_won: stats.botLegsWon,
    p_winner: stats.winner,
    p_player_three_dart_avg: stats.playerStats.threeDartAverage,
    p_player_first9_avg: stats.playerStats.first9Average,
    p_player_checkout_pct: stats.playerStats.checkoutPercentage,
    p_player_highest_checkout: stats.playerStats.highestCheckout,
    p_player_darts_at_double: stats.playerStats.dartsAtDouble,
    p_player_total_darts: stats.playerStats.totalDartsThrown,
    p_player_100_plus: stats.playerStats.visits100Plus,
    p_player_140_plus: stats.playerStats.visits140Plus,
    p_player_180s: stats.playerStats.visits180,
    // Bot stats (optional)
    p_bot_three_dart_avg: stats.botStats?.threeDartAverage ?? 0,
    p_bot_first9_avg: stats.botStats?.first9Average ?? 0,
    p_bot_checkout_pct: stats.botStats?.checkoutPercentage ?? 0,
    p_bot_highest_checkout: stats.botStats?.highestCheckout ?? 0,
    p_bot_darts_at_double: stats.botStats?.dartsAtDouble ?? 0,
    p_bot_total_darts: stats.botStats?.totalDartsThrown ?? 0,
    p_bot_100_plus: stats.botStats?.visits100Plus ?? 0,
    p_bot_140_plus: stats.botStats?.visits140Plus ?? 0,
    p_bot_180s: stats.botStats?.visits180 ?? 0,
    p_bot_total_score: stats.botStats?.totalScore ?? 0,
  });

  if (error) {
    console.error('❌ Error recording dartbot match:', error);
    return {
      success: false,
      error: error.message,
    };
  }

  console.log('✅ DARTBOT MATCH RECORDED:', data);

  return {
    success: data?.success ?? true,
    roomId: data?.room_id,
  };
}
