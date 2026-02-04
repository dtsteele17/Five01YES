const DARTBOARD_NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

/**
 * Dartboard Geometry Constants
 *
 * The dartboard PNG includes the number ring, but the PLAYABLE board
 * is ONLY inside the outer double ring.
 *
 * In normalized coordinates where the overlay square maps to [-1..1]:
 * - R_BOARD = playable outer radius (excludes number ring)
 * - All ring radii are defined as fractions of R_BOARD
 * - Anything with r > R_BOARD is OFFBOARD (MISS)
 */

// Playable board radius (tunable - excludes number ring)
export const R_BOARD = 0.86;

// Ring radii as fractions of R_BOARD (based on real dartboard proportions)
export const R_BULL_IN = R_BOARD * 0.04;     // Double Bull inner (12.7mm / 340mm ≈ 0.037)
export const R_BULL_OUT = R_BOARD * 0.10;    // Single Bull outer (31.8mm / 340mm ≈ 0.094)
export const R_TREBLE_IN = R_BOARD * 0.56;   // Treble ring inner (107mm / 170mm ≈ 0.63 * R_BOARD)
export const R_TREBLE_OUT = R_BOARD * 0.64;  // Treble ring outer (115mm / 170mm ≈ 0.68 * R_BOARD)
export const R_DOUBLE_IN = R_BOARD * 0.92;   // Double ring inner (162mm / 170mm ≈ 0.95 * R_BOARD)
export const R_DOUBLE_OUT = R_BOARD * 1.00;  // Double ring outer (== R_BOARD)

export interface DartResult {
  x: number;
  y: number;
  label: string;
  score: number;
  isDouble: boolean;
  isTreble: boolean;
  offboard: boolean;
  aimTarget?: string; // What the bot was aiming at
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

// Calibration settings for maintaining target average over time
const CALIBRATION_WINDOW = 12; // Track last 12 visits
const CALIBRATION_THRESHOLD = 10; // Adjust if off by more than 10 points
const CALIBRATION_MAX_ADJUSTMENT = 0.03; // Max 3% adjustment per update (0.97-1.03 range)

// Sigma values for realistic scatter (tuned for each level)
// Higher levels = tighter grouping, lower levels = wider spread
const LEVEL_BASE_SIGMA: Record<number, number> = {
  95: 0.050,  // Elite precision
  85: 0.065,  // Professional level
  75: 0.080,  // Strong player
  65: 0.095,  // Above average
  55: 0.110,  // Average player
  45: 0.130,  // Below average
  35: 0.150,  // Beginner
  25: 0.180,  // Novice
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

/**
 * Calculate calibrated sigma to maintain target average over time
 *
 * Adjusts sigma (accuracy) based on rolling average performance:
 * - If performing above target by >10 points: increase sigma (worse accuracy)
 * - If performing below target by >10 points: decrease sigma (better accuracy)
 * - Adjustments are small (max 3%) to avoid scripted feeling
 * - Scores still come from real hits via evaluateDartFromXY()
 *
 * @param baseSigma - Base scatter value for this level
 * @param tracker - Performance tracker with recent visit scores
 * @param level - Target level (25, 35, 45, 55, 65, 75, 85, 95)
 * @returns Calibrated sigma value
 */
function calculateCalibratedSigma(
  baseSigma: number,
  tracker: BotPerformanceTracker | null,
  level: number
): number {
  // Need at least 3 visits to calibrate
  if (!tracker || tracker.recentVisits.length < 3) {
    return baseSigma;
  }

  const recentAverage = tracker.recentVisits.reduce((a, b) => a + b, 0) / tracker.recentVisits.length;
  const target = level;
  const difference = recentAverage - target;

  // Only adjust if difference is more than threshold (10 points)
  if (Math.abs(difference) <= CALIBRATION_THRESHOLD) {
    return baseSigma; // Performing close enough to target
  }

  // Calculate small adjustment based on how far off we are
  // If recentAverage > target: increase sigma (make worse)
  // If recentAverage < target: decrease sigma (make better)
  const adjustmentDirection = difference > 0 ? 1 : -1;
  const adjustmentMagnitude = Math.min(
    Math.abs(difference) / target * 0.5, // Scale based on % difference
    CALIBRATION_MAX_ADJUSTMENT // Cap at 3%
  );

  const adjustment = 1.0 + (adjustmentDirection * adjustmentMagnitude);

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

/**
 * Get angle for a dartboard number in dartboard coordinates
 * 0° = top (20), increasing clockwise
 * Returns angle in radians
 */
function getNumberAngle(number: number): number {
  const index = DARTBOARD_NUMBERS.indexOf(number);
  if (index === -1) return 0;
  // Dartboard: 0° = top (20), clockwise in 18° steps
  // index 0 (20) = 0°, index 1 (1) = 18°, etc.
  return index * 18 * (Math.PI / 180);
}

/**
 * Calculate aim point using real dartboard geometry
 * Uses proper ring radii from geometry constants
 *
 * Coordinate system: (0,0) = center, -y = UP (towards 20)
 * Dartboard angle: 0° = top, clockwise
 * Conversion: x = r*sin(θ), y = -r*cos(θ)
 */
function getAimPoint(target: string): AimTarget {
  // Bull targets at center
  if (target === 'DBull' || target === 'BULL') {
    return { x: 0, y: 0, description: 'DBull' };
  }

  if (target === 'SBull') {
    return { x: 0, y: 0, description: 'SBull' };
  }

  // Double ring - aim at center of double ring
  if (target.startsWith('D')) {
    const number = parseInt(target.substring(1));
    const angle = getNumberAngle(number); // 0° = top, clockwise
    const radius = (R_DOUBLE_IN + R_DOUBLE_OUT) / 2;
    return {
      x: radius * Math.sin(angle),
      y: -radius * Math.cos(angle), // Negative because -y is UP
      description: target,
    };
  }

  // Treble ring - aim at center of treble ring
  if (target.startsWith('T')) {
    const number = parseInt(target.substring(1));
    const angle = getNumberAngle(number);
    const radius = (R_TREBLE_IN + R_TREBLE_OUT) / 2;
    return {
      x: radius * Math.sin(angle),
      y: -radius * Math.cos(angle),
      description: target,
    };
  }

  // Singles - aim at outer singles area (between treble and double)
  if (target.startsWith('S')) {
    const number = parseInt(target.substring(1));
    const angle = getNumberAngle(number);
    const radius = (R_TREBLE_OUT + R_DOUBLE_IN) / 2;
    return {
      x: radius * Math.sin(angle),
      y: -radius * Math.cos(angle),
      description: target,
    };
  }

  return { x: 0, y: 0, description: 'Unknown' };
}

function cartesianToPolar(x: number, y: number): { angle: number; radius: number } {
  const radius = Math.sqrt(x * x + y * y);
  // Use -y because in our coordinate system, negative y is UP (towards 20)
  // This ensures (0, -1) points to the top of the dartboard
  let angle = Math.atan2(-y, x);
  if (angle < 0) angle += 2 * Math.PI;
  return { angle, radius };
}

/**
 * Single shared evaluation function: evaluateDartFromXY
 * Maps normalized board-space coordinates (x,y) to dart scoring
 * This is the ONLY function used to determine dart scores from positions
 *
 * @param x - normalized x coordinate (-1 to 1, 0 = center)
 * @param y - normalized y coordinate (-1 to 1, 0 = center)
 * @returns { label, score, isDouble, isTreble, offboard }
 *
 * Dartboard wedge order (clockwise from top):
 * 20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5
 *
 * Geometry:
 * - Playable board radius: R_BOARD (excludes number ring)
 * - Anything beyond R_BOARD is OFFBOARD (MISS)
 * - Ring radii defined as fractions of R_BOARD
 */
export function evaluateDartFromXY(x: number, y: number): {
  label: string;
  score: number;
  isDouble: boolean;
  isTreble: boolean;
  offboard: boolean;
} {
  const { angle, radius } = cartesianToPolar(x, y);

  // OFFBOARD: Outside playable board (beyond double ring, in number ring area)
  if (radius > R_BOARD) {
    return { label: 'MISS', score: 0, isDouble: false, isTreble: false, offboard: true };
  }

  // Double Bull (Bull's eye) - innermost circle
  if (radius <= R_BULL_IN) {
    return { label: 'DBull', score: 50, isDouble: true, isTreble: false, offboard: false };
  }

  // Single Bull (outer bull) - outer bull circle
  if (radius <= R_BULL_OUT) {
    return { label: 'SBull', score: 25, isDouble: false, isTreble: false, offboard: false };
  }

  // Convert from standard angle (0° = right, counter-clockwise) to dartboard angle (0° = top, clockwise)
  // atan2(-y, x) gives: 0° = right (3 o'clock), 90° = up (12 o'clock), etc.
  // Dartboard needs: 0° = up (20 at top), increasing clockwise
  let dartboardAngle = (Math.PI / 2) - angle;

  // Normalize to 0 to 2π
  while (dartboardAngle < 0) dartboardAngle += 2 * Math.PI;
  while (dartboardAngle >= 2 * Math.PI) dartboardAngle -= 2 * Math.PI;

  // Add half wedge (9°) to align boundaries - wedge centers are at 0°, 18°, 36°, etc.
  let adjustedAngle = dartboardAngle + (9 * Math.PI / 180);
  if (adjustedAngle >= 2 * Math.PI) adjustedAngle -= 2 * Math.PI;

  // Determine which wedge (0-19)
  const wedgeIndex = Math.floor(adjustedAngle / (18 * Math.PI / 180));
  const number = DARTBOARD_NUMBERS[wedgeIndex % 20];

  // Double ring (outermost scoring ring)
  if (radius >= R_DOUBLE_IN && radius <= R_DOUBLE_OUT) {
    return { label: `D${number}`, score: number * 2, isDouble: true, isTreble: false, offboard: false };
  }

  // Treble ring (middle scoring ring)
  if (radius >= R_TREBLE_IN && radius <= R_TREBLE_OUT) {
    return { label: `T${number}`, score: number * 3, isDouble: false, isTreble: true, offboard: false };
  }

  // Singles (all remaining areas inside the board)
  return { label: `S${number}`, score: number, isDouble: false, isTreble: false, offboard: false };
}

/**
 * Simulate a single dart throw with realistic scatter
 * Bot aims at a target, then Gaussian variance determines where it lands
 * @param aimTarget - What the bot is aiming at (e.g. 'T20', 'D16')
 * @param level - Bot skill level (25-95)
 * @param formMultiplier - Current form (0.85-1.15, varies per leg)
 * @param tracker - Performance tracker for calibration
 * @param isDoubleAttempt - Whether aiming at double (affects miss probability)
 * @returns DartResult with landing position, actual score, and aim target
 */
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

  // Random variance - some darts better, some worse
  const rand = Math.random();
  if (rand < 0.10) {
    sigma *= 0.80; // 10% chance of better throw
  } else if (rand > 0.90) {
    sigma *= 1.30; // 10% chance of worse throw
  }

  // Double attempts are harder - increase miss probability
  if (isDoubleAttempt) {
    const doubleMissProb = getDoubleMissProbability(level);
    if (Math.random() < doubleMissProb) {
      sigma *= 1.8; // Significantly worse scatter on double miss
    }
  }

  const aimPoint = getAimPoint(aimTarget);

  // Apply 2D Gaussian scatter around aim point
  const dx = gaussianRandom() * sigma;
  const dy = gaussianRandom() * sigma;

  const actualX = aimPoint.x + dx;
  const actualY = aimPoint.y + dy;

  // Apply random offboard probability for poor throws
  const offboardProb = getOffboardProbability(level);
  const forceOffboard = Math.random() < offboardProb;

  if (forceOffboard) {
    const edgeAngle = Math.atan2(actualY, actualX);
    return {
      x: 1.1 * Math.cos(edgeAngle),
      y: 1.1 * Math.sin(edgeAngle),
      label: 'MISS',
      score: 0,
      isDouble: false,
      isTreble: false,
      offboard: true,
      aimTarget,
    };
  }

  // Use the single shared evaluation function to determine score from position
  // This guarantees: where it lands = what it scores
  const evaluation = evaluateDartFromXY(actualX, actualY);

  return {
    x: actualX,
    y: actualY,
    label: evaluation.label,
    score: evaluation.score,
    isDouble: evaluation.isDouble,
    isTreble: evaluation.isTreble,
    offboard: evaluation.offboard,
    aimTarget, // Include what we aimed at for display
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

/**
 * Choose aim target based on remaining score and skill level
 * Adds realistic variety: sometimes T19, low levels aim at singles
 */
function chooseAimTarget(remaining: number, doubleOut: boolean, level: number): string {
  // Special handling for 50 remaining - sometimes go for bull
  if (remaining === 50 && doubleOut) {
    // Higher levels more likely to go for bull
    const bullProbability = level >= 75 ? 0.5 : level >= 55 ? 0.3 : 0.15;
    if (Math.random() < bullProbability) {
      return 'BULL'; // Go for DBull finish
    }
    // Otherwise set up D20 or D16
    return Math.random() < 0.5 ? 'S10' : 'S18';
  }

  // Checkout range - aim at specific finishes
  if (remaining <= 170 && doubleOut) {
    const checkoutTarget = getCheckoutTarget(remaining, doubleOut);
    if (checkoutTarget) {
      return checkoutTarget;
    }
  }

  // Scoring mode (>170 or no checkout available)
  if (remaining > 170) {
    // Add variety to targeting
    const rand = Math.random();

    // Low levels sometimes aim at big singles instead of trebles
    if (level <= 35 && rand < 0.25) {
      return 'S20'; // Aim at single 20
    }

    // Occasionally switch to T19 for variety (10-20% of the time)
    if (rand < 0.15) {
      return 'T19';
    }

    // Most of the time, aim at T20 (main scoring target)
    return 'T20';
  }

  // Setup shots - try to leave good doubles
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

  // General scoring based on remaining
  if (remaining >= 100) {
    // Add T19 variety
    return Math.random() < 0.15 ? 'T19' : 'T20';
  }
  if (remaining >= 80) return 'T19';
  if (remaining >= 60) return 'T17';
  if (remaining >= 40) return 'T15';

  return 'S20';
}

function isDoubleTarget(target: string): boolean {
  return target.startsWith('D') || target === 'BULL';
}

/**
 * Simulate a full visit (up to 3 darts)
 * Bot chooses targets based on remaining score and throws with realistic variance
 */
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
    const aimTarget = chooseAimTarget(currentRemaining, doubleOut, level); // Pass level
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

/**
 * Debug helper: Returns the dartboard evaluation for given normalized coordinates
 * Use this to verify alignment with the physical dartboard image
 * @param x - normalized x coordinate (-1 to 1, 0 = center)
 * @param y - normalized y coordinate (-1 to 1, 0 = center)
 * @returns full evaluation object with label, score, isDouble, isTreble, offboard
 */
export function debugCoordinateToLabel(x: number, y: number): string {
  return evaluateDartFromXY(x, y).label;
}

/**
 * Debug helper: Log test points to verify dartboard alignment
 * Validates the dartboard wedge mapping with 20 at the top
 * Tests boundary conditions with new geometry constants
 */
export function debugDartboardAlignment(): void {
  const testPoints = [
    { x: 0, y: -0.75, expected: '20', position: 'Singles 20 (top)' },
    { x: 0.75, y: 0, expected: '6', position: 'Singles 6 (right)' },
    { x: 0, y: 0.75, expected: '3', position: 'Singles 3 (bottom)' },
    { x: -0.75, y: 0, expected: '11', position: 'Singles 11 (left)' },
    { x: 0, y: -R_TREBLE_IN - 0.02, expected: 'T20', position: 'Treble 20 (top)' },
    { x: 0, y: -R_DOUBLE_IN - 0.02, expected: 'D20', position: 'Double 20 (top)' },
    { x: 0, y: 0, expected: 'DBull', position: 'Bull center' },
    { x: 0, y: -R_BULL_OUT + 0.01, expected: 'SBull', position: 'Outer bull' },
    { x: 0, y: -R_BOARD - 0.05, expected: 'MISS', position: 'Offboard (beyond R_BOARD)' },
    { x: 0, y: -R_BOARD + 0.01, expected: 'D20', position: 'Just inside board edge' },
  ];

  console.log('=== Dartboard Alignment Validation ===');
  console.log(`Geometry: R_BOARD=${R_BOARD.toFixed(3)}, R_DOUBLE_IN=${R_DOUBLE_IN.toFixed(3)}, R_TREBLE_IN=${R_TREBLE_IN.toFixed(3)}`);
  console.log('--------------------------------------');
  testPoints.forEach(({ x, y, expected, position }) => {
    const evaluation = evaluateDartFromXY(x, y);
    const radius = Math.sqrt(x * x + y * y);
    const match = evaluation.label.includes(expected) || expected.includes(evaluation.label.match(/\d+/)?.[0] || '');
    const symbol = match ? '✓' : '✗';
    console.log(
      `${symbol} (${x.toFixed(3)}, ${y.toFixed(3)}) r=${radius.toFixed(3)} [${position}]: ${evaluation.label} (${evaluation.score}) ${
        evaluation.isDouble ? '[DOUBLE]' : ''
      }${evaluation.isTreble ? '[TREBLE]' : ''}${evaluation.offboard ? '[OFFBOARD]' : ''}`
    );
  });
  console.log('======================================');
}
