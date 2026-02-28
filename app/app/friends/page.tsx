'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  UserPlus,
  Search,
  MessageCircle,
  X,
  Send,
  Check,
  Clock,
  User,
  ArrowLeft,
  Users,
  Activity,
  ChevronRight,
  Crown,
  Trophy,
  Shield,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { TrustRatingBadge } from '@/components/app/TrustRatingBadge';

interface Friend {
  id: string;
  username: string;
  avatar_url: string;
  trust_rating_letter?: string;
  trust_rating_count?: number;
  is_online: boolean;
  last_seen: string;
  activity_type: string;
  activity_id: string;
  activity_label: string;
  score_snapshot: any;
}

interface SearchUser {
  id: string;
  username: string;
  avatar_url: string;
  trust_rating_letter?: string;
  trust_rating_count?: number;
  is_friend: boolean;
  request_pending: boolean;
}

interface FriendRequest {
  id: string;
  from_user_id: string;
  username: string;
  avatar_url: string;
  trust_rating_letter?: string;
  trust_rating_count?: number;
  created_at: string;
}

interface Message {
  id: string;
  from_user_id: string;
  body: string;
  created_at: string;
}

// Tab Button Component
function TabButton({ active, onClick, children, count }: { 
  active: boolean; 
  onClick: () => void; 
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-3 sm:px-6 py-3 text-sm font-semibold transition-all rounded-xl ${
        active 
          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' 
          : 'text-slate-400 hover:text-white hover:bg-slate-800'
      }`}
    >
      {children}
      {count !== undefined && count > 0 && (
        <Badge className={`ml-2 ${active ? 'bg-white text-emerald-600' : 'bg-slate-700 text-slate-300'}`}>
          {count}
        </Badge>
      )}
    </button>
  );
}

// Friend List Item Component
function FriendListItem({ 
  friend, 
  onChatClick 
}: { 
  friend: Friend; 
  onChatClick: (id: string, name: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 p-4 bg-slate-800/40 rounded-xl border border-slate-700/50 hover:border-slate-600/50 hover:bg-slate-800/60 transition-all group">
      {/* Avatar */}
      <div className="relative">
        <Avatar className="w-14 h-14 rounded-xl border-2 border-slate-700">
          <AvatarImage src={friend.avatar_url} />
          <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold">
            {friend.username.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {friend.is_online && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-3 border-slate-800 rounded-full" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white font-bold text-lg truncate">{friend.username}</p>
          <TrustRatingBadge letter={friend.trust_rating_letter as 'A' | 'B' | 'C' | 'D' | 'E' | null} count={friend.trust_rating_count || 0} />
        </div>
        <div className="flex items-center gap-2 mt-1">
          {friend.is_online ? (
            friend.activity_label ? (
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                <Activity className="w-3 h-3 mr-1" />
                {friend.activity_label}
              </Badge>
            ) : (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                <Activity className="w-3 h-3 mr-1" />
                Online
              </Badge>
            )
          ) : (
            <span className="text-slate-500 text-sm">
              {friend.last_seen ? formatDistanceToNow(new Date(friend.last_seen), { addSuffix: true }) : 'Offline'}
            </span>
          )}
        </div>
        {friend.score_snapshot && Object.keys(friend.score_snapshot).length > 0 && (
          <div className="text-xs text-slate-500 mt-1">
            {friend.activity_type === 'quick_match' && (
              <span>
                {friend.score_snapshot.player1_name} {friend.score_snapshot.player1_score} - {friend.score_snapshot.player2_score} {friend.score_snapshot.player2_name}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => onChatClick(friend.id, friend.username)}
        className="text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-xl"
      >
        <MessageCircle className="w-5 h-5" />
      </Button>
    </div>
  );
}

// Request Item Component
function RequestItem({ 
  request, 
  onAccept, 
  onDecline 
}: { 
  request: FriendRequest; 
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 p-4 bg-slate-800/40 rounded-xl border border-slate-700/50">
      <Avatar className="w-14 h-14 rounded-xl">
        <AvatarImage src={request.avatar_url} />
        <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold">
          {request.username.substring(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-white font-bold">{request.username}</p>
          <TrustRatingBadge letter={request.trust_rating_letter as 'A' | 'B' | 'C' | 'D' | 'E' | null} count={request.trust_rating_count || 0} />
        </div>
        <p className="text-slate-500 text-sm">
          {formatDistanceToNow(new Date(request.created_at), { addSuffix: true })}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => onAccept(request.id)}
          className="bg-emerald-600 hover:bg-emerald-700 rounded-xl"
        >
          <Check className="w-4 h-4 mr-1" />
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onDecline(request.id)}
          className="border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl"
        >
          <X className="w-4 h-4 mr-1" />
          Decline
        </Button>
      </div>
    </div>
  );
}

// Search Result Item Component
function SearchResultItem({ 
  user, 
  onAddFriend 
}: { 
  user: SearchUser; 
  onAddFriend: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-4 p-4 bg-slate-800/40 rounded-xl border border-slate-700/50">
      <Avatar className="w-14 h-14 rounded-xl">
        <AvatarImage src={user.avatar_url} />
        <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold">
          {user.username.substring(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-white font-bold">{user.username}</p>
          <TrustRatingBadge letter={user.trust_rating_letter as 'A' | 'B' | 'C' | 'D' | 'E' | null} count={user.trust_rating_count || 0} />
        </div>
      </div>
      {user.is_friend ? (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
          <Check className="w-3 h-3 mr-1" />
          Friends
        </Badge>
      ) : user.request_pending ? (
        <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      ) : (
        <Button
          size="sm"
          onClick={() => onAddFriend(user.id)}
          className="bg-emerald-600 hover:bg-emerald-700 rounded-xl"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Add
        </Button>
      )}
    </div>
  );
}

export default function FriendsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const initialTab = searchParams.get('tab') || 'friends';
  const chatId = searchParams.get('chat');

  const [activeTab, setActiveTab] = useState(initialTab);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  const [chatOpen, setChatOpen] = useState(!!chatId);
  const [chatConversationId, setChatConversationId] = useState<string | null>(chatId);
  const [chatFriendId, setChatFriendId] = useState<string | null>(null);
  const [chatFriendName, setChatFriendName] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, []);

  useEffect(() => {
    if (chatId) {
      setChatConversationId(chatId);
      setChatOpen(true);
      loadConversation(chatId);
    }
  }, [chatId]);

  useEffect(() => {
    const channel = supabase
      .channel('friends_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, () => loadFriends())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => loadRequests())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!chatConversationId) return;

    const channel = supabase
      .channel(`conversation_${chatConversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friend_messages', filter: `conversation_id=eq.${chatConversationId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
          scrollToBottom();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [chatConversationId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadFriends = async () => {
    try {
      const { data, error } = await supabase.rpc('rpc_get_friends_overview');
      if (error) throw error;
      if (data?.ok) setFriends(data.friends || []);
    } catch (err) {
      console.error('Error loading friends:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    try {
      const { data, error } = await supabase.rpc('rpc_get_friend_requests');
      if (error) throw error;
      if (data?.ok) setRequests(data.requests || []);
    } catch (err) {
      console.error('Error loading requests:', err);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) {
      toast.error('Please enter at least 2 characters');
      return;
    }
    setSearching(true);
    try {
      const { data, error } = await supabase.rpc('rpc_search_users', {
        p_query: searchQuery,
        p_limit: 20,
      });
      if (error) throw error;
      if (data?.ok) setSearchResults(data.users || []);
      else toast.error(data?.error || 'Search failed');
    } catch (err) {
      console.error('Error searching users:', err);
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('rpc_send_friend_request', { p_target_user_id: userId });
      if (error) throw error;
      if (data?.ok) {
        toast.success('Friend request sent!');
        setSearchResults((prev) => prev.map((u) => (u.id === userId ? { ...u, request_pending: true } : u)));
      } else {
        if (data?.error === 'already_friends') toast.info('Already friends');
        else if (data?.error === 'request_already_sent') toast.info('Request already sent');
        else if (data?.error === 'cannot_add_self') toast.error('Cannot add yourself');
        else toast.error('Failed to send request');
      }
    } catch (err) {
      console.error('Error sending request:', err);
      toast.error('Failed to send request');
    }
  };

  const handleRespondRequest = async (requestId: string, accept: boolean) => {
    try {
      const { data, error } = await supabase.rpc('rpc_respond_friend_request', {
        p_request_id: requestId,
        p_accept: accept,
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(accept ? 'Friend request accepted!' : 'Request declined');
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
        if (accept) loadFriends();
      } else {
        toast.error('Failed to respond to request');
      }
    } catch (err) {
      console.error('Error responding to request:', err);
      toast.error('Failed to respond to request');
    }
  };

  const handleOpenChat = async (friendId: string, friendName: string) => {
    setChatFriendId(friendId);
    setChatFriendName(friendName);
    try {
      const { data, error } = await supabase.rpc('rpc_get_or_create_conversation', { p_friend_id: friendId });
      if (error) throw error;
      if (data?.ok) {
        setChatConversationId(data.conversation_id);
        setMessages((data.messages || []).reverse());
        setChatOpen(true);
        router.push(`/app/friends?chat=${data.conversation_id}`);
      } else {
        toast.error(data?.error || 'Failed to open chat');
      }
    } catch (err) {
      console.error('Error opening chat:', err);
      toast.error('Failed to open chat');
    }
  };

  const loadConversation = async (conversationId: string) => {
    try {
      const { data: messagesData, error } = await supabase
        .from('friend_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;
      setMessages(messagesData || []);
    } catch (err) {
      console.error('Error loading conversation:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!chatConversationId || !messageInput.trim()) return;
    try {
      const { data, error } = await supabase.rpc('rpc_send_friend_message', {
        p_conversation_id: chatConversationId,
        p_body: messageInput.trim(),
      });
      if (error) throw error;
      if (data?.ok) setMessageInput('');
      else toast.error(data?.error || 'Failed to send message');
    } catch (err) {
      console.error('Error sending message:', err);
      toast.error('Failed to send message');
    }
  };

  const handleCloseChat = () => {
    setChatOpen(false);
    setChatConversationId(null);
    setChatFriendId(null);
    setMessages([]);
    router.push('/app/friends');
  };

  const onlineFriends = friends.filter(f => f.is_online);
  const offlineFriends = friends.filter(f => !f.is_online);

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-2">Social</p>
          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight">Friends</h1>
          <p className="text-slate-400 mt-2">Connect with players worldwide</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-center px-4">
            <p className="text-2xl font-black text-emerald-400">{onlineFriends.length}</p>
            <p className="text-slate-500 text-sm">Online</p>
          </div>
          <div className="w-px h-10 bg-slate-700" />
          <div className="text-center px-4">
            <p className="text-2xl font-black text-white">{friends.length}</p>
            <p className="text-slate-500 text-sm">Total</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Friends List */}
        <div className={`${chatOpen ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          <Card className="bg-slate-800/30 border-slate-700/50 overflow-hidden">
            {/* Tabs */}
            <div className="p-4 border-b border-slate-700/50">
              <div className="flex gap-2">
                <TabButton active={activeTab === 'friends'} onClick={() => setActiveTab('friends')} count={friends.length}>
                  <Users className="w-4 h-4" />
                  Friends
                </TabButton>
                <TabButton active={activeTab === 'add'} onClick={() => setActiveTab('add')}>
                  <UserPlus className="w-4 h-4" />
                  Add Friend
                </TabButton>
                <TabButton active={activeTab === 'requests'} onClick={() => setActiveTab('requests')} count={requests.length}>
                  <Clock className="w-4 h-4" />
                  Requests
                </TabButton>
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-4">
              {activeTab === 'friends' && (
                <>
                  {loading ? (
                    <div className="text-center py-12">
                      <div className="w-12 h-12 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin mx-auto mb-4" />
                      <p className="text-slate-400">Loading friends...</p>
                    </div>
                  ) : friends.length === 0 ? (
                    <div className="text-center py-12">
                      <Users className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-white mb-2">No friends yet</h3>
                      <p className="text-slate-400 mb-4">Add friends to see them here</p>
                      <Button onClick={() => setActiveTab('add')} className="bg-emerald-600 hover:bg-emerald-700">
                        <UserPlus className="w-4 h-4 mr-2" />
                        Find Friends
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Online Friends */}
                      {onlineFriends.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Activity className="w-4 h-4" />
                            Online ({onlineFriends.length})
                          </h3>
                          <div className="space-y-2">
                            {onlineFriends.map((friend) => (
                              <FriendListItem 
                                key={friend.id} 
                                friend={friend} 
                                onChatClick={handleOpenChat} 
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Offline Friends */}
                      {offlineFriends.length > 0 && (
                        <div>
                          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                            Offline ({offlineFriends.length})
                          </h3>
                          <div className="space-y-2 opacity-70">
                            {offlineFriends.map((friend) => (
                              <FriendListItem 
                                key={friend.id} 
                                friend={friend} 
                                onChatClick={handleOpenChat} 
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'add' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search by username..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="flex-1 bg-slate-700/50 border-slate-600 text-white h-12 rounded-xl"
                    />
                    <Button
                      onClick={handleSearch}
                      disabled={searching}
                      className="bg-emerald-600 hover:bg-emerald-700 h-12 px-3 sm:px-6 rounded-xl"
                    >
                      <Search className="w-5 h-5 mr-2" />
                      Search
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {searchResults.length === 0 && !searching && searchQuery && (
                      <div className="text-center py-8">
                        <Search className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400">No users found</p>
                      </div>
                    )}

                    {searchResults.map((user) => (
                      <SearchResultItem 
                        key={user.id} 
                        user={user} 
                        onAddFriend={handleSendRequest} 
                      />
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'requests' && (
                <>
                  {requests.length === 0 ? (
                    <div className="text-center py-12">
                      <Clock className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                      <h3 className="text-xl font-bold text-white mb-2">No pending requests</h3>
                      <p className="text-slate-400">Friend requests will appear here</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {requests.map((request) => (
                        <RequestItem
                          key={request.id}
                          request={request}
                          onAccept={(id) => handleRespondRequest(id, true)}
                          onDecline={(id) => handleRespondRequest(id, false)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column - Chat */}
        {chatOpen && (
          <div className="lg:col-span-1">
            <Card className="bg-slate-800/30 border-slate-700/50 h-[600px] flex flex-col overflow-hidden">
              {/* Chat Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-700/50 bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCloseChat}
                    className="text-slate-400 hover:text-white rounded-xl"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </Button>
                  <div>
                    <h3 className="font-bold text-white">{chatFriendName}</h3>
                    <p className="text-xs text-emerald-400 flex items-center gap-1">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                      Online
                    </p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {messages.length === 0 ? (
                    <div className="text-center py-8">
                      <MessageCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                      <p className="text-slate-500">Start a conversation</p>
                    </div>
                  ) : (
                    messages.map((msg, idx) => {
                      const isOwn = msg.from_user_id !== chatFriendId;
                      return (
                        <div
                          key={msg.id || idx}
                          className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                              isOwn
                                ? 'bg-emerald-600 text-white rounded-br-md'
                                : 'bg-slate-700 text-slate-100 rounded-bl-md'
                            }`}
                          >
                            <p className="text-sm">{msg.body}</p>
                            <p className="text-xs opacity-70 mt-1">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Input */}
              <div className="p-4 border-t border-slate-700/50 bg-slate-800/50">
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    className="flex-1 bg-slate-700/50 border-slate-600 text-white rounded-xl"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!messageInput.trim()}
                    className="bg-emerald-600 hover:bg-emerald-700 rounded-xl px-4"
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
