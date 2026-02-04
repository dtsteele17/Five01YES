/**
 * Checkout Helper
 *
 * Provides checkout suggestions for remaining scores in darts (1-170)
 * Based on standard dart checkout routes
 */

interface CheckoutRoute {
  label: string;
  route: string;
}

// Bogey numbers (no checkout available)
const BOGEY_NUMBERS = [169, 168, 166, 165, 163, 162, 159];

// Checkout routes for 1-170
const CHECKOUT_ROUTES: Record<number, string> = {
  // 2-40: Simple doubles
  2: 'D1',
  3: 'No checkout',
  4: 'D2',
  5: 'No checkout',
  6: 'D3',
  7: 'No checkout',
  8: 'D4',
  9: 'No checkout',
  10: 'D5',
  11: 'No checkout',
  12: 'D6',
  13: 'No checkout',
  14: 'D7',
  15: 'No checkout',
  16: 'D8',
  17: 'No checkout',
  18: 'D9',
  19: 'No checkout',
  20: 'D10',
  21: 'No checkout',
  22: 'D11',
  23: 'No checkout',
  24: 'D12',
  25: 'No checkout',
  26: 'D13',
  27: 'No checkout',
  28: 'D14',
  29: 'No checkout',
  30: 'D15',
  31: 'No checkout',
  32: 'D16',
  33: 'No checkout',
  34: 'D17',
  35: 'No checkout',
  36: 'D18',
  37: 'No checkout',
  38: 'D19',
  39: 'No checkout',
  40: 'D20',

  // 41-100: Two dart finishes
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
  61: 'T15 D8',
  62: 'T10 D16',
  63: 'T13 D12',
  64: 'T16 D8',
  65: 'T11 D16',
  66: 'T10 D18',
  67: 'T17 D8',
  68: 'T20 D4',
  69: 'T19 D6',
  70: 'T18 D8',
  71: 'T13 D16',
  72: 'T16 D12',
  73: 'T19 D8',
  74: 'T14 D16',
  75: 'T17 D12',
  76: 'T20 D8',
  77: 'T19 D10',
  78: 'T18 D12',
  79: 'T13 D20',
  80: 'T20 D10',
  81: 'T19 D12',
  82: 'T14 D20',
  83: 'T17 D16',
  84: 'T20 D12',
  85: 'T15 D20',
  86: 'T18 D16',
  87: 'T17 D18',
  88: 'T20 D14',
  89: 'T19 D16',
  90: 'T20 D15',
  91: 'T17 D20',
  92: 'T20 D16',
  93: 'T19 D18',
  94: 'T18 D20',
  95: 'T19 D19',
  96: 'T20 D18',
  97: 'T19 D20',
  98: 'T20 D19',
  99: 'T19 Bull',
  100: 'T20 D20',

  // 101-170: Three dart finishes
  101: 'T17 T10 D16',
  102: 'T20 T10 D16',
  103: 'T19 T10 D18',
  104: 'T18 T18 D8',
  105: 'T20 T13 D12',
  106: 'T20 T10 D18',
  107: 'T19 T18 D8',
  108: 'T20 T16 D12',
  109: 'T20 T19 D8',
  110: 'T20 T18 D10',
  111: 'T19 T14 D18',
  112: 'T20 T12 D20',
  113: 'T19 T20 D10',
  114: 'T20 T14 D18',
  115: 'T20 T15 D16',
  116: 'T20 T16 D16',
  117: 'T20 T17 D15',
  118: 'T20 T18 D14',
  119: 'T19 T20 D13',
  120: 'T20 20 D20',
  121: 'T20 T11 D20',
  122: 'T18 T18 D16',
  123: 'T19 T16 D18',
  124: 'T20 T16 D18',
  125: 'T18 T19 D16',
  126: 'T19 T19 D15',
  127: 'T20 T17 D18',
  128: 'T18 T18 D20',
  129: 'T19 T16 D21', // or T19 T20 D16
  130: 'T20 T20 D15',
  131: 'T20 T13 D26',
  132: 'T20 T16 D21', // or Bull Bull D16
  133: 'T20 T19 D18',
  134: 'T20 T14 Bull',
  135: 'T20 T17 D21', // or Bull Bull D17
  136: 'T20 T20 D18',
  137: 'T20 T19 D20',
  138: 'T20 T18 Bull',
  139: 'T20 T13 Bull',
  140: 'T20 T20 D20',
  141: 'T20 T19 Bull',
  142: 'T20 T14 Bull',
  143: 'T20 T17 Bull',
  144: 'T20 T20 Bull',
  145: 'T20 T15 Bull',
  146: 'T20 T18 Bull',
  147: 'T20 T17 Bull',
  148: 'T20 T16 Bull',
  149: 'T20 T19 Bull',
  150: 'T20 T18 Bull',
  151: 'T20 T17 Bull',
  152: 'T20 T20 Bull',
  153: 'T20 T19 Bull',
  154: 'T20 T18 Bull',
  155: 'T20 T19 Bull',
  156: 'T20 T20 Bull',
  157: 'T20 T19 Bull',
  158: 'T20 T20 Bull',
  160: 'T20 T20 Bull',
  161: 'T20 T17 Bull',
  164: 'T20 T18 Bull',
  167: 'T20 T19 Bull',
  170: 'T20 T20 Bull',
};

export function getCheckoutSuggestion(remaining: number): CheckoutRoute | null {
  if (remaining <= 0 || remaining > 170 || remaining === 1) {
    return null;
  }

  if (BOGEY_NUMBERS.includes(remaining)) {
    return {
      label: 'No checkout',
      route: 'No checkout available',
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
