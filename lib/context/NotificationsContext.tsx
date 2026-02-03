'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  validateRoomBeforeNavigation,
  clearStaleMatchState,
  markInviteAsHandled,
  isInviteAlreadyHandled,
  handleStaleRoom,
} from '@/lib/utils/stale-state-cleanup';

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

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  const fetchNotifications = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

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

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
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
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true, read_at: now } : n))
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date().toISOString();
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('user_id', user.id)
        .is('read_at', null);

      if (error) throw error;

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, read_at: n.read_at || now })));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (notification.link) {
      // Check if this is a match room link
      const matchRoomPattern = /\/app\/(play\/quick-match\/match|ranked\/match|match\/online)\/([a-f0-9-]+)/;
      const match = notification.link.match(matchRoomPattern);

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
      router.push(notification.link);
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
