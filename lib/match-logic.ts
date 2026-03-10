export interface CheckoutOption {
  description: string;
  darts: string[];
}

export function getCheckoutOptions(score: number, doubleOut: boolean): CheckoutOption[] {
  if (!doubleOut && score <= 180) {
    return [{ description: 'Any combination', darts: [] }];
  }

  if (score > 170) {
    return [];
  }

  const checkouts: { [key: number]: CheckoutOption[] } = {
    2: [{ description: 'D1', darts: ['D1'] }],
    3: [{ description: '1, D1', darts: ['1', 'D1'] }],
    4: [{ description: 'D2', darts: ['D2'] }],
    5: [{ description: '1, D2', darts: ['1', 'D2'] }],
    6: [{ description: 'D3', darts: ['D3'] }],
    7: [{ description: '3, D2', darts: ['3', 'D2'] }],
    8: [{ description: 'D4', darts: ['D4'] }],
    9: [{ description: '1, D4', darts: ['1', 'D4'] }],
    10: [{ description: 'D5', darts: ['D5'] }],
    11: [{ description: '3, D4', darts: ['3', 'D4'] }],
    12: [{ description: 'D6', darts: ['D6'] }],
    13: [{ description: '5, D4', darts: ['5', 'D4'] }],
    14: [{ description: 'D7', darts: ['D7'] }],
    15: [{ description: '7, D4', darts: ['7', 'D4'] }],
    16: [{ description: 'D8', darts: ['D8'] }],
    17: [{ description: '9, D4', darts: ['9', 'D4'] }],
    18: [{ description: 'D9', darts: ['D9'] }],
    19: [{ description: '3, D8', darts: ['3', 'D8'] }],
    20: [{ description: 'D10', darts: ['D10'] }],
    21: [{ description: '5, D8', darts: ['5', 'D8'] }],
    22: [{ description: 'D11', darts: ['D11'] }],
    23: [{ description: '7, D8', darts: ['7', 'D8'] }],
    24: [{ description: 'D12', darts: ['D12'] }],
    25: [{ description: '9, D8', darts: ['9', 'D8'] }],
    26: [{ description: 'D13', darts: ['D13'] }],
    27: [{ description: '11, D8', darts: ['11', 'D8'] }],
    28: [{ description: 'D14', darts: ['D14'] }],
    29: [{ description: '13, D8', darts: ['13', 'D8'] }],
    30: [{ description: 'D15', darts: ['D15'] }],
    31: [{ description: '15, D8', darts: ['15', 'D8'] }],
    32: [{ description: 'D16', darts: ['D16'] }],
    33: [{ description: '17, D8', darts: ['17', 'D8'] }],
    34: [{ description: 'D17', darts: ['D17'] }],
    35: [{ description: '19, D8', darts: ['19', 'D8'] }],
    36: [{ description: 'D18', darts: ['D18'] }],
    37: [{ description: '5, D16', darts: ['5', 'D16'] }],
    38: [{ description: 'D19', darts: ['D19'] }],
    39: [{ description: '7, D16', darts: ['7', 'D16'] }],
    40: [{ description: 'D20', darts: ['D20'] }],
    41: [{ description: '9, D16', darts: ['9', 'D16'] }],
    42: [{ description: '10, D16', darts: ['10', 'D16'] }],
    43: [{ description: '11, D16', darts: ['11', 'D16'] }],
    44: [{ description: '12, D16', darts: ['12', 'D16'] }],
    45: [{ description: '13, D16', darts: ['13', 'D16'] }],
    46: [{ description: '6, D20', darts: ['6', 'D20'] }],
    47: [{ description: '15, D16', darts: ['15', 'D16'] }],
    48: [{ description: '8, D20', darts: ['8', 'D20'] }],
    49: [{ description: '17, D16', darts: ['17', 'D16'] }],
    50: [{ description: 'Bull', darts: ['Bull'] }],
    51: [{ description: '11, D20', darts: ['11', 'D20'] }],
    52: [{ description: '12, D20', darts: ['12', 'D20'] }],
    53: [{ description: '13, D20', darts: ['13', 'D20'] }],
    54: [{ description: '14, D20', darts: ['14', 'D20'] }],
    55: [{ description: '15, D20', darts: ['15', 'D20'] }],
    56: [{ description: '16, D20', darts: ['16', 'D20'] }],
    57: [{ description: '17, D20', darts: ['17', 'D20'] }],
    58: [{ description: '18, D20', darts: ['18', 'D20'] }],
    59: [{ description: '19, D20', darts: ['19', 'D20'] }],
    60: [{ description: '20, D20', darts: ['20', 'D20'] }],
    61: [{ description: 'T15, D8', darts: ['T15', 'D8'] }],
    62: [{ description: 'T10, D16', darts: ['T10', 'D16'] }],
    63: [{ description: 'T13, D12', darts: ['T13', 'D12'] }],
    64: [{ description: 'T16, D8', darts: ['T16', 'D8'] }],
    65: [{ description: '25, D20', darts: ['25', 'D20'] }],
    66: [{ description: 'T10, D18', darts: ['T10', 'D18'] }],
    67: [{ description: 'T17, D8', darts: ['T17', 'D8'] }],
    68: [{ description: 'T16, D10', darts: ['T16', 'D10'] }],
    69: [{ description: 'T19, D6', darts: ['T19', 'D6'] }],
    70: [{ description: 'T18, D8', darts: ['T18', 'D8'] }],
    71: [{ description: 'T13, D16', darts: ['T13', 'D16'] }],
    72: [{ description: 'T16, D12', darts: ['T16', 'D12'] }],
    73: [{ description: 'T19, D8', darts: ['T19', 'D8'] }],
    74: [{ description: 'T14, D16', darts: ['T14', 'D16'] }],
    75: [{ description: 'T17, D12', darts: ['T17', 'D12'] }],
    76: [{ description: 'T20, D8', darts: ['T20', 'D8'] }],
    77: [{ description: 'T19, D10', darts: ['T19', 'D10'] }],
    78: [{ description: 'T18, D12', darts: ['T18', 'D12'] }],
    79: [{ description: 'T19, D11', darts: ['T19', 'D11'] }],
    80: [{ description: 'T20, D10', darts: ['T20', 'D10'] }],
    81: [{ description: 'T19, D12', darts: ['T19', 'D12'] }],
    82: [{ description: 'Bull, D16', darts: ['Bull', 'D16'] }],
    83: [{ description: 'T17, D16', darts: ['T17', 'D16'] }],
    84: [{ description: 'T20, D12', darts: ['T20', 'D12'] }],
    85: [{ description: 'T15, D20', darts: ['T15', 'D20'] }],
    86: [{ description: 'T18, D16', darts: ['T18', 'D16'] }],
    87: [{ description: 'T17, D18', darts: ['T17', 'D18'] }],
    88: [{ description: 'T16, D20', darts: ['T16', 'D20'] }],
    89: [{ description: 'T19, D16', darts: ['T19', 'D16'] }],
    90: [{ description: 'T20, D15', darts: ['T20', 'D15'] }],
    91: [{ description: 'T17, D20', darts: ['T17', 'D20'] }],
    92: [{ description: 'T20, D16', darts: ['T20', 'D16'] }],
    93: [{ description: 'T19, D18', darts: ['T19', 'D18'] }],
    94: [{ description: 'T18, D20', darts: ['T18', 'D20'] }],
    95: [{ description: 'T19, D19', darts: ['T19', 'D19'] }],
    96: [{ description: 'T20, D18', darts: ['T20', 'D18'] }],
    97: [{ description: 'T19, D20', darts: ['T19', 'D20'] }],
    98: [{ description: 'T20, D19', darts: ['T20', 'D19'] }],
    99: [{ description: 'T19, 10, D16', darts: ['T19', '10', 'D16'] }],
    100: [{ description: 'T20, D20', darts: ['T20', 'D20'] }],
    101: [{ description: 'T17, Bull', darts: ['T17', 'Bull'] }],
    102: [{ description: 'T20, 10, D16', darts: ['T20', '10', 'D16'] }],
    103: [{ description: 'T19, 10, D18', darts: ['T19', '10', 'D18'] }],
    104: [{ description: 'T18, Bull', darts: ['T18', 'Bull'] }],
    105: [{ description: 'T20, 13, D16', darts: ['T20', '13', 'D16'] }],
    106: [{ description: 'T20, 14, D16', darts: ['T20', '14', 'D16'] }],
    107: [{ description: 'T19, Bull', darts: ['T19', 'Bull'] }],
    108: [{ description: 'T20, 16, D16', darts: ['T20', '16', 'D16'] }],
    109: [{ description: 'T20, 17, D16', darts: ['T20', '17', 'D16'] }],
    110: [{ description: 'T20, Bull', darts: ['T20', 'Bull'] }],
    111: [{ description: 'T20, 19, D16', darts: ['T20', '19', 'D16'] }],
    112: [{ description: 'T20, 12, D20', darts: ['T20', '12', 'D20'] }],
    113: [{ description: 'T20, 13, D20', darts: ['T20', '13', 'D20'] }],
    114: [{ description: 'T20, 14, D20', darts: ['T20', '14', 'D20'] }],
    115: [{ description: 'T20, 15, D20', darts: ['T20', '15', 'D20'] }],
    116: [{ description: 'T20, 16, D20', darts: ['T20', '16', 'D20'] }],
    117: [{ description: 'T20, 17, D20', darts: ['T20', '17', 'D20'] }],
    118: [{ description: 'T20, 18, D20', darts: ['T20', '18', 'D20'] }],
    119: [{ description: 'T20, 19, D20', darts: ['T20', '19', 'D20'] }],
    120: [{ description: 'T20, 20, D20', darts: ['T20', '20', 'D20'] }],
    121: [{ description: 'T20, 11, Bull', darts: ['T20', '11', 'Bull'] }],
    122: [{ description: 'T18, 18, D20', darts: ['T18', '18', 'D20'] }],
    123: [{ description: 'T19, 16, D20', darts: ['T19', '16', 'D20'] }],
    124: [{ description: 'T20, 14, Bull', darts: ['T20', '14', 'Bull'] }],
    125: [{ description: 'T18, 19, D20', darts: ['T18', '19', 'D20'] }],
    126: [{ description: 'T19, 19, D20', darts: ['T19', '19', 'D20'] }],
    127: [{ description: 'T20, 17, Bull', darts: ['T20', '17', 'Bull'] }],
    128: [{ description: 'T18, Bull, D16', darts: ['T18', 'Bull', 'D16'] }],
    129: [{ description: 'T19, 12, D18', darts: ['T19', '12', 'D18'] }],
    130: [{ description: 'T20, 20, Bull', darts: ['T20', '20', 'Bull'] }],
    131: [{ description: 'T20, 13, D16', darts: ['T20', '13', 'D16'] }],
    132: [{ description: 'T20, 12, Bull', darts: ['T20', '12', 'Bull'] }],
    133: [{ description: 'T20, 13, Bull', darts: ['T20', '13', 'Bull'] }],
    134: [{ description: 'T20, 14, Bull', darts: ['T20', '14', 'Bull'] }],
    135: [{ description: 'Bull, Bull, 25, D5', darts: ['Bull', 'Bull', '25', 'D5'] }],
    136: [{ description: 'T20, T20, D8', darts: ['T20', 'T20', 'D8'] }],
    137: [{ description: 'T20, T19, D10', darts: ['T20', 'T19', 'D10'] }],
    138: [{ description: 'T20, T18, D12', darts: ['T20', 'T18', 'D12'] }],
    139: [{ description: 'T20, T13, D20', darts: ['T20', 'T13', 'D20'] }],
    140: [{ description: 'T20, T20, D10', darts: ['T20', 'T20', 'D10'] }],
    141: [{ description: 'T20, T19, D12', darts: ['T20', 'T19', 'D12'] }],
    142: [{ description: 'T20, T14, D20', darts: ['T20', 'T14', 'D20'] }],
    143: [{ description: 'T20, T17, D16', darts: ['T20', 'T17', 'D16'] }],
    144: [{ description: 'T20, T20, D12', darts: ['T20', 'T20', 'D12'] }],
    145: [{ description: 'T20, T15, D20', darts: ['T20', 'T15', 'D20'] }],
    146: [{ description: 'T20, T18, D16', darts: ['T20', 'T18', 'D16'] }],
    147: [{ description: 'T20, T17, D18', darts: ['T20', 'T17', 'D18'] }],
    148: [{ description: 'T20, T16, D20', darts: ['T20', 'T16', 'D20'] }],
    149: [{ description: 'T20, T19, D16', darts: ['T20', 'T19', 'D16'] }],
    150: [{ description: 'T20, T18, D18', darts: ['T20', 'T18', 'D18'] }],
    151: [{ description: 'T20, T17, D20', darts: ['T20', 'T17', 'D20'] }],
    152: [{ description: 'T20, T20, D16', darts: ['T20', 'T20', 'D16'] }],
    153: [{ description: 'T20, T19, D18', darts: ['T20', 'T19', 'D18'] }],
    154: [{ description: 'T20, T18, D20', darts: ['T20', 'T18', 'D20'] }],
    155: [{ description: 'T20, T19, D19', darts: ['T20', 'T19', 'D19'] }],
    156: [{ description: 'T20, T20, D18', darts: ['T20', 'T20', 'D18'] }],
    157: [{ description: 'T20, T19, D20', darts: ['T20', 'T19', 'D20'] }],
    158: [{ description: 'T20, T20, D19', darts: ['T20', 'T20', 'D19'] }],
    160: [{ description: 'T20, T20, D20', darts: ['T20', 'T20', 'D20'] }],
    161: [{ description: 'T20, T17, Bull', darts: ['T20', 'T17', 'Bull'] }],
    164: [{ description: 'T20, T18, Bull', darts: ['T20', 'T18', 'Bull'] }],
    167: [{ description: 'T20, T19, Bull', darts: ['T20', 'T19', 'Bull'] }],
    170: [{ description: 'T20, T20, Bull', darts: ['T20', 'T20', 'Bull'] }],
  };

  return checkouts[score] || [];
}

export function isBust(currentScore: number, scoreEntered: number, doubleOut: boolean): boolean {
  const newScore = currentScore - scoreEntered;

  if (newScore < 0) {
    return true;
  }

  if (doubleOut && newScore === 1) {
    return true;
  }

  if (newScore === 0 && doubleOut) {
    return false;
  }

  return false;
}

// Bogey numbers - cannot be checked out with 3 darts or fewer
const BOGEY_NUMBERS = new Set([159, 162, 163, 166, 168, 169]);

/**
 * Check if a score is a valid checkout (can be finished on in double-out)
 * Valid checkouts: 2-170, excluding bogey numbers
 */
export function isValidCheckout(score: number, doubleOut: boolean = true): boolean {
  if (!doubleOut) {
    // In single-out, any score 1-180 can be finished
    return score >= 1 && score <= 180;
  }
  
  // In double-out, must be 2-170 and not a bogey number
  if (score < 2 || score > 170) {
    return false;
  }
  
  // Check if it's a bogey number
  if (BOGEY_NUMBERS.has(score)) {
    return false;
  }
  
  return true;
}

/**
 * Calculate checkout percentage like dartcounter.net
 * Formula: (Checkouts Made / Darts Thrown at Double) × 100
 * 
 * A "dart at double" is any dart thrown when the player is on a valid checkout score
 */
export function calculateCheckoutPercentage(
  checkoutsMade: number,
  dartsAtDouble: number
): number {
  if (dartsAtDouble === 0) {
    return 0;
  }
  return Math.round((checkoutsMade / dartsAtDouble) * 100 * 100) / 100;
}

export interface Visit {
  score: number;
  isBust: boolean;
}

export interface ValidateEditResult {
  valid: boolean;
  remainingAfter: number;
  error?: string;
  isWin: boolean;
}

export function validateEditedVisit(
  currentRemaining: number,
  originalScore: number,
  newScore: number
): ValidateEditResult {
  const delta = newScore - originalScore;
  const newRemaining = currentRemaining - delta;

  if (newRemaining < 0) {
    return {
      valid: false,
      remainingAfter: newRemaining,
      error: 'That score would take you below 0. Please enter a lower score.',
      isWin: false,
    };
  }

  return {
    valid: true,
    remainingAfter: newRemaining,
    isWin: newRemaining === 0,
  };
}

export function isValidCheckoutAttempt(currentScore: number, scoreEntered: number, doubleOut: boolean): boolean {
  if (currentScore !== scoreEntered) {
    return false;
  }

  if (!doubleOut) {
    return true;
  }

  const validDoubleOutScores = [
    2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
    61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
    81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100,
    101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
    121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140,
    141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 160,
    161, 164, 167, 170
  ];

  return validDoubleOutScores.includes(scoreEntered);
}

export interface LegFirst9Data {
  dartsThrown: number;
  pointsScored: number;
}

export function calculateFirst9Average(legs: LegFirst9Data[]): number {
  if (legs.length === 0) return 0;

  const legAverages = legs.map(leg => {
    if (leg.dartsThrown === 0) return 0;
    return (leg.pointsScored / leg.dartsThrown) * 3;
  });

  const sum = legAverages.reduce((acc, avg) => acc + avg, 0);
  const average = sum / legAverages.length;

  return Math.round(average * 100) / 100;
}

export function calculateStats(visits: Array<{ score: number; is_bust: boolean; is_checkout: boolean }>) {
  const validVisits = visits.filter(v => !v.is_bust);
  const totalScore = validVisits.reduce((sum, v) => sum + v.score, 0);
  const dartsThrown = validVisits.length * 3;
  const threeDartAverage = dartsThrown > 0 ? (totalScore / (dartsThrown / 3)) : 0;

  const highestScore = validVisits.length > 0 ? Math.max(...validVisits.map(v => v.score)) : 0;
  const count100Plus = validVisits.filter(v => v.score >= 100).length;
  const count140Plus = validVisits.filter(v => v.score >= 140).length;
  const count180 = validVisits.filter(v => v.score === 180).length;

  const checkoutVisits = visits.filter(v => v.is_checkout);
  const highestCheckout = checkoutVisits.length > 0 ? Math.max(...checkoutVisits.map(v => v.score)) : 0;

  const checkoutAttempts = visits.filter(v => v.is_checkout || v.is_bust).length;
  const successfulCheckouts = checkoutVisits.length;
  const checkoutPercentage = checkoutAttempts > 0 ? (successfulCheckouts / checkoutAttempts) * 100 : 0;

  return {
    threeDartAverage: Math.round(threeDartAverage * 100) / 100,
    highestScore,
    highestCheckout,
    checkoutPercentage: Math.round(checkoutPercentage * 100) / 100,
    count100Plus,
    count140Plus,
    count180,
    totalDartsThrown: dartsThrown,
  };
}

export type DartThrow =
  | { mult: 1 | 2 | 3; value: number }
  | { bull: 'SB' | 'DB' }
  | { miss: true };

export interface TurnResult {
  visitTotal: number;
  isBust: boolean;
  bustReason?: 'negative' | 'leaves_one' | 'no_double';
  isCheckout: boolean;
  newRemaining: number;
  dartsThrown: number;
}

export function resolveTurn(
  currentRemaining: number,
  darts: DartThrow[],
  doubleOut: boolean
): TurnResult {
  let visitTotal = 0;
  let lastDartIsDouble = false;

  for (const dart of darts) {
    if ('miss' in dart && dart.miss) {
      visitTotal += 0;
      lastDartIsDouble = false;
    } else if ('bull' in dart) {
      if (dart.bull === 'SB') {
        visitTotal += 25;
        lastDartIsDouble = false;
      } else {
        visitTotal += 50;
        lastDartIsDouble = true;
      }
    } else if ('mult' in dart && 'value' in dart) {
      const score = dart.mult * dart.value;
      visitTotal += score;
      lastDartIsDouble = dart.mult === 2;
    }
  }

  const newRemaining = currentRemaining - visitTotal;

  if (newRemaining < 0) {
    throw new Error(`NEGATIVE_REMAINING_BUG: ${currentRemaining} - ${visitTotal} = ${newRemaining}`);
  }

  if (newRemaining < 0) {
    return {
      visitTotal,
      isBust: true,
      bustReason: 'negative',
      isCheckout: false,
      newRemaining: currentRemaining,
      dartsThrown: darts.length,
    };
  }

  if (doubleOut && newRemaining === 1) {
    return {
      visitTotal,
      isBust: true,
      bustReason: 'leaves_one',
      isCheckout: false,
      newRemaining: currentRemaining,
      dartsThrown: darts.length,
    };
  }

  if (newRemaining === 0) {
    if (doubleOut && !lastDartIsDouble) {
      return {
        visitTotal,
        isBust: true,
        bustReason: 'no_double',
        isCheckout: false,
        newRemaining: currentRemaining,
        dartsThrown: darts.length,
      };
    }

    return {
      visitTotal,
      isBust: false,
      isCheckout: true,
      newRemaining: 0,
      dartsThrown: darts.length,
    };
  }

  return {
    visitTotal,
    isBust: false,
    isCheckout: false,
    newRemaining,
    dartsThrown: darts.length,
  };
}

export function getLegsToWin(format: string): number {
  if (format === 'best-of-1') return 1;
  if (format === 'best-of-3') return 2;
  if (format === 'best-of-5') return 3;
  if (format === 'best-of-7') return 4;
  if (format === 'best-of-9') return 5;
  if (format === 'best-of-11') return 6;
  if (format === 'best-of-13') return 7;
  if (format === 'best-of-15') return 8;
  if (format === 'best-of-17') return 9;
  if (format === 'best-of-19') return 10;
  if (format === 'best-of-21') return 11;
  if (format === 'best-of-23') return 12;
  return 1;
}

export function isOneDartFinish(remaining: number): boolean {
  if (remaining === 50) return true;
  if (remaining >= 2 && remaining <= 40 && remaining % 2 === 0) return true;
  return false;
}

export function getMinDartsToCheckout(remaining: number, doubleOut: boolean): 1 | 2 | 3 | null {
  if (remaining <= 0 || remaining > 170) return null;

  if (!doubleOut) {
    if (remaining <= 60) return 1;
    if (remaining <= 120) return 2;
    if (remaining <= 180) return 3;
    return null;
  }

  const doubles = [50];
  for (let i = 1; i <= 20; i++) {
    doubles.push(i * 2);
  }

  const allScores = [0];
  for (let i = 1; i <= 20; i++) {
    allScores.push(i);
    allScores.push(i * 2);
    allScores.push(i * 3);
  }
  allScores.push(25);
  allScores.push(50);

  if (doubles.includes(remaining)) {
    return 1;
  }

  for (const s1 of allScores) {
    if (s1 >= remaining) continue;
    const r1 = remaining - s1;
    if (doubles.includes(r1)) {
      return 2;
    }
  }

  for (const s1 of allScores) {
    if (s1 >= remaining) continue;
    const r1 = remaining - s1;
    for (const s2 of allScores) {
      if (s2 >= r1) continue;
      const r2 = r1 - s2;
      if (doubles.includes(r2)) {
        return 3;
      }
    }
  }

  return null;
}
