import { AchievementEvent } from './achievementEvents';
import { createClient } from '@/lib/supabase/client';

interface UnlockedAchievement {
  code: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  xp: number;
}

export async function evaluateAchievementEvent(
  event: AchievementEvent
): Promise<UnlockedAchievement[]> {
  const unlocked: UnlockedAchievement[] = [];

  try {
    const supabase = createClient();

    switch (event.type) {
      case 'VISIT_SUBMITTED':
        if (event.visitScore === 180) {
          await checkAndUpdate(supabase, event.userId, 'boom', 'milestone', 1);
          await checkAndUpdate(supabase, event.userId, 'maximum-effort', 'counter', 1);
          await checkAndUpdate(supabase, event.userId, 'ton-80-club', 'counter', 1);
          await checkAndUpdate(supabase, event.userId, 'treble-trouble', 'counter', 1);
          await checkAndUpdate(supabase, event.userId, '180-machine', 'counter', 1);
          await checkAndUpdate(supabase, event.userId, 'maximum-overload', 'counter', 1);
          await checkAndUpdate(supabase, event.userId, 'treble-factory', 'counter', 1);
          await checkAndUpdate(supabase, event.userId, 'treble-god', 'counter', 1);
        }

        if (event.visitScore >= 100) {
          await checkAndUpdate(supabase, event.userId, 'ton-up', 'milestone', 1);
          await checkAndUpdate(supabase, event.userId, 'ton-machine', 'counter', 1);
        }

        if (event.visitScore === 26) {
          await checkAndUpdate(supabase, event.userId, 'feared-number', 'milestone', 1);
          await checkAndUpdate(supabase, event.userId, 'double-13-specialist', 'counter', 1);
          await checkAndUpdate(supabase, event.userId, 'pain-merchant', 'counter', 1);
          await checkAndUpdate(supabase, event.userId, 'anti-checkout', 'counter', 1);
        }

        if (event.visitScore === 69) {
          await checkAndUpdate(supabase, event.userId, 'nice', 'milestone', 1);
        }
        break;

      case 'CHECKOUT_MADE':
        await checkAndUpdate(supabase, event.userId, 'checked-out', 'milestone', 1);

        if (event.checkoutValue > 100) {
          await checkBestAndUpdate(supabase, event.userId, 'cool-hand', event.checkoutValue);
        }
        if (event.checkoutValue > 120) {
          await checkBestAndUpdate(supabase, event.userId, 'big-finish', event.checkoutValue);
        }
        if (event.checkoutValue > 150) {
          await checkBestAndUpdate(supabase, event.userId, 'clutch-finisher', event.checkoutValue);
        }
        if (event.checkoutValue === 170) {
          await checkBestAndUpdate(supabase, event.userId, '170-club', event.checkoutValue);
        }

        if (event.dartsAtDouble === 1) {
          await checkAndUpdate(supabase, event.userId, 'ice-cold', 'boolean', 1);
        }

        if (event.lastDartType === 'BULL' || event.lastDartType === 'SBULL') {
          await checkAndUpdate(supabase, event.userId, 'out-in-style', 'boolean', 1);
        }
        break;

      case 'MATCH_COMPLETED':
        if (event.matchType === 'ranked') {
          await checkAndUpdate(supabase, event.userId, 'ranked-rookie', 'milestone', 1);
          if (event.won) {
            await checkAndUpdate(supabase, event.userId, 'on-the-ladder', 'counter', 1);
            await checkAndUpdate(supabase, event.userId, 'ranked-grinder', 'counter', 1);
            await checkAndUpdate(supabase, event.userId, 'sweaty-hands', 'counter', 1);
            await checkAndUpdate(supabase, event.userId, 'the-tryhard', 'counter', 1);
          }
        }

        if (event.matchType === 'private') {
          await checkAndUpdate(supabase, event.userId, 'friendly-fire', 'milestone', 1);
        }

        if (event.matchType === 'training') {
          await checkAndUpdate(supabase, event.userId, 'warm-up', 'counter', 1);
          await checkAndUpdate(supabase, event.userId, 'dedicated', 'counter', 1);
          await checkAndUpdate(supabase, event.userId, 'training-arc', 'counter', 1);
        }

        if (event.stats.threeDartAverage >= 60) {
          await checkBestAndUpdate(supabase, event.userId, 'heavy-scorer', event.stats.threeDartAverage);
        }
        if (event.stats.threeDartAverage >= 80) {
          await checkBestAndUpdate(supabase, event.userId, 'serious-business', event.stats.threeDartAverage);
        }
        if (event.stats.threeDartAverage >= 100) {
          await checkBestAndUpdate(supabase, event.userId, 'centurion', event.stats.threeDartAverage);
        }

        if (event.won && event.opponentLegsWon === 0) {
          await checkAndUpdate(supabase, event.userId, 'the-wall', 'boolean', 1);
        }

        if (event.durationMs < 10 * 60 * 1000 && event.won) {
          await checkAndUpdate(supabase, event.userId, 'early-doors', 'boolean', 1);
        }

        if (
          event.won &&
          event.opponentStats &&
          event.stats.threeDartAverage < event.opponentStats.threeDartAverage
        ) {
          await checkAndUpdate(supabase, event.userId, 'pub-thrower', 'boolean', 1);
        }
        break;

      case 'LEAGUE_JOINED':
        await checkAndUpdate(supabase, event.userId, 'joined-ranks', 'milestone', 1);
        break;

      case 'LEAGUE_CREATED':
        await checkAndUpdate(supabase, event.userId, 'the-gaffer', 'milestone', 1);
        break;

      case 'TOURNAMENT_WON':
        await checkAndUpdate(supabase, event.userId, 'champion', 'milestone', 1);
        await checkAndUpdate(supabase, event.userId, 'serial-winner', 'counter', 1);
        await checkAndUpdate(supabase, event.userId, 'trophy-cabinet', 'counter', 1);
        await checkAndUpdate(supabase, event.userId, 'elite-champion', 'counter', 1);
        await checkAndUpdate(supabase, event.userId, 'tournament-monster', 'counter', 1);
        await checkAndUpdate(supabase, event.userId, 'legendary', 'counter', 1);
        break;

      case 'ATC_COMPLETED':
        await checkAndUpdate(supabase, event.userId, 'clock-starter', 'milestone', 1);
        await checkAndUpdate(supabase, event.userId, 'clock-master', 'counter', 1);
        await checkAndUpdate(supabase, event.userId, 'clock-legend', 'counter', 1);

        if (event.durationMs < 5 * 60 * 1000) {
          await checkAndUpdate(supabase, event.userId, 'speed-runner', 'boolean', 1);
        }
        break;
    }

    const newlyUnlocked = await getNewlyUnlocked(supabase, event.userId);
    unlocked.push(...newlyUnlocked);

  } catch (error) {
    console.error('Error evaluating achievement event:', error);
  }

  return unlocked;
}

async function checkAndUpdate(
  supabase: any,
  userId: string,
  achievementCode: string,
  type: 'milestone' | 'counter' | 'boolean',
  increment: number = 1
): Promise<void> {
  const { data: achievement } = await supabase
    .from('achievements')
    .select('code, goal_value')
    .eq('code', achievementCode)
    .maybeSingle();

  if (!achievement) return;

  const { data: existing } = await supabase
    .from('user_achievements')
    .select('*')
    .eq('user_id', userId)
    .eq('achievement_id', achievementCode)
    .maybeSingle();

  if (existing?.completed) return;

  let newProgress = (existing?.progress || 0) + increment;
  const goalValue = achievement.goal_value || 1;
  const isNowCompleted = newProgress >= goalValue;

  if (existing) {
    await supabase
      .from('user_achievements')
      .update({
        progress: newProgress,
        completed: isNowCompleted,
        completed_at: isNowCompleted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('achievement_id', achievementCode);
  } else {
    await supabase
      .from('user_achievements')
      .insert({
        user_id: userId,
        achievement_id: achievementCode,
        progress: newProgress,
        completed: isNowCompleted,
        completed_at: isNowCompleted ? new Date().toISOString() : null,
      });
  }

  if (isNowCompleted && !existing?.completed) {
    unlockedBuffer.push(achievementCode);
  }
}

async function checkBestAndUpdate(
  supabase: any,
  userId: string,
  achievementCode: string,
  value: number
): Promise<void> {
  const { data: achievement } = await supabase
    .from('achievements')
    .select('code, goal_value')
    .eq('code', achievementCode)
    .maybeSingle();

  if (!achievement) return;

  const { data: existing } = await supabase
    .from('user_achievements')
    .select('*')
    .eq('user_id', userId)
    .eq('achievement_id', achievementCode)
    .maybeSingle();

  if (existing?.completed) return;

  const currentBest = existing?.progress || 0;
  if (value <= currentBest) return;

  const goalValue = achievement.goal_value || 1;
  const isNowCompleted = value >= goalValue;

  if (existing) {
    await supabase
      .from('user_achievements')
      .update({
        progress: value,
        completed: isNowCompleted,
        completed_at: isNowCompleted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('achievement_id', achievementCode);
  } else {
    await supabase
      .from('user_achievements')
      .insert({
        user_id: userId,
        achievement_id: achievementCode,
        progress: value,
        completed: isNowCompleted,
        completed_at: isNowCompleted ? new Date().toISOString() : null,
      });
  }

  if (isNowCompleted && !existing?.completed) {
    unlockedBuffer.push(achievementCode);
  }
}

const unlockedBuffer: string[] = [];

async function getNewlyUnlocked(supabase: any, userId: string): Promise<UnlockedAchievement[]> {
  if (unlockedBuffer.length === 0) return [];

  const codes = [...unlockedBuffer];
  unlockedBuffer.length = 0;

  const { data: achievements } = await supabase
    .from('achievements')
    .select('code, name, description, category, icon, xp')
    .in('code', codes);

  if (!achievements) return [];

  return achievements.map((a: any) => ({
    code: a.code,
    name: a.name,
    description: a.description,
    category: a.category,
    icon: a.icon,
    xp: a.xp,
  }));
}
