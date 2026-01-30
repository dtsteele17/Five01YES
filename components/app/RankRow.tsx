'use client';

import { ComputedRankLevel } from '@/lib/rankedDivisions';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface RankRowProps {
  level: ComputedRankLevel;
  isCurrentRank?: boolean;
  accentColor: string;
}

export function RankRow({ level, isCurrentRank, accentColor }: RankRowProps) {
  return (
    <div
      className={`p-4 rounded-lg border transition-all ${
        isCurrentRank
          ? `${accentColor} border-2 shadow-lg`
          : 'border-white/5 bg-slate-800/30 hover:border-white/10'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            {level.name.includes('4') ? (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            ) : level.name.includes('1') ? (
              <ChevronUp className="w-4 h-4 text-teal-400" />
            ) : (
              <div className="w-4 h-4" />
            )}
          </div>
          <div>
            <h4 className={`font-semibold ${isCurrentRank ? 'text-teal-400' : 'text-white'}`}>
              {level.name}
            </h4>
            {isCurrentRank && (
              <p className="text-xs text-teal-400 mt-0.5">Your Current Rank</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="text-right">
            <p className="text-gray-400 text-xs">Entry RP</p>
            <p className="text-white font-semibold">{level.minRP}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-xs">Relegation</p>
            <p className="text-orange-400 font-semibold">{level.relegationRP}</p>
          </div>
          <div className="text-right min-w-[100px]">
            <p className="text-gray-400 text-xs">RP Range</p>
            <p className="text-gray-300 font-medium text-xs">
              {level.minRP}–{level.maxRP === 9999 ? '9999+' : level.maxRP}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
