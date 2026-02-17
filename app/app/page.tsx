'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  Activity,
  ChevronRight,
  Gamepad2,
  Users,
  MessageCircle,
  Shield,
  Calendar,
  Clock,
} from 'lucide-react';
import { MatchHistoryList } from '@/components/stats/MatchHistoryList';
import { useProfile } from '@/lib/context/ProfileContext';
import { createClient } from '@/lib/supabase/client';
import { usePresence } from '@/lib/hooks/usePresence';
import { MatchStatsModal } from '@/components/app/MatchStatsModal';
import { useRecentMatches } from '@/lib/hooks/useRecentMatches';
import { formatDistanceToNow } from 'date-fns';
import { SafetyRatingBadge } from '@/components/safety/SafetyRatingBadge';
import { onSafetyRatingUpdated } from '@/lib/safety/safetyEvents';
import { getRankImageUrl } from '@/lib/rank-badge-helpers';

interface DashboardStats {
  totalMatches: number;
  wins: number;
  losses: number;
  winRate: number;
  currentStreak: number;
  bestStreak: number;
  avg: number;
  ranked3DartAvg: number;
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

interface OnlineFriend {
  id: string;
  username: string;
  avatar_url: string;
  activity_label?: string;
}

interface UpcomingGame {
  id: string;
  type: 'tournament' | 'league' | 'match';
  name: string;
  opponent?: string;
  scheduled_at: string;
}

// F1/FIFA Style Stat Card - Large format
function HeroStat({ value, label, icon: Icon, color, trend, onClick }: { 
  value: string | number; 
  label: string; 
  icon: any; 
  color: string;
  trend?: string;
  onClick?: () => void;
}) {
  const content = (
    <div 
      className={`relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6 group hover:border-slate-600/50 transition-all ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
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

  return onClick ? (
    <Link href="/app/stats" className="block">
      {content}
    </Link>
  ) : content;
}

export default function DashboardPage() {
  const { profile, loading: profileLoading, refreshProfile } = useProfile();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentAchievements, setRecentAchievements] = useState<RecentAchievement[]>([]);
  const [rankedState, setRankedState] = useState<RankedPlayerState | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [onlineFriends, setOnlineFriends] = useState<OnlineFriend[]>([]);
  const [ranked3DartAvg, setRanked3DartAvg] = useState<number>(0);
  const [overall3DartAvg, setOverall3DartAvg] = useState<number>(0);
  const [upcomingGames, setUpcomingGames] = useState<UpcomingGame[]>([]);
  const [last5Games, setLast5Games] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  usePresence();

  // Subscribe to safety rating updates and refresh profile when rating changes
  useEffect(() => {
    const unsubscribe = onSafetyRatingUpdated(() => {
      // Refresh profile to get updated safety rating
      refreshProfile();
    });

    return () => unsubscribe();
  }, [refreshProfile]);

  useEffect(() => {
    async function fetchDashboardData() {
      if (profileLoading) return;
      if (!profile?.id) {
        setLoading(false);
        return;
      }

      const supabase = createClient();

      try {
        // Fetch from player_stats directly (same as stats page) for consistency
        const [{ data: playerStats }, { data: rankedData }, { data: friendsData }] = await Promise.all([
          supabase.from('player_stats')
            .select('*')
            .eq('user_id', profile.id)
            .maybeSingle(),
          supabase.rpc('rpc_ranked_get_my_state'),
          supabase.rpc('rpc_get_friends_overview'),
        ]);

        if (rankedData) {
          setSeason(rankedData.season);
          setRankedState(rankedData.player_state);
        }

        if (playerStats) {
          // Calculate win rate
          const winRate = playerStats.total_matches > 0 
            ? Math.round((playerStats.wins / playerStats.total_matches) * 100)
            : 0;
          
          setStats({
            totalMatches: playerStats.total_matches || 0,
            wins: playerStats.wins || 0,
            losses: playerStats.losses || 0,
            winRate: winRate,
            currentStreak: playerStats.current_win_streak || 0,
            bestStreak: playerStats.best_win_streak || 0,
            avg: playerStats.overall_3dart_avg || 0,
            ranked3DartAvg: 0,
          });
          setOverall3DartAvg(playerStats.overall_3dart_avg || 0);
        } else {
          setStats({
            totalMatches: 0, wins: 0, losses: 0, winRate: 0,
            currentStreak: 0, bestStreak: 0, avg: 0, ranked3DartAvg: 0,
          });
          setOverall3DartAvg(0);
        }

        // Fetch ranked 3-dart average from match_history
        const { data: rankedMatches } = await supabase
          .from('match_history')
          .select('avg_3dart')
          .eq('user_id', profile.id)
          .eq('match_type', 'ranked')
          .not('avg_3dart', 'is', null);

        if (rankedMatches && rankedMatches.length > 0) {
          const avg = rankedMatches.reduce((sum: number, m: any) => sum + (m.avg_3dart || 0), 0) / rankedMatches.length;
          setRanked3DartAvg(Number(avg.toFixed(1)));
        }

        // Get online friends
        if (friendsData?.ok && friendsData.friends) {
          const online = friendsData.friends
            .filter((f: any) => f.is_online)
            .slice(0, 5)
            .map((f: any) => ({
              id: f.id,
              username: f.username,
              avatar_url: f.avatar_url,
              activity_label: f.activity_label,
            }));
          setOnlineFriends(online);
        }

        // Fetch last 5 games for form display
        const { data: recentGames } = await supabase
          .from('match_history')
          .select('result')
          .eq('user_id', profile.id)
          .order('played_at', { ascending: false })
          .limit(5);

        if (recentGames) {
          setLast5Games(recentGames.map((g: any) => g.result));
        }

        // Fetch upcoming games from tournaments and leagues
        const upcoming: UpcomingGame[] = [];
        
        // Check tournament matches
        const { data: tournamentMatches } = await supabase
          .from('tournament_matches')
          .select(`
            id, scheduled_at, round,
            tournament:tournament_id (name),
            player1:player1_id (username),
            player2:player2_id (username)
          `)
          .or(`player1_id.eq.${profile.id},player2_id.eq.${profile.id}`)
          .gte('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(3);

        if (tournamentMatches) {
          tournamentMatches.forEach((match: any) => {
            const opponent = match.player1?.id === profile.id ? match.player2?.username : match.player1?.username;
            upcoming.push({
              id: match.id,
              type: 'tournament',
              name: match.tournament?.name || 'Tournament Match',
              opponent,
              scheduled_at: match.scheduled_at,
            });
          });
        }

        // Check league matches
        const { data: leagueMatches } = await supabase
          .from('league_matches')
          .select(`
            id, scheduled_at, week,
            league:league_id (name),
            home_player:home_player_id (username),
            away_player:away_player_id (username)
          `)
          .or(`home_player_id.eq.${profile.id},away_player_id.eq.${profile.id}`)
          .gte('scheduled_at', new Date().toISOString())
          .order('scheduled_at', { ascending: true })
          .limit(3);

        if (leagueMatches) {
          leagueMatches.forEach((match: any) => {
            const opponent = match.home_player?.id === profile.id ? match.away_player?.username : match.home_player?.username;
            upcoming.push({
              id: match.id,
              type: 'league',
              name: match.league?.name || 'League Match',
              opponent,
              scheduled_at: match.scheduled_at,
            });
          });
        }

        // Sort by scheduled time
        upcoming.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
        setUpcomingGames(upcoming.slice(0, 5));

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

  const formatScheduledTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0 && diffHrs < 24) {
      return `in ${diffHrs}h`;
    } else if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else {
      return `${diffDays} days`;
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
                  {profile?.safety_rating_letter && (
                    <SafetyRatingBadge 
                      grade={profile.safety_rating_letter as 'A' | 'B' | 'C' | 'D' | 'E'} 
                      size="sm"
                      totalRatings={profile.safety_rating_count || 0}
                    />
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

          {/* Hero Stats Grid - 4 columns: Matches, Win Rate, 3-Dart Avg, Win Streak */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <HeroStat 
              value={stats?.totalMatches || 0} 
              label="Matches Played" 
              icon={Gamepad2} 
              color="bg-blue-500"
            />
            <HeroStat 
              value={`${stats?.winRate || 0}%`} 
              label="Win Rate" 
              icon={BarChart3} 
              color="bg-emerald-500"
            />
            <HeroStat 
              value={overall3DartAvg.toFixed(1)} 
              label="3-Dart Average" 
              icon={Target} 
              color="bg-purple-500"
            />
            
            {/* Win Streak with Best Streak */}
            <div className="relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6 group hover:border-slate-600/50 transition-all">
              <div className="absolute top-0 left-0 w-1 h-full bg-orange-500" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-4xl font-black text-white tracking-tight">{stats?.currentStreak || 0}</p>
                  <p className="text-sm text-slate-400 mt-1 uppercase tracking-wider font-medium">Win Streak</p>
                  <p className="text-xs text-orange-400 mt-2">
                    Best: {stats?.bestStreak || 0}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-orange-500 bg-opacity-20 flex items-center justify-center">
                  <Flame className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid Layout - 2 columns */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - 2/3 width: Ranked Status + Upcoming Games */}
        <div className="lg:col-span-2 space-y-6">
          {/* Ranked Status - Premium Design */}
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-900/40 via-slate-900/60 to-slate-900/80 shadow-2xl shadow-amber-500/10">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(251,191,36,0.05)_50%,transparent_75%)]" />
            <div className="absolute top-0 left-1/4 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl" />
            
            {/* Top Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
            
            <div className="relative z-10 p-8">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8">
                {/* Left - Rank Image & Division */}
                <div className="flex items-center gap-5">
                  <div className="relative">
                    <div className="absolute inset-0 bg-amber-500/30 rounded-2xl blur-lg" />
                    <div className="relative w-40 h-40 flex items-center justify-center">
                      {rankedState?.division_name ? (
                        <img 
                          src={getRankImageUrl(rankedState.division_name)} 
                          alt={rankedState.division_name}
                          className="w-full h-full object-contain drop-shadow-xl"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <Crown className="w-20 h-20 text-white drop-shadow-lg" />
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider">Current Rank</p>
                    <h2 className="text-3xl font-black text-white mt-1">
                      {rankedState?.division_name || 'Unranked'}
                    </h2>
                  </div>
                </div>

                {/* Center - ELO Display */}
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <div className="absolute -inset-4 bg-amber-500/10 rounded-full blur-2xl" />
                    <p className="relative text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-amber-200 drop-shadow-2xl">
                      {rankedState?.rp || 0}
                    </p>
                  </div>
                  <p className="text-amber-400/80 text-sm font-bold uppercase tracking-[0.2em] mt-2">ELO Rating</p>
                </div>

                {/* Right - Play Button & Placement */}
                <div className="flex flex-col items-end gap-4">
                  {rankedState?.provisional_games_remaining ? (
                    <div className="w-52 bg-slate-900/50 rounded-xl p-3 border border-amber-500/20">
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-amber-400 font-medium">Placement</span>
                        <span className="text-white font-bold">{10 - rankedState.provisional_games_remaining}/10</span>
                      </div>
                      <Progress 
                        value={(10 - rankedState.provisional_games_remaining) * 10} 
                        className="h-2 bg-slate-700"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-400/60 text-sm">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      Ranked Active
                    </div>
                  )}
                  <Link href="/app/ranked">
                    <Button className="bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold px-8 py-6 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-105 transition-all">
                      <Shield className="w-5 h-5 mr-2" />
                      Play Ranked
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Stats Row */}
              <div className="mt-8 pt-6 border-t border-amber-500/20">
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-4 rounded-xl bg-slate-900/40 border border-emerald-500/20 backdrop-blur-sm">
                    <p className="text-2xl font-black text-emerald-400">{rankedState?.wins || 0}</p>
                    <p className="text-slate-400 text-xs uppercase tracking-wider mt-1">Wins</p>
                  </div>
                  <div className="text-center p-4 rounded-xl bg-slate-900/40 border border-red-500/20 backdrop-blur-sm">
                    <p className="text-2xl font-black text-red-400">{rankedState?.losses || 0}</p>
                    <p className="text-slate-400 text-xs uppercase tracking-wider mt-1">Losses</p>
                  </div>
                  <div className="text-center p-4 rounded-xl bg-slate-900/40 border border-blue-500/20 backdrop-blur-sm">
                    <p className="text-2xl font-black text-blue-400">
                      {rankedState?.games_played ? Math.round((rankedState.wins / rankedState.games_played) * 100) : 0}%
                    </p>
                    <p className="text-slate-400 text-xs uppercase tracking-wider mt-1">Win Rate</p>
                  </div>
                  <div className="text-center p-4 rounded-xl bg-slate-900/40 border border-purple-500/20 backdrop-blur-sm">
                    <p className="text-2xl font-black text-purple-400">{ranked3DartAvg}</p>
                    <p className="text-slate-400 text-xs uppercase tracking-wider mt-1">3-Dart Avg</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming Games - replaces Recent Activity */}
          <Card className="bg-slate-800/30 border-slate-700/50 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Upcoming Games</h2>
                  <p className="text-sm text-slate-400">Your scheduled matches</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href="/app/tournaments">
                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                    Tournaments
                  </Button>
                </Link>
                <Link href="/app/leagues">
                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                    Leagues
                  </Button>
                </Link>
              </div>
            </div>
            <div className="p-6">
              {upcomingGames.length > 0 ? (
                <div className="space-y-3">
                  {upcomingGames.map((game) => (
                    <div
                      key={game.id}
                      className="flex items-center gap-4 p-4 bg-slate-700/30 rounded-xl border border-slate-600/30 hover:border-slate-500/50 transition-colors"
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        game.type === 'tournament' ? 'bg-amber-500/20' : 'bg-blue-500/20'
                      }`}>
                        {game.type === 'tournament' ? (
                          <Trophy className="w-6 h-6 text-amber-400" />
                        ) : (
                          <Shield className="w-6 h-6 text-blue-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold truncate">{game.name}</p>
                        {game.opponent && (
                          <p className="text-slate-400 text-sm">vs {game.opponent}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                          <Clock className="w-3 h-3 mr-1" />
                          {formatScheduledTime(game.scheduled_at)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Calendar className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">No upcoming games</h3>
                  <p className="text-slate-400 mb-4">Join a tournament or league to see scheduled matches here</p>
                  <div className="flex justify-center gap-3">
                    <Link href="/app/tournaments">
                      <Button className="bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30">
                        <Trophy className="w-4 h-4 mr-2" />
                        Browse Tournaments
                      </Button>
                    </Link>
                    <Link href="/app/leagues">
                      <Button className="bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30">
                        <Shield className="w-4 h-4 mr-2" />
                        Browse Leagues
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column - 1/3 width - Last 5 Games + Online Friends + Achievements */}
        <div className="space-y-6">
          {/* Last 5 Games Record - Now at top */}
          <Card className="bg-slate-800/30 border-slate-700/50 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-emerald-400" />
                </div>
                <h2 className="text-lg font-bold text-white">Last 5 Games</h2>
              </div>
              <Link href="/app/stats">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                  History
                </Button>
              </Link>
            </div>
            <div className="p-6">
              {last5Games.length > 0 ? (
                <div className="flex items-center justify-center gap-2">
                  {last5Games.map((result, index) => (
                    <div
                      key={index}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black ${
                        result === 'win'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : result === 'loss'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {result === 'win' ? 'W' : result === 'loss' ? 'L' : 'D'}
                    </div>
                  ))}
                  {/* Fill empty slots if less than 5 games */}
                  {Array.from({ length: Math.max(0, 5 - last5Games.length) }).map((_, index) => (
                    <div
                      key={`empty-${index}`}
                      className="w-12 h-12 rounded-xl bg-slate-700/30 border border-slate-600/30 flex items-center justify-center text-xl font-black text-slate-600"
                    >
                      -
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Activity className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">No games played yet</p>
                </div>
              )}
            </div>
          </Card>

          {/* Online Friends Detail - Moved below Last 5 Games */}
          <Card className="bg-slate-800/30 border-slate-700/50 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-purple-400" />
                </div>
                <h2 className="text-lg font-bold text-white">Online Friends</h2>
              </div>
              <Link href="/app/friends">
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white">
                  View All
                </Button>
              </Link>
            </div>
            <div className="p-6">
              {onlineFriends.length > 0 ? (
                <div className="space-y-3">
                  {onlineFriends.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center gap-3 p-3 bg-slate-700/30 rounded-xl border border-slate-600/30 hover:border-slate-500/50 transition-colors"
                    >
                      <Avatar className="w-10 h-10 rounded-lg">
                        <AvatarImage src={friend.avatar_url} />
                        <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-sm font-bold">
                          {friend.username.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm truncate">{friend.username}</p>
                        {friend.activity_label && (
                          <p className="text-emerald-400 text-xs truncate">{friend.activity_label}</p>
                        )}
                      </div>
                      <Link href={`/app/friends?chat=${friend.id}`}>
                        <Button size="sm" variant="ghost" className="text-slate-400 hover:text-emerald-400">
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No friends online</p>
                  <Link href="/app/friends">
                    <Button variant="ghost" size="sm" className="text-emerald-400 mt-2">
                      Find Friends
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              )}
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
    </div>
  );
}
