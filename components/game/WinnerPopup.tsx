'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Target, TrendingUp, Award, RotateCcw, Home } from 'lucide-react';
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
}: WinnerPopupProps) {
  return (
    <Dialog open={true} modal>
      <DialogContent 
        className="bg-slate-900 border-slate-700 text-white max-w-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Winner Banner */}
        <div className="bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-yellow-500/20 border-b border-yellow-500/30 p-4 text-center flex-shrink-0">
          <div className="w-14 h-14 bg-yellow-500 rounded-full mx-auto mb-2 flex items-center justify-center animate-bounce">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-white">
              {winner.name} Wins!
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 text-sm mt-1">
            {gameMode} • Best of {bestOf} Legs
          </p>
        </div>

        {/* Stats Comparison */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Final Result */}
          <div className="text-center mb-4">
            <p className="text-lg text-slate-300">Final Result</p>
            <p className="text-3xl font-bold text-white">
              {winner.legs} - {loser.legs}
            </p>
          </div>

          {/* Score Bar */}
          <div className="flex items-center justify-center gap-4 mb-4">
            {/* Winner */}
            <div className="text-center flex-1">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-full mx-auto mb-1 flex items-center justify-center border-2 border-yellow-500">
                <span className="text-xl font-bold text-yellow-400">
                  {winner.name[0]?.toUpperCase()}
                </span>
              </div>
              <p className="font-bold text-yellow-400 text-sm">{winner.name}</p>
              <p className="text-2xl font-bold text-white">{winnerStats.legsWon}</p>
            </div>

            {/* VS */}
            <div className="text-slate-500 font-bold">VS</div>

            {/* Loser */}
            <div className="text-center flex-1">
              <div className="w-12 h-12 bg-slate-800 rounded-full mx-auto mb-1 flex items-center justify-center border-2 border-slate-600">
                <span className="text-xl font-bold text-slate-400">
                  {loser.name[0]?.toUpperCase()}
                </span>
              </div>
              <p className="font-bold text-slate-400 text-sm">{loser.name}</p>
              <p className="text-2xl font-bold text-white">{loserStats.legsWon}</p>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="space-y-2">
            {/* 3-Dart Average */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <TrendingUp className="w-3 h-3" />
                <span className="text-xs">3-Dart Average</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-yellow-400">
                  {winnerStats.threeDartAverage.toFixed(1)}
                </span>
                <div className="flex-1 mx-4 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-yellow-500 rounded-full"
                    style={{ 
                      width: `${Math.min((winnerStats.threeDartAverage / Math.max(winnerStats.threeDartAverage, loserStats?.threeDartAverage || 0.1)) * 100, 100)}%` 
                    }}
                  />
                </div>
                <span className="text-lg font-bold text-slate-400">
                  {loserStats?.threeDartAverage.toFixed(1) || '0.0'}
                </span>
              </div>
            </div>

            {/* First 9 Dart Average */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Award className="w-3 h-3" />
                <span className="text-xs">First 9 Dart Average</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-yellow-400">
                  {(winnerStats.first9Average || 0).toFixed(1)}
                </span>
                <div className="flex-1 mx-4 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 rounded-full"
                    style={{ 
                      width: `${Math.min(((winnerStats.first9Average || 0) / Math.max((winnerStats.first9Average || 0), (loserStats?.first9Average || 0.1))) * 100, 100)}%` 
                    }}
                  />
                </div>
                <span className="text-lg font-bold text-slate-400">
                  {((loserStats?.first9Average || 0)).toFixed(1)}
                </span>
              </div>
            </div>

            {/* Highest Checkout */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Target className="w-3 h-3" />
                <span className="text-xs">Highest Checkout</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-yellow-400">
                  {winnerStats.highestCheckout > 0 ? winnerStats.highestCheckout : '-'}
                </span>
                <div className="flex-1 mx-4 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 rounded-full"
                    style={{ 
                      width: winnerStats.highestCheckout > 0 || (loserStats?.highestCheckout || 0) > 0
                        ? `${Math.min((winnerStats.highestCheckout / Math.max(winnerStats.highestCheckout, loserStats?.highestCheckout || 1)) * 100, 100)}%`
                        : '0%'
                    }}
                  />
                </div>
                <span className="text-lg font-bold text-slate-400">
                  {loserStats && loserStats.highestCheckout > 0 ? loserStats.highestCheckout : '-'}
                </span>
              </div>
            </div>

            {/* Checkout % */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="flex items-center gap-2 text-slate-400 mb-1">
                <Award className="w-3 h-3" />
                <span className="text-xs">Checkout %</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-yellow-400">
                  {winnerStats.checkoutPercentage.toFixed(1)}%
                </span>
                <div className="flex-1 mx-4 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-cyan-500 rounded-full"
                    style={{ 
                      width: winnerStats.checkoutPercentage > 0 || (loserStats?.checkoutPercentage || 0) > 0
                        ? `${Math.min((winnerStats.checkoutPercentage / Math.max(winnerStats.checkoutPercentage, loserStats?.checkoutPercentage || 1)) * 100, 100)}%`
                        : '0%'
                    }}
                  />
                </div>
                <span className="text-lg font-bold text-slate-400">
                  {loserStats?.checkoutPercentage.toFixed(1) || '0.0'}%
                </span>
              </div>
            </div>

            {/* Total Darts */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Total Darts Thrown</span>
                <div className="flex gap-6">
                  <span className="font-bold text-yellow-400 text-sm">{winnerStats.totalDartsThrown}</span>
                  <span className="font-bold text-slate-400 text-sm">{loserStats?.totalDartsThrown || 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-4">
            <Button
              onClick={onRematch}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 h-auto"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Rematch
            </Button>
            <Button
              onClick={onHome}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 py-2 h-auto"
            >
              <Home className="w-4 h-4 mr-2" />
              Back to Menu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
