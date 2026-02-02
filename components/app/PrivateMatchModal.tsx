'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  UserPlus,
  Monitor,
  Copy,
  Check,
  Link as LinkIcon,
  Target,
  Loader2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

interface PrivateMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Friend {
  id: string;
  username: string;
  avatar_url: string;
  is_online: boolean;
}

export function PrivateMatchModal({ isOpen, onClose }: PrivateMatchModalProps) {
  const router = useRouter();
  const supabase = createClient();

  const [gameMode, setGameMode] = useState('501');
  const [matchFormat, setMatchFormat] = useState('best-of-3');
  const [doubleOut, setDoubleOut] = useState(true);
  const [straightIn, setStraightIn] = useState(true);
  const [username, setUsername] = useState('');
  const [opponentName, setOpponentName] = useState('');
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);

  const [atcStartNumber, setAtcStartNumber] = useState(1);
  const [atcEndNumber, setAtcEndNumber] = useState(20);
  const [atcIncludeBull, setAtcIncludeBull] = useState(false);
  const [atcIncreaseBySegment, setAtcIncreaseBySegment] = useState(true);
  const [atcOvershootHandling, setAtcOvershootHandling] = useState('cap');

  const [inviteLink, setInviteLink] = useState('');

  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [waitingForFriend, setWaitingForFriend] = useState(false);
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [invitedFriendName, setInvitedFriendName] = useState('');
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadFriends();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!inviteId) return;

    const channel = supabase
      .channel(`invite_${inviteId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'private_match_invites',
          filter: `id=eq.${inviteId}`,
        },
        (payload) => {
          const newStatus = payload.new.status;
          if (newStatus === 'accepted') {
            setWaitingForFriend(false);
            toast.success(`${invitedFriendName} accepted!`);
            onClose();
            // Navigate to quick match route with room_id
            router.push(`/app/play/quick-match/match/${payload.new.room_id}`);
          } else if (newStatus === 'declined') {
            setWaitingForFriend(false);
            toast.info(`${invitedFriendName} can't right now`);
          } else if (newStatus === 'cancelled') {
            setWaitingForFriend(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [inviteId, invitedFriendName, router, onClose]);

  const loadFriends = async () => {
    try {
      const { data, error } = await supabase.rpc('rpc_get_friends_overview');
      if (error) {
        console.error('Error loading friends:', error);
        setFriends([]);
        return;
      }
      if (data?.ok) {
        setFriends(data.friends || []);
      } else {
        setFriends([]);
      }
    } catch (err) {
      console.error('Error loading friends:', err);
      setFriends([]);
    }
  };

  const handleFriendSelect = (friendId: string) => {
    if (friendId === '__none__') {
      setSelectedFriendId(null);
      setUsername('');
      return;
    }
    const friend = friends.find((f) => f.id === friendId);
    if (friend) {
      setSelectedFriendId(friendId);
      setUsername(friend.username);
    }
  };

  const handleCancelInvite = async () => {
    if (!inviteId) return;

    try {
      const { error } = await supabase
        .from('private_match_invites')
        .update({ status: 'cancelled' })
        .eq('id', inviteId);

      if (error) throw error;

      setWaitingForFriend(false);
      setInviteId(null);
      setCurrentRoomId(null);
      toast.info('Invite cancelled');
    } catch (err) {
      console.error('Error cancelling invite:', err);
      toast.error('Failed to cancel invite');
    }
  };

  const handleCopyLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success('Invite link copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreateOnlineMatch = async () => {
    if (gameMode === 'Around the Clock') {
      toast.error('Online matches only support 301 and 501');
      return;
    }

    if (!selectedFriendId && !username.trim()) {
      toast.error('Please select a friend or enter a username');
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please log in to create an online match');
        router.push('/login');
        return;
      }

      // Get current user's username
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle();

      const myUsername = myProfile?.username || 'Player';

      // Determine invitee
      let inviteeId = selectedFriendId;
      let inviteeName = username;

      // If no friend selected, look up username
      if (!inviteeId && username.trim()) {
        const { data: targetUser, error: userError } = await supabase
          .from('profiles')
          .select('id, username')
          .eq('username', username.trim())
          .maybeSingle();

        if (userError) {
          console.error('Error looking up user:', userError);
          toast.error('Failed to find user');
          return;
        }

        if (!targetUser) {
          toast.error(`User "${username}" not found`);
          return;
        }

        if (targetUser.id === user.id) {
          toast.error("You can't invite yourself");
          return;
        }

        inviteeId = targetUser.id;
        inviteeName = targetUser.username;
      } else if (inviteeId) {
        const friend = friends.find((f) => f.id === inviteeId);
        inviteeName = friend?.username || username;
      }

      if (!inviteeId) {
        toast.error('Could not determine invitee');
        return;
      }

      // Generate room ID
      const roomId = crypto.randomUUID();
      setCurrentRoomId(roomId);

      // Build match options
      const bestOf = matchFormat === 'best-of-1' ? 1 : matchFormat === 'best-of-3' ? 3 : 5;
      const matchOptions = {
        gameMode: parseInt(gameMode),
        bestOf,
        doubleOut,
        straightIn,
      };

      // Insert invite
      const { data: invite, error: inviteError } = await supabase
        .from('private_match_invites')
        .insert({
          room_id: roomId,
          from_user_id: user.id,
          to_user_id: inviteeId,
          status: 'pending',
          options: matchOptions,
        })
        .select()
        .single();

      if (inviteError) {
        console.error('Error creating invite:', inviteError);
        toast.error('Failed to create invite');
        return;
      }

      // Create notification for invitee
      await supabase
        .from('notifications')
        .insert({
          user_id: inviteeId,
          type: 'system',
          title: 'Private Match Invite',
          message: `${myUsername} has invited you to a private game`,
          data: {
            invite_id: invite.id,
            room_id: roomId,
            from_user_id: user.id,
            from_username: myUsername,
            match_options: matchOptions,
          },
        });

      setInviteId(invite.id);
      setInvitedFriendName(inviteeName);
      setWaitingForFriend(true);
      toast.success(`Invite sent to ${inviteeName}`);
    } catch (error: any) {
      console.error('Error creating match:', error);
      toast.error(error?.message || 'Failed to create match');
    } finally {
      setCreating(false);
    }
  };


  const handleStartLocalMatch = () => {
    if (!opponentName.trim()) {
      toast.error('Please enter opponent name');
      return;
    }

    const matchId = `local-${Date.now()}`;
    const matchConfig: any = {
      gameMode,
      bestOf: matchFormat,
      matchFormat,
      matchType: 'private',
      opponentName,
      player1Name: opponentName,
      player2Name: 'Opponent',
    };

    if (gameMode === 'Around the Clock') {
      matchConfig.atcSettings = {
        startNumber: atcStartNumber,
        endNumber: atcEndNumber,
        includeBull: atcIncludeBull,
        increaseBySegment: atcIncreaseBySegment,
        overshootHandling: atcOvershootHandling,
      };
    } else {
      matchConfig.doubleOut = doubleOut;
      matchConfig.straightIn = straightIn;
    }

    localStorage.setItem(`match-${matchId}`, JSON.stringify(matchConfig));

    onClose();
    router.push(`/app/match/local/${matchId}`);
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Create Private Match</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="invite" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-white/5">
            <TabsTrigger
              value="invite"
              className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Friend
            </TabsTrigger>
            <TabsTrigger
              value="local"
              className="data-[state=active]:bg-blue-500 data-[state=active]:text-white"
            >
              <Monitor className="w-4 h-4 mr-2" />
              Local Play
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invite" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Game Mode</Label>
                <Select value={gameMode} onValueChange={setGameMode}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10">
                    <SelectItem value="301">301</SelectItem>
                    <SelectItem value="501">501</SelectItem>
                    <SelectItem value="Around the Clock">Around the Clock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Match Format</Label>
                <Select value={matchFormat} onValueChange={setMatchFormat}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10">
                    <SelectItem value="best-of-1">Best of 1</SelectItem>
                    <SelectItem value="best-of-3">Best of 3</SelectItem>
                    <SelectItem value="best-of-5">Best of 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {gameMode !== 'Around the Clock' ? (
                <>
                  <div className="flex items-center justify-between py-2">
                    <Label className="text-gray-300">Double Out</Label>
                    <Switch checked={doubleOut} onCheckedChange={setDoubleOut} />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <Label className="text-gray-300">Straight In</Label>
                    <Switch checked={straightIn} onCheckedChange={setStraightIn} />
                  </div>
                </>
              ) : (
                <>
                  <div className="border-t border-white/10 pt-4 mt-2">
                    <h3 className="text-sm font-semibold text-white mb-4">Around the Clock Settings</h3>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-gray-300 text-xs">Start Number</Label>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={atcStartNumber}
                            onChange={(e) => setAtcStartNumber(parseInt(e.target.value) || 1)}
                            className="bg-white/5 border-white/10 text-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-gray-300 text-xs">End Number</Label>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={atcEndNumber}
                            onChange={(e) => setAtcEndNumber(parseInt(e.target.value) || 20)}
                            className="bg-white/5 border-white/10 text-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <Label className="text-gray-300 text-sm">Include Bull</Label>
                        <Switch checked={atcIncludeBull} onCheckedChange={setAtcIncludeBull} />
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <Label className="text-gray-300 text-sm">Increase by Segment</Label>
                        <Switch checked={atcIncreaseBySegment} onCheckedChange={setAtcIncreaseBySegment} />
                      </div>
                      <p className="text-xs text-gray-500">
                        {atcIncreaseBySegment ? 'Single +1, Double +2, Treble +3' : 'Any hit +1'}
                      </p>

                      <div className="space-y-2">
                        <Label className="text-gray-300 text-sm">Overshoot Handling</Label>
                        <Select value={atcOvershootHandling} onValueChange={setAtcOvershootHandling}>
                          <SelectTrigger className="bg-white/5 border-white/10 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-white/10">
                            <SelectItem value="cap">Cap at End</SelectItem>
                            <SelectItem value="exact">Exact Finish Required</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-white/10 pt-6 space-y-4">
              {friends.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-gray-300">Invite Friend</Label>
                  <Select
                    value={selectedFriendId || undefined}
                    onValueChange={handleFriendSelect}
                  >
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select a friend..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10">
                      <SelectItem value="__none__">None</SelectItem>
                      {friends.map((friend) => (
                        <SelectItem key={friend.id} value={friend.id}>
                          <div className="flex items-center space-x-2">
                            <div className="relative">
                              <Avatar className="w-6 h-6">
                                <AvatarImage src={friend.avatar_url} />
                                <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-xs">
                                  {friend.username.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              {friend.is_online && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-400 border border-slate-900 rounded-full" />
                              )}
                            </div>
                            <span>{friend.username}</span>
                            {friend.is_online ? (
                              <span className="text-xs text-emerald-400">(online)</span>
                            ) : (
                              <span className="text-xs text-slate-500">(offline)</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-gray-300">Invite by Username</Label>
                <div className="flex space-x-2">
                  <Input
                    placeholder="Enter username..."
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !creating) {
                        handleCreateOnlineMatch();
                      }
                    }}
                    className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                    disabled={creating}
                  />
                  <Button
                    onClick={handleCreateOnlineMatch}
                    disabled={creating || (!selectedFriendId && !username.trim())}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
                  >
                    {creating ? 'Sending...' : 'Send Invite'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-6">
              <Label className="text-gray-300 mb-3 block">Share Invite Link</Label>
              <Card className="bg-white/5 border-white/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 mr-4">
                    <LinkIcon className="w-5 h-5 text-emerald-400" />
                    <code className="text-sm text-gray-300 truncate">{inviteLink}</code>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleCopyLink}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </div>

            <Button
              onClick={handleCreateOnlineMatch}
              disabled={creating}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white"
              size="lg"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Match...
                </>
              ) : (
                'Create Online Match'
              )}
            </Button>
          </TabsContent>

          <TabsContent value="local" className="space-y-6 mt-6">
            <Card className="bg-white/5 border-white/10 p-6">
              <div className="flex items-start space-x-4 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                  <Monitor className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Local Play Mode</h3>
                  <p className="text-gray-400 text-sm">
                    Play with someone in-person using the same device. Perfect for practice or
                    casual matches. Stats will be tracked for both players.
                  </p>
                </div>
              </div>
            </Card>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Game Mode</Label>
                <Select value={gameMode} onValueChange={setGameMode}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10">
                    <SelectItem value="301">301</SelectItem>
                    <SelectItem value="501">501</SelectItem>
                    <SelectItem value="Around the Clock">Around the Clock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Match Format</Label>
                <Select value={matchFormat} onValueChange={setMatchFormat}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10">
                    <SelectItem value="best-of-1">Best of 1</SelectItem>
                    <SelectItem value="best-of-3">Best of 3</SelectItem>
                    <SelectItem value="best-of-5">Best of 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {gameMode !== 'Around the Clock' ? (
                <>
                  <div className="flex items-center justify-between py-2">
                    <Label className="text-gray-300">Double Out</Label>
                    <Switch checked={doubleOut} onCheckedChange={setDoubleOut} />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <Label className="text-gray-300">Straight In</Label>
                    <Switch checked={straightIn} onCheckedChange={setStraightIn} />
                  </div>
                </>
              ) : (
                <>
                  <div className="border-t border-white/10 pt-4 mt-2">
                    <h3 className="text-sm font-semibold text-white mb-4">Around the Clock Settings</h3>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-gray-300 text-xs">Start Number</Label>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={atcStartNumber}
                            onChange={(e) => setAtcStartNumber(parseInt(e.target.value) || 1)}
                            className="bg-white/5 border-white/10 text-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-gray-300 text-xs">End Number</Label>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={atcEndNumber}
                            onChange={(e) => setAtcEndNumber(parseInt(e.target.value) || 20)}
                            className="bg-white/5 border-white/10 text-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <Label className="text-gray-300 text-sm">Include Bull</Label>
                        <Switch checked={atcIncludeBull} onCheckedChange={setAtcIncludeBull} />
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <Label className="text-gray-300 text-sm">Increase by Segment</Label>
                        <Switch checked={atcIncreaseBySegment} onCheckedChange={setAtcIncreaseBySegment} />
                      </div>
                      <p className="text-xs text-gray-500">
                        {atcIncreaseBySegment ? 'Single +1, Double +2, Treble +3' : 'Any hit +1'}
                      </p>

                      <div className="space-y-2">
                        <Label className="text-gray-300 text-sm">Overshoot Handling</Label>
                        <Select value={atcOvershootHandling} onValueChange={setAtcOvershootHandling}>
                          <SelectTrigger className="bg-white/5 border-white/10 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-white/10">
                            <SelectItem value="cap">Cap at End</SelectItem>
                            <SelectItem value="exact">Exact Finish Required</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label className="text-gray-300">Opponent Name</Label>
                <Input
                  placeholder="Enter opponent's name..."
                  value={opponentName}
                  onChange={(e) => setOpponentName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                />
              </div>
            </div>

            <Button
              onClick={handleStartLocalMatch}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:opacity-90 text-white"
              size="lg"
            >
              <Target className="w-5 h-5 mr-2" />
              Start Local Match
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    {/* Waiting Modal */}
    <Dialog open={waitingForFriend} onOpenChange={() => {}}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">Waiting for {invitedFriendName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center space-y-6 py-6">
          <div className="relative">
            <Loader2 className="w-16 h-16 text-emerald-400 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <UserPlus className="w-8 h-8 text-emerald-400" />
            </div>
          </div>

          <div className="text-center space-y-2">
            <p className="text-gray-300">
              Waiting for {invitedFriendName} to accept the invite...
            </p>
            <p className="text-sm text-gray-500">
              They will be notified and can join from their notifications
            </p>
          </div>

          <Button
            onClick={handleCancelInvite}
            variant="outline"
            className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            <X className="w-4 h-4 mr-2" />
            Cancel Invite
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
