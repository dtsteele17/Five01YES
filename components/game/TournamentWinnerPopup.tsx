'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Trophy, 
  Crown, 
  Target, 
  TrendingUp, 
  Zap,
  ArrowRight,
  Eye,
  BarChart3,
  Calendar,
  Users
} from 'lucide-react';
import { motion } from 'framer-motion';
import { LegByLegStats } from '@/components/match/LegByLegStats';
import type { LegStats } from '@/lib/stats/legByLegStats';

interface TournamentWinnerPopupProps {
  isOpen: boolean;
  onClose: () => void;
  winner: {
    id: string;
    username: string;
    score: number;
  };
  loser: {
    id: string;
    username: string;
    score: number;
  };
  matchStats?: {
    legs_to_win: number;
    dartboard_type: string;
    match_format: string;
  };
  legStats?: LegStats[];
  tournamentId: string;
  tournamentMatchId: string;
  currentUserId: string;
  isWinner: boolean;
  tournamentName?: string;
  nextRound?: number;
}

export function TournamentWinnerPopup({
  isOpen,
  onClose,
  winner,
  loser,
  matchStats,
  legStats,
  tournamentId,
  tournamentMatchId,
  currentUserId,
  isWinner,
  tournamentName,
  nextRound
}: TournamentWinnerPopupProps) {
  const router = useRouter();
  const supabase = createClient();
  const [hasNextMatch, setHasNextMatch] = useState(false);
  const [nextMatchId, setNextMatchId] = useState<string | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const [tournamentComplete, setTournamentComplete] = useState(false);

  useEffect(() => {
    if (isOpen && isWinner) {
      checkNextMatch();
    }
  }, [isOpen, isWinner]);

  const checkNextMatch = async () => {
    try {
      // Check if there's a next match for the winner
      const { data: nextMatch, error } = await supabase
        .from('tournament_matches')
        .select('id, round, status')
        .eq('tournament_id', tournamentId)
        .or(`player1_id.eq.${currentUserId},player2_id.eq.${currentUserId}`)
        .eq('status', 'ready')
        .order('round', { ascending: true })
        .limit(1)
        .single();

      if (!error && nextMatch) {
        setHasNextMatch(true);
        setNextMatchId(nextMatch.id);
      } else {
        // Check if tournament is complete
        const { data: tournament, error: tournamentError } = await supabase
          .from('tournaments')
          .select('status, winner_id')
          .eq('id', tournamentId)
          .single();

        if (!tournamentError && tournament) {
          setTournamentComplete(tournament.status === 'completed');
        }
      }
    } catch (error) {
      console.error('Error checking next match:', error);
    }
  };

  const handleNextRound = async () => {
    if (!hasNextMatch || !nextMatchId) return;
    
    setLoadingNext(true);
    router.push(`/app/tournaments/${tournamentId}/match/${nextMatchId}`);
  };

  const handleViewTournament = () => {
    router.push(`/app/tournaments/${tournamentId}`);
    onClose();
  };

  const handleClose = () => {
    onClose();
    router.push(`/app/tournaments/${tournamentId}`);
  };

  const getMatchDescription = () => {
    if (matchStats?.match_format) {
      return matchStats.match_format.replace('best_of_', 'Best of ');
    }
    return `Best of ${(matchStats?.legs_to_win || 3) * 2 - 1}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-slate-900/95 backdrop-blur-xl border-white/10 max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="space-y-6">
          {/* Tournament Header */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
              <Trophy className="w-4 h-4" />
              <span>{tournamentName}</span>
              {nextRound && (
                <>
                  <span>•</span>
                  <span>Round {nextRound}</span>
                </>
              )}
            </div>
          </div>

          {/* Winner Announcement */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className={`text-center space-y-4 p-8 rounded-2xl ${
              isWinner 
                ? 'bg-gradient-to-br from-emerald-500/20 via-emerald-600/10 to-blue-500/20 border border-emerald-500/30'
                : 'bg-gradient-to-br from-slate-800/50 to-slate-700/30 border border-white/10'
            }`}
          >
            <motion.div
              initial={{ rotate: -10, scale: 0.5 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
              className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${
                isWinner ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : 'bg-gradient-to-br from-slate-600 to-slate-700'
              }`}
            >
              {isWinner ? (
                <Crown className="w-10 h-10 text-white" />
              ) : (
                <Target className="w-10 h-10 text-slate-300" />
              )}
            </motion.div>

            <div>
              <h1 className={`text-3xl font-black ${isWinner ? 'text-emerald-400' : 'text-slate-300'}`}>
                {isWinner ? 'Victory!' : 'Match Complete'}
              </h1>
              <p className="text-slate-400 text-lg mt-2">
                {isWinner 
                  ? `You defeated ${loser.username} ${winner.score}-${loser.score}`
                  : `${winner.username} defeated you ${winner.score}-${loser.score}`
                }
              </p>
            </div>
          </motion.div>

          {/* Match Summary */}
          <Card className="bg-slate-800/30 border-white/10">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Match Details */}
                <div className="space-y-3">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <Target className="w-4 h-4 text-slate-400" />
                    Match Details
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Format:</span>
                      <span className="text-white">{getMatchDescription()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Final Score:</span>
                      <span className="text-white font-semibold">{winner.score} - {loser.score}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Game:</span>
                      <span className="text-white">501 Darts</span>
                    </div>
                  </div>
                </div>

                {/* Tournament Status */}
                <div className="space-y-3">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-slate-400" />
                    Tournament
                  </h3>
                  <div className="space-y-2 text-sm">
                    {isWinner && hasNextMatch && (
                      <div className="flex items-center gap-2 text-emerald-400">
                        <ArrowRight className="w-3 h-3" />
                        <span>Advanced to next round!</span>
                      </div>
                    )}
                    {isWinner && tournamentComplete && (
                      <div className="flex items-center gap-2 text-yellow-400">
                        <Crown className="w-3 h-3" />
                        <span>Tournament Champion!</span>
                      </div>
                    )}
                    {!isWinner && (
                      <div className="flex items-center gap-2 text-slate-400">
                        <Users className="w-3 h-3" />
                        <span>Tournament continues</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="space-y-3">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-slate-400" />
                    Performance
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Winner:</span>
                      <span className="text-emerald-400 font-semibold">{winner.username}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Legs Won:</span>
                      <span className="text-white">{winner.score}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Match Type:</span>
                      <span className="text-white">Tournament</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Leg by Leg Stats */}
          {legStats && legStats.length > 0 && (
            <Card className="bg-slate-800/30 border-white/10">
              <CardContent className="p-6">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-slate-400" />
                  Leg by Leg Breakdown
                </h3>
                <LegByLegStats
                  legStats={legStats}
                  playerName={winner.username}
                  opponentName={loser.username}
                />
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            {isWinner ? (
              <>
                {/* Winner Buttons */}
                {hasNextMatch ? (
                  <Button
                    onClick={handleNextRound}
                    disabled={loadingNext}
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/25"
                  >
                    {loadingNext ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-4 h-4 mr-2" />
                        Next Round
                      </>
                    )}
                  </Button>
                ) : tournamentComplete ? (
                  <Button
                    onClick={handleViewTournament}
                    className="flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-white font-bold shadow-lg shadow-yellow-500/25"
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    View Championship
                  </Button>
                ) : (
                  <Button
                    onClick={handleViewTournament}
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold shadow-lg shadow-emerald-500/25"
                  >
                    <Trophy className="w-4 h-4 mr-2" />
                    View Tournament
                  </Button>
                )}
                
                <Button
                  onClick={handleViewTournament}
                  variant="outline"
                  className="flex-1 border-white/20 text-white hover:bg-white/10"
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Tournament
                </Button>
              </>
            ) : (
              <>
                {/* Loser Buttons */}
                <Button
                  onClick={handleViewTournament}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold shadow-lg shadow-blue-500/25"
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  View Tournament
                </Button>
                
                <Button
                  onClick={handleClose}
                  variant="outline"
                  className="flex-1 border-white/20 text-white hover:bg-white/10"
                >
                  Leave Tournament
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}