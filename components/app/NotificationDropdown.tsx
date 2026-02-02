'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/lib/context/NotificationsContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Users, Trophy, Award, Megaphone, Check, X, UserPlus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

const DEBUG_INVITES = true;

interface NotificationDropdownProps {
  children: React.ReactNode;
}

export function NotificationDropdown({ children }: NotificationDropdownProps) {
  const router = useRouter();
  const supabase = createClient();
  const { notifications, unreadCount, markAllAsRead, markAsRead, handleNotificationClick, refreshNotifications } = useNotifications();
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState<any>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleAcceptInvite = async (notification: any, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (!notification.data?.invite_id) {
      console.error('[INVITE] No invite_id in notification data');
      toast.error('Invalid invite notification');
      return;
    }

    const inviteId = notification.data.invite_id;
    if (DEBUG_INVITES) console.log('[INVITE] Join clicked', inviteId);

    setProcessingInvite(notification.id);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setProcessingInvite(null);
        toast.error('Please log in to accept invite');
        router.push('/login');
        return;
      }

      // Call RPC function to accept invite
      if (DEBUG_INVITES) console.log('[INVITE] Calling rpc_accept_private_match_invite', inviteId);

      const { data, error: rpcError } = await supabase.rpc('rpc_accept_private_match_invite', {
        p_invite_id: inviteId
      });

      if (DEBUG_INVITES) console.log('[INVITE] RPC response:', data);

      // Handle RPC error
      if (rpcError) {
        console.error('[INVITE] RPC error:', {
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint,
          code: rpcError.code
        });
        toast.error("Couldn't join invite. Please try again.");
        setProcessingInvite(null);
        return;
      }

      // Validate response structure
      if (!data || typeof data !== 'object') {
        console.error('[INVITE] Invalid response format:', data);
        toast.error("Couldn't join invite. Please try again.");
        setProcessingInvite(null);
        return;
      }

      // Check for logical errors in result
      if (data.ok === false) {
        const errorMsg = data.error || 'Unknown error';
        console.error('[INVITE] RPC returned error:', errorMsg);
        toast.error("Couldn't join invite. Please try again.");
        setProcessingInvite(null);
        return;
      }

      // Extract room_id
      const roomId = data.room_id;
      const gameMode = data.game_mode;
      const matchFormat = data.match_format;

      if (!roomId) {
        console.error('[INVITE] No room_id in response:', data);
        toast.error("Couldn't join invite. Please try again.");
        setProcessingInvite(null);
        return;
      }

      if (DEBUG_INVITES) {
        console.log('[INVITE] ========== JOINING PRIVATE MATCH ==========');
        console.log('[INVITE] room_id:', roomId);
        console.log('[INVITE] game_mode:', gameMode);
        console.log('[INVITE] match_format:', matchFormat);
        console.log('[INVITE] user:', user.id);
      }

      // Mark notification as read
      await markAsRead(notification.id);
      refreshNotifications();

      // Close dropdown and modal
      setDropdownOpen(false);
      setInviteModalOpen(false);
      setSelectedInvite(null);

      toast.success('Joining match!');

      // Navigate to match using room_id
      if (DEBUG_INVITES) console.log('[INVITE] Navigating to /app/play/quick-match/match/' + roomId);
      router.push(`/app/play/quick-match/match/${roomId}`);
    } catch (err: any) {
      console.error('[INVITE] Exception accepting invite:', {
        message: err?.message,
        stack: err?.stack,
        error: err
      });
      toast.error("Couldn't join invite. Please try again.");
      setProcessingInvite(null);
    }
  };

  const handleDeclineInvite = async (notification: any, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (!notification.data?.invite_id) {
      if (DEBUG_INVITES) console.error('[INVITE] No invite_id in notification data');
      toast.error('Invalid invite notification');
      return;
    }

    const inviteId = notification.data.invite_id;
    if (DEBUG_INVITES) console.log('[INVITE] Decline clicked', inviteId);

    setProcessingInvite(notification.id);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setProcessingInvite(null);
        toast.error('Please log in');
        return;
      }

      // Call RPC function to decline invite
      if (DEBUG_INVITES) console.log('[INVITE] Calling rpc_decline_private_match_invite', inviteId);

      const { error: rpcError } = await supabase.rpc('rpc_decline_private_match_invite', {
        p_invite_id: inviteId
      });

      if (rpcError) {
        console.error('[INVITE] RPC error:', {
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint,
          code: rpcError.code
        });
        toast.error("Couldn't decline invite. Try again.");
        setProcessingInvite(null);
        return;
      }

      if (DEBUG_INVITES) console.log('[INVITE] Invite declined successfully');

      // Mark notification as read
      await markAsRead(notification.id);
      refreshNotifications();

      toast.success('Invite declined');

      // Close invite modal if open
      setInviteModalOpen(false);
      setSelectedInvite(null);
      setProcessingInvite(null);
    } catch (err: any) {
      console.error('[INVITE] Exception declining invite:', {
        message: err?.message,
        stack: err?.stack,
        error: err
      });
      toast.error("Couldn't decline invite. Try again.");
      setProcessingInvite(null);
    }
  };

  const isPrivateMatchInvite = (notification: any) => {
    return notification.type === 'match_invite' && notification.data?.kind === 'private_match_invite';
  };

  const isPrivateMatchAccepted = (notification: any) => {
    return notification.type === 'system' && notification.data?.kind === 'private_match_accepted';
  };

  // Listen for invite acceptances (inviter side)
  useEffect(() => {
    if (!supabase) return;

    const handleAcceptedNotification = async (notification: any) => {
      if (!isPrivateMatchAccepted(notification)) return;

      const roomId = notification.data?.room_id;
      const gameMode = notification.data?.game_mode;
      const matchFormat = notification.data?.match_format;

      if (!roomId) {
        console.error('[INVITE] Accepted notification missing room_id:', notification);
        return;
      }

      if (DEBUG_INVITES) {
        console.log('[INVITE] ========== INVITE ACCEPTED (INVITER SIDE) ==========');
        console.log('[INVITE] room_id:', roomId);
        console.log('[INVITE] game_mode:', gameMode);
        console.log('[INVITE] match_format:', matchFormat);
      }

      // Mark as read
      await markAsRead(notification.id);

      // Show toast
      toast.success('Your invite was accepted! Joining match...');

      // Navigate to match
      if (DEBUG_INVITES) console.log('[INVITE] Navigating to /app/play/quick-match/match/' + roomId);
      router.push(`/app/play/quick-match/match/${roomId}`);
    };

    // Check existing notifications for accepted invites
    notifications.forEach(notification => {
      if (isPrivateMatchAccepted(notification) && !notification.read) {
        handleAcceptedNotification(notification);
      }
    });
  }, [notifications, supabase, router, markAsRead]);

  // Deduplicate notifications by invite_id, keeping the newest by created_at
  const deduplicatedNotifications = notifications.filter((notification, index, self) => {
    // If it's a private match invite, check for duplicates by invite_id
    if (isPrivateMatchInvite(notification) && notification.data?.invite_id) {
      const inviteId = notification.data.invite_id;
      // Find all notifications with same invite_id
      const duplicates = self.filter((n) =>
        isPrivateMatchInvite(n) && n.data?.invite_id === inviteId
      );
      // If there are duplicates, keep only the newest (most recent created_at)
      if (duplicates.length > 1) {
        const newest = duplicates.reduce((prev, current) =>
          new Date(current.created_at) > new Date(prev.created_at) ? current : prev
        );
        return notification.id === newest.id;
      }
      return true;
    }
    // For non-invite notifications, keep all
    return true;
  });

  // Cleanup when modal closes
  const handleModalClose = (open: boolean) => {
    setInviteModalOpen(open);
    if (!open) {
      setProcessingInvite(null);
      setSelectedInvite(null);
    }
  };

  const handleInviteClick = async (notification: any) => {
    if (!isPrivateMatchInvite(notification)) {
      handleNotificationClick(notification);
      return;
    }

    // For private match invites, check if still pending
    const inviteId = notification.data?.invite_id;
    if (!inviteId) {
      toast.error('Invalid invite');
      return;
    }

    try {
      const { data: invite, error } = await supabase
        .from('private_match_invites')
        .select('status, from_user_id, options')
        .eq('id', inviteId)
        .maybeSingle();

      if (error || !invite) {
        toast.info('Invite not found');
        refreshNotifications();
        return;
      }

      if (invite.status !== 'pending') {
        toast.info('Invite expired');
        await markAsRead(notification.id);
        refreshNotifications();
        return;
      }

      // Get sender username
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', invite.from_user_id)
        .maybeSingle();

      // Open modal with invite details
      setSelectedInvite({
        ...notification,
        senderName: profile?.username || 'Unknown',
        options: invite.options,
      });
      setInviteModalOpen(true);
    } catch (err) {
      if (DEBUG_INVITES) console.error('[INVITE] Error checking invite:', err);
      toast.error('Failed to load invite');
    }
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
    <>
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
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
                      onClick={() => handleInviteClick(notification)}
                      className="w-full text-left flex items-start space-x-3 group"
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
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                            >
                              {processingInvite === notification.id ? (
                                <>
                                  <div className="w-3 h-3 mr-1 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  Joining...
                                </>
                              ) : (
                                <>
                                  <Check className="w-3 h-3 mr-1" />
                                  Join
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => handleDeclineInvite(notification, e)}
                              disabled={processingInvite === notification.id}
                              className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
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

    {/* Invite Modal */}
    <Dialog open={inviteModalOpen} onOpenChange={handleModalClose}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <UserPlus className="w-6 h-6 text-emerald-400" />
            Private Match Invite
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {selectedInvite?.senderName} has invited you to a private match
          </DialogDescription>
        </DialogHeader>

        {selectedInvite && (
          <div className="space-y-4 py-4">
            <div className="bg-white/5 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Game Mode:</span>
                <span className="text-white font-semibold">
                  {selectedInvite.options?.gameMode || '501'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Format:</span>
                <span className="text-white font-semibold">
                  Best of {selectedInvite.options?.bestOf || 3}
                </span>
              </div>
              {selectedInvite.options?.doubleOut !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Double Out:</span>
                  <span className="text-white font-semibold">
                    {selectedInvite.options.doubleOut ? 'Yes' : 'No'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => handleAcceptInvite(selectedInvite)}
                disabled={processingInvite === selectedInvite.id}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-12 disabled:opacity-50"
              >
                {processingInvite === selectedInvite.id ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Join
                  </>
                )}
              </Button>
              <Button
                onClick={() => handleDeclineInvite(selectedInvite)}
                disabled={processingInvite === selectedInvite.id}
                variant="outline"
                className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 h-12 disabled:opacity-50"
              >
                <X className="w-4 h-4 mr-2" />
                Not right now
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
