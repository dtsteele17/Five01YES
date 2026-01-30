'use client';

import { ComputedRankLevel, getNextRank, getRankTier } from '@/lib/rankedDivisions';
import { Award, TrendingUp, Shield } from 'lucide-react';
import { getRankTextClasses, getTierColor, hexToRgba } from '@/lib/rank-badge-helpers';

interface RankSummaryCardProps {
  currentRank: ComputedRankLevel;
  currentRP: number;
}

export function RankSummaryCard({ currentRank, currentRP }: RankSummaryCardProps) {
  const nextRank = getNextRank(currentRank);
  const tier = getRankTier(currentRank.id);
  const tierColor = getTierColor(currentRank.name);
  const rpToPromotion = nextRank ? nextRank.minRP - currentRP : 0;
  const rpBuffer = currentRP - currentRank.relegationRP;
  const progressToNextRank = nextRank
    ? ((currentRP - currentRank.minRP) / (nextRank.minRP - currentRank.minRP)) * 100
    : 100;

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal-500/10 to-transparent rounded-full blur-3xl" />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-gray-400 text-sm mb-2">Your Current Rank</p>
            <div className="flex items-center gap-3">
              {tier && (
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center shadow-xl border backdrop-blur-sm"
                  style={{
                    backgroundColor: hexToRgba(tierColor, 0.14),
                    borderColor: hexToRgba(tierColor, 0.30),
                  }}
                >
                  <Award className="w-8 h-8" style={{ color: tierColor }} />
                </div>
              )}
              <div>
                <h2 className={`text-3xl font-bold mb-1 ${getRankTextClasses(currentRank.name)}`}>{currentRank.name}</h2>
                <p className="text-teal-400 font-semibold text-lg">{currentRP} RP</p>
              </div>
            </div>
          </div>
        </div>

        {nextRank && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-gray-400 text-sm">Progress to {nextRank.name}</p>
                <p className="text-white font-semibold text-sm">
                  {currentRP} / {nextRank.minRP} RP
                </p>
              </div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, progressToNextRank))}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-teal-500/10 border border-teal-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-teal-400" />
                  <p className="text-teal-400 text-xs font-medium">To Promotion</p>
                </div>
                <p className="text-white text-xl font-bold">{rpToPromotion} RP</p>
              </div>

              <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-orange-400" />
                  <p className="text-orange-400 text-xs font-medium">Relegation Buffer</p>
                </div>
                <p className="text-white text-xl font-bold">{rpBuffer} RP</p>
              </div>
            </div>
          </div>
        )}

        {!nextRank && (
          <div className="mt-6 p-4 bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 rounded-lg">
            <p className="text-red-400 font-semibold text-center">
              You've reached the highest rank!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
