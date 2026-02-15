export interface NormalizedMatchConfig {
  bestOf: number;
  mode: '301' | '501';
  doubleOut: boolean;
  straightIn: boolean;
}

export const DEFAULT_MATCH_CONFIG: NormalizedMatchConfig = {
  bestOf: 3,
  mode: '501',
  doubleOut: true,
  straightIn: false,
};

export function parseBestOf(bestOf: unknown): number {
  if (typeof bestOf === 'number') {
    return bestOf;
  }

  if (typeof bestOf === 'string') {
    const normalized = bestOf.toLowerCase().trim();

    const match = normalized.match(/(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if ([1, 3, 5, 7, 9, 11].includes(num)) {
        return num;
      }
    }
  }

  return DEFAULT_MATCH_CONFIG.bestOf;
}

export function normalizeMatchConfig(input?: Partial<{
  bestOf?: unknown;
  mode?: unknown;
  gameMode?: unknown;
  doubleOut?: unknown;
  straightIn?: unknown;
}>): NormalizedMatchConfig {
  const mode = input?.mode || input?.gameMode;
  let normalizedMode: '301' | '501' = DEFAULT_MATCH_CONFIG.mode;

  if (typeof mode === 'string') {
    const modeStr = mode.trim();
    if (modeStr === '301' || modeStr === '501') {
      normalizedMode = modeStr;
    }
  }

  return {
    bestOf: parseBestOf(input?.bestOf),
    mode: normalizedMode,
    doubleOut: input?.doubleOut === false ? false : true,
    straightIn: input?.straightIn === true ? true : false,
  };
}
