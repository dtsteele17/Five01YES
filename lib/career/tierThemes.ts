// Tier-specific visual themes for Career Mode
// Tier 1: Local Circuit — warm green, pub darts feel
// Tier 2: Open Circuit — cool blue, stepping up
// Tier 3: County Circuit — teal/cyan, semi-pro
// Tier 4: National Tour — orange/amber, professional TV events
// Tier 5: Pro Tour — purple/gold, elite Sky Sports level

export interface TierTheme {
  name: string;
  // Backgrounds
  pageBg: string;
  cardBg: string;
  cardBorder: string;
  cardRing: string;
  // Accent colors
  accent: string;        // text color
  accentMuted: string;   // lighter version
  accentBg: string;      // background tint
  accentBorder: string;
  // Header bar (match screen)
  headerBg: string;
  headerBorder: string;
  // Gradient accents
  accentGradient: string;  // for top bars, highlights
  textGradient: string;    // for gradient text
  // Badge/pill
  badgeBg: string;
  badgeText: string;
  // Button
  buttonBg: string;
  buttonHover: string;
  // Dot/indicator
  dotColor: string;
  // League table highlights
  promotionBg: string;
  relegationBg: string;
}

export const TIER_THEMES: Record<number, TierTheme> = {
  1: {
    name: 'Local Circuit',
    pageBg: 'bg-gradient-to-br from-green-950/30 via-slate-900 to-slate-950',
    cardBg: 'bg-gradient-to-br from-green-900/15 via-slate-800/40 to-slate-900/80',
    cardBorder: 'border-green-500/20',
    cardRing: 'ring-green-500/20',
    accent: 'text-green-400',
    accentMuted: 'text-green-400/60',
    accentBg: 'bg-green-500/10',
    accentBorder: 'border-green-500/30',
    headerBg: 'bg-green-950/20',
    headerBorder: 'border-green-500/20',
    accentGradient: 'bg-gradient-to-r from-green-500 via-emerald-400 to-green-500',
    textGradient: 'bg-gradient-to-r from-green-400 to-emerald-400',
    badgeBg: 'bg-green-500/15',
    badgeText: 'text-green-400',
    buttonBg: 'bg-gradient-to-r from-green-600 to-emerald-600',
    buttonHover: 'hover:from-green-500 hover:to-emerald-500',
    dotColor: 'bg-green-400',
    promotionBg: 'bg-green-500/10',
    relegationBg: 'bg-red-500/10',
  },
  2: {
    name: 'Open Circuit',
    pageBg: 'bg-gradient-to-br from-blue-950/30 via-slate-900 to-slate-950',
    cardBg: 'bg-gradient-to-br from-blue-900/15 via-slate-800/40 to-slate-900/80',
    cardBorder: 'border-blue-500/20',
    cardRing: 'ring-blue-500/20',
    accent: 'text-blue-400',
    accentMuted: 'text-blue-400/60',
    accentBg: 'bg-blue-500/10',
    accentBorder: 'border-blue-500/30',
    headerBg: 'bg-blue-950/20',
    headerBorder: 'border-blue-500/20',
    accentGradient: 'bg-gradient-to-r from-blue-500 via-sky-400 to-blue-500',
    textGradient: 'bg-gradient-to-r from-blue-400 to-sky-400',
    badgeBg: 'bg-blue-500/15',
    badgeText: 'text-blue-400',
    buttonBg: 'bg-gradient-to-r from-blue-600 to-sky-600',
    buttonHover: 'hover:from-blue-500 hover:to-sky-500',
    dotColor: 'bg-blue-400',
    promotionBg: 'bg-blue-500/10',
    relegationBg: 'bg-red-500/10',
  },
  3: {
    name: 'County Circuit',
    pageBg: 'bg-gradient-to-br from-cyan-950/30 via-slate-900 to-slate-950',
    cardBg: 'bg-gradient-to-br from-cyan-900/15 via-slate-800/40 to-slate-900/80',
    cardBorder: 'border-cyan-500/20',
    cardRing: 'ring-cyan-500/20',
    accent: 'text-cyan-400',
    accentMuted: 'text-cyan-400/60',
    accentBg: 'bg-cyan-500/10',
    accentBorder: 'border-cyan-500/30',
    headerBg: 'bg-cyan-950/20',
    headerBorder: 'border-cyan-500/20',
    accentGradient: 'bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500',
    textGradient: 'bg-gradient-to-r from-cyan-400 to-teal-400',
    badgeBg: 'bg-cyan-500/15',
    badgeText: 'text-cyan-400',
    buttonBg: 'bg-gradient-to-r from-cyan-600 to-teal-600',
    buttonHover: 'hover:from-cyan-500 hover:to-teal-500',
    dotColor: 'bg-cyan-400',
    promotionBg: 'bg-cyan-500/10',
    relegationBg: 'bg-red-500/10',
  },
  4: {
    name: 'National Tour',
    pageBg: 'bg-gradient-to-br from-orange-950/30 via-slate-900 to-slate-950',
    cardBg: 'bg-gradient-to-br from-orange-900/15 via-slate-800/40 to-slate-900/80',
    cardBorder: 'border-orange-500/20',
    cardRing: 'ring-orange-500/20',
    accent: 'text-orange-400',
    accentMuted: 'text-orange-400/60',
    accentBg: 'bg-orange-500/10',
    accentBorder: 'border-orange-500/30',
    headerBg: 'bg-orange-950/20',
    headerBorder: 'border-orange-500/20',
    accentGradient: 'bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500',
    textGradient: 'bg-gradient-to-r from-orange-400 to-amber-400',
    badgeBg: 'bg-orange-500/15',
    badgeText: 'text-orange-400',
    buttonBg: 'bg-gradient-to-r from-orange-600 to-amber-600',
    buttonHover: 'hover:from-orange-500 hover:to-amber-500',
    dotColor: 'bg-orange-400',
    promotionBg: 'bg-orange-500/10',
    relegationBg: 'bg-red-500/10',
  },
  5: {
    name: 'Pro Tour',
    pageBg: 'bg-gradient-to-br from-purple-950/30 via-slate-900 to-slate-950',
    cardBg: 'bg-gradient-to-br from-purple-900/15 via-slate-800/40 to-slate-900/80',
    cardBorder: 'border-purple-500/20',
    cardRing: 'ring-purple-500/20',
    accent: 'text-purple-400',
    accentMuted: 'text-purple-400/60',
    accentBg: 'bg-purple-500/10',
    accentBorder: 'border-purple-500/30',
    headerBg: 'bg-purple-950/20',
    headerBorder: 'border-purple-500/20',
    accentGradient: 'bg-gradient-to-r from-purple-500 via-amber-400 to-purple-500',
    textGradient: 'bg-gradient-to-r from-purple-400 to-amber-400',
    badgeBg: 'bg-purple-500/15',
    badgeText: 'text-purple-400',
    buttonBg: 'bg-gradient-to-r from-purple-600 to-amber-600',
    buttonHover: 'hover:from-purple-500 hover:to-amber-500',
    dotColor: 'bg-purple-400',
    promotionBg: 'bg-purple-500/10',
    relegationBg: 'bg-red-500/10',
  },
};

export function getTierTheme(tier: number): TierTheme {
  return TIER_THEMES[tier] || TIER_THEMES[1];
}
