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
  Activity,
  ChevronRight,
  Gamepad2,
  Users,
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

// F1/FIFA Style Stat Card - Large format
function HeroStat({ value, label, icon: Icon, color, trend }: { 
  value: string | number; 
  label: string; 
  icon: any; 
  color: string;
  trend?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6 group hover:border-slate-600/50 transition-all">
      <div className={`absolute top-0 left-0 w-1 h-full ${color}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-4xl font-black text-white tracking-tight">{value}</p>
          <p className="text-sm text-slate-400 mt-1 uppercase tracking-wider font-medium">{label}</p>
          {trend && (
            <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {trend}
            </p>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl ${color} bg-opacity-20 flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

// Quick Action Tile
function ActionTile({ href, icon: Icon, title, subtitle, color }: {
  href: string;
  icon: any;
  title: string;
  subtitle: string;
  color: string;
}) {
  return (
    <Link href={href}>
      <div className={`group relative overflow-hidden rounded-2xl p-6 h-full cursor-pointer transition-all duration-300 hover:scale-[1.02] ${color}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative z-10">
          <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center mb-4">
            <Icon className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
          <p className="text-white/70 text-sm">{subtitle}</p>
          <div className="mt-4 flex items-center text-white/80 text-sm font-medium">
            <span>Start</span>
            <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </Link>
  );
}

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
        const { data: dashboardStats } = await supabase.rpc('get_dashboard_stats', {
          p_user_id: profile.id
        });

        const { data: rankedData } = await supabase.rpc('rpc_ranked_get_my_state');
        
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
            totalMatches: 0, wins: 0, losses: 0, winRate: 0,
            currentStreak: 0, bestStreak: 0, rankedPoints: rankedData?.player_state?.rp || 0,
          });
        }

        const { data: achievements } = await supabase
          .from('user_achievements')
          .select(`
            id, achievement_id, unlocked_at,
            achievements_master!inner (name, description, icon)
          `)
          .eq('user_id', profile.id)
          .order('unlocked_at', { ascending: false })
          .limit(3);

        if (achievements) {
          setRecentAchievements(achievements.map((a: any) => ({
            ...a,
            achievements_master: Array.isArray(a.achievements_master) ? a.achievements_master[0] : a.achievements_master
          })) as RecentAchievement[]);
        }
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [profile?.id, profileLoading]);

  const getAchievementIcon = (iconName: string) => {
    switch (iconName) {
      case 'flame': return Flame;
      case 'target': return Target;
      case 'trophy': return Trophy;
      default: return Award;
    }
  };

  if (profileLoading || loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-80 bg-slate-800/50 rounded-3xl animate-pulse" />
        <div className="grid md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-800/50 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-7xl mx-auto text-center py-20">
        <h1 className="text-3xl font-bold text-white">Welcome to FIVE01</h1>
        <p className="text-slate-400 mt-2">Please complete your profile to get started.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Hero Section - Player Card Style */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-700/50">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
        
        <div className="relative z-10 p-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Player Info */}
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-3xl font-black text-white shadow-2xl shadow-emerald-500/20">
                {profile?.display_name?.charAt(0) || profile?.username?.charAt(0) || 'P'}
              </div>
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    <Activity className="w-3 h-3 mr-1" />
                    Online
                  </Badge>
                  {rankedState?.division_name && (
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                      <Crown className="w-3 h-3 mr-1" />
                      {rankedState.division_name}
                    </Badge>
                  )}
                </div>
                <h1 className="text-4xl font-black text-white tracking-tight">
                  {profile?.display_name || profile?.username}
                </h1>
                <p className="text-slate-400 mt-1">@{profile?.username}</p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-3">
              <Link href="/app/play">
                <Button size="lg" className="bg-white text-slate-900 hover:bg-gray-100 font-bold px-8 shadow-xl">
                  <Play className="w-5 h-5 mr-2" />
                  Play Now
                </Button>
              </Link>
            </div>
          </div>

          {/* Hero Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <HeroStat 
              value={stats?.totalMatches || 0} 
              label="Matches Played" 
              icon={Gamepad2} 
              color="bg-blue-500"
              trend="+3 this week"
            />
            <HeroStat 
              value={`${stats?.winRate || 0}%`} 
              label="Win Rate" 
              icon={BarChart3} 
              color="bg-emerald-500"
              trend="+2.4%"
            />
            <HeroStat 
              value={rankedState?.rp || 0} 
              label="Ranked Points" 
              icon={Trophy} 
              color="bg-amber-500"
            />
            <HeroStat 
              value={stats?.currentStreak || 0} 
              label="Win Streak" 
              icon={Flame} 
              color="bg-orange-500"
            />
          </div>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - 2/3 width */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions */}
          <div className="grid sm:grid-cols-3 gap-4">
            <ActionTile
              href="/app/play/quick-match"
              icon={Zap}
              title="Quick Match"
              subtitle="Jump into instant action"
              color="bg-gradient-to-br from-emerald-600 to-teal-700"
            />
            <ActionTile
              href="/app/ranked"
              icon={Shield}
              title="Ranked"
              subtitle="Compete for points"
              color="bg-gradient-to-br from-amber-600 to-orange-700"
            />
            <ActionTile
              href="/app/friends"
              icon={Users}
              title="Friends"
              subtitle="Connect & play together"
              color="bg-gradient-to-br from-blue-600 to-indigo-700"
            />
          </div>

          {/* Recent Activity */}
          <Card className="bg-slate-800/30 border-slate-700/50 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
                  <Target className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Recent Activity</h2>
                  <p className="text-sm text-slate-400">Your latest matches</p>
                </div>
              </div>
              <Link href="/app/stats">
                <Button variant="ghost" className="text-slate-400 hover:text-white">
                  View All
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
            <div className="p-6">
              <MatchHistoryList limit={5} />
            </div>
          </Card>
        </div>

        {/* Right Column - 1/3 width */}
        <div className="space-y-6">
          {/* Ranked Status */}
          <Card className="bg-slate-800/30 border-slate-700/50 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Ranked Status</h2>
                  <p className="text-sm text-slate-400">{season?.name || 'Current Season'}</p>
                </div>
              </div>
            </div>
            <div className="p-6 text-center">
              <p className="text-6xl font-black text-white">{rankedState?.rp || 0}</p>
              <p className="text-slate-400 mt-2">Ranked Points</p>
              
              {rankedState?.provisional_games_remaining ? (
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">Placement</span>
                    <span className="text-white font-medium">{10 - rankedState.provisional_games_remaining}/10</span>
                  </div>
                  <Progress value={(10 - rankedState.provisional_games_remaining) * 10} className="h-2" />
                </div>
              ) : rankedState?.division_name ? (
                <div className="mt-4 p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
                  <p className="text-amber-400 font-bold text-lg">{rankedState.division_name}</p>
                  <p className="text-slate-400 text-sm">Current Division</p>
                </div>
              ) : null}
            </div>
            <div className="px-6 pb-6">
              <Link href="/app/ranked">
                <Button className="w-full bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30">
                  <Shield className="w-4 h-4 mr-2" />
                  Play Ranked
                </Button>
              </Link>
            </div>
          </Card>

          {/* Achievements */}
          <Card className="bg-slate-800/30 border-slate-700/50 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-purple-400" />
                </div>
                <h2 className="text-lg font-bold text-white">Achievements</h2>
              </div>
              <Link href="/app/achievements">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                  All
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
                        className="flex items-center gap-4 p-4 bg-slate-700/30 rounded-xl border border-slate-600/30"
                      >
                        <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Icon className="w-6 h-6 text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold truncate">{achievement.achievements_master?.name}</p>
                          <p className="text-slate-400 text-sm truncate">{achievement.achievements_master?.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Award className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No achievements yet</p>
                  <p className="text-slate-500 text-sm mt-1">Start playing to unlock</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <UpcomingMatchesModal open={showUpcomingMatches} onOpenChange={setShowUpcomingMatches} />
    </div>
  );
}
