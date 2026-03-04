'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader as Loader2, Trophy, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { clearStaleMatchState } from '@/lib/utils/stale-state-cleanup';
import { clearMatchState } from '@/lib/utils/match-resume';
import { trackScoreAchievement, trackMatchEnd } from '@/lib/achievementTracker';

interface OnlineMatchData {
  match: {
    id: string;
    player1_id: string;
    player2_id: string;
    game_type: number;
    best_of: number;
    double_out: boolean;
    status: string;
    current_turn_player_id: string;
  };
  state: {
    player1Score: number;
    player2Score: number;
    player1LegsWon: number;
    player2LegsWon: number;
    currentLeg: number;
    legsToWin: number;
    gameMode: number;
    visits: Array<any>;
  };
  player1_profile: {
    id: string;
    display_name: string;
    username: string;
  };
  player2_profile: {
    id: string;
    display_name: string;
    username: string;
  };
}

export default function OnlineMatchPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.matchId as string;

  const [matchData, setMatchData] = useState<OnlineMatchData | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputScore, setInputScore] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showMatchComplete, setShowMatchComplete] = useState(false);

  // Match-start sound
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showSoundBanner, setShowSoundBanner] = useState(false);

  // Stale state cleanup - run once when match not found
  const hasCleanedStaleState = useRef(false);

  useEffect(() => {
    loadMatchData();
    const cleanup = subscribeToChanges();
    return cleanup;
  }, [matchId, currentUserId]);

  // Match-start sound effect
  useEffect(() => {
    const storageKey = `played_match_start_${matchId}`;

    // Initialize audio once
    if (!audioRef.current) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://azrmgtukcgqslnilodky.supabase.co';
      audioRef.current = new Audio(`${supabaseUrl}/storage/v1/object/public/public-assets/gameon-darts.mp3`);
      audioRef.current.volume = 0.6;
    }

    // Check if match is truly active: status === 'active' AND both players present
    const isMatchActive =
      matchData?.match?.status === 'active' &&
      matchData?.match?.player1_id &&
      matchData?.match?.player2_id;

    // Check if we've already played the sound for this room
    const hasPlayed = sessionStorage.getItem(storageKey) === 'true';

    if (isMatchActive && !hasPlayed) {
      console.log('[MATCH_START_SOUND] Playing game-on sound for room:', matchId);

      // Mark as played immediately to prevent any re-triggers
      sessionStorage.setItem(storageKey, 'true');

      // Attempt to play
      const playPromise = audioRef.current.play();

      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('[MATCH_START_SOUND] Sound played successfully');
            setShowSoundBanner(false);
          })
          .catch((error) => {
            console.log('[MATCH_START_SOUND] Autoplay blocked, showing banner:', error);
            setShowSoundBanner(true);
          });
      }
    }
  }, [matchId, matchData?.match?.status, matchData?.match?.player1_id, matchData?.match?.player2_id]);

  const handleEnableSound = () => {
    if (audioRef.current) {
      audioRef.current.play()
        .then(() => {
          console.log('[MATCH_START_SOUND] Sound enabled by user');
          setShowSoundBanner(false);
        })
        .catch((error) => {
          console.error('[MATCH_START_SOUND] Failed to play after user interaction:', error);
        });
    }
  };

  // Clear stale state when match not found
  useEffect(() => {
    if (!loading && !matchData && !hasCleanedStaleState.current) {
      console.log('[STALE_STATE] Match not found, clearing stale match state once');
      hasCleanedStaleState.current = true;
      clearStaleMatchState();
    }
  }, [loading, matchData]);

  async function loadMatchData() {
    const supabase = createClient();

    try {
      console.log('[ONLINE MATCH] Loading match with matchId:', matchId);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      setCurrentUserId(user.id);

      const rpcPayload = { p_match_id: matchId };
      console.log('[ONLINE MATCH] Calling get_online_match_with_state with payload:', rpcPayload);
      console.log('[ONLINE MATCH] match_room_id being used:', matchId);

      const { data, error } = await supabase.rpc(
        'get_online_match_with_state',
        rpcPayload
      );

      if (error) {
        console.error('[ONLINE MATCH] Failed to load match:', error);
        toast.error(`Failed to load match: ${error.message}`);
        return;
      }

      console.log('[ONLINE MATCH] Match data loaded successfully:', data);
      setMatchData(data);

      if (data.match.status === 'completed') {
        setShowMatchComplete(true);
      }
    } catch (error: any) {
      console.error('Error loading match:', error);
      toast.error(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  function subscribeToChanges() {
    const supabase = createClient();

    const channel = supabase
      .channel(`online_match_${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'match_rooms',
          filter: `id=eq.${matchId}`,
        },
        async (payload) => {
          console.log('[REALTIME] Match room updated:', payload.new);
          const updatedRoom = payload.new as any;
          
          // Reload match data to get updated state
          const { data, error } = await supabase.rpc('get_online_match_with_state', {
            p_match_id: matchId,
          });
          
          if (data && !error) {
            setMatchData(data);
            
            // Check if match is complete
            if (updatedRoom.status === 'finished' || updatedRoom.status === 'completed') {
              setShowMatchComplete(true);
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_events',
          filter: `room_id=eq.${matchId}`,
        },
        async (payload) => {
          console.log('[REALTIME] Match event added:', payload.new);
          
          // Reload match data to get updated scores
          const { data, error } = await supabase.rpc('get_online_match_with_state', {
            p_match_id: matchId,
          });
          
          if (data && !error) {
            setMatchData(data);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'match_events',
          filter: `room_id=eq.${matchId}`,
        },
        async (payload) => {
          console.log('[REALTIME] Match event updated:', payload.new);
          
          // Reload match data to get updated scores
          const { data, error } = await supabase.rpc('get_online_match_with_state', {
            p_match_id: matchId,
          });
          
          if (data && !error) {
            setMatchData(data);
          }
        }
      )
      .subscribe((status) => {
        console.log('[REALTIME] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }

  const handleScoreInput = useCallback((value: string) => {
    const num = parseInt(value);
    if (!isNaN(num) && num >= 0 && num <= 180) {
      setInputScore(value);
    } else if (value === '') {
      setInputScore('');
    }
  }, []);

  async function submitVisit() {
    console.log('[SUBMIT] Function called!', {
      inputScore,
      hasMatchData: !!matchData,
      currentUserId,
      matchId,
    });

    if (!inputScore || !matchData || !currentUserId) {
      console.error('[SUBMIT] Missing required data:', {
        hasInputScore: !!inputScore,
        hasMatchData: !!matchData,
        hasCurrentUserId: !!currentUserId,
      });
      toast.error('Missing required data');
      return;
    }

    const score = parseInt(inputScore);
    if (isNaN(score) || score < 0 || score > 180) {
      toast.error('Invalid score (0-180)');
      return;
    }

    if (matchData.match.current_turn_player_id !== currentUserId) {
      console.warn('[SUBMIT] Not your turn:', {
        currentTurn: matchData.match.current_turn_player_id,
        myUserId: currentUserId,
      });
      toast.error('Not your turn');
      return;
    }

    const isPlayer1 = currentUserId === matchData.match.player1_id;
    const currentRemaining = isPlayer1
      ? matchData.state.player1Score
      : matchData.state.player2Score;
    const remainingAfter = currentRemaining - score;

    const isBust =
      remainingAfter < 0 ||
      (matchData.match.double_out && remainingAfter === 1);
    const actualRemaining = isBust ? currentRemaining : remainingAfter;
    const isCheckout = !isBust && remainingAfter === 0;

    setSubmitting(true);
    const supabase = createClient();

    try {
      console.log('[SUBMIT] Submitting visit:', {
        matchId,
        score,
        remaining: actualRemaining,
        isBust,
        isCheckout,
        currentTurn: matchData.match.current_turn_player_id,
        myUserId: currentUserId,
      });

      // Use rpc_quick_match_submit_visit_v3 (fixed to use UUID for current_turn)
      console.log('[SUBMIT] Calling RPC with:', {
        p_room_id: matchId,
        p_score: isBust ? 0 : score,
        p_darts: [],
        p_is_bust: isBust,
      });
      
      const { data, error } = await supabase.rpc('rpc_quick_match_submit_visit_v3', {
        p_room_id: matchId,
        p_score: isBust ? 0 : score,
        p_darts: [],
        p_is_bust: isBust
      });
      
      console.log('[SUBMIT] RPC response received:', { data, error });

      if (error) {
        console.error('[SUBMIT] RPC error:', error);
        console.error('[SUBMIT] Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        toast.error(`Failed to submit: ${error.message || 'Unknown error'}`);
        return;
      }

      if (!data) {
        console.error('[SUBMIT] No data returned from RPC');
        toast.error('No response from server');
        return;
      }

      console.log('[SUBMIT] Visit submitted successfully:', data);

      // Track achievements
      if (currentUserId && !data.is_bust) {
        trackScoreAchievement(score, currentUserId, {
          isCheckout: data.is_checkout || data.leg_won,
          checkoutValue: (data.is_checkout || data.leg_won) ? score : undefined,
          matchType: 'online',
        });
      }

      if (data.is_bust) {
        toast.error('Bust!');
      } else if (data.is_checkout) {
        toast.success('Checkout!');
      }

      if (data.leg_won) {
        toast.success('Leg won!');
      }

      if (data.match_won) {
        console.log('Match complete!');
        // Track match end achievement
        if (currentUserId && matchData) {
          const myLegsNow = isPlayer1
            ? matchData.state.player1LegsWon + (data.leg_won ? 1 : 0)
            : matchData.state.player2LegsWon + (data.leg_won ? 1 : 0);
          const oppLegsNow = isPlayer1
            ? matchData.state.player2LegsWon
            : matchData.state.player1LegsWon;
          trackMatchEnd(currentUserId, {
            won: myLegsNow > oppLegsNow,
            matchType: 'online',
            legsWon: myLegsNow,
            legsLost: oppLegsNow,
            average: 0,
            durationMinutes: 15,
          });
        }
        setShowMatchComplete(true);
      }

      setInputScore('');
      
      // ⚠️ CRITICAL: Always reload match data after submit to get updated turn and leg scores
      // This ensures the UI updates immediately with:
      // - Updated turn (switched to opponent)
      // - Updated leg scores (e.g., 1-0, 2-1)
      // - Updated remaining scores
      // DO NOT REMOVE THESE RELOADS - they are essential for proper turn switching
      await loadMatchData();
      
      // Secondary reload to catch any race conditions (keep this for reliability)
      setTimeout(async () => {
        await loadMatchData();
      }, 500);
    } catch (error: any) {
      console.error('Error submitting visit:', error);
      toast.error(`Failed to submit: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function forfeitMatch() {
    if (!matchData || !currentUserId) return;
    
    // Can only forfeit on your turn
    if (!isMyTurn) {
      toast.error("You can only forfeit on your turn");
      return;
    }

    const supabase = createClient();

    try {
      // Use the RPC that automatically records stats for both players
      const { data, error } = await supabase.rpc('rpc_forfeit_match', { p_room_id: matchId });
      
      if (error) throw error;
      
      if (!data?.ok) {
        toast.error(data?.error || "Couldn't forfeit");
        return;
      }

      toast.info('Match forfeited');
      await clearMatchState(matchId);
      router.push('/app/play');
    } catch (error: any) {
      console.error('Failed to forfeit:', error);
      toast.error(`Failed to forfeit: ${error.message}`);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!matchData) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Card className="bg-slate-900 border-white/10 p-8 text-center">
          <p className="text-white text-lg mb-4">Match not found or access denied</p>
          <Button
            onClick={async () => {
              await clearMatchState(matchId);
              router.push('/app/play');
            }}
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            Back to Play
          </Button>
        </Card>
      </div>
    );
  }

  const isPlayer1 = currentUserId === matchData.match.player1_id;
  const isMyTurn = matchData.match.current_turn_player_id === currentUserId;
  const myRemaining = isPlayer1
    ? matchData.state.player1Score
    : matchData.state.player2Score;
  const opponentRemaining = isPlayer1
    ? matchData.state.player2Score
    : matchData.state.player1Score;
  const myLegs = isPlayer1
    ? matchData.state.player1LegsWon
    : matchData.state.player2LegsWon;
  const opponentLegs = isPlayer1
    ? matchData.state.player2LegsWon
    : matchData.state.player1LegsWon;
  const myName = isPlayer1
    ? matchData.player1_profile.display_name || matchData.player1_profile.username
    : matchData.player2_profile.display_name || matchData.player2_profile.username;
  const opponentName = isPlayer1
    ? matchData.player2_profile.display_name || matchData.player2_profile.username
    : matchData.player1_profile.display_name || matchData.player1_profile.username;

  const legsToWin = matchData.state.legsToWin;
  const matchComplete = matchData.match.status === 'completed';
  const winner = myLegs >= legsToWin ? 'you' : opponentLegs >= legsToWin ? 'opponent' : null;

  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-6">
      {showSoundBanner && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-emerald-600 text-white px-4 py-2 flex items-center justify-between shadow-lg">
          <span className="text-sm font-medium">Tap to enable match sound</span>
          <Button
            size="sm"
            onClick={handleEnableSound}
            className="bg-white text-emerald-600 hover:bg-emerald-50 ml-4"
          >
            Enable Sound
          </Button>
        </div>
      )}
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <Badge variant="outline" className="border-emerald-400/30 text-emerald-400">
              Online Match - Leg {matchData.state.currentLeg}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={forfeitMatch}
              disabled={!isMyTurn}
              title={!isMyTurn ? 'You can only forfeit on your turn' : 'Forfeit the match'}
              className={`border-red-500/30 text-red-400 hover:bg-red-500/10 ${!isMyTurn ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <LogOut className="w-4 h-4 mr-2" />
              {!isMyTurn ? 'Opponent Turn' : 'Forfeit'}
            </Button>
          </div>

          <div className="flex items-center justify-center gap-4">
            <h2 className="text-xl text-white">{myName}</h2>
            <div className="text-emerald-400 font-bold text-2xl">
              {myLegs} - {opponentLegs}
            </div>
            <h2 className="text-xl text-white">{opponentName}</h2>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <Card
            className={`bg-slate-900 border-2 p-4 sm:p-6 ${
              isMyTurn && !matchComplete ? 'border-emerald-400 shadow-lg shadow-emerald-400/20' : 'border-white/10'
            }`}
          >
            <div className="flex items-center gap-4 mb-4">
              <Avatar>
                <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white">
                  {myName?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-white font-bold">{myName}</h3>
                <Badge variant="outline" className="text-xs border-emerald-400/30 text-emerald-400">
                  You
                </Badge>
              </div>
              {isMyTurn && !matchComplete && (
                <Badge className="bg-emerald-500 text-white animate-pulse">Your Turn</Badge>
              )}
            </div>
            <div className="text-center py-8">
              <div className="text-2xl sm:text-4xl sm:text-6xl font-bold text-white mb-2">{myRemaining}</div>
              <div className="text-sm text-gray-400">Remaining</div>
            </div>
            <div className="flex justify-center gap-2">
              {Array.from({ length: legsToWin }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${
                    i < myLegs ? 'bg-emerald-400' : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </Card>

          <Card
            className={`bg-slate-900 border-2 p-4 sm:p-6 ${
              !isMyTurn && !matchComplete ? 'border-blue-400 shadow-lg shadow-blue-400/20' : 'border-white/10'
            }`}
          >
            <div className="flex items-center gap-4 mb-4">
              <Avatar>
                <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-500 text-white">
                  {opponentName?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-white font-bold">{opponentName}</h3>
                <Badge variant="outline" className="text-xs border-blue-400/30 text-blue-400">
                  Opponent
                </Badge>
              </div>
              {!isMyTurn && !matchComplete && (
                <Badge className="bg-blue-500 text-white animate-pulse">Their Turn</Badge>
              )}
            </div>
            <div className="text-center py-8">
              <div className="text-2xl sm:text-4xl sm:text-6xl font-bold text-white mb-2">{opponentRemaining}</div>
              <div className="text-sm text-gray-400">Remaining</div>
            </div>
            <div className="flex justify-center gap-2">
              {Array.from({ length: legsToWin }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full ${
                    i < opponentLegs ? 'bg-blue-400' : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </Card>
        </div>

        {!matchComplete && (
          <Card className="bg-slate-900 border-white/10 p-4 sm:p-6">
            <h3 className="text-white font-bold mb-4 text-center">
              {isMyTurn ? 'Enter Your Score' : 'Waiting for opponent...'}
            </h3>
            <div className="flex gap-4">
              <input
                type="number"
                value={inputScore}
                onChange={(e) => handleScoreInput(e.target.value)}
                placeholder="Score (0-180)"
                className="flex-1 bg-slate-800 border border-white/10 text-white px-4 py-3 rounded-lg text-center text-2xl focus:outline-none focus:border-emerald-400"
                disabled={!isMyTurn || submitting}
                min="0"
                max="180"
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && isMyTurn && inputScore && !submitting) {
                    submitVisit();
                  }
                }}
              />
              <Button
                onClick={async () => {
                  console.log('[BUTTON] Submit button clicked!', {
                    isMyTurn,
                    inputScore,
                    submitting,
                    matchData: !!matchData,
                    currentUserId,
                    matchId,
                    buttonDisabled: !isMyTurn || !inputScore || submitting,
                  });
                  
                  // Check if button should be disabled
                  if (!isMyTurn) {
                    console.warn('[BUTTON] Button disabled: Not your turn');
                    toast.error('Not your turn');
                    return;
                  }
                  
                  if (!inputScore) {
                    console.warn('[BUTTON] Button disabled: No score entered');
                    toast.error('Please enter a score');
                    return;
                  }
                  
                  if (submitting) {
                    console.warn('[BUTTON] Button disabled: Already submitting');
                    return;
                  }
                  
                  // Call submit function
                  await submitVisit();
                }}
                disabled={!isMyTurn || !inputScore || submitting}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 sm:px-8 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  'Submit'
                )}
              </Button>
            </div>
            {!isMyTurn && (
              <p className="text-center text-gray-400 text-sm mt-3">
                Waiting for {opponentName} to throw...
              </p>
            )}
          </Card>
        )}
      </div>

      <Dialog open={showMatchComplete} onOpenChange={setShowMatchComplete}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              {winner === 'you' ? '🎉 You Win!' : winner === 'opponent' ? '😔 You Lose' : 'Match Complete'}
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-4 sm:py-6">
            <Trophy
              className={`w-16 h-16 mx-auto mb-4 ${
                winner === 'you' ? 'text-amber-400' : 'text-gray-400'
              }`}
            />
            <p className="text-xl text-white mb-2">
              Final Score: {myLegs} - {opponentLegs}
            </p>
            <p className="text-gray-400 mb-6">
              {winner === 'you' ? myName : opponentName} wins!
            </p>
          </div>
          <Button
            onClick={async () => {
              await clearMatchState(matchId);
              router.push('/app/play');
            }}
            className="w-full bg-emerald-500 hover:bg-emerald-600"
          >
            Back to Play
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
