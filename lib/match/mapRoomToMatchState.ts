interface MatchRoom {
  id: string;
  player1_id: string;
  player2_id: string;
  game_mode: number;
  match_format: string;
  status: string;
  current_leg: number;
  legs_to_win: number;
  player1_remaining: number;
  player2_remaining: number;
  current_turn: string;
  winner_id: string | null;
  player1_legs?: number;
  player2_legs?: number;
  summary?: {
    player1_legs?: number;
    player2_legs?: number;
  };
}

interface Profile {
  user_id: string;
  username: string;
}

interface MatchEvent {
  id: string;
  player_id: string;
  seq: number;
  event_type: string;
  score?: number;
  remaining_after?: number;
  payload: {
    score?: number;
    remaining?: number;
    is_bust?: boolean;
    is_checkout?: boolean;
    leg?: number;
  };
  created_at: string;
}

export interface MatchStatePlayer {
  slot: 1 | 2;
  id: string;
  name: string;
  remaining: number;
  legsWon: number;
  threeDartAvg: number;
}

export interface MatchStateVisit {
  id: string;
  playerId: string;
  playerName: string;
  by: 'you' | 'opponent';
  label: string;
  score: number;
  remainingAfter: number;
  leg: number;
  turnNumberInLeg: number;
  isBust: boolean;
  isCheckout: boolean;
  createdAt: string;
}

export interface MappedMatchState {
  id: string;
  status: 'active' | 'finished' | 'abandoned' | 'forfeited';
  currentTurnPlayer: 1 | 2;
  players: [MatchStatePlayer, MatchStatePlayer];
  youArePlayer: 1 | 2 | null;
  visitHistory: MatchStateVisit[];
  winnerId: string | null;
  winnerName?: string;
  endedReason: 'active' | 'forfeit' | 'win';
  forfeiterId?: string;
  forfeiterName?: string;
  currentLeg: number;
  legsToWin: number;
  gameMode: number;
  matchFormat: string;
}

export function mapRoomToMatchState(
  room: MatchRoom | null,
  events: MatchEvent[],
  profiles: Profile[],
  currentUserId: string | null
): MappedMatchState | null {
  if (!room) return null;

  const player1Profile = profiles.find(p => p.user_id === room.player1_id);
  const player2Profile = profiles.find(p => p.user_id === room.player2_id);

  const isPlayer1 = currentUserId === room.player1_id;
  const isPlayer2 = currentUserId === room.player2_id;

  const youArePlayer = isPlayer1 ? 1 : isPlayer2 ? 2 : null;

  const currentTurnPlayer = room.current_turn === room.player1_id ? 1 : 2;

  const allVisitEvents = events
    .filter(e => e.event_type === 'visit')
    .sort((a, b) => a.seq - b.seq);

  const legPlayerTurnCounts: { [leg: number]: { [playerId: string]: number } } = {};

  const visitHistory: MatchStateVisit[] = allVisitEvents.map(e => {
    const playerProfile = profiles.find(p => p.user_id === e.player_id);
    const isCurrentUser = e.player_id === currentUserId;
    const playerName = playerProfile?.username || 'Unknown';

    const score = e.score ?? e.payload.score ?? 0;
    const remainingAfter = e.remaining_after ?? e.payload.remaining ?? 0;
    const leg = e.payload.leg ?? room.current_leg;

    if (!legPlayerTurnCounts[leg]) {
      legPlayerTurnCounts[leg] = {};
    }

    if (!legPlayerTurnCounts[leg][e.player_id]) {
      legPlayerTurnCounts[leg][e.player_id] = 0;
    }
    legPlayerTurnCounts[leg][e.player_id]++;
    const turnNumberInLeg = legPlayerTurnCounts[leg][e.player_id];

    return {
      id: e.id,
      playerId: e.player_id,
      playerName,
      by: isCurrentUser ? 'you' : 'opponent',
      label: isCurrentUser ? 'YOU' : playerName.toUpperCase(),
      score,
      remainingAfter,
      leg,
      turnNumberInLeg,
      isBust: e.payload.is_bust ?? false,
      isCheckout: e.payload.is_checkout ?? false,
      createdAt: e.created_at,
    };
  });

  // Calculate 3-dart averages for each player (like dartcounter.net)
  const player1Visits = visitHistory.filter(v => v.playerId === room.player1_id);
  const player2Visits = visitHistory.filter(v => v.playerId === room.player2_id);

  const player1TotalScore = player1Visits.reduce((sum, v) => sum + v.score, 0);
  const player2TotalScore = player2Visits.reduce((sum, v) => sum + v.score, 0);

  // Count total darts thrown (3 per visit, 2 for checkouts)
  const player1TotalDarts = player1Visits.reduce((sum, v) => {
    return sum + (v.isCheckout ? 2 : 3);
  }, 0);
  
  const player2TotalDarts = player2Visits.reduce((sum, v) => {
    return sum + (v.isCheckout ? 2 : 3);
  }, 0);

  // Calculate 3-dart average: (totalScore / totalDarts) * 3
  const player1ThreeDartAvg = player1TotalDarts > 0
    ? (player1TotalScore / player1TotalDarts) * 3
    : 0;
  const player2ThreeDartAvg = player2TotalDarts > 0
    ? (player2TotalScore / player2TotalDarts) * 3
    : 0;

  const players: [MatchStatePlayer, MatchStatePlayer] = [
    {
      slot: 1,
      id: room.player1_id,
      name: player1Profile?.username || 'Player 1',
      remaining: room.player1_remaining,
      legsWon: room.player1_legs ?? room.summary?.player1_legs ?? 0,
      threeDartAvg: player1ThreeDartAvg,
    },
    {
      slot: 2,
      id: room.player2_id,
      name: player2Profile?.username || 'Waiting...',
      remaining: room.player2_remaining,
      legsWon: room.player2_legs ?? room.summary?.player2_legs ?? 0,
      threeDartAvg: player2ThreeDartAvg,
    },
  ];

  let endedReason: 'active' | 'forfeit' | 'win' = 'active';
  let forfeiterId: string | undefined;
  let forfeiterName: string | undefined;
  let winnerName: string | undefined;

  const latestForfeitEvent = events
    .filter(e => e.event_type === 'forfeit')
    .sort((a, b) => b.seq - a.seq)[0];

  if (room.status === 'forfeited' || latestForfeitEvent) {
    endedReason = 'forfeit';
    if (latestForfeitEvent) {
      forfeiterId = latestForfeitEvent.player_id;
      const forfeiterProfile = profiles.find(p => p.user_id === forfeiterId);
      forfeiterName = forfeiterProfile?.username || 'Unknown';
    }
  } else if (room.status === 'finished' && room.winner_id) {
    endedReason = 'win';
    const winnerProfile = profiles.find(p => p.user_id === room.winner_id);
    winnerName = winnerProfile?.username || 'Unknown';
  }

  return {
    id: room.id,
    status: room.status as 'active' | 'finished' | 'abandoned' | 'forfeited',
    currentTurnPlayer,
    players,
    youArePlayer,
    visitHistory,
    winnerId: room.winner_id,
    winnerName,
    endedReason,
    forfeiterId,
    forfeiterName,
    currentLeg: room.current_leg,
    legsToWin: room.legs_to_win,
    gameMode: room.game_mode,
    matchFormat: room.match_format,
  };
}
