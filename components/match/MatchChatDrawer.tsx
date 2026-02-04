'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send } from 'lucide-react';
import { toast } from 'sonner';

interface ChatMessage {
  id: string;
  room_id: string;
  from_user_id: string;
  body: string;
  created_at: string;
  seen_by_player1: boolean;
  seen_by_player2: boolean;
}

interface MatchChatDrawerProps {
  roomId: string;
  myUserId: string;
  opponentName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onUnreadChange: (hasUnread: boolean) => void;
}

export function MatchChatDrawer({
  roomId,
  myUserId,
  opponentName,
  isOpen,
  onOpenChange,
  onUnreadChange,
}: MatchChatDrawerProps) {
  const supabase = createClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel(`chat_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => [...prev, newMsg]);

          // If message is from opponent and drawer is closed, set unread
          if (newMsg.from_user_id !== myUserId && !isOpen) {
            onUnreadChange(true);
          }

          // Auto-scroll to bottom
          setTimeout(() => {
            lastMessageRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, myUserId, isOpen]);

  useEffect(() => {
    if (isOpen) {
      // Mark all messages as seen when drawer opens
      markAsSeen();
      onUnreadChange(false);

      // Scroll to bottom
      setTimeout(() => {
        lastMessageRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [isOpen]);

  async function loadMessages() {
    const { data, error } = await supabase
      .from('match_chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[CHAT] Error loading messages:', error);
      return;
    }

    setMessages((data as ChatMessage[]) || []);
  }

  async function markAsSeen() {
    try {
      await supabase.rpc('rpc_mark_chat_messages_seen', {
        p_room_id: roomId,
      });
    } catch (error) {
      console.error('[CHAT] Error marking messages as seen:', error);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const { data, error } = await supabase.rpc('rpc_send_match_chat_message', {
        p_room_id: roomId,
        p_body: newMessage.trim(),
      });

      if (error) throw error;

      if (!data || data.ok === false) {
        throw new Error(data?.error || 'Failed to send message');
      }

      setNewMessage('');
    } catch (error: any) {
      console.error('[CHAT] Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[400px] bg-slate-900 border-white/10 text-white flex flex-col p-0"
      >
        <SheetHeader className="p-4 border-b border-white/10">
          <SheetTitle className="text-white">Match Chat</SheetTitle>
          <p className="text-sm text-gray-400">Chat with {opponentName}</p>
        </SheetHeader>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-8">
                No messages yet. Send a message to start chatting!
              </p>
            )}
            {messages.map((msg) => {
              const isMyMessage = msg.from_user_id === myUserId;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMyMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-2 ${
                      isMyMessage
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-white'
                    }`}
                  >
                    <p className="text-sm break-words">{msg.body}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={lastMessageRef} />
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-white/10">
          <div className="flex space-x-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              disabled={sending}
              className="flex-1 bg-slate-800 border-white/10 text-white placeholder:text-gray-500"
            />
            <Button
              onClick={sendMessage}
              disabled={!newMessage.trim() || sending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
