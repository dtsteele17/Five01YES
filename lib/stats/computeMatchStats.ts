import { MatchVisit } from '@/lib/utils/match-persistence';
import { calculateCheckoutPercentage, isValidCheckout } from '@/lib/match-logic';

export interface PlayerMatchStats {
  threeDartAverage: number;
  first9Average: number;
  first9TotalScore: number;
  first9DartsThrown: number;
  first9PointsScored: number;
  checkoutAttempts: number;
  checkoutsMade: number;
  checkoutPercent: number;
  checkoutDartsAttempted: number;
  highestCheckout: number;
  highestVisit: number;
  oneEighties: number;
  totalPointsScored: number;
  totalDartsThrown: number;
  count100Plus: number;
  count140Plus: number;
  bestLegAverage: number;
  legsWon: number;
}

export function computeMatchStats(
  visits: MatchVisit[],
  player: 'user' | 'opponent',
  gameMode: '301' | '501',
  checkoutDartsAttemptedOverride?: number,
  checkoutsMadeOverride?: number
): PlayerMatchStats {
  // Get ALL visits including busts (for accurate dart count)
  const allPlayerVisits = visits.filter(v => v.player === player);
  // Get only valid visits (for scoring)
  const playerVisits = allPlayerVisits.filter(v => !v.isBust);

  if (playerVisits.length === 0 && allPlayerVisits.length === 0) {
    return {
      threeDartAverage: 0,
      first9Average: 0,
      first9TotalScore: 0,
      first9DartsThrown: 0,
      first9PointsScored: 0,
      checkoutAttempts: 0,
      checkoutsMade: 0,
      checkoutPercent: 0,
      checkoutDartsAttempted: 0,
      highestCheckout: 0,
      highestVisit: 0,
      oneEighties: 0,
      totalPointsScored: 0,
      totalDartsThrown: 0,
      count100Plus: 0,
      count140Plus: 0,
      bestLegAverage: 0,
      legsWon: 0,
    };
  }

  const totalPointsScored = playerVisits.reduce((sum, v) => sum + v.score, 0);
  // CRITICAL: Count ALL darts including busts for accurate 3-dart average
  const totalDartsThrown = allPlayerVisits.reduce((sum, v) => sum + (v.dartsThrown || 3), 0);
  const threeDartAverage = totalDartsThrown > 0 ? (totalPointsScored / totalDartsThrown) * 3 : 0;

  const legNumbers = Array.from(new Set(playerVisits.map(v => v.legNumber)));
  const legsWon = legNumbers.length > 0 ? playerVisits.filter(v => v.isCheckout).length : 0;

  let first9DartsThrown = 0;
  let first9PointsScored = 0;

  legNumbers.forEach(legNum => {
    const legVisits = playerVisits.filter(v => v.legNumber === legNum);
    const first3VisitsInLeg = legVisits.slice(0, 3);
    first9DartsThrown += first3VisitsInLeg.length * 3;
    first9PointsScored += first3VisitsInLeg.reduce((sum, v) => sum + v.score, 0);
  });

  const first9Average = first9DartsThrown > 0 ? (first9PointsScored / first9DartsThrown) * 3 : 0;

  const oneEighties = playerVisits.filter(v => v.score === 180).length;
  const count100Plus = playerVisits.filter(v => v.score >= 100).length;
  const count140Plus = playerVisits.filter(v => v.score >= 140).length;
  const highestVisit = playerVisits.length > 0 ? Math.max(...playerVisits.map(v => v.score)) : 0;

  let checkoutDartsAttempted = checkoutDartsAttemptedOverride ?? 0;
  let checkoutsMade = checkoutsMadeOverride ?? playerVisits.filter(v => v.checkoutSuccess || v.isCheckout).length;

  if (checkoutDartsAttemptedOverride === undefined) {
    // Calculate darts at double properly like dartcounter.net
    // Only count darts from visits where player started on a valid checkout
    checkoutDartsAttempted = playerVisits.reduce((sum, v) => {
      const remainingBefore = v.remainingBefore || v.remainingScore + v.score;
      // Only count if starting on a valid checkout
      if (isValidCheckout(remainingBefore)) {
        return sum + (v.dartsAtDouble ?? v.dartsThrown ?? 3);
      }
      return sum;
    }, 0);
  }

  const checkoutAttempts = playerVisits.filter(v => {
    const remainingBefore = v.remainingBefore || v.remainingScore + v.score;
    return isValidCheckout(remainingBefore);
  }).length;

  // Use proper checkout percentage calculation
  const checkoutPercent = calculateCheckoutPercentage(checkoutsMade, checkoutDartsAttempted);

  let highestCheckout = 0;

  // Find highest checkout - a checkout is when isCheckout is true
  // The checkout value is the remaining score BEFORE the visit (what they checked out from)
  playerVisits.forEach((visit) => {
    if (visit.isCheckout) {
      // The checkout value is what was remaining before this visit
      const checkoutValue = visit.remainingScore + visit.score;
      if (checkoutValue > highestCheckout && checkoutValue > 0 && checkoutValue <= 170) {
        highestCheckout = checkoutValue;
      }
    }
  });

  let bestLegAverage = 0;

  legNumbers.forEach(legNum => {
    const legVisits = playerVisits.filter(v => v.legNumber === legNum && !v.isBust);
    if (legVisits.length > 0) {
      const legPoints = legVisits.reduce((sum, v) => sum + v.score, 0);
      const legDarts = legVisits.length * 3;
      const legAvg = (legPoints / legDarts) * 3;
      if (legAvg > bestLegAverage) {
        bestLegAverage = legAvg;
      }
    }
  });

  return {
    threeDartAverage: Math.round(threeDartAverage * 100) / 100,
    first9Average: Math.round(first9Average * 100) / 100,
    first9TotalScore: first9PointsScored,
    first9DartsThrown,
    first9PointsScored,
    checkoutAttempts,
    checkoutsMade,
    checkoutPercent: Math.round(checkoutPercent * 100) / 100,
    checkoutDartsAttempted,
    highestCheckout,
    highestVisit,
    oneEighties,
    totalPointsScored,
    totalDartsThrown,
    count100Plus,
    count140Plus,
    bestLegAverage: Math.round(bestLegAverage * 100) / 100,
    legsWon,
  };
}
