'use client';

import { useState, useEffect, useRef } from 'react';
import { Progress } from '@/components/ui/progress';
import { Trophy, Timer, CheckCircle, Loader2, Swords } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

interface TournamentCountdownPopupProps {
  tournamentId: string;
  tournamentName: string;
  startTime: string;
  onComplete: () => void;
  isVisible: boolean;
}

export function TournamentCountdownPopup({ 
  tournamentId, 
  tournamentName, 
  onComplete, 
  isVisible 
}: TournamentCountdownPopupProps) {
  const [timeLeft, setTimeLeft] = useState(60);
  const [bracketGenerated, setBracketGenerated] = useState(false);
  const [opponentName, setOpponentName] = useState<string | null>(null);
  const [hasBye, setHasBye] = useState(false);
  const [phase, setPhase] = useState<'generating' | 'countdown' | 'starting'>('generating');
  const supabase = createClient();

  useEffect(() => {
    if (!isVisible) return;
    loadBracketAndFindOpponent();
  }, [isVisible]);

  // Sync countdown to server timestamp so all users finish at the same time
  const [matchStartTime, setMatchStartTime] = useState<Date | null>(null);

  useEffect(() => {
    if (phase !== 'countdown' || !matchStartTime) return;
    const timer = setInterval(() => {
      const now = new Date();
      const remaining = Math.ceil((matchStartTime.getTime() - now.getTime()) / 1000);
      if (remaining <= 0) {
        clearInterval(timer);
        setTimeLeft(0);
        setPhase('starting');
        setTimeout(() => onComplete(), 1500);
      } else {
        setTimeLeft(remaining);
      }
    }, 500); // Check every 500ms for accuracy
    return () => clearInterval(timer);
  }, [phase, matchStartTime, onComplete]);

  const loadBracketAndFindOpponent = async () => {
    try {
      setPhase('generating');

      // Wait for bracket to be generated (by tournament detail page or server)
      // Poll briefly if not ready yet
      let bracketReady = false;
      let attempts = 0;
      const maxAttempts = 10; // Wait up to 5 seconds
      
      while (!bracketReady && attempts < maxAttempts) {
        const { data: tCheck } = await supabase
          .from('tournaments')
          .select('bracket_generated_at, started_at')
          .eq('id', tournamentId)
          .single();

        if (tCheck?.bracket_generated_at) {
          bracketReady = true;
          setBracketGenerated(true);
          
          // Set countdown based on server timestamp
          if (tCheck.started_at) {
            // All users count down to started_at + 60 seconds
            setMatchStartTime(new Date(new Date(tCheck.started_at).getTime() + 60000));
          } else {
            // Fallback: 60s from now
            setMatchStartTime(new Date(Date.now() + 60000));
          }
        } else {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (!bracketReady) {
        console.log('[TournamentCountdown] Bracket not ready after waiting, proceeding anyway');
        setBracketGenerated(true);
        setMatchStartTime(new Date(Date.now() + 60000));
      }

      // Find current user's first match and opponent
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: myMatch } = await supabase
          .from('tournament_matches')
          .select('*')
          .eq('tournament_id', tournamentId)
          .eq('round', 1)
          .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
          .limit(1)
          .maybeSingle();

        if (myMatch) {
          const opponentId = myMatch.player1_id === user.id ? myMatch.player2_id : myMatch.player1_id;
          if (opponentId) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('username')
              .eq('user_id', opponentId)
              .maybeSingle();
            setOpponentName(profile?.username || 'Unknown Player');
          } else {
            // No opponent = bye round
            setHasBye(true);
          }
        }
      }

      setPhase('countdown');
    } catch (error) {
      console.error('Exception:', error);
      setBracketGenerated(true);
      setMatchStartTime(new Date(Date.now() + 60000));
      setPhase('countdown');
    }
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className="fixed bottom-0 left-0 right-0 z-50"
      >
        <div className="bg-slate-900/98 backdrop-blur-xl border-t-2 border-emerald-500/40 shadow-2xl shadow-emerald-500/10">
          
          {/* Progress bar at top */}
          {phase === 'countdown' && (
            <div className="h-1 bg-slate-800">
              <div 
                className={`h-full transition-all duration-1000 ${timeLeft <= 10 ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${((60 - timeLeft) / 60) * 100}%` }}
              />
            </div>
          )}

          <div className="max-w-6xl mx-auto px-6 py-4">
            
            {/* Phase: Generating */}
            {phase === 'generating' && (
              <div className="flex items-center justify-center gap-4">
                <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
                <span className="text-white font-semibold text-lg">Creating bracket...</span>
              </div>
            )}

            {/* Phase: Countdown */}
            {phase === 'countdown' && (
              <div className="flex items-center justify-between">
                {/* Left: Tournament info */}
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Bracket Created!</span>
                    </div>
                    <p className="text-sm text-slate-400">{tournamentName}</p>
                  </div>
                </div>

                {/* Center: Opponent matchup or bye */}
                {hasBye ? (
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    <div className="text-center">
                      <div className="text-xs text-slate-400 uppercase tracking-wider">Round 1</div>
                      <div className="text-emerald-400 font-bold text-lg">BYE — You advance to Round 2!</div>
                    </div>
                  </div>
                ) : opponentName ? (
                  <div className="flex items-center gap-3">
                    <Swords className="w-5 h-5 text-amber-400" />
                    <div className="text-center">
                      <div className="text-xs text-slate-400 uppercase tracking-wider">Round 1 - You vs</div>
                      <div className="text-white font-bold text-lg">{opponentName}</div>
                    </div>
                  </div>
                ) : null}

                {/* Right: Countdown */}
                <div className="flex items-center gap-3">
                  <Timer className="w-5 h-5 text-slate-400" />
                  <div className="text-right">
                    <div className="text-xs text-slate-400">Matches begin in</div>
                    <div className={`text-3xl font-black tabular-nums ${
                      timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-white'
                    }`}>
                      {timeLeft}s
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Phase: Starting */}
            {phase === 'starting' && (
              <div className="flex items-center justify-center gap-4">
                <Trophy className="w-6 h-6 text-emerald-400 animate-pulse" />
                <span className="text-emerald-400 font-bold text-lg">🎯 Tournament is LIVE! Loading your match...</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
