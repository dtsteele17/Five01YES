'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  Target,
  Award,
  Calendar,
  Activity,
  Filter,
  ChevronDown,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { createClient } from '@/lib/supabase/client';

type TimeRange = '7d' | '30d' | 'year' | 'all';
type ModeFilter = 'all' | 'ranked' | 'quick' | 'private' | 'training' | 'league' | 'tournament';

interface Match {
  id: string;
  match_type: string;
  status: string;
  winner_id: string | null;
  player1_legs_won: number;
  player2_legs_won: number;
  player1_name: string;
  player2_name: string;
  opponent_type: string | null;
  user_avg: number | null;
  opponent_avg: number | null;
  user_checkout_pct: number | null;
  opponent_checkout_pct: number | null;
  created_at: string;
  completed_at: string | null;
  user_id: string;
}

interface MatchStats {
  match_id: string;
  player: string;
  three_dart_average: number;
  highest_score: number;
  checkout_percentage: number;
  count_100_plus: number;
  count_140_plus: number;
  count_180: number;
}

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  'year': 'This Year',
  'all': 'All Time',
};

const MODE_FILTER_LABELS: Record<ModeFilter, string> = {
  'all': 'All Modes',
  'ranked': 'Ranked Games',
  'quick': 'Quick Matches',
  'private': 'Private Games',
  'training': 'Training',
  'league': 'League Matches',
  'tournament': 'Tournaments',
};

export default function StatsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchStats, setMatchStats] = useState<MatchStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userStatsData, setUserStatsData] = useState<any>(null);
  const [matchPlayersData, setMatchPlayersData] = useState<any[]>([]);

  useEffect(() => {
    const range = searchParams.get('range') as TimeRange;
    const mode = searchParams.get('mode') as ModeFilter;

    if (range && ['7d', '30d', 'year', 'all'].includes(range)) {
      setTimeRange(range);
    }
    if (mode && ['all', 'ranked', 'quick', 'private', 'training', 'league', 'tournament'].includes(mode)) {
      setModeFilter(mode);
    }
  }, [searchParams]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const { data: matchesData } = await supabase
        .from('matches')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false });

      setMatches(matchesData || []);
      setLoading(false);
    }

    fetchData();
  }, []);

  const updateFilters = (newRange?: TimeRange, newMode?: ModeFilter) => {
    const params = new URLSearchParams();
    params.set('range', newRange || timeRange);
    params.set('mode', newMode || modeFilter);
    router.push(`/app/stats?${params.toString()}`, { scroll: false });
  };

  const filteredMatches = useMemo(() => {
    let filtered = [...matches];

    if (timeRange !== 'all') {
      const now = new Date();
      let cutoffDate: Date;

      if (timeRange === '7d') {
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (timeRange === '30d') {
        cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else {
        cutoffDate = new Date(now.getFullYear(), 0, 1);
      }

      filtered = filtered.filter(match => {
        const matchDate = match.completed_at ? new Date(match.completed_at) : new Date(match.created_at);
        return matchDate >= cutoffDate;
      });
    }

    if (modeFilter !== 'all') {
      filtered = filtered.filter(match => match.match_type === modeFilter);
    }

    return filtered;
  }, [matches, timeRange, modeFilter]);

  useEffect(() => {
    async function fetchMatchPlayers() {
      if (filteredMatches.length === 0 || !userId) {
        setMatchPlayersData([]);
        return;
      }

      const supabase = createClient();
      const matchIds = filteredMatches.map(m => m.id);
      const { data } = await supabase
        .from('match_players')
        .select('*')
        .in('match_id', matchIds)
        .eq('user_id', userId);

      setMatchPlayersData(data || []);
    }

    fetchMatchPlayers();
  }, [filteredMatches, userId]);

  const stats = useMemo(() => {
    const filteredWins = filteredMatches.filter(m => m.winner_id === userId).length;
    const filteredLosses = filteredMatches.length - filteredWins;
    const winRate = filteredMatches.length > 0 ? (filteredWins / filteredMatches.length) * 100 : 0;

    if (matchPlayersData.length === 0) {
      return {
        avgScore: 0,
        winRate: Math.round(winRate),
        matchCount: filteredMatches.length,
        wins: filteredWins,
        losses: filteredLosses,
        count180s: 0,
        checkoutPercentage: 0,
        highestCheckout: 0,
        bestAverage: 0,
        most180s: 0,
      };
    }

    const totalPointsScored = matchPlayersData.reduce((sum, mp) => sum + (Number(mp.points_scored) || 0), 0);
    const totalDartsThrown = matchPlayersData.reduce((sum, mp) => sum + (Number(mp.darts_thrown) || 0), 0);
    const weightedAvg = totalDartsThrown > 0 ? (totalPointsScored / totalDartsThrown) * 3 : 0;

    const total180s = matchPlayersData.reduce((sum, mp) => sum + (Number(mp.count_180) || 0), 0);
    const totalCheckoutDartsAttempted = matchPlayersData.reduce((sum, mp) => sum + (Number(mp.checkout_darts_attempted) || 0), 0);
    const totalCheckoutsMade = matchPlayersData.reduce((sum, mp) => sum + (Number(mp.checkout_hits) || 0), 0);
    const checkoutPct = totalCheckoutDartsAttempted > 0 ? (totalCheckoutsMade / totalCheckoutDartsAttempted) * 100 : 0;

    const highestCheckout = matchPlayersData.reduce((max, mp) => Math.max(max, Number(mp.highest_checkout) || 0), 0);
    const bestAverage = matchPlayersData.reduce((max, mp) => Math.max(max, Number(mp.avg_3dart) || 0), 0);
    const most180s = matchPlayersData.reduce((max, mp) => Math.max(max, Number(mp.count_180) || 0), 0);

    return {
      avgScore: Math.round(weightedAvg * 10) / 10,
      winRate: Math.round(winRate),
      matchCount: filteredMatches.length,
      wins: filteredWins,
      losses: filteredLosses,
      count180s: total180s,
      checkoutPercentage: Math.round(checkoutPct * 10) / 10,
      highestCheckout,
      bestAverage: Math.round(bestAverage * 10) / 10,
      most180s,
    };
  }, [filteredMatches, matchPlayersData, userId]);

  const recentMatches = useMemo(() => {
    return filteredMatches.slice(0, 5).map(match => {
      const isWinner = match.winner_id === userId;
      const matchPlayer = matchPlayersData.find(mp => mp.match_id === match.id);
      const opponentName = match.player2_name || 'Opponent';

      return {
        id: match.id,
        opponent: opponentName,
        result: isWinner ? 'W' : 'L',
        score: `${match.player1_legs_won}-${match.player2_legs_won}`,
        avg: matchPlayer ? Math.round(Number(matchPlayer.avg_3dart) * 10) / 10 : (match.user_avg ? Math.round(Number(match.user_avg) * 10) / 10 : 0),
        date: match.completed_at ? new Date(match.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : new Date(match.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      };
    });
  }, [filteredMatches, matchPlayersData, userId]);

  const chartData = useMemo(() => {
    const recentFiltered = filteredMatches.slice(0, 12).reverse();
    return recentFiltered.map(match => {
      const matchPlayer = matchPlayersData.find(mp => mp.match_id === match.id);
      return matchPlayer ? Number(matchPlayer.avg_3dart) : 0;
    });
  }, [filteredMatches, matchPlayersData]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Stats</h1>
          <p className="text-gray-400">Track your performance and progress.</p>
        </div>

        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-white/10 text-white hover:bg-white/5">
                <Filter className="w-4 h-4 mr-2" />
                {MODE_FILTER_LABELS[modeFilter]}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-900 border-white/10">
              {(Object.keys(MODE_FILTER_LABELS) as ModeFilter[]).map((mode) => (
                <DropdownMenuItem
                  key={mode}
                  onClick={() => {
                    setModeFilter(mode);
                    updateFilters(undefined, mode);
                  }}
                  className="text-white hover:bg-white/10 cursor-pointer"
                >
                  {MODE_FILTER_LABELS[mode]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="border-white/10 text-white hover:bg-white/5">
                <Calendar className="w-4 h-4 mr-2" />
                {TIME_RANGE_LABELS[timeRange]}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-900 border-white/10">
              {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((range) => (
                <DropdownMenuItem
                  key={range}
                  onClick={() => {
                    setTimeRange(range);
                    updateFilters(range, undefined);
                  }}
                  className="text-white hover:bg-white/10 cursor-pointer"
                >
                  {TIME_RANGE_LABELS[range]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-400">Loading stats...</div>
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6 hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
                  <Target className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-1">Avg Score</p>
              <p className="text-3xl font-bold text-white">{stats.avgScore || '—'}</p>
              <p className="text-gray-400 text-sm mt-1">Weighted average</p>
            </Card>

            <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6 hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center">
                  <Award className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-1">Win Rate</p>
              <p className="text-3xl font-bold text-white">{stats.winRate}%</p>
              <p className="text-gray-400 text-sm mt-1">{stats.wins}-{stats.losses} record</p>
            </Card>

            <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6 hover:border-emerald-500/30 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-lg flex items-center justify-center">
                  <Activity className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-gray-400 text-sm mb-1">Matches</p>
              <p className="text-3xl font-bold text-white">{stats.matchCount}</p>
              <p className="text-gray-400 text-sm mt-1">Selected period</p>
            </Card>
          </div>

          <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
            <h2 className="text-xl font-bold text-white mb-6">Performance Overview</h2>

            {chartData.length > 0 ? (
              <div className="h-64 flex items-end justify-between space-x-2">
                {chartData.map((value, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-gradient-to-t from-emerald-500 to-teal-500 rounded-t-lg transition-all hover:opacity-80"
                      style={{ height: `${Math.min((value / 100) * 100, 100)}%` }}
                    />
                    <span className="text-gray-400 text-xs mt-2">{index + 1}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-gray-400">
                No data available for this period
              </div>
            )}
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
              <h2 className="text-xl font-bold text-white mb-6">Detailed Stats</h2>

              <div className="space-y-4">
                {[
                  { label: 'Total Matches', value: stats.matchCount.toString(), color: 'text-white' },
                  { label: 'Wins', value: stats.wins.toString(), color: 'text-green-400' },
                  { label: 'Losses', value: stats.losses.toString(), color: 'text-red-400' },
                  { label: '180s Thrown', value: stats.count180s.toString(), color: 'text-emerald-400' },
                  { label: 'Checkout %', value: `${stats.checkoutPercentage}%`, color: 'text-blue-400' },
                  { label: 'Highest Checkout', value: stats.highestCheckout.toString(), color: 'text-orange-400' },
                  { label: 'Best Average', value: stats.bestAverage.toString(), color: 'text-violet-400' },
                  { label: 'Most 180s in Match', value: stats.most180s.toString(), color: 'text-cyan-400' },
                ].map((stat, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5"
                  >
                    <span className="text-gray-300">{stat.label}</span>
                    <span className={`font-bold text-lg ${stat.color}`}>{stat.value}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
              <h2 className="text-xl font-bold text-white mb-6">Recent Matches</h2>

              {recentMatches.length > 0 ? (
                <div className="space-y-3">
                  {recentMatches.map((match, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5"
                    >
                      <div className="flex items-center space-x-4">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                            match.result === 'W'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}
                        >
                          {match.result}
                        </div>
                        <div>
                          <p className="text-white font-medium">{match.opponent}</p>
                          <p className="text-gray-400 text-sm">{match.date}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-medium">{match.score}</p>
                        <p className="text-gray-400 text-sm">{match.avg} avg</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-gray-400">
                  No matches found for this period
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
