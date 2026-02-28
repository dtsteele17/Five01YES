'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { PrivateMatchLobby } from '@/components/game/PrivateMatchLobby';
import { toast } from 'sonner';

export default function PrivateMatchLobbyPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.matchId as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [roomExists, setRoomExists] = useState(false);

  useEffect(() => {
    initializeLobby();
  }, [matchId]);

  const initializeLobby = async () => {
    try {
      setLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please sign in to join');
        router.push('/login');
        return;
      }

      setCurrentUserId(user.id);

      // Check room exists and get details
      const { data: room, error: roomError } = await supabase
        .from('match_rooms')
        .select('*')
        .eq('id', matchId)
        .maybeSingle();

      if (roomError || !room) {
        toast.error('Match not found');
        router.push('/app/play');
        return;
      }

      // Check if user is host or guest
      const userIsHost = room.player1_id === user.id;
      const userIsGuest = room.player2_id === user.id;

      if (!userIsHost && !userIsGuest) {
        // Check if this is an invite the user is accepting
        const { data: invite } = await supabase
          .from('private_match_invites')
          .select('*')
          .eq('room_id', matchId)
          .eq('to_user_id', user.id)
          .eq('status', 'pending')
          .maybeSingle();

        if (invite) {
          // Accept the invite and join as guest
          const { data: acceptResult, error: acceptError } = await supabase.rpc(
            'rpc_accept_private_match_invite',
            { p_invite_id: invite.id }
          );

          if (acceptError || !acceptResult?.ok) {
            toast.error('Failed to join match');
            router.push('/app/play');
            return;
          }

          // Update room to set player2
          await supabase
            .from('match_rooms')
            .update({ player2_id: user.id })
            .eq('id', matchId);

          setIsHost(false);
        } else {
          toast.error('You are not invited to this match');
          router.push('/app/play');
          return;
        }
      } else {
        setIsHost(userIsHost);
      }

      setRoomExists(true);

      // Check if game already started
      if (room.status === 'active') {
        router.push(`/app/play/private/match/${matchId}`);
        return;
      }

    } catch (err) {
      console.error('Error initializing lobby:', err);
      toast.error('Something went wrong');
      router.push('/app/play');
    } finally {
      setLoading(false);
    }
  };

  const handleStartGame = () => {
    router.push(`/app/play/private/match/${matchId}`);
  };

  const handleCancel = () => {
    router.push('/app/play');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white text-lg">Loading lobby...</p>
        </motion.div>
      </div>
    );
  }

  if (!roomExists || !currentUserId) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/80 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4 sm:p-6 shadow-2xl"
        >
          <PrivateMatchLobby
            roomId={matchId}
            currentUserId={currentUserId}
            isHost={isHost}
            onStartGame={handleStartGame}
            onCancel={handleCancel}
          />
        </motion.div>
      </div>
    </div>
  );
}
