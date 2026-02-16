/**
 * Local Match Engine
 * 
 * Pure client-side game logic for local pass-and-play matches.
 * No Supabase required - all state is managed in memory.
 */

export interface Visit {
  darts: number[];
  score: number;
  remainingAfter: number;
  isBust: boolean;
  timestamp: number;
}

export interface PlayerState {
  name: string;
  remaining: number;
  legs: number;
  visits: Visit[];
  currentVisit: number[];
}

export interface LocalMatchState {
  player1: PlayerState;
  player2: PlayerState;
  currentLeg: number;
  currentTurn: 'player1' | 'player2';
  legsToWin: number;
  gameMode: 301 | 501;
  doubleOut: boolean;
  winner: string | null;
  matchWinner: 'player1' | 'player2' | null;
  legHistory: LegResult[];
}

export interface LegResult {
  legNumber: number;
  winner: 'player1' | 'player2';
  player1Visits: number;
  player2Visits: number;
  winningDarts: number[];
}

export interface CreateMatchOptions {
  player1Name: string;
  player2Name: string;
  gameMode: 301 | 501;
  matchFormat: 1 | 3 | 5 | 7;
  doubleOut: boolean;
}

/**
 * Create a new local match
 */
export function createMatch(options: CreateMatchOptions): LocalMatchState {
  const startScore = options.gameMode;
  const legsToWin = Math.ceil(options.matchFormat / 2);

  return {
    player1: {
      name: options.player1Name || 'Player 1',
      remaining: startScore,
      legs: 0,
      visits: [],
      currentVisit: [],
    },
    player2: {
      name: options.player2Name || 'Player 2',
      remaining: startScore,
      legs: 0,
      visits: [],
      currentVisit: [],
    },
    currentLeg: 1,
    currentTurn: 'player1',
    legsToWin,
    gameMode: options.gameMode,
    doubleOut: options.doubleOut,
    winner: null,
    matchWinner: null,
    legHistory: [],
  };
}

/**
 * Check if a score would bust
 */
export function isBust(remaining: number, score: number, doubleOut: boolean): boolean {
  const newRemaining = remaining - score;
  
  if (newRemaining < 0) return true;
  if (newRemaining === 0 && doubleOut) {
    // Must finish on a double - for simplicity in local mode,
    // we'll check if the last dart could be a double
    // In a real implementation, you'd track each dart individually
    return false; // Let the UI handle double validation
  }
  if (newRemaining === 1 && doubleOut) return true; // Can't finish on 1 with double out
  
  return false;
}

/**
 * Submit a score for the current turn
 * Returns updated state and whether the turn was successful
 */
export function submitScore(
  state: LocalMatchState,
  score: number,
  darts: number[] = [score]
): { state: LocalMatchState; legWon: boolean; matchWon: boolean } {
  const newState = { ...state };
  const currentPlayer = newState.currentTurn === 'player1' ? newState.player1 : newState.player2;
  
  // Check for bust
  const wouldBust = isBust(currentPlayer.remaining, score, state.doubleOut);
  
  if (wouldBust) {
    // Record the bust
    const visit: Visit = {
      darts,
      score: 0,
      remainingAfter: currentPlayer.remaining,
      isBust: true,
      timestamp: Date.now(),
    };
    currentPlayer.visits.push(visit);
    currentPlayer.currentVisit = [];
    
    // Switch turn
    newState.currentTurn = state.currentTurn === 'player1' ? 'player2' : 'player1';
    
    return { state: newState, legWon: false, matchWon: false };
  }
  
  const newRemaining = currentPlayer.remaining - score;
  
  // Record the visit
  const visit: Visit = {
    darts,
    score,
    remainingAfter: newRemaining,
    isBust: false,
    timestamp: Date.now(),
  };
  currentPlayer.visits.push(visit);
  currentPlayer.remaining = newRemaining;
  currentPlayer.currentVisit = [];
  
  // Check for leg win
  if (newRemaining === 0) {
    const legWon = true;
    currentPlayer.legs++;
    
    // Record leg history
    newState.legHistory.push({
      legNumber: newState.currentLeg,
      winner: newState.currentTurn,
      player1Visits: newState.player1.visits.length,
      player2Visits: newState.player2.visits.length,
      winningDarts: darts,
    });
    
    // Check for match win
    const matchWon = currentPlayer.legs >= state.legsToWin;
    
    if (matchWon) {
      newState.winner = currentPlayer.name;
      newState.matchWinner = newState.currentTurn;
      return { state: newState, legWon: true, matchWon: true };
    }
    
    // Start new leg
    newState.currentLeg++;
    newState.player1.remaining = state.gameMode;
    newState.player2.remaining = state.gameMode;
    newState.player1.visits = [];
    newState.player2.visits = [];
    
    // Alternate who throws first in each leg
    // Player who threw first in previous leg throws second in next leg
    const totalLegsStarted = newState.currentLeg;
    newState.currentTurn = totalLegsStarted % 2 === 1 ? 'player1' : 'player2';
    
    return { state: newState, legWon: true, matchWon: false };
  }
  
  // Switch turn
  newState.currentTurn = state.currentTurn === 'player1' ? 'player2' : 'player1';
  
  return { state: newState, legWon: false, matchWon: false };
}

/**
 * Handle a miss (no score)
 */
export function recordMiss(state: LocalMatchState): LocalMatchState {
  const newState = { ...state };
  const currentPlayer = newState.currentTurn === 'player1' ? newState.player1 : newState.player2;
  
  const visit: Visit = {
    darts: [0, 0, 0],
    score: 0,
    remainingAfter: currentPlayer.remaining,
    isBust: false,
    timestamp: Date.now(),
  };
  currentPlayer.visits.push(visit);
  currentPlayer.currentVisit = [];
  
  // Switch turn
  newState.currentTurn = state.currentTurn === 'player1' ? 'player2' : 'player1';
  
  return newState;
}

/**
 * Handle missing a double (used when trying to checkout)
 */
export function recordMissedDouble(state: LocalMatchState): LocalMatchState {
  const newState = { ...state };
  const currentPlayer = newState.currentTurn === 'player1' ? newState.player1 : newState.player2;
  
  // Record as a visit with 0 score
  const visit: Visit = {
    darts: [0, 0, 0],
    score: 0,
    remainingAfter: currentPlayer.remaining,
    isBust: false,
    timestamp: Date.now(),
  };
  currentPlayer.visits.push(visit);
  currentPlayer.currentVisit = [];
  
  // Switch turn
  newState.currentTurn = state.currentTurn === 'player1' ? 'player2' : 'player1';
  
  return newState;
}

/**
 * Record a bust (manual bust - when player goes over or doesn't finish properly)
 */
export function recordBust(state: LocalMatchState): LocalMatchState {
  const newState = { ...state };
  const currentPlayer = newState.currentTurn === 'player1' ? newState.player1 : newState.player2;
  
  const visit: Visit = {
    darts: [0, 0, 0],
    score: 0,
    remainingAfter: currentPlayer.remaining,
    isBust: true,
    timestamp: Date.now(),
  };
  currentPlayer.visits.push(visit);
  currentPlayer.currentVisit = [];
  
  // Switch turn
  newState.currentTurn = state.currentTurn === 'player1' ? 'player2' : 'player1';
  
  return newState;
}

/**
 * Switch turn manually
 */
export function switchTurn(state: LocalMatchState): LocalMatchState {
  return {
    ...state,
    currentTurn: state.currentTurn === 'player1' ? 'player2' : 'player1',
  };
}

/**
 * Get the current player's stats
 */
export function getCurrentPlayerStats(state: LocalMatchState) {
  const player = state.currentTurn === 'player1' ? state.player1 : state.player2;
  const validVisits = player.visits.filter(v => !v.isBust && v.score > 0);
  
  if (validVisits.length === 0) {
    return {
      average: 0,
      dartsThrown: 0,
      visits: 0,
    };
  }
  
  const totalScore = validVisits.reduce((sum, v) => sum + v.score, 0);
  const totalDarts = player.visits.reduce((sum, v) => sum + v.darts.length, 0);
  
  return {
    average: totalDarts > 0 ? (totalScore / totalDarts) * 3 : 0,
    dartsThrown: totalDarts,
    visits: player.visits.length,
  };
}

/**
 * Get checkout suggestion using the existing checkout helper
 */
export function getCheckoutSuggestion(remaining: number): { label: string; route: string } | null {
  if (remaining <= 0 || remaining > 170 || remaining === 1) {
    return null;
  }
  
  // Bogey numbers (no checkout available)
  const BOGEY_NUMBERS = [169, 168, 166, 165, 163, 162, 159];
  if (BOGEY_NUMBERS.includes(remaining)) {
    return {
      label: 'No checkout',
      route: 'No checkout available (Bogey number)',
    };
  }
  
  // Professional checkout routes for 1-170
  const CHECKOUT_ROUTES: Record<number, string> = {
    2: 'D1', 3: '1 D1', 4: 'D2', 5: '1 D2', 6: 'D3', 7: '3 D2', 8: 'D4', 9: '1 D4',
    10: 'D5', 11: '3 D4', 12: 'D6', 13: '5 D4', 14: 'D7', 15: '7 D4', 16: 'D8', 17: '1 D8',
    18: 'D9', 19: '3 D8', 20: 'D10', 21: '5 D8', 22: 'D11', 23: '7 D8', 24: 'D12', 25: '9 D8',
    26: 'D13', 27: '11 D8', 28: 'D14', 29: '13 D8', 30: 'D15', 31: '7 D12', 32: 'D16', 33: '1 D16',
    34: 'D17', 35: '3 D16', 36: 'D18', 37: '5 D16', 38: 'D19', 39: '7 D16', 40: 'D20',
    41: '9 D16', 42: '10 D16', 43: '11 D16', 44: '12 D16', 45: '13 D16', 46: '14 D16', 47: '15 D16',
    48: '16 D16', 49: '17 D16', 50: '18 D16', 51: '19 D16', 52: '20 D16', 53: '13 D20', 54: '14 D20',
    55: '15 D20', 56: '16 D20', 57: '17 D20', 58: '18 D20', 59: '19 D20', 60: '20 D20',
    61: 'T15 D8', 62: 'T10 D16', 63: 'T13 D12', 64: 'T16 D8', 65: 'T19 D4', 66: 'T10 D18',
    67: 'T17 D8', 68: 'T20 D4', 69: 'T19 D6', 70: 'T18 D8', 71: 'T13 D16', 72: 'T16 D12',
    73: 'T19 D8', 74: 'T14 D16', 75: 'T17 D12', 76: 'T20 D8', 77: 'T19 D10', 78: 'T18 D12',
    79: 'T13 D20', 80: 'T20 D10', 81: 'T19 D12', 82: 'T14 D20', 83: 'T17 D16', 84: 'T20 D12',
    85: 'T15 D20', 86: 'T18 D16', 87: 'T17 D18', 88: 'T20 D14', 89: 'T19 D16', 90: 'T20 D15',
    91: 'T17 D20', 92: 'T20 D16', 93: 'T19 D18', 94: 'T18 D20', 95: 'T19 D19', 96: 'T20 D18',
    97: 'T19 D20', 98: 'T20 D19', 99: 'T20 7 D16', 100: 'T20 D20',
    101: 'T17 10 D16', 102: 'T20 10 D16', 103: 'T19 6 D20', 104: 'T18 18 D16', 105: 'T20 13 D16',
    106: 'T20 10 D18', 107: 'T19 18 D16', 108: 'T20 16 D16', 109: 'T20 17 D16', 110: 'T20 18 D16',
    111: 'T19 14 D20', 112: 'T20 20 D16', 113: 'T20 13 D20', 114: 'T20 14 D20', 115: 'T20 15 D20',
    116: 'T20 16 D20', 117: 'T20 17 D20', 118: 'T20 18 D20', 119: 'T19 20 D20', 120: 'T20 20 D20',
    121: 'T20 11 D20', 122: 'T18 18 D16', 123: 'T19 16 D20', 124: 'T20 16 D20', 125: 'T20 19 D16',
    126: 'T19 19 D16', 127: 'T20 17 D20', 128: 'T20 20 D16', 129: 'T19 20 D16', 130: 'T20 20 D15',
    131: 'T20 11 D20', 132: 'T20 16 D20', 133: 'T20 13 D20', 134: 'T20 14 Bull', 135: 'T20 19 D20',
    136: 'T20 20 D18', 137: 'T20 17 Bull', 138: 'T20 18 Bull', 139: 'T20 19 Bull', 140: 'T20 20 D20',
    141: 'T20 19 Bull', 142: 'T20 14 Bull', 143: 'T20 17 Bull', 144: 'T20 20 Bull', 145: 'T20 15 Bull',
    146: 'T20 18 Bull', 147: 'T20 17 Bull', 148: 'T20 16 Bull', 149: 'T20 19 Bull', 150: 'T20 18 Bull',
    151: 'T20 17 Bull', 152: 'T20 20 Bull', 153: 'T20 19 Bull', 154: 'T20 18 Bull', 155: 'T20 19 Bull',
    156: 'T20 20 Bull', 157: 'T20 19 Bull', 158: 'T20 20 Bull', 160: 'T20 20 Bull', 161: 'T20 17 Bull',
    164: 'T20 18 Bull', 167: 'T20 19 Bull', 170: 'T20 20 Bull',
  };
  
  const route = CHECKOUT_ROUTES[remaining];
  
  if (!route) {
    return {
      label: 'No checkout',
      route: 'No checkout available',
    };
  }
  
  return {
    label: route,
    route: route,
  };
}

/**
 * Calculate match statistics
 */
export function calculateMatchStats(state: LocalMatchState) {
  const calcPlayerStats = (player: PlayerState) => {
    const validVisits = player.visits.filter(v => !v.isBust && v.score > 0);
    const totalScore = validVisits.reduce((sum, v) => sum + v.score, 0);
    const totalDarts = player.visits.reduce((sum, v) => sum + v.darts.length, 0);
    
    return {
      name: player.name,
      legs: player.legs,
      average: totalDarts > 0 ? (totalScore / totalDarts) * 3 : 0,
      dartsThrown: totalDarts,
      visits: player.visits.length,
      highestCheckout: Math.max(...player.visits
        .filter(v => v.remainingAfter === 0 && !v.isBust)
        .map(v => v.score), 0) || 0,
    };
  };
  
  return {
    player1: calcPlayerStats(state.player1),
    player2: calcPlayerStats(state.player2),
    totalLegs: state.currentLeg,
    winner: state.winner,
  };
}

/**
 * Start a rematch with the same settings
 */
export function startRematch(state: LocalMatchState): LocalMatchState {
  return createMatch({
    player1Name: state.player1.name,
    player2Name: state.player2.name,
    gameMode: state.gameMode,
    matchFormat: (state.legsToWin * 2 - 1) as 1 | 3 | 5 | 7,
    doubleOut: state.doubleOut,
  });
}
