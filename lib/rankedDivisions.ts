export interface RankLevel {
  id: string;
  name: string;
  entryRP: number;
  tier: string;
}

export interface ComputedRankLevel extends RankLevel {
  minRP: number;
  maxRP: number;
  relegationRP: number;
}

export interface RankTier {
  id: string;
  name: string;
  colorClass: string;
  accentColor: string;
  levels: RankLevel[];
}

export interface ComputedRankTier extends Omit<RankTier, 'levels'> {
  levels: ComputedRankLevel[];
  minRP: number;
  maxRP: number;
}

export const rankedDivisions: RankTier[] = [
  {
    id: 'bronze',
    name: 'Bronze',
    colorClass: 'from-orange-700 to-orange-600',
    accentColor: 'border-orange-600/50 bg-orange-600/10',
    levels: [
      { id: 'bronze-4', name: 'Bronze 4', entryRP: 0, tier: 'bronze' },
      { id: 'bronze-3', name: 'Bronze 3', entryRP: 100, tier: 'bronze' },
      { id: 'bronze-2', name: 'Bronze 2', entryRP: 200, tier: 'bronze' },
      { id: 'bronze-1', name: 'Bronze 1', entryRP: 300, tier: 'bronze' },
    ],
  },
  {
    id: 'silver',
    name: 'Silver',
    colorClass: 'from-gray-400 to-gray-500',
    accentColor: 'border-gray-400/50 bg-gray-400/10',
    levels: [
      { id: 'silver-4', name: 'Silver 4', entryRP: 400, tier: 'silver' },
      { id: 'silver-3', name: 'Silver 3', entryRP: 550, tier: 'silver' },
      { id: 'silver-2', name: 'Silver 2', entryRP: 700, tier: 'silver' },
      { id: 'silver-1', name: 'Silver 1', entryRP: 850, tier: 'silver' },
    ],
  },
  {
    id: 'gold',
    name: 'Gold',
    colorClass: 'from-yellow-500 to-yellow-600',
    accentColor: 'border-yellow-500/50 bg-yellow-500/10',
    levels: [
      { id: 'gold-4', name: 'Gold 4', entryRP: 1000, tier: 'gold' },
      { id: 'gold-3', name: 'Gold 3', entryRP: 1150, tier: 'gold' },
      { id: 'gold-2', name: 'Gold 2', entryRP: 1300, tier: 'gold' },
      { id: 'gold-1', name: 'Gold 1', entryRP: 1450, tier: 'gold' },
    ],
  },
  {
    id: 'platinum',
    name: 'Platinum',
    colorClass: 'from-sky-500 to-sky-400',
    accentColor: 'border-sky-500/50 bg-sky-500/10',
    levels: [
      { id: 'platinum-4', name: 'Platinum 4', entryRP: 1600, tier: 'platinum' },
      { id: 'platinum-3', name: 'Platinum 3', entryRP: 1775, tier: 'platinum' },
      { id: 'platinum-2', name: 'Platinum 2', entryRP: 1950, tier: 'platinum' },
      { id: 'platinum-1', name: 'Platinum 1', entryRP: 2125, tier: 'platinum' },
    ],
  },
  {
    id: 'champion',
    name: 'Champion',
    colorClass: 'from-red-500 to-red-600',
    accentColor: 'border-red-500/50 bg-red-500/10',
    levels: [
      { id: 'champion-2', name: 'Champion 2', entryRP: 2300, tier: 'champion' },
      { id: 'champion-1', name: 'Champion 1', entryRP: 2450, tier: 'champion' },
    ],
  },
  {
    id: 'grand-champion',
    name: 'Grand Champion',
    colorClass: 'from-purple-500 to-purple-600',
    accentColor: 'border-purple-500/50 bg-purple-500/10',
    levels: [
      { id: 'grand-champion', name: 'Grand Champion', entryRP: 2600, tier: 'grand-champion' },
    ],
  },
];

function getAllLevelsFlat(): RankLevel[] {
  return rankedDivisions.flatMap(tier => tier.levels);
}

export function computeRankLevels(): ComputedRankLevel[] {
  const allLevels = getAllLevelsFlat();

  return allLevels.map((level, index) => {
    const minRP = level.entryRP;
    const nextLevel = allLevels[index + 1];
    const maxRP = nextLevel ? nextLevel.entryRP - 1 : 9999;

    const relegationRP = index > 0 ? Math.floor((minRP + allLevels[index - 1].entryRP) / 2) : 0;

    return {
      ...level,
      minRP,
      maxRP,
      relegationRP,
    };
  });
}

export function computeRankedDivisions(): ComputedRankTier[] {
  const computedLevels = computeRankLevels();

  return rankedDivisions.map(tier => {
    const tierLevels = computedLevels.filter(level => level.tier === tier.id);
    const minRP = tierLevels[0]?.minRP ?? 0;
    const maxRP = tierLevels[tierLevels.length - 1]?.maxRP ?? 0;

    return {
      ...tier,
      levels: tierLevels,
      minRP,
      maxRP,
    };
  });
}

if (typeof window !== 'undefined') {
  const computed = computeRankLevels();
  for (let i = 0; i < computed.length - 1; i++) {
    const current = computed[i];
    const next = computed[i + 1];
    if (current.maxRP + 1 !== next.minRP) {
      console.warn(
        `⚠️ RP Gap detected between ${current.name} (max: ${current.maxRP}) and ${next.name} (min: ${next.minRP})`
      );
    }
  }
}

export function getCurrentRank(rp: number): ComputedRankLevel {
  const computed = computeRankLevels();
  for (let i = computed.length - 1; i >= 0; i--) {
    if (rp >= computed[i].minRP) {
      return computed[i];
    }
  }
  return computed[0];
}

export function getNextRank(currentRank: RankLevel): ComputedRankLevel | null {
  const computed = computeRankLevels();
  const currentIndex = computed.findIndex(l => l.id === currentRank.id);

  if (currentIndex === -1 || currentIndex === computed.length - 1) {
    return null;
  }

  return computed[currentIndex + 1];
}

export function getRankTier(rankId: string): ComputedRankTier | undefined {
  return computeRankedDivisions().find(tier =>
    tier.levels.some(level => level.id === rankId)
  );
}
