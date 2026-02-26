'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Trophy, Crown, Sparkles, Target, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PlayerStats {
  name: string;
  legsWon: number;
  threeDartAverage: number;
  first9Average: number;
  highestCheckout: number;
  checkoutPercentage: number;
  bestLegDarts: number;
  count100Plus?: number;
  count140Plus?: number;
  oneEighties?: number;
  checkouts?: number;
}

interface TournamentChampionScreenProps {
  tournamentName: string;
  tournamentId: string;
  winner: { id: string; name: string; legs: number };
  loser: { id: string; name: string; legs: number };
  winnerStats: PlayerStats;
  loserStats: PlayerStats;
  gameMode: string;
  bestOf: number;
  currentUserId: string;
}

export function TournamentChampionScreen({
  tournamentName,
  tournamentId,
  winner,
  loser,
  winnerStats,
  loserStats,
  gameMode,
  bestOf,
  currentUserId,
}: TournamentChampionScreenProps) {
  const router = useRouter();
  const isChampion = winner.id === currentUserId;

  const fmt = (v: number, suffix = '') => (v > 0 ? `${v.toFixed(1)}${suffix}` : '-');
  const fmtInt = (v: number) => (v > 0 ? v.toString() : '-');

  const StatBlock = ({ stats, name, isWinner: isW }: { stats: PlayerStats; name: string; isWinner: boolean }) => {
    const color = isW ? 'text-amber-400' : 'text-blue-400';
    const border = isW ? 'border-amber-500/30' : 'border-blue-500/30';
    const bg = isW ? 'from-amber-500/10 to-amber-600/10' : 'from-blue-500/10 to-blue-600/10';
    return (
      <div className={`flex-1 bg-gradient-to-b ${bg} ${border} border rounded-xl p-4`}>
        <div className="text-center mb-3">
          <div className={`font-bold ${color} text-lg`}>{name}</div>
          {isW && <div className="text-xs text-amber-400/70 font-medium">🏆 Champion</div>}
        </div>
        <div className="space-y-2">
          {[
            ['3-Dart Avg', fmt(stats.threeDartAverage)],
            ['First 9', fmt(stats.first9Average)],
            ['Best Checkout', (stats.checkouts || 0) > 0 ? fmtInt(stats.highestCheckout) : '-'],
            ['Checkout %', fmt(stats.checkoutPercentage, '%')],
            ['Best Leg', stats.bestLegDarts > 0 ? `${stats.bestLegDarts} darts` : '-'],
            ['100+/140+/180', `${stats.count100Plus || 0}/${stats.count140Plus || 0}/${stats.oneEighties || 0}`],
          ].map(([label, val]) => (
            <div key={label} className="flex justify-between">
              <span className="text-slate-400 text-sm">{label}</span>
              <span className={`font-bold ${color} text-base`}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-slate-950 via-amber-950/20 to-slate-950 flex items-center justify-center overflow-y-auto">
      {/* Floating sparkles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
            animate={{ opacity: [0, 1, 0], scale: [0.3, 1, 0.3], y: [0, -30, 0] }}
            transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 3 }}
          >
            <Sparkles className="w-4 h-4 text-yellow-400/60" />
          </motion.div>
        ))}
      </div>

      <div className="relative w-full max-w-3xl mx-auto p-6 space-y-6">
        {/* Trophy */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 150, damping: 12, delay: 0.2 }}
          className="flex justify-center"
        >
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center shadow-2xl shadow-amber-500/40">
            <Trophy className="w-14 h-14 text-white" />
          </div>
        </motion.div>

        {/* Tournament name + Champion */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-center space-y-2"
        >
          <p className="text-slate-400 text-sm uppercase tracking-widest">{tournamentName}</p>
          <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300">
            {isChampion ? 'YOU ARE THE CHAMPION!' : `${winner.name} IS THE CHAMPION!`}
          </h1>
          <div className="flex items-center justify-center gap-2 pt-2">
            <Crown className="w-5 h-5 text-yellow-400" />
            <span className="text-yellow-400 text-lg font-semibold">{winner.name}</span>
            <Crown className="w-5 h-5 text-yellow-400" />
          </div>
        </motion.div>

        {/* Final Score */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7 }}
          className="bg-slate-800/60 backdrop-blur rounded-2xl p-6 border border-amber-500/20"
        >
          <p className="text-center text-slate-400 text-sm mb-3 uppercase tracking-wide">Final Score</p>
          <div className="flex items-center justify-center gap-12">
            <div className="text-center">
              <div className="text-amber-400 text-sm font-bold mb-1">{winner.name}</div>
              <div className="text-5xl font-black text-amber-400">{winner.legs}</div>
            </div>
            <div className="text-2xl font-bold text-slate-500">-</div>
            <div className="text-center">
              <div className="text-blue-400 text-sm font-bold mb-1">{loser.name}</div>
              <div className="text-5xl font-black text-blue-400">{loser.legs}</div>
            </div>
          </div>
          <p className="text-center text-slate-500 text-xs mt-3">{gameMode} • Best of {bestOf}</p>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="flex gap-4"
        >
          <StatBlock stats={winnerStats} name={winner.name} isWinner={true} />
          <StatBlock stats={loserStats} name={loser.name} isWinner={false} />
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="flex flex-col sm:flex-row gap-3 pt-4"
        >
          <Button
            onClick={() => router.push(`/app/tournaments/${tournamentId}`)}
            className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-bold py-3 h-auto shadow-lg shadow-amber-500/25"
          >
            <Trophy className="w-4 h-4 mr-2" />
            View Tournament
          </Button>
          <Button
            onClick={() => router.push('/app/play')}
            variant="outline"
            className="flex-1 border-white/20 text-white hover:bg-white/10 py-3 h-auto font-semibold"
          >
            <Home className="w-4 h-4 mr-2" />
            Return to Menu
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
