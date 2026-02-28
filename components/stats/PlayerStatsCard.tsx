'use client';

import { Card } from '@/components/ui/card';
import { Trophy, Target, TrendingUp, Award, BarChart3, Disc } from 'lucide-react';

interface PlayerStats {
  total_matches: number;
  wins: number;
  losses: number;
  // Overall stats use these names
  overall_3dart_avg?: number;
  overall_first9_avg?: number;
  // Filtered stats use these names
  avg_3dart?: number;
  // Common fields
  highest_checkout: number;
  checkout_percentage?: number;
  checkout_pct?: number;
  total_checkouts?: number;
  checkout_attempts?: number;
  visits_100_plus: number;
  visits_140_plus: number;
  visits_180: number;
  total_darts_thrown?: number;
  total_darts?: number;
  total_score?: number;
}

interface PlayerStatsCardProps {
  stats: PlayerStats | null;
  title: string;
  icon: React.ReactNode;
}

export function PlayerStatsCard({ stats, title, icon }: PlayerStatsCardProps) {
  if (!stats || stats.total_matches === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-700 p-4 sm:p-6">
        <div className="text-center text-slate-400">No stats available for this filter</div>
      </Card>
    );
  }

  const winPercentage = stats.total_matches > 0 
    ? ((stats.wins / stats.total_matches) * 100).toFixed(1) 
    : '0.0';

  return (
    <Card className="bg-slate-900/50 border-slate-700 p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-6">
        {icon}
        <h3 className="text-xl font-bold text-white">{title}</h3>
        <span className="ml-auto text-sm text-slate-400">
          {stats.total_matches} match{stats.total_matches !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Win/Loss Record */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-5 sm:mb-6">
        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-bold text-emerald-400">{stats.wins}</div>
          <div className="text-xs text-slate-400">Wins</div>
        </div>
        <div className="text-center">
          <div className="text-2xl sm:text-3xl font-bold text-red-400">{stats.losses}</div>
          <div className="text-xs text-slate-400">Losses</div>
        </div>
        <div className="text-center col-span-2 sm:col-span-1">
          <div className="text-2xl sm:text-3xl font-bold text-white">{winPercentage}%</div>
          <div className="text-xs text-slate-400">Win Rate</div>
        </div>
      </div>

      {/* Averages */}
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4 mb-5 sm:mb-6">
        <div className="bg-slate-800/50 rounded-lg p-3 sm:p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">3-Dart Average</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white">
            {(stats.overall_3dart_avg ?? stats.avg_3dart ?? 0).toFixed(1)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            From {stats.total_darts_thrown ?? stats.total_darts ?? 0} darts
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 sm:p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Award className="w-4 h-4" />
            <span className="text-sm">First 9 Average</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white">
            {(stats.overall_first9_avg ?? 0).toFixed(1)}
          </div>
        </div>
      </div>

      {/* Checkouts */}
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 sm:gap-4 mb-5 sm:mb-6">
        <div className="bg-slate-800/50 rounded-lg p-3 sm:p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Target className="w-4 h-4" />
            <span className="text-sm">Highest Checkout</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-400">
            {stats.highest_checkout || '-'}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 sm:p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Trophy className="w-4 h-4" />
            <span className="text-sm">Checkout %</span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white">
            {(stats.checkout_percentage ?? stats.checkout_pct ?? 0).toFixed(1)}%
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {stats.total_checkouts || 0} / {stats.checkout_attempts || 0}
          </div>
        </div>
      </div>

      {/* Visit Milestones */}
      <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 text-slate-400 mb-3">
          <BarChart3 className="w-4 h-4" />
          <span className="text-sm">Visit Milestones</span>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="text-center">
            <div className="text-xl font-bold text-emerald-400">{stats.visits_100_plus || 0}</div>
            <div className="text-xs text-slate-400">100+</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-blue-400">{stats.visits_140_plus || 0}</div>
            <div className="text-xs text-slate-400">140+</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-purple-400">{stats.visits_180 || 0}</div>
            <div className="text-xs text-slate-400">180s</div>
          </div>
        </div>
      </div>

      {/* Total Darts */}
      <div className="bg-slate-800/50 rounded-lg p-3 text-center">
        <div className="flex items-center justify-center gap-2 text-slate-400 mb-1">
          <Disc className="w-4 h-4" />
          <span className="text-xs">Total Darts Thrown</span>
        </div>
        <div className="text-xl font-bold text-orange-400">{stats.total_darts_thrown ?? stats.total_darts ?? 0}</div>
      </div>
    </Card>
  );
}
