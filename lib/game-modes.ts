export const GAME_MODES = {
  '301': { name: '301', startScore: 301 },
  '501': { name: '501', startScore: 501 },
  'Around the Clock': { name: 'Around the Clock', startScore: 0 },
} as const;

export type GameMode = keyof typeof GAME_MODES;

export const SCORING_GAME_MODES: GameMode[] = ['301', '501'];
export const ALL_GAME_MODES: GameMode[] = ['301', '501', 'Around the Clock'];

export function getStartScore(mode: string): number {
  if (mode === '301') return 301;
  if (mode === '501') return 501;
  return 501;
}
