'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface PrivateMatchInvite {
  id: string;
  room_id: string;
  from_user_id: string;
  to_user_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  options: {
    gameMode: number;
    bestOf: number;
    doubleOut: boolean;
    straightIn: boolean;
  };
  created_at: string;
  from_profile?: {
    username: string;
    avatar_url?: string;
  };
  to_profile?: {
    username: string;
    avatar_url?: string;
  };
}

export function usePrivateMatchInvites() {
  const [invites, setInvites] = useState<PrivateMatchInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    async function setupInvites() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        setUserId(user.id);

        // Load initial invites
        const { data: initialInvites, error } = await supabase
          .from('private_match_invites')
          .select(`
            *,
            from_profile:profiles!private_match_invites_from_user_id_fkey(username, avatar_url),
            to_profile:profiles!private_match_invites_to_user_id_fkey(username, avatar_url)
          `)
          .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[INVITES] Error loading invites:', error);
        } else {
          console.debug('[INVITES] Loaded initial invites:', initialInvites?.length || 0);
          setInvites(initialInvites || []);
        }

        // Subscribe to realtime updates
        channel = supabase
          .channel('private_match_invites_channel')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'private_match_invites',
              filter: `to_user_id=eq.${user.id}`,
            },
            async (payload) => {
              console.debug('[INVITES] New invite received:', payload.new);

              // Fetch full invite with profiles
              const { data: fullInvite } = await supabase
                .from('private_match_invites')
                .select(`
                  *,
                  from_profile:profiles!private_match_invites_from_user_id_fkey(username, avatar_url),
                  to_profile:profiles!private_match_invites_to_user_id_fkey(username, avatar_url)
                `)
                .eq('id', payload.new.id)
                .maybeSingle();

              if (fullInvite) {
                setInvites((prev) => [fullInvite, ...prev]);
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'private_match_invites',
              filter: `from_user_id=eq.${user.id}`,
            },
            (payload) => {
              console.debug('[INVITES] Invite updated (sent by me):', payload.new);
              setInvites((prev) =>
                prev.map((invite) =>
                  invite.id === payload.new.id ? { ...invite, ...payload.new } : invite
                )
              );
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'private_match_invites',
              filter: `to_user_id=eq.${user.id}`,
            },
            (payload) => {
              console.debug('[INVITES] Invite updated (sent to me):', payload.new);
              setInvites((prev) =>
                prev.map((invite) =>
                  invite.id === payload.new.id ? { ...invite, ...payload.new } : invite
                )
              );
            }
          )
          .subscribe();

        setLoading(false);
      } catch (error) {
        console.error('[INVITES] Setup error:', error);
        setLoading(false);
      }
    }

    setupInvites();

    return () => {
      if (channel) {
        console.debug('[INVITES] Cleaning up subscription');
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const pendingInvitesReceived = invites.filter(
    (inv) => inv.to_user_id === userId && inv.status === 'pending'
  );

  const pendingInvitesSent = invites.filter(
    (inv) => inv.from_user_id === userId && inv.status === 'pending'
  );

  const acceptInvite = async (inviteId: string) => {
    console.debug('[INVITES] Accepting invite:', inviteId);
    const { error } = await supabase
      .from('private_match_invites')
      .update({ status: 'accepted' })
      .eq('id', inviteId);

    if (error) {
      console.error('[INVITES] Error accepting invite:', error);
      throw error;
    }

    return invites.find((inv) => inv.id === inviteId);
  };

  const declineInvite = async (inviteId: string) => {
    console.debug('[INVITES] Declining invite:', inviteId);
    const { error } = await supabase
      .from('private_match_invites')
      .update({ status: 'declined' })
      .eq('id', inviteId);

    if (error) {
      console.error('[INVITES] Error declining invite:', error);
      throw error;
    }

    setInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
  };

  const cancelInvite = async (inviteId: string) => {
    console.debug('[INVITES] Cancelling invite:', inviteId);
    const { error } = await supabase
      .from('private_match_invites')
      .update({ status: 'cancelled' })
      .eq('id', inviteId);

    if (error) {
      console.error('[INVITES] Error cancelling invite:', error);
      throw error;
    }

    setInvites((prev) => prev.filter((inv) => inv.id !== inviteId));
  };

  return {
    invites,
    pendingInvitesReceived,
    pendingInvitesSent,
    loading,
    acceptInvite,
    declineInvite,
    cancelInvite,
  };
}
