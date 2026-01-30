import { AchievementEvent } from './achievementEvents';
import { evaluateAchievementEvent } from './evaluateAchievementEvents';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface UnlockedAchievement {
  code: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  xp: number;
}

export async function processAchievementEvent(event: AchievementEvent): Promise<void> {
  try {
    const unlocked = await evaluateAchievementEvent(event);

    if (unlocked.length > 0) {
      for (const achievement of unlocked) {
        await showAchievementUnlockToast(achievement, event.userId);
      }
    }
  } catch (error) {
    console.error('Error processing achievement event:', error);
  }
}

export async function showAchievementUnlockToast(
  achievement: UnlockedAchievement,
  userId: string
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    type: 'achievement',
    title: 'Achievement Unlocked!',
    message: `${achievement.name}`,
    link: '/app/achievements',
    read: false,
    metadata: {
      achievementId: achievement.code,
      achievementName: achievement.name,
      category: achievement.category,
      icon: achievement.icon,
      xp: achievement.xp,
    },
  });

  if (error) {
    console.error('Error creating achievement notification:', error);
  }

  toast.success('Achievement Unlocked!', {
    description: `${achievement.icon} ${achievement.name} - ${achievement.category} (+${achievement.xp} XP)`,
    position: 'bottom-right',
    duration: 5000,
    className: 'achievement-toast bg-slate-900/95 backdrop-blur-xl border-amber-500/30',
    action: {
      label: 'View',
      onClick: () => {
        if (typeof window !== 'undefined') {
          window.location.href = '/app/achievements';
        }
      },
    },
  });
}

export { type AchievementEvent } from './achievementEvents';
