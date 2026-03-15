'use client';

import { UserAvatar } from '@/components/app/UserAvatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { TierTheme } from '@/lib/career/tierThemes';

interface QuickMatchPlayerCardProps {
  name: string;
  remaining: number;
  legs: number;
  legsToWin: number;
  isActive: boolean;
  color: string;
  position: 'left' | 'right';
  stats?: {
    average: number;
    lastScore: number;
    dartsThrown: number;
  };
  previewRemaining?: number | null;
  userId?: string | null;
  theme?: TierTheme | null;
}

export function QuickMatchPlayerCard({
  name,
  remaining,
  legs,
  legsToWin,
  isActive,
  color,
  position,
  stats,
  previewRemaining,
  userId,
  theme,
}: QuickMatchPlayerCardProps) {
  // Use theme accent for stats if available, otherwise default colors
  const statColor = theme ? theme.accent : position === 'left' ? 'text-emerald-400' : 'text-blue-400';
  const borderActive = theme ? theme.accentBorder : position === 'left' ? 'border-emerald-500/30' : 'border-blue-500/30';
  const dotFill = theme ? theme.dotColor : position === 'left' ? 'bg-emerald-500' : 'bg-blue-500';
  const cardBg = theme ? theme.scoreBg : 'bg-slate-800/50';
  const cardBorder = theme ? theme.scoreBorder : '';
  const cardRadius = theme ? theme.cardRadius : 'rounded-xl';
  const avatarFallback = theme 
    ? `${theme.accentBg} text-white text-xs`
    : position === 'left' 
      ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-xs' 
      : 'bg-gradient-to-br from-blue-400 to-cyan-500 text-white text-xs';

  const showPreview = previewRemaining !== null && previewRemaining !== undefined && previewRemaining !== remaining;
  const isBust = showPreview && previewRemaining < 0;

  // Score font weight varies by tier
  const scoreFontWeight = theme ? theme.titleWeight : 'font-bold';

  return (
    <div className="relative flex items-stretch gap-1 sm:gap-2">
      {position === 'left' && stats && (
        <div className="flex flex-col justify-center space-y-2 sm:space-y-3 min-w-[80px] sm:min-w-[100px]">
          <div className="text-right">
            <p className="text-xs sm:text-sm text-gray-400 font-medium">Avg</p>
            <p className={`text-xl sm:text-2xl md:text-3xl font-bold ${statColor}`}>{stats.average.toFixed(1)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs sm:text-sm text-gray-400 font-medium">Last</p>
            <p className={`text-xl sm:text-2xl md:text-3xl font-bold ${statColor}`}>{stats.lastScore}</p>
          </div>
          <div className="text-right">
            <p className="text-xs sm:text-sm text-gray-400 font-medium">Darts</p>
            <p className={`text-xl sm:text-2xl md:text-3xl font-bold ${statColor}`}>{stats.dartsThrown}</p>
          </div>
        </div>
      )}

      <Card className={`flex-1 ${cardBg} border-2 ${isActive ? borderActive : cardBorder || 'border-white/10'} ${cardRadius} transition-all`}>
        <div className="p-3 space-y-3">
          <div className="flex items-center space-x-2">
            <UserAvatar 
              userId={userId} 
              name={name} 
              className="w-8 h-8"
              fallbackClassName={avatarFallback}
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm truncate">{name}</p>
              {isActive && (
                <Badge className={`${theme ? `${theme.badgeBg} ${theme.accent}` : 'bg-emerald-500/20 text-emerald-400'} border-transparent text-xs px-1 py-0`}>
                  Your Turn
                </Badge>
              )}
            </div>
          </div>

          <div className="text-center py-1">
            <div className={`text-4xl sm:text-6xl md:text-7xl font-display ${scoreFontWeight} text-white tracking-tight`} style={{ letterSpacing: '-0.02em' }}>{remaining}</div>
            {showPreview && (
              <div className={`text-sm mt-1 ${isBust ? 'text-red-400' : 'text-gray-400'}`}>
                Remaining: {isBust ? 'Bust' : previewRemaining}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">Legs</p>
              <p className={`text-2xl font-bold ${statColor}`}>{legs}</p>
            </div>
            <div className="flex space-x-1.5">
              {[...Array(legsToWin)].map((_, idx) => (
                <div
                  key={idx}
                  className={`w-3 h-3 rounded-full ${
                    idx < legs ? dotFill : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      {position === 'right' && stats && (
        <div className="flex flex-col justify-center space-y-2 sm:space-y-3 min-w-[80px] sm:min-w-[100px]">
          <div>
            <p className="text-xs sm:text-sm text-gray-400 font-medium">Avg</p>
            <p className={`text-xl sm:text-2xl md:text-3xl font-bold ${statColor}`}>{stats.average.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-gray-400 font-medium">Last</p>
            <p className={`text-xl sm:text-2xl md:text-3xl font-bold ${statColor}`}>{stats.lastScore}</p>
          </div>
          <div>
            <p className="text-xs sm:text-sm text-gray-400 font-medium">Darts</p>
            <p className={`text-xl sm:text-2xl md:text-3xl font-bold ${statColor}`}>{stats.dartsThrown}</p>
          </div>
        </div>
      )}
    </div>
  );
}
