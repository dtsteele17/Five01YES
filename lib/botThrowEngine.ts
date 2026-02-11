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
 * Get the best checkout route for a given remaining score and darts available
 * Returns optimal dart sequence considering what's actually possible
 */
function findBestCheckoutRoute(remaining: number, dartsAvailable: number): string[] | null {
  if (remaining <= 0 || remaining > 170) return null;
  
  // Check impossible checkouts
  if (impossibleCheckouts.has(remaining)) return null;
  
  // Check standard checkout routes
  const standardRoute = checkoutRoutes[remaining];
  if (standardRoute && standardRoute.length <= dartsAvailable) {
    return standardRoute;
  }
  
  // For 2 darts available, check if we can finish in 2
  if (dartsAvailable >= 2) {
    // Try all combinations of first dart + double finish
    const allScores = [0];
    for (let i = 1; i <= 20; i++) {
      allScores.push(i, i * 2, i * 3); // S, D, T
    }
    allScores.push(25, 50); // Bulls
    
    for (const first of allScores) {
      if (first >= remaining) continue;
      const afterFirst = remaining - first;
      
      // Check if afterFirst is a valid double
      if (afterFirst === 50) {
        return first === 0 ? ['DB'] : [scoreToTarget(first), 'DB'];
      }
      if (afterFirst <= 40 && afterFirst % 2 === 0) {
        const double = afterFirst / 2;
        if (double >= 1 && double <= 20) {
          return first === 0 ? [`D${double}`] : [scoreToTarget(first), `D${double}`];
        }
      }
    }
  }
  
  // For 3 darts, try all 2-dart combinations + setup
  if (dartsAvailable >= 3) {
    const allScores = [0];
    for (let i = 1; i <= 20; i++) {
      allScores.push(i, i * 2, i * 3);
    }
    allScores.push(25, 50);
    
    for (const first of allScores) {
      if (first >= remaining) continue;
      for (const second of allScores) {
        if (first + second >= remaining) continue;
        const afterTwo = remaining - first - second;
        
        if (afterTwo === 50) {
          const route = [scoreToTarget(first), scoreToTarget(second), 'DB'].filter(t => t !== '-');
          return route;
        }
        if (afterTwo <= 40 && afterTwo % 2 === 0) {
          const double = afterTwo / 2;
          if (double >= 1 && double <= 20) {
            const route = [scoreToTarget(first), scoreToTarget(second), `D${double}`].filter(t => t !== '-');
            return route;
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Convert a score value to a target string
 */
function scoreToTarget(score: number): string {
  if (score === 0) return '-';
  if (score === 50) return 'DB';
  if (score === 25) return 'SB';
  if (score % 3 === 0 && score / 3 <= 20) return `T${score / 3}`;
  if (score % 2 === 0 && score / 2 <= 20) return `D${score / 2}`;
  if (score <= 20) return `S${score}`;
  return 'T20'; // fallback
}

/**
 * REAL DARTS PLAYER STRATEGY - Favorite doubles in order of preference
 * D20 is easiest (top), D16 is very popular (left side)
 */
const FAVORITE_DOUBLES = [
  { double: 20, score: 40 }, // D20 - easiest, top of board
  { double: 16, score: 32 }, // D16 - left side, very popular
  { double: 8, score: 16 },  // D8 - easy, near center
  { double: 12, score: 24 }, // D12 - right side
  { double: 4, score: 8 },   // D4 - easy backup
  { double: 18, score: 36 }, // D18 - good alternative
  { double: 10, score: 20 }, // D10 - near center
  { double: 6, score: 12 },  // D6 - backup
  { double: 14, score: 28 }, // D14 - less common
  { double: 2, score: 4 },   // D2 - last resort
];

/**
 * REAL DARTS PLAYER THINKING:
 * 1. Score big when you can't finish
 * 2. When on ≤40 and EVEN → go for that double directly!
 * 3. When on ODD ≤40 → hit a single to leave a favorite double
 * 4. Example: 57 left → hit S17 to leave D20 (40)
 * 5. Example: 39 left → hit S7 to leave D16 (32)
 */
export function getSetupTarget(remaining: number, doubleOut: boolean, level: number): string {
  if (!doubleOut) {
    return remaining >= 60 ? 'T20' : remaining >= 40 ? 'D20' : remaining.toString();
  }

  // === 50 LEFT → DOUBLE BULL ===
  if (remaining === 50) return 'DB';

  // === 40 OR BELOW → CHECKOUT MODE ===
  if (remaining <= 40 && remaining > 1) {
    // EVEN → GO FOR THAT DOUBLE!
    if (remaining % 2 === 0) {
      return `D${remaining / 2}`;
    }
    
    // ODD → HIT SINGLE TO LEAVE FAVORITE DOUBLE
    // Try to leave D20, D16, D8, etc.
    for (const fav of FAVORITE_DOUBLES) {
      if (remaining > fav.score) {
        const single = remaining - fav.score;
        if (single >= 1 && single <= 20) return `S${single}`;
      }
    }
    return 'S1'; // Fallback
  }

  // === 41-170 → USE CHECKOUT TABLE ===
  if (remaining <= 170 && !impossibleCheckouts.has(remaining)) {
    const route = checkoutRoutes[remaining];
    if (route) return route[0];
  }

  // === CAN'T FINISH → SCORE BIG ===
  if (remaining > 170 || impossibleCheckouts.has(remaining)) {
    // Try to leave a nice checkout
    for (const fav of FAVORITE_DOUBLES) {
      const needed = remaining - fav.score;
      if (needed >= 60) return 'T20';
      if (needed >= 57) return 'T19';
      if (needed >= 54) return 'T18';
    }
    return 'T20';
  }

  return 'T20';
}

// === CALIBRATION CONSTANTS ===
// CRITICAL: The PNG has a BLACK NUMBER RING (decorative) around the playable area
// The playable dartboard occupies only 85% of the PNG radius (the rest is black ring)
//
// STANDARD DARTBOARD DIMENSIONS (Official):
// Total radius: 170mm from center to outer edge of doubles
// 1. Bullseye (inner red): 0-6.35mm = 50 points (double bull)
// 2. Outer bull (green ring): 6.35-15.9mm = 25 points (single bull)
// 3. Inner singles (black/cream): 15.9-99mm
// 4. TREBLE RING (inner red/green): 99-107mm = 3x multiplier (8mm wide)
// 5. Outer singles (black/cream): 107-162mm
// 6. DOUBLE RING (outer red/green): 162-170mm = 2x multiplier (8mm wide)
// 7. BLACK NUMBER RING: 170mm+ (decorative, not scoring)
//
// PNG SCALE FACTOR: The playable area (170mm) appears at 85% of PNG radius
// All constants are scaled to match PNG: real_value * (0.85 / 0.4675) = real_value * 1.818
//
// SCORING BOUNDARY: R_BOARD = outer edge of doubles (where black ring starts)

export const R_BOARD = 0.85;         // Playable area ends where black number ring starts (85% of PNG)

// === TREBLE RING (INNER scoring ring, closer to bull) ===
// The treble ring is the INNER red/green ring
// Moved extra 1-2cm inward toward center to match PNG dartboard
export const R_TREBLE_IN = 0.40;     // Inner edge of treble ring (moved closer to center)
export const R_TREBLE_OUT = 0.48;    // Outer edge of treble ring (moved closer to center)
export const R_TREBLE_CENTER = (R_TREBLE_IN + R_TREBLE_OUT) / 2;  // ~0.44 (aim point)

// === DOUBLE RING (OUTER scoring ring) ===
// The double ring is the OUTER red/green ring
// Moved 1cm wider from center to match PNG dartboard
export const R_DOUBLE_IN = 0.79;     // Inner edge of double ring (moved outward)
export const R_DOUBLE_OUT = 0.88;    // Outer edge of double ring (moved outward)
export const R_DOUBLE_CENTER = (R_DOUBLE_IN + R_DOUBLE_OUT) / 2;  // ~0.835 (aim point)

// === BULL ===
// Bull dimensions adjusted to match visible calibration rings on PNG
export const R_BULL_IN = 0.054;      // Inner bull radius (50 pts, matches visible cyan rings)
export const R_BULL_OUT = 0.108;     // Outer bull radius (25 pts, matches visible cyan rings)

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
  dartsAtDouble: number;  // Track darts thrown at double during checkout attempts
  wasCheckoutAttempt: boolean;  // Whether this visit was a checkout attempt
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
      // For singles, aim for the OUTER singles area (between treble and double)
      // This is where darts naturally land more frequently
      // Aim slightly closer to the double ring for better scoring chance
      radius = R_TREBLE_OUT + (R_DOUBLE_IN - R_TREBLE_OUT) * 0.65;
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
 *
 * SCORING AREAS (from center outward):
 * 1. Inner Bull (0 to R_BULL_IN): 50 points
 * 2. Outer Bull (R_BULL_IN to R_BULL_OUT): 25 points
 * 3. Inner Singles (R_BULL_OUT to R_TREBLE_IN): face value
 * 4. Treble Ring (R_TREBLE_IN to R_TREBLE_OUT): 3x face value
 * 5. Outer Singles (R_TREBLE_OUT to R_DOUBLE_IN): face value
 * 6. Double Ring (R_DOUBLE_IN to R_DOUBLE_OUT): 2x face value
 * 7. Beyond R_DOUBLE_OUT: MISS (0 points)
 *
 * CRITICAL: R_BOARD = R_DOUBLE_OUT (playable area ends at outer edge of doubles)
 * Anything beyond the doubles ring is a miss.
 */
export function evaluateDartFromXY(x: number, y: number): {
  label: string;
  score: number;
  isDouble: boolean;
  isTreble: boolean;
  offboard: boolean;
} {
  const radius = Math.sqrt(x * x + y * y);

  // MISS BOUNDARY: Anything beyond the outer edge of doubles is a miss
  // R_BOARD = R_DOUBLE_OUT, so the playable area ends at the doubles ring
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

  // === RING DETECTION ===
  // Check from OUTSIDE to INSIDE (correct priority order)
  // 
  // DARTBOARD STRUCTURE (outer to inner):
  // 1. DOUBLE ring (outer red/green) - at the EDGE of the board
  // 2. Outer singles (black/cream)
  // 3. TREBLE ring (inner red/green) - closer to the bull
  // 4. Inner singles (black/cream)
  // 5. Bull area
  
  // DOUBLE ring - OUTER scoring ring (red/green at the edge)
  // Radius: 0.88 to 1.0 (outer 12% of board)
  if (radius >= R_DOUBLE_IN && radius <= R_DOUBLE_OUT) {
    return { 
      label: `D${number}`, 
      score: number * 2, 
      isDouble: true, 
      isTreble: false, 
      offboard: false 
    };
  }
  
  // TREBLE ring - INNER scoring ring (red/green closer to bull)
  // Radius: 0.55 to 0.65 (inner scoring ring)
  if (radius >= R_TREBLE_IN && radius <= R_TREBLE_OUT) {
    return { 
      label: `T${number}`, 
      score: number * 3, 
      isTreble: true, 
      isDouble: false, 
      offboard: false 
    };
  }

  // SINGLE area (anywhere else inside R_BOARD that isn't treble or double)
  // Includes: inner singles (between bull and treble) and outer singles (between treble and double)
  // Both score face value
  return {
    label: `S${number}`,
    score: number,
    isDouble: false,
    isTreble: false,
    offboard: false
  };
}

// === DARTBOARD VALIDATION ===

export interface RingCalibration {
  name: string;
  innerRadius: number;
  outerRadius: number;
  centerRadius: number;
  color: string;  // 'red' or 'green' for scoring rings
}

export const RING_CALIBRATION: RingCalibration[] = [
  { name: 'Bull (Inner)', innerRadius: 0, outerRadius: R_BULL_IN, centerRadius: R_BULL_IN / 2, color: 'red' },
  { name: 'Outer Bull', innerRadius: R_BULL_IN, outerRadius: R_BULL_OUT, centerRadius: (R_BULL_IN + R_BULL_OUT) / 2, color: 'green' },
  { name: 'Treble (INNER ring)', innerRadius: R_TREBLE_IN, outerRadius: R_TREBLE_OUT, centerRadius: R_TREBLE_CENTER, color: 'red/green' },
  { name: 'Double (OUTER ring)', innerRadius: R_DOUBLE_IN, outerRadius: R_DOUBLE_OUT, centerRadius: R_DOUBLE_CENTER, color: 'red/green' },
];

/**
 * Validate that the dartboard geometry is correct
 * Returns diagnostic info for debugging
 */
export function validateDartboardGeometry(): {
  rings: RingCalibration[];
  number20: { aim: { x: number; y: number }; score: string; ring: string };
  number6: { aim: { x: number; y: number }; score: string; ring: string };
  number3: { aim: { x: number; y: number }; score: string; ring: string };
  trebleTest: { aim: { x: number; y: number }; score: string };
  doubleTest: { aim: { x: number; y: number }; score: string };
} {
  // Test aiming at T20 (should be at top, in treble ring)
  const t20Aim = getAimPoint('T20');
  const t20Score = evaluateDartFromXY(t20Aim.x, t20Aim.y);
  const t20Radius = Math.sqrt(t20Aim.x ** 2 + t20Aim.y ** 2);
  
  // Test aiming at T6 (should be at right, 3 o'clock)
  const t6Aim = getAimPoint('T6');
  const t6Score = evaluateDartFromXY(t6Aim.x, t6Aim.y);
  
  // Test aiming at T3 (should be at bottom)
  const t3Aim = getAimPoint('T3');
  const t3Score = evaluateDartFromXY(t3Aim.x, t3Aim.y);
  
  // Test treble ring hit
  const trebleAim = getAimPoint('T20');
  const trebleScore = evaluateDartFromXY(trebleAim.x, trebleAim.y);
  
  // Test double ring hit
  const doubleAim = getAimPoint('D20');
  const doubleScore = evaluateDartFromXY(doubleAim.x, doubleAim.y);
  
  return {
    rings: RING_CALIBRATION,
    number20: { 
      aim: t20Aim, 
      score: t20Score.label, 
      ring: t20Radius >= R_TREBLE_IN && t20Radius <= R_TREBLE_OUT ? 'TREBLE ✓' : 
            t20Radius >= R_DOUBLE_IN && t20Radius <= R_DOUBLE_OUT ? 'DOUBLE' : 'OTHER'
    },
    number6: { aim: t6Aim, score: t6Score.label, ring: 'right side' },
    number3: { aim: t3Aim, score: t3Score.label, ring: 'bottom' },
    trebleTest: { aim: trebleAim, score: trebleScore.label },
    doubleTest: { aim: doubleAim, score: doubleScore.label },
  };
}

/**
 * Test ring calibration at multiple positions
 * Use this to verify the dartbot correctly identifies rings
 */
export function testRingCalibration(): {
  bull: { hit: DartResult; expected: string; radius: number };
  outerBull: { hit: DartResult; expected: string; radius: number };
  innerSingle: { hit: DartResult; expected: string; radius: number };
  treble20: { hit: DartResult; expected: string; radius: number };
  treble1: { hit: DartResult; expected: string; radius: number };
  outerSingle: { hit: DartResult; expected: string; radius: number };
  double20: { hit: DartResult; expected: string; radius: number };
  double1: { hit: DartResult; expected: string; radius: number };
  offBoard: { hit: DartResult; expected: string; radius: number };
} {
  // Helper to simulate a perfect throw (no scatter)
  const perfectThrow = (target: string): DartResult => {
    const aim = getAimPoint(target);
    const result = evaluateDartFromXY(aim.x, aim.y);
    return { ...result, aimTarget: target, x: aim.x, y: aim.y };
  };

  // Test each ring with precise aim points
  const tests = {
    // Bullseye (center) - INNER RED area
    bull: {
      hit: perfectThrow('DB'),
      expected: 'DBull',
      radius: 0
    },
    // Outer bull - GREEN ring around bullseye
    outerBull: {
      hit: perfectThrow('SB'),
      expected: 'SBull',
      radius: (R_BULL_IN + R_BULL_OUT) / 2
    },
    // Inner single (between bull and treble) - BLACK/CREAM
    innerSingle: {
      hit: (() => {
        const r = (R_BULL_OUT + R_TREBLE_IN) / 2;
        const x = 0;  // At top (20)
        const y = r;
        const result = evaluateDartFromXY(x, y);
        return { ...result, aimTarget: 'test', x, y };
      })(),
      expected: 'S20',
      radius: (R_BULL_OUT + R_TREBLE_IN) / 2
    },
    // Treble 20 (top) - INNER RED/GREEN ring
    treble20: {
      hit: perfectThrow('T20'),
      expected: 'T20',
      radius: R_TREBLE_CENTER
    },
    // Treble 1 (next to 20, clockwise) - INNER RED/GREEN ring
    treble1: {
      hit: perfectThrow('T1'),
      expected: 'T1',
      radius: R_TREBLE_CENTER
    },
    // Outer single (between treble and double) - BLACK/CREAM
    outerSingle: {
      hit: (() => {
        const r = (R_TREBLE_OUT + R_DOUBLE_IN) / 2;
        const x = 0;  // At top (20)
        const y = r;
        const result = evaluateDartFromXY(x, y);
        return { ...result, aimTarget: 'test', x, y };
      })(),
      expected: 'S20',
      radius: (R_TREBLE_OUT + R_DOUBLE_IN) / 2
    },
    // Double 20 (top edge) - OUTER RED/GREEN ring
    double20: {
      hit: perfectThrow('D20'),
      expected: 'D20',
      radius: R_DOUBLE_CENTER
    },
    // Double 1 - OUTER RED/GREEN ring
    double1: {
      hit: perfectThrow('D1'),
      expected: 'D1',
      radius: R_DOUBLE_CENTER
    },
    // Off the board
    offBoard: {
      hit: (() => {
        const result = evaluateDartFromXY(1.5, 0);  // Beyond board edge
        return { ...result, aimTarget: 'test', x: 1.5, y: 0 };
      })(),
      expected: 'MISS',
      radius: 1.5
    }
  };

  // Log results for debugging
  console.log('[DARTBOARD CALIBRATION TEST - Updated to match actual dartboard dimensions]');
  console.log('  Standard dartboard: Bull (0-15.9mm) → Singles → TREBLE (99-107mm) → Singles → DOUBLE (162-170mm)');
  console.log('  Scaled to visible rings: R_BOARD = 0.4675 represents 170mm');
  Object.entries(tests).forEach(([name, test]) => {
    const passed = test.hit.label === test.expected ||
                   (test.expected === 'MISS' && test.hit.offboard);
    const status = passed ? '✓' : '✗ FAILED';
    console.log(`  ${name}: ${test.hit.label} @ r=${test.radius.toFixed(4)} (expected: ${test.expected}) ${status}`);
  });

  return tests;
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
 * Plan the bot's turn like a REAL DARTS PLAYER
 * 
 * REAL PLAYER THINKING:
 * - "I'm on 70 with 3 darts... I'll hit S20 first (leaves 50), 
 *    then if I hit it, I'll go for DB (bull) to finish"
 * - "I'm on 57 with 2 darts... I'll hit S17 to leave D20"
 * - "I'm on 38... just D19 to win!"
 */
export function planBotTurn(
  remaining: number,
  doubleOut: boolean,
  level: number,
  dartsAvailable: number = 3
): string[] {
  if (dartsAvailable <= 0 || remaining <= 0) return [];
  
  // On 1 - can only bust, try to leave something useful
  if (doubleOut && remaining === 1) {
    return ['S1'].slice(0, dartsAvailable);
  }

  // === CAN FINISH? TAKE IT! ===
  if (doubleOut && remaining <= 170 && !impossibleCheckouts.has(remaining)) {
    const route = checkoutRoutes[remaining];
    if (route && route.length <= dartsAvailable) {
      return route.slice(0, dartsAvailable);
    }
  }

  // === 50 LEFT → BULL ===
  if (remaining === 50) return ['DB'];

  // === ≤40 AND EVEN → GO FOR THAT DOUBLE! ===
  if (remaining <= 40 && remaining > 1 && remaining % 2 === 0) {
    return [`D${remaining / 2}`];
  }

  // === ≤40 AND ODD → SETUP FOR FAVORITE DOUBLE ===
  if (remaining <= 40 && remaining > 1 && remaining % 2 === 1) {
    const setup = getSetupTarget(remaining, doubleOut, level);
    const newRemaining = remaining - scoreFromTarget(setup);
    
    // After setup, should be on a double
    if (dartsAvailable > 1 && newRemaining > 0 && newRemaining % 2 === 0) {
      return [setup, `D${newRemaining / 2}`];
    }
    return [setup];
  }

  // === 41-170 → PLAN MULTI-DART CHECKOUT ===
  if (doubleOut && remaining <= 170 && !impossibleCheckouts.has(remaining)) {
    const route = checkoutRoutes[remaining];
    if (route) {
      // Plan the whole route
      return route.slice(0, dartsAvailable);
    }
  }

  // === CAN'T FINISH → SCORE BIG ===
  // Just score as much as possible
  const setup = getSetupTarget(remaining, doubleOut, level);
  const newRemaining = remaining - scoreFromTarget(setup);
  
  const targets: string[] = [setup];
  if (dartsAvailable > 1 && newRemaining > 0) {
    const rest = planBotTurn(newRemaining, doubleOut, level, dartsAvailable - 1);
    targets.push(...rest);
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
  trackCheckoutDarts?: boolean;  // Whether to track darts at double
}

/**
 * Check if a remaining score is a valid checkout in double-out
 */
function isValidCheckoutScore(score: number): boolean {
  if (score <= 0 || score > 170) return false;
  // Scores that cannot be checked out
  const impossibleCheckouts = [159, 162, 163, 165, 166, 168, 169];
  if (impossibleCheckouts.includes(score)) return false;
  return true;
}

/**
 * Get the preferred checkout route for a given score
 * Returns the optimal dart sequence to checkout
 */
export function getCheckoutRoute(score: number): string[] | null {
  return checkoutRoutes[score] || null;
}

/**
 * Simulate a complete 3-dart visit with enhanced checkout tracking
 * 
 * IMPROVED: All 3 darts are always thrown (like real darts), even on bust.
 * This ensures accurate 3-dart averages that include busted visits.
 */
export function simulateVisit(options: SimulateVisitOptions): VisitResult {
  const { level, remaining, doubleOut, formMultiplier = 1.0, tracker, debug, trackCheckoutDarts = true } = options;
  
  const darts: DartResult[] = [];
  let currentRemaining = remaining;
  let dartsAtDouble = 0;
  let wasCheckoutAttempt = false;
  let bustState: { isBust: boolean; reason: string } | null = null;
  
  // === REAL DARTS PLAYER DECISION MAKING ===
  // Am I on a checkout? If yes, GO FOR IT!
  const isOnCheckout = doubleOut && isValidCheckoutScore(remaining);
  const isOnEasyDouble = remaining <= 40 && remaining > 1 && remaining % 2 === 0; // 2-40 even
  const needsSetup = remaining <= 40 && remaining > 1 && remaining % 2 === 1; // Odd, need setup
  
  if (isOnEasyDouble) {
    console.log(`[DartBot🎯] ${remaining} left → AIMING AT D${remaining/2} TO WIN!`);
  } else if (needsSetup) {
    // Find what we're setting up for
    for (const fav of FAVORITE_DOUBLES) {
      if (remaining > fav.score) {
        const single = remaining - fav.score;
        if (single >= 1 && single <= 20) {
          console.log(`[DartBot🎯] ${remaining} left → S${single} to leave D${fav.double} (${fav.score})`);
          break;
        }
      }
    }
  } else if (isOnCheckout) {
    console.log(`[DartBot🎯] ${remaining} left → Checkout attempt`);
  } else {
    console.log(`[DartBot] ${remaining} left → Scoring mode`);
  }
  
  // Plan targets based on what a real player would do
  let plannedTargets: string[];
  
  if (isOnEasyDouble) {
    // ≤40 and even - GO FOR THE DOUBLE DIRECTLY!
    plannedTargets = [`D${remaining/2}`];
    wasCheckoutAttempt = true;
  } else if (isOnCheckout && checkoutRoutes[remaining]) {
    // Use standard checkout route
    plannedTargets = checkoutRoutes[remaining];
    wasCheckoutAttempt = true;
  } else {
    // Score big
    plannedTargets = planBotTurn(currentRemaining, doubleOut, level, 3);
  }
  
  for (let i = 0; i < 3; i++) {
    // Get target for this dart
    const aimTarget = plannedTargets[i] || 'T20';
    
    // Check if we're aiming at a double (checkout situation)
    const isAimingAtDouble = aimTarget.startsWith('D') || aimTarget === 'DB' || aimTarget === 'BULL';
    const isCheckoutAttempt = doubleOut && currentRemaining <= 170 && isAimingAtDouble;
    
    if (isCheckoutAttempt && trackCheckoutDarts) {
      wasCheckoutAttempt = true;
      dartsAtDouble++;
    }
    
    // Calculate sigma for this throw
    // Checkout attempts have higher pressure/scatter based on difficulty
    let checkoutPressure = 1.0;
    if (isCheckoutAttempt) {
      // Higher pressure for lower checkouts (more nerve-wracking)
      // Professional players handle pressure better
      const basePressure = currentRemaining <= 40 ? 1.2 : 1.1;
      const skillAdjustment = Math.max(0.7, 1 - (level / 200)); // Better players handle pressure better
      checkoutPressure = 1 + (basePressure - 1) * skillAdjustment;
    }
    const sigma = getBaseSigma(level) * formMultiplier * checkoutPressure;
    
    // Simulate the throw
    const dart = simulateDart(aimTarget, sigma);
    darts.push(dart);
    
    // Update remaining score
    currentRemaining -= dart.score;
    
    // Check for finish
    if (currentRemaining === 0) {
      if (!doubleOut || dart.isDouble) {
        // Valid checkout - count this dart as at double
        if (trackCheckoutDarts && !isAimingAtDouble) {
          // If we hit a double but weren't aiming at it, still count it
          dartsAtDouble = Math.max(1, dartsAtDouble);
        }
        return {
          darts,
          visitTotal: remaining,
          bust: false,
          finished: true,
          newRemaining: 0,
          dartsAtDouble,
          wasCheckoutAttempt: true
        };
      }
      // Bust - didn't finish on double (but continue throwing remaining darts)
      if (!bustState) {
        bustState = { isBust: true, reason: 'Must finish on double' };
        currentRemaining = remaining; // Reset for remaining darts
      }
    }
    
    // Check for bust (overshot) - but continue throwing all 3 darts
    if (currentRemaining < 0 && !bustState) {
      bustState = { isBust: true, reason: 'Overshot' };
      currentRemaining = remaining; // Reset for remaining darts
    }
    
    // Check for left on 1 (impossible to finish in double-out)
    if (doubleOut && currentRemaining === 1 && !bustState) {
      bustState = { isBust: true, reason: 'Left on 1' };
      currentRemaining = remaining; // Reset for remaining darts
    }

    // CRITICAL: Replan after each dart - CONTINUE CHECKOUT IF WE WERE ATTEMPTING ONE!
    const dartsLeft = 2 - i;
    
    if (bustState) {
      // Already busted - throw remaining darts for visuals
      plannedTargets = planBotTurn(currentRemaining, doubleOut, level, dartsLeft);
    } else if (wasCheckoutAttempt || (doubleOut && isValidCheckoutScore(currentRemaining))) {
      // WE ARE IN CHECKOUT MODE - Continue trying to finish!
      wasCheckoutAttempt = true;
      
      // If ≤40 and even → go for that double!
      if (currentRemaining <= 40 && currentRemaining > 1 && currentRemaining % 2 === 0) {
        plannedTargets = [`D${currentRemaining/2}`];
        console.log(`[DartBot🎯] Replanning: ${currentRemaining} left → D${currentRemaining/2}`);
      } else {
        // Find a checkout route
        const newRoute = findBestCheckoutRoute(currentRemaining, dartsLeft);
        if (newRoute) {
          plannedTargets = newRoute;
          console.log(`[DartBot🎯] Replanning: ${currentRemaining} left with ${dartsLeft} darts →`, newRoute);
        } else {
          // No checkout possible - just score
          plannedTargets = planBotTurn(currentRemaining, doubleOut, level, dartsLeft);
        }
      }
    } else {
      // Not on checkout - replan normally for scoring
      plannedTargets = replanAfterDart(currentRemaining, doubleOut, level, dartsLeft);
    }
  }
  
  // If we busted, return bust result with all 3 darts thrown
  if (bustState) {
    console.log(`[DartBot❌] BUST! ${remaining}→${bustState.reason} | Darts: ${darts.map(d => d.label).join(', ')}`);
    return {
      darts,
      visitTotal: 0,
      bust: true,
      finished: false,
      newRemaining: remaining,
      bustReason: bustState.reason,
      dartsAtDouble,
      wasCheckoutAttempt
    };
  }
  
  const visitTotal = remaining - currentRemaining;
  
  // Log result
  if (wasCheckoutAttempt) {
    console.log(`[DartBot🎯] ${remaining}→${currentRemaining} (${visitTotal} scored) | Darts: ${darts.map(d => d.label).join(', ')}`);
  } else {
    console.log(`[DartBot] ${remaining}→${currentRemaining} (${visitTotal} scored) | Darts: ${darts.map(d => d.label).join(', ')}`);
  }
  
  return {
    darts,
    visitTotal,
    bust: false,
    finished: false,
    newRemaining: currentRemaining,
    dartsAtDouble,
    wasCheckoutAttempt
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
