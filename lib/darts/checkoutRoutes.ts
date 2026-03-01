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
export const CHECKOUT_3: Record<number, string[]> = {
  170: ['T20', 'T20', 'DB'],
  167: ['T20', 'T19', 'DB'],
  164: ['T20', 'T18', 'DB'],
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
  139: ['T19', 'T14', 'D20'],
  138: ['T20', 'T18', 'D12'],
  137: ['T20', 'T19', 'D10'],
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
  110: ['T20', 'S10', 'D20'],
  109: ['T20', 'S9', 'D20'],
  108: ['T20', 'S8', 'D20'],
  107: ['T19', 'S10', 'D20'],
  106: ['T20', 'S6', 'D20'],
  105: ['T20', 'S5', 'D20'],
  104: ['T18', 'S10', 'D20'],
  103: ['T20', 'S3', 'D20'],
  102: ['T20', 'S2', 'D20'],
  101: ['T17', 'S10', 'D20'],
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
  50: ['DB'],
  49: ['S9', 'D20'],
  48: ['S8', 'D20'],
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
  31: ['S7', 'D12'],
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
  50: ['DB'],
  49: ['S9', 'D20'],
  48: ['S8', 'D20'],
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
  31: ['S7', 'D12'],
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

// All valid doubles for finishing
const ALL_DOUBLES = [
  'D1','D2','D3','D4','D5','D6','D7','D8','D9','D10',
  'D11','D12','D13','D14','D15','D16','D17','D18','D19','D20','D25'
];

// All valid single darts (for building routes)
const ALL_SINGLES = [
  ...Array.from({length: 20}, (_, i) => `S${i+1}`),
  'SB' // single bull = 25
];

// All valid trebles
const ALL_TREBLES = Array.from({length: 20}, (_, i) => `T${i+1}`);

/**
 * Try to find a checkout route ending with the preferred double.
 * Returns null if no valid route exists for that double.
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

  // 2 darts: need 1 dart scoring exactly `needBefore`
  if (dartsLeft === 2) {
    if (needBefore === 0) return [preferredDouble];
    // Try single, double, treble, bulls
    const allDarts = [...ALL_SINGLES, ...ALL_DOUBLES, ...ALL_TREBLES, 'DB'];
    for (const d of allDarts) {
      if (dartValue(d) === needBefore) {
        return [d, preferredDouble];
      }
    }
    return null;
  }

  // 3 darts: need 2 darts scoring exactly `needBefore`
  if (dartsLeft >= 3) {
    if (needBefore === 0) return [preferredDouble];
    const allDarts = [...ALL_TREBLES, ...ALL_SINGLES, ...ALL_DOUBLES, 'DB', 'SB'];
    
    // 1 setup dart
    for (const d of allDarts) {
      if (dartValue(d) === needBefore) {
        return [d, preferredDouble];
      }
    }
    
    // 2 setup darts — try trebles first for efficiency
    for (const d1 of allDarts) {
      const v1 = dartValue(d1);
      if (v1 >= needBefore) continue;
      const need2 = needBefore - v1;
      for (const d2 of allDarts) {
        if (dartValue(d2) === need2) {
          return [d1, d2, preferredDouble];
        }
      }
    }
    return null;
  }

  return null;
}

/**
 * Get the best checkout suggestion based on remaining score and darts left.
 * If preferredDouble is set, tries to find a route ending with that double first.
 * Falls back to standard routes if not possible.
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
  
  // Fall back to standard routes
  if (dartsLeft >= 3) return CHECKOUT_3[remaining] || null;
  if (dartsLeft === 2) return CHECKOUT_2[remaining] || null;
  if (dartsLeft === 1) return CHECKOUT_1[remaining] || null;
  return null;
}
