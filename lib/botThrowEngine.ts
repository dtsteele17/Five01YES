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

const LEVEL_SIGMA_MAP: Record<number, number> = {
  95: 0.018,
  85: 0.024,
  75: 0.032,
  65: 0.042,
  55: 0.054,
  45: 0.070,
  35: 0.090,
  25: 0.120,
};

function gaussianRandom(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

function getBaseSigma(level: number): number {
  return LEVEL_SIGMA_MAP[level] || 0.05;
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
  formMultiplier: number
): DartResult {
  const baseSigma = getBaseSigma(level);
  let sigma = baseSigma * formMultiplier;

  const rand = Math.random();
  if (rand < 0.10) {
    sigma *= 0.8;
  } else if (rand > 0.90) {
    sigma *= 1.25;
  }

  const aimPoint = getAimPoint(aimTarget);

  const dx = gaussianRandom() * sigma;
  const dy = gaussianRandom() * sigma;

  const actualX = aimPoint.x + dx;
  const actualY = aimPoint.y + dy;

  const { angle, radius } = cartesianToPolar(actualX, actualY);

  const offboard = radius > 1.02 || (level <= 35 && Math.random() < 0.02);

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

function getCheckoutTarget(remaining: number): string | null {
  if (remaining === 50) return 'BULL';
  if (remaining === 40) return 'D20';
  if (remaining === 38) return 'D19';
  if (remaining === 36) return 'D18';
  if (remaining === 32) return 'D16';
  if (remaining === 24) return 'D12';
  if (remaining === 20) return 'D10';
  if (remaining === 16) return 'D8';

  if (remaining >= 2 && remaining <= 40 && remaining % 2 === 0) {
    return `D${remaining / 2}`;
  }

  if (remaining >= 3 && remaining <= 40) {
    return `S1`;
  }

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
  }

  return null;
}

function chooseAimTarget(remaining: number, doubleOut: boolean): string {
  if (remaining > 170) {
    return 'T20';
  }

  const checkoutTarget = getCheckoutTarget(remaining);
  if (checkoutTarget) {
    return checkoutTarget;
  }

  const goodLeaves = [40, 32, 36, 24, 20, 16];
  for (const leave of goodLeaves) {
    const needed = remaining - leave;
    if (needed >= 57 && needed <= 60) {
      return 'T20';
    } else if (needed >= 51 && needed <= 56) {
      return 'T19';
    } else if (needed >= 20 && needed <= 40) {
      return `S${needed}`;
    }
  }

  if (remaining >= 100) return 'T20';
  if (remaining >= 60) return 'T19';
  if (remaining >= 40) return 'S20';

  return 'S20';
}

export function simulateVisit({
  level,
  remaining,
  doubleOut,
  formMultiplier,
}: {
  level: number;
  remaining: number;
  doubleOut: boolean;
  formMultiplier: number;
}): VisitResult {
  const darts: DartResult[] = [];
  let currentRemaining = remaining;
  let finished = false;
  let bust = false;

  for (let i = 0; i < 3; i++) {
    const aimTarget = chooseAimTarget(currentRemaining, doubleOut);
    const dart = simulateDart(aimTarget, level, formMultiplier);
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
