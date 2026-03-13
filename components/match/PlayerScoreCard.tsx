'use client';

import { UserAvatar } from '@/components/app/UserAvatar';
import { Card } from '@/components/ui/card';
import { TrustRatingBadge } from '@/components/app/TrustRatingBadge';

interface PlayerScoreCardProps {
  name: string;
  remaining: number;
  legsWon: number;
  legsToWin: number;
  isActive: boolean;
  isMe: boolean;
  userId?: string | null;
  trustRating?: {
    letter: string | null;
    count: number;
  } | null;
}

export function PlayerScoreCard({
  name,
  remaining,
  legsWon,
  legsToWin,
  isActive,
  isMe,
  userId,
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
          <UserAvatar 
            userId={userId} 
            name={name} 
            className="w-10 h-10"
            fallbackClassName={`text-white text-sm ${isMe ? 'bg-gradient-to-br from-emerald-400 to-teal-500' : 'bg-gradient-to-br from-blue-400 to-cyan-500'}`}
          />
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
      </div>

      <div className="text-center py-4 sm:py-6">
        <div className="text-8xl font-bold text-white leading-none mb-2">
          {remaining}
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Legs</p>
          <p className="text-xl font-bold text-white">{legsWon}</p>
        </div>
        <div className="flex items-center space-x-2">
          {Array.from({ length: legsToWin }).map((_, idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full ${
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
    </Card>
  );
}
