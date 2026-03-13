'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Target, TrendingUp, Award, RotateCcw, Loader2, Check, Zap, Undo2, Crown, Sparkles, ThumbsUp, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SafetyGrade } from '@/lib/safety/safetyService';
import { GRADE_COLORS } from '@/lib/safety/safetyService';
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

interface WinnerPopupProps {
  player1: SimplePlayer;
  player2: SimplePlayer;
  player1Stats: PlayerStats;
  player2Stats: PlayerStats;
  winnerId: string;
  gameMode: string;
  bestOf: number;
  onRematch: () => void;
  onReturn: () => void;
  rematchStatus?: 'none' | 'waiting' | 'ready' | 'creating';
  opponentRematchReady?: boolean;
  youReady?: boolean;
  currentUserId?: string;
  readyCount?: number; // 0, 1, or 2 - for showing Rematch 1/2, 2/2
  // Safety rating props
  matchId?: string;
  onRateOpponent?: (grade: SafetyGrade) => void;
  hasRated?: boolean;
  isQuickMatch?: boolean;
  // Leg-by-leg stats
  legStats?: LegStats[];
  // Ranked match props
  isRankedMatch?: boolean;
  rpChange?: number;  // RP gained or lost
  rpAfter?: number;   // New RP total
  divisionName?: string;
}

export function WinnerPopup({
  player1,
  player2,
  player1Stats,
  player2Stats,
  winnerId,
  gameMode,
  bestOf,
  onRematch,
  onReturn,
  rematchStatus = 'none',
  opponentRematchReady = false,
  youReady = false,
  currentUserId,
  readyCount = 0,
  matchId,
  onRateOpponent,
  hasRated = false,
  isQuickMatch = false,
  legStats = [],
  isRankedMatch = false,
  rpChange,
  rpAfter,
  divisionName,
}: WinnerPopupProps) {
  const [selectedGrade, setSelectedGrade] = useState<SafetyGrade | null>(null);
  const [submitted, setSubmitted] = useState(hasRated);
  
  const isPlayer1Winner = player1.id === winnerId;
  const winnerName = isPlayer1Winner ? player1.name : player2.name;
  const opponentName = isPlayer1Winner ? player2.name : player1.name;
  const opponentId = isPlayer1Winner ? player2.id : player1.id;
  
  const p1Color = isPlayer1Winner ? 'text-amber-400' : 'text-blue-400';
  const p1Border = isPlayer1Winner ? 'border-amber-500/30' : 'border-blue-500/30';
  const p1Bg = isPlayer1Winner ? 'from-amber-500/10 to-amber-600/10' : 'from-blue-500/10 to-blue-600/10';
  
  const p2Color = isPlayer1Winner ? 'text-blue-400' : 'text-amber-400';
  const p2Border = isPlayer1Winner ? 'border-blue-500/30' : 'border-amber-500/30';
  const p2Bg = isPlayer1Winner ? 'from-blue-500/10 to-blue-600/10' : 'from-amber-500/10 to-amber-600/10';

  const getRematchButtonContent = () => {
    // Room being created
    if (rematchStatus === 'creating') {
      return (
        <>
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          Creating match...
        </>
      );
    }
    // Both ready - navigating to new game
    if (rematchStatus === 'ready' || readyCount >= 2) {
      return (
        <>
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          Starting... ({readyCount}/2)
        </>
      );
    }
    // I pressed rematch, waiting for opponent
    if (youReady) {
      return (
        <>
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          Waiting... ({readyCount}/2)
        </>
      );
    }
    // Opponent pressed rematch, waiting for me
    if (opponentRematchReady) {
      return (
        <>
          <RotateCcw className="w-4 h-4 mr-1" />
          Join ({readyCount}/2)
        </>
      );
    }
    // Initial state - nobody pressed yet
    return (
      <>
        <RotateCcw className="w-4 h-4 mr-1" />
        Rematch ({readyCount}/2)
      </>
    );
  };

  const fmt = (v: number, suffix = '') => v > 0 ? `${v.toFixed(1)}${suffix}` : '-';
  const fmtInt = (v: number) => v > 0 ? v.toString() : '-';

  // Handle rating submission
  const handleRate = (grade: SafetyGrade) => {
    setSelectedGrade(grade);
  };

  const handleSubmitRating = () => {
    if (selectedGrade && onRateOpponent) {
      onRateOpponent(selectedGrade);
      setSubmitted(true);
    }
  };

  // Safety rating labels
  const gradeLabels: Record<SafetyGrade, string> = {
    A: 'Excellent',
    B: 'Good',
    C: 'Average',
    D: 'Poor',
    E: 'Avoid'
  };

  // Stat row component
  const StatRow = ({ label, p1Value, p2Value, icon: Icon }: { label: string; p1Value: React.ReactNode; p2Value: React.ReactNode; icon: any }) => (
    <div className="flex items-center justify-between py-2 px-3 bg-slate-800/50 rounded-lg">
      <div className="flex items-center gap-2 text-slate-400 text-sm">
        <Icon className="w-4 h-4" />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-6">
        <span className={`font-bold ${p1Color} w-16 text-right text-base`}>{p1Value}</span>
        <span className={`font-bold ${p2Color} w-16 text-right text-base`}>{p2Value}</span>
      </div>
    </div>
  );

  return (
    <Dialog open={true} modal>
      <DialogContent 
        className="bg-slate-900 border-slate-700 text-white w-full max-w-3xl p-0 flex flex-col"
        style={{ maxHeight: '90vh' }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Compact Winner Header */}
        <div className="relative bg-gradient-to-r from-amber-600/20 via-yellow-500/20 to-amber-600/20 border-b border-amber-500/30 p-4">
          {/* Sparkles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(4)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute"
                style={{ left: `${20 + i * 20}%`, top: `${20 + (i % 2) * 60}%` }}
                animate={{ opacity: [0, 1, 0], scale: [0.5, 1, 0.5], rotate: [0, 180] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
              >
                <Sparkles className="w-3 h-3 text-yellow-400" />
              </motion.div>
            ))}
          </div>

          <div className="relative flex items-center justify-center gap-3">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <Crown className="w-6 h-6 text-yellow-400" />
            </motion.div>
            
            <DialogHeader className="space-y-0">
              <DialogTitle className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300">
                {winnerName} Wins!
              </DialogTitle>
            </DialogHeader>
            
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
            >
              <Trophy className="w-6 h-6 text-yellow-400" />
            </motion.div>
          </div>
          
          <p className="text-slate-400 text-xs text-center mt-1">
            {gameMode} • Best of {bestOf}
          </p>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto min-h-0">

        {/* Score Display */}
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

        {/* Stats - Side by Side Layout */}
        <div className="px-4 flex gap-4">
          {/* Player 1 Stats */}
          <div className={`flex-1 bg-gradient-to-b ${p1Bg} ${p1Border} border rounded-xl p-3`}>
            <div className="text-center mb-3">
              <div className={`font-bold ${p1Color} text-lg`}>{player1.name}</div>
              {isPlayer1Winner && (
                <div className="text-xs text-amber-400/70 font-medium">🏆 Winner</div>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">3-Dart Avg</span>
                <span className={`font-bold ${p1Color} text-base`}>{fmt(player1Stats?.threeDartAverage)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">First 9</span>
                <span className={`font-bold ${p1Color} text-base`}>{fmt(player1Stats?.first9Average)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Best Checkout</span>
                <span className={`font-bold ${p1Color} text-base`}>
                  {(player1Stats?.checkouts || 0) > 0 ? fmtInt(player1Stats?.highestCheckout) : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Checkout %</span>
                <span className={`font-bold ${p1Color} text-base`}>{fmt(player1Stats?.checkoutPercentage, '%')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Best Leg</span>
                <span className={`font-bold ${p1Color} text-base`}>
                  {player1Stats?.bestLegDarts > 0 ? `${player1Stats.bestLegDarts} darts` : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">100+/140+/180</span>
                <span className={`font-bold ${p1Color} text-sm`}>
                  {player1Stats?.count100Plus || 0}/{player1Stats?.count140Plus || 0}/{player1Stats?.oneEighties || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Player 2 Stats */}
          <div className={`flex-1 bg-gradient-to-b ${p2Bg} ${p2Border} border rounded-xl p-3`}>
            <div className="text-center mb-3">
              <div className={`font-bold ${p2Color} text-lg`}>{player2.name}</div>
              {!isPlayer1Winner && (
                <div className="text-xs text-amber-400/70 font-medium">🏆 Winner</div>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">3-Dart Avg</span>
                <span className={`font-bold ${p2Color} text-base`}>{fmt(player2Stats?.threeDartAverage)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">First 9</span>
                <span className={`font-bold ${p2Color} text-base`}>{fmt(player2Stats?.first9Average)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Best Checkout</span>
                <span className={`font-bold ${p2Color} text-base`}>
                  {(player2Stats?.checkouts || 0) > 0 ? fmtInt(player2Stats?.highestCheckout) : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Checkout %</span>
                <span className={`font-bold ${p2Color} text-base`}>{fmt(player2Stats?.checkoutPercentage, '%')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Best Leg</span>
                <span className={`font-bold ${p2Color} text-base`}>
                  {player2Stats?.bestLegDarts > 0 ? `${player2Stats.bestLegDarts} darts` : '-'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">100+/140+/180</span>
                <span className={`font-bold ${p2Color} text-sm`}>
                  {player2Stats?.count100Plus || 0}/{player2Stats?.count140Plus || 0}/{player2Stats?.oneEighties || 0}
                </span>
              </div>
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
        {isQuickMatch && !submitted && (
          <div className="px-4 pb-3">
            <div className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/50">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-slate-300">Rate {opponentName}</span>
              </div>
              <div className="flex gap-1.5 mb-2">
                {(['A', 'B', 'C', 'D', 'E'] as SafetyGrade[]).map((grade) => (
                  <button
                    key={grade}
                    onClick={() => handleRate(grade)}
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
          </div>
        )}

        {isQuickMatch && submitted && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2 text-sm text-emerald-400 justify-center py-2">
              <Check className="w-4 h-4" />
              Rating submitted
            </div>
          </div>
        )}

        {/* Ranked RP Change */}
        {isRankedMatch && rpChange !== undefined && (
          <div className="px-4 pb-2">
            <div className={`text-center p-4 rounded-xl border ${
              rpChange >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
            }`}>
              <p className="text-slate-400 text-xs mb-1 uppercase tracking-wider">Rating Change</p>
              <span className={`text-4xl font-black ${rpChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {rpChange > 0 ? '+' : ''}{rpChange} RP
              </span>
              {rpAfter !== undefined && (
                <p className="text-slate-400 text-sm mt-1">
                  New Rating: <span className="text-white font-bold">{rpAfter} RP</span>
                  {divisionName && <span className="ml-2 text-amber-400">({divisionName})</span>}
                </p>
              )}
            </div>
          </div>
        )}

        </div>{/* End scrollable content */}

        {/* Action Buttons — fixed at bottom */}
        <div className="px-4 pb-4 pt-3 border-t border-slate-700/50 shrink-0">
          {isRankedMatch ? (
            <div className="flex gap-3">
              <Button
                onClick={onReturn}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 h-auto text-sm font-semibold"
              >
                <Undo2 className="w-4 h-4 mr-1" />
                Return to Menu
              </Button>
              <Button
                onClick={onRematch}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 h-auto text-sm font-semibold"
              >
                Next Match
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-3">
                <Button
                  onClick={onRematch}
                  disabled={youReady || readyCount >= 2}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 h-auto text-sm font-semibold disabled:opacity-70"
                >
                  {getRematchButtonContent()}
                </Button>
                <Button
                  onClick={onReturn}
                  variant="outline"
                  className="flex-1 border-blue-500/50 text-blue-400 hover:bg-blue-500/10 py-3 h-auto text-sm font-semibold"
                >
                  <Undo2 className="w-4 h-4 mr-1" />
                  Return
                </Button>
              </div>
              
              {/* Always show ready status during rematch */}
              <div className="mt-3 flex items-center justify-center gap-6 text-xs bg-slate-800/50 rounded p-2">
                <div className={`flex items-center gap-1 ${youReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <div className={`w-2 h-2 rounded-full ${youReady ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span>You{youReady ? ' ✓' : ''}</span>
                </div>
                <div className="text-slate-600">|</div>
                <div className={`flex items-center gap-1 ${opponentRematchReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                  <div className={`w-2 h-2 rounded-full ${opponentRematchReady ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span>Opponent{opponentRematchReady ? ' ✓' : ''}</span>
                </div>
                <div className="text-slate-600">|</div>
                <div className="text-slate-400">
                  <span className={readyCount >= 1 ? 'text-emerald-400' : ''}>{readyCount}</span>/2 Ready
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
