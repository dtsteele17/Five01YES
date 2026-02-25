'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { 
  UserPlus, 
  Users, 
  Search, 
  Check, 
  Clock, 
  X,
  Mail,
  Heart,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface Friend {
  user_id: string;
  username: string;
  avatar_url: string | null;
  already_invited: boolean;
  already_registered: boolean;
}

interface TournamentInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournamentId: string;
  tournamentName: string;
}

export function TournamentInviteModal({ 
  isOpen, 
  onClose, 
  tournamentId, 
  tournamentName 
}: TournamentInviteModalProps) {
  const supabase = createClient();
  
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [invitingUsername, setInvitingUsername] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadFriends();
    }
  }, [isOpen, tournamentId]);

  const loadFriends = async () => {
    try {
      setLoadingFriends(true);
      
      const { data: friendsData, error } = await supabase.rpc('get_friends_for_tournament_invite', {
        p_tournament_id: tournamentId
      });

      if (error) throw error;

      setFriends(friendsData || []);
    } catch (error) {
      console.error('Error loading friends:', error);
      toast.error('Failed to load friends list');
    } finally {
      setLoadingFriends(false);
    }
  };

  const sendInvite = async (username: string, isFromFriendsList = false) => {
    try {
      if (isFromFriendsList) {
        setInviting(username);
      } else {
        setInvitingUsername(true);
      }

      const { data, error } = await supabase.rpc('send_tournament_invite', {
        p_tournament_id: tournamentId,
        p_invitee_username: username
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; message?: string };

      if (!result.success) {
        throw new Error(result.error || 'Failed to send invite');
      }

      toast.success(`Invitation sent to ${username}!`);
      
      if (isFromFriendsList) {
        // Update the friend's status locally
        setFriends(prev => prev.map(friend => 
          friend.username === username 
            ? { ...friend, already_invited: true }
            : friend
        ));
      } else {
        setUsernameInput('');
      }

    } catch (error: any) {
      console.error('Error sending invite:', error);
      toast.error(error.message || 'Failed to send invitation');
    } finally {
      setInviting(null);
      setInvitingUsername(false);
    }
  };

  const filteredFriends = friends.filter(friend =>
    friend.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const availableFriends = filteredFriends.filter(friend => 
    !friend.already_invited && !friend.already_registered
  );
  
  const alreadyInvitedFriends = filteredFriends.filter(friend => 
    friend.already_invited && !friend.already_registered
  );
  
  const registeredFriends = filteredFriends.filter(friend => 
    friend.already_registered
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center">
              <UserPlus className="w-5 h-5 text-white" />
            </div>
            Invite Players
          </DialogTitle>
          <p className="text-slate-400">
            Invite friends to join <span className="text-emerald-400 font-semibold">"{tournamentName}"</span>
          </p>
        </DialogHeader>

        <Tabs defaultValue="friends" className="mt-6">
          <TabsList className="grid w-full grid-cols-2 bg-slate-800/50">
            <TabsTrigger value="friends" className="data-[state=active]:bg-emerald-600">
              <Heart className="w-4 h-4 mr-2" />
              Friends ({availableFriends.length})
            </TabsTrigger>
            <TabsTrigger value="username" className="data-[state=active]:bg-blue-600">
              <Mail className="w-4 h-4 mr-2" />
              By Username
            </TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="space-y-4 mt-6">
            {/* Search Friends */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Search your friends..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800/50 border-white/10 text-white"
              />
            </div>

            <div className="max-h-96 overflow-y-auto space-y-4">
              {loadingFriends ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
              ) : (
                <>
                  {/* Available Friends */}
                  {availableFriends.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Available to Invite ({availableFriends.length})
                      </h4>
                      {availableFriends.map(friend => (
                        <motion.div
                          key={friend.user_id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-slate-800/30 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-10 h-10">
                                <AvatarFallback className="bg-slate-700 text-white font-semibold">
                                  {friend.username[0]?.toUpperCase() || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="text-white font-medium">{friend.username}</div>
                                <div className="text-xs text-slate-400">Friend</div>
                              </div>
                            </div>
                            <Button
                              onClick={() => sendInvite(friend.username, true)}
                              disabled={inviting === friend.username}
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              {inviting === friend.username ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  Inviting...
                                </>
                              ) : (
                                <>
                                  <UserPlus className="w-3 h-3 mr-1" />
                                  Invite
                                </>
                              )}
                            </Button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Already Invited */}
                  {alreadyInvitedFriends.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Pending Invitations ({alreadyInvitedFriends.length})
                      </h4>
                      {alreadyInvitedFriends.map(friend => (
                        <div 
                          key={friend.user_id}
                          className="bg-slate-800/20 border border-amber-500/30 rounded-xl p-4"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-10 h-10">
                                <AvatarFallback className="bg-slate-700 text-white font-semibold">
                                  {friend.username[0]?.toUpperCase() || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="text-white font-medium">{friend.username}</div>
                                <div className="text-xs text-slate-400">Friend</div>
                              </div>
                            </div>
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                              <Clock className="w-3 h-3 mr-1" />
                              Invited
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Already Registered */}
                  {registeredFriends.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        Already Registered ({registeredFriends.length})
                      </h4>
                      {registeredFriends.map(friend => (
                        <div 
                          key={friend.user_id}
                          className="bg-slate-800/20 border border-emerald-500/30 rounded-xl p-4"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-10 h-10">
                                <AvatarFallback className="bg-slate-700 text-white font-semibold">
                                  {friend.username[0]?.toUpperCase() || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="text-white font-medium">{friend.username}</div>
                                <div className="text-xs text-slate-400">Friend</div>
                              </div>
                            </div>
                            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                              <Check className="w-3 h-3 mr-1" />
                              Registered
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* No Friends State */}
                  {friends.length === 0 && !loadingFriends && (
                    <div className="text-center py-8">
                      <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                      <h4 className="text-slate-300 font-medium mb-2">No friends found</h4>
                      <p className="text-slate-500 text-sm">
                        Add friends to easily invite them to tournaments
                      </p>
                    </div>
                  )}

                  {/* Search No Results */}
                  {friends.length > 0 && filteredFriends.length === 0 && (
                    <div className="text-center py-8">
                      <Search className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                      <h4 className="text-slate-300 font-medium mb-2">No friends match your search</h4>
                      <p className="text-slate-500 text-sm">
                        Try adjusting your search terms
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="username" className="space-y-4 mt-6">
            <Card className="bg-slate-800/30 border-white/10">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="username" className="text-white">
                      Username
                    </Label>
                    <Input
                      id="username"
                      placeholder="Enter username..."
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      className="mt-2 bg-slate-800/50 border-white/10 text-white"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && usernameInput.trim()) {
                          sendInvite(usernameInput.trim(), false);
                        }
                      }}
                    />
                  </div>

                  <Button
                    onClick={() => sendInvite(usernameInput.trim(), false)}
                    disabled={!usernameInput.trim() || invitingUsername}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {invitingUsername ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Sending Invitation...
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4 mr-2" />
                        Send Invitation
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="text-sm text-slate-500 bg-slate-800/20 rounded-lg p-4 border border-white/5">
              💡 <strong>Tip:</strong> Invited players will receive a notification and can accept or decline your invitation.
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}