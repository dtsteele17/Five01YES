'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Trophy,
  Target,
  TrendingUp,
  Flame,
  Award,
  Play,
} from 'lucide-react';
import { UpcomingMatchesModal } from '@/components/app/UpcomingMatchesModal';
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

      const { data: playerStats } = await supabase
        .from('player_stats')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();

      const { data: rankedData } = await supabase.rpc('rpc_ranked_get_my_state');
      if (rankedData) {
        setSeason(rankedData.season);
        setRankedState(rankedData.player_state);
      }

      if (playerStats) {
        const totalMatches = (playerStats.wins_total || 0) + (playerStats.losses_total || 0);
        const winRate = totalMatches > 0 ? Math.round(((playerStats.wins_total || 0) / totalMatches) * 100) : 0;

        setStats({
          totalMatches,
          wins: playerStats.wins_total || 0,
          losses: playerStats.losses_total || 0,
          winRate,
          currentStreak: playerStats.current_win_streak || 0,
          bestStreak: playerStats.best_win_streak || 0,
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

      const { data: achievements } = await supabase
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

      if (achievements) {
        setRecentAchievements(achievements.map((a: any) => ({
          ...a,
          achievements_master: Array.isArray(a.achievements_master) ? a.achievements_master[0] : a.achievements_master
        })) as RecentAchievement[]);
      }

      setLoading(false);
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

  const getAchievementColor = (iconName: string) => {
    switch (iconName) {
      case 'flame':
        return 'from-orange-500 to-red-500';
      case 'target':
        return 'from-emerald-500 to-teal-500';
      case 'trophy':
        return 'from-yellow-500 to-orange-500';
      default:
        return 'from-blue-500 to-cyan-500';
    }
  };

  if (profileLoading || loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-gray-400">Loading your stats...</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6 rounded-xl animate-pulse">
              <div className="h-20 bg-white/5 rounded mb-4"></div>
              <div className="h-4 bg-white/5 rounded mb-2"></div>
              <div className="h-3 bg-white/5 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Dashboard</h1>
          <p className="text-gray-400">Please complete your profile to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-white mb-2">Dashboard</h1>
        <p className="text-gray-400">
          Welcome back{profile?.display_name ? `, ${profile.display_name}` : ''}! Here's your overview.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6 hover:border-amber-500/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl flex items-center justify-center">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white">{rankedState?.rp || 0}</p>
              <p className="text-sm text-gray-400">Ranked Points</p>
            </div>
          </div>
          <h3 className="text-white font-semibold mb-1">
            {rankedState?.provisional_games_remaining
              ? `Placements: ${10 - rankedState.provisional_games_remaining}/10`
              : rankedState?.division_name || 'Unranked'
            }
          </h3>
          <p className="text-gray-400 text-sm">
            {rankedState?.provisional_games_remaining
              ? `${rankedState.provisional_games_remaining} matches remaining`
              : rankedState
                ? `${rankedState.rp} RP`
                : 'Play ranked to earn points'
            }
          </p>
        </Card>

        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6 hover:border-emerald-500/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white">
                {stats?.wins || 0}-{stats?.losses || 0}
              </p>
              <p className="text-sm text-gray-400">{stats?.winRate || 0}% win rate</p>
            </div>
          </div>
          <h3 className="text-white font-semibold mb-1">Match Record</h3>
          <p className="text-gray-400 text-sm">
            {stats?.totalMatches ? `${stats.totalMatches} total matches` : 'No matches yet'}
          </p>
        </Card>

        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6 hover:border-emerald-500/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl flex items-center justify-center">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-white">{stats?.currentStreak || 0}</p>
              <p className="text-sm text-orange-400">Best: {stats?.bestStreak || 0}</p>
            </div>
          </div>
          <h3 className="text-white font-semibold mb-1">Win Streak</h3>
          <p className="text-gray-400 text-sm">
            {stats?.currentStreak ? 'Current streak' : 'No active streak'}
          </p>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Upcoming Matches</h2>
            <Button
              variant="ghost"
              className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
              onClick={() => setShowUpcomingMatches(true)}
            >
              View All
            </Button>
          </div>

          <div className="py-8 text-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8 text-gray-500" />
            </div>
            <p className="text-gray-400 mb-2">No upcoming matches</p>
            <p className="text-gray-500 text-sm">Join a league or tournament to schedule matches</p>
          </div>
        </Card>

        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Recent Achievements</h2>
            <Link href="/app/achievements">
              <Button variant="ghost" className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
                View All
              </Button>
            </Link>
          </div>

          {recentAchievements.length > 0 ? (
            <div className="space-y-4">
              {recentAchievements.map((achievement) => {
                const Icon = getAchievementIcon(achievement.achievements_master?.icon || 'award');
                const color = getAchievementColor(achievement.achievements_master?.icon || 'award');
                return (
                  <div
                    key={achievement.id}
                    className="flex items-center space-x-3 p-4 bg-white/5 rounded-xl border border-white/5"
                  >
                    <div className={`w-12 h-12 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-medium">{achievement.achievements_master?.name}</p>
                      <p className="text-gray-400 text-sm">{achievement.achievements_master?.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <Award className="w-8 h-8 text-gray-500" />
              </div>
              <p className="text-gray-400 mb-2">No achievements yet</p>
              <p className="text-gray-500 text-sm">Start playing to earn your first achievement</p>
            </div>
          )}
        </Card>
      </div>

      <Card className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 backdrop-blur-sm border-emerald-500/30 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-2xl font-bold text-white mb-2">Ready to Play?</h3>
            <p className="text-gray-300 mb-4">Start a new match or join a tournament to compete with others.</p>
            <Link href="/app/play">
              <Button className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white">
                <Play className="w-4 h-4 mr-2" />
                Start Playing
              </Button>
            </Link>
          </div>
          <div className="hidden md:block">
            <div className="w-32 h-32 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center">
              <Target className="w-16 h-16 text-white" />
            </div>
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
