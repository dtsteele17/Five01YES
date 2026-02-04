'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
}: QuickMatchPlayerCardProps) {
  const statColor = position === 'left' ? 'text-emerald-400' : 'text-blue-400';
  const borderColor = position === 'left' ? 'border-emerald-500/30' : 'border-blue-500/30';

  const showPreview = previewRemaining !== null && previewRemaining !== undefined && previewRemaining !== remaining;
  const isBust = showPreview && previewRemaining < 0;

  return (
    <div className="relative flex items-stretch gap-2">
      {position === 'left' && stats && (
        <div className="flex flex-col justify-center space-y-3 min-w-[100px]">
          <div className="text-right">
            <p className="text-sm text-gray-400 font-medium">Avg</p>
            <p className={`text-3xl font-bold ${statColor}`}>{stats.average.toFixed(1)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400 font-medium">Last Visit</p>
            <p className={`text-3xl font-bold ${statColor}`}>{stats.lastScore}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400 font-medium">Darts Thrown</p>
            <p className={`text-3xl font-bold ${statColor}`}>{stats.dartsThrown}</p>
          </div>
        </div>
      )}

      <Card className={`flex-1 bg-slate-800/50 border-2 ${isActive ? borderColor : 'border-white/10'} transition-all`}>
        <div className="p-3 space-y-3">
          <div className="flex items-center space-x-2">
            <Avatar className="w-8 h-8">
              <AvatarFallback className={position === 'left' ? 'bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-xs' : 'bg-gradient-to-br from-blue-400 to-cyan-500 text-white text-xs'}>
                {name.substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm truncate">{name}</p>
              {isActive && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/50 text-xs px-1 py-0">
                  Your Turn
                </Badge>
              )}
            </div>
          </div>

          <div className="text-center py-1">
            <div className="text-7xl font-display font-bold text-white tracking-tight" style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>{remaining}</div>
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
                    idx < legs ? `${position === 'left' ? 'bg-emerald-500' : 'bg-blue-500'}` : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      {position === 'right' && stats && (
        <div className="flex flex-col justify-center space-y-3 min-w-[100px]">
          <div>
            <p className="text-sm text-gray-400 font-medium">Avg</p>
            <p className={`text-3xl font-bold ${statColor}`}>{stats.average.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400 font-medium">Last Visit</p>
            <p className={`text-3xl font-bold ${statColor}`}>{stats.lastScore}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400 font-medium">Darts Thrown</p>
            <p className={`text-3xl font-bold ${statColor}`}>{stats.dartsThrown}</p>
          </div>
        </div>
      )}
    </div>
  );
}
