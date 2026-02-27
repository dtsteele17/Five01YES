'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Timer, CheckCircle, Swords, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  matchId: string;
  tournamentId: string;
  currentUserId: string;
  onBothReady: (roomId: string) => void;
  onTimeout: () => void;
}

export function TournamentReadyUpModal({ matchId, tournamentId, currentUserId, onBothReady, onTimeout }: Props) {
  const supabase = createClient();
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const [myReady, setMyReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [opponentName, setOpponentName] = useState('Opponent');
  const [myName, setMyName] = useState('You');
  const [player1Id, setPlayer1Id] = useState<string | null>(null);
  const [player2Id, setPlayer2Id] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Load match data
  useEffect(() => {
    const loadMatch = async () => {
      const { data: match } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (!match) return;
      setPlayer1Id(match.player1_id);
      setPlayer2Id(match.player2_id);

      const opponentId = match.player1_id === currentUserId ? match.player2_id : match.player1_id;

      // Load profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username')
        .in('user_id', [currentUserId, opponentId].filter(Boolean));

      profiles?.forEach(p => {
        if (p.user_id === currentUserId) setMyName(p.username || 'You');
        if (p.user_id === opponentId) setOpponentName(p.username || 'Opponent');
      });

      // Check if already ready
      const { data: readyData } = await supabase
        .from('tournament_match_ready')
        .select('user_id')
        .eq('match_id', matchId);

      readyData?.forEach(r => {
        if (r.user_id === currentUserId) setMyReady(true);
        if (r.user_id === opponentId) setOpponentReady(true);
      });
    };
    loadMatch();
  }, [matchId, currentUserId]);

  // Subscribe to ready-up changes via polling
  useEffect(() => {
    const poll = setInterval(async () => {
      const { data } = await supabase
        .from('tournament_match_ready')
        .select('user_id')
        .eq('match_id', matchId);

      const readyIds = data?.map(r => r.user_id) || [];
      const meReady = readyIds.includes(currentUserId);
      const oppId = player1Id === currentUserId ? player2Id : player1Id;
      const oppReady = oppId ? readyIds.includes(oppId) : false;

      setMyReady(meReady);
      setOpponentReady(oppReady);

      // Both ready → create room and go
      if (meReady && oppReady && !creatingRoom) {
        setCreatingRoom(true);
        clearInterval(poll);
        await createRoomAndStart();
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [matchId, currentUserId, player1Id, player2Id, creatingRoom]);

  // 3-minute countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleReadyUp = async () => {
    setMyReady(true);
    
    // Try RPC first (uses auth.uid())
    try {
      const { data, error } = await supabase.rpc('ready_up_tournament_match', { p_match_id: matchId });
      console.log('[ReadyUp] RPC result:', data, error?.message);
    } catch (err) {
      console.error('[ReadyUp] RPC failed:', err);
    }

    // Also direct upsert as fallback
    try {
      const { error } = await supabase
        .from('tournament_match_ready')
        .upsert({ match_id: matchId, user_id: currentUserId }, { onConflict: 'match_id,user_id' });
      if (error) console.error('[ReadyUp] Direct upsert error:', error);
    } catch (err) {
      console.error('[ReadyUp] Direct upsert failed:', err);
    }
  };

  const createRoomAndStart = useCallback(async () => {
    // Check if room already exists
    const { data: existing } = await supabase
      .from('tournament_matches')
      .select('match_room_id')
      .eq('id', matchId)
      .single();

    if (existing?.match_room_id) {
      onBothReady(existing.match_room_id);
      return;
    }

    // Load tournament settings
    const { data: tData } = await supabase
      .from('tournaments')
      .select('game_mode, legs_per_match')
      .eq('id', tournamentId)
      .single();

    const gameMode = tData?.game_mode || 501;
    const bestOf = tData?.legs_per_match || 5;
    const legsToWin = Math.ceil(bestOf / 2);
    const matchFormat = `best-of-${bestOf}`;

    // Create room via RPC
    try {
      const { data: result } = await supabase.rpc('create_tournament_match_room', {
        p_tournament_match_id: matchId,
        p_player1_id: player1Id,
        p_player2_id: player2Id,
        p_tournament_id: tournamentId,
        p_game_mode: gameMode,
        p_legs_per_match: bestOf
      });
      if (result?.success && result?.room_id) {
        onBothReady(result.room_id);
        return;
      }
    } catch {}

    // Fallback: direct insert
    try {
      const { data: room } = await supabase
        .from('match_rooms')
        .insert({
          player1_id: player1Id,
          player2_id: player2Id,
          game_mode: gameMode,
          match_format: matchFormat,
          status: 'active',
          current_leg: 1,
          legs_to_win: legsToWin,
          player1_remaining: gameMode,
          player2_remaining: gameMode,
          current_turn: player1Id,
          source: 'tournament',
          match_type: 'tournament',
          tournament_match_id: matchId
        })
        .select('id')
        .single();

      if (room?.id) {
        await supabase
          .from('tournament_matches')
          .update({ match_room_id: room.id, status: 'in_progress' })
          .eq('id', matchId);
        onBothReady(room.id);
        return;
      }
    } catch {}

    // Last resort: poll for room created by other player
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const { data: check } = await supabase
        .from('tournament_matches')
        .select('match_room_id')
        .eq('id', matchId)
        .single();
      if (check?.match_room_id) {
        onBothReady(check.match_room_id);
        return;
      }
    }
  }, [matchId, player1Id, player2Id, tournamentId]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <Card className="bg-slate-900 border-emerald-500/30 w-full max-w-md shadow-2xl shadow-emerald-500/10">
        <CardContent className="p-6 space-y-6">
          {/* Header */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
              <Swords className="w-6 h-6 text-emerald-400" />
              Tournament Match Ready
            </h2>
            <p className="text-slate-400 text-sm mt-1">Round 1</p>
          </div>

          {/* Timer */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <Timer className={`w-5 h-5 ${timeLeft <= 30 ? 'text-red-400' : 'text-emerald-400'}`} />
              <span className={`text-3xl font-black tabular-nums ${timeLeft <= 30 ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
                {minutes}:{seconds.toString().padStart(2, '0')}
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-1">Both players must click Ready</p>
          </div>

          {/* Players */}
          <div className="flex items-center justify-around">
            <div className="text-center space-y-2">
              <Avatar className="w-16 h-16 mx-auto">
                <AvatarFallback className={`text-lg font-bold ${myReady ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                  {myName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="text-white font-semibold text-sm">{myName} (You)</p>
              {myReady ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><CheckCircle className="w-3 h-3" /> Ready</span>
              ) : (
                <span className="text-xs text-slate-500">Waiting...</span>
              )}
            </div>

            <Swords className="w-8 h-8 text-slate-600" />

            <div className="text-center space-y-2">
              <Avatar className="w-16 h-16 mx-auto">
                <AvatarFallback className={`text-lg font-bold ${opponentReady ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                  {opponentName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="text-white font-semibold text-sm">{opponentName}</p>
              {opponentReady ? (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><CheckCircle className="w-3 h-3" /> Ready</span>
              ) : (
                <span className="text-xs text-slate-500">Waiting...</span>
              )}
            </div>
          </div>

          {/* Ready Status Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-slate-400">
              <span>Ready Status</span>
              <span>{(myReady ? 1 : 0) + (opponentReady ? 1 : 0)} / 2 players ready</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                style={{ width: `${((myReady ? 1 : 0) + (opponentReady ? 1 : 0)) * 50}%` }} />
            </div>
          </div>

          {/* Ready Button or Status */}
          {creatingRoom ? (
            <div className="text-center py-3">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin mx-auto mb-2" />
              <p className="text-emerald-400 font-semibold">Both ready! Creating match...</p>
            </div>
          ) : myReady ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 text-center">
              <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-emerald-400 font-semibold">You are ready!</p>
              <p className="text-slate-400 text-sm">Waiting for {opponentName}...</p>
            </div>
          ) : (
            <Button
              onClick={handleReadyUp}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg py-6"
            >
              Ready Up ({(myReady ? 1 : 0) + (opponentReady ? 1 : 0)}/2)
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
