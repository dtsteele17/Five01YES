/**
 * Standard professional darts checkout routes (double-out).
 * Based on the PDC/WDF preferred checkout chart.
 * Every entry is mathematically verified.
 */

// Parse a dart label to its numeric value
export function dartValue(label: string): number {
  if (label === 'DB') return 50;
  if (label === 'SB') return 25;
  const m = label.match(/^([SDT])(\d+)$/);
  if (m) {
    const num = parseInt(m[2]);
    if (m[1] === 'S') return num;
    if (m[1] === 'D') return num * 2;
    if (m[1] === 'T') return num * 3;
  }
  // Plain number = single
  return parseInt(label) || 0;
}

// 3-dart checkouts (170 down to 2)
// Default routes used when no preferred double is set.
// Based on professional strategy with safety-valve considerations.
export const CHECKOUT_3: Record<number, string[]> = {
  170: ['T20', 'T20', 'DB'],
  167: ['T20', 'T19', 'DB'],
  164: ['T19', 'T19', 'DB'],      // Easier rhythm than T20, T18, DB
  161: ['T20', 'T17', 'DB'],
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
  148: ['T20', 'T20', 'D14'],
  147: ['T20', 'T17', 'D18'],
  146: ['T20', 'T18', 'D16'],
  145: ['T20', 'T19', 'D14'],
  144: ['T20', 'T20', 'D12'],
  143: ['T20', 'T17', 'D16'],
  142: ['T20', 'T14', 'D20'],
  141: ['T20', 'T19', 'D12'],
  140: ['T20', 'T20', 'D10'],
  139: ['T20', 'T13', 'D20'],     // Safety: miss T19 → still leave 40
  138: ['T20', 'T18', 'D12'],
  137: ['T20', 'T19', 'D10'],
  136: ['T20', 'T20', 'D8'],
  135: ['T20', 'T17', 'D12'],
  134: ['T20', 'T16', 'D13'],     // Safety: T8 on 2nd dart leaves DB
  133: ['T20', 'T19', 'D8'],
  132: ['T20', 'T16', 'D12'],
  131: ['T20', 'T13', 'D16'],
  130: ['T20', 'T20', 'D5'],      // Miss 1st T20 → still on 110 (2-dart out)
  129: ['T19', 'T16', 'D12'],
  128: ['T18', 'T14', 'D16'],
  127: ['T20', 'T17', 'D8'],      // S20 on 1st still leaves 107 (2-dart out)
  126: ['T19', 'T19', 'D6'],      // Both darts same target; S19 leaves 107
  125: ['T18', 'T19', 'D7'],
  124: ['T20', 'T14', 'D11'],     // Miss 1st → T18,DB; miss 2nd → DB
  123: ['T19', 'T16', 'D9'],
  122: ['T18', 'T18', 'D7'],
  121: ['T20', 'T11', 'D14'],
  120: ['T20', 'S20', 'D20'],
  119: ['T19', 'T12', 'D13'],
  118: ['T20', 'S18', 'D20'],
  117: ['T20', 'S17', 'D20'],
  116: ['T19', 'S19', 'D20'],     // S19 on 1st → 97 (T19,D20); two darts at 19 area
  115: ['T19', 'S18', 'D20'],     // S19 on 1st → 96 (T20,D18) easier than 95
  114: ['T20', 'S14', 'D20'],
  113: ['T19', 'S16', 'D20'],     // Safety: S3 or T3 next to T19 still leaves out
  112: ['T20', 'T12', 'D8'],      // S12 on 2nd leaves D20
  111: ['T20', 'S11', 'D20'],
  110: ['T20', 'T10', 'D10'],     // S10 on 2nd → D20; S13 safety on T19 route
  109: ['T20', 'S9', 'D20'],      // T9 and S9 both put you on out from 49
  108: ['T20', 'S16', 'D16'],     // D16/D8/S8/T8 all leave an out from 48
  107: ['T19', 'T10', 'D10'],     // Safety: S7 and S3 on 1st still give 2-dart outs
  106: ['T20', 'T10', 'D8'],      // Safety: missed S5 on 1st dart still works
  105: ['T20', 'S13', 'D16'],     // Two safety valves on 1st dart
  104: ['T19', 'S15', 'D16'],     // Only shot where a miss won't kill you
  103: ['T19', 'S10', 'D18'],     // 6-10 area guarantees 3rd dart out
  102: ['T20', 'S10', 'D16'],
  101: ['T20', 'S9', 'D16'],      // Never T17 first – S2 will kill you
  // 100 and below: use 2-dart where possible (shown with fewer darts)
  100: ['T20', 'D20'],
  99: ['T19', 'S10', 'D16'],
  98: ['T20', 'D19'],
  97: ['T19', 'D20'],
  96: ['T20', 'D18'],
  95: ['T19', 'D19'],
  94: ['T18', 'D20'],
  93: ['T19', 'D18'],
  92: ['T20', 'D16'],
  91: ['T17', 'D20'],
  90: ['T20', 'D15'],             // S20 on 1st → 70 (T20,D5); S20 on 2nd → DB
  89: ['T19', 'D16'],
  88: ['T20', 'D14'],             // Never T16 first – S16 won't get below 70
  87: ['T17', 'D18'],
  86: ['T18', 'D16'],
  85: ['T19', 'D14'],
  84: ['T20', 'D12'],
  83: ['T17', 'D16'],
  82: ['T14', 'D20'],
  81: ['T19', 'D12'],
  80: ['T20', 'D10'],             // Don't go T16,D16 – S16 needs triple or DB
  79: ['T19', 'D11'],             // Higher % than T13,D20; S19 → 60 (easier than 66)
  78: ['T18', 'D12'],
  77: ['T19', 'D10'],             // T15 won't get below 60 on a miss
  76: ['T16', 'D14'],             // All numbers around T16 get you below 70
  75: ['T17', 'D12'],
  74: ['T16', 'D13'],             // T8 also puts you on DB
  73: ['T19', 'D8'],
  72: ['T16', 'D12'],
  71: ['T13', 'D16'],             // Also T19,D7 – T7 gets to DB!
  70: ['T18', 'D8'],
  69: ['T19', 'D6'],
  68: ['T16', 'D10'],             // Ensures below 60 for 2nd dart
  67: ['T9', 'D20'],              // 3-dart: all large numbers around T9; T17,D8 for 2-dart
  66: ['T10', 'D18'],             // T10 has big numbers around it
  65: ['T11', 'D16'],             // T11 ensures below 60 for 2nd dart
  64: ['T16', 'D8'],              // T8 also puts you on D20
  63: ['T17', 'D6'],
  62: ['T10', 'D16'],
  61: ['T15', 'D8'],
  60: ['S20', 'D20'],
  59: ['S19', 'D20'],
  58: ['S18', 'D20'],
  57: ['S17', 'D20'],
  56: ['T16', 'D4'],
  55: ['S15', 'D20'],
  54: ['S14', 'D20'],
  53: ['S13', 'D20'],
  52: ['T12', 'D8'],              // Stay away from S20,D16 – too easy to bust
  51: ['S11', 'D20'],
  50: ['S10', 'D20'],             // Only go DB if it's your last dart
  49: ['S9', 'D20'],              // Careful – large triples like T17 can bust
  48: ['S16', 'D16'],             // Aim for wire between 8 and 16
  47: ['S15', 'D16'],
  46: ['S6', 'D20'],              // S6-S10 segment split – huge target
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
  31: ['S15', 'D8'],              // Or 7-3 area of the board
  30: ['D15'],
  29: ['S13', 'D8'],
  28: ['D14'],
  27: ['S19', 'D4'],              // Better chance than S11,D8
  26: ['D13'],
  25: ['S17', 'D4'],
  24: ['D12'],
  23: ['S7', 'D8'],
  22: ['D11'],
  21: ['S5', 'D8'],
  20: ['D10'],
  19: ['S11', 'D4'],              // Watch out – S19 will bust
  18: ['D9'],
  17: ['S9', 'D4'],               // Stay away from S1,D8 – 20 and 18 will bust
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

// 2-dart checkouts
export const CHECKOUT_2: Record<number, string[]> = {
  110: ['T20', 'DB'],
  107: ['T19', 'DB'],
  104: ['T18', 'DB'],
  101: ['T17', 'DB'],
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
  88: ['T20', 'D14'],
  87: ['T17', 'D18'],
  86: ['T18', 'D16'],
  85: ['T19', 'D14'],
  84: ['T20', 'D12'],
  83: ['T17', 'D16'],
  82: ['T14', 'D20'],
  81: ['T19', 'D12'],
  80: ['T20', 'D10'],
  79: ['T19', 'D11'],
  78: ['T18', 'D12'],
  77: ['T19', 'D10'],
  76: ['T16', 'D14'],
  75: ['T17', 'D12'],
  74: ['T16', 'D13'],
  73: ['T19', 'D8'],
  72: ['T16', 'D12'],
  71: ['T13', 'D16'],
  70: ['T18', 'D8'],
  69: ['T19', 'D6'],
  68: ['T18', 'D7'],
  67: ['T17', 'D8'],
  66: ['T10', 'D18'],
  65: ['T15', 'D10'],
  64: ['T14', 'D11'],
  63: ['T13', 'D12'],
  62: ['T12', 'D13'],
  61: ['T11', 'D14'],
  60: ['S20', 'D20'],
  59: ['S19', 'D20'],
  58: ['S18', 'D20'],
  57: ['S17', 'D20'],
  56: ['T16', 'D4'],
  55: ['S15', 'D20'],
  54: ['S14', 'D20'],
  53: ['S17', 'D18'],             // S3 leaves DB safety
  52: ['T12', 'D8'],
  51: ['S15', 'D18'],
  50: ['DB'],
  49: ['S9', 'D20'],
  48: ['S16', 'D16'],
  47: ['S7', 'D20'],              // Safety: S19,D14
  46: ['S6', 'D20'],
  45: ['S13', 'D16'],
  44: ['S4', 'D20'],              // Safety: S18,D13
  43: ['S3', 'D20'],              // Safety: S19,D12 or S17,D13
  42: ['S10', 'D16'],
  41: ['S9', 'D16'],
  40: ['D20'],
  39: ['S7', 'D16'],
  38: ['D19'],
  37: ['S5', 'D16'],
  36: ['D18'],
  35: ['S3', 'D16'],
  34: ['D17'],
  33: ['S17', 'D8'],              // Safety: S3,D15
  32: ['D16'],
  31: ['S15', 'D8'],
  30: ['D15'],
  29: ['S13', 'D8'],
  28: ['D14'],
  27: ['S19', 'D4'],              // Better board area than S11,D8
  26: ['D13'],
  25: ['S17', 'D4'],
  24: ['D12'],
  23: ['S7', 'D8'],
  22: ['D11'],
  21: ['S5', 'D8'],
  20: ['D10'],
  19: ['S11', 'D4'],              // S19 will bust – avoid S3,D8
  18: ['D9'],
  17: ['S9', 'D4'],               // S1,D8 too risky – 20 and 18 bust
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

// 1-dart checkouts (must be a double or bull)
export const CHECKOUT_1: Record<number, string[]> = {
  50: ['DB'],
  40: ['D20'],
  38: ['D19'],
  36: ['D18'],
  34: ['D17'],
  32: ['D16'],
  30: ['D15'],
  28: ['D14'],
  26: ['D13'],
  24: ['D12'],
  22: ['D11'],
  20: ['D10'],
  18: ['D9'],
  16: ['D8'],
  14: ['D7'],
  12: ['D6'],
  10: ['D5'],
  8: ['D4'],
  6: ['D3'],
  4: ['D2'],
  2: ['D1'],
};

// All valid doubles for finishing (D25/Bull last to deprioritise)
const ALL_DOUBLES = [
  'D1','D2','D3','D4','D5','D6','D7','D8','D9','D10',
  'D11','D12','D13','D14','D15','D16','D17','D18','D19','D20','D25'
];

// All valid single darts (SB/bull last to deprioritise)
const ALL_SINGLES = [
  ...Array.from({length: 20}, (_, i) => `S${i+1}`),
  'SB'
];

// All valid trebles
const ALL_TREBLES = Array.from({length: 20}, (_, i) => `T${i+1}`);

/**
 * Format a dart label for display. Converts DB → Bull, SB → S.Bull, D25 → Bull
 */
export function formatDartLabel(label: string): string {
  if (label === 'DB') return 'Bull';
  if (label === 'SB') return 'S.Bull';
  if (label === 'D25') return 'Bull';
  return label;
}

/**
 * Score a route for quality. Lower is better.
 * Penalises: small trebles (T1-T6), bull usage, more darts.
 * Prefers: big trebles (T20-T15), clean singles, fewer darts.
 */
function scoreRoute(route: string[]): number {
  let penalty = 0;
  // More darts = worse (strongly prefer 2-dart over 3-dart)
  penalty += route.length * 100;
  
  for (const dart of route) {
    // Penalise bull heavily (unless it's the only option)
    if (dart === 'DB') penalty += 50;
    if (dart === 'SB') penalty += 30;
    
    // Penalise small trebles (T1-T6) — singles are much easier to hit
    const trebleMatch = dart.match(/^T(\d+)$/);
    if (trebleMatch) {
      const num = parseInt(trebleMatch[1]);
      if (num <= 6) penalty += 40;       // T1-T6: strongly avoid
      else if (num <= 10) penalty += 15;  // T7-T10: slight penalty
      else penalty += 5;                  // T11-T20: fine, small base cost
    }
    
    // Small doubles penalty (harder to hit)
    const doubleMatch = dart.match(/^D(\d+)$/);
    if (doubleMatch) {
      const num = parseInt(doubleMatch[1]);
      if (num <= 3) penalty += 20;
      else if (num <= 6) penalty += 10;
    }
  }
  return penalty;
}

/**
 * Try to find a checkout route ending with the preferred double.
 * Returns the best (lowest penalty) route. Avoids small trebles, bull,
 * and prefers fewer darts.
 */
function findRouteWithPreferredDouble(
  remaining: number,
  dartsLeft: number,
  preferredDouble: string
): string[] | null {
  const dblValue = dartValue(preferredDouble);
  if (dblValue > remaining || dblValue <= 0) return null;

  // 1 dart: only works if remaining === double value
  if (dartsLeft === 1) {
    return remaining === dblValue ? [preferredDouble] : null;
  }

  const needBefore = remaining - dblValue;
  const candidates: string[][] = [];

  // Direct double (0 setup darts needed)
  if (needBefore === 0) {
    candidates.push([preferredDouble]);
  }

  // All possible setup darts (ordered by preference: singles, big trebles, doubles, bulls last)
  const setupDarts = [
    ...ALL_SINGLES,
    ...ALL_TREBLES,
    ...ALL_DOUBLES,
    'SB', 'DB'
  ];

  // 1 setup dart (2-dart checkout) — try for all dart counts
  if (dartsLeft >= 2) {
    for (const d of setupDarts) {
      if (dartValue(d) === needBefore) {
        candidates.push([d, preferredDouble]);
      }
    }
  }

  // 2 setup darts (3-dart checkout) — only if we have 3 darts
  if (dartsLeft >= 3 && needBefore > 0) {
    for (const d1 of setupDarts) {
      const v1 = dartValue(d1);
      if (v1 >= needBefore || v1 <= 0) continue;
      const need2 = needBefore - v1;
      for (const d2 of setupDarts) {
        if (dartValue(d2) === need2) {
          candidates.push([d1, d2, preferredDouble]);
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  // Pick the best route (lowest penalty)
  candidates.sort((a, b) => scoreRoute(a) - scoreRoute(b));
  return candidates[0];
}

/**
 * Get the best checkout suggestion based on remaining score and darts left.
 * If preferredDouble is set, tries to find a route ending with that double first.
 * Falls back to standard routes. Prefers 2-dart non-bull routes over 3-dart routes.
 */
export function getCheckoutSuggestion(
  remaining: number,
  dartsLeft: number,
  preferredDouble?: string | null
): string[] | null {
  if (remaining <= 0 || remaining > 170) return null;

  // Try preferred double route first
  if (preferredDouble) {
    const prefRoute = findRouteWithPreferredDouble(remaining, dartsLeft, preferredDouble);
    if (prefRoute) return prefRoute;
  }
  
  // Standard routes — but prefer 2-dart non-bull routes over 3-dart routes
  if (dartsLeft >= 3) {
    // Check if a 2-dart route exists that doesn't use bull
    const twoRoute = CHECKOUT_2[remaining];
    if (twoRoute && !twoRoute.includes('DB') && !twoRoute.includes('SB')) {
      return twoRoute;
    }
    // Check 3-dart standard route
    const threeRoute = CHECKOUT_3[remaining];
    if (threeRoute) return threeRoute;
    // Fall back to 2-dart even with bull if no 3-dart exists
    if (twoRoute) return twoRoute;
    return null;
  }
  if (dartsLeft === 2) return CHECKOUT_2[remaining] || null;
  if (dartsLeft === 1) return CHECKOUT_1[remaining] || null;
  return null;
}
