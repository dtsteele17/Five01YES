'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlayerStatsCard } from '@/components/stats/PlayerStatsCard';
import { MatchHistoryList } from '@/components/stats/MatchHistoryList';
import { ModernMatchCard } from '@/components/match/ModernMatchCard';
import { usePlayerStats } from '@/lib/hooks/usePlayerStats';
import { useFilteredPlayerStats } from '@/lib/hooks/useFilteredPlayerStats';
import { useMatchHistory } from '@/lib/hooks/useMatchHistory';
import { MatchStatsModal } from '@/components/app/MatchStatsModal';
import {
  Trophy,
  BarChart3,
  Target,
  TrendingUp,
  Filter,
  Flame,
  Zap,
  Crown,
  Activity,
  ChevronDown,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ArrowRight,
} from 'lucide-react';
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
  { value: 'tournament', label: 'Tournaments' },
];

// Main Stat Card Component
interface MainStatCardProps {
  value: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  trend?: { direction: 'up' | 'down' | 'flat'; value: string };
  sublabel?: string;
}

function MainStatCard({ value, label, icon, color, trend, sublabel }: MainStatCardProps) {
  return (
    <Card className="relative overflow-hidden bg-slate-800/40 border-slate-700/50 p-4 sm:p-6 group">
      <div className={`absolute top-0 left-0 w-1 h-full ${color}`} />
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xl sm:text-2xl md:text-4xl font-black text-white tracking-tight">{value}</p>
          <p className="text-slate-400 text-xs sm:text-sm mt-1 uppercase tracking-wider font-medium">{label}</p>
          {sublabel && <p className="text-slate-500 text-xs mt-1">{sublabel}</p>}
          {trend && (
            <div className="flex items-center gap-1 mt-2 sm:mt-3">
              {trend.direction === 'up' && <ArrowUpRight className="w-4 h-4 text-emerald-400" />}
              {trend.direction === 'down' && <ArrowDownRight className="w-4 h-4 text-red-400" />}
              {trend.direction === 'flat' && <Minus className="w-4 h-4 text-slate-400" />}
              <span className={`text-xs sm:text-sm font-medium ${
                trend.direction === 'up' ? 'text-emerald-400' :
                trend.direction === 'down' ? 'text-red-400' : 'text-slate-400'
              }`}>
                {trend.value}
              </span>
            </div>
          )}
        </div>
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl ${color} bg-opacity-20 flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

// Filter Button Component
function FilterButton({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        active 
          ? 'bg-emerald-500 text-white' 
          : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

export default function StatsPage() {
  const [gameModeFilter, setGameModeFilter] = useState<string>('all');
  const [matchTypeFilter, setMatchTypeFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [tournamentWins, setTournamentWins] = useState<number>(0);
  const [totalMatchesFromHistory, setTotalMatchesFromHistory] = useState<number>(0);
  
  const { overallStats, loading: overallLoading, error: overallError, refetch: refetchOverall } = usePlayerStats();
  
  const gameModeParam = gameModeFilter === 'all' ? null : parseInt(gameModeFilter);
  const matchTypeParam = matchTypeFilter === 'all' ? null : matchTypeFilter;
  
  const { stats: filteredStats, loading: filteredLoading, error: filteredError, refetch: refetchFiltered } = useFilteredPlayerStats(
    gameModeParam,
    matchTypeParam
  );

  const supabase = createClient();

  useEffect(() => {
    fetchTotalMatchesCount();
    fetchTournamentWins();
  }, []);

  async function fetchTotalMatchesCount() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count, error } = await supabase
        .from('match_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (!error) {
        setTotalMatchesFromHistory(count || 0);
      }
    } catch (err) {
      console.error('Error:', err);
    }
  }

  async function fetchTournamentWins() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { count, error } = await supabase
        .from('tournaments')
        .select('*', { count: 'exact', head: true })
        .eq('winner_id', user.id)
        .eq('status', 'completed');
      if (!error) setTournamentWins(count || 0);
    } catch (err) {
      console.error('Error fetching tournament wins:', err);
    }
  }

  const isFiltered = gameModeFilter !== 'all' || matchTypeFilter !== 'all';
  const displayStats = isFiltered ? filteredStats : overallStats;
  const isLoading = overallLoading || (isFiltered && filteredLoading);
  const error = overallError || filteredError;

  const handleRefresh = () => {
    refetchOverall();
    refetchFiltered();
    fetchTotalMatchesCount();
  };

  const calculateWinRate = (stats: typeof displayStats) => {
    if (!stats || stats.total_matches === 0) return '0.0';
    return ((stats.wins / stats.total_matches) * 100).toFixed(1);
  };

  const getAverage = (stats: typeof displayStats) => {
    return isFiltered 
      ? (stats as any)?.avg_3dart?.toFixed(1) || '0.0'
      : (stats as any)?.overall_3dart_avg?.toFixed(1) || '0.0';
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-20 bg-slate-800/50 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-800/50 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="text-red-400 text-center py-20">
          <Activity className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Error loading stats: {error}</p>
          <Button onClick={handleRefresh} className="mt-4">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-emerald-400 text-sm font-semibold uppercase tracking-wider mb-2">Performance</p>
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-black text-white tracking-tight">Your Statistics</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="border-slate-600 text-slate-300 hover:text-white"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
            <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
          <Button onClick={handleRefresh} variant="outline" className="border-slate-600 text-slate-300 hover:text-white">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <Card className="bg-slate-800/40 border-slate-700/50 p-4 sm:p-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="text-slate-400 text-sm mb-3 block font-medium">Game Mode</label>
              <div className="flex flex-wrap gap-2">
                {GAME_MODES.map((mode) => (
                  <FilterButton
                    key={mode.value}
                    active={gameModeFilter === mode.value}
                    onClick={() => setGameModeFilter(mode.value)}
                  >
                    {mode.label}
                  </FilterButton>
                ))}
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-sm mb-3 block font-medium">Match Type</label>
              <div className="flex flex-wrap gap-2">
                {MATCH_TYPES.map((type) => (
                  <FilterButton
                    key={type.value}
                    active={matchTypeFilter === type.value}
                    onClick={() => setMatchTypeFilter(type.value)}
                  >
                    {type.label}
                  </FilterButton>
                ))}
              </div>
            </div>
          </div>
          {isFiltered && (
            <div className="mt-4 pt-4 border-t border-slate-700/50 flex flex-wrap items-center gap-2">
              <span className="text-slate-400 text-sm">Active filters:</span>
              <Badge className="bg-emerald-500/20 text-emerald-400">
                {GAME_MODES.find(m => m.value === gameModeFilter)?.label} × {MATCH_TYPES.find(t => t.value === matchTypeFilter)?.label}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setGameModeFilter('all'); setMatchTypeFilter('all'); }}
                className="text-slate-400 hover:text-white"
              >
                Clear
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <MainStatCard
          value={String(displayStats?.total_matches || 0)}
          label="Total Matches"
          icon={<Trophy className="w-6 h-6 text-white" />}
          color="bg-blue-500"
          trend={{ direction: 'up', value: '+12%' }}
        />
        <MainStatCard
          value={`${calculateWinRate(displayStats)}%`}
          label="Win Rate"
          icon={<BarChart3 className="w-6 h-6 text-white" />}
          color="bg-emerald-500"
          trend={{ direction: 'up', value: '+2.4%' }}
        />
        <MainStatCard
          value={getAverage(displayStats)}
          label="3-Dart Average"
          icon={<Target className="w-6 h-6 text-white" />}
          color="bg-purple-500"
          sublabel="Per visit average"
        />
        <MainStatCard
          value={String(displayStats?.highest_checkout || '-')}
          label="Best Checkout"
          icon={<Crown className="w-6 h-6 text-white" />}
          color="bg-amber-500"
          sublabel="Highest score finished"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
        <Card className="bg-slate-800/40 border-slate-700/50 p-4 sm:p-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-white">{displayStats?.wins || 0}</p>
              <p className="text-slate-400 text-xs sm:text-sm">Wins</p>
            </div>
          </div>
        </Card>
        <Card className="bg-slate-800/40 border-slate-700/50 p-4 sm:p-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-red-400 rotate-180" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-white">{displayStats?.losses || 0}</p>
              <p className="text-slate-400 text-xs sm:text-sm">Losses</p>
            </div>
          </div>
        </Card>
        <Card className="bg-slate-800/40 border-slate-700/50 p-4 sm:p-5 col-span-2 md:col-span-1">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
              <Flame className="w-5 h-5 sm:w-6 sm:h-6 text-orange-400" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold text-white">{displayStats?.visits_180 || 0}</p>
              <p className="text-slate-400 text-xs sm:text-sm">180s Scored</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tournament Wins - show when tournament filter active */}
      {matchTypeFilter === 'tournament' && (
        <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30 p-4 sm:p-5">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-14 h-14 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Trophy className="w-7 h-7 text-amber-400" />
            </div>
            <div>
              <p className="text-3xl font-black text-amber-400">{tournamentWins}</p>
              <p className="text-slate-300 text-sm font-medium">Tournament Wins</p>
              <p className="text-slate-500 text-xs">Tournaments won overall</p>
            </div>
          </div>
        </Card>
      )}

      {/* Detailed Stats Section */}
      {displayStats && displayStats.total_matches > 0 ? (
        <Card className="bg-slate-800/40 border-slate-700/50 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Detailed Breakdown</h2>
                <p className="text-slate-400 text-sm">
                  {isFiltered 
                    ? `${GAME_MODES.find(m => m.value === gameModeFilter)?.label} • ${MATCH_TYPES.find(t => t.value === matchTypeFilter)?.label}`
                    : 'All-time statistics'
                  }
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 sm:mb-6">
              <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-emerald-400">{displayStats.wins}</p>
                <p className="text-xs text-slate-400">Wins</p>
              </div>
              <div className="rounded-lg border border-slate-700/50 bg-slate-900/50 p-3 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-red-400">{displayStats.losses}</p>
                <p className="text-xs text-slate-400">Losses</p>
              </div>
              <div className="col-span-2 md:col-span-1 rounded-lg border border-slate-700/50 bg-slate-900/50 p-3 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-white">{calculateWinRate(displayStats)}%</p>
                <p className="text-xs text-slate-400">Win Rate</p>
              </div>
            </div>
            <PlayerStatsCard
              stats={displayStats}
              title=""
              icon={null}
            />
          </div>
        </Card>
      ) : (
        <Card className="bg-slate-800/40 border-slate-700/50 p-12 text-center">
          <Trophy className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No Stats Available</h3>
          <p className="text-slate-400 max-w-md mx-auto">
            {isFiltered
              ? 'No matches found for the selected filters. Try adjusting your filters or play some games first.'
              : 'Play some games to see your detailed statistics here. Your performance data will appear automatically after your first match.'
            }
          </p>
        </Card>
      )}

      {/* Match History - Quick Matches & DartBot Games */}
      <RecentMatchesSection />

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="bg-slate-900/50 border-slate-800 p-4">
          <p className="text-xs text-slate-600">
            Debug: History count: {totalMatchesFromHistory} | Stats matches: {overallStats?.total_matches || 0}
          </p>
        </Card>
      )}
    </div>
  );
}

// Recent Matches Section Component
function RecentMatchesSection() {
  const { matches, loading, refresh } = useMatchHistory({ limit: 5 });
  const [selectedMatch, setSelectedMatch] = useState<any>(null);

  return (
    <Card className="bg-slate-800/40 border-slate-700/50 overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-slate-700/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Match History</h2>
              <p className="text-slate-400 text-sm">Recent Quick Matches & Training Games</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={refresh}
              disabled={loading}
              className="border-slate-600 text-slate-300 hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Link href="/app/stats/matches">
              <Button variant="outline" className="border-slate-600 text-slate-300 hover:text-white text-xs sm:text-sm px-2 sm:px-3">
                View All
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
      
      <div className="p-4 sm:p-6">
        {loading && matches.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-white font-bold mb-2">Loading...</h3>
          </div>
        ) : matches.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-white font-bold mb-2">No Matches Yet</h3>
            <p className="text-slate-400 text-sm mb-4">Play some games to see your match history here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((match) => (
              <ModernMatchCard 
                key={match.id} 
                match={match} 
                onClick={() => setSelectedMatch(match)}
                showOpponentStats={true}
                compact={true}
              />
            ))}
          </div>
        )}
      </div>

      {/* Match Stats Modal */}
      <MatchStatsModal
        isOpen={!!selectedMatch}
        onClose={() => setSelectedMatch(null)}
        matchId={selectedMatch?.room_id || ''}
      />
    </Card>
  );
}
