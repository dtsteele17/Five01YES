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
    e.preventDefault();

    if (!notification.data?.invite_id) {
      console.error('[INVITE] No invite_id in notification data');
      toast.error('Invalid invite notification');
      return;
    }

    console.debug('[INVITE] Accepting invite:', notification.data.invite_id);
    setProcessingInvite(notification.id);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please log in to accept invite');
        router.push('/login');
        return;
      }

      // Get the invite details
      const { data: invite, error: inviteError } = await supabase
        .from('private_match_invites')
        .select('*')
        .eq('id', notification.data.invite_id)
        .single();

      if (inviteError) throw inviteError;

      // Verify this invite is for current user
      if (invite.to_user_id !== user.id) {
        toast.error('This invite is not for you');
        return;
      }

      if (invite.status !== 'pending') {
        toast.info('This invite is no longer available');
        refreshNotifications();
        return;
      }

      console.debug('[INVITE] Fetched invite details:', {
        id: invite.id,
        room_id: invite.room_id,
        status: invite.status,
      });

      // Update invite status to accepted
      const { error: updateError } = await supabase
        .from('private_match_invites')
        .update({
          status: 'accepted',
          responded_at: new Date().toISOString(),
        })
        .eq('id', notification.data.invite_id);

      if (updateError) throw updateError;
      console.debug('[INVITE] Updated invite status to accepted');

      // Check if match_room already exists
      const { data: existingRoom } = await supabase
        .from('match_rooms')
        .select('id, status')
        .eq('id', invite.room_id)
        .maybeSingle();

      if (existingRoom) {
        // Match room exists, update status to active if it's still open
        if (existingRoom.status === 'open') {
          console.debug('[INVITE] Activating match room from open state');
          const { error: activateError } = await supabase
            .from('match_rooms')
            .update({ status: 'active' })
            .eq('id', invite.room_id);

          if (activateError) {
            console.error('[INVITE] Error activating match room:', activateError);
          }
        }
      } else {
        // Fallback: create match_room if it doesn't exist
        console.debug('[INVITE] Creating new match_room (fallback)');
        const options = invite.options as any;
        const bestOf = options.bestOf || 1;
        const legsToWin = Math.ceil(bestOf / 2);
        const matchFormat = `best-of-${bestOf}`;

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
      }

      toast.success('Joining match!');
      refreshNotifications();

      // Navigate to match
      console.debug('[INVITE] Navigating to match:', invite.room_id);
      router.push(`/app/play/quick-match/match/${invite.room_id}`);
    } catch (err) {
      console.error('[INVITE] Error accepting invite:', err);
      toast.error('Failed to accept invite');
    } finally {
      setProcessingInvite(null);
    }
  };

  const handleDeclineInvite = async (notification: any, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    if (!notification.data?.invite_id) {
      console.error('[INVITE] No invite_id in notification data');
      toast.error('Invalid invite notification');
      return;
    }

    console.debug('[INVITE] Declining invite:', notification.data.invite_id);
    setProcessingInvite(notification.id);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please log in');
        return;
      }

      // Update invite status to declined
      const { error } = await supabase
        .from('private_match_invites')
        .update({
          status: 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', notification.data.invite_id)
        .eq('to_user_id', user.id);

      if (error) throw error;
      console.debug('[INVITE] Invite declined successfully');

      toast.info('Invite declined');
      refreshNotifications();
    } catch (err) {
      console.error('[INVITE] Error declining invite:', err);
      toast.error('Failed to decline invite');
    } finally {
      setProcessingInvite(null);
    }
  };

  const isPrivateMatchInvite = (notification: any) => {
    return notification.type === 'match_invite' && notification.data?.kind === 'private_match_invite';
  };

  // Deduplicate notifications by invite_id to avoid showing multiple notifications for the same invite
  const deduplicatedNotifications = notifications.filter((notification, index, self) => {
    // If it's a private match invite, check for duplicates by invite_id
    if (isPrivateMatchInvite(notification) && notification.data?.invite_id) {
      const inviteId = notification.data.invite_id;
      // Keep only the first occurrence of each invite_id
      return index === self.findIndex((n) =>
        isPrivateMatchInvite(n) && n.data?.invite_id === inviteId
      );
    }
    // For non-invite notifications, keep all
    return true;
  });

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

        {deduplicatedNotifications.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <Bell className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No Notifications at this moment</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[320px]">
            <div className="py-2">
              {deduplicatedNotifications.map((notification) => {
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
