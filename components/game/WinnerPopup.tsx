'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Target, TrendingUp, Award, RotateCcw, Home, Loader2, Check, Zap, Undo2 } from 'lucide-react';
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
}

interface SimplePlayer {
  id: string;
  name: string;
  legs: number;
}

interface WinnerPopupProps {
  winner: SimplePlayer;
  loser: SimplePlayer;
  winnerStats: PlayerStats;
  loserStats: PlayerStats;
  gameMode: string;
  bestOf: number;
  onRematch: () => void;
  onHome: () => void;
  onReturnToPlay?: () => void;
  rematchStatus?: 'none' | 'waiting' | 'ready';
  opponentRematchReady?: boolean;
  youReady?: boolean;
  currentUserId?: string;
}

export function WinnerPopup({
  winner,
  loser,
  winnerStats,
  loserStats,
  gameMode,
  bestOf,
  onRematch,
  onHome,
  onReturnToPlay,
  rematchStatus = 'none',
  opponentRematchReady = false,
  youReady = false,
  currentUserId,
}: WinnerPopupProps) {
  // Determine colors based on whether current user is winner or loser
  const isWinnerCurrentUser = winner.id === currentUserId;
  
  // Winner gets green, loser gets blue (or vice versa based on who current user is)
  const winnerColor = isWinnerCurrentUser ? 'text-emerald-400' : 'text-blue-400';
  const winnerBg = isWinnerCurrentUser ? 'from-emerald-500/20 to-emerald-600/20' : 'from-blue-500/20 to-blue-600/20';
  const winnerBorder = isWinnerCurrentUser ? 'border-emerald-500/30' : 'border-blue-500/30';
  const winnerGradient = isWinnerCurrentUser ? 'from-emerald-400 to-teal-500' : 'from-blue-400 to-cyan-500';
  
  const loserColor = isWinnerCurrentUser ? 'text-blue-400' : 'text-emerald-400';
  const loserBg = isWinnerCurrentUser ? 'from-blue-500/20 to-blue-600/20' : 'from-emerald-500/20 to-emerald-600/20';
  const loserBorder = isWinnerCurrentUser ? 'border-blue-500/30' : 'border-emerald-500/30';
  const loserGradient = isWinnerCurrentUser ? 'from-blue-400 to-cyan-500' : 'from-emerald-400 to-teal-500';

  // Get rematch button content
  const getRematchButtonContent = () => {
    if (youReady && opponentRematchReady) {
      return (
        <>
          <Check className="w-4 h-4 mr-1" />
          Starting
        </>
      );
    }
    if (youReady) {
      return (
        <>
          <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          Waiting
        </>
      );
    }
    if (opponentRematchReady) {
      return (
        <>
          <RotateCcw className="w-4 h-4 mr-1" />
          Rematch (1/2)
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
        {/* Compact Winner Banner */}
        <div className={`bg-gradient-to-r ${winnerBg} border-b ${winnerBorder} p-3 text-center`}>
          <div className={`w-12 h-12 bg-gradient-to-br ${winnerGradient} rounded-full mx-auto mb-2 flex items-center justify-center shadow-lg`}>
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <DialogHeader className="space-y-0">
            <DialogTitle className={`text-xl font-bold ${winnerColor}`}>
              {winner.name} Wins!
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 text-sm">
            {gameMode} • Best of {bestOf}
          </p>
        </div>

        {/* Compact Leg Score Display */}
        <div className="px-4 py-2">
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-600">
            <div className="flex items-center justify-center gap-8">
              {/* Winner */}
              <div className="text-center">
                <div className={`${winnerColor} text-sm font-semibold mb-1`}>{winner.name}</div>
                <div className={`text-5xl font-black ${winnerColor}`}>{winner.legs}</div>
                <div className={`text-xs font-medium ${winnerColor} opacity-70`}>WIN</div>
              </div>
              
              {/* VS */}
              <div className="text-2xl font-bold text-slate-500">-</div>
              
              {/* Loser */}
              <div className="text-center">
                <div className={`${loserColor} text-sm font-semibold mb-1`}>{loser.name}</div>
                <div className={`text-5xl font-black ${loserColor}`}>{loser.legs}</div>
                <div className={`text-xs font-medium ${loserColor} opacity-70`}>LOSS</div>
              </div>
            </div>
          </div>
        </div>

        {/* Compact Player Cards */}
        <div className="px-4 grid grid-cols-2 gap-3">
          <div className={`bg-gradient-to-br ${winnerBg} ${winnerBorder} border rounded-lg p-2`}>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 bg-gradient-to-br ${winnerGradient} rounded-full flex items-center justify-center text-sm font-bold`}>
                {winner.name[0]?.toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className={`font-bold ${winnerColor} text-sm truncate`}>{winner.name}</p>
                <p className="text-xs text-slate-400">Winner</p>
              </div>
            </div>
          </div>
          
          <div className={`bg-gradient-to-br ${loserBg} ${loserBorder} border rounded-lg p-2`}>
            <div className="flex items-center gap-2 justify-end text-right">
              <div className="overflow-hidden">
                <p className={`font-bold ${loserColor} text-sm truncate`}>{loser.name}</p>
                <p className="text-xs text-slate-400">Runner-up</p>
              </div>
              <div className={`w-8 h-8 bg-gradient-to-br ${loserGradient} rounded-full flex items-center justify-center text-sm font-bold`}>
                {loser.name[0]?.toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        {/* Compact Stats Table */}
        <div className="px-4 py-2">
          <div className="space-y-1">
            {/* Header row */}
            <div className="flex items-center justify-between text-xs text-slate-500 px-2">
              <span>Stat</span>
              <div className="flex gap-8">
                <span className={`w-14 text-right ${winnerColor}`}>{winner.name[0]}</span>
                <span className={`w-14 text-right ${loserColor}`}>{loser.name[0]}</span>
              </div>
            </div>
            
            {/* 3-Dart Average */}
            <div className="bg-slate-800/50 rounded px-3 py-1.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <TrendingUp className="w-4 h-4" />
                <span>3-Dart Avg</span>
              </div>
              <div className="flex gap-4">
                <span className={`font-bold ${winnerColor} w-14 text-right`}>{fmt(winnerStats.threeDartAverage)}</span>
                <span className={`font-bold ${loserColor} w-14 text-right`}>{fmt(loserStats?.threeDartAverage)}</span>
              </div>
            </div>

            {/* First 9 */}
            <div className="bg-slate-800/50 rounded px-3 py-1.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Award className="w-4 h-4" />
                <span>First 9</span>
              </div>
              <div className="flex gap-4">
                <span className={`font-bold ${winnerColor} w-14 text-right`}>{fmt(winnerStats.first9Average)}</span>
                <span className={`font-bold ${loserColor} w-14 text-right`}>{fmt(loserStats?.first9Average)}</span>
              </div>
            </div>

            {/* Best Checkout */}
            <div className="bg-slate-800/50 rounded px-3 py-1.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Target className="w-4 h-4" />
                <span>Checkout</span>
              </div>
              <div className="flex gap-4">
                <span className={`font-bold ${winnerColor} w-14 text-right`}>{fmtInt(winnerStats.highestCheckout)}</span>
                <span className={`font-bold ${loserColor} w-14 text-right`}>{fmtInt(loserStats?.highestCheckout)}</span>
              </div>
            </div>

            {/* Checkout % */}
            <div className="bg-slate-800/50 rounded px-3 py-1.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Zap className="w-4 h-4" />
                <span>Checkout %</span>
              </div>
              <div className="flex gap-4">
                <span className={`font-bold ${winnerColor} w-14 text-right`}>{fmt(winnerStats.checkoutPercentage, '%')}</span>
                <span className={`font-bold ${loserColor} w-14 text-right`}>{fmt(loserStats?.checkoutPercentage, '%')}</span>
              </div>
            </div>

            {/* Best Leg */}
            <div className="bg-slate-800/50 rounded px-3 py-1.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Target className="w-4 h-4" />
                <span>Best Leg</span>
              </div>
              <div className="flex gap-4">
                <span className={`font-bold ${winnerColor} w-14 text-right`}>{winnerStats.bestLegDarts > 0 ? winnerStats.bestLegDarts : '-'}</span>
                <span className={`font-bold ${loserColor} w-14 text-right`}>{loserStats?.bestLegDarts > 0 ? loserStats.bestLegDarts : '-'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Compact Action Buttons */}
        <div className="px-4 pb-4 pt-2">
          <div className="flex gap-2">
            <Button
              onClick={onRematch}
              disabled={youReady}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 h-auto text-sm font-semibold disabled:opacity-70"
            >
              {getRematchButtonContent()}
            </Button>
            {onReturnToPlay && (
              <Button
                onClick={onReturnToPlay}
                variant="outline"
                className="flex-1 border-blue-500/50 text-blue-400 hover:bg-blue-500/10 py-2 h-auto text-sm"
              >
                <Undo2 className="w-4 h-4 mr-1" />
                Play
              </Button>
            )}
            <Button
              onClick={onHome}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 py-2 h-auto text-sm"
            >
              <Home className="w-4 h-4 mr-1" />
              Home
            </Button>
          </div>
          
          {/* Rematch Status */}
          {(youReady || opponentRematchReady) && (
            <div className="mt-2 flex items-center justify-center gap-4 text-xs bg-slate-800/50 rounded p-2">
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
