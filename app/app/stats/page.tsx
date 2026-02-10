'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerStatsCard } from '@/components/stats/PlayerStatsCard';
import { MatchHistoryList } from '@/components/stats/MatchHistoryList';
import { usePlayerStats } from '@/lib/hooks/usePlayerStats';
import { Trophy, BarChart3, ArrowLeft, History, Target, TrendingUp, Disc, Filter } from 'lucide-react';
import Link from 'next/link';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FilteredStats {
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  overall_3dart_avg: number;
  overall_first9_avg: number;
  highest_checkout: number;
  checkout_percentage: number;
  total_checkouts: number;
  checkout_attempts: number;
  visits_100_plus: number;
  visits_140_plus: number;
  visits_180: number;
  total_darts_thrown: number;
  total_score: number;
}

export default function StatsPage() {
  const { overallStats, loading, error } = usePlayerStats();
  const [gameModeFilter, setGameModeFilter] = useState<string>('all');
  const [matchTypeFilter, setMatchTypeFilter] = useState<string>('all');
  const [filteredStats, setFilteredStats] = useState<FilteredStats | null>(null);
  const [filteredLoading, setFilteredLoading] = useState(false);
  const supabase = createClient();

  // Fetch filtered stats when filters change
  useEffect(() => {
    fetchFilteredStats();
  }, [gameModeFilter, matchTypeFilter]);

  async function fetchFilteredStats() {
    try {
      setFilteredLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // If both filters are 'all', use overall stats from hook (no need to query)
      if (gameModeFilter === 'all' && matchTypeFilter === 'all') {
        setFilteredStats(null); // Will fall back to overallStats
        return;
      }

      // Call RPC function to get filtered stats
      const { data, error } = await supabase.rpc('fn_get_filtered_player_stats', {
        p_user_id: user.id,
        p_game_mode: gameModeFilter === 'all' ? null : parseInt(gameModeFilter),
        p_match_type: matchTypeFilter === 'all' ? null : matchTypeFilter
      });

      if (error) {
        console.error('Error fetching filtered stats:', error);
        setFilteredStats(null);
        return;
      }

      // The function returns an array with one row
      if (data && Array.isArray(data) && data.length > 0) {
        const row = data[0];
        setFilteredStats({
          total_matches: row.total_matches || 0,
          wins: row.wins || 0,
          losses: row.losses || 0,
          draws: row.draws || 0,
          overall_3dart_avg: parseFloat(row.overall_3dart_avg) || 0,
          overall_first9_avg: parseFloat(row.overall_first9_avg) || 0,
          highest_checkout: row.highest_checkout || 0,
          checkout_percentage: parseFloat(row.checkout_percentage) || 0,
          total_checkouts: row.total_checkouts || 0,
          checkout_attempts: row.checkout_attempts || 0,
          visits_100_plus: row.visits_100_plus || 0,
          visits_140_plus: row.visits_140_plus || 0,
          visits_180: row.visits_180 || 0,
          total_darts_thrown: row.total_darts_thrown || 0,
          total_score: row.total_score || 0
        });
      } else {
        // No matches found for filters - show zeros
        setFilteredStats({
          total_matches: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          overall_3dart_avg: 0,
          overall_first9_avg: 0,
          highest_checkout: 0,
          checkout_percentage: 0,
          total_checkouts: 0,
          checkout_attempts: 0,
          visits_100_plus: 0,
          visits_140_plus: 0,
          visits_180: 0,
          total_darts_thrown: 0,
          total_score: 0
        });
      }
    } catch (err) {
      console.error('Error:', err);
      setFilteredStats(null);
    } finally {
      setFilteredLoading(false);
    }
  }

  // Use filtered stats if available, otherwise fall back to overall
  const displayStats = filteredStats || overallStats;
  const isLoading = loading || filteredLoading;

  if (isLoading) {
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

  const winPercentage = displayStats?.total_matches > 0 
    ? ((displayStats.wins / displayStats.total_matches) * 100).toFixed(1)
    : '0.0';

  // Get filter display names
  const getGameModeLabel = (mode: string) => {
    switch (mode) {
      case '301': return '301';
      case '501': return '501';
      default: return 'All Games';
    }
  };

  const getMatchTypeLabel = (type: string) => {
    switch (type) {
      case 'quick': return 'Quick Match';
      case 'ranked': return 'Ranked Match';
      case 'private': return 'Private Match';
      case 'local': return 'Local Match';
      case 'training': return 'Training';
      case 'league': return 'League Match';
      case 'tournament': return 'Tournament';
      default: return 'All Types';
    }
  };

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

        {/* Filters */}
        <Card className="bg-slate-900/50 border-slate-700 p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Filter className="w-5 h-5 text-emerald-400" />
            <span className="text-white font-semibold">Filter Stats</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Game Mode Filter */}
            <div>
              <label className="text-slate-400 text-sm mb-2 block">Game Mode</label>
              <Select value={gameModeFilter} onValueChange={setGameModeFilter}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue placeholder="Select game mode" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="all" className="text-white hover:bg-slate-700">All Games</SelectItem>
                  <SelectItem value="301" className="text-white hover:bg-slate-700">301</SelectItem>
                  <SelectItem value="501" className="text-white hover:bg-slate-700">501</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Match Type Filter */}
            <div>
              <label className="text-slate-400 text-sm mb-2 block">Match Type</label>
              <Select value={matchTypeFilter} onValueChange={setMatchTypeFilter}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue placeholder="Select match type" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  <SelectItem value="all" className="text-white hover:bg-slate-700">All Types</SelectItem>
                  <SelectItem value="quick" className="text-white hover:bg-slate-700">Quick Match</SelectItem>
                  <SelectItem value="ranked" className="text-white hover:bg-slate-700">Ranked Match</SelectItem>
                  <SelectItem value="private" className="text-white hover:bg-slate-700">Private Match</SelectItem>
                  <SelectItem value="local" className="text-white hover:bg-slate-700">Local Match</SelectItem>
                  <SelectItem value="training" className="text-white hover:bg-slate-700">Training</SelectItem>
                  <SelectItem value="league" className="text-white hover:bg-slate-700">League</SelectItem>
                  <SelectItem value="tournament" className="text-white hover:bg-slate-700">Tournament</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Active Filters Display */}
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-slate-400">Showing:</span>
            <span className="text-emerald-400 font-medium">{getGameModeLabel(gameModeFilter)}</span>
            <span className="text-slate-500">•</span>
            <span className="text-emerald-400 font-medium">{getMatchTypeLabel(matchTypeFilter)}</span>
          </div>
        </Card>

        {/* Quick Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <Card className="bg-slate-900/50 border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Trophy className="w-5 h-5 text-yellow-400" />
              <span className="text-slate-400 text-sm">Matches</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {displayStats?.total_matches || 0}
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
              {displayStats?.overall_3dart_avg?.toFixed(1) || '0.0'}
            </div>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-purple-400" />
              <span className="text-slate-400 text-sm">Best Checkout</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {displayStats?.highest_checkout || '-'}
            </div>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Disc className="w-5 h-5 text-orange-400" />
              <span className="text-slate-400 text-sm">Darts Thrown</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {displayStats?.total_darts_thrown || 0}
            </div>
          </Card>
        </div>

        {/* Detailed Stats */}
        <div className="grid grid-cols-1 gap-6 mb-8">
          <PlayerStatsCard
            stats={displayStats}
            title={`${getGameModeLabel(gameModeFilter)} - ${getMatchTypeLabel(matchTypeFilter)}`}
            icon={<Trophy className="w-6 h-6 text-yellow-400" />}
          />
        </div>

        {/* Match History - With Filters */}
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4">
            <History className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Recent Matches</h2>
          </div>
          <MatchHistoryList 
            limit={20} 
            gameMode={gameModeFilter === 'all' ? null : parseInt(gameModeFilter)}
            matchType={matchTypeFilter === 'all' ? null : matchTypeFilter}
          />
        </div>
      </div>
    </div>
  );
}
