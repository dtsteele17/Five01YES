const DARTBOARD_NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

export interface DartResult {
  x: number;
  y: number;
  label: string;
  score: number;
  isDouble: boolean;
  offboard: boolean;
}

export interface VisitResult {
  darts: DartResult[];
  visitTotal: number;
  bust: boolean;
  finished: boolean;
  newRemaining: number;
}

interface AimTarget {
  x: number;
  y: number;
  description: string;
}

export interface BotPerformanceTracker {
  recentVisits: number[];
  targetLevel: number;
}

const CALIBRATION_WINDOW = 12;
const CALIBRATION_STRENGTH = 0.015;

const LEVEL_BASE_SIGMA: Record<number, number> = {
  95: 0.016,
  85: 0.020,
  75: 0.026,
  65: 0.034,
  55: 0.044,
  45: 0.058,
  35: 0.078,
  25: 0.110,
};

const DOUBLE_MISS_PROBABILITY: Record<number, number> = {
  95: 0.15,
  85: 0.22,
  75: 0.30,
  65: 0.40,
  55: 0.50,
  45: 0.60,
  35: 0.72,
  25: 0.85,
};

const OFFBOARD_BASE_PROBABILITY: Record<number, number> = {
  95: 0.000,
  85: 0.002,
  75: 0.005,
  65: 0.010,
  55: 0.018,
  45: 0.030,
  35: 0.048,
  25: 0.075,
};

function gaussianRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

function getBaseSigma(level: number): number {
  return LEVEL_BASE_SIGMA[level] || 0.05;
}

function getDoubleMissProbability(level: number): number {
  return DOUBLE_MISS_PROBABILITY[level] || 0.5;
}

function getOffboardProbability(level: number): number {
  return OFFBOARD_BASE_PROBABILITY[level] || 0.02;
}

function calculateCalibratedSigma(
  baseSigma: number,
  tracker: BotPerformanceTracker | null,
  level: number
): number {
  if (!tracker || tracker.recentVisits.length < 3) {
    return baseSigma;
  }

  const recentAverage = tracker.recentVisits.reduce((a, b) => a + b, 0) / tracker.recentVisits.length;
  const target = level;
  const difference = recentAverage - target;
  const percentDiff = difference / target;

  let adjustment = 1.0;

  if (Math.abs(percentDiff) > 0.05) {
    adjustment = 1.0 + (percentDiff * CALIBRATION_STRENGTH);
    adjustment = Math.max(0.85, Math.min(1.15, adjustment));
  }

  return baseSigma * adjustment;
}

export function updatePerformanceTracker(
  tracker: BotPerformanceTracker | null,
  visitScore: number,
  level: number
): BotPerformanceTracker {
  if (!tracker) {
    return {
      recentVisits: [visitScore],
      targetLevel: level,
    };
  }

  const updated = [...tracker.recentVisits, visitScore];
  if (updated.length > CALIBRATION_WINDOW) {
    updated.shift();
  }

  return {
    recentVisits: updated,
    targetLevel: level,
  };
}

function getNumberAngle(number: number): number {
  const index = DARTBOARD_NUMBERS.indexOf(number);
  if (index === -1) return 0;
  return index * 18 * (Math.PI / 180);
}

function getAimPoint(target: string): AimTarget {
  if (target === 'T20') {
    const angle = getNumberAngle(20);
    const radius = 0.60;
    return {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      description: 'T20',
    };
  }

  if (target === 'T19') {
    const angle = getNumberAngle(19);
    const radius = 0.60;
    return {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      description: 'T19',
    };
  }

  if (target.startsWith('D')) {
    const number = parseInt(target.substring(1));
    const angle = getNumberAngle(number);
    const radius = 0.94;
    return {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      description: target,
    };
  }

  if (target.startsWith('T')) {
    const number = parseInt(target.substring(1));
    const angle = getNumberAngle(number);
    const radius = 0.60;
    return {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      description: target,
    };
  }

  if (target.startsWith('S')) {
    const number = parseInt(target.substring(1));
    const angle = getNumberAngle(number);
    const radius = 0.75;
    return {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      description: target,
    };
  }

  if (target === 'DBull' || target === 'BULL') {
    return { x: 0, y: 0, description: 'DBull' };
  }

  if (target === 'SBull') {
    return { x: 0, y: 0, description: 'SBull' };
  }

  return { x: 0, y: 0, description: 'Unknown' };
}

function cartesianToPolar(x: number, y: number): { angle: number; radius: number } {
  const radius = Math.sqrt(x * x + y * y);
  let angle = Math.atan2(y, x);
  if (angle < 0) angle += 2 * Math.PI;
  return { angle, radius };
}

function determineSegment(x: number, y: number): { label: string; score: number; isDouble: boolean } {
  const { angle, radius } = cartesianToPolar(x, y);

  if (radius > 1.02) {
    return { label: 'MISS', score: 0, isDouble: false };
  }

  if (radius <= 0.03) {
    return { label: 'DBull', score: 50, isDouble: true };
  }

  if (radius <= 0.065) {
    return { label: 'SBull', score: 25, isDouble: false };
  }

  let adjustedAngle = angle + (9 * Math.PI / 180);
  if (adjustedAngle >= 2 * Math.PI) adjustedAngle -= 2 * Math.PI;

  const wedgeIndex = Math.floor(adjustedAngle / (18 * Math.PI / 180));
  const number = DARTBOARD_NUMBERS[wedgeIndex % 20];

  if (radius >= 0.88 && radius <= 1.0) {
    return { label: `D${number}`, score: number * 2, isDouble: true };
  }

  if (radius >= 0.55 && radius <= 0.65) {
    return { label: `T${number}`, score: number * 3, isDouble: false };
  }

  return { label: `S${number}`, score: number, isDouble: false };
}

export function simulateDart(
  aimTarget: string,
  level: number,
  formMultiplier: number,
  tracker: BotPerformanceTracker | null,
  isDoubleAttempt: boolean = false
): DartResult {
  const baseSigma = getBaseSigma(level);
  const calibratedSigma = calculateCalibratedSigma(baseSigma, tracker, level);
  let sigma = calibratedSigma * formMultiplier;

  const rand = Math.random();
  if (rand < 0.10) {
    sigma *= 0.80;
  } else if (rand > 0.90) {
    sigma *= 1.30;
  }

  if (isDoubleAttempt) {
    const doubleMissProb = getDoubleMissProbability(level);
    if (Math.random() < doubleMissProb) {
      sigma *= 1.8;
    }
  }

  const aimPoint = getAimPoint(aimTarget);

  const dx = gaussianRandom() * sigma;
  const dy = gaussianRandom() * sigma;

  const actualX = aimPoint.x + dx;
  const actualY = aimPoint.y + dy;

  const { angle, radius } = cartesianToPolar(actualX, actualY);

  const offboardProb = getOffboardProbability(level);
  const offboard = radius > 1.02 || Math.random() < offboardProb;

  if (offboard) {
    const edgeAngle = Math.atan2(actualY, actualX);
    return {
      x: 1.1 * Math.cos(edgeAngle),
      y: 1.1 * Math.sin(edgeAngle),
      label: 'MISS',
      score: 0,
      isDouble: false,
      offboard: true,
    };
  }

  const segment = determineSegment(actualX, actualY);

  return {
    x: actualX,
    y: actualY,
    label: segment.label,
    score: segment.score,
    isDouble: segment.isDouble,
    offboard: false,
  };
}

function getCheckoutTarget(remaining: number, doubleOut: boolean): string | null {
  if (!doubleOut) return null;

  if (remaining === 50) return 'BULL';
  if (remaining === 40) return 'D20';
  if (remaining === 38) return 'D19';
  if (remaining === 36) return 'D18';
  if (remaining === 34) return 'D17';
  if (remaining === 32) return 'D16';
  if (remaining === 30) return 'D15';
  if (remaining === 28) return 'D14';
  if (remaining === 26) return 'D13';
  if (remaining === 24) return 'D12';
  if (remaining === 22) return 'D11';
  if (remaining === 20) return 'D10';
  if (remaining === 18) return 'D9';
  if (remaining === 16) return 'D8';
  if (remaining === 14) return 'D7';
  if (remaining === 12) return 'D6';
  if (remaining === 10) return 'D5';
  if (remaining === 8) return 'D4';
  if (remaining === 6) return 'D3';
  if (remaining === 4) return 'D2';
  if (remaining === 2) return 'D1';

  if (remaining >= 2 && remaining <= 40 && remaining % 2 === 0) {
    return `D${remaining / 2}`;
  }

  if (remaining === 3) return 'S1';
  if (remaining === 5) return 'S1';
  if (remaining === 7) return 'S3';
  if (remaining === 9) return 'S1';

  if (remaining >= 41 && remaining <= 60) {
    const setup = remaining - 32;
    if (setup >= 1 && setup <= 20) {
      return `S${setup}`;
    }
  }

  if (remaining >= 61 && remaining <= 110) {
    const afterTriple = remaining - 60;
    if (afterTriple % 2 === 0 && afterTriple >= 2 && afterTriple <= 40) {
      return 'T20';
    }
    return 'T19';
  }

  if (remaining >= 111 && remaining <= 170) {
    const afterT20 = remaining - 60;
    if (afterT20 % 2 === 0 && afterT20 >= 2 && afterT20 <= 60) {
      return 'T20';
    }
    const afterT19 = remaining - 57;
    if (afterT19 % 2 === 0 && afterT19 >= 2 && afterT19 <= 60) {
      return 'T19';
    }
    return 'T20';
  }

  return null;
}

function chooseAimTarget(remaining: number, doubleOut: boolean): string {
  if (remaining > 170) {
    return 'T20';
  }

  if (remaining <= 170 && doubleOut) {
    const checkoutTarget = getCheckoutTarget(remaining, doubleOut);
    if (checkoutTarget) {
      return checkoutTarget;
    }
  }

  const goodLeaves = [40, 32, 36, 24, 20, 16];
  for (const leave of goodLeaves) {
    const needed = remaining - leave;
    if (needed >= 57 && needed <= 60) {
      return 'T20';
    } else if (needed >= 51 && needed <= 56) {
      return 'T19';
    } else if (needed >= 45 && needed <= 50) {
      return 'T17';
    } else if (needed >= 39 && needed <= 44) {
      return 'T15';
    }
  }

  if (remaining >= 100) return 'T20';
  if (remaining >= 80) return 'T19';
  if (remaining >= 60) return 'T17';
  if (remaining >= 40) return 'T15';

  return 'S20';
}

function isDoubleTarget(target: string): boolean {
  return target.startsWith('D') || target === 'BULL';
}

export function simulateVisit({
  level,
  remaining,
  doubleOut,
  formMultiplier,
  tracker = null,
}: {
  level: number;
  remaining: number;
  doubleOut: boolean;
  formMultiplier: number;
  tracker?: BotPerformanceTracker | null;
}): VisitResult {
  const darts: DartResult[] = [];
  let currentRemaining = remaining;
  let finished = false;
  let bust = false;

  for (let i = 0; i < 3; i++) {
    const aimTarget = chooseAimTarget(currentRemaining, doubleOut);
    const isDoubleAttempt = doubleOut && isDoubleTarget(aimTarget);
    const dart = simulateDart(aimTarget, level, formMultiplier, tracker, isDoubleAttempt);
    darts.push(dart);

    const newRemaining = currentRemaining - dart.score;

    if (newRemaining === 0) {
      if (doubleOut) {
        if (dart.isDouble) {
          finished = true;
          currentRemaining = 0;
          break;
        } else {
          bust = true;
          break;
        }
      } else {
        finished = true;
        currentRemaining = 0;
        break;
      }
    } else if (newRemaining === 1) {
      bust = true;
      break;
    } else if (newRemaining < 0) {
      bust = true;
      break;
    } else {
      currentRemaining = newRemaining;
    }
  }

  const visitTotal = darts.reduce((sum, dart) => sum + dart.score, 0);

  if (bust) {
    return {
      darts,
      visitTotal,
      bust: true,
      finished: false,
      newRemaining: remaining,
    };
  }

  return {
    darts,
    visitTotal,
    bust: false,
    finished,
    newRemaining: currentRemaining,
  };
}
