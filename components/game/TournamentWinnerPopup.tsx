'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trophy, Crown, Target, ArrowRight, Eye, Home, Sparkles, Shield, ThumbsUp, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { LegByLegStats } from '@/components/match/LegByLegStats';
import type { LegStats } from '@/lib/stats/legByLegStats';

interface PlayerStats {
  id: string;
  name: string;
  legsWon: number;
  threeDartAverage: number;
  first9Average: number;
  highestCheckout: number;
  checkoutPercentage: number;
  totalDartsThrown: number;
  bestLegDarts: number;
  bestLegNum: number;
  totalScore: number;
  checkouts: number;
  checkoutAttempts: number;
  count100Plus?: number;
  count140Plus?: number;
  oneEighties?: number;
}

interface SimplePlayer {
  id: string;
  name: string;
  legs: number;
}

interface TournamentWinnerPopupProps {
  isOpen: boolean;
  onClose: () => void;
  player1: SimplePlayer;
  player2: SimplePlayer;
  player1Stats: PlayerStats;
  player2Stats: PlayerStats;
  winnerId: string;
  gameMode: string;
  bestOf: number;
  currentUserId: string;
  tournamentId: string;
  tournamentMatchId: string;
  tournamentName?: string;
  legStats?: LegStats[];
}

export function TournamentWinnerPopup({
  isOpen,
  onClose,
  player1,
  player2,
  player1Stats,
  player2Stats,
  winnerId,
  gameMode,
  bestOf,
  currentUserId,
  tournamentId,
  tournamentMatchId,
  tournamentName,
  legStats = [],
}: TournamentWinnerPopupProps) {
  const router = useRouter();
  const supabase = createClient();
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  
  const isWinner = currentUserId === winnerId;
  const isPlayer1Winner = player1.id === winnerId;
  const winnerName = isPlayer1Winner ? player1.name : player2.name;

  const p1Color = isPlayer1Winner ? 'text-amber-400' : 'text-blue-400';
  const p1Border = isPlayer1Winner ? 'border-amber-500/30' : 'border-blue-500/30';
  const p1Bg = isPlayer1Winner ? 'from-amber-500/10 to-amber-600/10' : 'from-blue-500/10 to-blue-600/10';
  const p2Color = isPlayer1Winner ? 'text-blue-400' : 'text-amber-400';
  const p2Border = isPlayer1Winner ? 'border-blue-500/30' : 'border-amber-500/30';
  const p2Bg = isPlayer1Winner ? 'from-blue-500/10 to-blue-600/10' : 'from-amber-500/10 to-amber-600/10';

  const fmt = (v: number, suffix = '') => (v > 0 ? `${v.toFixed(1)}${suffix}` : '-');
  const fmtInt = (v: number) => (v > 0 ? v.toString() : '-');

  const handleNextRound = () => {
    router.push(`/app/tournaments/${tournamentId}`);
    onClose();
  };

  const handleViewTournament = () => {
    router.push(`/app/tournaments/${tournamentId}`);
    onClose();
  };

  const handleReturnToPlay = () => {
    router.push('/app/play');
    onClose();
  };

  const opponentId = currentUserId === player1.id ? player2.id : player1.id;
  const opponentName = currentUserId === player1.id ? player2.name : player1.name;
  const GRADE_COLORS: Record<string, string> = {
    'A': 'bg-emerald-600 text-white', 'B': 'bg-blue-600 text-white',
    'C': 'bg-yellow-600 text-white', 'D': 'bg-orange-600 text-white', 'E': 'bg-red-600 text-white'
  };
  const gradeLabels: Record<string, string> = {
    'A': 'Excellent - Fair play', 'B': 'Good', 'C': 'Average', 'D': 'Suspicious', 'E': 'Cheating'
  };

  const handleSubmitRating = async () => {
    if (!selectedGrade) return;
    try {
      await supabase.rpc('rate_opponent_safety', {
        p_match_id: tournamentMatchId,
        p_rated_user_id: opponentId,
        p_grade: selectedGrade
      });
    } catch (e) { console.log('Rating error:', e); }
    setRatingSubmitted(true);
  };

  return (
    <Dialog open={isOpen} modal>
      <DialogContent
        className="bg-slate-900/[0.98] border-slate-700 text-white w-full max-w-3xl p-0 overflow-hidden backdrop-blur-sm"
        style={{ maxHeight: '90vh' }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Winner Header */}
        <div className={`relative border-b p-4 ${
          isWinner
            ? 'bg-gradient-to-r from-emerald-600/20 via-emerald-500/20 to-emerald-600/20 border-emerald-500/30'
            : 'bg-gradient-to-r from-slate-700/30 via-slate-600/20 to-slate-700/30 border-slate-600/30'
        }`}>
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(4)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute"
                style={{ left: `${20 + i * 20}%`, top: `${20 + (i % 2) * 60}%` }}
                animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5], rotate: [0, 180] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
              >
                <Sparkles className={`w-3 h-3 ${isWinner ? 'text-emerald-400' : 'text-slate-500'}`} />
              </motion.div>
            ))}
          </div>

          <div className="relative text-center space-y-1">
            {tournamentName && (
              <div className="flex items-center justify-center gap-2 text-slate-400 text-xs">
                <Trophy className="w-3 h-3" />
                <span>{tournamentName}</span>
              </div>
            )}
            <div className="flex items-center justify-center gap-3">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200 }}>
                <Crown className={`w-6 h-6 ${isWinner ? 'text-emerald-400' : 'text-slate-500'}`} />
              </motion.div>
              <DialogHeader className="space-y-0">
                <DialogTitle className={`text-xl font-black ${isWinner ? 'text-emerald-400' : 'text-slate-300'}`}>
                  {isWinner ? 'Victory!' : 'Match Complete'}
                </DialogTitle>
              </DialogHeader>
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}>
                <Trophy className={`w-6 h-6 ${isWinner ? 'text-emerald-400' : 'text-slate-500'}`} />
              </motion.div>
            </div>
            <p className="text-slate-400 text-xs">{gameMode} • Best of {bestOf}</p>
          </div>
        </div>

        {/* Score */}
        <div className="px-4 py-3">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-600">
            <div className="flex items-center justify-center gap-12">
              <div className="text-center">
                <div className={`${p1Color} text-sm font-bold mb-1`}>{player1.name}</div>
                <div className={`text-5xl font-black ${p1Color}`}>{player1.legs}</div>
              </div>
              <div className="text-2xl font-bold text-slate-500">-</div>
              <div className="text-center">
                <div className={`${p2Color} text-sm font-bold mb-1`}>{player2.name}</div>
                <div className={`text-5xl font-black ${p2Color}`}>{player2.legs}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats - Side by Side */}
        <div className="px-4 flex gap-4">
          {/* Player 1 */}
          <div className={`flex-1 bg-gradient-to-b ${p1Bg} ${p1Border} border rounded-xl p-3`}>
            <div className="text-center mb-3">
              <div className={`font-bold ${p1Color} text-lg`}>{player1.name}</div>
              {isPlayer1Winner && <div className="text-xs text-amber-400/70 font-medium">🏆 Winner</div>}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between"><span className="text-slate-400 text-sm">3-Dart Avg</span><span className={`font-bold ${p1Color} text-base`}>{fmt(player1Stats?.threeDartAverage)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">First 9</span><span className={`font-bold ${p1Color} text-base`}>{fmt(player1Stats?.first9Average)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">Best Checkout</span><span className={`font-bold ${p1Color} text-base`}>{(player1Stats?.checkouts || 0) > 0 ? fmtInt(player1Stats?.highestCheckout) : '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">Checkout %</span><span className={`font-bold ${p1Color} text-base`}>{fmt(player1Stats?.checkoutPercentage, '%')}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">Best Leg</span><span className={`font-bold ${p1Color} text-base`}>{player1Stats?.bestLegDarts > 0 ? `${player1Stats.bestLegDarts} darts` : '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">100+/140+/180</span><span className={`font-bold ${p1Color} text-sm`}>{player1Stats?.count100Plus || 0}/{player1Stats?.count140Plus || 0}/{player1Stats?.oneEighties || 0}</span></div>
            </div>
          </div>
          {/* Player 2 */}
          <div className={`flex-1 bg-gradient-to-b ${p2Bg} ${p2Border} border rounded-xl p-3`}>
            <div className="text-center mb-3">
              <div className={`font-bold ${p2Color} text-lg`}>{player2.name}</div>
              {!isPlayer1Winner && <div className="text-xs text-amber-400/70 font-medium">🏆 Winner</div>}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between"><span className="text-slate-400 text-sm">3-Dart Avg</span><span className={`font-bold ${p2Color} text-base`}>{fmt(player2Stats?.threeDartAverage)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">First 9</span><span className={`font-bold ${p2Color} text-base`}>{fmt(player2Stats?.first9Average)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">Best Checkout</span><span className={`font-bold ${p2Color} text-base`}>{(player2Stats?.checkouts || 0) > 0 ? fmtInt(player2Stats?.highestCheckout) : '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">Checkout %</span><span className={`font-bold ${p2Color} text-base`}>{fmt(player2Stats?.checkoutPercentage, '%')}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">Best Leg</span><span className={`font-bold ${p2Color} text-base`}>{player2Stats?.bestLegDarts > 0 ? `${player2Stats.bestLegDarts} darts` : '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">100+/140+/180</span><span className={`font-bold ${p2Color} text-sm`}>{player2Stats?.count100Plus || 0}/{player2Stats?.count140Plus || 0}/{player2Stats?.oneEighties || 0}</span></div>
            </div>
          </div>
        </div>

        {/* Leg-by-Leg Stats */}
        {legStats && legStats.length > 0 && (
          <div className="px-4 pb-2">
            <LegByLegStats
              legStats={legStats}
              playerName={player1.name}
              opponentName={player2.name}
            />
          </div>
        )}

        {/* Trust Rating */}
        <div className="px-4 pt-3">
          {!ratingSubmitted ? (
            <div className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/50">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-slate-300">Rate {opponentName}</span>
              </div>
              <div className="flex gap-1.5 mb-2">
                {['A', 'B', 'C', 'D', 'E'].map(grade => (
                  <button
                    key={grade}
                    onClick={() => setSelectedGrade(grade)}
                    className={`flex-1 py-1.5 rounded text-sm font-bold transition-all ${
                      selectedGrade === grade 
                        ? `${GRADE_COLORS[grade]} ring-2 ring-white/30 scale-105` 
                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50'
                    }`}
                  >
                    {grade}
                  </button>
                ))}
              </div>
              {selectedGrade && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">{gradeLabels[selectedGrade]}</span>
                  <button
                    onClick={handleSubmitRating}
                    className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors"
                  >
                    Submit
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-emerald-400 justify-center py-2">
              <Check className="w-4 h-4" />
              Rating submitted
            </div>
          )}
        </div>

        {/* Action Buttons - different for winner vs loser */}
        <div className="px-4 pb-4 pt-3">
          {isWinner ? (
            <div className="flex gap-3">
              <Button
                onClick={handleNextRound}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 h-auto text-sm font-semibold"
              >
                <ArrowRight className="w-4 h-4 mr-1" />
                Next Round
              </Button>
              <Button
                onClick={handleViewTournament}
                variant="outline"
                className="flex-1 border-blue-500/50 text-blue-400 hover:bg-blue-500/10 py-3 h-auto text-sm font-semibold"
              >
                <Eye className="w-4 h-4 mr-1" />
                View Tournament
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button
                onClick={handleReturnToPlay}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 h-auto text-sm font-semibold"
              >
                <Home className="w-4 h-4 mr-1" />
                Return to Play Menu
              </Button>
              <Button
                onClick={handleViewTournament}
                variant="outline"
                className="flex-1 border-blue-500/50 text-blue-400 hover:bg-blue-500/10 py-3 h-auto text-sm font-semibold"
              >
                <Eye className="w-4 h-4 mr-1" />
                View Tournament
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
