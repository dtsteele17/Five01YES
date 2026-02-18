'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  Target, 
  Trophy, 
  UserPlus, 
  Play, 
  Lock,
  X,
  Search,
  User,
  Check
} from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface Friend {
  id: string;
  username: string;
  avatar_url?: string;
  is_online?: boolean;
}

interface PrivateMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (settings: MatchSettings) => void;
}

export interface MatchSettings {
  gameMode: 301 | 501;
  legsToWin: number;
  doubleOut: boolean;
  invitedPlayerId?: string;
  invitedUsername?: string;
}

// Simple Toggle Switch Component
function ToggleSwitch({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
        checked ? 'bg-blue-600' : 'bg-slate-600'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function PrivateMatchModal({ isOpen, onClose, onStart }: PrivateMatchModalProps) {
  const supabase = createClient();
  
  // Game settings
  const [gameMode, setGameMode] = useState<301 | 501>(501);
  const [legsToWin, setLegsToWin] = useState<number>(3);
  const [doubleOut, setDoubleOut] = useState<boolean>(true);
  
  // Invite state
  const [activeTab, setActiveTab] = useState<'username' | 'friends'>('username');
  const [usernameInput, setUsernameInput] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [searchingUser, setSearchingUser] = useState(false);
  const [foundUser, setFoundUser] = useState<Friend | null>(null);
  
  // Load friends when modal opens
  useEffect(() => {
    if (isOpen) {
      loadFriends();
      // Reset state
      setUsernameInput('');
      setFoundUser(null);
      setSelectedFriend(null);
    }
  }, [isOpen]);
  
  const loadFriends = async () => {
    setLoadingFriends(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Get friends list
      const { data: friendsData, error } = await supabase
        .from('friends')
        .select('friend_id, profiles:friend_id(user_id, username, avatar_url)')
        .eq('user_id', user.id)
        .eq('status', 'accepted');
      
      if (error) throw error;
      
      if (friendsData) {
        const formattedFriends = friendsData.map((f: any) => ({
          id: f.friend_id,
          username: f.profiles?.username || 'Unknown',
          avatar_url: f.profiles?.avatar_url,
        }));
        setFriends(formattedFriends);
      }
    } catch (err) {
      console.error('Error loading friends:', err);
    } finally {
      setLoadingFriends(false);
    }
  };
  
  const searchUserByUsername = async () => {
    if (!usernameInput.trim()) {
      toast.error('Please enter a username');
      return;
    }
    
    setSearchingUser(true);
    setFoundUser(null);
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, avatar_url')
        .ilike('username', usernameInput.trim())
        .limit(1);
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setFoundUser({
          id: data[0].user_id,
          username: data[0].username,
          avatar_url: data[0].avatar_url,
        });
      } else {
        toast.error('User not found');
      }
    } catch (err) {
      console.error('Error searching user:', err);
      toast.error('Failed to search user');
    } finally {
      setSearchingUser(false);
    }
  };
  
  const handleStart = () => {
    const invitedPlayer = selectedFriend || foundUser;
    
    if (!invitedPlayer) {
      toast.error('Please invite a player to start');
      return;
    }
    
    onStart({
      gameMode,
      legsToWin,
      doubleOut,
      invitedPlayerId: invitedPlayer.id,
      invitedUsername: invitedPlayer.username,
    });
  };
  
  const legOptions = [1, 3, 5, 7, 9, 11];
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white w-full max-w-lg p-0 overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-600/20 via-indigo-500/20 to-blue-600/20 border-b border-blue-500/30 p-6">
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-black text-white">
                Private Match
              </DialogTitle>
              <p className="text-slate-400 text-sm">Create a custom game with friends</p>
            </div>
          </div>
        </div>
        
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Game Settings Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Target className="w-4 h-4" />
              Game Settings
            </h3>
            
            {/* Game Mode */}
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Game Mode</label>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant={gameMode === 301 ? 'default' : 'outline'}
                  className={`flex-1 ${gameMode === 301 ? 'bg-blue-600 hover:bg-blue-700' : 'border-slate-600 text-slate-300 hover:bg-slate-800'}`}
                  onClick={() => setGameMode(301)}
                >
                  301
                </Button>
                <Button
                  type="button"
                  variant={gameMode === 501 ? 'default' : 'outline'}
                  className={`flex-1 ${gameMode === 501 ? 'bg-blue-600 hover:bg-blue-700' : 'border-slate-600 text-slate-300 hover:bg-slate-800'}`}
                  onClick={() => setGameMode(501)}
                >
                  501
                </Button>
              </div>
            </div>
            
            {/* Best of Legs */}
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Best Of (Legs)</label>
              <div className="flex flex-wrap gap-2">
                {legOptions.map((legs) => (
                  <Button
                    key={legs}
                    type="button"
                    variant={legsToWin === legs ? 'default' : 'outline'}
                    size="sm"
                    className={`${legsToWin === legs ? 'bg-blue-600 hover:bg-blue-700' : 'border-slate-600 text-slate-300 hover:bg-slate-800'}`}
                    onClick={() => setLegsToWin(legs)}
                  >
                    {legs}
                  </Button>
                ))}
              </div>
            </div>
            
            {/* Double Out Toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-white font-medium">Double Out</p>
                  <p className="text-slate-400 text-xs">Must finish on a double</p>
                </div>
              </div>
              <ToggleSwitch
                checked={doubleOut}
                onCheckedChange={setDoubleOut}
              />
            </div>
          </div>
          
          {/* Divider */}
          <div className="border-t border-slate-700" />
          
          {/* Invite Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              Invite Player
            </h3>
            
            {/* Tabs */}
            <div className="grid w-full grid-cols-2 bg-slate-800 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setActiveTab('username')}
                className={`py-2 px-4 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'username' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                By Username
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('friends')}
                className={`py-2 px-4 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'friends' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Friends
              </button>
            </div>
            
            {/* Tab Content */}
            <div className="mt-4">
              {activeTab === 'username' ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter username..."
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                      onKeyDown={(e) => e.key === 'Enter' && searchUserByUsername()}
                    />
                    <Button
                      onClick={searchUserByUsername}
                      disabled={searchingUser}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {searchingUser ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <Search className="w-4 h-4" />
                        </motion.div>
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  
                  <AnimatePresence>
                    {foundUser && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="p-3 bg-slate-800/50 rounded-xl border border-slate-700 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                            <User className="w-5 h-5 text-slate-400" />
                          </div>
                          <span className="text-white font-medium">{foundUser.username}</span>
                        </div>
                        <Button
                          size="sm"
                          variant={selectedFriend?.id === foundUser.id ? 'default' : 'outline'}
                          className={selectedFriend?.id === foundUser.id ? 'bg-emerald-600 hover:bg-emerald-700' : 'border-emerald-500 text-emerald-400'}
                          onClick={() => setSelectedFriend(selectedFriend?.id === foundUser.id ? null : foundUser)}
                        >
                          {selectedFriend?.id === foundUser.id ? (
                            <>
                              <Check className="w-4 h-4 mr-1" />
                              Selected
                            </>
                          ) : (
                            'Select'
                          )}
                        </Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div>
                  {loadingFriends ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-14 bg-slate-800/50 rounded-xl animate-pulse" />
                      ))}
                    </div>
                  ) : friends.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>No friends yet</p>
                      <p className="text-sm">Add friends to invite them to private matches</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {friends.map((friend) => (
                        <motion.div
                          key={friend.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            selectedFriend?.id === friend.id
                              ? 'bg-blue-500/20 border-blue-500'
                              : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                          }`}
                          onClick={() => setSelectedFriend(selectedFriend?.id === friend.id ? null : friend)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                              {friend.avatar_url ? (
                                <img src={friend.avatar_url} alt={friend.username} className="w-full h-full rounded-full object-cover" />
                              ) : (
                                <User className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                            <span className="text-white font-medium">{friend.username}</span>
                          </div>
                          {selectedFriend?.id === friend.id && (
                            <Check className="w-5 h-5 text-blue-400" />
                          )}
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Selected Player Display */}
          {(selectedFriend || foundUser) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-4 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-xl border border-emerald-500/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <User className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-emerald-400 text-xs font-bold uppercase">Opponent</p>
                    <p className="text-white font-bold text-lg">{(selectedFriend || foundUser)?.username}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-white"
                  onClick={() => {
                    setSelectedFriend(null);
                    setFoundUser(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}
        </div>
        
        {/* Footer / Start Button */}
        <div className="p-6 border-t border-slate-700 bg-slate-800/30">
          <Button
            onClick={handleStart}
            disabled={!selectedFriend && !foundUser}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-6 h-auto text-lg font-bold disabled:opacity-50"
          >
            <Play className="w-5 h-5 mr-2" />
            Start Private Match
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
