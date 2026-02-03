'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { TrustRatingBadge } from '@/components/app/TrustRatingBadge';

interface PlayerScoreCardProps {
  name: string;
  remaining: number;
  average: number;
  lastScore?: number;
  dartsThrown?: number;
  legsWon: number;
  legsToWin: number;
  isActive: boolean;
  isMe: boolean;
  trustRating?: {
    letter: string | null;
    count: number;
  } | null;
}

export function PlayerScoreCard({
  name,
  remaining,
  average,
  lastScore,
  dartsThrown,
  legsWon,
  legsToWin,
  isActive,
  isMe,
  trustRating,
}: PlayerScoreCardProps) {
  return (
    <Card
      className={`p-4 transition-all ${
        isActive
          ? isMe
            ? 'bg-emerald-500/20 border-emerald-500/50 shadow-lg shadow-emerald-500/20'
            : 'bg-blue-500/20 border-blue-500/50 shadow-lg shadow-blue-500/20'
          : 'bg-slate-900/50 border-white/10'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <Avatar className="w-10 h-10">
            <AvatarFallback
              className={`text-white text-sm ${
                isMe
                  ? 'bg-gradient-to-br from-emerald-400 to-teal-500'
                  : 'bg-gradient-to-br from-blue-400 to-cyan-500'
              }`}
            >
              {name.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-base font-semibold text-white">{name}</p>
            {!isMe && trustRating && (
              <TrustRatingBadge
                letter={trustRating.letter as 'A' | 'B' | 'C' | 'D' | 'E' | null}
                count={trustRating.count}
                showTooltip={false}
              />
            )}
          </div>
        </div>
        <div className="flex items-center space-x-1.5">
          {Array.from({ length: legsToWin }).map((_, idx) => (
            <div
              key={idx}
              className={`w-3 h-3 rounded-full ${
                idx < legsWon
                  ? isMe
                    ? 'bg-gradient-to-br from-emerald-400 to-teal-500'
                    : 'bg-gradient-to-br from-blue-400 to-cyan-500'
                  : 'border-2 border-gray-600'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="text-center py-6">
        <div className="text-8xl font-bold text-white leading-none mb-2">
          {remaining}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">Average</p>
          <p className={`text-2xl font-bold ${isMe ? 'text-emerald-400' : 'text-blue-400'}`}>
            {average.toFixed(2)}
          </p>
        </div>
        {lastScore !== undefined && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Last Score</p>
            <p className="text-2xl font-bold text-white">{lastScore}</p>
          </div>
        )}
        {dartsThrown !== undefined && dartsThrown > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-1">Darts Thrown</p>
            <p className="text-2xl font-bold text-white">{dartsThrown}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
