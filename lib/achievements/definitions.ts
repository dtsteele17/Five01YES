export interface AchievementDefinition {
  code: string;
  name: string;
  description: string;
  category: 'General' | 'Funny' | 'Scoring' | 'Finishing' | 'Streaks' | 'Competitive';
  icon: string;
  xp: number;
  tier: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  type: 'counter' | 'boolean' | 'best' | 'milestone';
  goalValue: number;
  statKey: string;
}

export async function loadAchievementDefinitions(): Promise<AchievementDefinition[]> {
  return [];
}
