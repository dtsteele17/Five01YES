'use client';

import { ComputedRankTier } from '@/lib/rankedDivisions';
import { RankRow } from './RankRow';
import { Award } from 'lucide-react';
import { getRankTextClasses, getTierColor, hexToRgba } from '@/lib/rank-badge-helpers';

interface RankTierCardProps {
  tier: ComputedRankTier;
  currentRankId?: string;
}

export function RankTierCard({ tier, currentRankId }: RankTierCardProps) {
  const tierColor = getTierColor(tier.name);

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg border backdrop-blur-sm"
          style={{
            backgroundColor: hexToRgba(tierColor, 0.14),
            borderColor: hexToRgba(tierColor, 0.30),
          }}
        >
          <Award className="w-6 h-6" style={{ color: tierColor }} />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{tier.name}</h3>
          <p className="text-sm text-gray-400">
            {tier.minRP} - {tier.maxRP === 9999 ? '9999+' : tier.maxRP} RP
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {tier.levels.map((level) => (
          <RankRow
            key={level.id}
            level={level}
            isCurrentRank={level.id === currentRankId}
            accentColor={tier.accentColor}
          />
        ))}
      </div>
    </div>
  );
}
