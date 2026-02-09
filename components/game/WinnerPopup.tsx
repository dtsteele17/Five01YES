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
  // Green (emerald) = Player 1 / Current user, Blue = Player 2 / Opponent
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
          <Check className="w-5 h-5 mr-2" />
          Starting (2/2)
        </>
      );
    }
    if (youReady) {
      return (
        <>
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Waiting (1/2)
        </>
      );
    }
    if (opponentRematchReady) {
      return (
        <>
          <RotateCcw className="w-5 h-5 mr-2" />
          Rematch (1/2)
        </>
      );
    }
    return (
      <>
        <RotateCcw className="w-5 h-5 mr-2" />
        Rematch
      </>
    );
  };

  // Format stat value
  const fmt = (v: number, suffix = '') => v > 0 ? `${v.toFixed(1)}${suffix}` : '-';
  const fmtInt = (v: number) => v > 0 ? v.toString() : '-';

  // Stat row component
  const StatRow = ({ 
    label, 
    icon: Icon, 
    winnerValue, 
    loserValue,
    isWinnerBetter
  }: { 
    label: string; 
    icon: any; 
    winnerValue: string; 
    loserValue: string;
    isWinnerBetter?: boolean;
  }) => (
    <div className="bg-slate-800/50 rounded-lg px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3 text-slate-400 text-base w-1/3">
        <Icon className="w-5 h-5" />
        <span>{label}</span>
      </div>
      <div className="flex items-center justify-end gap-4 w-2/3">
        <span className={`font-bold w-20 text-right text-xl ${winnerColor}`}>{winnerValue}</span>
        <span className={`font-bold w-20 text-right text-xl ${loserColor}`}>{loserValue}</span>
      </div>
    </div>
  );

  return (
    <Dialog open={true} modal>
      <DialogContent 
        className="bg-slate-900 border-slate-700 text-white w-full max-w-4xl p-0 overflow-hidden"
        style={{ maxHeight: '95vh' }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Winner Banner */}
        <div className={`bg-gradient-to-r ${winnerBg} border-b ${winnerBorder} p-6 text-center`}>
          <div className={`w-20 h-20 bg-gradient-to-br ${winnerGradient} rounded-full mx-auto mb-3 flex items-center justify-center shadow-lg`}>
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <DialogHeader className="space-y-1">
            <DialogTitle className={`text-3xl font-bold ${winnerColor}`}>
              {winner.name} Wins!
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 text-base">
            {gameMode} • Best of {bestOf} Legs
          </p>
        </div>

        {/* BIG LEG SCORE DISPLAY */}
        <div className="px-6 py-4">
          <div className="bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 rounded-2xl p-6 border border-slate-600">
            <div className="text-center mb-4">
              <span className="text-slate-400 text-lg uppercase tracking-widest font-semibold">Final Result</span>
            </div>
            <div className="flex items-center justify-center gap-12">
              {/* Winner Legs */}
              <div className="text-center">
                <div className={`${winnerColor} text-2xl font-bold mb-2`}>{winner.name}</div>
                <div className={`text-8xl font-black ${winnerColor} drop-shadow-lg`}>{winner.legs}</div>
                <div className={`text-sm font-semibold mt-2 ${winnerColor} opacity-70`}>WINNER</div>
              </div>
              
              {/* VS Divider */}
              <div className="text-5xl font-bold text-slate-500">-</div>
              
              {/* Loser Legs */}
              <div className="text-center">
                <div className={`${loserColor} text-2xl font-bold mb-2`}>{loser.name}</div>
                <div className={`text-8xl font-black ${loserColor}`}>{loser.legs}</div>
                <div className={`text-sm font-semibold mt-2 ${loserColor} opacity-70`}>RUNNER-UP</div>
              </div>
            </div>
          </div>
        </div>

        {/* SEPARATED STATS SECTIONS */}
        <div className="px-6 pb-6">
          {/* Player Headers with Clear Separation */}
          <div className="grid grid-cols-2 gap-6 mb-4">
            {/* Winner Card */}
            <div className={`bg-gradient-to-br ${winnerBg} ${winnerBorder} border rounded-xl p-4`}>
              <div className="flex items-center gap-3">
                <div className={`w-14 h-14 bg-gradient-to-br ${winnerGradient} rounded-full flex items-center justify-center text-xl font-bold shadow-lg`}>
                  {winner.name[0]?.toUpperCase()}
                </div>
                <div>
                  <p className={`font-bold ${winnerColor} text-xl leading-tight`}>{winner.name}</p>
                  <p className="text-sm text-slate-400">Winner • {winner.legs} legs</p>
                </div>
              </div>
            </div>
            
            {/* Loser Card */}
            <div className={`bg-gradient-to-br ${loserBg} ${loserBorder} border rounded-xl p-4`}>
              <div className="flex items-center gap-3 justify-end text-right">
                <div>
                  <p className={`font-bold ${loserColor} text-xl leading-tight`}>{loser.name}</p>
                  <p className="text-sm text-slate-400">Runner-up • {loser.legs} legs</p>
                </div>
                <div className={`w-14 h-14 bg-gradient-to-br ${loserGradient} rounded-full flex items-center justify-center text-xl font-bold shadow-lg`}>
                  {loser.name[0]?.toUpperCase()}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Comparison Table */}
          <div className="space-y-2">
            <StatRow 
              label="3-Dart Avg" 
              icon={TrendingUp} 
              winnerValue={fmt(winnerStats.threeDartAverage)} 
              loserValue={fmt(loserStats?.threeDartAverage)}
            />
            <StatRow 
              label="First 9 Avg" 
              icon={Award} 
              winnerValue={fmt(winnerStats.first9Average)} 
              loserValue={fmt(loserStats?.first9Average)}
            />
            <StatRow 
              label="Best Checkout" 
              icon={Target} 
              winnerValue={fmtInt(winnerStats.highestCheckout)} 
              loserValue={fmtInt(loserStats?.highestCheckout)}
            />
            <StatRow 
              label="Checkout %" 
              icon={Zap} 
              winnerValue={fmt(winnerStats.checkoutPercentage, '%')} 
              loserValue={fmt(loserStats?.checkoutPercentage, '%')}
            />
            <StatRow 
              label="Best Leg" 
              icon={Target} 
              winnerValue={winnerStats.bestLegDarts > 0 ? `${winnerStats.bestLegDarts} darts` : '-'} 
              loserValue={loserStats?.bestLegDarts > 0 ? `${loserStats.bestLegDarts} darts` : '-'}
            />
            <StatRow 
              label="Total Darts" 
              icon={TrendingUp} 
              winnerValue={(winnerStats.totalDartsThrown || 0).toString()} 
              loserValue={(loserStats?.totalDartsThrown || 0).toString()}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-5">
            <Button
              onClick={onRematch}
              disabled={youReady}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3 h-auto text-base font-semibold disabled:opacity-70"
            >
              {getRematchButtonContent()}
            </Button>
            {onReturnToPlay && (
              <Button
                onClick={onReturnToPlay}
                variant="outline"
                className="flex-1 border-blue-500/50 text-blue-400 hover:bg-blue-500/10 py-3 h-auto text-base"
              >
                <Undo2 className="w-5 h-5 mr-2" />
                Return to Play
              </Button>
            )}
            <Button
              onClick={onHome}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 py-3 h-auto text-base"
            >
              <Home className="w-5 h-5 mr-2" />
              Home
            </Button>
          </div>
          
          {/* Rematch Status */}
          {(youReady || opponentRematchReady) && (
            <div className="mt-3 flex items-center justify-center gap-6 text-sm bg-slate-800/50 rounded-lg p-3">
              <div className={`flex items-center gap-2 ${youReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                <div className={`w-3 h-3 rounded-full ${youReady ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                <span>You {youReady ? '(Ready)' : ''}</span>
              </div>
              <div className="text-slate-600">|</div>
              <div className={`flex items-center gap-2 ${opponentRematchReady ? 'text-emerald-400' : 'text-slate-500'}`}>
                <div className={`w-3 h-3 rounded-full ${opponentRematchReady ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                <span>Opponent {opponentRematchReady ? '(Ready)' : ''}</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
