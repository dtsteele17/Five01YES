'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/lib/context/NotificationsContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Users, Trophy, Award, Megaphone, Check, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface NotificationDropdownProps {
  children: React.ReactNode;
}

export function NotificationDropdown({ children }: NotificationDropdownProps) {
  const router = useRouter();
  const supabase = createClient();
  const { notifications, unreadCount, markAllAsRead, handleNotificationClick, refreshNotifications } = useNotifications();
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);

  const handleAcceptInvite = async (notification: any, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!notification.data?.invite_id) return;

    console.debug('[INVITE] Accepting invite from notification:', notification.data.invite_id);
    setProcessingInvite(notification.id);

    try {
      // Get the invite details
      const { data: invite, error: inviteError } = await supabase
        .from('private_match_invites')
        .select('*')
        .eq('id', notification.data.invite_id)
        .single();

      if (inviteError) throw inviteError;
      console.debug('[INVITE] Fetched invite details:', invite);

      // Update invite status
      const { error: updateError } = await supabase
        .from('private_match_invites')
        .update({ status: 'accepted' })
        .eq('id', notification.data.invite_id);

      if (updateError) throw updateError;
      console.debug('[INVITE] Updated invite status to accepted');

      // Create match_room
      const options = invite.options as any;
      const bestOf = options.bestOf || 1;
      const legsToWin = Math.ceil(bestOf / 2);
      const matchFormat = `best-of-${bestOf}`;

      console.debug('[INVITE] Creating/checking match room with options:', {
        room_id: invite.room_id,
        gameMode: options.gameMode,
        bestOf,
        legsToWin,
      });

      // Check if match_room already exists
      const { data: existingRoom } = await supabase
        .from('match_rooms')
        .select('id')
        .eq('id', invite.room_id)
        .maybeSingle();

      if (!existingRoom) {
        console.debug('[INVITE] Creating new match_room');
        const { error: roomError } = await supabase
          .from('match_rooms')
          .insert({
            id: invite.room_id,
            player1_id: invite.from_user_id,
            player2_id: invite.to_user_id,
            game_mode: options.gameMode,
            match_format: matchFormat,
            legs_to_win: legsToWin,
            player1_remaining: options.gameMode,
            player2_remaining: options.gameMode,
            current_turn: invite.from_user_id,
            status: 'active',
            match_type: 'private',
            source: 'private',
          });

        if (roomError) {
          console.error('[INVITE] Error creating match room:', roomError);
          throw roomError;
        }
        console.debug('[INVITE] Match room created successfully');
      } else {
        console.debug('[INVITE] Match room already exists');
      }

      toast.success('Joining match!');
      console.debug('[INVITE] Navigating to match:', invite.room_id);
      // Navigate to quick match route with room_id
      router.push(`/app/play/quick-match/match/${invite.room_id}`);
      refreshNotifications();
    } catch (err) {
      console.error('Error accepting invite:', err);
      toast.error('Failed to accept invite');
    } finally {
      setProcessingInvite(null);
    }
  };

  const handleDeclineInvite = async (notification: any, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!notification.data?.invite_id) return;

    console.debug('[INVITE] Declining invite from notification:', notification.data.invite_id);
    setProcessingInvite(notification.id);

    try {
      const { error } = await supabase
        .from('private_match_invites')
        .update({ status: 'declined' })
        .eq('id', notification.data.invite_id);

      if (error) throw error;
      console.debug('[INVITE] Invite declined successfully');

      toast.info('Invite declined');
      refreshNotifications();
    } catch (err) {
      console.error('Error declining invite:', err);
      toast.error('Failed to decline invite');
    } finally {
      setProcessingInvite(null);
    }
  };

  const isPrivateMatchInvite = (notification: any) => {
    return notification.title === 'Private Match Invite' || notification.data?.invite_id;
  };

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
              {notifications.map((notification) => {
                const isInvite = isPrivateMatchInvite(notification);

                return (
                  <div
                    key={notification.id}
                    className="w-full px-4 py-3 hover:bg-white/5 transition-colors"
                  >
                    <button
                      onClick={() => !isInvite && handleNotificationClick(notification)}
                      className="w-full text-left flex items-start space-x-3 group"
                      disabled={isInvite}
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

                        {isInvite && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={(e) => handleAcceptInvite(notification, e)}
                              disabled={processingInvite === notification.id}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Join
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => handleDeclineInvite(notification, e)}
                              disabled={processingInvite === notification.id}
                              className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                            >
                              <X className="w-3 h-3 mr-1" />
                              Not right now
                            </Button>
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
