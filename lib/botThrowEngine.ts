/**
 * DartBot Throwing Engine
 * 
 * Simulates realistic dart throws for AI opponent with:
 * - Gaussian scatter based on skill level
 * - Checkout route planning
 * - Board coordinate mapping
 * - Performance tracking for calibration
 */

// === CHECKOUT TABLE ===
// Complete checkout routes for scores 2-170 (double-out required)
// Format: score -> array of targets (e.g., ['T20', 'T20', 'DB'])

export const checkoutRoutes: Record<number, string[]> = {
  // Big fish checkouts
  170: ['T20', 'T20', 'DB'], 167: ['T20', 'T19', 'DB'], 164: ['T20', 'T18', 'DB'], 161: ['T20', 'T17', 'DB'],
  160: ['T20', 'T20', 'D20'], 158: ['T20', 'T20', 'D19'], 157: ['T20', 'T19', 'D20'], 156: ['T20', 'T20', 'D18'],
  155: ['T20', 'T19', 'D19'], 154: ['T20', 'T18', 'D20'], 153: ['T20', 'T19', 'D18'], 152: ['T20', 'T20', 'D16'],
  151: ['T20', 'T17', 'D20'], 150: ['T20', 'T18', 'D18'], 149: ['T20', 'T19', 'D16'], 148: ['T20', 'T20', 'D14'],
  147: ['T20', 'T17', 'D18'], 146: ['T20', 'T18', 'D16'], 145: ['T20', 'T19', 'D14'], 144: ['T20', 'T20', 'D12'],
  143: ['T20', 'T17', 'D16'], 142: ['T20', 'T14', 'D20'], 141: ['T20', 'T19', 'D12'], 140: ['T20', 'T20', 'D10'],
  139: ['T20', 'T13', 'D20'], 138: ['T20', 'T18', 'D12'], 137: ['T20', 'T19', 'D10'], 136: ['T20', 'T20', 'D8'],
  135: ['T20', 'T17', 'D12'], 134: ['T20', 'T14', 'D16'], 133: ['T20', 'T19', 'D8'], 132: ['T20', 'T16', 'D12'],
  131: ['T20', 'T13', 'D16'], 130: ['T20', 'T20', 'D5'], 129: ['T20', 'T19', 'D6'], 128: ['T20', 'T18', 'D7'],
  127: ['T20', 'T17', 'D8'], 126: ['T20', 'T16', 'D9'], 125: ['T20', 'T19', 'D4'], 124: ['T20', 'T16', 'D8'],
  123: ['T20', 'T13', 'D12'], 122: ['T20', 'T18', 'D4'], 121: ['T20', 'T15', 'D8'], 120: ['T20', 'T20', 'D10'],
  119: ['T19', 'T20', 'D10'], 118: ['T20', 'T18', 'D8'], 117: ['T20', 'T17', 'D8'], 116: ['T20', 'T16', 'D8'],
  115: ['T20', 'T15', 'D10'], 114: ['T20', 'T14', 'D12'], 113: ['T20', 'T13', 'D12'], 112: ['T20', 'T20', 'D6'],
  111: ['T20', 'T17', 'D10'], 110: ['T20', 'T18', 'D8'], 109: ['T20', 'T19', 'D6'], 108: ['T20', 'T16', 'D10'],
  107: ['T20', 'T15', 'D8'], 106: ['T20', 'T14', 'D10'], 105: ['T20', 'T13', 'D12'], 104: ['T20', 'T12', 'D10'],
  103: ['T20', 'T11', 'D10'], 102: ['T20', 'T10', 'D11'], 101: ['T20', 'T17', 'D4'], 100: ['T20', 'T20', 'D10'],
  99: ['T20', 'T19', 'D1'], 98: ['T20', 'T18', 'D1'], 97: ['T20', 'T17', 'D2'], 96: ['T20', 'T20', 'D3'],
  95: ['T20', 'T15', 'D5'], 94: ['T20', 'T14', 'D4'], 93: ['T20', 'T19', 'D1'], 92: ['T20', 'T20', 'D1'],
  91: ['T20', 'T17', 'D1'], 90: ['T20', 'T10', 'D10'], 89: ['T19', 'T20', 'D1'], 88: ['T20', 'T16', 'D2'],
  87: ['T20', 'T17', 'D2'], 86: ['T20', 'T18', 'D1'], 85: ['T20', 'T15', 'D5'], 84: ['T20', 'T14', 'D4'],
  83: ['T20', 'T13', 'D5'], 82: ['T20', 'T14', 'D5'], 81: ['T20', 'T15', 'D3'], 80: ['T20', 'D20'],
  79: ['T19', 'D20'], 78: ['T18', 'D20'], 77: ['T19', 'D19'], 76: ['T20', 'D18'], 75: ['T17', 'D20'],
  74: ['T14', 'D20'], 73: ['T19', 'D18'], 72: ['T20', 'D16'], 71: ['T13', 'D20'], 70: ['T20', 'D5'],
  69: ['T19', 'D6'], 68: ['T20', 'D4'], 67: ['T17', 'D8'], 66: ['T10', 'D18'], 65: ['T19', 'D4'],
  64: ['T16', 'D8'], 63: ['T13', 'D12'], 62: ['T10', 'D16'], 61: ['T15', 'D8'], 60: ['20', 'D20'],
  59: ['19', 'D20'], 58: ['18', 'D20'], 57: ['17', 'D20'], 56: ['16', 'D20'], 55: ['15', 'D20'],
  54: ['14', 'D20'], 53: ['13', 'D20'], 52: ['12', 'D20'], 51: ['11', 'D20'], 50: ['10', 'D20'],
  49: ['9', 'D20'], 48: ['8', 'D20'], 47: ['15', 'D16'], 46: ['6', 'D20'], 45: ['13', 'D16'],
  44: ['12', 'D16'], 43: ['11', 'D16'], 42: ['10', 'D16'], 41: ['9', 'D16'], 40: ['D20'],
  39: ['7', 'D16'], 38: ['D19'], 37: ['5', 'D16'], 36: ['D18'], 35: ['3', 'D16'], 34: ['D17'],
  33: ['1', 'D16'], 32: ['D16'], 31: ['7', 'D12'], 30: ['D15'], 29: ['13', 'D8'], 28: ['D14'],
  27: ['11', 'D8'], 26: ['D13'], 25: ['9', 'D8'], 24: ['D12'], 23: ['7', 'D8'], 22: ['D11'],
  21: ['5', 'D8'], 20: ['D10'], 19: ['3', 'D8'], 18: ['D9'], 17: ['1', 'D8'], 16: ['D8'],
  15: ['7', 'D4'], 14: ['D7'], 13: ['5', 'D4'], 12: ['D6'], 11: ['3', 'D4'], 10: ['D5'],
  9: ['1', 'D4'], 8: ['D4'], 7: ['3', 'D2'], 6: ['D3'], 5: ['1', 'D2'], 4: ['D2'], 3: ['1', 'D1'], 2: ['D1'],
};

// These scores cannot be checked out in 3 darts or fewer (with double-out)
const impossibleCheckouts = new Set([159, 162, 163, 165, 166, 168, 169]);

/**
 * Get setup shot target to leave a checkout
 */
export function getSetupTarget(remaining: number, doubleOut: boolean, level: number): string {
  if (!doubleOut) {
    // Straight out - just aim for maximum score
    return remaining >= 60 ? 'T20' : remaining >= 40 ? 'D20' : remaining.toString();
  }
  
  // Can't checkout on 1
  if (remaining === 1) {
    return 'S1'; // Bust
  }
  
  // For scores that can't be checked out, find a setup
  if (remaining > 170 || impossibleCheckouts.has(remaining)) {
    // Aim to leave a nice checkout
    const preferredLeaves = [40, 32, 24, 16, 8, 4, 2, 50, 36, 24, 20];
    for (const leave of preferredLeaves) {
      const needed = remaining - leave;
      if (needed >= 60) return 'T20';
      if (needed >= 57) return 'T19';
      if (needed >= 54) return 'T18';
    }
    return 'T20';
  }
  
  // Has a checkout route, check if skill level supports it
  const route = checkoutRoutes[remaining];
  if (route) {
    // First dart of the route
    return route[0];
  }
  
  // Fallback - aim for T20
  return 'T20';
}

// === CALIBRATION CONSTANTS ===
// These values are tuned to match the DARTBOARD.PNG asset in Supabase storage
// and produce realistic averages for each skill level

export const R_BOARD = 0.86;        // Playable radius (excludes number ring)

// Ring calibration - adjusted to match PNG dartboard proportions
// Treble ring: inner edge at ~54% of board, outer at ~64% (thinner ring)
export const TREBLE_CAL = 0.96;     // 4% inward adjustment (was 0.975)
export const R_TREBLE_IN = R_BOARD * (0.54 * TREBLE_CAL);   // ~0.446
export const R_TREBLE_OUT = R_BOARD * (0.64 * TREBLE_CAL);  // ~0.529

// Double ring: inner edge at ~88% of board, outer at ~98% (at edge of scoring area)
export const DOUBLE_CAL = 0.96;     // 4% inward adjustment (was 0.985)
export const R_DOUBLE_IN = R_BOARD * (0.88 * DOUBLE_CAL);   // ~0.725
export const R_DOUBLE_OUT = R_BOARD * (0.98 * DOUBLE_CAL);  // ~0.808

// Bull proportions
export const R_BULL_IN = R_BOARD * 0.038;   // Inner bull (25) ~0.033
export const R_BULL_OUT = R_BOARD * 0.095;  // Outer bull (single 25) ~0.082

// === SKILL LEVELS ===
// Sigma values tuned so level X produces ~X average over many visits
// Lower sigma = tighter grouping = higher average
// Calibrated against 501 scoring simulation
export const LEVEL_BASE_SIGMA: Record<number, number> = {
  95: 0.045,  // Elite - very tight grouping
  85: 0.065,  // Pro
  75: 0.085,  // Strong
  65: 0.105,  // Above avg
  55: 0.130,  // Average - calibrated target
  45: 0.160,  // Below avg
  35: 0.195,  // Beginner - calibrated target
  25: 0.240,  // Novice
};

// Form multiplier range (85% to 115% of base skill)
export const FORM_MIN = 0.85;
export const FORM_MAX = 1.15;

// Dartboard numbers in clockwise order starting from the top (20)
// Standard dartboard layout: 20 is at 12 o'clock position
export const DARTBOARD_NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

// Segment angle (360 / 20 segments) = 18 degrees = π/10 radians
const SEGMENT_ANGLE = (2 * Math.PI) / 20;  // 0.314 radians = 18°

// Angle offset to position 20 at the TOP (12 o'clock = 90° = π/2 radians in math coords with Y-up)
// In the PNG/SVG visualizer:
//   - 0° is at 3 o'clock (positive x)
//   - Angles increase CLOCKWISE (standard SVG convention with Y-down)
//   - 20 is centered at 12 o'clock (top)
//   - The 20 wedge spans from 9° before top to 9° after top = 81° to 99°
// 
// In math coords with Y-up (used in this engine):
//   - 0° is at 3 o'clock (positive x)  
//   - Angles increase COUNTER-CLOCKWISE
//   - Top (12 o'clock) is at 90° = π/2
//
// To get 20 at the top:
//   - Index 0 (number 20) should map to angle π/2
//   - Each subsequent index moves clockwise on the board
//   - But in math coords (Y-up), clockwise means DECREASING angle
//   - So angle = π/2 - (index * SEGMENT_ANGLE)
//
// This gives:
//   - Index 0 (20): angle = π/2 = 90° (top) ✓
//   - Index 1 (1): angle = 90° - 18° = 72° (top-right)
//   - Index 5 (6): angle = 90° - 90° = 0° (right)
const ANGLE_OFFSET = Math.PI / 2;  // 90° - puts 20 at top

export interface DartResult {
  label: string;
  score: number;
  isDouble: boolean;
  isTreble: boolean;
  offboard: boolean;
  aimTarget: string;
  x: number;
  y: number;
}

export interface VisitResult {
  darts: DartResult[];
  visitTotal: number;
  bust: boolean;
  finished: boolean;
  newRemaining: number;
  bustReason?: string;
}

export interface BotPerformanceTracker {
  visits: number;
  totalScore: number;
  targetAvg: number;
  recentScores: number[];
}

// === RANDOM NUMBER GENERATION ===

/**
 * Box-Muller transform for Gaussian random numbers
 * Mean = 0, StdDev = 1
 */
export function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Generate a form multiplier for the bot (simulates good/bad days)
 */
export function generateFormMultiplier(): number {
  return FORM_MIN + Math.random() * (FORM_MAX - FORM_MIN);
}

// === COORDINATE MAPPING ===

/**
 * Get the base coordinates for aiming at a specific target
 * Returns normalized coordinates (-1 to 1) where center is (0,0)
 * Y-axis points UP toward 20
 */
export function getAimPoint(target: string): { x: number; y: number; ringMultiplier: number } {
  // Parse target format: T20, D20, S20, 20, SBull, DBull, etc.
  let ring: 'T' | 'D' | 'S' | 'SB' | 'DB';
  let number = 20;
  
  if (target.startsWith('T')) {
    ring = 'T';
    number = parseInt(target.slice(1), 10);
  } else if (target.startsWith('D')) {
    ring = 'D';
    number = parseInt(target.slice(1), 10);
  } else if (target === 'DB' || target === 'BULL' || target === 'DBull') {
    return { x: 0, y: 0, ringMultiplier: 1 }; // Center for bull
  } else if (target === 'SB' || target === 'S25' || target === 'SBull') {
    // Aim for the edge of single bull for better chance of hitting it
    const r = (R_BULL_IN + R_BULL_OUT) / 2;
    return { x: 0, y: r, ringMultiplier: 0.8 };
  } else {
    ring = 'S';
    number = parseInt(target, 10) || 20;
  }

  // Find the angle for this number
  const numberIndex = DARTBOARD_NUMBERS.indexOf(number);
  if (numberIndex === -1) {
    console.warn(`[DartBot] Unknown number: ${number}, defaulting to 20`);
    return getAimPoint('T20'); // Default to T20
  }

  // Calculate angle for this number
  // ANGLE_OFFSET = π/2 (90°) puts index 0 (number 20) at the top
  // Numbers go clockwise around the board: 20, 1, 18, 4, ...
  // In math coords with Y-up, clockwise = decreasing angle
  // So we subtract (numberIndex * SEGMENT_ANGLE) from the offset
  const angle = ANGLE_OFFSET - (numberIndex * SEGMENT_ANGLE);

  // Determine radius based on ring
  let radius: number;
  let ringMultiplier: number;
  
  switch (ring) {
    case 'T':
      // Aim for center of treble ring
      radius = (R_TREBLE_IN + R_TREBLE_OUT) / 2;
      ringMultiplier = 1.0;
      break;
    case 'D':
      // Aim for center of double ring
      radius = (R_DOUBLE_IN + R_DOUBLE_OUT) / 2;
      ringMultiplier = 1.0;
      break;
    case 'S':
    default:
      // For singles, aim between bull and treble (single inner area)
      // or between treble and double (single outer area)
      // Use a radius that's safely in the outer single area for consistency
      radius = (R_TREBLE_OUT + R_DOUBLE_IN) / 2;
      ringMultiplier = 0.95;
      break;
  }

  return {
    x: radius * Math.cos(angle),
    y: radius * Math.sin(angle),
    ringMultiplier
  };
}

// === SCORING ===

/**
 * Evaluate where a dart landed and return the score
 * Uses the calibrated ring constants for accurate scoring
 */
export function evaluateDartFromXY(x: number, y: number): {
  label: string;
  score: number;
  isDouble: boolean;
  isTreble: boolean;
  offboard: boolean;
} {
  const radius = Math.sqrt(x * x + y * y);

  // Check if off the board (beyond scoring area)
  if (radius > R_BOARD) {
    return { label: 'MISS', score: 0, isDouble: false, isTreble: false, offboard: true };
  }

  // Bull detection (order matters: inner bull first)
  if (radius <= R_BULL_IN) {
    return { label: 'DBull', score: 50, isDouble: true, isTreble: false, offboard: false };
  }
  if (radius <= R_BULL_OUT) {
    return { label: 'SBull', score: 25, isDouble: false, isTreble: false, offboard: false };
  }

  // Calculate which wedge/segment the dart landed in
  // Math.atan2(y, x) returns angle in radians: 0 at positive x-axis, 
  // positive values for counter-clockwise (with Y-up)
  const angle = Math.atan2(y, x);
  
  // Normalize angle to 0-2π range (0 to 360°)
  let normalizedAngle = angle;
  if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
  
  // Adjust angle to find which dartboard segment
  // ANGLE_OFFSET = π/2 (90°) is where number 20 is centered
  // We add SEGMENT_ANGLE/2 to account for wedge width (each wedge is centered on its number)
  // This puts the boundary between segments at the right offset
  let adjustedAngle = ANGLE_OFFSET - normalizedAngle + (SEGMENT_ANGLE / 2);
  
  // Normalize to 0-2π range
  if (adjustedAngle < 0) adjustedAngle += 2 * Math.PI;
  if (adjustedAngle >= 2 * Math.PI) adjustedAngle -= 2 * Math.PI;
  
  // Find the segment index (0-19)
  const segmentIndex = Math.floor(adjustedAngle / SEGMENT_ANGLE) % 20;
  const number = DARTBOARD_NUMBERS[segmentIndex];

  // Ring detection (check from outside in for correct priority)
  // Double ring
  if (radius >= R_DOUBLE_IN && radius <= R_DOUBLE_OUT) {
    return { 
      label: `D${number}`, 
      score: number * 2, 
      isDouble: true, 
      isTreble: false, 
      offboard: false 
    };
  }
  
  // Treble ring
  if (radius >= R_TREBLE_IN && radius <= R_TREBLE_OUT) {
    return { 
      label: `T${number}`, 
      score: number * 3, 
      isTreble: true, 
      isDouble: false, 
      offboard: false 
    };
  }

  // Single area (inner or outer)
  return { 
    label: `S${number}`, 
    score: number, 
    isDouble: false, 
    isTreble: false, 
    offboard: false 
  };
}

// === DARTBOARD VALIDATION ===

/**
 * Validate that the dartboard geometry is correct
 * Returns diagnostic info for debugging
 */
export function validateDartboardGeometry(): {
  number20: { aim: { x: number; y: number }; score: string };
  number6: { aim: { x: number; y: number }; score: string };
  number3: { aim: { x: number; y: number }; score: string };
} {
  // Test aiming at T20 (should be at top)
  const t20Aim = getAimPoint('T20');
  const t20Score = evaluateDartFromXY(t20Aim.x, t20Aim.y);
  
  // Test aiming at T6 (should be at right, 3 o'clock)
  const t6Aim = getAimPoint('T6');
  const t6Score = evaluateDartFromXY(t6Aim.x, t6Aim.y);
  
  // Test aiming at T3 (should be at bottom)
  const t3Aim = getAimPoint('T3');
  const t3Score = evaluateDartFromXY(t3Aim.x, t3Aim.y);
  
  return {
    number20: { aim: t20Aim, score: t20Score.label },
    number6: { aim: t6Aim, score: t6Score.label },
    number3: { aim: t3Aim, score: t3Score.label },
  };
}

// === SKILL AND THROWING ===

/**
 * Get the base sigma (scatter amount) for a skill level
 */
export function getBaseSigma(level: number): number {
  // Round to nearest defined level
  const levels = Object.keys(LEVEL_BASE_SIGMA).map(Number).sort((a, b) => a - b);
  let closestLevel = levels[0];
  let minDiff = Math.abs(level - closestLevel);
  
  for (const l of levels) {
    const diff = Math.abs(level - l);
    if (diff < minDiff) {
      minDiff = diff;
      closestLevel = l;
    }
  }
  
  return LEVEL_BASE_SIGMA[closestLevel] ?? 0.15;
}

/**
 * Simulate a single dart throw with Gaussian scatter
 */
export function simulateDart(
  aimTarget: string,
  sigma: number
): DartResult {
  const aimPoint = getAimPoint(aimTarget);
  
  // Apply Gaussian scatter
  const dx = gaussianRandom() * sigma;
  const dy = gaussianRandom() * sigma;
  
  const x = aimPoint.x + dx;
  const y = aimPoint.y + dy;
  
  const result = evaluateDartFromXY(x, y);
  
  return {
    ...result,
    aimTarget,
    x,
    y
  };
}

// === CHECKOUT PLANNING ===

/**
 * Plan the bot's turn based on remaining score
 * Returns an array of target strings for each dart (up to 3)
 */
export function planBotTurn(
  remaining: number,
  doubleOut: boolean,
  level: number,
  dartsAvailable: number = 3
): string[] {
  // If no darts left or already finished
  if (dartsAvailable <= 0 || remaining <= 0) {
    return [];
  }

  // Can't finish on 1 in double-out mode
  if (doubleOut && remaining === 1) {
    // Bust - aim for a single to leave a double
    return ['S1', 'S1', 'S1'].slice(0, dartsAvailable);
  }

  // Check for direct checkout route
  if (doubleOut && remaining <= 170 && remaining !== 159 && remaining !== 162 && remaining !== 163 && 
      remaining !== 165 && remaining !== 166 && remaining !== 168 && remaining !== 169) {
    const route = checkoutRoutes[remaining];
    if (route && route.length <= dartsAvailable) {
      // For higher skill levels, attempt the checkout
      // For lower levels, only attempt if it's a simple finish
      const checkoutDifficulty = route.filter(r => r.startsWith('T')).length;
      const minLevelForCheckout = checkoutDifficulty * 15 + 20; // T20 finishes need level 65+
      
      if (level >= minLevelForCheckout || route.length === 1) {
        return route;
      }
    }
  }

  // Need to set up for checkout
  const setup = getSetupTarget(remaining, doubleOut, level);
  
  // Plan remaining darts
  const targets: string[] = [setup];
  const newRemaining = remaining - scoreFromTarget(setup);
  
  if (dartsAvailable > 1 && newRemaining > 0) {
    const remainingTargets = planBotTurn(newRemaining, doubleOut, level, dartsAvailable - 1);
    targets.push(...remainingTargets);
  }
  
  return targets;
}

/**
 * Get the score for a target string
 */
function scoreFromTarget(target: string): number {
  if (target.startsWith('T')) return parseInt(target.slice(1), 10) * 3;
  if (target.startsWith('D')) return parseInt(target.slice(1), 10) * 2;
  if (target === 'DB' || target === 'DBull') return 50;
  if (target === 'SB' || target === 'SBull') return 25;
  return parseInt(target, 10) || 0;
}

/**
 * Replan targets after a dart has been thrown
 */
export function replanAfterDart(
  newRemaining: number,
  doubleOut: boolean,
  level: number,
  dartsLeft: number
): string[] {
  return planBotTurn(newRemaining, doubleOut, level, dartsLeft);
}

// === VISIT SIMULATION ===

export interface SimulateVisitOptions {
  level: number;
  remaining: number;
  doubleOut: boolean;
  formMultiplier?: number;
  tracker?: BotPerformanceTracker | null;
  debug?: boolean;
}

/**
 * Simulate a complete 3-dart visit
 */
export function simulateVisit(options: SimulateVisitOptions): VisitResult {
  const { level, remaining, doubleOut, formMultiplier = 1.0, tracker, debug } = options;
  
  const darts: DartResult[] = [];
  let currentRemaining = remaining;
  
  // Plan initial targets
  let plannedTargets = planBotTurn(currentRemaining, doubleOut, level, 3);
  
  for (let i = 0; i < 3; i++) {
    // Get target for this dart
    const aimTarget = plannedTargets[i] || 'T20';
    
    // Calculate sigma for this throw
    // Checkout attempts have slightly higher pressure/scatter
    const isCheckoutAttempt = doubleOut && currentRemaining <= 170 && (aimTarget.startsWith('D') || aimTarget === 'DB');
    const checkoutPressure = isCheckoutAttempt ? 1.1 : 1.0;
    const sigma = getBaseSigma(level) * formMultiplier * checkoutPressure;
    
    // Simulate the throw
    const dart = simulateDart(aimTarget, sigma);
    darts.push(dart);
    
    // Update remaining score
    currentRemaining -= dart.score;
    
    // Check for finish
    if (currentRemaining === 0) {
      if (!doubleOut || dart.isDouble) {
        // Valid checkout
        return {
          darts,
          visitTotal: remaining,
          bust: false,
          finished: true,
          newRemaining: 0
        };
      }
      // Bust - didn't finish on double
      return {
        darts,
        visitTotal: 0,
        bust: true,
        finished: false,
        newRemaining: remaining,
        bustReason: 'Must finish on double'
      };
    }
    
    // Check for bust (overshot)
    if (currentRemaining < 0) {
      return {
        darts,
        visitTotal: 0,
        bust: true,
        finished: false,
        newRemaining: remaining,
        bustReason: 'Overshot'
      };
    }
    
    // Check for left on 1 (impossible to finish in double-out)
    if (doubleOut && currentRemaining === 1) {
      return {
        darts,
        visitTotal: remaining - 1,
        bust: true,
        finished: false,
        newRemaining: remaining,
        bustReason: 'Left on 1'
      };
    }
    
    // Replan for remaining darts
    plannedTargets = replanAfterDart(currentRemaining, doubleOut, level, 2 - i);
  }
  
  const visitTotal = remaining - currentRemaining;
  
  if (debug) {
    console.log(`[DartBot] Visit: ${darts.map(d => d.label).join(', ')} = ${visitTotal}`);
  }
  
  return {
    darts,
    visitTotal,
    bust: false,
    finished: false,
    newRemaining: currentRemaining
  };
}

// === PERFORMANCE TRACKING ===

/**
 * Initialize a new performance tracker
 */
export function createPerformanceTracker(targetAvg: number): BotPerformanceTracker {
  return {
    visits: 0,
    totalScore: 0,
    targetAvg,
    recentScores: []
  };
}

/**
 * Update the performance tracker with a new visit score
 */
export function updatePerformanceTracker(
  tracker: BotPerformanceTracker | null,
  score: number,
  targetAvg: number
): BotPerformanceTracker {
  if (!tracker) {
    tracker = createPerformanceTracker(targetAvg);
  }
  
  tracker.visits++;
  tracker.totalScore += score;
  tracker.recentScores.push(score);
  
  // Keep only last 10 scores for moving average
  if (tracker.recentScores.length > 10) {
    tracker.recentScores.shift();
  }
  
  return tracker;
}

/**
 * Get current average from tracker
 */
export function getTrackerAverage(tracker: BotPerformanceTracker | null): number {
  if (!tracker || tracker.visits === 0) return 0;
  return tracker.totalScore / tracker.visits;
}

/**
 * Get moving average from recent scores
 */
export function getRecentAverage(tracker: BotPerformanceTracker | null): number {
  if (!tracker || tracker.recentScores.length === 0) return 0;
  const sum = tracker.recentScores.reduce((a, b) => a + b, 0);
  return sum / tracker.recentScores.length;
}

// === DEBUGGING ===

/**
 * Run a calibration simulation to verify average output
 */
export function runCalibrationSimulation(level: number, numVisits: number = 100): {
  average: number;
  checkoutPercent: number;
  distribution: Record<string, number>;
} {
  let totalScore = 0;
  let checkouts = 0;
  const distribution: Record<string, number> = {};
  
  let remaining = 501;
  
  for (let i = 0; i < numVisits; i++) {
    // Reset if finished
    if (remaining <= 0) {
      checkouts++;
      remaining = 501;
    }
    
    const result = simulateVisit({
      level,
      remaining,
      doubleOut: true,
      formMultiplier: 1.0
    });
    
    totalScore += result.visitTotal;
    remaining = result.newRemaining;
    
    // Track distribution
    const range = Math.floor(result.visitTotal / 20) * 20;
    const key = `${range}-${range + 19}`;
    distribution[key] = (distribution[key] || 0) + 1;
  }
  
  return {
    average: totalScore / numVisits,
    checkoutPercent: (checkouts / numVisits) * 100,
    distribution
  };
}

// Export debug utilities
export const DartBotDebug = {
  runCalibrationSimulation,
  getAimPoint,
  evaluateDartFromXY,
  LEVEL_BASE_SIGMA,
  R_TREBLE_IN,
  R_TREBLE_OUT,
  R_DOUBLE_IN,
  R_DOUBLE_OUT,
  R_BULL_IN,
  R_BULL_OUT
};
