export type RankTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'champion' | 'grand-champion' | 'unknown';

export function getRankTier(rankLabel: string): RankTier {
  if (!rankLabel) return 'unknown';

  const normalized = rankLabel.toLowerCase().trim();

  // Check grand-champion BEFORE champion to avoid misclassification
  if (normalized.startsWith('grand')) return 'grand-champion';
  if (normalized.startsWith('bronze')) return 'bronze';
  if (normalized.startsWith('silver')) return 'silver';
  if (normalized.startsWith('gold')) return 'gold';
  if (normalized.startsWith('platinum')) return 'platinum';
  if (normalized.startsWith('champion')) return 'champion';
  if (normalized.includes('elite')) return 'champion';

  return 'unknown';
}

/**
 * Returns badge classes with NEUTRAL background and COLORED text
 * Use for rank badges in lobbies, match cards, etc.
 */
export function getRankBadgeClasses(rankLabel: string): string {
  const tier = getRankTier(rankLabel);

  switch (tier) {
    case 'bronze':
      return 'text-[#B87333] border-[#B87333]/40';
    case 'silver':
      return 'text-[#C0C0C0] border-[#C0C0C0]/40';
    case 'gold':
      return 'text-[#D4AF37] border-[#D4AF37]/40';
    case 'platinum':
      return 'text-[#7DD3FC] border-[#7DD3FC]/40';
    case 'champion':
      return 'text-[#EF4444] border-[#EF4444]/40';
    case 'grand-champion':
      return 'text-[#A855F7] border-[#A855F7]/40';
    case 'unknown':
    default:
      return 'text-gray-400 border-gray-400/40';
  }
}

/**
 * Returns text color classes for rank labels
 */
export function getRankTextClasses(rankLabel: string): string {
  const tier = getRankTier(rankLabel);

  switch (tier) {
    case 'bronze':
      return 'text-[#B87333]';
    case 'silver':
      return 'text-[#C0C0C0]';
    case 'gold':
      return 'text-[#D4AF37]';
    case 'platinum':
      return 'text-[#7DD3FC]';
    case 'champion':
      return 'text-[#EF4444]';
    case 'grand-champion':
      return 'text-[#A855F7]';
    case 'unknown':
    default:
      return 'text-gray-400';
  }
}

/**
 * Returns icon color classes for rank emblems
 * Use for Award icons, emblems, etc. in Ranked Divisions
 */
export function getRankIconClasses(rankLabel: string): string {
  return getRankTextClasses(rankLabel);
}

/**
 * Returns the hex color for a tier
 * Use for inline styles where Tailwind classes won't work
 */
export function getTierColor(rankLabel: string): string {
  const tier = getRankTier(rankLabel);

  switch (tier) {
    case 'bronze':
      return '#B87333';
    case 'silver':
      return '#C0C0C0';
    case 'gold':
      return '#D4AF37';
    case 'platinum':
      return '#7DD3FC';
    case 'champion':
      return '#EF4444';
    case 'grand-champion':
      return '#A855F7';
    case 'unknown':
    default:
      return '#9ca3af'; // gray-400
  }
}

/**
 * Converts hex color to rgba with specified alpha
 */
export function hexToRgba(hex: string, alpha: number): string {
  // Remove # if present
  hex = hex.replace('#', '');

  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Returns the Supabase storage URL for a rank image
 */
export function getRankImageUrl(rankLabel: string): string {
  const tier = getRankTier(rankLabel);
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const bucketPath = 'assets';
  
  switch (tier) {
    case 'bronze':
      return `${supabaseUrl}/storage/v1/object/public/${bucketPath}/BRONZE.png`;
    case 'silver':
      return `${supabaseUrl}/storage/v1/object/public/${bucketPath}/SILVER.png`;
    case 'gold':
      return `${supabaseUrl}/storage/v1/object/public/${bucketPath}/GOLD.png`;
    case 'platinum':
      return `${supabaseUrl}/storage/v1/object/public/${bucketPath}/PLAT.png`;
    case 'champion':
      return `${supabaseUrl}/storage/v1/object/public/${bucketPath}/CHAMP.png`;
    case 'grand-champion':
      return `${supabaseUrl}/storage/v1/object/public/${bucketPath}/GRAND%20CHAMP.png`;
    case 'unknown':
    default:
      return '';
  }
}
