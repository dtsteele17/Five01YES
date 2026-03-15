'use client';

import { motion } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, Target, TrendingUp, Award, RotateCcw, Undo2, Crown, Sparkles } from 'lucide-react';
import { getEventTheme, type TierTheme } from '@/lib/career/tierThemes';
import { Button } from '@/components/ui/button';
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

interface CareerContext {
  eventName?: string;
  eventType?: string;
  bracketRound?: string;
  isCareer: boolean;
  playerWon: boolean;
  tier?: number;
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
  legStats?: LegStats[];
  career?: CareerContext;
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
  legStats = [],
  career,
}: DartbotWinnerPopupProps) {
  const isPlayer1Winner = player1.id === winnerId;
  const winnerName = isPlayer1Winner ? player1.name : player2.name;
  
  // Get tier theme if career mode
  const theme = career?.tier ? getEventTheme(career.tier, career.eventType, career.eventName) : null;
  
  // Colors — career uses tier theme, dartbot uses default green/purple
  const p1Color = theme ? theme.accent : isPlayer1Winner ? 'text-emerald-400' : 'text-blue-400';
  const p1Border = theme ? theme.accentBorder : isPlayer1Winner ? 'border-emerald-500/30' : 'border-blue-500/30';
  const p1Bg = theme ? theme.cardBg : isPlayer1Winner ? 'bg-gradient-to-b from-emerald-500/10 to-emerald-600/10' : 'bg-gradient-to-b from-blue-500/10 to-blue-600/10';
  
  const p2Color = theme ? 'text-slate-300' : isPlayer1Winner ? 'text-purple-400' : 'text-amber-400';
  const p2Border = theme ? 'border-slate-600/30' : isPlayer1Winner ? 'border-purple-500/30' : 'border-amber-500/30';
  const p2Bg = theme ? 'bg-slate-800/40' : isPlayer1Winner ? 'bg-gradient-to-b from-purple-500/10 to-purple-600/10' : 'bg-gradient-to-b from-amber-500/10 to-amber-600/10';

  const fmt = (v: number, suffix = '') => v != null && v > 0 ? `${v.toFixed(1)}${suffix}` : '0.0';
  const fmtInt = (v: number) => v != null && v > 0 ? v.toString() : '0';

  return (
    <Dialog open={true} modal>
      <DialogContent 
        className={`text-white w-full max-w-[95vw] sm:max-w-2xl lg:max-w-3xl p-0 overflow-y-auto ${
          theme ? `bg-slate-900 ${theme.borderStyle} ${theme.cardBorder}` : 'bg-slate-900 border-slate-700'
        }`}
        style={{ maxHeight: '90vh' }}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Winner Header */}
        <div className={`relative p-3 sm:p-4 ${theme
          ? `${theme.cardBg} border-b ${theme.accentBorder}`
          : `bg-gradient-to-r ${isPlayer1Winner ? 'from-emerald-600/20 via-emerald-500/20 to-emerald-600/20 border-b border-emerald-500/30' : 'from-red-600/20 via-red-500/20 to-red-600/20 border-b border-red-500/30'}`
        }`}>
          {theme && <div className={`absolute top-0 left-0 right-0 ${theme.accentBarHeight} ${theme.accentGradient}`} />}
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
                <Sparkles className={`w-3 h-3 ${theme ? theme.accent : 'text-yellow-400'}`} />
              </motion.div>
            ))}
          </div>

          <div className="relative flex items-center justify-center gap-3">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <Crown className={`w-6 h-6 ${theme ? theme.accent : 'text-yellow-400'}`} />
            </motion.div>
            
            <DialogHeader className="space-y-0">
              <DialogTitle className={`${theme ? `${theme.titleSize} ${theme.titleWeight} text-transparent bg-clip-text ${theme.textGradient}` : `text-lg sm:text-xl font-black ${isPlayer1Winner ? 'text-emerald-400' : 'text-red-400'}`}`}>
                {isPlayer1Winner ? '🎉 You Win!' : '😔 Bot Wins!'}
              </DialogTitle>
            </DialogHeader>
            
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
            >
              <Trophy className={`w-6 h-6 ${theme ? theme.accent : 'text-yellow-400'}`} />
            </motion.div>
          </div>
          
          <p className="text-slate-400 text-xs text-center mt-1">
            {career?.isCareer ? (
              <>
                <span className={theme ? `${theme.accent} font-medium` : ''}>{career.eventName}</span>
                {career.bracketRound && <> • {career.bracketRound}</>}
                {' • vs '}{player2.name}
              </>
            ) : (
              <>{gameMode} • Best of {bestOf} • vs {player2.name}</>
            )}
          </p>
        </div>

        {/* Score Display */}
        <div className="px-3 sm:px-4 py-3">
          <div className={`${theme ? `${theme.scoreBg} ${theme.scoreBorder} ${theme.cardRadius}` : 'bg-slate-800 rounded-xl border-slate-600'} border p-3 sm:p-4`}>
            <div className="flex items-center justify-center gap-6 sm:gap-12">
              <div className="text-center">
                <div className={`${p1Color} text-xs sm:text-sm font-bold mb-1 truncate`}>{player1.name}</div>
                <div className={`text-3xl sm:text-4xl lg:text-5xl font-black ${theme ? `text-transparent bg-clip-text ${theme.textGradient}` : p1Color}`}>{player1.legs}</div>
              </div>
              <div className="text-lg sm:text-2xl font-bold text-slate-500">-</div>
              <div className="text-center">
                <div className={`${p2Color} text-xs sm:text-sm font-bold mb-1 truncate`}>{player2.name}</div>
                <div className={`text-3xl sm:text-4xl lg:text-5xl font-black ${p2Color}`}>{player2.legs}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats - Responsive Layout */}
        <div className="px-3 sm:px-4 flex flex-col sm:flex-row gap-3 sm:gap-4">
          {/* Player 1 Stats */}
          <div className={`flex-1 ${p1Bg} ${p1Border} border ${theme ? theme.cardRadius : 'rounded-xl'} p-3`}>
            <div className="text-center mb-3">
              <div className={`font-bold ${p1Color} text-lg`}>{player1.name}</div>
              {isPlayer1Winner && (
                <div className={`text-xs ${theme ? `${theme.accentMuted}` : 'text-emerald-400/70'} font-medium`}>🏆 Winner</div>
              )}
            </div>
            
            <div className="space-y-2">
              {[
                ['3-Dart Avg', fmt(player1Stats?.threeDartAverage)],
                ['First 9', fmt(player1Stats?.first9Average)],
                ['Best Checkout', fmtInt(player1Stats?.highestCheckout || 0)],
                ['Checkout %', fmt(player1Stats?.checkoutPercentage, '%')],
                ['Best Leg', player1Stats?.bestLegDarts > 0 ? `${player1Stats.bestLegDarts} darts` : '-'],
                ['100+/140+/180', `${player1Stats?.count100Plus || 0}/${player1Stats?.count140Plus || 0}/${player1Stats?.oneEighties || 0}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-slate-400 text-sm">{label}</span>
                  <span className={`font-bold ${p1Color} ${label === '100+/140+/180' ? 'text-sm' : 'text-base'}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bot Stats */}
          <div className={`flex-1 ${p2Bg} ${p2Border} border ${theme ? theme.cardRadius : 'rounded-xl'} p-3`}>
            <div className="text-center mb-3">
              <div className={`font-bold ${p2Color} text-lg`}>{player2.name}</div>
              {!isPlayer1Winner && (
                <div className="text-xs text-purple-400/70 font-medium">🤖 Bot Wins</div>
              )}
            </div>
            
            <div className="space-y-2">
              {[
                ['3-Dart Avg', fmt(player2Stats?.threeDartAverage)],
                ['First 9', fmt(player2Stats?.first9Average)],
                ['Best Checkout', fmtInt(player2Stats?.highestCheckout || 0)],
                ['Checkout %', fmt(player2Stats?.checkoutPercentage, '%')],
                ['Best Leg', player2Stats?.bestLegDarts > 0 ? `${player2Stats.bestLegDarts} darts` : '-'],
                ['100+/140+/180', `${player2Stats?.count100Plus || 0}/${player2Stats?.count140Plus || 0}/${player2Stats?.oneEighties || 0}`],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-slate-400 text-sm">{label}</span>
                  <span className={`font-bold ${p2Color} ${label === '100+/140+/180' ? 'text-sm' : 'text-base'}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-3">
          {career?.isCareer ? (
            <div>
              <Button
                onClick={onReturn}
                className={`w-full py-2 sm:py-3 h-auto text-sm font-semibold ${
                  theme && career.playerWon
                    ? `${theme.buttonBg} ${theme.buttonHover} ${theme.buttonText} ${theme.buttonShadow}`
                    : career.playerWon
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-white'
                }`}
              >
                {career.playerWon ? (
                  <>
                    <Trophy className="w-4 h-4 mr-2" />
                    {career.bracketRound ? 'Next Round' : 'Continue Career'}
                  </>
                ) : (
                  <>
                    <Undo2 className="w-4 h-4 mr-2" />
                    {career.bracketRound ? 'View Results' : 'Back to Career'}
                  </>
                )}
              </Button>
              <div className="mt-3 text-center text-xs text-slate-500">
                {career.playerWon && career.bracketRound
                  ? 'Advance to the next round of the tournament'
                  : career.playerWon
                  ? 'Return to your career dashboard'
                  : career.bracketRound
                  ? 'See the full tournament results'
                  : 'Better luck next time'}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <Button
                  onClick={onRematch}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 sm:py-3 h-auto text-sm font-semibold"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Play Again
                </Button>
                <Button
                  onClick={onReturn}
                  variant="outline"
                  className="flex-1 border-blue-500/50 text-blue-400 hover:bg-blue-500/10 py-2 sm:py-3 h-auto text-sm font-semibold"
                >
                  <Undo2 className="w-4 h-4 mr-2" />
                  Return to Play
                </Button>
              </div>
              <div className="mt-3 text-center text-xs text-slate-500">
                Click &quot;Play Again&quot; to start a new match with the same settings
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
