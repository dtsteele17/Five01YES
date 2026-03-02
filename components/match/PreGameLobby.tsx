'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Check, Clock, User, Target, ArrowLeft, Loader2 } from 'lucide-react';

interface Player {
  id: string;
  username: string;
  avatar_url?: string;
  threeDartAvg?: number;
  isReady: boolean;
}

interface PreGameLobbyProps {
  player1: Player;
  player2: Player | null;
  currentUserId: string;
  onReady: () => void;
  onCancel: () => void;
  onBothReady: () => void;
  onTimeout: (playerWhoDidntReady: string) => void;
  gameMode: string;
  matchFormat: string;
}

const READY_TIMEOUT_SECONDS = 180; // 3 minutes

export function PreGameLobby({
  player1,
  player2,
  currentUserId,
  onReady,
  onCancel,
  onBothReady,
  onTimeout,
  gameMode,
  matchFormat,
}: PreGameLobbyProps) {
  const [timeRemaining, setTimeRemaining] = useState(READY_TIMEOUT_SECONDS);
  const [hasClickedReady, setHasClickedReady] = useState(false);

  const isPlayer1 = player1.id === currentUserId;
  const me = isPlayer1 ? player1 : player2;
  const opponent = isPlayer1 ? player2 : player1;

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Determine which player didn't ready up
          const playerWhoDidntReady = !player1.isReady 
            ? player1.username 
            : (!player2?.isReady ? player2?.username : 'A player');
          onTimeout(playerWhoDidntReady || 'A player');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onTimeout, player1, player2]);

  // Check if both players are ready
  useEffect(() => {
    if (player1.isReady && player2?.isReady) {
      onBothReady();
    }
  }, [player1.isReady, player2?.isReady, onBothReady]);

  const handleReady = useCallback(() => {
    setHasClickedReady(true);
    onReady();
  }, [onReady]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimerColor = () => {
    if (timeRemaining > 120) return 'text-emerald-400';
    if (timeRemaining > 60) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getTimerBg = () => {
    if (timeRemaining > 120) return 'bg-emerald-500/20 border-emerald-500/30';
    if (timeRemaining > 60) return 'bg-yellow-500/20 border-yellow-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <Card className="bg-slate-900 border-white/10 p-4 sm:p-8 max-w-lg w-full mx-4">
        {/* Header */}
        <div className="text-center mb-4 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">Match Lobby</h2>
          <p className="text-gray-400 text-sm">
            {gameMode} • {matchFormat.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </p>
        </div>

        {/* Timer */}
        <div className={`mb-4 sm:mb-8 p-2 sm:p-4 rounded-lg border ${getTimerBg()} text-center`}>
          <div className="flex items-center justify-center gap-2">
            <Clock className={`w-4 h-4 sm:w-5 sm:h-5 ${getTimerColor()}`} />
            <span className={`text-2xl sm:text-3xl font-bold ${getTimerColor()}`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
          <p className="text-gray-400 text-xs sm:text-sm">
            Both players must click Ready to start the match
          </p>
        </div>

        {/* Players */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-8">
          {/* Player 1 */}
          <div className={`p-2 sm:p-4 rounded-lg border ${player1.isReady ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10'}`}>
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-2 sm:mb-3">
                <Avatar className="w-10 h-10 sm:w-16 sm:h-16">
                  {player1.avatar_url ? (
                    <img src={player1.avatar_url} alt={player1.username} className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <AvatarFallback className="bg-slate-700">
                      <User className="w-8 h-8 text-gray-400" />
                    </AvatarFallback>
                  )}
                </Avatar>
                {player1.isReady && (
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
              <h3 className="font-semibold text-white mb-1 text-sm sm:text-base">
                {player1.username}
                {isPlayer1 && <span className="text-emerald-400 ml-1">(You)</span>}
              </h3>
              <div className="flex items-center gap-1 text-xs sm:text-sm">
                <Target className="w-3 h-3 sm:w-4 sm:h-4 text-blue-400" />
                <span className="text-blue-400">
                  {player1.threeDartAvg && player1.threeDartAvg > 0
                    ? `${player1.threeDartAvg.toFixed(1)} avg`
                    : 'New Player'}
                </span>
              </div>
              <div className="mt-2 sm:mt-3">
                {player1.isReady ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    Ready
                  </Badge>
                ) : (
                  <Badge className="bg-slate-700 text-gray-400">
                    Waiting...
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Player 2 */}
          <div className={`p-2 sm:p-4 rounded-lg border ${player2?.isReady ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/10'}`}>
            {player2 ? (
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-2 sm:mb-3">
                  <Avatar className="w-10 h-10 sm:w-16 sm:h-16">
                    {player2.avatar_url ? (
                      <img src={player2.avatar_url} alt={player2.username} className="w-full h-full object-cover rounded-full" />
                    ) : (
                      <AvatarFallback className="bg-slate-700">
                        <User className="w-8 h-8 text-gray-400" />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  {player2.isReady && (
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
                <h3 className="font-semibold text-white mb-1 text-sm sm:text-base">
                  {player2.username}
                  {!isPlayer1 && <span className="text-emerald-400 ml-1">(You)</span>}
                </h3>
                <div className="flex items-center gap-1 text-xs sm:text-sm">
                  <Target className="w-3 h-3 sm:w-4 sm:h-4 text-blue-400" />
                  <span className="text-blue-400">
                    {player2.threeDartAvg && player2.threeDartAvg > 0
                      ? `${player2.threeDartAvg.toFixed(1)} avg`
                      : 'New Player'}
                  </span>
                </div>
                <div className="mt-2 sm:mt-3">
                  {player2.isReady ? (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                      Ready
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-700 text-gray-400">
                      Waiting...
                    </Badge>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-slate-800 flex items-center justify-center mb-2 sm:mb-3">
                  <Loader2 className="w-5 h-5 sm:w-8 sm:h-8 text-gray-500 animate-spin" />
                </div>
                <h3 className="text-gray-400">Waiting for opponent...</h3>
              </div>
            )}
          </div>
        </div>

        {/* Ready Progress Bar */}
        <div className="mb-4 sm:mb-8">
          <div className="flex justify-between text-sm text-gray-400 mb-2">
            <span>Ready Status</span>
            <span>
              {[player1.isReady, player2?.isReady].filter(Boolean).length} / 2 players ready
            </span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-500"
              style={{
                width: `${(([player1.isReady, player2?.isReady].filter(Boolean).length) / 2) * 100}%`
              }}
            />
          </div>
        </div>

        {/* Ready Button */}
        {player2 && (
          <div className="mb-4">
            {me?.isReady ? (
              <div className="text-center p-4 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
                <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-emerald-400 font-semibold">You are ready!</p>
                <p className="text-gray-400 text-sm">
                  Waiting for {opponent?.username}...
                </p>
              </div>
            ) : (
              <Button
                onClick={handleReady}
                disabled={hasClickedReady}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white h-12 sm:h-14 text-base sm:text-lg"
              >
                {hasClickedReady ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Setting Ready...
                  </>
                ) : (
                  'I\'m Ready'
                )}
              </Button>
            )}
          </div>
        )}

        {/* Cancel Button */}
        <Button
          variant="outline"
          onClick={onCancel}
          className="w-full border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Leave Lobby
        </Button>
      </Card>
    </div>
  );
}
