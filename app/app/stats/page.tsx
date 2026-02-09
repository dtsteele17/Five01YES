'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerStatsCard } from '@/components/stats/PlayerStatsCard';
import { usePlayerStats } from '@/lib/hooks/usePlayerStats';
import { Trophy, Gamepad2, BarChart3, ArrowLeft } from 'lucide-react';
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

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-slate-900/50 border-slate-700 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="w-6 h-6 text-yellow-400" />
              <span className="text-slate-400">Total Matches</span>
            </div>
            <div className="text-4xl font-bold text-white">
              {overallStats?.total_matches || 0}
            </div>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-700 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="w-6 h-6 text-emerald-400" />
              <span className="text-slate-400">Total Wins</span>
            </div>
            <div className="text-4xl font-bold text-white">
              {overallStats?.wins || 0}
            </div>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-700 p-6">
            <div className="flex items-center gap-3 mb-2">
              <Gamepad2 className="w-6 h-6 text-blue-400" />
              <span className="text-slate-400">Quick Matches</span>
            </div>
            <div className="text-4xl font-bold text-white">
              {quickMatchStats?.total_matches || 0}
            </div>
          </Card>
        </div>

        {/* Detailed Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {/* Recent Activity Placeholder */}
        <div className="mt-8">
          <h2 className="text-xl font-bold text-white mb-4">Match History</h2>
          <Card className="bg-slate-900/50 border-slate-700 p-6">
            <div className="text-center text-slate-400">
              Match history feature coming soon!
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
