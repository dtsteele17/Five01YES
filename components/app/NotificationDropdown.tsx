'use client';

import { useState, useEffect, useRef } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, Users, Trophy, Award, Megaphone, Check, X, UserPlus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  validateRoomBeforeNavigation,
  clearStaleMatchState,
  markInviteAsHandled,
  isInviteAlreadyHandled,
  handleStaleRoom,
} from '@/lib/utils/stale-state-cleanup';
import { SafetyRatingDisplay } from '@/components/safety/SafetyRatingDisplay';

const DEBUG_INVITES = true;
const DEBUG_FRIENDS = true;

interface NotificationDropdownProps {
  children: React.ReactNode;
}

export function NotificationDropdown({ children }: NotificationDropdownProps) {
  const router = useRouter();
  const supabase = createClient();
  const { notifications, unreadCount, markAllAsRead, markAsRead, handleNotificationClick, refreshNotifications } = useNotifications();
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const [processingFriendRequest, setProcessingFriendRequest] = useState<string | null>(null);
  const [markingAllAsRead, setMarkingAllAsRead] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState<any>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const staleRoomIdsRef = useRef<Set<string>>(new Set());
  const processingRoomsRef = useRef<Set<string>>(new Set());

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

      // Check if this invite has already been handled to prevent duplicates
      if (isInviteAlreadyHandled(roomId)) {
        console.warn('[INVITE] This invite was already handled, skipping navigation');
        setProcessingInvite(null);
        return;
      }

      // Validate room before navigation
      const validation = await validateRoomBeforeNavigation(roomId, user.id);

      if (!validation.valid) {
        console.error('[INVITE] Room validation failed:', validation.reason);
        toast.error(`Cannot join match: ${validation.reason}`);
        await clearStaleMatchState();
        setProcessingInvite(null);
        router.push('/app/play');
        return;
      }

      // Mark this invite as handled
      markInviteAsHandled(roomId);

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

  const isFriendRequest = (notification: any) => {
    // Check for pending friend request notifications (only show buttons on actual requests, not confirmations)
    const title = notification.title?.toLowerCase() || '';
    const isPendingRequest = title.startsWith('friend request') && 
      !title.includes('accepted') && 
      !title.includes('declined');
    
    return (
      (notification.type === 'system' && notification.data?.request_id && isPendingRequest) ||
      isPendingRequest
    );
  };

  const handleAcceptFriendRequest = async (notification: any, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const requestId = notification.data?.request_id;
    if (!requestId) {
      if (DEBUG_FRIENDS) console.error('[FRIEND] No request_id in notification data');
      toast.error('Invalid friend request');
      return;
    }

    if (DEBUG_FRIENDS) console.log('[FRIEND] Accept clicked', requestId);
    setProcessingFriendRequest(notification.id);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setProcessingFriendRequest(null);
        toast.error('Please log in');
        return;
      }

      // Call RPC function to accept friend request
      if (DEBUG_FRIENDS) console.log('[FRIEND] Calling rpc_accept_friend_request', requestId);

      const { data, error: rpcError } = await supabase.rpc('rpc_accept_friend_request', {
        p_request_id: requestId
      });

      if (DEBUG_FRIENDS) console.log('[FRIEND] RPC response:', data);

      if (rpcError) {
        console.error('[FRIEND] RPC error:', rpcError);
        toast.error("Couldn't accept friend request. Try again.");
        setProcessingFriendRequest(null);
        return;
      }

      if (data && !data.success) {
        toast.error(data.error || "Couldn't accept friend request");
        setProcessingFriendRequest(null);
        return;
      }

      if (DEBUG_FRIENDS) console.log('[FRIEND] Friend request accepted successfully');

      // Mark notification as read
      await markAsRead(notification.id);
      refreshNotifications();

      toast.success('Friend request accepted!');

      // Navigate to friends page
      setDropdownOpen(false);
      router.push('/app/friends');
      setProcessingFriendRequest(null);
    } catch (err: any) {
      console.error('[FRIEND] Exception accepting request:', err);
      toast.error("Couldn't accept friend request. Try again.");
      setProcessingFriendRequest(null);
    }
  };

  const handleDeclineFriendRequest = async (notification: any, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    const requestId = notification.data?.request_id;
    if (!requestId) {
      if (DEBUG_FRIENDS) console.error('[FRIEND] No request_id in notification data');
      toast.error('Invalid friend request');
      return;
    }

    if (DEBUG_FRIENDS) console.log('[FRIEND] Decline clicked', requestId);
    setProcessingFriendRequest(notification.id);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setProcessingFriendRequest(null);
        toast.error('Please log in');
        return;
      }

      // Directly update the friend request status to declined
      if (DEBUG_FRIENDS) console.log('[FRIEND] Updating friend request status to declined', requestId);

      const { error: updateError } = await supabase
        .from('friend_requests')
        .update({ status: 'declined', responded_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('to_user_id', user.id)
        .eq('status', 'pending');

      if (updateError) {
        console.error('[FRIEND] Update error:', updateError);
        toast.error("Couldn't decline friend request. Try again.");
        setProcessingFriendRequest(null);
        return;
      }

      if (DEBUG_FRIENDS) console.log('[FRIEND] Friend request declined successfully');

      // Mark notification as read
      await markAsRead(notification.id);
      refreshNotifications();

      toast.success('Friend request declined');
      setProcessingFriendRequest(null);
    } catch (err: any) {
      console.error('[FRIEND] Exception declining request:', err);
      toast.error("Couldn't decline friend request. Try again.");
      setProcessingFriendRequest(null);
    }
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

      // Check if room is already known to be stale
      if (staleRoomIdsRef.current.has(roomId)) {
        console.warn('[INVITE] Room is in stale list, skipping:', roomId);
        return;
      }

      // Check if already being processed
      if (processingRoomsRef.current.has(roomId)) {
        console.warn('[INVITE] Room is already being processed, skipping:', roomId);
        return;
      }

      // Check if already handled
      if (isInviteAlreadyHandled(roomId)) {
        console.warn('[INVITE] Accepted notification already handled, skipping');
        return;
      }

      // Mark as being processed
      processingRoomsRef.current.add(roomId);

      try {
        if (DEBUG_INVITES) {
          console.log('[INVITE] ========== INVITE ACCEPTED (INVITER SIDE) ==========');
          console.log('[INVITE] room_id:', roomId);
          console.log('[INVITE] game_mode:', gameMode);
          console.log('[INVITE] match_format:', matchFormat);
        }

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.error('[INVITE] No user found for accepted notification');
          processingRoomsRef.current.delete(roomId);
          return;
        }

        // Validate room before navigation
        const validation = await validateRoomBeforeNavigation(roomId, user.id);

        if (!validation.valid) {
          console.error('[INVITE] Room validation failed for accepted notification:', validation.reason);

          // Handle stale room: mark notification as read, expire invite, clear storage
          await handleStaleRoom(roomId, notification.id);

          // Add to stale list to prevent future attempts
          staleRoomIdsRef.current.add(roomId);
          processingRoomsRef.current.delete(roomId);

          toast.error('Match room is no longer available');
          return;
        }

        // Mark notification as read
        await markAsRead(notification.id);

        // Mark as handled
        markInviteAsHandled(roomId);

        // Show toast
        toast.success('Your invite was accepted! Joining match...');

        // Navigate to match
        if (DEBUG_INVITES) console.log('[INVITE] Navigating to /app/play/quick-match/match/' + roomId);
        router.push(`/app/play/quick-match/match/${roomId}`);
      } catch (error) {
        console.error('[INVITE] Error handling accepted notification:', error);
        processingRoomsRef.current.delete(roomId);
      }
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

      // Get sender username and safety rating
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, safety_rating_letter, safety_rating_count')
        .eq('id', invite.from_user_id)
        .maybeSingle();

      // Open modal with invite details including trust rating
      setSelectedInvite({
        ...notification,
        senderName: profile?.username || 'Unknown',
        senderId: invite.from_user_id,
        options: invite.options,
        senderSafetyRating: {
          letter: profile?.safety_rating_letter || null,
          count: profile?.safety_rating_count || 0,
        },
      });
      setInviteModalOpen(true);
    } catch (err) {
      if (DEBUG_INVITES) console.error('[INVITE] Error checking invite:', err);
      toast.error('Failed to load invite');
    }
  };

  const getNotificationIcon = (type: string, notification?: any) => {
    // Check for friend request first
    if (notification && isFriendRequest(notification)) {
      return <UserPlus className="w-4 h-4 text-blue-400" />;
    }
    
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
      case 'system':
        return <Bell className="w-4 h-4 text-gray-400" />;
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
        className="w-96 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-0 overflow-hidden"
      >
        {/* Header - Dashboard/Play Page Style */}
        <div className="p-4 border-b border-slate-700/50 bg-slate-800/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-emerald-400" />
              <h3 className="text-lg font-bold text-white">Notifications</h3>
              {unreadCount > 0 && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                  {unreadCount}
                </Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={markingAllAsRead}
                className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 text-xs h-auto py-1.5 px-3 rounded-lg disabled:opacity-50"
                onClick={async (e) => {
                  e.stopPropagation();
                  setMarkingAllAsRead(true);
                  try {
                    await markAllAsRead();
                    toast.success('All notifications marked as read');
                  } catch (err) {
                    toast.error('Failed to mark notifications as read');
                  } finally {
                    setMarkingAllAsRead(false);
                  }
                }}
              >
                {markingAllAsRead ? 'Marking...' : 'Mark all as read'}
              </Button>
            )}
          </div>
        </div>

        {deduplicatedNotifications.length === 0 ? (
          <div className="py-16 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-slate-400 text-sm">No notifications at this moment</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[320px]">
            <div className="py-2">
              {deduplicatedNotifications.map((notification) => {
                const isInvite = isPrivateMatchInvite(notification);
                const isFriendReq = isFriendRequest(notification);
                const link = notification.link || notification.data?.href || notification.data?.link;

                return (
                  <div
                    key={notification.id}
                    className="w-full px-4 py-3 hover:bg-white/5 transition-colors border-b border-slate-800/50 last:border-0"
                  >
                    <button
                      onClick={() => {
                        if (isFriendReq) {
                          // Navigate to friends page requests tab for friend requests
                          setDropdownOpen(false);
                          markAsRead(notification.id);
                          router.push('/app/friends?tab=requests');
                        } else {
                          handleInviteClick(notification);
                        }
                      }}
                      className="w-full text-left flex items-start space-x-3 group"
                    >
                      <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                        {getNotificationIcon(notification.type, notification)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-emerald-400 rounded-full flex-shrink-0 mt-1.5 animate-pulse" />
                          )}
                        </div>

                        <p className="text-sm text-slate-400 mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>

                        <p className="text-xs text-slate-500 mt-1">
                          {formatTimestamp(notification.created_at)}
                        </p>

                        {/* Match Invite Buttons */}
                        {isInvite && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={(e) => handleAcceptInvite(notification, e)}
                              disabled={processingInvite === notification.id}
                              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white disabled:opacity-50 rounded-lg"
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
                              className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 rounded-lg"
                            >
                              <X className="w-3 h-3 mr-1" />
                              Decline
                            </Button>
                          </div>
                        )}

                        {/* Friend Request Buttons */}
                        {isFriendReq && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm"
                              onClick={(e) => handleAcceptFriendRequest(notification, e)}
                              disabled={processingFriendRequest === notification.id}
                              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white disabled:opacity-50 rounded-lg"
                            >
                              {processingFriendRequest === notification.id ? (
                                <>
                                  <div className="w-3 h-3 mr-1 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  Accepting...
                                </>
                              ) : (
                                <>
                                  <Check className="w-3 h-3 mr-1" />
                                  Accept
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => handleDeclineFriendRequest(notification, e)}
                              disabled={processingFriendRequest === notification.id}
                              className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 rounded-lg"
                            >
                              <X className="w-3 h-3 mr-1" />
                              Decline
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

    {/* Invite Modal - Dashboard Style */}
    <Dialog open={inviteModalOpen} onOpenChange={handleModalClose}>
      <DialogContent className="bg-slate-900 border border-slate-700/50 text-white max-w-md rounded-2xl shadow-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-white">
                Private Match Invite
              </DialogTitle>
              <DialogDescription className="text-slate-400 text-sm">
                {selectedInvite?.senderName} has invited you to a private match
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {selectedInvite && (
          <div className="space-y-4 py-4">
            <div className="bg-slate-800/50 rounded-xl p-4 space-y-3 border border-slate-700/50">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Game Mode:</span>
                <Badge className="bg-slate-700 text-white border-slate-600">
                  {selectedInvite.options?.gameMode || '501'}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Format:</span>
                <Badge className="bg-slate-700 text-white border-slate-600">
                  Best of {selectedInvite.options?.bestOf || 3}
                </Badge>
              </div>
              {selectedInvite.options?.doubleOut !== undefined && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Double Out:</span>
                  <Badge className={selectedInvite.options.doubleOut ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-700 text-white border-slate-600'}>
                    {selectedInvite.options.doubleOut ? 'Yes' : 'No'}
                  </Badge>
                </div>
              )}
            </div>

            {/* Sender's Trust Rating */}
            {selectedInvite.senderId && (
              <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700/30">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm">{selectedInvite.senderName}'s Trust Rating:</span>
                  <SafetyRatingDisplay userId={selectedInvite.senderId} size="sm" showTooltip={false} />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={() => handleAcceptInvite(selectedInvite)}
                disabled={processingInvite === selectedInvite.id}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white h-12 disabled:opacity-50 rounded-xl font-bold shadow-lg"
              >
                {processingInvite === selectedInvite.id ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Join Match
                  </>
                )}
              </Button>
              <Button
                onClick={() => handleDeclineInvite(selectedInvite)}
                disabled={processingInvite === selectedInvite.id}
                variant="outline"
                className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 h-12 disabled:opacity-50 rounded-xl"
              >
                <X className="w-4 h-4 mr-2" />
                Decline
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
