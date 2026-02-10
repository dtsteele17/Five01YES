'use client';

import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Target, TrendingUp, Award, RotateCcw, Loader2, Check, Zap, Undo2, Crown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
}: WinnerPopupProps) {
  const isPlayer1Winner = player1.id === winnerId;
  const winnerName = isPlayer1Winner ? player1.name : player2.name;
  
  const p1Color = isPlayer1Winner ? 'text-amber-400' : 'text-blue-400';
  const p1Border = isPlayer1Winner ? 'border-amber-500/30' : 'border-blue-500/30';
  const p1Bg = isPlayer1Winner ? 'from-amber-500/10 to-amber-600/10' : 'from-blue-500/10 to-blue-600/10';
  
  const p2Color = isPlayer1Winner ? 'text-blue-400' : 'text-amber-400';
  const p2Border = isPlayer1Winner ? 'border-blue-500/30' : 'border-amber-500/30';
  const p2Bg = isPlayer1Winner ? 'from-blue-500/10 to-blue-600/10' : 'from-amber-500/10 to-amber-600/10';

  const getRematchButtonContent = () => {
    if (rematchStatus === 'creating') {
      return (
        <>
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          Creating...
        </>
      );
    }
    if (rematchStatus === 'waiting') {
      return (
        <>
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          Waiting...
        </>
      );
    }
    if (rematchStatus === 'ready') {
      return (
        <>
          <Check className="w-4 h-4 mr-1" />
          Starting...
        </>
      );
    }
    if (opponentRematchReady) {
      return (
        <>
          <RotateCcw className="w-4 h-4 mr-1" />
          Join Rematch
        </>
      );
    }
    return (
      <>
        <RotateCcw className="w-4 h-4 mr-1" />
        Rematch
      </>
    );
  };

  const fmt = (v: number, suffix = '') => v > 0 ? `${v.toFixed(1)}${suffix}` : '-';
  const fmtInt = (v: number) => v > 0 ? v.toString() : '-';

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
        className="bg-slate-900 border-slate-700 text-white w-full max-w-3xl p-0 overflow-hidden"
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
            
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">3-Dart Avg</span>
                <span className={`font-bold ${p1Color}`}>{fmt(player1Stats?.threeDartAverage)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">First 9</span>
                <span className={`font-bold ${p1Color}`}>{fmt(player1Stats?.first9Average)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Best Checkout</span>
                <span className={`font-bold ${p1Color}`}>
                  {(player1Stats?.checkouts || 0) > 0 ? fmtInt(player1Stats?.highestCheckout) : '-'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Checkout %</span>
                <span className={`font-bold ${p1Color}`}>{fmt(player1Stats?.checkoutPercentage, '%')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Best Leg</span>
                <span className={`font-bold ${p1Color}`}>
                  {player1Stats?.bestLegDarts > 0 ? `${player1Stats.bestLegDarts} darts` : '-'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">100+/140+/180</span>
                <span className={`font-bold ${p1Color} text-xs`}>
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
            
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">3-Dart Avg</span>
                <span className={`font-bold ${p2Color}`}>{fmt(player2Stats?.threeDartAverage)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">First 9</span>
                <span className={`font-bold ${p2Color}`}>{fmt(player2Stats?.first9Average)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Best Checkout</span>
                <span className={`font-bold ${p2Color}`}>
                  {(player2Stats?.checkouts || 0) > 0 ? fmtInt(player2Stats?.highestCheckout) : '-'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Checkout %</span>
                <span className={`font-bold ${p2Color}`}>{fmt(player2Stats?.checkoutPercentage, '%')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Best Leg</span>
                <span className={`font-bold ${p2Color}`}>
                  {player2Stats?.bestLegDarts > 0 ? `${player2Stats.bestLegDarts} darts` : '-'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">100+/140+/180</span>
                <span className={`font-bold ${p2Color} text-xs`}>
                  {player2Stats?.count100Plus || 0}/{player2Stats?.count140Plus || 0}/{player2Stats?.oneEighties || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-4 pb-4 pt-3">
          <div className="flex gap-3">
            <Button
              onClick={onRematch}
              disabled={rematchStatus === 'waiting' || rematchStatus === 'creating' || rematchStatus === 'ready'}
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
          
          {(youReady || opponentRematchReady) && (
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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
