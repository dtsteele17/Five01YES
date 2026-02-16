'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Target, Users, ArrowLeft, Play, Loader2, X, UserPlus, Zap, Gamepad2, Activity, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { ATCLobbyModal } from './ATCLobbyModal';

// ============================================
// TYPES
// ============================================
interface QuickMatchLobby {
  id: string;
  created_by: string;
  status: string;
  game_type: string;
  match_format: string;
  starting_score: number;
  double_out: boolean;
  double_in: boolean;
  player1_id: string;
  player2_id: string | null;
  match_id: string | null;
  created_at: string;
  player1_3dart_avg?: number;
  player1?: {
    username: string;
    avatar_url?: string;
  };
  atc_settings?: {
    order: 'sequential' | 'random';
    mode: 'singles' | 'doubles' | 'trebles' | 'increase';
    player_count: number;
  };
  players?: {
    id: string;
    username: string;
    is_ready: boolean;
  }[];
}

// ============================================
// HERO STAT COMPONENT
// ============================================
function HeroStat({ value, label, icon: Icon, color }: { 
  value: string | number; 
  label: string; 
  icon: any; 
  color: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${color}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-4xl font-black text-white tracking-tight">{value}</p>
          <p className="text-sm text-slate-400 mt-1 uppercase tracking-wider font-medium">{label}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl ${color} bg-opacity-20 flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN PAGE COMPONENT
// ============================================
export default function QuickMatchLobbyPage() {
  const router = useRouter();
  const supabase = createClient();

  const [gameMode, setGameMode] = useState('501');
  const [matchFormat, setMatchFormat] = useState('best-of-3');
  const [doubleOut, setDoubleOut] = useState(true);
  const [atcOrder, setAtcOrder] = useState<'sequential' | 'random'>('sequential');
  const [atcMode, setAtcMode] = useState<'singles' | 'doubles' | 'trebles' | 'increase'>('singles');
  const [atcPlayerCount, setAtcPlayerCount] = useState(2);
  
  const [filterMode, setFilterMode] = useState('all');
  const [filterFormat, setFilterFormat] = useState('all');
  
  const [lobbies, setLobbies] = useState<QuickMatchLobby[]>([]);
  const [myLobby, setMyLobby] = useState<QuickMatchLobby | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<string>('disconnected');

  const [showATCModal, setShowATCModal] = useState(false);
  const [pendingLobbyId, setPendingLobbyId] = useState<string | null>(null);

  // ============================================
  // INITIALIZE
  // ============================================
  useEffect(() => {
    initialize();
    
    const interval = setInterval(() => {
      fetchLobbies();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // ============================================
  // SUBSCRIBE TO MY LOBBY
  // ============================================
  useEffect(() => {
    if (!userId || !myLobby) return;
    
    const channel = supabase
      .channel(`my-lobby-${myLobby.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'quick_match_lobbies',
        filter: `id=eq.${myLobby.id}`
      }, (payload) => {
        const updated = payload.new as QuickMatchLobby;
        
        // Check if I'm still in the lobby
        const isInLobby = updated.players?.some(p => p.id === userId) || updated.created_by === userId;
        
        if (!isInLobby) {
          // I was removed
          setMyLobby(null);
          setShowATCModal(false);
          toast.info('You left the lobby');
        } else {
          setMyLobby(updated);
          
          // If match started, redirect
          if (updated.match_id && updated.status === 'in_progress') {
            if (updated.game_type === 'atc') {
              router.push(`/app/play/quick-match/atc-match?matchId=${updated.match_id}`);
            } else {
              router.push(`/app/play/quick-match/match/${updated.match_id}`);
            }
          }
        }
      })
      .subscribe();
      
    return () => void channel.unsubscribe();
  }, [userId, myLobby?.id]);

  // ============================================
  // SUBSCRIBE TO JOIN REQUEST STATUS (for joiners)
  // ============================================
  useEffect(() => {
    if (!userId || !pendingLobbyId) return;
    
    console.log('[PENDING] Subscribing to lobby updates for:', pendingLobbyId);
    
    // Subscribe to lobby updates while waiting
    const lobbyChannel = supabase
      .channel(`pending-lobby-${pendingLobbyId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'quick_match_lobbies',
        filter: `id=eq.${pendingLobbyId}`
      }, async (payload) => {
        const updated = payload.new as QuickMatchLobby;
        console.log('[PENDING] Lobby updated:', updated.id, 'players:', updated.players?.length);
        
        // Check if I was added to the lobby
        const isInLobby = updated.players?.some(p => p.id === userId);
        console.log('[PENDING] Am I in lobby?', isInLobby);
        
        if (isInLobby) {
          console.log('[PENDING] I was added to the lobby! Opening modal...');
          setPendingLobbyId(null);
          setMyLobby(updated);
          if (updated.game_type === 'atc') {
            setShowATCModal(true);
            toast.success('Join request accepted! You are in the lobby.');
          }
        }
      })
      .subscribe((status) => {
        console.log('[PENDING] Subscription status:', status);
      });
      
    return () => {
      console.log('[PENDING] Unsubscribing from lobby updates');
      void lobbyChannel.unsubscribe();
    };
  }, [userId, pendingLobbyId]);

  async function initialize() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      
      setUserId(user.id);
      await fetchLobbies();
      
      // Subscribe to lobbies
      supabase
        .channel('lobbies')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'quick_match_lobbies' }, () => {
          fetchLobbies();
        })
        .subscribe((status) => {
          setRealtimeStatus(status === 'SUBSCRIBED' ? 'connected' : 'disconnected');
        });
        
    } catch (error) {
      console.error('Initialization error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLobbies() {
    try {
      const { data } = await supabase
        .from('quick_match_lobbies')
        .select(`
          *,
          player1:profiles!quick_match_lobbies_player1_id_fkey (username, avatar_url)
        `)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
        
      if (data) {
        setLobbies(data.filter(l => l.created_by !== userId) as QuickMatchLobby[]);
        
        // Check if I have a lobby
        const myLobbies = data.filter(l => 
          l.created_by === userId || 
          l.players?.some((p: any) => p.id === userId)
        );
        
        if (myLobbies.length > 0) {
          setMyLobby(myLobbies[0] as QuickMatchLobby);
          if (myLobbies[0].game_type === 'atc' && !showATCModal) {
            setShowATCModal(true);
          }
        } else {
          setMyLobby(null);
          setShowATCModal(false);
        }
      }
    } catch (error) {
      console.error('Error fetching lobbies:', error);
    }
  }

  async function createLobby() {
    if (creating) return;
    setCreating(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user.id)
        .single();
        
      const isATC = gameMode === 'atc';
      
      const lobbyData: any = {
        game_type: gameMode,
        starting_score: isATC ? 0 : parseInt(gameMode),
        match_format: isATC ? 'atc' : matchFormat,
        double_out: !isATC && doubleOut,
        status: 'open',
        created_by: user.id,
        player1_id: user.id,
      };
      
      if (isATC) {
        lobbyData.atc_settings = {
          order: atcOrder,
          mode: atcMode,
          player_count: atcPlayerCount,
        };
        lobbyData.players = [{
          id: user.id,
          username: profile?.username || 'You',
          is_ready: false,
        }];
        lobbyData.status = 'waiting';
      }
      
      const { data, error } = await supabase
        .from('quick_match_lobbies')
        .insert(lobbyData)
        .select()
        .single();
        
      if (error) throw error;
      
      setMyLobby(data as QuickMatchLobby);
      
      if (isATC) {
        setShowATCModal(true);
      }
      
      toast.success('Lobby created!');
      fetchLobbies();
      
    } catch (error: any) {
      toast.error('Failed to create lobby: ' + error.message);
    } finally {
      setCreating(false);
    }
  }

  async function joinLobby(lobbyId: string) {
    if (!userId) return;
    setJoining(lobbyId);
    
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', userId)
        .single();
        
      // Get lobby details
      const { data: lobby } = await supabase
        .from('quick_match_lobbies')
        .select('*')
        .eq('id', lobbyId)
        .single();
        
      if (!lobby) {
        toast.error('Lobby not found');
        return;
      }
      
      if (lobby.game_type === 'atc') {
        // For ATC: Send join request
        const { error } = await supabase
          .from('quick_match_join_requests')
          .insert({
            lobby_id: lobbyId,
            requester_id: userId,
            requester_username: profile?.username || 'Unknown',
            status: 'pending'
          });
          
        if (error) throw error;
        
        setPendingLobbyId(lobbyId);
        toast.success('Join request sent!');
      } else {
        // For 301/501: Direct join (existing logic)
        // ... (keep existing logic for regular matches)
      }
    } catch (error: any) {
      toast.error('Failed to join: ' + error.message);
    } finally {
      setJoining(null);
    }
  }

  async function startATCMatch() {
    if (!myLobby || !userId) return;
    
    try {
      const settings = myLobby.atc_settings;
      if (!settings) return;
      
      const numbers = [...Array(20)].map((_, i) => i + 1);
      const baseTargets = [...numbers, 'bull'];
      
      const shuffle = (arr: any[]) => {
        const newArr = [...arr];
        for (let i = newArr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
        }
        return newArr;
      };
      
      const targets = settings.order === 'random' ? shuffle(baseTargets) : baseTargets;
      
      const { data: match, error } = await supabase
        .from('atc_matches')
        .insert({
          lobby_id: myLobby.id,
          status: 'in_progress',
          game_mode: 'atc',
          atc_settings: settings,
          players: myLobby.players?.map(p => ({
            ...p,
            current_target: targets[0],
            completed_targets: [],
          })),
          current_player_index: 0,
          created_by: myLobby.created_by,
          targets: targets,
        })
        .select()
        .single();
        
      if (error) throw error;
      
      await supabase
        .from('quick_match_lobbies')
        .update({ status: 'in_progress', match_id: match.id })
        .eq('id', myLobby.id);
        
      router.push(`/app/play/quick-match/atc-match?matchId=${match.id}`);
      
    } catch (error: any) {
      toast.error('Failed to start match: ' + error.message);
    }
  }

  async function cancelLobby() {
    if (!myLobby) return;
    
    await supabase
      .from('quick_match_lobbies')
      .delete()
      .eq('id', myLobby.id);
      
    setMyLobby(null);
    setShowATCModal(false);
    toast.info('Lobby cancelled');
    fetchLobbies();
  }

  async function leaveLobby() {
    if (!myLobby || !userId) return;
    
    const updatedPlayers = myLobby.players?.filter(p => p.id !== userId) || [];
    
    await supabase
      .from('quick_match_lobbies')
      .update({ players: updatedPlayers, status: 'waiting' })
      .eq('id', myLobby.id);
      
    setMyLobby(null);
    setShowATCModal(false);
    toast.info('Left lobby');
    fetchLobbies();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  const isATCMode = gameMode === 'atc';
  const isHost = myLobby?.created_by === userId;

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/app/play">
              <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white hover:bg-slate-800">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider">Online Play</p>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">Quick Match</h1>
          <p className="text-slate-400 mt-2 text-lg">Create or join an online match with players worldwide</p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => fetchLobbies()} className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 px-4 py-2 text-sm">
            <Users className="w-4 h-4 mr-2" />
            {lobbies.length} Games Available
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <HeroStat value={lobbies.length} label="Available Matches" icon={Gamepad2} color="bg-blue-500" />
        <HeroStat value={realtimeStatus === 'connected' ? 'Live' : 'Connecting'} label="Status" icon={Activity} color="bg-orange-500" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Create Lobby */}
        <div>
          <Card className="bg-slate-800/40 border-slate-700/50 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                <Play className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-emerald-400 uppercase tracking-wider font-semibold">Host</p>
                <h2 className="text-xl font-bold text-white">Create Match</h2>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-slate-300 text-sm">Game Mode</Label>
                <Select value={gameMode} onValueChange={setGameMode}>
                  <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    <SelectItem value="301">301</SelectItem>
                    <SelectItem value="501">501</SelectItem>
                    <SelectItem value="atc">Around The Clock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isATCMode && (
                <>
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Target Order</Label>
                    <Select value={atcOrder} onValueChange={(v) => setAtcOrder(v as any)}>
                      <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="sequential">1-20 + Bull (In Order)</SelectItem>
                        <SelectItem value="random">Random Order</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Target Type</Label>
                    <Select value={atcMode} onValueChange={(v) => setAtcMode(v as any)}>
                      <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="singles">Singles Only</SelectItem>
                        <SelectItem value="doubles">Doubles Only</SelectItem>
                        <SelectItem value="trebles">Trebles Only</SelectItem>
                        <SelectItem value="increase">Increase by Segment (1,2,3...)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Players</Label>
                    <Select value={atcPlayerCount.toString()} onValueChange={(v) => setAtcPlayerCount(parseInt(v))}>
                      <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="2">2 Players</SelectItem>
                        <SelectItem value="3">3 Players</SelectItem>
                        <SelectItem value="4">4 Players</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {!isATCMode && (
                <>
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Match Format</Label>
                    <Select value={matchFormat} onValueChange={setMatchFormat}>
                      <SelectTrigger className="bg-slate-900/50 border-slate-700 text-white h-12">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="best-of-1">Best of 1</SelectItem>
                        <SelectItem value="best-of-3">Best of 3</SelectItem>
                        <SelectItem value="best-of-5">Best of 5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg">
                    <input
                      type="checkbox"
                      id="doubleOut"
                      checked={doubleOut}
                      onChange={(e) => setDoubleOut(e.target.checked)}
                      className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                    />
                    <Label htmlFor="doubleOut" className="text-slate-300 cursor-pointer">Double Out</Label>
                  </div>
                </>
              )}

              <Button
                onClick={createLobby}
                disabled={creating || !!myLobby}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-6"
              >
                {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'CREATE LOBBY'}
              </Button>
            </div>
          </Card>
        </div>

        {/* Available Lobbies */}
        <div className="lg:col-span-2">
          <Card className="bg-slate-800/40 border-slate-700/50 p-6 h-full">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-xs text-blue-400 uppercase tracking-wider font-semibold">Join</p>
                  <h2 className="text-xl font-bold text-white">Available Matches</h2>
                </div>
              </div>
            </div>

            <ScrollArea className="h-[500px]">
              {lobbies.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No open lobbies</p>
                  <p className="text-sm">Create one to get started!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lobbies.map((lobby) => (
                    <div
                      key={lobby.id}
                      className="p-4 bg-slate-800/50 border border-slate-700 rounded-xl hover:border-slate-600 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white font-bold">
                            {lobby.player1?.username?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="font-bold text-white">{lobby.player1?.username || 'Unknown'}</p>
                            <p className="text-xs text-slate-400">{lobby.game_type}</p>
                          </div>
                        </div>
                        <Badge className="bg-blue-500/20 text-blue-400">
                          {lobby.match_format}
                        </Badge>
                      </div>

                      <Button
                        onClick={() => joinLobby(lobby.id)}
                        disabled={joining === lobby.id || !!myLobby}
                        className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold"
                      >
                        {joining === lobby.id ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                        Join Match
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>
        </div>
      </div>

      {/* ATC Lobby Modal */}
      {showATCModal && myLobby && (
        <ATCLobbyModal
          lobby={myLobby as any}
          userId={userId!}
          isHost={isHost}
          onClose={() => setShowATCModal(false)}
          onStart={startATCMatch}
          onLeave={isHost ? cancelLobby : leaveLobby}
        />
      )}

      {/* Pending Join Request */}
      {pendingLobbyId && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-900 border border-emerald-500/30 rounded-xl px-6 py-4 shadow-2xl z-50">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
            <span className="text-white font-medium">Waiting for host approval...</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setPendingLobbyId(null)}
              className="text-slate-400 hover:text-white"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
