'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
  is_friend: boolean;
  request_pending: boolean;
}

interface FriendRequest {
  id: string;
  from_user_id: string;
  username: string;
  avatar_url: string;
  trust_rating_letter?: string;
  created_at: string;
}

interface Message {
  id: string;
  from_user_id: string;
  body: string;
  created_at: string;
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
        },
        () => {
          loadFriends();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
        },
        () => {
          loadRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!chatConversationId) return;

    const channel = supabase
      .channel(`conversation_${chatConversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friend_messages',
          filter: `conversation_id=eq.${chatConversationId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatConversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadFriends = async () => {
    try {
      const { data, error } = await supabase.rpc('rpc_get_friends_overview');

      if (error) throw error;

      if (data?.ok) {
        setFriends(data.friends || []);
      }
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

      if (data?.ok) {
        setRequests(data.requests || []);
      }
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

      if (data?.ok) {
        setSearchResults(data.users || []);
      } else {
        toast.error(data?.error || 'Search failed');
      }
    } catch (err) {
      console.error('Error searching users:', err);
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (userId: string) => {
    try {
      const { data, error } = await supabase.rpc('rpc_send_friend_request', {
        p_target_user_id: userId,
      });

      if (error) throw error;

      if (data?.ok) {
        toast.success('Friend request sent!');
        setSearchResults((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, request_pending: true } : u))
        );
      } else {
        if (data?.error === 'already_friends') {
          toast.info('Already friends');
        } else if (data?.error === 'request_already_sent') {
          toast.info('Request already sent');
        } else if (data?.error === 'cannot_add_self') {
          toast.error('Cannot add yourself');
        } else {
          toast.error('Failed to send request');
        }
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

        if (accept) {
          loadFriends();
        }
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
      const { data, error } = await supabase.rpc('rpc_get_or_create_conversation', {
        p_friend_id: friendId,
      });

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

      if (data?.ok) {
        setMessageInput('');
      } else {
        toast.error(data?.error || 'Failed to send message');
      }
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

  const getCurrentUserId = () => {
    return supabase.auth.getUser().then((res) => res.data.user?.id || '');
  };

  const renderActivityBadge = (friend: Friend) => {
    if (!friend.is_online) {
      return (
        <Badge variant="secondary" className="text-xs bg-slate-700 text-slate-400">
          Offline
        </Badge>
      );
    }

    if (friend.activity_label) {
      return (
        <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-400">
          {friend.activity_label}
        </Badge>
      );
    }

    return (
      <Badge variant="secondary" className="text-xs bg-emerald-500/20 text-emerald-400">
        Online
      </Badge>
    );
  };

  const renderScoreSnapshot = (friend: Friend) => {
    if (!friend.score_snapshot || Object.keys(friend.score_snapshot).length === 0) {
      return null;
    }

    const snapshot = friend.score_snapshot;

    if (friend.activity_type === 'quick_match' || friend.activity_type === 'ranked_match') {
      return (
        <div className="text-xs text-slate-400 mt-1">
          {snapshot.player1_name} {snapshot.player1_score} - {snapshot.player2_score}{' '}
          {snapshot.player2_name}
        </div>
      );
    }

    if (friend.activity_type === 'training') {
      return (
        <div className="text-xs text-slate-400 mt-1">
          Target: {snapshot.target} | Remaining: {snapshot.remaining}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 pt-20">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Friends</h1>
            <p className="text-slate-400">Connect with other players</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`${chatOpen ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
            <Card className="bg-slate-800/50 border-slate-700">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="bg-slate-700/50 w-full grid grid-cols-3 mb-6">
                  <TabsTrigger value="friends" className="data-[state=active]:bg-emerald-500">
                    Friends ({friends.length})
                  </TabsTrigger>
                  <TabsTrigger value="add" className="data-[state=active]:bg-emerald-500">
                    Add Friend
                  </TabsTrigger>
                  <TabsTrigger value="requests" className="data-[state=active]:bg-emerald-500">
                    Requests ({requests.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="friends" className="p-4">
                  {loading ? (
                    <div className="text-center text-slate-400 py-8">Loading friends...</div>
                  ) : friends.length === 0 ? (
                    <div className="text-center text-slate-400 py-8">
                      <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No friends yet</p>
                      <p className="text-sm mt-2">Add friends to see them here</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {friends.map((friend) => (
                        <div
                          key={friend.id}
                          className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition"
                        >
                          <div className="flex items-center space-x-4 flex-1">
                            <div className="relative">
                              <Avatar className="w-12 h-12">
                                <AvatarImage src={friend.avatar_url} />
                                <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white">
                                  {friend.username.substring(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              {friend.is_online && (
                                <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-slate-800 rounded-full" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-white font-semibold truncate">{friend.username}</p>
                                <TrustRatingBadge rating={friend.trust_rating_letter} />
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                {renderActivityBadge(friend)}
                                {!friend.is_online && friend.last_seen && (
                                  <span className="text-xs text-slate-500">
                                    {formatDistanceToNow(new Date(friend.last_seen), {
                                      addSuffix: true,
                                    })}
                                  </span>
                                )}
                              </div>
                              {renderScoreSnapshot(friend)}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                            onClick={() => handleOpenChat(friend.id, friend.username)}
                          >
                            <MessageCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="add" className="p-4">
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Search by username..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="flex-1 bg-slate-700/50 border-slate-600 text-white"
                      />
                      <Button
                        onClick={handleSearch}
                        disabled={searching}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Search className="w-4 h-4 mr-2" />
                        Search
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {searchResults.length === 0 && !searching && searchQuery && (
                        <div className="text-center text-slate-400 py-8">
                          No users found
                        </div>
                      )}

                      {searchResults.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg"
                        >
                          <div className="flex items-center space-x-4">
                            <Avatar className="w-12 h-12">
                              <AvatarImage src={user.avatar_url} />
                              <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white">
                                {user.username.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-white font-semibold">{user.username}</p>
                                <TrustRatingBadge rating={user.trust_rating_letter} />
                              </div>
                            </div>
                          </div>
                          {user.is_friend ? (
                            <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400">
                              <Check className="w-3 h-3 mr-1" />
                              Friends
                            </Badge>
                          ) : user.request_pending ? (
                            <Badge variant="secondary" className="bg-blue-500/20 text-blue-400">
                              <Clock className="w-3 h-3 mr-1" />
                              Pending
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => handleSendRequest(user.id)}
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              <UserPlus className="w-4 h-4 mr-2" />
                              Add Friend
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="requests" className="p-4">
                  {requests.length === 0 ? (
                    <div className="text-center text-slate-400 py-8">
                      <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No pending requests</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {requests.map((request) => (
                        <div
                          key={request.id}
                          className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg"
                        >
                          <div className="flex items-center space-x-4">
                            <Avatar className="w-12 h-12">
                              <AvatarImage src={request.avatar_url} />
                              <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white">
                                {request.username.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-white font-semibold">{request.username}</p>
                                <TrustRatingBadge rating={request.trust_rating_letter} />
                              </div>
                              <p className="text-xs text-slate-400">
                                {formatDistanceToNow(new Date(request.created_at), {
                                  addSuffix: true,
                                })}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleRespondRequest(request.id, true)}
                              className="bg-emerald-600 hover:bg-emerald-700"
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRespondRequest(request.id, false)}
                              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                            >
                              <X className="w-4 h-4 mr-1" />
                              Decline
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </Card>
          </div>

          {chatOpen && (
            <div className="lg:col-span-1">
              <Card className="bg-slate-800/50 border-slate-700 h-[600px] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-700">
                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCloseChat}
                      className="text-slate-400 hover:text-white"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <h3 className="font-semibold text-white">{chatFriendName}</h3>
                  </div>
                </div>

                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-3">
                    {messages.map((msg, idx) => {
                      const isOwn = msg.from_user_id === chatFriendId ? false : true;
                      return (
                        <div
                          key={msg.id || idx}
                          className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg p-3 ${
                              isOwn
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-700 text-slate-100'
                            }`}
                          >
                            <p className="text-sm">{msg.body}</p>
                            <p className="text-xs opacity-70 mt-1">
                              {new Date(msg.created_at).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="p-4 border-t border-slate-700">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type a message..."
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      className="flex-1 bg-slate-700/50 border-slate-600 text-white"
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim()}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
