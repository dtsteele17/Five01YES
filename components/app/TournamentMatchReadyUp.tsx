'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { 
  Clock,
  Users, 
  Trophy, 
  CheckCircle, 
  AlertCircle,
  Timer,
  Target,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface TournamentMatchReadyUpProps {
  matchId: string;
  tournamentId: string;
}

interface MatchData {
  id: string;
  status: string;
  player1_id: string;
  player2_id: string;
  tournament_name: string;
  round: number;
}

interface ReadyStatus {
  user_id: string;
  ready_at: string;
  expires_at: string;
  is_ready: boolean;
}

interface ReadyUpData {
  success: boolean;
  match: MatchData;
  ready_status: ReadyStatus[];
  user_is_participant: boolean;
}

export function TournamentMatchReadyUp({ matchId, tournamentId }: TournamentMatchReadyUpProps) {
  const router = useRouter();
  const supabase = createClient();
  
  const [readyUpData, setReadyUpData] = useState<ReadyUpData | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(180); // 3 minutes
  const [isReady, setIsReady] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [readyUpLoading, setReadyUpLoading] = useState(false);

  useEffect(() => {
    loadCurrentUser();
    loadMatchStatus();
    
    // Set up real-time subscription for ready-up changes
    const readyUpSubscription = supabase
      .channel(`tournament-readyup-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_match_readyup',
          filter: `match_id=eq.${matchId}`,
        },
        () => {
          loadMatchStatus();
        }
      )
      .subscribe();

    // Timer countdown
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      readyUpSubscription.unsubscribe();
      clearInterval(timer);
    };
  }, [matchId]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  const loadMatchStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('get_tournament_match_ready_status', {
        p_match_id: matchId
      });

      if (error) throw error;

      const result = data as ReadyUpData;
      setReadyUpData(result);

      if (result.success && currentUserId) {
        // Check if current user is ready
        const userReadyStatus = result.ready_status.find(rs => rs.user_id === currentUserId);
        setIsReady(userReadyStatus?.is_ready || false);
        
        // Check if opponent is ready
        const opponentReadyStatus = result.ready_status.find(rs => rs.user_id !== currentUserId);
        setOpponentReady(opponentReadyStatus?.is_ready || false);

        // Update timer based on user's ready status
        if (userReadyStatus?.expires_at) {
          const expiresAt = new Date(userReadyStatus.expires_at);
          const now = new Date();
          const secondsLeft = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
          setTimeLeft(secondsLeft);
        }

        // If both players are ready and match is starting, redirect to match
        if (result.match.status === 'starting' || result.match.status === 'in_progress') {
          router.push(`/app/tournaments/${tournamentId}/match/${matchId}`);
        }
      }
    } catch (error) {
      console.error('Error loading match status:', error);
      toast.error('Failed to load match status');
    } finally {
      setLoading(false);
    }
  };

  const handleReadyUp = async () => {
    if (!currentUserId) {
      toast.error('Please log in to ready up');
      return;
    }

    try {
      setReadyUpLoading(true);
      
      const { data, error } = await supabase.rpc('tournament_match_ready_up', {
        p_match_id: matchId
      });

      if (error) throw error;

      const result = data as { success: boolean; both_ready: boolean; message: string };

      if (!result.success) {
        throw new Error('Failed to ready up');
      }

      toast.success(result.message);
      
      if (result.both_ready) {
        // Both players ready, will redirect via loadMatchStatus
        setTimeout(() => {
          loadMatchStatus();
        }, 1000);
      }

    } catch (error: any) {
      console.error('Error readying up:', error);
      toast.error(error.message || 'Failed to ready up');
    } finally {
      setReadyUpLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getOpponentName = () => {
    if (!readyUpData || !currentUserId) return 'Opponent';
    
    const opponentId = readyUpData.match.player1_id === currentUserId 
      ? readyUpData.match.player2_id 
      : readyUpData.match.player1_id;
    
    // You'd need to fetch opponent username - for now return generic name
    return 'Opponent';
  };

  const getProgressPercentage = () => {
    return Math.max(0, (timeLeft / 180) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto mb-4"></div>
          <h2 className="text-xl font-bold text-white mb-2">Loading Match</h2>
          <p className="text-slate-400">Preparing tournament match...</p>
        </div>
      </div>
    );
  }

  if (!readyUpData || !readyUpData.success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Match Not Found</h2>
          <p className="text-slate-400 mb-6">Unable to load match details.</p>
          <Button 
            onClick={() => router.push(`/app/tournaments/${tournamentId}`)}
            variant="outline"
          >
            Back to Tournament
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Tournament Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Trophy className="w-4 h-4" />
            <span>{readyUpData.match.tournament_name}</span>
            <span>•</span>
            <span>Round {readyUpData.match.round}</span>
          </div>
          <h1 className="text-3xl font-black text-white">Match Ready Up</h1>
        </div>

        {/* Ready Up Card */}
        <Card className="bg-slate-900/60 backdrop-blur-sm border-white/10 shadow-2xl shadow-slate-900/25">
          <CardContent className="p-8">
            <div className="space-y-8">
              
              {/* Timer */}
              <div className="text-center space-y-4">
                <div className="relative w-32 h-32 mx-auto">
                  <svg className="w-32 h-32 transform -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      fill="transparent"
                      stroke="rgb(51 65 85)"
                      strokeWidth="8"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r="56"
                      fill="transparent"
                      stroke={timeLeft > 30 ? "rgb(34 197 94)" : "rgb(239 68 68)"}
                      strokeWidth="8"
                      strokeDasharray={`${2 * Math.PI * 56}`}
                      strokeDashoffset={`${2 * Math.PI * 56 * (1 - getProgressPercentage() / 100)}`}
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className={`text-2xl font-black ${timeLeft > 30 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatTime(timeLeft)}
                      </div>
                      <div className="text-xs text-slate-400">remaining</div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <h2 className="text-xl font-bold text-white">Ready Up Time</h2>
                  <p className="text-slate-400">Both players must ready up to start the match</p>
                </div>
              </div>

              {/* Players Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Current User */}
                <div className={`p-6 rounded-2xl border-2 transition-all ${
                  isReady 
                    ? 'bg-emerald-500/10 border-emerald-500/30' 
                    : 'bg-slate-800/30 border-white/10'
                }`}>
                  <div className="flex items-center gap-4 mb-4">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-slate-700 text-white font-semibold">
                        You
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-white font-semibold">You</div>
                      <div className="text-xs text-slate-400">Player</div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <Badge 
                      className={`w-full justify-center py-2 ${
                        isReady
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                      }`}
                    >
                      {isReady ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Ready!
                        </>
                      ) : (
                        <>
                          <Clock className="w-4 h-4 mr-2" />
                          Not Ready
                        </>
                      )}
                    </Badge>
                    
                    {!isReady && (
                      <Button
                        onClick={handleReadyUp}
                        disabled={readyUpLoading || timeLeft <= 0}
                        className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/25"
                      >
                        {readyUpLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                            Readying Up...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 mr-2" />
                            Ready Up!
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Opponent */}
                <div className={`p-6 rounded-2xl border-2 transition-all ${
                  opponentReady 
                    ? 'bg-emerald-500/10 border-emerald-500/30' 
                    : 'bg-slate-800/30 border-white/10'
                }`}>
                  <div className="flex items-center gap-4 mb-4">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback className="bg-slate-700 text-white font-semibold">
                        {getOpponentName()[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="text-white font-semibold">{getOpponentName()}</div>
                      <div className="text-xs text-slate-400">Player</div>
                    </div>
                  </div>
                  
                  <Badge 
                    className={`w-full justify-center py-2 ${
                      opponentReady
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                    }`}
                  >
                    {opponentReady ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Ready!
                      </>
                    ) : (
                      <>
                        <Clock className="w-4 h-4 mr-2" />
                        Waiting...
                      </>
                    )}
                  </Badge>
                </div>
              </div>

              {/* Status Message */}
              <div className="text-center">
                <AnimatePresence mode="wait">
                  {isReady && opponentReady ? (
                    <motion.div
                      key="both-ready"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="space-y-3"
                    >
                      <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                        <CheckCircle className="w-8 h-8 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-emerald-400">Both Players Ready!</h3>
                        <p className="text-slate-300">Starting match...</p>
                      </div>
                    </motion.div>
                  ) : isReady ? (
                    <motion.div
                      key="waiting"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="space-y-3"
                    >
                      <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto">
                        <Clock className="w-8 h-8 text-amber-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-amber-400">Waiting for Opponent</h3>
                        <p className="text-slate-300">You are ready. Waiting for your opponent to ready up.</p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="need-ready"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="space-y-3"
                    >
                      <div className="w-16 h-16 bg-slate-500/20 rounded-full flex items-center justify-center mx-auto">
                        <Timer className="w-8 h-8 text-slate-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">Ready Up Required</h3>
                        <p className="text-slate-300">Click "Ready Up!" when you're ready to start your match.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Back Button */}
              <div className="text-center pt-4 border-t border-slate-700">
                <Button 
                  variant="outline" 
                  onClick={() => router.push(`/app/tournaments/${tournamentId}`)}
                  className="text-slate-400 border-slate-600 hover:text-white hover:border-white"
                >
                  Back to Tournament
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}