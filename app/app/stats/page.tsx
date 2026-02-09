'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerStatsCard } from '@/components/stats/PlayerStatsCard';
import { MatchHistoryList } from '@/components/stats/MatchHistoryList';
import { usePlayerStats } from '@/lib/hooks/usePlayerStats';
import { Trophy, Gamepad2, BarChart3, ArrowLeft, History, Target, TrendingUp, Award } from 'lucide-react';
import Link from 'next/link';

export default function StatsPage() {
  const { overallStats, quickMatchStats, loading, error } = usePlayerStats();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-white text-center">Loading stats...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-red-400 text-center">Error loading stats: {error}</div>
        </div>
      </div>
    );
  }

  const winPercentage = overallStats?.total_matches && overallStats.total_matches > 0
    ? ((overallStats.wins / overallStats.total_matches) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/app">
              <Button variant="outline" size="icon" className="border-slate-600">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-emerald-400" />
              Your Statistics
            </h1>
          </div>
        </div>

        {/* Quick Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-slate-900/50 border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
              <span className="text-slate-400 text-sm">Matches</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {overallStats?.total_matches || 0}
            </div>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-emerald-400" />
              <span className="text-slate-400 text-sm">Win Rate</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {winPercentage}%
            </div>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              <span className="text-slate-400 text-sm">Average</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {overallStats?.overall_3dart_avg?.toFixed(1) || '0.0'}
            </div>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-purple-400" />
              <span className="text-slate-400 text-sm">Best Checkout</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {overallStats?.highest_checkout || '-'}
            </div>
          </Card>
        </div>

        {/* Detailed Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <PlayerStatsCard
            stats={overallStats}
            title="Overall Stats"
            icon={<Trophy className="w-6 h-6 text-yellow-400" />}
          />
          
          <PlayerStatsCard
            stats={quickMatchStats}
            title="Quick Match Stats"
            icon={<Gamepad2 className="w-6 h-6 text-blue-400" />}
          />
        </div>

        {/* Match History - Like DartCounter */}
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4">
            <History className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Recent Matches</h2>
          </div>
          <MatchHistoryList limit={20} />
        </div>
      </div>
    </div>
  );
}
