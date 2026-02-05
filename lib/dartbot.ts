import { DartThrow } from './match-logic';

export interface BotMatchState {
  totalScoredThisMatch: number;
  totalDartsThisMatch: number;
  checkoutAttemptsThisLeg: number;
  lastRemaining?: number;
  stallCount: number;
}

const DARTBOARD_NEIGHBORS: Record<number, { left: number; right: number }> = {
  20: { left: 1, right: 5 },
  1: { left: 18, right: 20 },
  18: { left: 4, right: 1 },
  4: { left: 13, right: 18 },
  13: { left: 6, right: 4 },
  6: { left: 10, right: 13 },
  10: { left: 15, right: 6 },
  15: { left: 2, right: 10 },
  2: { left: 17, right: 15 },
  17: { left: 3, right: 2 },
  3: { left: 19, right: 17 },
  19: { left: 7, right: 3 },
  7: { left: 16, right: 19 },
  16: { left: 8, right: 7 },
  8: { left: 11, right: 16 },
  11: { left: 14, right: 8 },
  14: { left: 9, right: 11 },
  9: { left: 12, right: 14 },
  12: { left: 5, right: 9 },
  5: { left: 20, right: 12 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function gaussianRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

function getTripleHitRate(botAvg: number): number {
  if (botAvg <= 35) return clamp(0.06 + (botAvg - 35) * 0.001, 0.06, 0.10);
  if (botAvg <= 55) return clamp(0.10 + (botAvg - 35) * 0.005, 0.10, 0.20);
  if (botAvg <= 75) return clamp(0.20 + (botAvg - 55) * 0.005, 0.20, 0.30);
  return clamp(0.30 + (botAvg - 75) * 0.008, 0.30, 0.38);
}

function getDoubleHitRate(botAvg: number, attempts: number): number {
  let base = 0;
  if (botAvg <= 35) base = 0.10 + (botAvg - 35) * 0.002;
  else if (botAvg <= 55) base = 0.22 + (botAvg - 35) * 0.0065;
  else if (botAvg <= 75) base = 0.35 + (botAvg - 55) * 0.0115;
  else base = 0.55 + (botAvg - 75) * 0.017;

  const boost = Math.min(attempts * 0.10, 0.20);
  return clamp(base + boost, base, 0.72);
}

function throwAtTriple(target: number, botAvg: number): DartThrow {
  const hitRate = getTripleHitRate(botAvg);
  const roll = Math.random();

  if (roll < hitRate) {
    return { mult: 3, value: target };
  }

  const neighbors = DARTBOARD_NEIGHBORS[target];
  const missRoll = Math.random();
  const skillBias = clamp((botAvg - 35) / 50, 0, 1);

  if (missRoll < 0.55 + skillBias * 0.15) {
    return { mult: 1, value: target };
  } else if (missRoll < 0.75 + skillBias * 0.10) {
    return { mult: 1, value: Math.random() < 0.5 ? neighbors.left : neighbors.right };
  } else if (missRoll < 0.88) {
    const neighborTarget = Math.random() < 0.5 ? neighbors.left : neighbors.right;
    return { mult: 3, value: neighborTarget };
  } else if (missRoll < 0.96) {
    return { mult: 1, value: [1, 5, 12, 9, 14, 11][random(0, 5)] };
  } else {
    return { miss: true };
  }
}

function throwAtDouble(target: number, botAvg: number, attempts: number): DartThrow {
  const hitRate = getDoubleHitRate(botAvg, attempts);
  const roll = Math.random();

  if (roll < hitRate) {
    return { mult: 2, value: target };
  }

  const neighbors = DARTBOARD_NEIGHBORS[target];
  const missRoll = Math.random();
  const skillBias = clamp((botAvg - 35) / 50, 0, 1);

  if (missRoll < 0.58 + skillBias * 0.20) {
    return { mult: 1, value: target };
  } else if (missRoll < 0.82 + skillBias * 0.08) {
    return { mult: 1, value: Math.random() < 0.5 ? neighbors.left : neighbors.right };
  } else if (missRoll < 0.92) {
    const neighborTarget = Math.random() < 0.5 ? neighbors.left : neighbors.right;
    return { mult: 2, value: neighborTarget };
  } else if (missRoll < 0.98) {
    return { mult: 1, value: [1, 5, 12, 9, 14, 11][random(0, 5)] };
  } else {
    return { miss: true };
  }
}

function throwAtSingle(target: number, botAvg: number): DartThrow {
  const hitRate = clamp(0.70 + (botAvg - 35) * 0.004, 0.70, 0.92);
  const roll = Math.random();

  if (roll < hitRate) {
    return { mult: 1, value: target };
  }

  const neighbors = DARTBOARD_NEIGHBORS[target];
  const missRoll = Math.random();

  if (missRoll < 0.70) {
    return { mult: 1, value: Math.random() < 0.5 ? neighbors.left : neighbors.right };
  } else if (missRoll < 0.88) {
    return { mult: 2, value: target };
  } else if (missRoll < 0.96) {
    return { mult: 1, value: [1, 5, 12, 9][random(0, 3)] };
  } else {
    return { miss: true };
  }
}

function getVarianceSigma(botAvg: number): number {
  if (botAvg <= 45) return 18;
  if (botAvg <= 55) return 18 - ((botAvg - 45) / 10) * 4;
  if (botAvg <= 75) return 14 - ((botAvg - 55) / 20) * 4;
  if (botAvg <= 85) return 10 - ((botAvg - 75) / 10) * 2;
  return 8;
}

function throwAtBull(botAvg: number, attempts: number, isDouble: boolean): DartThrow {
  const baseRate = isDouble
    ? clamp(0.08 + (botAvg - 35) * 0.01, 0.08, 0.60)
    : clamp(0.65 + (botAvg - 35) * 0.004, 0.65, 0.88);

  const boost = isDouble ? Math.min(attempts * 0.05, 0.15) : 0;
  const hitRate = clamp(baseRate + boost, baseRate, isDouble ? 0.70 : 0.92);

  const roll = Math.random();

  if (isDouble && roll < hitRate) {
    return { bull: 'DB' };
  }

  if (!isDouble && roll < hitRate) {
    return { bull: 'SB' };
  }

  const missRoll = Math.random();
  if (missRoll < 0.65) {
    return { bull: 'SB' };
  } else if (missRoll < 0.88) {
    return { mult: 1, value: [20, 1, 5, 18][random(0, 3)] };
  } else if (missRoll < 0.96) {
    return { mult: 1, value: [6, 10, 15, 2, 17, 3, 19, 7][random(0, 7)] };
  } else {
    return { miss: true };
  }
}

function generateScoringDarts(botAvg: number, remaining: number): DartThrow[] {
  const sigma = getVarianceSigma(botAvg);
  const targetVisitMean = clamp(Math.round(gaussianRandom(botAvg, sigma)), 20, 140);

  const darts: DartThrow[] = [];
  let visitTotal = 0;

  for (let i = 0; i < 3; i++) {
    const needed = targetVisitMean - visitTotal;

    if (needed >= 50 && Math.random() < 0.75) {
      const dart = throwAtTriple(20, botAvg);
      darts.push(dart);
      visitTotal += getDartScore(dart);
    } else if (needed >= 45 && Math.random() < 0.65) {
      const dart = throwAtTriple(19, botAvg);
      darts.push(dart);
      visitTotal += getDartScore(dart);
    } else if (needed >= 40 && Math.random() < 0.50) {
      const dart = throwAtTriple(18, botAvg);
      darts.push(dart);
      visitTotal += getDartScore(dart);
    } else {
      const targets = botAvg >= 60 ? [20, 19, 18] : [20, 19, 5, 1];
      const target = targets[random(0, targets.length - 1)];
      const dart = throwAtSingle(target, botAvg);
      darts.push(dart);
      visitTotal += getDartScore(dart);
    }
  }

  if (visitTotal === 0 && Math.random() < 0.5) {
    darts[0] = throwAtSingle(20, botAvg);
  }

  return darts;
}

function getCheckoutRoute(remaining: number): { target: number; mult: 1 | 2 | 3; isBull?: boolean }[] {
  // Common one-dart finishes
  if (remaining === 50) return [{ target: 0, mult: 2, isBull: true }];
  if (remaining === 40) return [{ target: 20, mult: 2 }];
  if (remaining === 38) return [{ target: 19, mult: 2 }];
  if (remaining === 36) return [{ target: 18, mult: 2 }];
  if (remaining === 34) return [{ target: 17, mult: 2 }];
  if (remaining === 32) return [{ target: 16, mult: 2 }];
  if (remaining === 30) return [{ target: 15, mult: 2 }];
  if (remaining === 28) return [{ target: 14, mult: 2 }];
  if (remaining === 26) return [{ target: 13, mult: 2 }];
  if (remaining === 24) return [{ target: 12, mult: 2 }];
  if (remaining === 22) return [{ target: 11, mult: 2 }];
  if (remaining === 20) return [{ target: 10, mult: 2 }];
  if (remaining === 18) return [{ target: 9, mult: 2 }];
  if (remaining === 16) return [{ target: 8, mult: 2 }];
  if (remaining === 14) return [{ target: 7, mult: 2 }];
  if (remaining === 12) return [{ target: 6, mult: 2 }];
  if (remaining === 10) return [{ target: 5, mult: 2 }];
  if (remaining === 8) return [{ target: 4, mult: 2 }];
  if (remaining === 6) return [{ target: 3, mult: 2 }];
  if (remaining === 4) return [{ target: 2, mult: 2 }];
  if (remaining === 2) return [{ target: 1, mult: 2 }];

  // Two-dart finishes (61-110 range) - T20 + Double
  if (remaining >= 61 && remaining <= 110) {
    const after_triple = remaining - 60;
    if (after_triple % 2 === 0 && after_triple >= 2 && after_triple <= 40) {
      return [
        { target: 20, mult: 3 },
        { target: after_triple / 2, mult: 2 }
      ];
    }
    // Try T19 for odd finishes
    const after_t19 = remaining - 57;
    if (after_t19 % 2 === 0 && after_t19 >= 2 && after_t19 <= 40) {
      return [
        { target: 19, mult: 3 },
        { target: after_t19 / 2, mult: 2 }
      ];
    }
  }

  // Two-dart finishes (41-60 range) - Single + Double
  if (remaining >= 41 && remaining <= 60) {
    // Prefer leaving D20 (40), D16 (32), or D12 (24)
    const preferredDoubles = [20, 16, 12];
    for (const double of preferredDoubles) {
      const doubleValue = double * 2;
      const setup = remaining - doubleValue;
      if (setup >= 1 && setup <= 20) {
        return [
          { target: setup, mult: 1 },
          { target: double, mult: 2 }
        ];
      }
    }
  }

  // Small odd numbers (3-39) - Single + Double
  if (remaining >= 3 && remaining <= 39 && remaining % 2 === 1) {
    // For odd numbers: single 1, then double the remainder
    const setup = 1;
    const doubleTarget = (remaining - setup) / 2;
    if (doubleTarget >= 1 && doubleTarget <= 20) {
      return [
        { target: setup, mult: 1 },
        { target: doubleTarget, mult: 2 }
      ];
    }
  }

  // Fallback for even numbers not covered above
  if (remaining >= 2 && remaining <= 40 && remaining % 2 === 0) {
    return [{ target: remaining / 2, mult: 2 }];
  }

  // Three-dart finishes (111-170) - T20/T19 + T20/T19/T18 + Double
  if (remaining >= 111 && remaining <= 170) {
    // Try T20 + T20 + Double
    const after_t20_t20 = remaining - 120;
    if (after_t20_t20 % 2 === 0 && after_t20_t20 >= 2 && after_t20_t20 <= 40) {
      return [
        { target: 20, mult: 3 },
        { target: 20, mult: 3 },
        { target: after_t20_t20 / 2, mult: 2 }
      ];
    }
    // Try T20 + T19 + Double
    const after_t20_t19 = remaining - 117;
    if (after_t20_t19 % 2 === 0 && after_t20_t19 >= 2 && after_t20_t19 <= 40) {
      return [
        { target: 20, mult: 3 },
        { target: 19, mult: 3 },
        { target: after_t20_t19 / 2, mult: 2 }
      ];
    }
    // Try T20 + T18 + Double
    const after_t20_t18 = remaining - 114;
    if (after_t20_t18 % 2 === 0 && after_t20_t18 >= 2 && after_t20_t18 <= 40) {
      return [
        { target: 20, mult: 3 },
        { target: 18, mult: 3 },
        { target: after_t20_t18 / 2, mult: 2 }
      ];
    }
    // For bull finishes (170, 167, 164, 161)
    if (remaining === 170) return [{ target: 20, mult: 3 }, { target: 20, mult: 3 }, { target: 0, mult: 2, isBull: true }];
    if (remaining === 167) return [{ target: 20, mult: 3 }, { target: 19, mult: 3 }, { target: 0, mult: 2, isBull: true }];
    if (remaining === 164) return [{ target: 20, mult: 3 }, { target: 18, mult: 3 }, { target: 0, mult: 2, isBull: true }];
    if (remaining === 161) return [{ target: 20, mult: 3 }, { target: 17, mult: 3 }, { target: 0, mult: 2, isBull: true }];
  }

  return [];
}

function generateCheckoutDarts(
  remaining: number,
  botAvg: number,
  attempts: number
): DartThrow[] {
  const route = getCheckoutRoute(remaining);
  if (route.length === 0) {
    return generateSetupDarts(remaining, botAvg);
  }

  const darts: DartThrow[] = [];
  let currentRemaining = remaining;

  for (const step of route) {
    if (darts.length >= 3) break;

    let dart: DartThrow;

    if (step.isBull) {
      dart = throwAtBull(botAvg, attempts, true);
    } else if (step.mult === 3) {
      dart = throwAtTriple(step.target, botAvg);
    } else if (step.mult === 2) {
      dart = throwAtDouble(step.target, botAvg, attempts);
    } else {
      dart = throwAtSingle(step.target, botAvg);
    }

    darts.push(dart);
    const dartScore = getDartScore(dart);
    currentRemaining -= dartScore;

    if (currentRemaining === 0 || currentRemaining < 0 || currentRemaining === 1) {
      break;
    }
  }

  while (darts.length < 3 && currentRemaining > 1) {
    const dart = { miss: true } as DartThrow;
    darts.push(dart);
  }

  return darts;
}

function generateSetupDarts(remaining: number, botAvg: number): DartThrow[] {
  const goodLeaves = [40, 32, 36, 24, 20, 16];
  const targetLeave = goodLeaves[random(0, goodLeaves.length - 1)];
  const needed = remaining - targetLeave;

  if (needed <= 0 || needed > 180) {
    return generateScoringDarts(botAvg, remaining);
  }

  const darts: DartThrow[] = [];
  let visitTotal = 0;

  for (let i = 0; i < 3 && visitTotal < needed; i++) {
    const remaining_needed = needed - visitTotal;

    if (remaining_needed >= 50) {
      const dart = throwAtTriple(20, botAvg);
      darts.push(dart);
      visitTotal += getDartScore(dart);
    } else if (remaining_needed >= 30) {
      const dart = throwAtTriple(remaining_needed >= 45 ? 15 : 10, botAvg);
      darts.push(dart);
      visitTotal += getDartScore(dart);
    } else {
      const dart = throwAtSingle(Math.min(20, remaining_needed), botAvg);
      darts.push(dart);
      visitTotal += getDartScore(dart);
    }
  }

  while (darts.length < 3) {
    darts.push({ miss: true });
  }

  return darts;
}

function getDartScore(dart: DartThrow): number {
  if ('miss' in dart) return 0;
  if ('bull' in dart) return dart.bull === 'DB' ? 50 : 25;
  return dart.mult * dart.value;
}

export function generateBotDarts(
  botAverage: number,
  currentRemaining: number,
  doubleOut: boolean,
  matchState: BotMatchState
): DartThrow[] {
  const isStalled = matchState.lastRemaining === currentRemaining && matchState.stallCount >= 2;

  if (isStalled && matchState.checkoutAttemptsThisLeg >= 5) {
    const boostedAttempts = matchState.checkoutAttemptsThisLeg + 3;
    return generateCheckoutDarts(currentRemaining, botAverage, boostedAttempts);
  }

  const CHECKOUT_THRESHOLD = 170;
  const isCheckoutMode = currentRemaining <= CHECKOUT_THRESHOLD;

  if (isCheckoutMode) {
    const BOGEY_NUMBERS = [159, 158, 157, 156, 155, 154, 153, 152, 151];
    if (BOGEY_NUMBERS.includes(currentRemaining)) {
      return generateSetupDarts(currentRemaining, botAverage);
    }

    return generateCheckoutDarts(currentRemaining, botAverage, matchState.checkoutAttemptsThisLeg);
  }

  return generateScoringDarts(botAverage, currentRemaining);
}

export function getBotThinkingDelay(): number {
  return random(400, 900);
}

export function resetBotLegState(currentMatchState?: BotMatchState): BotMatchState {
  if (currentMatchState) {
    return {
      totalScoredThisMatch: currentMatchState.totalScoredThisMatch,
      totalDartsThisMatch: currentMatchState.totalDartsThisMatch,
      checkoutAttemptsThisLeg: 0,
      stallCount: 0,
      lastRemaining: undefined,
    };
  }

  return {
    totalScoredThisMatch: 0,
    totalDartsThisMatch: 0,
    checkoutAttemptsThisLeg: 0,
    stallCount: 0,
    lastRemaining: undefined,
  };
}
