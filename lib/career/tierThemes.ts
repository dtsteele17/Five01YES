// =============================================================
// CAREER MODE VISUAL THEME SYSTEM
// Each tier has a dramatically different visual identity
// Pro Tour has sub-themes per event type
// =============================================================

export interface TierTheme {
  name: string;
  subtitle: string;
  
  // Page
  pageBg: string;
  pageOverlay: string;        // decorative overlay pattern
  
  // Top accent bar
  accentGradient: string;
  accentBarHeight: string;    // h-0.5, h-1, h-1.5
  
  // Cards
  cardBg: string;
  cardBorder: string;
  cardRing: string;
  cardShadow: string;
  cardRadius: string;         // rounded-lg, rounded-xl, rounded-2xl
  
  // Text
  accent: string;
  accentMuted: string;
  accentBg: string;
  accentBorder: string;
  textGradient: string;
  titleWeight: string;        // font-bold, font-black, font-extrabold
  titleSize: string;          // text-lg, text-xl, text-2xl
  
  // Header bar (match screen)
  headerBg: string;
  headerBorder: string;
  
  // Buttons
  buttonBg: string;
  buttonHover: string;
  buttonText: string;
  buttonShadow: string;
  
  // Dot/indicator
  dotColor: string;
  dotSize: string;            // w-2 h-2, w-2.5 h-2.5, w-3 h-3
  dotAnimation: string;       // animate-pulse, animate-ping
  
  // Badge/pill
  badgeBg: string;
  badgeText: string;
  
  // Table
  tableHeaderBg: string;
  tableRowHover: string;
  tableHighlight: string;     // player's row
  
  // Score display
  scoreBg: string;
  scoreText: string;
  scoreBorder: string;
  
  // League position colors
  promotionBg: string;
  relegationBg: string;
  
  // Glow effects
  glowColor: string;
  glowIntensity: string;     // blur-xl, blur-2xl, blur-3xl
  glowSize: string;          // w-24 h-24, w-32 h-32, w-40 h-40
  
  // Match slot (bracket)
  slotPlayerAccent: string;
  slotWinnerBg: string;
  slotBg: string;
  
  // Decorative
  decorPattern: string;       // additional CSS classes for texture
  borderStyle: string;        // border, border-2
}

// ─── TIER 1: LOCAL CIRCUIT — Pub Darts ───────────────────────
const TIER_1: TierTheme = {
  name: 'Local Circuit',
  subtitle: 'Pub Darts',
  
  pageBg: 'bg-gradient-to-br from-green-950/40 via-stone-900 to-stone-950',
  pageOverlay: '',
  
  accentGradient: 'bg-gradient-to-r from-green-700 to-emerald-700',
  accentBarHeight: 'h-0.5',
  
  cardBg: 'bg-stone-800/50 backdrop-blur-sm',
  cardBorder: 'border-green-800/30',
  cardRing: 'ring-green-800/20',
  cardShadow: 'shadow-md',
  cardRadius: 'rounded-lg',
  
  accent: 'text-green-500',
  accentMuted: 'text-green-600/60',
  accentBg: 'bg-green-800/20',
  accentBorder: 'border-green-700/30',
  textGradient: 'bg-gradient-to-r from-green-500 to-emerald-500',
  titleWeight: 'font-bold',
  titleSize: 'text-base',
  
  headerBg: 'bg-stone-900/80',
  headerBorder: 'border-green-800/30',
  
  buttonBg: 'bg-gradient-to-r from-green-700 to-emerald-700',
  buttonHover: 'hover:from-green-600 hover:to-emerald-600',
  buttonText: 'text-white',
  buttonShadow: '',
  
  dotColor: 'bg-green-600',
  dotSize: 'w-1.5 h-1.5',
  dotAnimation: 'animate-pulse',
  
  badgeBg: 'bg-green-800/30',
  badgeText: 'text-green-500',
  
  tableHeaderBg: 'bg-green-900/20',
  tableRowHover: 'hover:bg-green-900/10',
  tableHighlight: 'bg-green-800/15 border-l-2 border-l-green-600',
  
  scoreBg: 'bg-stone-800/60',
  scoreText: 'text-green-400',
  scoreBorder: 'border-green-800/30',
  
  promotionBg: 'bg-green-500/10',
  relegationBg: 'bg-red-500/10',
  
  glowColor: 'bg-green-700/10',
  glowIntensity: 'blur-xl',
  glowSize: 'w-20 h-20',
  
  slotPlayerAccent: 'text-green-400',
  slotWinnerBg: 'bg-green-900/20',
  slotBg: 'bg-stone-800/40',
  
  decorPattern: '',
  borderStyle: 'border',
};

// ─── TIER 2: OPEN CIRCUIT — Pub Leagues ──────────────────────
const TIER_2: TierTheme = {
  name: 'Open Circuit',
  subtitle: 'Pub Leagues',
  
  pageBg: 'bg-gradient-to-br from-blue-950/40 via-slate-900 to-slate-950',
  pageOverlay: '',
  
  accentGradient: 'bg-gradient-to-r from-blue-600 via-sky-500 to-blue-600',
  accentBarHeight: 'h-0.5',
  
  cardBg: 'bg-slate-800/50 backdrop-blur-sm',
  cardBorder: 'border-blue-700/25',
  cardRing: 'ring-blue-700/20',
  cardShadow: 'shadow-md shadow-blue-900/10',
  cardRadius: 'rounded-xl',
  
  accent: 'text-blue-400',
  accentMuted: 'text-blue-400/50',
  accentBg: 'bg-blue-600/10',
  accentBorder: 'border-blue-600/25',
  textGradient: 'bg-gradient-to-r from-blue-400 to-sky-400',
  titleWeight: 'font-bold',
  titleSize: 'text-lg',
  
  headerBg: 'bg-blue-950/30',
  headerBorder: 'border-blue-700/25',
  
  buttonBg: 'bg-gradient-to-r from-blue-600 to-sky-600',
  buttonHover: 'hover:from-blue-500 hover:to-sky-500',
  buttonText: 'text-white',
  buttonShadow: 'shadow-lg shadow-blue-600/20',
  
  dotColor: 'bg-blue-500',
  dotSize: 'w-2 h-2',
  dotAnimation: 'animate-pulse',
  
  badgeBg: 'bg-blue-600/15',
  badgeText: 'text-blue-400',
  
  tableHeaderBg: 'bg-blue-900/20',
  tableRowHover: 'hover:bg-blue-900/10',
  tableHighlight: 'bg-blue-600/10 border-l-2 border-l-blue-500',
  
  scoreBg: 'bg-slate-800/60',
  scoreText: 'text-blue-400',
  scoreBorder: 'border-blue-700/25',
  
  promotionBg: 'bg-blue-500/10',
  relegationBg: 'bg-red-500/10',
  
  glowColor: 'bg-blue-600/10',
  glowIntensity: 'blur-xl',
  glowSize: 'w-24 h-24',
  
  slotPlayerAccent: 'text-blue-400',
  slotWinnerBg: 'bg-blue-900/20',
  slotBg: 'bg-slate-800/40',
  
  decorPattern: '',
  borderStyle: 'border',
};

// ─── TIER 3: COUNTY CIRCUIT — Semi-Pro ───────────────────────
const TIER_3: TierTheme = {
  name: 'County Circuit',
  subtitle: 'Semi-Professional',
  
  pageBg: 'bg-gradient-to-br from-cyan-950/40 via-slate-900 to-gray-950',
  pageOverlay: '',
  
  accentGradient: 'bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500',
  accentBarHeight: 'h-1',
  
  cardBg: 'bg-gradient-to-br from-slate-800/60 via-slate-800/40 to-cyan-950/20 backdrop-blur-sm',
  cardBorder: 'border-cyan-500/20',
  cardRing: 'ring-cyan-500/15',
  cardShadow: 'shadow-lg shadow-cyan-900/15',
  cardRadius: 'rounded-xl',
  
  accent: 'text-cyan-400',
  accentMuted: 'text-cyan-400/50',
  accentBg: 'bg-cyan-500/10',
  accentBorder: 'border-cyan-500/25',
  textGradient: 'bg-gradient-to-r from-cyan-400 to-teal-300',
  titleWeight: 'font-extrabold',
  titleSize: 'text-lg',
  
  headerBg: 'bg-cyan-950/30',
  headerBorder: 'border-cyan-500/20',
  
  buttonBg: 'bg-gradient-to-r from-cyan-600 to-teal-600',
  buttonHover: 'hover:from-cyan-500 hover:to-teal-500',
  buttonText: 'text-white',
  buttonShadow: 'shadow-lg shadow-cyan-600/25',
  
  dotColor: 'bg-cyan-400',
  dotSize: 'w-2 h-2',
  dotAnimation: 'animate-pulse',
  
  badgeBg: 'bg-cyan-500/15',
  badgeText: 'text-cyan-400',
  
  tableHeaderBg: 'bg-cyan-900/20',
  tableRowHover: 'hover:bg-cyan-900/10',
  tableHighlight: 'bg-cyan-500/10 border-l-2 border-l-cyan-400',
  
  scoreBg: 'bg-slate-800/70',
  scoreText: 'text-cyan-300',
  scoreBorder: 'border-cyan-500/20',
  
  promotionBg: 'bg-cyan-500/10',
  relegationBg: 'bg-red-500/10',
  
  glowColor: 'bg-cyan-500/10',
  glowIntensity: 'blur-2xl',
  glowSize: 'w-28 h-28',
  
  slotPlayerAccent: 'text-cyan-300',
  slotWinnerBg: 'bg-cyan-900/20',
  slotBg: 'bg-slate-800/50',
  
  decorPattern: '',
  borderStyle: 'border',
};

// ─── TIER 4: NATIONAL TOUR — Professional TV ─────────────────
const TIER_4: TierTheme = {
  name: 'National Tour',
  subtitle: 'Professional Circuit',
  
  pageBg: 'bg-gradient-to-br from-orange-950/40 via-slate-900 to-amber-950/20',
  pageOverlay: '',
  
  accentGradient: 'bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500',
  accentBarHeight: 'h-1',
  
  cardBg: 'bg-gradient-to-br from-slate-800/70 via-orange-950/15 to-slate-800/50 backdrop-blur-md',
  cardBorder: 'border-orange-500/20',
  cardRing: 'ring-orange-500/15',
  cardShadow: 'shadow-xl shadow-orange-900/20',
  cardRadius: 'rounded-xl',
  
  accent: 'text-orange-400',
  accentMuted: 'text-orange-400/50',
  accentBg: 'bg-orange-500/10',
  accentBorder: 'border-orange-500/25',
  textGradient: 'bg-gradient-to-r from-orange-400 to-amber-300',
  titleWeight: 'font-black',
  titleSize: 'text-xl',
  
  headerBg: 'bg-orange-950/30',
  headerBorder: 'border-orange-500/25',
  
  buttonBg: 'bg-gradient-to-r from-orange-600 to-amber-600',
  buttonHover: 'hover:from-orange-500 hover:to-amber-500',
  buttonText: 'text-white',
  buttonShadow: 'shadow-xl shadow-orange-600/30',
  
  dotColor: 'bg-orange-400',
  dotSize: 'w-2.5 h-2.5',
  dotAnimation: 'animate-pulse',
  
  badgeBg: 'bg-orange-500/15',
  badgeText: 'text-orange-400',
  
  tableHeaderBg: 'bg-orange-900/25',
  tableRowHover: 'hover:bg-orange-900/10',
  tableHighlight: 'bg-orange-500/10 border-l-2 border-l-orange-400',
  
  scoreBg: 'bg-gradient-to-b from-slate-800/80 to-orange-950/20',
  scoreText: 'text-orange-300',
  scoreBorder: 'border-orange-500/25',
  
  promotionBg: 'bg-orange-500/10',
  relegationBg: 'bg-red-500/10',
  
  glowColor: 'bg-orange-500/15',
  glowIntensity: 'blur-2xl',
  glowSize: 'w-32 h-32',
  
  slotPlayerAccent: 'text-orange-300',
  slotWinnerBg: 'bg-orange-900/25',
  slotBg: 'bg-slate-800/50',
  
  decorPattern: '',
  borderStyle: 'border',
};

// ─── TIER 5: PRO TOUR — Players Championship (default) ──────
const TIER_5_DEFAULT: TierTheme = {
  name: 'Pro Tour',
  subtitle: 'Players Championship',
  
  pageBg: 'bg-gradient-to-br from-red-950/40 via-slate-900 to-rose-950/20',
  pageOverlay: '',
  
  accentGradient: 'bg-gradient-to-r from-red-500 via-rose-400 to-red-500',
  accentBarHeight: 'h-1',
  
  cardBg: 'bg-gradient-to-br from-slate-800/70 via-red-950/15 to-slate-800/50 backdrop-blur-md',
  cardBorder: 'border-red-500/20',
  cardRing: 'ring-red-500/15',
  cardShadow: 'shadow-xl shadow-red-900/20',
  cardRadius: 'rounded-2xl',
  
  accent: 'text-red-400',
  accentMuted: 'text-red-400/50',
  accentBg: 'bg-red-500/10',
  accentBorder: 'border-red-500/25',
  textGradient: 'bg-gradient-to-r from-red-400 to-rose-300',
  titleWeight: 'font-black',
  titleSize: 'text-xl',
  
  headerBg: 'bg-red-950/30',
  headerBorder: 'border-red-500/25',
  
  buttonBg: 'bg-gradient-to-r from-red-600 to-rose-600',
  buttonHover: 'hover:from-red-500 hover:to-rose-500',
  buttonText: 'text-white',
  buttonShadow: 'shadow-xl shadow-red-600/30',
  
  dotColor: 'bg-red-400',
  dotSize: 'w-2.5 h-2.5',
  dotAnimation: 'animate-pulse',
  
  badgeBg: 'bg-red-500/15',
  badgeText: 'text-red-400',
  
  tableHeaderBg: 'bg-red-900/25',
  tableRowHover: 'hover:bg-red-900/10',
  tableHighlight: 'bg-red-500/10 border-l-2 border-l-red-400',
  
  scoreBg: 'bg-gradient-to-b from-slate-800/80 to-red-950/20',
  scoreText: 'text-red-300',
  scoreBorder: 'border-red-500/25',
  
  promotionBg: 'bg-red-500/10',
  relegationBg: 'bg-red-500/10',
  
  glowColor: 'bg-red-500/15',
  glowIntensity: 'blur-2xl',
  glowSize: 'w-36 h-36',
  
  slotPlayerAccent: 'text-red-300',
  slotWinnerBg: 'bg-red-900/25',
  slotBg: 'bg-slate-800/50',
  
  decorPattern: '',
  borderStyle: 'border',
};

// ─── CHAMPIONS SERIES — Elite Invitational ───────────────────
const TIER_5_CS: TierTheme = {
  name: 'Champions Series',
  subtitle: 'Elite Invitational',
  
  pageBg: 'bg-gradient-to-br from-purple-950/50 via-slate-900 to-amber-950/10',
  pageOverlay: '',
  
  accentGradient: 'bg-gradient-to-r from-purple-500 via-amber-400 to-purple-500',
  accentBarHeight: 'h-1.5',
  
  cardBg: 'bg-gradient-to-br from-purple-900/20 via-slate-800/60 to-amber-900/10 backdrop-blur-md',
  cardBorder: 'border-purple-500/25',
  cardRing: 'ring-purple-500/20',
  cardShadow: 'shadow-2xl shadow-purple-900/30',
  cardRadius: 'rounded-2xl',
  
  accent: 'text-purple-400',
  accentMuted: 'text-purple-400/50',
  accentBg: 'bg-purple-500/10',
  accentBorder: 'border-purple-500/30',
  textGradient: 'bg-gradient-to-r from-purple-400 via-amber-300 to-purple-400',
  titleWeight: 'font-black',
  titleSize: 'text-xl',
  
  headerBg: 'bg-purple-950/40',
  headerBorder: 'border-purple-500/30',
  
  buttonBg: 'bg-gradient-to-r from-purple-600 via-amber-500 to-purple-600',
  buttonHover: 'hover:from-purple-500 hover:to-purple-500',
  buttonText: 'text-white',
  buttonShadow: 'shadow-2xl shadow-purple-600/40',
  
  dotColor: 'bg-purple-400',
  dotSize: 'w-3 h-3',
  dotAnimation: 'animate-ping',
  
  badgeBg: 'bg-purple-500/20',
  badgeText: 'text-purple-300',
  
  tableHeaderBg: 'bg-purple-900/30',
  tableRowHover: 'hover:bg-purple-900/15',
  tableHighlight: 'bg-purple-500/15 border-l-2 border-l-purple-400',
  
  scoreBg: 'bg-gradient-to-b from-purple-900/30 to-slate-800/80',
  scoreText: 'text-amber-300',
  scoreBorder: 'border-purple-500/30',
  
  promotionBg: 'bg-purple-500/10',
  relegationBg: 'bg-red-500/10',
  
  glowColor: 'bg-purple-500/20',
  glowIntensity: 'blur-3xl',
  glowSize: 'w-40 h-40',
  
  slotPlayerAccent: 'text-amber-300',
  slotWinnerBg: 'bg-purple-900/30',
  slotBg: 'bg-slate-800/50',
  
  decorPattern: '',
  borderStyle: 'border-2',
};

// ─── WORLD SERIES — International Prestige ───────────────────
const TIER_5_WS: TierTheme = {
  name: 'World Series',
  subtitle: 'International Circuit',
  
  pageBg: 'bg-gradient-to-br from-indigo-950/50 via-slate-900 to-sky-950/20',
  pageOverlay: '',
  
  accentGradient: 'bg-gradient-to-r from-indigo-400 via-sky-300 to-indigo-400',
  accentBarHeight: 'h-1.5',
  
  cardBg: 'bg-gradient-to-br from-indigo-900/20 via-slate-800/60 to-sky-900/10 backdrop-blur-md',
  cardBorder: 'border-indigo-400/20',
  cardRing: 'ring-indigo-400/15',
  cardShadow: 'shadow-2xl shadow-indigo-900/30',
  cardRadius: 'rounded-2xl',
  
  accent: 'text-indigo-300',
  accentMuted: 'text-indigo-400/50',
  accentBg: 'bg-indigo-500/10',
  accentBorder: 'border-indigo-400/25',
  textGradient: 'bg-gradient-to-r from-indigo-300 via-sky-200 to-indigo-300',
  titleWeight: 'font-black',
  titleSize: 'text-xl',
  
  headerBg: 'bg-indigo-950/40',
  headerBorder: 'border-indigo-400/25',
  
  buttonBg: 'bg-gradient-to-r from-indigo-600 to-sky-600',
  buttonHover: 'hover:from-indigo-500 hover:to-sky-500',
  buttonText: 'text-white',
  buttonShadow: 'shadow-2xl shadow-indigo-600/35',
  
  dotColor: 'bg-indigo-400',
  dotSize: 'w-3 h-3',
  dotAnimation: 'animate-ping',
  
  badgeBg: 'bg-indigo-500/20',
  badgeText: 'text-indigo-300',
  
  tableHeaderBg: 'bg-indigo-900/25',
  tableRowHover: 'hover:bg-indigo-900/10',
  tableHighlight: 'bg-indigo-500/12 border-l-2 border-l-indigo-400',
  
  scoreBg: 'bg-gradient-to-b from-indigo-900/30 to-slate-800/80',
  scoreText: 'text-sky-300',
  scoreBorder: 'border-indigo-400/25',
  
  promotionBg: 'bg-indigo-500/10',
  relegationBg: 'bg-red-500/10',
  
  glowColor: 'bg-indigo-400/15',
  glowIntensity: 'blur-3xl',
  glowSize: 'w-40 h-40',
  
  slotPlayerAccent: 'text-sky-300',
  slotWinnerBg: 'bg-indigo-900/25',
  slotBg: 'bg-slate-800/50',
  
  decorPattern: '',
  borderStyle: 'border-2',
};

// ─── PRO TOUR OPEN — Open Competition ────────────────────────
const TIER_5_OPEN: TierTheme = {
  name: 'Pro Tour Open',
  subtitle: 'Open Championship',
  
  pageBg: 'bg-gradient-to-br from-emerald-950/40 via-slate-900 to-teal-950/20',
  pageOverlay: '',
  
  accentGradient: 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500',
  accentBarHeight: 'h-1',
  
  cardBg: 'bg-gradient-to-br from-emerald-900/15 via-slate-800/60 to-teal-900/10 backdrop-blur-md',
  cardBorder: 'border-emerald-500/20',
  cardRing: 'ring-emerald-500/15',
  cardShadow: 'shadow-xl shadow-emerald-900/20',
  cardRadius: 'rounded-2xl',
  
  accent: 'text-emerald-400',
  accentMuted: 'text-emerald-400/50',
  accentBg: 'bg-emerald-500/10',
  accentBorder: 'border-emerald-500/25',
  textGradient: 'bg-gradient-to-r from-emerald-400 to-teal-300',
  titleWeight: 'font-black',
  titleSize: 'text-xl',
  
  headerBg: 'bg-emerald-950/30',
  headerBorder: 'border-emerald-500/25',
  
  buttonBg: 'bg-gradient-to-r from-emerald-600 to-teal-600',
  buttonHover: 'hover:from-emerald-500 hover:to-teal-500',
  buttonText: 'text-white',
  buttonShadow: 'shadow-xl shadow-emerald-600/30',
  
  dotColor: 'bg-emerald-400',
  dotSize: 'w-2.5 h-2.5',
  dotAnimation: 'animate-pulse',
  
  badgeBg: 'bg-emerald-500/15',
  badgeText: 'text-emerald-400',
  
  tableHeaderBg: 'bg-emerald-900/20',
  tableRowHover: 'hover:bg-emerald-900/10',
  tableHighlight: 'bg-emerald-500/10 border-l-2 border-l-emerald-400',
  
  scoreBg: 'bg-gradient-to-b from-emerald-900/20 to-slate-800/80',
  scoreText: 'text-emerald-300',
  scoreBorder: 'border-emerald-500/25',
  
  promotionBg: 'bg-emerald-500/10',
  relegationBg: 'bg-red-500/10',
  
  glowColor: 'bg-emerald-500/15',
  glowIntensity: 'blur-2xl',
  glowSize: 'w-36 h-36',
  
  slotPlayerAccent: 'text-emerald-300',
  slotWinnerBg: 'bg-emerald-900/20',
  slotBg: 'bg-slate-800/50',
  
  decorPattern: '',
  borderStyle: 'border',
};

// ─── THEME REGISTRY ──────────────────────────────────────────
export const TIER_THEMES: Record<number, TierTheme> = {
  1: TIER_1,
  2: TIER_2,
  3: TIER_3,
  4: TIER_4,
  5: TIER_5_DEFAULT,
};

/** Get base tier theme (no event consideration) */
export function getTierTheme(tier: number): TierTheme {
  return TIER_THEMES[tier] || TIER_THEMES[1];
}

/** 
 * Get the right theme based on tier + event type/name.
 * For Pro Tour (T5), returns sub-event themes.
 */
export function getEventTheme(
  tier: number, 
  eventType?: string | null, 
  eventName?: string | null
): TierTheme {
  if (tier < 5) return getTierTheme(tier);
  
  // Pro Tour sub-events
  if (eventType?.startsWith('champions_series')) return TIER_5_CS;
  if (eventType?.startsWith('pro_world_series') || eventName?.toLowerCase().includes('world series')) return TIER_5_WS;
  if (eventType?.startsWith('pro_tour_open') || eventName?.toLowerCase().includes('pro tour open')) return TIER_5_OPEN;
  
  // Default Pro Tour = Players Championship style
  return TIER_5_DEFAULT;
}

// Re-export for compatibility
export default TIER_THEMES;
