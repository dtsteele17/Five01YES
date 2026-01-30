export type AchievementEventType =
  | 'VISIT_SUBMITTED'
  | 'LEG_WON'
  | 'LEG_LOST'
  | 'MATCH_WON'
  | 'MATCH_LOST'
  | 'MATCH_COMPLETED'
  | 'CHECKOUT_MADE'
  | 'CHECKOUT_ATTEMPT'
  | 'SCORE_HIT'
  | 'BUST'
  | 'LEAGUE_JOINED'
  | 'LEAGUE_CREATED'
  | 'TOURNAMENT_STARTED'
  | 'TOURNAMENT_WON'
  | 'ATC_COMPLETED';

export interface BaseAchievementEvent {
  type: AchievementEventType;
  userId: string;
  timestamp: string;
}

export interface VisitSubmittedEvent extends BaseAchievementEvent {
  type: 'VISIT_SUBMITTED';
  matchId: string;
  matchType: 'training' | 'local' | 'quick' | 'ranked' | 'private' | 'league' | 'tournament';
  gameMode: '301' | '501';
  visitScore: number;
  remainingBefore: number;
  remainingAfter: number;
  isBust: boolean;
  isCheckout: boolean;
}

export interface LegWonEvent extends BaseAchievementEvent {
  type: 'LEG_WON';
  matchId: string;
  matchType: 'training' | 'local' | 'quick' | 'ranked' | 'private' | 'league' | 'tournament';
  gameMode: '301' | '501';
  legNumber: number;
}

export interface LegLostEvent extends BaseAchievementEvent {
  type: 'LEG_LOST';
  matchId: string;
  matchType: 'training' | 'local' | 'quick' | 'ranked' | 'private' | 'league' | 'tournament';
  gameMode: '301' | '501';
  legNumber: number;
}

export interface CheckoutMadeEvent extends BaseAchievementEvent {
  type: 'CHECKOUT_MADE';
  matchId: string;
  matchType: 'training' | 'local' | 'quick' | 'ranked' | 'private' | 'league' | 'tournament';
  gameMode: '301' | '501';
  checkoutValue: number;
  dartsAtDouble: number;
  lastDartType?: 'S' | 'D' | 'T' | 'BULL' | 'SBULL';
}

export interface CheckoutAttemptEvent extends BaseAchievementEvent {
  type: 'CHECKOUT_ATTEMPT';
  matchId: string;
  matchType: 'training' | 'local' | 'quick' | 'ranked' | 'private' | 'league' | 'tournament';
  gameMode: '301' | '501';
  dartsAtDouble: number;
  success: boolean;
}

export interface ScoreHitEvent extends BaseAchievementEvent {
  type: 'SCORE_HIT';
  matchId: string;
  matchType: 'training' | 'local' | 'quick' | 'ranked' | 'private' | 'league' | 'tournament';
  gameMode: '301' | '501';
  score: number;
}

export interface BustEvent extends BaseAchievementEvent {
  type: 'BUST';
  matchId: string;
  matchType: 'training' | 'local' | 'quick' | 'ranked' | 'private' | 'league' | 'tournament';
  gameMode: '301' | '501';
}

export interface MatchCompletedEvent extends BaseAchievementEvent {
  type: 'MATCH_COMPLETED';
  matchId: string;
  matchType: 'training' | 'local' | 'quick' | 'ranked' | 'private' | 'league' | 'tournament';
  gameMode: '301' | '501';
  won: boolean;
  userLegsWon: number;
  opponentLegsWon: number;
  stats: {
    threeDartAverage: number;
    first9Average: number;
    checkoutPercent: number;
    checkoutAttempts: number;
    checkoutsMade: number;
    highestCheckout: number;
    oneEighties: number;
    count100Plus: number;
    count140Plus: number;
  };
  opponentStats?: {
    threeDartAverage: number;
  };
  durationMs: number;
}

export interface MatchWonEvent extends BaseAchievementEvent {
  type: 'MATCH_WON';
  matchId: string;
  matchType: 'training' | 'local' | 'quick' | 'ranked' | 'private' | 'league' | 'tournament';
  gameMode: '301' | '501';
  userLegsWon: number;
  opponentLegsWon: number;
}

export interface MatchLostEvent extends BaseAchievementEvent {
  type: 'MATCH_LOST';
  matchId: string;
  matchType: 'training' | 'local' | 'quick' | 'ranked' | 'private' | 'league' | 'tournament';
  gameMode: '301' | '501';
  userLegsWon: number;
  opponentLegsWon: number;
}

export interface LeagueJoinedEvent extends BaseAchievementEvent {
  type: 'LEAGUE_JOINED';
  leagueId: string;
}

export interface LeagueCreatedEvent extends BaseAchievementEvent {
  type: 'LEAGUE_CREATED';
  leagueId: string;
}

export interface TournamentWonEvent extends BaseAchievementEvent {
  type: 'TOURNAMENT_WON';
  tournamentId: string;
}

export interface ATCCompletedEvent extends BaseAchievementEvent {
  type: 'ATC_COMPLETED';
  durationMs: number;
}

export type AchievementEvent =
  | VisitSubmittedEvent
  | LegWonEvent
  | LegLostEvent
  | CheckoutMadeEvent
  | CheckoutAttemptEvent
  | ScoreHitEvent
  | BustEvent
  | MatchCompletedEvent
  | MatchWonEvent
  | MatchLostEvent
  | LeagueJoinedEvent
  | LeagueCreatedEvent
  | TournamentWonEvent
  | ATCCompletedEvent;
