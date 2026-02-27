'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  validateRoomBeforeNavigation,
  clearStaleMatchState,
  markInviteAsHandled,
  isInviteAlreadyHandled,
  handleStaleRoom,
} from '@/lib/utils/stale-state-cleanup';
import { playInviteNotificationSfx, hasPlayedNotification, markNotificationAsPlayed } from '@/lib/sfx';

interface Notification {
  id: string;
  user_id: string;
  type: 'league_announcement' | 'league_invite' | 'match_reminder' | 'match_invite' | 'tournament_invite' | 'quick_match_ready' | 'achievement' | 'app_update' | 'system' | string;
  title: string;
  message: string;
  link: string | null;
  read: boolean; // Computed from read_at
  read_at: string | null;
  created_at: string;
  reference_id: string | null;
  data?: {
    kind?: string;
    invite_id?: string;
    room_id?: string;
    from_user_id?: string;
    from_username?: string;
    match_options?: any;
    href?: string;
    achievementId?: string;
    achievementName?: string;
    category?: string;
    icon?: string;
    xp?: number;
    [key: string]: any;
  } | null;
  metadata?: {
    achievementId?: string;
    achievementName?: string;
    category?: string;
    icon?: string;
    xp?: number;
    [key: string]: any;
  } | null;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  handleNotificationClick: (notification: Notification) => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

// Get a smart navigation link based on notification type/data
function getNotificationRoute(notification: Notification): string | null {
  // Explicit link takes priority
  const explicitLink = notification.link || notification.data?.href || notification.data?.link;
  if (explicitLink) return explicitLink as string;

  // Route based on type
  switch (notification.type) {
    case 'match_invite':
    case 'quick_match_ready':
      if (notification.data?.room_id) return `/app/play/quick-match/match/${notification.data.room_id}`;
      return '/app/play';
    case 'tournament_invite':
      if (notification.data?.tournament_id || notification.reference_id) 
        return `/app/tournaments/${notification.data?.tournament_id || notification.reference_id}`;
      return '/app/tournaments';
    case 'league_invite':
    case 'league_announcement':
      if (notification.data?.league_id || notification.reference_id)
        return `/app/leagues/${notification.data?.league_id || notification.reference_id}`;
      return '/app/leagues';
    case 'achievement':
      return '/app/stats';
    case 'match_reminder':
      return '/app/play';
    case 'app_update':
      return null; // No navigation
    case 'system':
      if (notification.data?.kind === 'private_match_accepted' && notification.data?.room_id)
        return `/app/play/quick-match/match/${notification.data.room_id}`;
      if (notification.data?.request_id) return '/app/friends?tab=requests';
      if (notification.data?.tournament_id) return `/app/tournaments/${notification.data.tournament_id}`;
      return null;
    default:
      return null;
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();
  const skipRefetchUntilRef = useRef<number>(0); // timestamp - skip refetches until this time

  const fetchNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Map data to compute 'read' from 'read_at'
      const mappedData = (data || []).map(n => ({
        ...n,
        read: n.read_at !== null
      }));

      setNotifications(mappedData);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Define invite notification types
    const inviteTypes = ['invite', 'match_invite', 'private_match_invite', 'league_invite', 'tournament_invite'];

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          console.log('[NOTIFICATIONS] New notification received:', payload);
          const newNotification = payload.new as any;

          // Check if this is an invite notification
          if (
            newNotification &&
            inviteTypes.includes(newNotification.type) &&
            newNotification.read_at === null &&
            !hasPlayedNotification(newNotification.id)
          ) {
            console.log('[NOTIFICATIONS] Playing invite sound for notification:', newNotification.id);
            playInviteNotificationSfx();
            markNotificationAsPlayed(newNotification.id);
          }

          // Refresh notifications list
          fetchNotifications();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
        },
        () => {
          // Skip refetch if we just did an optimistic update (prevents read state reverting)
          if (Date.now() < skipRefetchUntilRef.current) return;
          fetchNotifications();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
        },
        () => {
          fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const markAsRead = async (notificationId: string) => {
    try {
      const now = new Date().toISOString();
      
      // Suppress realtime refetch for 3 seconds to keep optimistic state
      skipRefetchUntilRef.current = Date.now() + 3000;

      // Update local state immediately (optimistic)
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true, read_at: now } : n))
      );
      
      // Persist to DB — include user_id filter for RLS compliance
      const query = supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('id', notificationId);
      
      if (currentUserId) {
        query.eq('user_id', currentUserId);
      }
      
      const { error } = await query;

      if (error) {
        console.error('[NOTIFICATIONS] Error updating read_at:', error);
        // Revert optimistic update on failure
        fetchNotifications();
        throw error;
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const userId = currentUserId || (await supabase.auth.getUser()).data?.user?.id;
      if (!userId) {
        console.error('[NOTIFICATIONS] No user found when marking all as read');
        return;
      }

      const now = new Date().toISOString();
      
      // Suppress realtime refetch for 3 seconds
      skipRefetchUntilRef.current = Date.now() + 3000;

      // Update local state FIRST for instant UI feedback
      setNotifications((prev) => 
        prev.map((n) => ({ 
          ...n, 
          read: true, 
          read_at: n.read_at || now 
        }))
      );

      // Then persist to DB
      const { data, error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('user_id', userId)
        .is('read_at', null)
        .select();

      if (error) {
        console.error('[NOTIFICATIONS] Error marking all as read:', error);
        // Revert on failure — refetch from DB
        fetchNotifications();
        throw error;
      }

      console.log(`[NOTIFICATIONS] Marked ${data?.length || 0} notifications as read`);
    } catch (error) {
      console.error('[NOTIFICATIONS] Error marking all notifications as read:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Get link from explicit fields or smart routing
    const link = getNotificationRoute(notification);
    
    if (link) {
      // Check if this is a match room link
      const matchRoomPattern = /\/app\/(play\/quick-match\/match|ranked\/match|match\/online)\/([a-f0-9-]+)/;
      const match = link.match(matchRoomPattern);

      if (match) {
        const roomId = match[2];

        // Check if already handled
        if (isInviteAlreadyHandled(roomId)) {
          console.warn('[NOTIFICATIONS] Room already handled, skipping navigation');
          await markAsRead(notification.id);
          return;
        }

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error('[NOTIFICATIONS] No user found');
          router.push('/login');
          return;
        }

        // Validate room before navigation
        const validation = await validateRoomBeforeNavigation(roomId, user.id);

        if (!validation.valid) {
          console.error('[NOTIFICATIONS] Room validation failed:', validation.reason);

          // Handle stale room: mark notification as read, expire invite, clear storage
          await handleStaleRoom(roomId, notification.id);

          // Don't navigate
          router.push('/app/play');
          return;
        }

        // Mark as handled
        markInviteAsHandled(roomId);
      }

      // Mark as read before navigation
      await markAsRead(notification.id);
      router.push(link);
    } else {
      // If there's no link, just mark as read
      await markAsRead(notification.id);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        handleNotificationClick,
        refreshNotifications: fetchNotifications,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
}