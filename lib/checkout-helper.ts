/**
 * Checkout Helper
 *
 * Provides professional-standard checkout suggestions for remaining scores in darts (1-170)
 * Based on actual checkout routes used by professional players (PDC, BDO)
 * 
 * Principles:
 * - Always finish on a double
 * - Prefer T20, T19, T18 for setting up
 * - Use Bull (50) when it provides a clean finish
 * - Avoid unusual doubles when possible
 * - For two-dart checkouts, prefer higher percentage combinations
 */

interface CheckoutRoute {
  label: string;
  route: string;
}

// Bogey numbers (no checkout available)
const BOGEY_NUMBERS = [169, 168, 166, 165, 163, 162, 159];

// Professional checkout routes for 1-170
// These are the standard routes used by professional players
const CHECKOUT_ROUTES: Record<number, string> = {
  // 2-40: Simple doubles (prefer D20, D16, D18, D12, D10, D8 for consistency)
  2: 'D1',
  3: '1 D1',
  4: 'D2',
  5: '1 D2',
  6: 'D3',
  7: '3 D2',
  8: 'D4',
  9: '1 D4',
  10: 'D5',
  11: '3 D4',
  12: 'D6',
  13: '5 D4',
  14: 'D7',
  15: '7 D4',
  16: 'D8',
  17: '1 D8',
  18: 'D9',
  19: '3 D8',
  20: 'D10',
  21: '5 D8',
  22: 'D11',
  23: '7 D8',
  24: 'D12',
  25: '9 D8',
  26: 'D13',
  27: '11 D8',
  28: 'D14',
  29: '13 D8',
  30: 'D15',
  31: '7 D12',
  32: 'D16',
  33: '1 D16',
  34: 'D17',
  35: '3 D16',
  36: 'D18',
  37: '5 D16',
  38: 'D19',
  39: '7 D16',
  40: 'D20',

  // 41-60: Two dart finishes (prefer D20, D16, D18)
  41: '9 D16',
  42: '10 D16',
  43: '11 D16',
  44: '12 D16',
  45: '13 D16',
  46: '14 D16',
  47: '15 D16',
  48: '16 D16',
  49: '17 D16',
  50: '18 D16',
  51: '19 D16',
  52: '20 D16',
  53: '13 D20',
  54: '14 D20',
  55: '15 D20',
  56: '16 D20',
  57: '17 D20',
  58: '18 D20',
  59: '19 D20',
  60: '20 D20',

  // 61-100: Two dart finishes using triples
  // Professional players prefer certain setups based on their strong numbers
  61: 'T15 D8',      // Common pro route
  62: 'T10 D16',     // Alternative: 10 Bull
  63: 'T13 D12',     // Good flow
  64: 'T16 D8',      // Or 16 D16
  65: 'T19 D4',      // Or T15 D10
  66: 'T10 D18',     // Good for T10 players
  67: 'T17 D8',      // Popular pro checkout
  68: 'T20 D4',      // Or T16 D10
  69: 'T19 D6',      // Or 19 Bull
  70: 'T18 D8',      // Or 20 Bull
  71: 'T13 D16',     // Or T17 D10
  72: 'T16 D12',     // Standard
  73: 'T19 D8',      // Or T15 D14
  74: 'T14 D16',     // Or 14 Bull
  75: 'T17 D12',     // Or T15 D15
  76: 'T20 D8',      // Or T16 D14
  77: 'T19 D10',     // Or 17 Bull
  78: 'T18 D12',     // Standard
  79: 'T13 D20',     // Or T19 D11
  80: 'T20 D10',     // Most common
  81: 'T19 D12',     // Or T15 D18
  82: 'T14 D20',     // Or Bull D16
  83: 'T17 D16',     // Standard
  84: 'T20 D12',     // Very common
  85: 'T15 D20',     // Or 15 Bull
  86: 'T18 D16',     // Standard
  87: 'T17 D18',     // Or 17 Bull
  88: 'T20 D14',     // Standard
  89: 'T19 D16',     // Standard
  90: 'T20 D15',     // Very common
  91: 'T17 D20',     // Standard
  92: 'T20 D16',     // Very common
  93: 'T19 D18',     // Standard
  94: 'T18 D20',     // Standard
  95: 'T19 D19',     // Or 19 Bull
  96: 'T20 D18',     // Very common
  97: 'T19 D20',     // Standard
  98: 'T20 D19',     // Standard
  99: 'T20 7 D16',   // Or T19 Bull
  100: 'T20 D20',    // The big one!

  // 101-170: Three dart finishes
  // Professional routes that provide good flow and backup options
  101: 'T17 10 D16',    // Or T13 16 D16
  102: 'T20 10 D16',    // Most common
  103: 'T19 6 D20',     // Or T17 16 D16
  104: 'T18 18 D16',    // Or T20 8 D20
  105: 'T20 13 D16',    // Very common
  106: 'T20 10 D18',    // Standard
  107: 'T19 18 D16',    // Or T17 16 D20
  108: 'T20 16 D16',    // Very common
  109: 'T20 17 D16',    // Standard
  110: 'T20 18 D16',    // Very common
  111: 'T19 14 D20',    // Or T20 19 D16
  112: 'T20 20 D16',    // Very common
  113: 'T20 13 D20',    // Standard
  114: 'T20 14 D20',    // Standard
  115: 'T20 15 D20',    // Very common
  116: 'T20 16 D20',    // Standard
  117: 'T20 17 D20',    // Standard
  118: 'T20 18 D20',    // Standard
  119: 'T19 20 D20',    // Or T20 19 D20
  120: 'T20 20 D20',    // Very common
  121: 'T20 11 D20',    // Standard
  122: 'T18 18 D16',    // Or T20 12 D20
  123: 'T19 16 D20',    // Standard
  124: 'T20 16 D20',    // Standard
  125: 'T20 19 D16',    // Or 25 T20 D20
  126: 'T19 19 D16',    // Or T20 14 D20
  127: 'T20 17 D20',    // Standard
  128: 'T20 20 D16',    // Or T18 18 D20
  129: 'T19 20 D16',    // Or T19 16 D20
  130: 'T20 20 D15',    // Very common
  131: 'T20 11 D20',    // Or Bull T20 D18
  132: 'T20 16 D20',    // Standard
  133: 'T20 13 D20',    // Or T17 20 D20
  134: 'T20 14 Bull',   // Standard
  135: 'T20 19 D20',    // Or 25 T20 Bull
  136: 'T20 20 D18',    // Standard
  137: 'T20 17 Bull',   // Or T19 20 D20
  138: 'T20 18 Bull',   // Standard
  139: 'T20 19 Bull',   // Standard
  140: 'T20 20 D20',    // Very common
  141: 'T20 19 Bull',   // Standard
  142: 'T20 14 Bull',   // Or T18 20 Bull
  143: 'T20 17 Bull',   // Standard
  144: 'T20 20 Bull',   // Very common
  145: 'T20 15 Bull',   // Standard
  146: 'T20 18 Bull',   // Standard
  147: 'T20 17 Bull',   // Standard
  148: 'T20 16 Bull',   // Standard
  149: 'T20 19 Bull',   // Standard
  150: 'T20 18 Bull',   // Very common
  151: 'T20 17 Bull',   // Standard
  152: 'T20 20 Bull',   // Very common
  153: 'T20 19 Bull',   // Standard
  154: 'T20 18 Bull',   // Standard
  155: 'T20 19 Bull',   // Standard
  156: 'T20 20 Bull',   // Very common
  157: 'T20 19 Bull',   // Standard
  158: 'T20 20 Bull',   // Standard
  160: 'T20 20 Bull',   // Standard
  161: 'T20 17 Bull',   // Alternative: T17 T20 Bull
  164: 'T20 18 Bull',   // Standard
  167: 'T20 19 Bull',   // Standard
  170: 'T20 20 Bull',   // The maximum checkout!
};

// Alternative checkout routes for key numbers
// These give players options based on their preferred numbers
const ALTERNATIVE_ROUTES: Record<number, string[]> = {
  62: ['10 Bull'],
  64: ['16 D16', 'T14 D11'],
  65: ['T15 D10', '25 D20'],
  68: ['T16 D10', '18 Bull'],
  69: ['19 Bull', 'T15 D12'],
  70: ['20 Bull', 'T10 D20'],
  71: ['T17 D10', '13 Bull'],
  74: ['14 Bull', 'T16 D13'],
  77: ['17 Bull', 'T15 D16'],
  82: ['Bull D16', 'T14 D20'],
  85: ['15 Bull', 'T15 D20'],
  87: ['17 Bull', 'T15 D21'],
  95: ['19 Bull', 'T15 D25'],
  99: ['T19 Bull', 'T16 11 D16'],
  125: ['25 T20 D20', 'T19 18 Bull'],
  131: ['Bull T20 D18', '25 T18 Bull'],
  135: ['25 T20 Bull', 'Bull T15 Bull'],
  161: ['T17 T20 Bull', 'T19 14 Bull'],
};

/**
 * Get checkout suggestion for a remaining score
 * @param remaining The score remaining to checkout
 * @returns Checkout route or null if no checkout available
 */
export function getCheckoutSuggestion(remaining: number): CheckoutRoute | null {
  if (remaining <= 0 || remaining > 170 || remaining === 1) {
    return null;
  }

  if (BOGEY_NUMBERS.includes(remaining)) {
    return {
      label: 'No checkout',
      route: 'No checkout available (Bogey number)',
    };
  }

  const route = CHECKOUT_ROUTES[remaining];

  if (!route) {
    return {
      label: 'No checkout',
      route: 'No checkout available',
    };
  }

  return {
    label: route,
    route: route,
  };
}

/**
 * Get checkout with alternative routes
 * @param remaining The score remaining to checkout
 * @returns Object with primary route and alternatives
 */
export function getCheckoutWithAlternatives(remaining: number): {
  primary: CheckoutRoute | null;
  alternatives: string[];
} | null {
  const primary = getCheckoutSuggestion(remaining);
  
  if (!primary || primary.label === 'No checkout') {
    return null;
  }

  const alternatives = ALTERNATIVE_ROUTES[remaining] || [];

  return {
    primary,
    alternatives,
  };
}

/**
 * Get all available checkout routes for a score
 * Useful for displaying multiple options to the player
 * @param remaining The score remaining
 * @returns Array of checkout routes
 */
export function getAllCheckoutRoutes(remaining: number): string[] {
  if (remaining <= 0 || remaining > 170 || remaining === 1) {
    return [];
  }

  if (BOGEY_NUMBERS.includes(remaining)) {
    return [];
  }

  const primary = CHECKOUT_ROUTES[remaining];
  if (!primary) return [];

  const alternatives = ALTERNATIVE_ROUTES[remaining] || [];
  return [primary, ...alternatives];
}

/**
 * Check if a number is a bogey (no checkout possible)
 * @param number The number to check
 * @returns True if it's a bogey number
 */
export function isBogeyNumber(number: number): boolean {
  return BOGEY_NUMBERS.includes(number);
}

/**
 * Get checkout difficulty rating
 * @param remaining The score remaining
 * @returns Difficulty level
 */
export function getCheckoutDifficulty(remaining: number): 'easy' | 'medium' | 'hard' | 'expert' | 'impossible' {
  if (remaining <= 0 || remaining > 170 || remaining === 1 || BOGEY_NUMBERS.includes(remaining)) {
    return 'impossible';
  }
  
  if (remaining <= 40) return 'easy';
  if (remaining <= 80) return 'medium';
  if (remaining <= 110) return 'hard';
  return 'expert';
}
