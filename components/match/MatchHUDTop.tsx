'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';

interface Player {
  name: string;
  remaining: number;
  average: number;
  legsWon: number;
  isActive: boolean;
  isMe: boolean;
}

interface MatchHUDTopProps {
  bestOf: string;
  myPlayer: Player;
  opponentPlayer: Player;
  legsToWin: number;
}

export function MatchHUDTop({
  bestOf,
  myPlayer,
  opponentPlayer,
  legsToWin,
}: MatchHUDTopProps) {
  return (
    <div className="flex flex-col items-center py-3 px-4 space-y-3">
      <h2 className="text-lg font-semibold text-white">{bestOf}</h2>

      <div className="flex items-center justify-center gap-6">
        <Card
          className={`w-64 p-4 transition-all ${
            myPlayer.isActive
              ? 'bg-emerald-500/20 border-emerald-500/50 shadow-lg shadow-emerald-500/20'
              : 'bg-slate-900/50 border-white/10'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-xs">
                  {myPlayer.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="text-sm font-semibold text-white">{myPlayer.name}</p>
            </div>
          </div>

          <div className="text-center py-6">
            <div className="text-7xl font-bold text-white leading-none">
              {myPlayer.remaining}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-emerald-400">
              {myPlayer.average.toFixed(2)}
            </span>
            <div className="flex items-center space-x-1.5">
              {Array.from({ length: legsToWin }).map((_, idx) => (
                <div
                  key={idx}
                  className={`w-3 h-3 rounded-full ${
                    idx < myPlayer.legsWon
                      ? 'bg-gradient-to-br from-emerald-400 to-teal-500'
                      : 'border-2 border-gray-600'
                  }`}
                />
              ))}
            </div>
          </div>
        </Card>

        <Card
          className={`w-64 p-4 transition-all ${
            opponentPlayer.isActive
              ? 'bg-blue-500/20 border-blue-500/50 shadow-lg shadow-blue-500/20'
              : 'bg-slate-900/50 border-white/10'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-gradient-to-br from-blue-400 to-cyan-500 text-white text-xs">
                  {opponentPlayer.name.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <p className="text-sm font-semibold text-white">{opponentPlayer.name}</p>
            </div>
          </div>

          <div className="text-center py-6">
            <div className="text-7xl font-bold text-white leading-none">
              {opponentPlayer.remaining}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-blue-400">
              {opponentPlayer.average.toFixed(2)}
            </span>
            <div className="flex items-center space-x-1.5">
              {Array.from({ length: legsToWin }).map((_, idx) => (
                <div
                  key={idx}
                  className={`w-3 h-3 rounded-full ${
                    idx < opponentPlayer.legsWon
                      ? 'bg-gradient-to-br from-blue-400 to-cyan-500'
                      : 'border-2 border-gray-600'
                  }`}
                />
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
