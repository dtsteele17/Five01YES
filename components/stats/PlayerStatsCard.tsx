'use client';

import { Card } from '@/components/ui/card';
import { Trophy, Target, TrendingUp, Award, BarChart3 } from 'lucide-react';

interface PlayerStats {
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  overall_3dart_avg: number;
  overall_first9_avg: number;
  highest_checkout: number;
  checkout_percentage: number;
  total_checkouts?: number;
  checkout_attempts?: number;
  visits_100_plus: number;
  visits_140_plus: number;
  visits_180: number;
  total_darts_thrown: number;
  total_score?: number;
}

interface PlayerStatsCardProps {
  stats: PlayerStats | null;
  title: string;
  icon: React.ReactNode;
}

export function PlayerStatsCard({ stats, title, icon }: PlayerStatsCardProps) {
  if (!stats) {
    return (
      <Card className="bg-slate-900/50 border-slate-700 p-6">
        <div className="text-center text-slate-400">No stats available</div>
      </Card>
    );
  }

  const winPercentage = stats.total_matches > 0 
    ? ((stats.wins / stats.total_matches) * 100).toFixed(1) 
    : '0.0';

  return (
    <Card className="bg-slate-900/50 border-slate-700 p-6">
      <div className="flex items-center gap-3 mb-6">
        {icon}
        <h3 className="text-xl font-bold text-white">{title}</h3>
      </div>

      {/* Win/Loss Record */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="text-center">
          <div className="text-3xl font-bold text-emerald-400">{stats.wins}</div>
          <div className="text-xs text-slate-400">Wins</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-red-400">{stats.losses}</div>
          <div className="text-xs text-slate-400">Losses</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-yellow-400">{stats.draws}</div>
          <div className="text-xs text-slate-400">Draws</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-white">{winPercentage}%</div>
          <div className="text-xs text-slate-400">Win Rate</div>
        </div>
      </div>

      {/* Averages */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm">3-Dart Average</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {stats.overall_3dart_avg?.toFixed(1) || '0.0'}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Award className="w-4 h-4" />
            <span className="text-sm">First 9 Average</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {stats.overall_first9_avg?.toFixed(1) || '0.0'}
          </div>
        </div>
      </div>

      {/* Checkouts */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Target className="w-4 h-4" />
            <span className="text-sm">Highest Checkout</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {stats.highest_checkout || '-'}
          </div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-4">
          <div className="flex items-center gap-2 text-slate-400 mb-2">
            <Trophy className="w-4 h-4" />
            <span className="text-sm">Checkout %</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {stats.checkout_percentage?.toFixed(1) || '0.0'}%
          </div>
        </div>
      </div>

      {/* Visit Milestones */}
      <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-2 text-slate-400 mb-3">
          <BarChart3 className="w-4 h-4" />
          <span className="text-sm">Visit Milestones</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
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

      {/* Total Darts & Score */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <div className="text-xs text-slate-400 mb-1">Total Darts</div>
          <div className="text-xl font-bold text-orange-400">{stats.total_darts_thrown || 0}</div>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3 text-center">
          <div className="text-xs text-slate-400 mb-1">Total Score</div>
          <div className="text-xl font-bold text-cyan-400">{stats.total_score?.toLocaleString() || 0}</div>
        </div>
      </div>
    </Card>
  );
}
