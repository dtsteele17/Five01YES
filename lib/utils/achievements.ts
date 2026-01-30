import { createClient } from '@/lib/supabase/client';

export async function checkAndUnlockAchievement(achievementId: string): Promise<boolean> {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: existing } = await supabase
    .from('user_achievements')
    .select('*')
    .eq('user_id', user.id)
    .eq('achievement_id', achievementId)
    .maybeSingle();

  if (existing && existing.completed) {
    return false;
  }

  if (existing) {
    const { error } = await supabase
      .from('user_achievements')
      .update({
        completed: true,
        progress: 1,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (error) {
      console.error('Error updating achievement:', error);
      return false;
    }
  } else {
    const { error } = await supabase
      .from('user_achievements')
      .insert({
        user_id: user.id,
        achievement_id: achievementId,
        completed: true,
        progress: 1,
        completed_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error creating achievement:', error);
      return false;
    }
  }

  return true;
}

export async function showAchievementNotification(achievementId: string, title: string, description: string, reward: string) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('notifications')
    .insert({
      user_id: user.id,
      type: 'achievement',
      title: `Achievement Unlocked: ${title}`,
      message: `${description} - Reward: ${reward}`,
      reference_id: achievementId,
      read: false,
    });
}

export async function checkScoreAchievements(score: number): Promise<void> {
  if (score === 69) {
    const unlocked = await checkAndUnlockAchievement('nice');
    if (unlocked) {
      await showAchievementNotification('nice', 'Nice.', 'Score exactly 69 in a single visit.', '69 XP');
    }
  }
}
