'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Trophy, Loader2, CheckCircle, Clock, Swords } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface MatchData {
  has_match: boolean;
  fixture_id: string;
  room_id: string;
  league_name: string;
  legs_per_game: number;
  home_user_id: string;
  away_user_id: string;
  home_username: string;
  away_username: string;
  home_ready: boolean;
  away_ready: boolean;
  is_home: boolean;
  status: string;
}

export function LeagueMatchPopup() {
  const router = useRouter();
  const supabase = createClient();
  const [match, setMatch] = useState<MatchData | null>(null);
  const [readying, setReadying] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const checkForMatch = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.rpc('rpc_check_league_match_ready');
      if (error) return;
      if (data?.has_match && data.fixture_id !== dismissed) {
        setMatch(data);
      } else if (!data?.has_match) {
        setMatch(null);
      }
    } catch (e) { /* ignore */ }
  }, [dismissed]);

  useEffect(() => {
    checkForMatch();
    const interval = setInterval(checkForMatch, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, [checkForMatch]);

  // Subscribe to match room changes for real-time ready state
  useEffect(() => {
    if (!match?.room_id) return;
    const channel = supabase
      .channel(`league-match-${match.room_id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'league_match_rooms',
        filter: `id=eq.${match.room_id}`,
      }, (payload: any) => {
        const updated = payload.new;
        if (updated.status === 'playing') {
          // Both ready — navigate to match
          toast.success('Both players ready! Starting match...');
          const opponentName = match.is_home ? match.away_username : match.home_username;
          const bestOf = match.legs_per_game;
          
          // Set up game config via sessionStorage
          sessionStorage.setItem('game_config', JSON.stringify({
            mode: '501',
            doubleOut: true,
            bestOf: `best-of-${bestOf}`,
            atcOpponent: 'online',
            league: {
              fixtureId: match.fixture_id,
              roomId: match.room_id,
              leagueName: match.league_name,
              opponentName,
              isHome: match.is_home,
            },
          }));
          
          router.push('/app/play/training/501');
          setMatch(null);
        }
        // Update ready states
        setMatch(prev => prev ? {
          ...prev,
          home_ready: updated.home_ready,
          away_ready: updated.away_ready,
          status: updated.status,
        } : null);
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [match?.room_id]);

  const handleReady = async () => {
    if (!match) return;
    setReadying(true);
    try {
      const { data, error } = await supabase.rpc('rpc_league_match_ready_up', { p_room_id: match.room_id });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      
      if (data.both_ready) {
        toast.success('Both players ready! Starting...');
      } else {
        toast.success('You\'re ready! Waiting for opponent...');
      }
      
      setMatch(prev => prev ? {
        ...prev,
        [prev.is_home ? 'home_ready' : 'away_ready']: true,
        status: data.status,
      } : null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setReadying(false);
    }
  };

  if (!match || !match.has_match) return null;

  const myReady = match.is_home ? match.home_ready : match.away_ready;
  const opponentReady = match.is_home ? match.away_ready : match.home_ready;
  const opponentName = match.is_home ? match.away_username : match.home_username;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full animate-in slide-in-from-bottom-4">
      <Card className="bg-slate-900 border-emerald-500/30 shadow-xl shadow-emerald-500/10 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Swords className="w-5 h-5 text-emerald-400" />
            <div>
              <p className="text-white text-sm font-bold">League Match Ready!</p>
              <p className="text-slate-400 text-xs">{match.league_name}</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 mb-3">
            <div className="text-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mx-auto mb-1 ${
                (match.is_home ? myReady : opponentReady) ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
              }`}>
                {match.home_username[0].toUpperCase()}
              </div>
              <p className="text-white text-xs">{match.home_username}</p>
              {(match.is_home ? myReady : opponentReady) && <CheckCircle className="w-3 h-3 text-emerald-400 mx-auto mt-0.5" />}
            </div>
            <span className="text-slate-600 text-xs font-bold">vs</span>
            <div className="text-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mx-auto mb-1 ${
                (match.is_home ? opponentReady : myReady) ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'
              }`}>
                {match.away_username[0].toUpperCase()}
              </div>
              <p className="text-white text-xs">{match.away_username}</p>
              {(match.is_home ? opponentReady : myReady) && <CheckCircle className="w-3 h-3 text-emerald-400 mx-auto mt-0.5" />}
            </div>
          </div>

          <p className="text-slate-500 text-[10px] text-center mb-3">Best of {match.legs_per_game}</p>

          <div className="flex gap-2">
            {!myReady ? (
              <Button 
                onClick={handleReady}
                disabled={readying}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-bold"
              >
                {readying ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                Ready Up
              </Button>
            ) : (
              <div className="flex-1 text-center py-2">
                <p className="text-emerald-400 text-sm font-medium flex items-center justify-center gap-1">
                  <Clock className="w-3.5 h-3.5 animate-pulse" />
                  Waiting for {opponentName}...
                </p>
              </div>
            )}
            <Button 
              variant="outline"
              size="sm"
              className="border-white/10 text-slate-400 text-xs"
              onClick={() => { setDismissed(match.fixture_id); setMatch(null); }}
            >
              Later
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
