'use client';

import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trophy, Crown, Swords, TrendingUp, TrendingDown, Shield, ChevronUp, ChevronDown, Home, BarChart3, Sparkles } from 'lucide-react';
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

interface RankedWinnerPopupProps {
  isOpen: boolean;
  onClose: () => void;
  player1: SimplePlayer;
  player2: SimplePlayer;
  player1Stats: PlayerStats;
  player2Stats: PlayerStats;
  winnerId: string;
  currentUserId: string;
  rpChange?: number;
  rpAfter?: number;
  divisionName?: string;
  legStats?: LegStats[];
}

export function RankedWinnerPopup({
  isOpen,
  onClose,
  player1,
  player2,
  player1Stats,
  player2Stats,
  winnerId,
  currentUserId,
  rpChange,
  rpAfter,
  divisionName,
  legStats = [],
}: RankedWinnerPopupProps) {
  const router = useRouter();
  const isWinner = currentUserId === winnerId;
  const isPlayer1Winner = player1.id === winnerId;
  const winnerName = isPlayer1Winner ? player1.name : player2.name;

  const rpGain = rpChange !== undefined && rpChange > 0;
  const rpLoss = rpChange !== undefined && rpChange < 0;
  const rpDisplay = rpChange !== undefined ? (rpChange > 0 ? `+${rpChange}` : `${rpChange}`) : null;

  // Winner gets gold/emerald, loser gets muted
  const winColor = 'text-amber-400';
  const loseColor = 'text-blue-400';
  const p1Color = isPlayer1Winner ? winColor : loseColor;
  const p2Color = isPlayer1Winner ? loseColor : winColor;
  const p1Bg = isPlayer1Winner ? 'from-amber-500/10 to-amber-600/5' : 'from-blue-500/10 to-blue-600/5';
  const p2Bg = isPlayer1Winner ? 'from-blue-500/10 to-blue-600/5' : 'from-amber-500/10 to-amber-600/5';
  const p1Border = isPlayer1Winner ? 'border-amber-500/20' : 'border-blue-500/20';
  const p2Border = isPlayer1Winner ? 'border-blue-500/20' : 'border-amber-500/20';

  const fmt = (v: number, suffix = '') => (v > 0 ? `${v.toFixed(1)}${suffix}` : '-');
  const fmtInt = (v: number) => (v > 0 ? v.toString() : '-');

  const handleReturnToRanked = () => {
    router.push('/app/ranked');
    onClose();
  };

  const handleViewDivisions = () => {
    router.push('/app/ranked-divisions');
    onClose();
  };

  const handleReturnHome = () => {
    router.push('/app');
    onClose();
  };

  return (
    <Dialog open={isOpen} modal>
      <DialogContent
        className="bg-slate-950 border-slate-700/50 text-white w-full max-w-3xl p-0 overflow-hidden"
        style={{ maxHeight: '90vh' }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Premium Header with RP Change */}
        <div className={`relative border-b overflow-hidden ${
          isWinner
            ? 'bg-gradient-to-r from-amber-900/30 via-amber-800/20 to-amber-900/30 border-amber-500/30'
            : 'bg-gradient-to-r from-slate-800/50 via-slate-700/30 to-slate-800/50 border-slate-600/30'
        }`}>
          {/* Animated sparkles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute"
                style={{ left: `${10 + i * 15}%`, top: `${15 + (i % 3) * 30}%` }}
                animate={{ opacity: [0, 0.8, 0], scale: [0.3, 1, 0.3], y: [0, -10, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3 }}
              >
                <Sparkles className={`w-3 h-3 ${isWinner ? 'text-amber-400/60' : 'text-slate-500/40'}`} />
              </motion.div>
            ))}
          </div>

          <div className="relative p-5 text-center space-y-3">
            {/* Ranked Badge */}
            <div className="flex items-center justify-center gap-2">
              <div className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase ${
                isWinner ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'
              }`}>
                <Shield className="w-3 h-3 inline mr-1" />
                Ranked Match
              </div>
            </div>

            {/* Result */}
            <div className="flex items-center justify-center gap-3">
              <motion.div initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200 }}>
                {isWinner ? <Crown className="w-7 h-7 text-amber-400" /> : <Swords className="w-7 h-7 text-slate-500" />}
              </motion.div>
              <DialogHeader className="space-y-0">
                <DialogTitle className={`text-2xl font-black tracking-tight ${isWinner ? 'text-amber-400' : 'text-slate-300'}`}>
                  {isWinner ? 'VICTORY' : 'DEFEAT'}
                </DialogTitle>
              </DialogHeader>
              <motion.div initial={{ scale: 0, rotate: 45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}>
                {isWinner ? <Trophy className="w-7 h-7 text-amber-400" /> : <Swords className="w-7 h-7 text-slate-500" />}
              </motion.div>
            </div>

            {/* RP Change - The star of the show */}
            {rpDisplay && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 150, delay: 0.3 }}
                className="flex items-center justify-center gap-4"
              >
                <div className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border ${
                  rpGain
                    ? 'bg-emerald-500/15 border-emerald-500/30'
                    : 'bg-red-500/15 border-red-500/30'
                }`}>
                  {rpGain ? (
                    <ChevronUp className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-red-400" />
                  )}
                  <span className={`text-3xl font-black tracking-tight ${rpGain ? 'text-emerald-400' : 'text-red-400'}`}>
                    {rpDisplay} RP
                  </span>
                </div>
                {rpAfter !== undefined && (
                  <div className="text-center">
                    <div className="text-slate-500 text-xs uppercase tracking-wider">New Rating</div>
                    <div className="text-white font-bold text-lg">{rpAfter} RP</div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Division */}
            {divisionName && (
              <div className="text-slate-400 text-sm">
                <span className="text-slate-500">Division:</span>{' '}
                <span className="text-white font-semibold">{divisionName}</span>
              </div>
            )}

            <p className="text-slate-500 text-xs">501 • Best of 5 • Double Out</p>
          </div>
        </div>

        {/* Score */}
        <div className="px-4 py-3">
          <div className="bg-slate-900/80 rounded-xl p-4 border border-slate-700/50">
            <div className="flex items-center justify-center gap-12">
              <div className="text-center">
                <div className={`${p1Color} text-sm font-bold mb-1`}>{player1.name}</div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.2 }}
                  className={`text-5xl font-black ${p1Color}`}
                >
                  {player1.legs}
                </motion.div>
              </div>
              <div className="text-2xl font-bold text-slate-600">—</div>
              <div className="text-center">
                <div className={`${p2Color} text-sm font-bold mb-1`}>{player2.name}</div>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.3 }}
                  className={`text-5xl font-black ${p2Color}`}
                >
                  {player2.legs}
                </motion.div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats - Side by Side */}
        <div className="px-4 flex gap-3">
          {/* Player 1 */}
          <div className={`flex-1 bg-gradient-to-b ${p1Bg} ${p1Border} border rounded-xl p-3`}>
            <div className="text-center mb-3">
              <div className={`font-bold ${p1Color} text-base`}>{player1.name}</div>
              {isPlayer1Winner && <div className="text-xs text-amber-400/70 font-medium">🏆 Winner</div>}
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">3-Dart Avg</span><span className={`font-bold ${p1Color}`}>{fmt(player1Stats?.threeDartAverage)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">First 9</span><span className={`font-bold ${p1Color}`}>{fmt(player1Stats?.first9Average)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Best CO</span><span className={`font-bold ${p1Color}`}>{(player1Stats?.checkouts || 0) > 0 ? fmtInt(player1Stats?.highestCheckout) : '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">CO %</span><span className={`font-bold ${p1Color}`}>{fmt(player1Stats?.checkoutPercentage, '%')}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Best Leg</span><span className={`font-bold ${p1Color}`}>{player1Stats?.bestLegDarts > 0 ? `${player1Stats.bestLegDarts}d` : '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">100+/140+/180</span><span className={`font-bold ${p1Color} text-xs`}>{player1Stats?.count100Plus || 0}/{player1Stats?.count140Plus || 0}/{player1Stats?.oneEighties || 0}</span></div>
            </div>
          </div>
          {/* Player 2 */}
          <div className={`flex-1 bg-gradient-to-b ${p2Bg} ${p2Border} border rounded-xl p-3`}>
            <div className="text-center mb-3">
              <div className={`font-bold ${p2Color} text-base`}>{player2.name}</div>
              {!isPlayer1Winner && <div className="text-xs text-amber-400/70 font-medium">🏆 Winner</div>}
            </div>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">3-Dart Avg</span><span className={`font-bold ${p2Color}`}>{fmt(player2Stats?.threeDartAverage)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">First 9</span><span className={`font-bold ${p2Color}`}>{fmt(player2Stats?.first9Average)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Best CO</span><span className={`font-bold ${p2Color}`}>{(player2Stats?.checkouts || 0) > 0 ? fmtInt(player2Stats?.highestCheckout) : '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">CO %</span><span className={`font-bold ${p2Color}`}>{fmt(player2Stats?.checkoutPercentage, '%')}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Best Leg</span><span className={`font-bold ${p2Color}`}>{player2Stats?.bestLegDarts > 0 ? `${player2Stats.bestLegDarts}d` : '-'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">100+/140+/180</span><span className={`font-bold ${p2Color} text-xs`}>{player2Stats?.count100Plus || 0}/{player2Stats?.count140Plus || 0}/{player2Stats?.oneEighties || 0}</span></div>
            </div>
          </div>
        </div>

        {/* Leg-by-Leg Stats */}
        {legStats && legStats.length > 0 && (
          <div className="px-4 pb-1">
            <LegByLegStats
              legStats={legStats}
              playerName={player1.name}
              opponentName={player2.name}
            />
          </div>
        )}

        {/* Action Buttons - No rematch for ranked */}
        <div className="px-4 pb-4 pt-2">
          <div className="flex gap-3">
            <Button
              onClick={handleReturnToRanked}
              className={`flex-1 py-3 h-auto text-sm font-bold ${
                isWinner
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <Swords className="w-4 h-4 mr-1.5" />
              Play Again
            </Button>
            <Button
              onClick={handleViewDivisions}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 py-3 h-auto text-sm font-semibold"
            >
              <BarChart3 className="w-4 h-4 mr-1.5" />
              Divisions
            </Button>
            <Button
              onClick={handleReturnHome}
              variant="outline"
              className="border-slate-700 text-slate-400 hover:bg-slate-800/50 py-3 h-auto text-sm"
            >
              <Home className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
