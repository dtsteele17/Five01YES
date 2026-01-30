import { createClient } from '@/lib/supabase/client';

export type NotificationType = 'league_announcement' | 'match_reminder' | 'achievement' | 'app_update';

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  referenceId?: string;
}

export async function createNotification({
  userId,
  type,
  title,
  message,
  link,
  referenceId,
}: CreateNotificationParams) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      message,
      link: link || null,
      reference_id: referenceId || null,
      read: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating notification:', error);
    throw error;
  }

  return data;
}

export async function createLeagueAnnouncement(
  userId: string,
  leagueId: string,
  leagueName: string,
  announcement: string
) {
  return createNotification({
    userId,
    type: 'league_announcement',
    title: `New announcement in ${leagueName}`,
    message: announcement,
    link: `/app/leagues/${leagueId}`,
    referenceId: leagueId,
  });
}

export async function createMatchReminder(
  userId: string,
  opponentName: string,
  matchId: string,
  matchType: 'league' | 'tournament'
) {
  const link = matchType === 'league' ? `/app/leagues` : `/app/tournaments`;

  return createNotification({
    userId,
    type: 'match_reminder',
    title: 'Match starts soon',
    message: `Your match vs ${opponentName} starts in 30 minutes.`,
    link,
    referenceId: matchId,
  });
}

export async function createAchievementNotification(
  userId: string,
  achievementName: string
) {
  return createNotification({
    userId,
    type: 'achievement',
    title: 'Achievement unlocked',
    message: `You earned: ${achievementName}`,
    link: '/app/achievements',
  });
}

export async function createAppUpdateNotification(
  userId: string,
  updateTitle: string,
  updateMessage: string
) {
  return createNotification({
    userId,
    type: 'app_update',
    title: updateTitle,
    message: updateMessage,
    link: '/app',
  });
}
