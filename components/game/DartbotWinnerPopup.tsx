'use client';

import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Target, TrendingUp, Award, RotateCcw, Undo2, Crown, Sparkles } from 'lucide-react';
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

interface DartbotWinnerPopupProps {
  player1: SimplePlayer;
  player2: SimplePlayer;
  player1Stats: PlayerStats;
  player2Stats: PlayerStats;
  winnerId: string;
  gameMode: string;
  bestOf: number;
  onRematch: () => void;
  onReturn: () => void;
}

export function DartbotWinnerPopup({
  player1,
  player2,
  player1Stats,
  player2Stats,
  winnerId,
  gameMode,
  bestOf,
  onRematch,
  onReturn,
}: DartbotWinnerPopupProps) {
  const isPlayer1Winner = player1.id === winnerId;
  const winnerName = isPlayer1Winner ? player1.name : player2.name;
  
  const p1Color = isPlayer1Winner ? 'text-emerald-400' : 'text-blue-400';
  const p1Border = isPlayer1Winner ? 'border-emerald-500/30' : 'border-blue-500/30';
  const p1Bg = isPlayer1Winner ? 'from-emerald-500/10 to-emerald-600/10' : 'from-blue-500/10 to-blue-600/10';
  
  const p2Color = isPlayer1Winner ? 'text-purple-400' : 'text-amber-400';
  const p2Border = isPlayer1Winner ? 'border-purple-500/30' : 'border-amber-500/30';
  const p2Bg = isPlayer1Winner ? 'from-purple-500/10 to-purple-600/10' : 'from-amber-500/10 to-amber-600/10';

  const fmt = (v: number, suffix = '') => v != null && v > 0 ? `${v.toFixed(1)}${suffix}` : '0.0';
  const fmtInt = (v: number) => v != null && v > 0 ? v.toString() : '0';

  return (
    <Dialog open={true} modal>
      <DialogContent 
        className="bg-slate-900 border-slate-700 text-white w-full max-w-3xl p-0 overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Winner Header */}
        <div className={`relative bg-gradient-to-r ${isPlayer1Winner ? 'from-emerald-600/20 via-emerald-500/20 to-emerald-600/20 border-b border-emerald-500/30' : 'from-red-600/20 via-red-500/20 to-red-600/20 border-b border-red-500/30'} p-4`}>
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
              <DialogTitle className={`text-xl font-black ${isPlayer1Winner ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPlayer1Winner ? '🎉 You Win!' : '😔 Bot Wins!'}
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
            {gameMode} • Best of {bestOf} • vs {player2.name}
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
                <div className="text-xs text-emerald-400/70 font-medium">🏆 Winner</div>
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
                  {fmtInt(player1Stats?.highestCheckout || 0)}
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

          {/* Bot Stats */}
          <div className={`flex-1 bg-gradient-to-b ${p2Bg} ${p2Border} border rounded-xl p-3`}>
            <div className="text-center mb-3">
              <div className={`font-bold ${p2Color} text-lg`}>{player2.name}</div>
              {!isPlayer1Winner && (
                <div className="text-xs text-purple-400/70 font-medium">🤖 Bot Wins</div>
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
                  {fmtInt(player2Stats?.highestCheckout || 0)}
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

        {/* Action Buttons - SIMPLIFIED for Dartbot (no waiting for opponent) */}
        <div className="px-4 pb-4 pt-3">
          <div className="flex gap-3">
            <Button
              onClick={onRematch}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 h-auto text-sm font-semibold"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Play Again
            </Button>
            <Button
              onClick={onReturn}
              variant="outline"
              className="flex-1 border-blue-500/50 text-blue-400 hover:bg-blue-500/10 py-3 h-auto text-sm font-semibold"
            >
              <Undo2 className="w-4 h-4 mr-2" />
              Return to Play
            </Button>
          </div>
          
          {/* Simple message instead of ready indicators */}
          <div className="mt-3 text-center text-xs text-slate-500">
            Click "Play Again" to start a new match with the same settings
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
