'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Copy, Users, Clock, Target, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Match {
  id: string;
  game_mode: string;
  match_format: string;
  double_out: boolean;
  straight_in: boolean;
  status: string;
  invite_code: string;
  user_id: string;
  player1_name: string;
  player2_name: string | null;
}

interface Player {
  id: string;
  user_id: string;
  player_name: string;
  seat: number;
  joined_at: string;
}

export default function OnlineMatchLobby() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.matchId as string;
  const supabase = createClient();

  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    loadMatchData();
    subscribeToChanges();
  }, [matchId]);

  async function loadMatchData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }

      const { data: matchData } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (matchData) {
        setMatch(matchData);
      }

      const { data: playersData } = await supabase
        .from('match_players')
        .select('*')
        .eq('match_id', matchId)
        .order('seat', { ascending: true });

      if (playersData) {
        setPlayers(playersData);
      }
    } catch (error) {
      console.error('Error loading match:', error);
      toast.error('Failed to load match');
    } finally {
      setLoading(false);
    }
  }

  function subscribeToChanges() {
    const channel = supabase
      .channel(`match_lobby_${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_players',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          console.log('Player change:', payload);
          loadMatchData();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          console.log('Match change:', payload);
          const updatedMatch = payload.new as Match;
          setMatch(updatedMatch);

          if (updatedMatch.status === 'in_progress') {
            toast.success('Match starting!');
            router.push(`/app/match/online/${matchId}`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  async function copyInviteLink() {
    if (!match) return;
    const link = `${window.location.origin}/app/play/private/join?code=${match.invite_code}`;
    await navigator.clipboard.writeText(link);
    toast.success('Invite link copied!');
  }

  async function copyInviteCode() {
    if (!match) return;
    await navigator.clipboard.writeText(match.invite_code);
    toast.success('Invite code copied!');
  }

  async function startMatch() {
    if (!match || players.length < 2) return;

    setStarting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not authenticated');
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/start-online-match`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ matchId: match.id }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        toast.success('Match started!');
        router.push(`/app/match/online/${matchId}`);
      } else {
        toast.error(result.error || 'Failed to start match');
      }
    } catch (error) {
      console.error('Error starting match:', error);
      toast.error('Failed to start match');
    } finally {
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Card className="bg-slate-900 border-white/10 p-8 text-center">
          <p className="text-white text-lg">Match not found</p>
          <Button
            onClick={() => router.push('/app/play')}
            className="mt-4 bg-emerald-500 hover:bg-emerald-600"
          >
            Back to Play
          </Button>
        </Card>
      </div>
    );
  }

  const isOwner = currentUserId === match.user_id;
  const canStart = players.length === 2 && isOwner;
  const bestOf = match.match_format === 'best-of-1' ? 1 : match.match_format === 'best-of-3' ? 3 : 5;

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Match Lobby</h1>
          <p className="text-gray-400">Waiting for players to join...</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <Card className="bg-slate-900 border-white/10 p-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-400" />
              Match Settings
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Game Mode</span>
                <Badge variant="outline" className="border-emerald-400/30 text-emerald-400">
                  {match.game_mode}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Format</span>
                <span className="text-white font-medium">Best of {bestOf}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Double Out</span>
                <span className="text-white">{match.double_out ? 'Yes' : 'No'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Straight In</span>
                <span className="text-white">{match.straight_in ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-900 border-white/10 p-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Copy className="w-5 h-5 text-emerald-400" />
              Invite Code
            </h2>
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 bg-slate-800 p-4 rounded-lg mb-2">
                  <code className="text-2xl font-mono text-emerald-400 flex-1 text-center">
                    {match.invite_code}
                  </code>
                </div>
                <Button
                  onClick={copyInviteCode}
                  variant="outline"
                  className="w-full border-white/10 text-white hover:bg-white/5"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Code
                </Button>
              </div>
              <Button
                onClick={copyInviteLink}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Invite Link
              </Button>
            </div>
          </Card>
        </div>

        <Card className="bg-slate-900 border-white/10 p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            Players ({players.length}/2)
          </h2>
          <div className="space-y-3">
            {players.map((player) => (
              <div
                key={player.id}
                className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-lg"
              >
                <Avatar>
                  <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white">
                    {player.player_name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-white font-medium">{player.player_name}</p>
                  <p className="text-sm text-gray-400">Player {player.seat}</p>
                </div>
                {player.user_id === match.user_id && (
                  <Badge variant="outline" className="border-amber-400/30 text-amber-400">
                    Host
                  </Badge>
                )}
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
            ))}
            {players.length < 2 && (
              <div className="flex items-center gap-4 p-4 bg-slate-800/30 rounded-lg border-2 border-dashed border-white/10">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-gray-400" />
                </div>
                <div className="flex-1">
                  <p className="text-gray-400 font-medium">Waiting for player...</p>
                  <p className="text-sm text-gray-500">Share the invite code to start</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="flex gap-4">
          <Button
            onClick={() => router.push('/app/play')}
            variant="outline"
            className="flex-1 border-white/10 text-white hover:bg-white/5"
          >
            Cancel
          </Button>
          <Button
            onClick={startMatch}
            disabled={!canStart || starting}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {starting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              'Start Match'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
