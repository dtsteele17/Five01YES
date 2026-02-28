export interface VisitData {
  player: 'player1' | 'player2';
  score: number;
  remainingScore: number;
  isBust: boolean;
  isCheckout: boolean;
}

export interface LegData {
  legNumber: number;
  winner: 'player1' | 'player2' | null;
  visits: VisitData[];
}

export interface FinalPlayerStats {
  threeDartAverage: number;
  first9Average: number;
  first9DartsThrown: number;
  first9PointsScored: number;
  highestScore: number;
  highestCheckout: number;
  checkoutPercent: number;
  checkoutDartsAttempted: number;
  checkoutsMade: number;
  count100Plus: number;
  count140Plus: number;
  count180: number;
  legsWon: number;
  totalDartsThrown: number;
  totalPointsScored: number;
}

export interface FinalMatchStats {
  player1: FinalPlayerStats;
  player2: FinalPlayerStats;
}

export function computeFinalMatchStats(
  allLegs: LegData[],
  currentLeg: LegData,
  player1TotalDartsAtDouble: number,
  player1CheckoutsMade: number,
  player2TotalDartsAtDouble: number,
  player2CheckoutsMade: number,
  gameMode: '301' | '501'
): FinalMatchStats {
  const startingScore = gameMode === '301' ? 301 : 501;
  const completedLegs = [...allLegs, currentLeg].filter(leg => leg.winner);

  const player1Stats = computePlayerStats(
    completedLegs,
    'player1',
    player1TotalDartsAtDouble,
    player1CheckoutsMade,
    startingScore
  );

  const player2Stats = computePlayerStats(
    completedLegs,
    'player2',
    player2TotalDartsAtDouble,
    player2CheckoutsMade,
    startingScore
  );

  return {
    player1: player1Stats,
    player2: player2Stats,
  };
}

function computePlayerStats(
  legs: LegData[],
  player: 'player1' | 'player2',
  totalDartsAtDouble: number,
  checkoutsMade: number,
  startingScore: number
): FinalPlayerStats {
  const allVisits = legs.flatMap(leg =>
    leg.visits.filter(v => v.player === player && !v.isBust)
  );

  // Count legs won from actual leg data (most reliable)
  const legsWon = legs.filter(leg => leg.winner === player).length;

  // Count checkouts made from actual visit data (more reliable than state counters)
  let actualCheckoutsMade = 0;
  let highestCheckout = 0;

  legs.forEach(leg => {
    if (leg.winner === player) {
      const legVisits = leg.visits.filter(v => v.player === player);
      const winningVisit = legVisits.find(v => v.isCheckout);

      if (winningVisit) {
        actualCheckoutsMade++;
        const checkoutValue = winningVisit.score;
        if (checkoutValue > highestCheckout && checkoutValue > 0 && checkoutValue <= 170) {
          highestCheckout = checkoutValue;
        }
      }
    }
  });

  // Use actual checkouts if state counters seem stale (0 when we found checkouts in data)
  const finalCheckoutsMade = actualCheckoutsMade > checkoutsMade ? actualCheckoutsMade : checkoutsMade;

  if (allVisits.length === 0) {
    return {
      threeDartAverage: 0,
      first9Average: 0,
      first9DartsThrown: 0,
      first9PointsScored: 0,
      highestScore: 0,
      highestCheckout,
      checkoutPercent: 0,
      checkoutDartsAttempted: totalDartsAtDouble,
      checkoutsMade: finalCheckoutsMade,
      count100Plus: 0,
      count140Plus: 0,
      count180: 0,
      legsWon,
      totalDartsThrown: 0,
      totalPointsScored: 0,
    };
  }

  const totalPointsScored = allVisits.reduce((sum, v) => sum + v.score, 0);
  const totalDartsThrown = allVisits.length * 3;
  const threeDartAverage = totalDartsThrown > 0 ? (totalPointsScored / totalDartsThrown) * 3 : 0;

  let first9DartsThrown = 0;
  let first9PointsScored = 0;

  legs.forEach(leg => {
    const legVisits = leg.visits.filter(v => v.player === player && !v.isBust);
    const first3Visits = legVisits.slice(0, 3);
    first9DartsThrown += first3Visits.length * 3;
    first9PointsScored += first3Visits.reduce((sum, v) => sum + v.score, 0);
  });

  const first9Average = first9DartsThrown > 0 ? (first9PointsScored / first9DartsThrown) * 3 : 0;

  const highestScore = allVisits.length > 0 ? Math.max(...allVisits.map(v => v.score)) : 0;
  const count100Plus = allVisits.filter(v => v.score >= 100).length;
  const count140Plus = allVisits.filter(v => v.score >= 140).length;
  const count180 = allVisits.filter(v => v.score === 180).length;

  // Use whichever is higher — state counter or data-derived count
  const checkoutPercent = totalDartsAtDouble > 0
    ? (finalCheckoutsMade / totalDartsAtDouble) * 100
    : (finalCheckoutsMade > 0 ? 100 : 0);

  return {
    threeDartAverage: Math.round(threeDartAverage * 100) / 100,
    first9Average: Math.round(first9Average * 100) / 100,
    first9DartsThrown,
    first9PointsScored,
    highestScore,
    highestCheckout,
    checkoutPercent: Math.round(checkoutPercent * 100) / 100,
    checkoutDartsAttempted: totalDartsAtDouble,
    checkoutsMade: finalCheckoutsMade,
    count100Plus,
    count140Plus,
    count180,
    legsWon,
    totalDartsThrown,
    totalPointsScored,
  };
}
