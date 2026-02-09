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
  rematchStatus?: 'none' | 'waiting' | 'ready';
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
  
  // Determine colors based on winner
  const p1Color = isPlayer1Winner ? 'text-emerald-400' : 'text-blue-400';
  const p1Bg = isPlayer1Winner ? 'from-emerald-500/20 to-emerald-600/20' : 'from-blue-500/20 to-blue-600/20';
  const p1Border = isPlayer1Winner ? 'border-emerald-500/30' : 'border-blue-500/30';
  const p1Gradient = isPlayer1Winner ? 'from-emerald-400 to-teal-500' : 'from-blue-400 to-cyan-500';
  
  const p2Color = isPlayer1Winner ? 'text-blue-400' : 'text-emerald-400';
  const p2Bg = isPlayer1Winner ? 'from-blue-500/20 to-blue-600/20' : 'from-emerald-500/20 to-emerald-600/20';
  const p2Border = isPlayer1Winner ? 'border-blue-500/30' : 'border-emerald-500/30';
  const p2Gradient = isPlayer1Winner ? 'from-blue-400 to-cyan-500' : 'from-emerald-400 to-teal-500';

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
        {/* Winner Banner - Shows winner's name */}
        <div className={`bg-gradient-to-r ${isPlayer1Winner ? p1Bg : p2Bg} border-b ${isPlayer1Winner ? p1Border : p2Border} p-3 text-center`}>
          <div className={`w-12 h-12 bg-gradient-to-br ${isPlayer1Winner ? p1Gradient : p2Gradient} rounded-full mx-auto mb-2 flex items-center justify-center shadow-lg`}>
            <Trophy className="w-6 h-6 text-white" />
          </div>
          <DialogHeader className="space-y-0">
            <DialogTitle className={`text-xl font-bold ${isPlayer1Winner ? p1Color : p2Color}`}>
              {isPlayer1Winner ? player1.name : player2.name} Wins!
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 text-sm">
            {gameMode} • Best of {bestOf}
          </p>
        </div>

        {/* Leg Score Display - Both Players */}
        <div className="px-4 py-2">
          <div className="bg-slate-800 rounded-xl p-3 border border-slate-600">
            <div className="flex items-center justify-center gap-8">
              {/* Player 1 */}
              <div className="text-center">
                <div className={`${p1Color} text-sm font-semibold mb-1`}>{player1.name}</div>
                <div className={`text-5xl font-black ${p1Color}`}>{player1.legs}</div>
                <div className={`text-xs font-medium ${p1Color} opacity-70`}>{isPlayer1Winner ? 'WIN' : 'LOSS'}</div>
              </div>
              
              {/* VS */}
              <div className="text-2xl font-bold text-slate-500">-</div>
              
              {/* Player 2 */}
              <div className="text-center">
                <div className={`${p2Color} text-sm font-semibold mb-1`}>{player2.name}</div>
                <div className={`text-5xl font-black ${p2Color}`}>{player2.legs}</div>
                <div className={`text-xs font-medium ${p2Color} opacity-70`}>{!isPlayer1Winner ? 'WIN' : 'LOSS'}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Player Cards - Both Players with Usernames */}
        <div className="px-4 grid grid-cols-2 gap-3">
          <div className={`bg-gradient-to-br ${p1Bg} ${p1Border} border rounded-lg p-2`}>
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 bg-gradient-to-br ${p1Gradient} rounded-full flex items-center justify-center text-sm font-bold`}>
                {player1.name[0]?.toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className={`font-bold ${p1Color} text-sm truncate`}>{player1.name}</p>
                <p className="text-xs text-slate-400">{isPlayer1Winner ? 'Winner' : 'Runner-up'}</p>
              </div>
            </div>
          </div>
          
          <div className={`bg-gradient-to-br ${p2Bg} ${p2Border} border rounded-lg p-2`}>
            <div className="flex items-center gap-2 justify-end text-right">
              <div className="overflow-hidden">
                <p className={`font-bold ${p2Color} text-sm truncate`}>{player2.name}</p>
                <p className="text-xs text-slate-400">{!isPlayer1Winner ? 'Winner' : 'Runner-up'}</p>
              </div>
              <div className={`w-8 h-8 bg-gradient-to-br ${p2Gradient} rounded-full flex items-center justify-center text-sm font-bold`}>
                {player2.name[0]?.toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Table - Both Players */}
        <div className="px-4 py-2">
          <div className="space-y-1">
            {/* Header row - Shows full usernames */}
            <div className="flex items-center justify-between text-xs text-slate-500 px-2">
              <span>Stat</span>
              <div className="flex gap-4">
                <span className={`w-20 text-right ${p1Color} truncate`}>{player1.name}</span>
                <span className={`w-20 text-right ${p2Color} truncate`}>{player2.name}</span>
              </div>
            </div>
            
            {/* 3-Dart Average */}
            <div className="bg-slate-800/50 rounded px-3 py-1.5 flex items-center justify-between text-sm">
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
            <div className="bg-slate-800/50 rounded px-3 py-1.5 flex items-center justify-between text-sm">
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
            <div className="bg-slate-800/50 rounded px-3 py-1.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Target className="w-4 h-4" />
                <span>Checkout</span>
              </div>
              <div className="flex gap-4">
                <span className={`font-bold ${p1Color} w-20 text-right`}>{fmtInt(player1Stats?.highestCheckout)}</span>
                <span className={`font-bold ${p2Color} w-20 text-right`}>{fmtInt(player2Stats?.highestCheckout)}</span>
              </div>
            </div>

            {/* Checkout % */}
            <div className="bg-slate-800/50 rounded px-3 py-1.5 flex items-center justify-between text-sm">
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
            <div className="bg-slate-800/50 rounded px-3 py-1.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Target className="w-4 h-4" />
                <span>Best Leg</span>
              </div>
              <div className="flex gap-4">
                <span className={`font-bold ${p1Color} w-20 text-right`}>{player1Stats?.bestLegDarts > 0 ? player1Stats.bestLegDarts : '-'}</span>
                <span className={`font-bold ${p2Color} w-20 text-right`}>{player2Stats?.bestLegDarts > 0 ? player2Stats.bestLegDarts : '-'}</span>
              </div>
            </div>

            {/* 100+ Visits */}
            <div className="bg-slate-800/50 rounded px-3 py-1.5 flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <TrendingUp className="w-4 h-4" />
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
              disabled={youReady}
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
