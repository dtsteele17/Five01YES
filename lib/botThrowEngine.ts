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

// === CALIBRATION ADJUSTMENTS ===
// Fine-tune ring alignment with the physical dartboard image
// Multiplicative calibration factors to align overlay rings with the PNG dartboard

// Treble ring calibration: move inward by ~2.5% (shrink both inner+outer treble radii)
export const TREBLE_CAL = 0.975;  // 2.5% reduction

// Double ring calibration: move inward by ~1.5% (shrink both inner+outer double radii)
export const DOUBLE_CAL = 0.985;  // 1.5% reduction

// Bull ring calibration (keep unchanged)
export const BULL_CAL = 1.00;

// Ring radii as fractions of R_BOARD (based on real dartboard proportions)
// Base proportions are multiplied by calibration factors for precise alignment
export const R_BULL_IN = R_BOARD * (0.04 * BULL_CAL);     // Double Bull inner
export const R_BULL_OUT = R_BOARD * (0.10 * BULL_CAL);    // Single Bull outer
export const R_TREBLE_IN = R_BOARD * (0.56 * TREBLE_CAL);   // Treble ring inner
export const R_TREBLE_OUT = R_BOARD * (0.64 * TREBLE_CAL);  // Treble ring outer
export const R_DOUBLE_IN = R_BOARD * (0.92 * DOUBLE_CAL);   // Double ring inner
export const R_DOUBLE_OUT = R_BOARD * (1.00 * DOUBLE_CAL);  // Double ring outer

// === ANIMATION TIMING CONSTANTS ===
// Control the speed and feel of bot throw animations
export const DART_THROW_INTERVAL_MS = 1000;  // Delay between each dart (1 second)
export const DART_APPEAR_DELAY_MS = 300;     // Delay before dot appears after "throw"
export const SCORE_UPDATE_DELAY_MS = 500;    // Delay before score text updates after dot appears
export const DOT_FADE_DURATION_MS = 2000;    // How long dots stay visible

// === DOT VISIBILITY CONSTANTS ===
export const DOT_RADIUS_PX = 8;              // Dot radius (larger = more visible)
export const DOT_POP_SCALE = 1.3;            // Scale factor for pop-in animation

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
  bustReason?: string;
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
// Tuned to achieve target 3-dart averages with realistic variance
const LEVEL_BASE_SIGMA: Record<number, number> = {
  95: 0.055,  // Elite precision - ~95 avg (tight grouping, frequent T20/T19)
  85: 0.075,  // Professional level - ~85 avg (good T20s, occasional misses)
  75: 0.095,  // Strong player - ~75 avg (decent trebles, more singles)
  65: 0.120,  // Above average - ~65 avg (mix of trebles and singles)
  55: 0.145,  // Average player - ~55 avg (fewer trebles, more big singles)
  45: 0.175,  // Below average - ~45 avg (mostly singles, some trebles)
  35: 0.210,  // Beginner - ~35 avg (many singles, occasional treble)
  25: 0.250,  // Novice - ~25 avg (very scattered, lots of singles/misses)
};

const DOUBLE_MISS_PROBABILITY: Record<number, number> = {
  95: 0.18,  // Elite: 82% hit double when aiming
  85: 0.28,  // Pro: 72% hit double
  75: 0.38,  // Strong: 62% hit double
  65: 0.50,  // Above avg: 50% hit double
  55: 0.62,  // Average: 38% hit double
  45: 0.75,  // Below avg: 25% hit double
  35: 0.85,  // Beginner: 15% hit double
  25: 0.92,  // Novice: 8% hit double
};

const OFFBOARD_BASE_PROBABILITY: Record<number, number> = {
  95: 0.001,  // Elite: almost no misses
  85: 0.005,  // Pro: very few misses
  75: 0.012,  // Strong: occasional miss
  65: 0.025,  // Above avg: some misses
  55: 0.045,  // Average: regular misses
  45: 0.080,  // Below avg: frequent misses
  35: 0.120,  // Beginner: many misses
  25: 0.180,  // Novice: very frequent misses
};

// === COMPREHENSIVE CHECKOUT TABLE (170 down to 2) ===
// Standard checkout routes used by professional players
// Format: { score: ['dart1', 'dart2', 'dart3'], ... }
export const CHECKOUT_TABLE: Record<number, string[]> = {
  170: ['T20', 'T20', 'BULL'],
  167: ['T20', 'T19', 'BULL'],
  164: ['T20', 'T18', 'BULL'],
  161: ['T20', 'T17', 'BULL'],
  160: ['T20', 'T20', 'D20'],
  158: ['T20', 'T20', 'D19'],
  157: ['T20', 'T19', 'D20'],
  156: ['T20', 'T20', 'D18'],
  155: ['T20', 'T19', 'D19'],
  154: ['T20', 'T18', 'D20'],
  153: ['T20', 'T19', 'D18'],
  152: ['T20', 'T20', 'D16'],
  151: ['T20', 'T17', 'D20'],
  150: ['T20', 'T18', 'D18'],
  149: ['T20', 'T19', 'D16'],
  148: ['T20', 'T16', 'D20'],
  147: ['T20', 'T17', 'D18'],
  146: ['T20', 'T18', 'D16'],
  145: ['T20', 'T15', 'D20'],
  144: ['T20', 'T20', 'D12'],
  143: ['T20', 'T17', 'D16'],
  142: ['T20', 'T14', 'D20'],
  141: ['T20', 'T19', 'D12'],
  140: ['T20', 'T16', 'D16'],
  139: ['T20', 'T13', 'D20'],
  138: ['T20', 'T18', 'D12'],
  137: ['T20', 'T15', 'D16'],
  136: ['T20', 'T20', 'D8'],
  135: ['T20', 'T17', 'D12'],
  134: ['T20', 'T14', 'D16'],
  133: ['T20', 'T19', 'D8'],
  132: ['T20', 'T16', 'D12'],
  131: ['T20', 'T13', 'D16'],
  130: ['T20', 'T18', 'D8'],
  129: ['T19', 'T16', 'D12'],
  128: ['T18', 'T14', 'D16'],
  127: ['T20', 'T17', 'D8'],
  126: ['T19', 'T19', 'D6'],
  125: ['T18', 'T13', 'D16'],
  124: ['T20', 'T16', 'D8'],
  123: ['T19', 'T16', 'D9'],
  122: ['T18', 'T18', 'D7'],
  121: ['T20', 'T11', 'D14'],
  120: ['T20', 'S20', 'D20'],
  119: ['T19', 'T12', 'D13'],
  118: ['T20', 'S18', 'D20'],
  117: ['T20', 'S17', 'D20'],
  116: ['T20', 'S16', 'D20'],
  115: ['T20', 'S15', 'D20'],
  114: ['T20', 'S14', 'D20'],
  113: ['T20', 'S13', 'D20'],
  112: ['T20', 'S12', 'D20'],
  111: ['T20', 'S11', 'D20'],
  110: ['T20', 'BULL'],
  109: ['T20', 'S9', 'D20'],
  108: ['T20', 'S16', 'D16'],
  107: ['T19', 'BULL'],
  106: ['T20', 'S6', 'D20'],
  105: ['T20', 'S5', 'D20'],
  104: ['T18', 'S18', 'D16'],
  103: ['T19', 'S6', 'D20'],
  102: ['T20', 'S10', 'D16'],
  101: ['T17', 'BULL'],
  100: ['T20', 'D20'],
  98: ['T20', 'D19'],
  97: ['T19', 'D20'],
  96: ['T20', 'D18'],
  95: ['T19', 'D19'],
  94: ['T18', 'D20'],
  93: ['T19', 'D18'],
  92: ['T20', 'D16'],
  91: ['T17', 'D20'],
  90: ['T18', 'D18'],
  89: ['T19', 'D16'],
  88: ['T16', 'D20'],
  87: ['T17', 'D18'],
  86: ['T18', 'D16'],
  85: ['T15', 'D20'],
  84: ['T20', 'D12'],
  83: ['T17', 'D16'],
  82: ['T14', 'D20'],
  81: ['T19', 'D12'],
  80: ['T20', 'D10'],
  79: ['T13', 'D20'],
  78: ['T18', 'D12'],
  77: ['T19', 'D10'],
  76: ['T20', 'D8'],
  75: ['T17', 'D12'],
  74: ['T14', 'D16'],
  73: ['T19', 'D8'],
  72: ['T16', 'D12'],
  71: ['T13', 'D16'],
  70: ['T18', 'D8'],
  69: ['T19', 'D6'],
  68: ['T20', 'D4'],
  67: ['T17', 'D8'],
  66: ['T10', 'D18'],
  65: ['T19', 'D4'],
  64: ['T16', 'D8'],
  63: ['T13', 'D12'],
  62: ['T10', 'D16'],
  61: ['T15', 'D8'],
  60: ['S20', 'D20'],
  59: ['S19', 'D20'],
  58: ['S18', 'D20'],
  57: ['S17', 'D20'],
  56: ['S16', 'D20'],
  55: ['S15', 'D20'],
  54: ['S14', 'D20'],
  53: ['S13', 'D20'],
  52: ['S12', 'D20'],
  51: ['S11', 'D20'],
  50: ['BULL'],
  49: ['S9', 'D20'],
  48: ['S16', 'D16'],
  47: ['S15', 'D16'],
  46: ['S6', 'D20'],
  45: ['S13', 'D16'],
  44: ['S12', 'D16'],
  43: ['S11', 'D16'],
  42: ['S10', 'D16'],
  41: ['S9', 'D16'],
  40: ['D20'],
  39: ['S7', 'D16'],
  38: ['D19'],
  37: ['S5', 'D16'],
  36: ['D18'],
  35: ['S3', 'D16'],
  34: ['D17'],
  33: ['S1', 'D16'],
  32: ['D16'],
  31: ['S15', 'D8'],
  30: ['D15'],
  29: ['S13', 'D8'],
  28: ['D14'],
  27: ['S11', 'D8'],
  26: ['D13'],
  25: ['S9', 'D8'],
  24: ['D12'],
  23: ['S7', 'D8'],
  22: ['D11'],
  21: ['S5', 'D8'],
  20: ['D10'],
  19: ['S3', 'D8'],
  18: ['D9'],
  17: ['S1', 'D8'],
  16: ['D8'],
  15: ['S7', 'D4'],
  14: ['D7'],
  13: ['S5', 'D4'],
  12: ['D6'],
  11: ['S3', 'D4'],
  10: ['D5'],
  9: ['S1', 'D4'],
  8: ['D4'],
  7: ['S3', 'D2'],
  6: ['D3'],
  5: ['S1', 'D2'],
  4: ['D2'],
  3: ['S1', 'D1'],
  2: ['D1'],
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
 * - If performing above target by >5 points: increase sigma (worse accuracy)
 * - If performing below target by >5 points: decrease sigma (better accuracy)
 * - Adjustments are small (max 5%) to avoid scripted feeling
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
  // Need at least 2 visits to calibrate
  if (!tracker || tracker.recentVisits.length < 2) {
    return baseSigma;
  }

  const recentAverage = tracker.recentVisits.reduce((a, b) => a + b, 0) / tracker.recentVisits.length;
  const target = level;
  const difference = recentAverage - target;

  // Tighter threshold for better calibration (5 points instead of 10)
  if (Math.abs(difference) <= 5) {
    return baseSigma; // Performing close enough to target
  }

  // Calculate adjustment based on how far off we are
  // If recentAverage > target: increase sigma (make worse)
  // If recentAverage < target: decrease sigma (make better)
  const adjustmentDirection = difference > 0 ? 1 : -1;
  const adjustmentMagnitude = Math.min(
    Math.abs(difference) / target * 0.8, // Scale based on % difference
    0.05 // Cap at 5%
  );

  const adjustment = 1.0 + (adjustmentDirection * adjustmentMagnitude);

  // Clamp sigma to reasonable bounds
  const adjustedSigma = baseSigma * adjustment;
  return Math.max(0.04, Math.min(0.35, adjustedSigma));
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

/**
 * Get the checkout target for a given remaining score
 * Returns the first dart of the checkout route, or null if no checkout available
 */
function getCheckoutTarget(remaining: number, doubleOut: boolean): string | null {
  if (!doubleOut) return null;
  
  // Check if we have a checkout in the table
  if (CHECKOUT_TABLE[remaining]) {
    return CHECKOUT_TABLE[remaining][0];
  }
  
  // Scores that can't be checked out
  const impossibleScores = [159, 162, 163, 165, 166, 168, 169];
  if (impossibleScores.includes(remaining)) {
    return null;
  }
  
  // Direct double finishes (2-40, even numbers)
  if (remaining >= 2 && remaining <= 40 && remaining % 2 === 0) {
    return `D${remaining / 2}`;
  }
  
  // Bull finish
  if (remaining === 50) return 'BULL';
  
  return null;
}

/**
 * Check if a score requires a double to finish (checkout attempt)
 */
function isCheckoutAttempt(remaining: number, doubleOut: boolean): boolean {
  if (!doubleOut) return remaining <= 60; // Single out: any score <= 60 can finish
  
  // Double out: must finish on double or bull
  // Valid checkout range is 2-170, excluding impossible scores
  const impossibleScores = [159, 162, 163, 165, 166, 168, 169];
  return remaining >= 2 && remaining <= 170 && !impossibleScores.includes(remaining);
}

/**
 * Choose aim target based on remaining score and skill level
 * Realistic patterns: T20 preference, T19 as secondary, singles for low levels
 */
function chooseAimTarget(remaining: number, doubleOut: boolean, level: number): string {
  // === CHECKOUT LOGIC ===
  // Must finish on a double (or bull) when doubleOut is enabled
  if (doubleOut && remaining <= 170) {
    // Check if we have a direct checkout route
    if (CHECKOUT_TABLE[remaining]) {
      const route = CHECKOUT_TABLE[remaining];
      return route[0]; // First dart of checkout route
    }
    
    // No direct checkout - need to set up
    // Aim to leave a good double
    const goodDoubles = [40, 32, 36, 24, 20, 16, 8, 4, 2];
    for (const d of goodDoubles) {
      const needed = remaining - d;
      if (needed >= 60 && needed <= 60) return 'T20';
      if (needed >= 57 && needed <= 59) return 'T19';
      if (needed >= 54 && needed <= 56) return 'T18';
      if (needed >= 51 && needed <= 53) return 'T17';
    }
  }
  
  // Special handling for 50 remaining (Bull or setup)
  if (remaining === 50 && doubleOut) {
    const bullProbability = level >= 75 ? 0.6 : level >= 55 ? 0.35 : 0.15;
    if (Math.random() < bullProbability) {
      return 'BULL'; // Go for DBull finish
    }
    return Math.random() < 0.5 ? 'S10' : 'S18'; // Setup for next visit
  }
  
  // === SCORING MODE ===
  // Above checkout range - score heavily
  if (remaining > 170) {
    const rand = Math.random();
    
    // Low levels (25-35) often aim at big singles
    if (level <= 35) {
      if (rand < 0.40) return 'S20';
      if (rand < 0.65) return 'S19';
      if (rand < 0.80) return 'S18';
      if (rand < 0.90) return 'T20'; // Occasional treble attempt
      return 'T19';
    }
    
    // Mid levels (45-55) mix singles and trebles
    if (level <= 55) {
      if (rand < 0.15) return 'S20';
      if (rand < 0.25) return 'S19';
      if (rand < 0.35) return 'T19'; // T19 as alternative
      return 'T20'; // Mostly T20
    }
    
    // Higher levels mostly go for trebles
    if (rand < 0.20) return 'T19'; // 20% T19 for variety
    if (rand < 0.05 && level >= 75) return 'T14'; // Occasional T14 for pros
    return 'T20'; // Main target
  }
  
  // === SETUP SHOTS (61-170) ===
  // Try to leave a finish
  const setupTargets = [
    { leave: 40, target: 'T20' }, // Leave D20
    { leave: 32, target: 'T20' }, // Leave D16
    { leave: 36, target: 'T19' }, // Leave D18
    { leave: 24, target: 'T18' }, // Leave D12
    { leave: 50, target: 'T20' }, // Leave Bull
  ];
  
  for (const { leave, target } of setupTargets) {
    const needed = remaining - leave;
    if (needed >= 57 && needed <= 60) {
      return needed === 60 ? 'T20' : needed === 57 ? 'T19' : 'T18';
    }
  }
  
  // General scoring in setup range
  if (remaining >= 100) {
    return Math.random() < 0.20 ? 'T19' : 'T20';
  }
  if (remaining >= 80) return Math.random() < 0.25 ? 'T18' : 'T19';
  if (remaining >= 60) return Math.random() < 0.20 ? 'T15' : 'T17';
  
  // Low scores - aim at singles to set up
  if (remaining >= 41) {
    const single = Math.ceil((remaining - 40) / 2);
    if (single >= 1 && single <= 20) return `S${single}`;
  }
  
  return 'S20';
}

function isDoubleTarget(target: string): boolean {
  return target.startsWith('D') || target === 'BULL' || target === 'DBull';
}

/**
 * NEW INTELLIGENT CHECKOUT PLANNING
 * Plans up to 3 darts ahead using the comprehensive checkout table
 * Adapts plan after each dart based on actual result
 */
export function planBotTurn(
  remaining: number,
  doubleOut: boolean,
  botSkill: number,
  dartsLeft: number = 3
): string[] {
  // Impossible checkout scores (cannot be finished with double-out)
  const impossibleScores = [159, 162, 163, 165, 166, 168, 169];
  
  // If no double-out, just score normally
  if (!doubleOut && remaining > 60) {
    // Mix targeting based on skill level
    if (botSkill <= 35) {
      // Low skill: often aim at singles
      return Array(dartsLeft).fill(Math.random() < 0.6 ? 'S20' : 'T20');
    }
    return Array(dartsLeft).fill('T20');
  }
  
  // Without double out, can finish on any score <= 60
  if (!doubleOut && remaining <= 60) {
    if (remaining === 50) return ['BULL'];
    // Aim at single to finish
    return [`S${remaining}`];
  }

  // Check if we have a checkout available (and it's not an impossible score)
  if (doubleOut && remaining <= 170 && !impossibleScores.includes(remaining) && CHECKOUT_TABLE[remaining]) {
    const route = CHECKOUT_TABLE[remaining];
    // Return only as many darts as we have left
    return route.slice(0, dartsLeft);
  }
  
  // Impossible checkout - set up for next visit
  if (doubleOut && impossibleScores.includes(remaining)) {
    // Leave a good double for next time
    if (remaining > 50) return ['T20']; // Score to get under 50
    return ['S20']; // Just score something
  }

  // No direct checkout - play for setup
  // Try to leave a good double
  const goodLeaves = [40, 32, 36, 24, 20, 16, 8]; // Popular doubles

  for (const leave of goodLeaves) {
    const needed = remaining - leave;
    if (needed <= 0) continue;

    // Single dart to reach this leave
    if (dartsLeft >= 1) {
      if (needed === 60) return ['T20'];
      if (needed === 57) return ['T19'];
      if (needed === 54) return ['T18'];
      if (needed === 51) return ['T17'];
      if (needed === 48) return ['T16'];
      if (needed === 45) return ['T15'];
      if (needed >= 1 && needed <= 20) return [`S${needed}`];
    }

    // Two-dart setups
    if (needed <= 120 && dartsLeft >= 2) {
      if (needed === 120) return ['T20', 'S20'];
      if (needed === 114) return ['T20', 'S14'];
      if (needed === 100) return ['T20', 'S20'];
    }

    // Three-dart setups
    if (needed <= 180 && dartsLeft >= 3) {
      return ['T20', 'T20', 'T20'];
    }
  }

  // Default: score heavily
  if (remaining > 170) {
    // Lower levels sometimes aim at singles
    if (botSkill <= 35 && Math.random() < 0.3) {
      return Array(dartsLeft).fill('S20');
    }
    return Array(dartsLeft).fill('T20');
  }

  // We're in checkout range but no clear route - aim for T20 to set up next visit
  return ['T20'];
}

/**
 * Recalculate checkout plan after a dart lands somewhere unexpected
 * This is called after each dart to adapt the strategy
 */
export function replanAfterDart(
  newRemaining: number,
  doubleOut: boolean,
  botSkill: number,
  dartsLeft: number
): string[] {
  return planBotTurn(newRemaining, doubleOut, botSkill, dartsLeft);
}

/**
 * Simulate a full visit (exactly 3 darts, or fewer if checkout achieved)
 * Bot uses intelligent checkout planning with adaptive replanning after each dart
 * Enforces double-out rules: must finish on a double (or bull)
 */
export function simulateVisit({
  level,
  remaining,
  doubleOut,
  formMultiplier,
  tracker = null,
  debug = false,
}: {
  level: number;
  remaining: number;
  doubleOut: boolean;
  formMultiplier: number;
  tracker?: BotPerformanceTracker | null;
  debug?: boolean;
}): VisitResult {
  const darts: DartResult[] = [];
  let currentRemaining = remaining;
  let finished = false;
  let bust = false;
  let bustReason = '';

  // Initial plan for all 3 darts
  let plannedTargets = planBotTurn(currentRemaining, doubleOut, level, 3);

  if (debug) {
    console.log('🎯 DartBot Turn Start:', {
      remaining: currentRemaining,
      doubleOut,
      level,
      initialPlan: plannedTargets,
    });
  }

  for (let i = 0; i < 3; i++) {
    // Get the target for this dart from the plan
    const aimTarget = plannedTargets[i] || 'T20';
    const isDoubleAttempt = doubleOut && isDoubleTarget(aimTarget);

    if (debug) {
      console.log(`  Dart ${i + 1}: Aiming at ${aimTarget} (remaining: ${currentRemaining})`);
    }

    // Throw the dart
    const dart = simulateDart(aimTarget, level, formMultiplier, tracker, isDoubleAttempt);
    darts.push(dart);

    const newRemaining = currentRemaining - dart.score;

    if (debug) {
      console.log(`  Dart ${i + 1}: Hit ${dart.label} (scored: ${dart.score}, new remaining: ${newRemaining})`);
    }

    // === CHECKOUT LOGIC ===
    if (newRemaining === 0) {
      if (doubleOut) {
        // MUST finish on a double or bull
        if (dart.isDouble) {
          finished = true;
          currentRemaining = 0;
          if (debug) console.log('  ✅ CHECKOUT! (Double finish)');
          break;
        } else {
          // Hit single instead of double - BUST!
          bust = true;
          bustReason = 'Must finish on a double';
          if (debug) console.log('  ❌ BUST! (Finished on single, not double)');
          break;
        }
      } else {
        // Single out - any finish is valid
        finished = true;
        currentRemaining = 0;
        if (debug) console.log('  ✅ CHECKOUT!');
        break;
      }
    } else if (newRemaining === 1) {
      // Can't finish on 1 with double out
      bust = true;
      bustReason = 'Cannot finish on 1';
      if (debug) console.log('  ❌ BUST! (Left on 1)');
      break;
    } else if (newRemaining < 0) {
      // Overshot
      bust = true;
      bustReason = 'Overshot';
      if (debug) console.log('  ❌ BUST! (Went below 0)');
      break;
    } else {
      // Valid score - continue
      currentRemaining = newRemaining;

      // ADAPTIVE REPLANNING: Recalculate plan for remaining darts
      const dartsLeft = 3 - (i + 1);
      if (dartsLeft > 0) {
        plannedTargets = replanAfterDart(currentRemaining, doubleOut, level, dartsLeft);
        if (debug && dart.label !== aimTarget) {
          console.log(`  🔄 Replan: Missed ${aimTarget}, hit ${dart.label}. New plan: ${plannedTargets.slice(0, dartsLeft)}`);
        }
      }
    }
  }

  const visitTotal = darts.reduce((sum, dart) => sum + dart.score, 0);

  if (bust) {
    return {
      darts,
      visitTotal,
      bust: true,
      finished: false,
      newRemaining: remaining, // Return to original score on bust
      bustReason,
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
