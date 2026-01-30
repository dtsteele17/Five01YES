'use client';

import { useNotifications } from '@/lib/context/NotificationsContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Users, Trophy, Award, Megaphone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NotificationDropdownProps {
  children: React.ReactNode;
}

export function NotificationDropdown({ children }: NotificationDropdownProps) {
  const { notifications, unreadCount, markAllAsRead, handleNotificationClick } = useNotifications();

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'league_announcement':
        return <Users className="w-4 h-4 text-emerald-400" />;
      case 'league_invite':
        return <Users className="w-4 h-4 text-purple-400" />;
      case 'match_reminder':
        return <Trophy className="w-4 h-4 text-amber-400" />;
      case 'match_invite':
        return <Trophy className="w-4 h-4 text-purple-400" />;
      case 'tournament_invite':
        return <Award className="w-4 h-4 text-purple-400" />;
      case 'quick_match_ready':
        return <Trophy className="w-4 h-4 text-emerald-400" />;
      case 'achievement':
        return <Award className="w-4 h-4 text-amber-400" />;
      case 'app_update':
        return <Megaphone className="w-4 h-4 text-blue-400" />;
      default:
        return <Bell className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

      if (diffInMinutes < 60) {
        return `${diffInMinutes}m ago`;
      } else if (diffInMinutes < 1440) {
        const hours = Math.floor(diffInMinutes / 60);
        return `${hours}h ago`;
      } else {
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      }
    } catch (error) {
      return '';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-96 bg-slate-900/95 backdrop-blur-xl border-white/10 rounded-xl shadow-2xl p-0"
      >
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 text-xs h-auto py-1 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  markAllAsRead();
                }}
              >
                Mark all as read
              </Button>
            )}
          </div>
        </div>

        {notifications.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <Bell className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No Notifications at this moment</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[320px]">
            <div className="py-2">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className="w-full px-4 py-3 hover:bg-white/5 transition-colors text-left flex items-start space-x-3 group"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                        {notification.title}
                      </p>
                      {!notification.read && (
                        <div className="w-2 h-2 bg-emerald-400 rounded-full flex-shrink-0 mt-1.5" />
                      )}
                    </div>

                    <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">
                      {notification.message}
                    </p>

                    <p className="text-xs text-gray-500 mt-1">
                      {formatTimestamp(notification.created_at)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
