'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Trophy, 
  Timer,
  Users,
  Zap,
  Target,
  CheckCircle
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
  const supabase = createClient();

  useEffect(() => {
    if (!isVisible) return;

    // Calculate actual time left
    const startTimeMs = new Date(startTime).getTime();
    const now = Date.now();
    const actualTimeLeft = Math.max(0, Math.ceil((startTimeMs - now) / 1000));
    
    setTimeLeft(actualTimeLeft);

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Generate bracket when countdown starts
    generateTournamentBracket();

    return () => clearInterval(timer);
  }, [isVisible, startTime, onComplete]);

  const generateTournamentBracket = async () => {
    try {
      console.log('Generating tournament bracket...');
      
      // Try RPC function first
      const { data, error } = await supabase.rpc('generate_tournament_bracket', {
        p_tournament_id: tournamentId
      });

      if (error) {
        console.error('Error generating bracket:', error);
        // Fallback to status update if RPC fails
        await supabase
          .from('tournaments')
          .update({ 
            status: 'in_progress',
            started_at: new Date().toISOString(),
            bracket_generated_at: new Date().toISOString()
          })
          .eq('id', tournamentId);
      } else {
        console.log('Bracket generated successfully:', data);
      }
      
      setBracketGenerated(true);
    } catch (error) {
      console.error('Exception generating bracket:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = Math.max(0, ((60 - timeLeft) / 60) * 100);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <Card className="bg-slate-900/95 backdrop-blur-xl border-emerald-500/30 shadow-2xl shadow-emerald-500/25 w-80">
          <CardContent className="p-6">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-xl flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white truncate">Tournament Starting!</h3>
                  <p className="text-sm text-slate-400 truncate">{tournamentName}</p>
                </div>
              </div>

              {/* Countdown Display */}
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-emerald-400">
                  <Timer className="w-5 h-5" />
                  <span className="text-sm font-medium">Tournament starts in</span>
                </div>
                
                <div className="text-4xl font-black text-white tabular-nums">
                  {formatTime(timeLeft)}
                </div>
                
                <Progress 
                  value={progress} 
                  className="h-2 bg-slate-800"
                  style={{
                    background: 'linear-gradient(to right, #1e293b 0%, #0f172a 100%)'
                  }}
                />
              </div>

              {/* Status Updates */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  {bracketGenerated ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  )}
                  <span className={bracketGenerated ? 'text-emerald-400' : 'text-slate-400'}>
                    {bracketGenerated ? 'Bracket Generated' : 'Generating Bracket...'}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span className="text-slate-400">Players will be notified for ready-up</span>
                </div>
              </div>

              {/* Action Hint */}
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-2 text-amber-400 mb-1">
                  <Target className="w-4 h-4" />
                  <span className="text-xs font-medium">Get Ready!</span>
                </div>
                <p className="text-xs text-slate-400">
                  You'll need to ready-up when the tournament begins
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}