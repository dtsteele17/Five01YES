'use client';

import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Target, TrendingUp, Award, RotateCcw, Home, Loader2, Check, Zap, Undo2, Crown, Sparkles } from 'lucide-react';
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
  // Determine which player is the winner
  const isPlayer1Winner = player1.id === winnerId;
  const winnerName = isPlayer1Winner ? player1.name : player2.name;
  
  // Determine colors based on winner
  const p1Color = isPlayer1Winner ? 'text-amber-400' : 'text-blue-400';
  const p1Bg = isPlayer1Winner ? 'from-amber-500/20 to-amber-600/20' : 'from-blue-500/20 to-blue-600/20';
  const p1Border = isPlayer1Winner ? 'border-amber-500/30' : 'border-blue-500/30';
  const p1Gradient = isPlayer1Winner ? 'from-amber-400 to-orange-500' : 'from-blue-400 to-cyan-500';
  
  const p2Color = isPlayer1Winner ? 'text-blue-400' : 'text-amber-400';
  const p2Bg = isPlayer1Winner ? 'from-blue-500/20 to-blue-600/20' : 'from-amber-500/20 to-amber-600/20';
  const p2Border = isPlayer1Winner ? 'border-blue-500/30' : 'border-amber-500/30';
  const p2Gradient = isPlayer1Winner ? 'from-blue-400 to-cyan-500' : 'from-amber-400 to-orange-500';

  // Get rematch button content
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
          Waiting for opponent...
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

  // Format stat value
  const fmt = (v: number, suffix = '') => v > 0 ? `${v.toFixed(1)}${suffix}` : '-';
  const fmtInt = (v: number) => v > 0 ? v.toString() : '-';

  return (
    <Dialog open={true} modal>
      <DialogContent 
        className="bg-slate-900 border-slate-700 text-white w-full max-w-2xl p-0 overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Premium Winner Banner - Glamorous! */}
        <div className="relative overflow-hidden">
          {/* Animated gradient background */}
          <motion.div 
            className="absolute inset-0 bg-gradient-to-r from-amber-600/30 via-yellow-500/30 to-amber-600/30"
            animate={{ 
              background: [
                'linear-gradient(90deg, rgba(217, 119, 6, 0.3), rgba(234, 179, 8, 0.3), rgba(217, 119, 6, 0.3))',
                'linear-gradient(90deg, rgba(234, 179, 8, 0.4), rgba(217, 119, 6, 0.4), rgba(234, 179, 8, 0.4))',
                'linear-gradient(90deg, rgba(217, 119, 6, 0.3), rgba(234, 179, 8, 0.3), rgba(217, 119, 6, 0.3))',
              ]
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
          
          {/* Sparkle effects */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute"
                style={{
                  left: `${15 + i * 15}%`,
                  top: `${20 + (i % 2) * 60}%`,
                }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0.5, 1.2, 0.5],
                  rotate: [0, 180, 360],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.3,
                  ease: "easeInOut",
                }}
              >
                <Sparkles className="w-4 h-4 text-yellow-300" />
              </motion.div>
            ))}
          </div>

          {/* Main winner content */}
          <div className="relative p-6 text-center border-b border-amber-500/30">
            {/* Crown and Trophy */}
            <motion.div 
              className="relative inline-block mb-4"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
            >
              <div className="relative">
                {/* Crown above trophy */}
                <motion.div
                  className="absolute -top-6 left-1/2 transform -translate-x-1/2"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Crown className="w-10 h-10 text-yellow-400 drop-shadow-lg" />
                </motion.div>
                
                {/* Trophy */}
                <div className="w-20 h-20 bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-600 rounded-full flex items-center justify-center shadow-2xl ring-4 ring-amber-500/30">
                  <Trophy className="w-10 h-10 text-amber-900" />
                </div>
                
                {/* Glow effect */}
                <div className="absolute inset-0 w-20 h-20 bg-yellow-400 rounded-full blur-xl opacity-50 animate-pulse" />
              </div>
            </motion.div>
            
            {/* Winner text */}
            <DialogHeader className="space-y-2">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <div className="text-yellow-400 text-sm font-semibold tracking-widest uppercase mb-1">
                  🏆 Champion 🏆
                </div>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 100 }}
              >
                <DialogTitle className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300 drop-shadow-sm">
                  {winnerName}
                </DialogTitle>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                <p className="text-yellow-200/80 text-lg font-medium">
                  Wins the Match!
                </p>
              </motion.div>
            </DialogHeader>
            
            <motion.p 
              className="text-slate-400 text-sm mt-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
            >
              {gameMode} • Best of {bestOf}
            </motion.p>
          </div>
        </div>

        {/* Leg Score Display - Both Players */}
        <div className="px-4 py-3">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-600">
            <div className="flex items-center justify-center gap-10">
              {/* Player 1 */}
              <div className="text-center">
                <div className={`${p1Color} text-sm font-bold mb-1`}>{player1.name}</div>
                <motion.div 
                  className={`text-5xl font-black ${p1Color}`}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.3, type: "spring" }}
                >
                  {player1.legs}
                </motion.div>
                <div className={`text-xs font-bold ${p1Color} opacity-70 mt-1`}>
                  {isPlayer1Winner ? 'WINNER' : 'LOSS'}
                </div>
              </div>
              
              {/* VS */}
              <div className="text-xl font-bold text-slate-500">-</div>
              
              {/* Player 2 */}
              <div className="text-center">
                <div className={`${p2Color} text-sm font-bold mb-1`}>{player2.name}</div>
                <motion.div 
                  className={`text-5xl font-black ${p2Color}`}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.4, type: "spring" }}
                >
                  {player2.legs}
                </motion.div>
                <div className={`text-xs font-bold ${p2Color} opacity-70 mt-1`}>
                  {!isPlayer1Winner ? 'WINNER' : 'LOSS'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Player Cards - Both Players with Usernames */}
        <div className="px-4 grid grid-cols-2 gap-3">
          <div className={`bg-gradient-to-br ${p1Bg} ${p1Border} border rounded-lg p-3`}>
            <div className="flex items-center gap-2">
              <div className={`w-10 h-10 bg-gradient-to-br ${p1Gradient} rounded-full flex items-center justify-center text-base font-bold shadow-lg`}>
                {player1.name[0]?.toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className={`font-bold ${p1Color} text-sm truncate`}>{player1.name}</p>
                <p className="text-xs text-slate-400">{isPlayer1Winner ? 'Winner' : 'Runner-up'}</p>
              </div>
            </div>
          </div>
          
          <div className={`bg-gradient-to-br ${p2Bg} ${p2Border} border rounded-lg p-3`}>
            <div className="flex items-center gap-2 justify-end text-right">
              <div className="overflow-hidden">
                <p className={`font-bold ${p2Color} text-sm truncate`}>{player2.name}</p>
                <p className="text-xs text-slate-400">{!isPlayer1Winner ? 'Winner' : 'Runner-up'}</p>
              </div>
              <div className={`w-10 h-10 bg-gradient-to-br ${p2Gradient} rounded-full flex items-center justify-center text-base font-bold shadow-lg`}>
                {player2.name[0]?.toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Table - Both Players */}
        <div className="px-4 py-2">
          <div className="space-y-1.5">
            {/* Header row - Shows full usernames */}
            <div className="flex items-center justify-between text-xs text-slate-500 px-2 pb-1 border-b border-slate-700">
              <span>Stat</span>
              <div className="flex gap-4">
                <span className={`w-20 text-right ${p1Color} font-semibold truncate`}>{player1.name}</span>
                <span className={`w-20 text-right ${p2Color} font-semibold truncate`}>{player2.name}</span>
              </div>
            </div>
            
            {/* 3-Dart Average */}
            <div className="bg-slate-800/50 rounded px-3 py-2 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <TrendingUp className="w-4 h-4" />
                <span>3-Dart Avg</span>
              </div>
              <div className="flex gap-4">
                <span className={`font-bold ${p1Color} w-20 text-right`}>{fmt(player1Stats?.threeDartAverage)}</span>
                <span className={`font-bold ${p2Color} w-20 text-right`}>{fmt(player2Stats?.threeDartAverage)}</span>
              </div>
            </div>

            {/* First 9 */}
            <div className="bg-slate-800/50 rounded px-3 py-2 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Award className="w-4 h-4" />
                <span>First 9</span>
              </div>
              <div className="flex gap-4">
                <span className={`font-bold ${p1Color} w-20 text-right`}>{fmt(player1Stats?.first9Average)}</span>
                <span className={`font-bold ${p2Color} w-20 text-right`}>{fmt(player2Stats?.first9Average)}</span>
              </div>
            </div>

            {/* Best Checkout */}
            <div className="bg-slate-800/50 rounded px-3 py-2 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Target className="w-4 h-4" />
                <span>Best Checkout</span>
              </div>
              <div className="flex gap-4">
                <span className={`font-bold ${p1Color} w-20 text-right`}>{fmtInt(player1Stats?.highestCheckout)}</span>
                <span className={`font-bold ${p2Color} w-20 text-right`}>{fmtInt(player2Stats?.highestCheckout)}</span>
              </div>
            </div>

            {/* Checkout % */}
            <div className="bg-slate-800/50 rounded px-3 py-2 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Zap className="w-4 h-4" />
                <span>Checkout %</span>
              </div>
              <div className="flex gap-4">
                <span className={`font-bold ${p1Color} w-20 text-right`}>{fmt(player1Stats?.checkoutPercentage, '%')}</span>
                <span className={`font-bold ${p2Color} w-20 text-right`}>{fmt(player2Stats?.checkoutPercentage, '%')}</span>
              </div>
            </div>

            {/* Best Leg */}
            <div className="bg-slate-800/50 rounded px-3 py-2 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Trophy className="w-4 h-4" />
                <span>Best Leg</span>
              </div>
              <div className="flex gap-4">
                <span className={`font-bold ${p1Color} w-20 text-right`}>{player1Stats?.bestLegDarts > 0 ? player1Stats.bestLegDarts + ' darts' : '-'}</span>
                <span className={`font-bold ${p2Color} w-20 text-right`}>{player2Stats?.bestLegDarts > 0 ? player2Stats.bestLegDarts + ' darts' : '-'}</span>
              </div>
            </div>

            {/* 100+ Visits */}
            <div className="bg-slate-800/50 rounded px-3 py-2 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Sparkles className="w-4 h-4" />
                <span>100+ / 140+ / 180s</span>
              </div>
              <div className="flex gap-4">
                <span className={`font-bold ${p1Color} w-20 text-right text-xs`}>
                  {player1Stats?.count100Plus || 0} / {player1Stats?.count140Plus || 0} / {player1Stats?.oneEighties || 0}
                </span>
                <span className={`font-bold ${p2Color} w-20 text-right text-xs`}>
                  {player2Stats?.count100Plus || 0} / {player2Stats?.count140Plus || 0} / {player2Stats?.oneEighties || 0}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons - Return and Rematch Only */}
        <div className="px-4 pb-4 pt-2">
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
          
          {/* Rematch Status */}
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
