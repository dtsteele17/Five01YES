'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlayerStatsCard } from '@/components/stats/PlayerStatsCard';
import { MatchHistoryList } from '@/components/stats/MatchHistoryList';
import { usePlayerStats } from '@/lib/hooks/usePlayerStats';
import { useFilteredPlayerStats } from '@/lib/hooks/useFilteredPlayerStats';
import { Trophy, BarChart3, ArrowLeft, History, Target, TrendingUp, Filter, Gamepad2 } from 'lucide-react';
import Link from 'next/link';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Filter options
const GAME_MODES = [
  { value: 'all', label: 'All Games' },
  { value: '301', label: '301' },
  { value: '501', label: '501' },
];

const MATCH_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'quick', label: 'Quick Match' },
  { value: 'ranked', label: 'Ranked Match' },
  { value: 'private', label: 'Private Match' },
  { value: 'local', label: 'Local Match' },
  { value: 'dartbot', label: 'Training (vs Bot)' },
];

export default function StatsPage() {
  const [gameModeFilter, setGameModeFilter] = useState<string>('all');
  const [matchTypeFilter, setMatchTypeFilter] = useState<string>('all');
  const [totalMatchesFromHistory, setTotalMatchesFromHistory] = useState<number>(0);
  
  const { overallStats, loading: overallLoading, error: overallError, refetch: refetchOverall } = usePlayerStats();
  
  // Convert filter values to proper types for the hook
  const gameModeParam = gameModeFilter === 'all' ? null : parseInt(gameModeFilter);
  const matchTypeParam = matchTypeFilter === 'all' ? null : matchTypeFilter;
  
  const { stats: filteredStats, loading: filteredLoading, error: filteredError, refetch: refetchFiltered } = useFilteredPlayerStats(
    gameModeParam,
    matchTypeParam
  );

  const supabase = createClient();

  // Fetch total matches count for debugging
  useEffect(() => {
    fetchTotalMatchesCount();
  }, []);

  async function fetchTotalMatchesCount() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count, error } = await supabase
        .from('match_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (error) {
        console.error('Error counting matches:', error);
        return;
      }

      setTotalMatchesFromHistory(count || 0);
    } catch (err) {
      console.error('Error:', err);
    }
  }

  // Determine which stats to display
  const isFiltered = gameModeFilter !== 'all' || matchTypeFilter !== 'all';
  const displayStats = isFiltered ? filteredStats : overallStats;
  const isLoading = overallLoading || (isFiltered && filteredLoading);
  const error = overallError || filteredError;

  const handleRefresh = () => {
    refetchOverall();
    refetchFiltered();
    fetchTotalMatchesCount();
  };

  const getGameModeLabel = (mode: string) => {
    return GAME_MODES.find(m => m.value === mode)?.label || 'All Games';
  };

  const getMatchTypeLabel = (type: string) => {
    return MATCH_TYPES.find(t => t.value === type)?.label || 'All Types';
  };

  const calculateWinRate = (stats: typeof displayStats) => {
    if (!stats || stats.total_matches === 0) return '0.0';
    return ((stats.wins / stats.total_matches) * 100).toFixed(1);
  };

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
          <Button onClick={handleRefresh} variant="outline" className="border-slate-600 text-slate-300">
            Refresh
          </Button>
        </div>

        {/* Debug Info (remove in production) */}
        {process.env.NODE_ENV === 'development' && (
          <Card className="bg-slate-900/50 border-slate-700 p-4 mb-4">
            <p className="text-xs text-slate-500">
              Debug: Total matches in history: {totalMatchesFromHistory} | 
              Overall stats matches: {overallStats?.total_matches || 0}
            </p>
          </Card>
        )}

        {/* Filters */}
        <Card className="bg-slate-900/50 border-slate-700 p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Filter className="w-5 h-5 text-emerald-400" />
            <span className="text-white font-semibold">Filter Stats</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-sm mb-2 block">Game Mode</label>
              <Select value={gameModeFilter} onValueChange={setGameModeFilter}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue placeholder="Select game mode" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {GAME_MODES.map((mode) => (
                    <SelectItem 
                      key={mode.value} 
                      value={mode.value} 
                      className="text-white hover:bg-slate-700"
                    >
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-slate-400 text-sm mb-2 block">Match Type</label>
              <Select value={matchTypeFilter} onValueChange={setMatchTypeFilter}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white">
                  <SelectValue placeholder="Select match type" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {MATCH_TYPES.map((type) => (
                    <SelectItem 
                      key={type.value} 
                      value={type.value} 
                      className="text-white hover:bg-slate-700"
                    >
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-slate-400">Showing:</span>
            <span className="text-emerald-400 font-medium">{getGameModeLabel(gameModeFilter)}</span>
            <span className="text-slate-500">•</span>
            <span className="text-emerald-400 font-medium">{getMatchTypeLabel(matchTypeFilter)}</span>
            {isFiltered && (
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
                Filtered
              </span>
            )}
          </div>
        </Card>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
              {calculateWinRate(displayStats)}%
            </div>
          </Card>
          
          <Card className="bg-slate-900/50 border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-blue-400" />
              <span className="text-slate-400 text-sm">Average</span>
            </div>
            <div className="text-3xl font-bold text-white">
              {/* Use avg_3dart for filtered, overall_3dart_avg for overall */}
              {isFiltered 
                ? (displayStats as any)?.avg_3dart?.toFixed(1) || '0.0'
                : (displayStats as any)?.overall_3dart_avg?.toFixed(1) || '0.0'
              }
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
        </div>

        {/* Detailed Stats */}
        <div className="grid grid-cols-1 gap-6 mb-8">
          {displayStats && displayStats.total_matches > 0 ? (
            <PlayerStatsCard
              stats={displayStats}
              title={`${getGameModeLabel(gameModeFilter)} - ${getMatchTypeLabel(matchTypeFilter)}`}
              icon={<Gamepad2 className="w-6 h-6 text-blue-400" />}
            />
          ) : (
            <Card className="bg-slate-900/50 border-slate-700 p-8 text-center">
              <Trophy className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-white text-lg font-semibold mb-2">No Stats Available</p>
              <p className="text-slate-400">
                {isFiltered
                  ? 'No matches found for the selected filters.' 
                  : 'Play some games to see your stats here!'}
              </p>
            </Card>
          )}
        </div>

        {/* Last 5 Matches - Always shown regardless of filters */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <History className="w-6 h-6 text-emerald-400" />
              <h2 className="text-xl font-bold text-white">Last 5 Matches</h2>
            </div>
            <span className="text-sm text-slate-400">Most recent games</span>
          </div>
          <MatchHistoryList 
            limit={5} 
            gameMode={null}
            matchType={null}
          />
        </div>

        {/* Filtered Match History */}
        {(gameModeFilter !== 'all' || matchTypeFilter !== 'all') && (
          <div className="mt-8 pt-8 border-t border-slate-700">
            <div className="flex items-center gap-3 mb-4">
              <Filter className="w-6 h-6 text-emerald-400" />
              <h2 className="text-xl font-bold text-white">Filtered Matches</h2>
            </div>
            <MatchHistoryList 
              limit={20} 
              gameMode={gameModeFilter === 'all' ? null : parseInt(gameModeFilter)}
              matchType={matchTypeFilter === 'all' ? null : matchTypeFilter}
            />
          </div>
        )}
      </div>
    </div>
  );
}
