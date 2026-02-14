'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Trophy,
  Target,
  TrendingUp,
  Flame,
  Award,
  Play,
  Crown,
  BarChart3,
  ArrowRight,
  Zap,
  Shield,
} from 'lucide-react';
import { UpcomingMatchesModal } from '@/components/app/UpcomingMatchesModal';
import { MatchHistoryList } from '@/components/stats/MatchHistoryList';
import { useProfile } from '@/lib/context/ProfileContext';
import { createClient } from '@/lib/supabase/client';
import { usePresence } from '@/lib/hooks/usePresence';

interface DashboardStats {
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  rankedPoints: number;
}

interface RecentAchievement {
  id: string;
  achievement_id: string;
  unlocked_at: string;
  achievements_master: {
    name: string;
    description: string;
    icon: string;
  };
}

interface RankedPlayerState {
  season_id: string;
  player_id: string;
  rp: number;
  mmr: number;
  games_played: number;
  wins: number;
  losses: number;
  provisional_games_remaining: number;
  division_name: string;
}

interface Season {
  id: string;
  name: string;
}

// Professional color palette
const COLORS = {
  gold: 'from-amber-500 to-yellow-600',
  emerald: 'from-emerald-500 to-emerald-700',
  blue: 'from-blue-500 to-blue-700',
  bronze: 'from-orange-600 to-amber-700',
  slate: 'from-slate-600 to-slate-800',
  red: 'from-red-500 to-red-700',
};

export default function DashboardPage() {
  const [showUpcomingMatches, setShowUpcomingMatches] = useState(false);
  const { profile, loading: profileLoading } = useProfile();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentAchievements, setRecentAchievements] = useState<RecentAchievement[]>([]);
  const [rankedState, setRankedState] = useState<RankedPlayerState | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);

  usePresence();

  useEffect(() => {
    async function fetchDashboardData() {
      if (profileLoading) return;
      if (!profile?.id) {
        setLoading(false);
        return;
      }

      const supabase = createClient();

      try {
        const { data: dashboardStats, error: statsError } = await supabase.rpc('get_dashboard_stats', {
          p_user_id: profile.id
        });

        if (statsError) {
          console.error('Error fetching dashboard stats:', statsError);
        }

        const { data: rankedData, error: rankedError } = await supabase.rpc('rpc_ranked_get_my_state');
        if (rankedError) {
          console.error('Error fetching ranked data:', rankedError);
        }

        if (rankedData) {
          setSeason(rankedData.season);
          setRankedState(rankedData.player_state);
        }

        if (dashboardStats) {
          setStats({
            totalMatches: dashboardStats.total_matches || 0,
            wins: dashboardStats.wins || 0,
            losses: dashboardStats.losses || 0,
            winRate: dashboardStats.win_rate || 0,
            currentStreak: dashboardStats.current_streak || 0,
            bestStreak: dashboardStats.best_streak || 0,
            rankedPoints: rankedData?.player_state?.rp || 0,
          });
        } else {
          setStats({
            totalMatches: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            currentStreak: 0,
            bestStreak: 0,
            rankedPoints: rankedData?.player_state?.rp || 0,
          });
        }

        const { data: achievements, error: achievementsError } = await supabase
          .from('user_achievements')
          .select(`
            id,
            achievement_id,
            unlocked_at,
            achievements_master!inner (
              name,
              description,
              icon
            )
          `)
          .eq('user_id', profile.id)
          .order('unlocked_at', { ascending: false })
          .limit(3);

        if (achievementsError) {
          console.error('Error fetching achievements:', achievementsError);
          setRecentAchievements([]);
        } else if (achievements) {
          setRecentAchievements(achievements.map((a: any) => ({
            ...a,
            achievements_master: Array.isArray(a.achievements_master) ? a.achievements_master[0] : a.achievements_master
          })) as RecentAchievement[]);
        }
      } catch (err) {
        console.error('Error in fetchDashboardData:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [profile?.id, profileLoading]);

  const getAchievementIcon = (iconName: string) => {
    switch (iconName) {
      case 'flame':
        return Flame;
      case 'target':
        return Target;
      case 'trophy':
        return Trophy;
      default:
        return Award;
    }
  };

  if (profileLoading || loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-slate-400 mt-1">Loading your statistics...</p>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="bg-slate-900/50 border-slate-700/50 p-6">
              <div className="h-24 bg-slate-800/50 rounded-lg animate-pulse" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-2">Please complete your profile to get started.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">
            Welcome back{profile?.display_name ? `, ${profile.display_name}` : ''}
          </h1>
          <p className="text-slate-400 mt-1">
            Here's your performance overview
          </p>
        </div>
        <Link href="/app/play">
          <Button className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white px-6">
            <Play className="w-4 h-4 mr-2" />
            Start Playing
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Ranked Points Card */}
        <Card className="relative overflow-hidden bg-slate-900/80 border-slate-700/50 p-6 group hover:border-amber-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/10 to-transparent rounded-full -mr-16 -mt-16 blur-2xl group-hover:from-amber-500/20 transition-all duration-500" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <Badge variant="outline" className="border-amber-500/30 text-amber-400 bg-amber-500/10">
                Ranked
              </Badge>
            </div>
            
            <div className="space-y-1">
              <p className="text-4xl font-bold text-white">{rankedState?.rp || 0}</p>
              <p className="text-sm text-slate-400">Ranked Points</p>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <p className="text-sm font-medium text-slate-300">
                {rankedState?.provisional_games_remaining
                  ? `Placement Matches: ${10 - rankedState.provisional_games_remaining}/10`
                  : rankedState?.division_name || 'Unranked'
                }
              </p>
              {rankedState?.provisional_games_remaining && (
                <p className="text-xs text-slate-500 mt-1">
                  {rankedState.provisional_games_remaining} matches remaining
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Match Record Card */}
        <Card className="relative overflow-hidden bg-slate-900/80 border-slate-700/50 p-6 group hover:border-emerald-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-full -mr-16 -mt-16 blur-2xl group-hover:from-emerald-500/20 transition-all duration-500" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                Record
              </Badge>
            </div>
            
            <div className="space-y-1">
              <p className="text-4xl font-bold text-white">
                {stats?.wins || 0}<span className="text-slate-500">/</span>{stats?.losses || 0}
              </p>
              <p className="text-sm text-slate-400">Win / Loss Record</p>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Win Rate</span>
                <span className="text-lg font-semibold text-emerald-400">{stats?.winRate || 0}%</span>
              </div>
              <Progress value={stats?.winRate || 0} className="h-1.5 mt-2 bg-slate-800" />
            </div>
          </div>
        </Card>

        {/* Streak Card */}
        <Card className="relative overflow-hidden bg-slate-900/80 border-slate-700/50 p-6 group hover:border-orange-500/30 transition-all duration-300">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-500/10 to-transparent rounded-full -mr-16 -mt-16 blur-2xl group-hover:from-orange-500/20 transition-all duration-500" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20">
                <Flame className="w-6 h-6 text-white" />
              </div>
              <Badge variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/10">
                Streak
              </Badge>
            </div>
            
            <div className="space-y-1">
              <p className="text-4xl font-bold text-white">{stats?.currentStreak || 0}</p>
              <p className="text-sm text-slate-400">Current Win Streak</p>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Best Streak</span>
                <span className="text-lg font-semibold text-orange-400">{stats?.bestStreak || 0}</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Matches */}
        <Card className="bg-slate-900/80 border-slate-700/50 overflow-hidden">
          <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Recent Matches</h2>
                <p className="text-sm text-slate-400">Your last 5 games</p>
              </div>
            </div>
            <Link href="/app/stats">
              <Button variant="ghost" className="text-slate-400 hover:text-white hover:bg-slate-800">
                View All
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
          <div className="p-6">
            <MatchHistoryList limit={5} />
          </div>
        </Card>

        {/* Recent Achievements */}
        <Card className="bg-slate-900/80 border-slate-700/50 overflow-hidden">
          <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center">
                <Trophy className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Recent Achievements</h2>
                <p className="text-sm text-slate-400">Latest milestones</p>
              </div>
            </div>
            <Link href="/app/achievements">
              <Button variant="ghost" className="text-slate-400 hover:text-white hover:bg-slate-800">
                View All
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
          <div className="p-6">
            {recentAchievements.length > 0 ? (
              <div className="space-y-3">
                {recentAchievements.map((achievement) => {
                  const Icon = getAchievementIcon(achievement.achievements_master?.icon || 'award');
                  return (
                    <div
                      key={achievement.id}
                      className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-amber-500/30 transition-colors group"
                    >
                      <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/10 group-hover:shadow-amber-500/20 transition-shadow">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate">{achievement.achievements_master?.name}</p>
                        <p className="text-slate-400 text-sm truncate">{achievement.achievements_master?.description}</p>
                      </div>
                      <Award className="w-5 h-5 text-amber-500/50" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Award className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-slate-400 font-medium">No achievements yet</p>
                <p className="text-slate-500 text-sm mt-1">Start playing to unlock your first achievement</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Quick Action Banner */}
      <Card className="relative overflow-hidden bg-gradient-to-r from-slate-800 to-slate-900 border-slate-700/50">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />
        <div className="relative p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-500/20">
              <Target className="w-8 h-8 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">Ready to throw?</h3>
              <p className="text-slate-400 mt-1">Jump into a match or practice your skills</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/app/play">
              <Button className="bg-emerald-600 hover:bg-emerald-500 text-white px-6">
                <Zap className="w-4 h-4 mr-2" />
                Quick Match
              </Button>
            </Link>
            <Link href="/app/ranked">
              <Button variant="outline" className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 px-6">
                <Shield className="w-4 h-4 mr-2" />
                Ranked
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <UpcomingMatchesModal
        open={showUpcomingMatches}
        onOpenChange={setShowUpcomingMatches}
      />
    </div>
  );
}
