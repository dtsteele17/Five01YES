/**
 * Career Mode Bracket Engine
 * 
 * Generates single-elimination brackets, simulates AI vs AI matches,
 * and tracks player progress through tournament rounds.
 */

export interface BracketParticipant {
  id: string;          // opponent UUID or 'player'
  name: string;
  skill: number;       // 0-100
  archetype: string;
  isPlayer: boolean;
  seed: number;
}

export interface BracketMatch {
  round: number;       // 1 = first round, 2 = QF, 3 = SF, 4 = Final (for 16-player)
  position: number;    // match position within round (0-indexed)
  participant1: BracketParticipant | null;
  participant2: BracketParticipant | null;
  winnerId: string | null;
  score: { p1Legs: number; p2Legs: number } | null;
  isPlayerMatch: boolean;
  simulated: boolean;
}

export interface BracketData {
  size: number;        // 8, 16, or 32
  totalRounds: number;
  currentRound: number;
  matches: BracketMatch[];
  playerEliminated: boolean;
  playerEliminatedRound: number | null;
  winnerId: string | null;
  completed: boolean;
}

/**
 * Calculate total rounds for a bracket size
 */
export function getRoundsForSize(size: number): number {
  return Math.log2(size);
}

/**
 * Get round name for display
 */
export function getRoundName(round: number, totalRounds: number): string {
  const roundsFromEnd = totalRounds - round + 1;
  if (roundsFromEnd === 1) return 'Final';
  if (roundsFromEnd === 2) return 'Semi-Final';
  if (roundsFromEnd === 3) return 'Quarter-Final';
  if (roundsFromEnd === 4) return 'Round of 16';
  if (roundsFromEnd === 5) return 'Round of 32';
  return `Round ${round}`;
}

/**
 * Get placement string based on which round player was eliminated
 */
export function getPlacement(eliminatedRound: number | null, totalRounds: number, won: boolean): string {
  if (won) return 'Winner';
  if (eliminatedRound === null) return 'Unknown';
  const roundsFromEnd = totalRounds - eliminatedRound + 1;
  if (roundsFromEnd === 1) return 'Runner-Up';
  if (roundsFromEnd === 2) return 'Semi-Finalist';
  if (roundsFromEnd === 3) return 'Quarter-Finalist';
  return `Round ${eliminatedRound} Exit`;
}

/**
 * Generate a seeded bracket with participants
 */
export function generateBracket(
  participants: BracketParticipant[],
  size: number,
  formatLegs: number,
): BracketData {
  const totalRounds = getRoundsForSize(size);
  const matches: BracketMatch[] = [];

  // Seed participants — player gets a random but fair position
  // Sort by skill descending for seeding, but shuffle within tiers
  const sorted = [...participants].sort((a, b) => {
    if (a.isPlayer) return -1; // Player gets top half seeding
    if (b.isPlayer) return 1;
    return b.skill - a.skill;
  });

  // Create first round matches
  const firstRoundMatches = size / 2;
  for (let i = 0; i < firstRoundMatches; i++) {
    const p1 = sorted[i] || null;
    const p2 = sorted[size - 1 - i] || null; // Standard seeding: 1v8, 2v7, etc.
    const isPlayerMatch = (p1?.isPlayer || p2?.isPlayer) || false;

    matches.push({
      round: 1,
      position: i,
      participant1: p1,
      participant2: p2,
      winnerId: null,
      score: null,
      isPlayerMatch,
      simulated: false,
    });
  }

  // Create placeholder matches for subsequent rounds
  let matchesInRound = firstRoundMatches / 2;
  for (let round = 2; round <= totalRounds; round++) {
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({
        round,
        position: i,
        participant1: null,
        participant2: null,
        winnerId: null,
        score: null,
        isPlayerMatch: false,
        simulated: false,
      });
    }
    matchesInRound = matchesInRound / 2;
  }

  return {
    size,
    totalRounds,
    currentRound: 1,
    matches,
    playerEliminated: false,
    playerEliminatedRound: null,
    winnerId: null,
    completed: false,
  };
}

/**
 * Simulate an AI vs AI match result based on skill ratings
 */
export function simulateMatch(
  p1: BracketParticipant,
  p2: BracketParticipant,
  legsToWin: number,
): { winnerId: string; p1Legs: number; p2Legs: number } {
  let p1Legs = 0;
  let p2Legs = 0;

  while (p1Legs < legsToWin && p2Legs < legsToWin) {
    // Win probability based on skill difference
    const skillDiff = p1.skill - p2.skill;
    const p1WinChance = 0.5 + (skillDiff / 200); // ±25% swing for 50-point skill gap
    const clamped = Math.max(0.15, Math.min(0.85, p1WinChance));

    if (Math.random() < clamped) {
      p1Legs++;
    } else {
      p2Legs++;
    }
  }

  return {
    winnerId: p1Legs > p2Legs ? p1.id : p2.id,
    p1Legs,
    p2Legs,
  };
}

/**
 * Simulate all non-player matches in the current round,
 * then advance winners to next round.
 */
export function simulateCurrentRound(
  bracket: BracketData,
  formatLegs: number,
): BracketData {
  const updated = { ...bracket, matches: [...bracket.matches] };
  const legsToWin = Math.ceil(formatLegs / 2);
  const currentRoundMatches = updated.matches.filter(m => m.round === updated.currentRound);

  for (let i = 0; i < currentRoundMatches.length; i++) {
    const match = currentRoundMatches[i];
    const matchIdx = updated.matches.findIndex(
      m => m.round === match.round && m.position === match.position
    );

    // Skip player match (handled by actual gameplay) and already-decided matches
    if (match.isPlayerMatch || match.winnerId) continue;

    if (match.participant1 && match.participant2) {
      const result = simulateMatch(match.participant1, match.participant2, legsToWin);
      updated.matches[matchIdx] = {
        ...match,
        winnerId: result.winnerId,
        score: { p1Legs: result.p1Legs, p2Legs: result.p2Legs },
        simulated: true,
      };
    } else if (match.participant1 && !match.participant2) {
      // Bye — p1 advances
      updated.matches[matchIdx] = {
        ...match,
        winnerId: match.participant1.id,
        score: { p1Legs: legsToWin, p2Legs: 0 },
        simulated: true,
      };
    }
  }

  return updated;
}

/**
 * Record the player's match result in the bracket
 */
export function recordPlayerResult(
  bracket: BracketData,
  won: boolean,
  playerLegs: number,
  opponentLegs: number,
): BracketData {
  const updated = { ...bracket, matches: [...bracket.matches] };

  const playerMatch = updated.matches.find(
    m => m.round === updated.currentRound && m.isPlayerMatch
  );

  if (!playerMatch) return updated;

  const matchIdx = updated.matches.indexOf(playerMatch);
  const player = playerMatch.participant1?.isPlayer ? playerMatch.participant1 : playerMatch.participant2;
  const opponent = playerMatch.participant1?.isPlayer ? playerMatch.participant2 : playerMatch.participant1;

  if (!player || !opponent) return updated;

  updated.matches[matchIdx] = {
    ...playerMatch,
    winnerId: won ? player.id : opponent.id,
    score: {
      p1Legs: playerMatch.participant1?.isPlayer ? playerLegs : opponentLegs,
      p2Legs: playerMatch.participant1?.isPlayer ? opponentLegs : playerLegs,
    },
    simulated: false,
  };

  if (!won) {
    updated.playerEliminated = true;
    updated.playerEliminatedRound = updated.currentRound;
  }

  return updated;
}

/**
 * Advance winners to the next round
 */
export function advanceToNextRound(bracket: BracketData): BracketData {
  const updated = { ...bracket, matches: [...bracket.matches] };
  const currentRoundMatches = updated.matches.filter(m => m.round === updated.currentRound);

  // Check all matches in current round are decided
  const allDecided = currentRoundMatches.every(m => m.winnerId !== null);
  if (!allDecided) return updated;

  // If this was the final round
  if (updated.currentRound === updated.totalRounds) {
    const finalMatch = currentRoundMatches[0];
    updated.winnerId = finalMatch?.winnerId || null;
    updated.completed = true;
    return updated;
  }

  // Populate next round matches with winners
  const nextRound = updated.currentRound + 1;
  const nextRoundMatches = updated.matches.filter(m => m.round === nextRound);

  for (let i = 0; i < currentRoundMatches.length; i += 2) {
    const match1 = currentRoundMatches[i];
    const match2 = currentRoundMatches[i + 1];
    const nextMatchPos = Math.floor(i / 2);
    const nextMatchIdx = updated.matches.findIndex(
      m => m.round === nextRound && m.position === nextMatchPos
    );

    if (nextMatchIdx === -1) continue;

    const getWinner = (match: BracketMatch): BracketParticipant | null => {
      if (!match.winnerId) return null;
      if (match.participant1?.id === match.winnerId) return match.participant1;
      if (match.participant2?.id === match.winnerId) return match.participant2;
      return null;
    };

    const winner1 = match1 ? getWinner(match1) : null;
    const winner2 = match2 ? getWinner(match2) : null;
    const isPlayerMatch = (winner1?.isPlayer || winner2?.isPlayer) || false;

    updated.matches[nextMatchIdx] = {
      ...updated.matches[nextMatchIdx],
      participant1: winner1,
      participant2: winner2,
      isPlayerMatch,
    };
  }

  updated.currentRound = nextRound;
  return updated;
}

/**
 * Get the player's current opponent in the bracket (for the active round)
 */
export function getPlayerOpponent(bracket: BracketData): BracketParticipant | null {
  const playerMatch = bracket.matches.find(
    m => m.round === bracket.currentRound && m.isPlayerMatch
  );
  if (!playerMatch) return null;

  if (playerMatch.participant1?.isPlayer) return playerMatch.participant2;
  if (playerMatch.participant2?.isPlayer) return playerMatch.participant1;
  return null;
}

/**
 * Full round cycle: simulate AI matches, then advance if all decided
 */
export function processRoundAfterPlayerMatch(
  bracket: BracketData,
  playerWon: boolean,
  playerLegs: number,
  opponentLegs: number,
  formatLegs: number,
): BracketData {
  let b = recordPlayerResult(bracket, playerWon, playerLegs, opponentLegs);
  b = simulateCurrentRound(b, formatLegs);
  b = advanceToNextRound(b);

  // If player was eliminated, simulate remaining rounds to completion
  if (b.playerEliminated && !b.completed) {
    while (!b.completed) {
      b = simulateCurrentRound(b, formatLegs);
      b = advanceToNextRound(b);
    }
  }

  return b;
}
