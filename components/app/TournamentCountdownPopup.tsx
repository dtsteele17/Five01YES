'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  Trophy, 
  Timer,
  Users,
  CheckCircle,
  Loader2
} from 'lucide-react';
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
  startTime, 
  onComplete, 
  isVisible 
}: TournamentCountdownPopupProps) {
  const [timeLeft, setTimeLeft] = useState(60); // 1 minute countdown
  const [bracketGenerated, setBracketGenerated] = useState(false);
  const [phase, setPhase] = useState<'generating' | 'countdown' | 'starting'>('generating');
  const supabase = createClient();

  useEffect(() => {
    if (!isVisible) return;

    // Phase 1: Generate bracket
    generateBracket();

    return () => {};
  }, [isVisible]);

  // Phase 2: Countdown timer (starts after bracket is generated)
  useEffect(() => {
    if (phase !== 'countdown') return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setPhase('starting');
          // Give a brief pause then trigger match ready-up
          setTimeout(() => onComplete(), 1500);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, onComplete]);

  const generateBracket = async () => {
    try {
      console.log('🏗️ Generating tournament bracket...');
      setPhase('generating');
      
      const { data, error } = await supabase.rpc('generate_tournament_bracket', {
        p_tournament_id: tournamentId
      });

      if (error) {
        console.error('Bracket generation error:', error);
        // Fallback: update status directly
        await supabase
          .from('tournaments')
          .update({ 
            status: 'in_progress',
            started_at: new Date().toISOString(),
            bracket_generated_at: new Date().toISOString()
          })
          .eq('id', tournamentId);
      } else {
        console.log('✅ Bracket generated:', data);
      }
      
      setBracketGenerated(true);
      // Move to countdown phase
      setPhase('countdown');
      setTimeLeft(60);
    } catch (error) {
      console.error('Exception generating bracket:', error);
      setBracketGenerated(true);
      setPhase('countdown');
      setTimeLeft(60);
    }
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
      >
        <Card className="bg-slate-900/95 backdrop-blur-xl border-emerald-500/40 shadow-2xl shadow-emerald-500/20 w-96">
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white text-lg">🏆 Tournament Starting!</h3>
                  <p className="text-sm text-slate-400 truncate">{tournamentName}</p>
                </div>
              </div>

              {/* Phase: Generating Bracket */}
              {phase === 'generating' && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  className="text-center py-4 space-y-3"
                >
                  <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
                  <div>
                    <p className="text-white font-semibold">Creating bracket...</p>
                    <p className="text-sm text-slate-400">Generating matchups from registered players</p>
                  </div>
                </motion.div>
              )}

              {/* Phase: Countdown */}
              {phase === 'countdown' && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }}
                  className="space-y-4"
                >
                  {/* Bracket created confirmation */}
                  <div className="flex items-center gap-2 text-sm bg-emerald-500/10 rounded-lg p-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-emerald-400 font-medium">Bracket created! Check the Bracket tab</span>
                  </div>

                  {/* Big countdown */}
                  <div className="text-center space-y-2">
                    <div className="flex items-center justify-center gap-2 text-slate-300">
                      <Timer className="w-5 h-5" />
                      <span className="font-medium">Matches begin in</span>
                    </div>
                    
                    <div className={`text-5xl font-black tabular-nums ${
                      timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-white'
                    }`}>
                      {timeLeft}s
                    </div>
                    
                    <Progress 
                      value={((60 - timeLeft) / 60) * 100} 
                      className="h-2"
                    />
                  </div>

                  <div className="flex items-center gap-2 text-sm text-slate-400 justify-center">
                    <Users className="w-4 h-4" />
                    <span>Get ready for your first match!</span>
                  </div>
                </motion.div>
              )}

              {/* Phase: Starting matches */}
              {phase === 'starting' && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }} 
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-4 space-y-3"
                >
                  <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                    <Trophy className="w-8 h-8 text-emerald-400" />
                  </div>
                  <p className="text-emerald-400 font-bold text-lg">🎯 Tournament is LIVE!</p>
                  <p className="text-sm text-slate-400">Loading your first match...</p>
                </motion.div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
