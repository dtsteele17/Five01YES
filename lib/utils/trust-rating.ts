/**
 * Trust Rating utilities
 * Provides consistent styling and helpers for trust rating badges
 */

export type TrustRatingLetter = 'A' | 'B' | 'C' | 'D' | 'E' | null;

/**
 * Get the CSS classes for a trust rating badge
 * @param letter - The trust rating letter (A-E) or null for unrated
 * @returns CSS classes for the badge
 */
export function getTrustRatingBadgeClass(letter: TrustRatingLetter): string {
  const colors: Record<string, string> = {
    A: 'bg-green-600/20 text-green-400 border-green-500/30',
    B: 'bg-lime-600/20 text-lime-400 border-lime-500/30',
    C: 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30',
    D: 'bg-orange-600/20 text-orange-400 border-orange-500/30',
    E: 'bg-red-600/20 text-red-400 border-red-500/30',
    unrated: 'bg-slate-600/20 text-slate-300 border-slate-500/30',
  };

  return colors[letter || 'unrated'];
}

/**
 * Get the gradient classes for a trust rating button
 * @param letter - The trust rating letter (A-E)
 * @returns CSS gradient classes for the button
 */
export function getTrustRatingButtonGradient(letter: 'A' | 'B' | 'C' | 'D' | 'E'): string {
  const gradients: Record<string, string> = {
    A: 'from-emerald-500 to-green-500',
    B: 'from-lime-500 to-green-400',
    C: 'from-slate-500 to-gray-500',
    D: 'from-orange-500 to-amber-500',
    E: 'from-red-500 to-rose-500',
  };

  return gradients[letter];
}

/**
 * Get the display text for a trust rating letter
 * @param letter - The trust rating letter (A-E) or null
 * @returns Display text
 */
export function getTrustRatingDisplay(letter: TrustRatingLetter): string {
  return letter || '—';
}

/**
 * Get the description for a trust rating letter
 * @param letter - The trust rating letter (A-E)
 * @returns Description text
 */
export function getTrustRatingDescription(letter: 'A' | 'B' | 'C' | 'D' | 'E'): string {
  const descriptions: Record<string, string> = {
    A: 'Very trustworthy',
    B: 'Trustworthy',
    C: 'Neutral',
    D: 'Questionable',
    E: 'Not trustworthy',
  };

  return descriptions[letter];
}

/**
 * Get the label for an unrated player
 * @returns Label text
 */
export function getUnratedLabel(): string {
  return 'No Trust Rating yet';
}
