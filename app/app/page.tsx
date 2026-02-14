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
  Calendar,
  ChevronRight,
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

// Modern stat pill component
function StatPill({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-xl border border-white/10">
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-gray-400 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

// Achievement badge component
function AchievementBadge({ achievement }: { achievement: RecentAchievement }) {
  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'flame': return Flame;
      case 'target': return Target;
      case 'trophy': return Trophy;
      default: return Award;
    }
  };
  
  const Icon = getIcon(achievement.achievements_master?.icon || 'award');
  
  return (
    <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-amber-500/10 to-transparent rounded-xl border border-amber-500/20">
      <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
        <Icon className="w-5 h-5 text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm truncate">{achievement.achievements_master?.name}</p>
        <p className="text-gray-400 text-xs truncate">{achievement.achievements_master?.description}</p>
      </div>
    </div>
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
        const { data: dashboardStats, error: statsError } = await supabase.rpc('get_dashboard_stats', {
          p_user_id: profile.id
        });

        const { data: rankedData, error: rankedError } = await supabase.rpc('rpc_ranked_get_my_state');
        
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

  if (profileLoading || loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-64 bg-slate-800/50 rounded-3xl animate-pulse" />
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-800/50 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-7xl mx-auto text-center py-20">
        <h1 className="text-3xl font-bold text-white">Welcome to FIVE01</h1>
        <p className="text-gray-400 mt-2">Please complete your profile to get started.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Hero Section - Glass Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900/40 via-slate-900/60 to-emerald-900/30 border border-white/10 p-8">
        {/* Background effects */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl -mr-48 -mt-48" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -ml-32 -mb-32" />
        
        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
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
              <h1 className="text-4xl font-bold text-white">
                Welcome back, {profile?.display_name || 'Player'}
              </h1>
              <p className="text-gray-400 mt-2 text-lg">
                {stats?.currentStreak ? (
                  <span className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-orange-500" />
                    On a {stats.currentStreak} game win streak! Keep it up.
                  </span>
                ) : (
                  'Ready to throw some darts?'
                )}
              </p>
            </div>
            
            <Link href="/app/play">
              <Button size="lg" className="bg-white text-slate-900 hover:bg-gray-100 font-semibold px-8 shadow-xl shadow-white/10">
                <Play className="w-5 h-5 mr-2" />
                Play Now
              </Button>
            </Link>
          </div>

          {/* Quick Stats Pills */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <StatPill 
              icon={BarChart3} 
              label="Matches" 
              value={stats?.totalMatches.toString() || '0'}
              color="bg-blue-500"
            />
            <StatPill 
              icon={TrendingUp} 
              label="Win Rate" 
              value={`${stats?.winRate || 0}%`}
              color="bg-emerald-500"
            />
            <StatPill 
              icon={Target} 
              label="Ranked RP" 
              value={rankedState?.rp?.toString() || '0'}
              color="bg-amber-500"
            />
            <StatPill 
              icon={Zap} 
              label="Best Streak" 
              value={stats?.bestStreak.toString() || '0'}
              color="bg-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Match History */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-slate-900/50 border-white/5 overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
                  <p className="text-sm text-gray-400">Your latest matches</p>
                </div>
              </div>
              <Link href="/app/stats">
                <Button variant="ghost" className="text-gray-400 hover:text-white">
                  View All
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
            <div className="p-6">
              <MatchHistoryList limit={5} />
            </div>
          </Card>
        </div>

        {/* Right Column - Stats & Achievements */}
        <div className="space-y-6">
          {/* Ranked Status Card */}
          <Card className="bg-slate-900/50 border-white/5 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Crown className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Ranked Status</h2>
                <p className="text-sm text-gray-400">{season?.name || 'Current Season'}</p>
              </div>
            </div>

            <div className="text-center py-4">
              <p className="text-5xl font-bold text-white">{rankedState?.rp || 0}</p>
              <p className="text-gray-400 mt-1">Ranked Points</p>
            </div>

            {rankedState?.provisional_games_remaining ? (
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-400">Placement Matches</span>
                  <span className="text-white">{10 - rankedState.provisional_games_remaining}/10</span>
                </div>
                <Progress value={(10 - rankedState.provisional_games_remaining) * 10} className="h-2" />
              </div>
            ) : rankedState?.division_name ? (
              <div className="mt-4 p-4 bg-amber-500/10 rounded-xl border border-amber-500/20 text-center">
                <p className="text-amber-400 font-semibold">{rankedState.division_name}</p>
                <p className="text-gray-400 text-sm mt-1">Current Division</p>
              </div>
            ) : null}

            <Link href="/app/ranked">
              <Button className="w-full mt-4 bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30">
                <Shield className="w-4 h-4 mr-2" />
                Play Ranked
              </Button>
            </Link>
          </Card>

          {/* Achievements Card */}
          <Card className="bg-slate-900/50 border-white/5 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-purple-400" />
                </div>
                <h2 className="text-lg font-semibold text-white">Achievements</h2>
              </div>
              <Link href="/app/achievements">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                  All
                </Button>
              </Link>
            </div>

            {recentAchievements.length > 0 ? (
              <div className="space-y-3">
                {recentAchievements.map((achievement) => (
                  <AchievementBadge key={achievement.id} achievement={achievement} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Award className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No achievements yet</p>
                <p className="text-gray-500 text-sm mt-1">Start playing to unlock rewards</p>
              </div>
            )}
          </Card>

          {/* Quick Actions */}
          <Card className="bg-gradient-to-br from-emerald-900/30 to-slate-900/50 border-emerald-500/20 p-6">
            <h3 className="text-white font-semibold mb-4">Quick Start</h3>
            <div className="space-y-2">
              <Link href="/app/play/quick-match">
                <Button variant="outline" className="w-full justify-start border-white/10 hover:bg-white/5">
                  <Zap className="w-4 h-4 mr-3 text-emerald-400" />
                  Quick Match
                </Button>
              </Link>
              <Link href="/app/play">
                <Button variant="outline" className="w-full justify-start border-white/10 hover:bg-white/5">
                  <Target className="w-4 h-4 mr-3 text-blue-400" />
                  Training
                </Button>
              </Link>
              <Link href="/app/ranked">
                <Button variant="outline" className="w-full justify-start border-white/10 hover:bg-white/5">
                  <Crown className="w-4 h-4 mr-3 text-amber-400" />
                  Ranked
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>

      <UpcomingMatchesModal open={showUpcomingMatches} onOpenChange={setShowUpcomingMatches} />
    </div>
  );
}
