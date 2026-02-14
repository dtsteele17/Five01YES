'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PlayerStatsCard } from '@/components/stats/PlayerStatsCard';
import { usePlayerStats } from '@/lib/hooks/usePlayerStats';
import {
  Trophy,
  Gamepad2,
  User,
  Mail,
  Calendar,
  MapPin,
  Link2,
  Settings,
  BarChart3,
  Crown,
  Shield,
  Activity,
  TrendingUp,
  Target,
  Flame,
  Edit3,
  ChevronRight,
} from 'lucide-react';
import { MatchHistoryList } from '@/components/stats/MatchHistoryList';
import Link from 'next/link';

interface Profile {
  user_id: string;
  username: string;
  email?: string;
  display_name?: string;
  bio?: string;
  location?: string;
  website?: string;
  avatar_url?: string;
  created_at?: string;
}

interface RankedInfo {
  rp: number;
  division_name: string;
  wins: number;
  losses: number;
  games_played: number;
}

// Stat Tile Component
function StatTile({ value, label, icon: Icon, color }: { value: string | number; label: string; icon: any; color: string }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-slate-800/40 rounded-xl border border-slate-700/50">
      <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-2xl font-black text-white">{value}</p>
        <p className="text-slate-400 text-sm uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rankedInfo, setRankedInfo] = useState<RankedInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const { overallStats } = usePlayerStats();
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [{ data: profileData }, { data: rankedData }] = await Promise.all([
          supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
          supabase.rpc('rpc_ranked_get_my_state'),
        ]);

        setProfile(profileData);
        if (rankedData?.player_state) {
          setRankedInfo(rankedData.player_state);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const calculateWinRate = () => {
    if (!overallStats || overallStats.total_matches === 0) return '0.0';
    return ((overallStats.wins / overallStats.total_matches) * 100).toFixed(1);
  };

  const calculateRankedWinRate = () => {
    if (!rankedInfo || rankedInfo.games_played === 0) return '0.0';
    return ((rankedInfo.wins / rankedInfo.games_played) * 100).toFixed(1);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-64 bg-slate-800/50 rounded-3xl animate-pulse" />
        <div className="grid md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-800/50 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Hero Profile Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-700/50">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl" />
        
        <div className="relative z-10 p-8">
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-8">
            {/* Avatar */}
            <div className="relative">
              <Avatar className="w-32 h-32 rounded-2xl border-4 border-slate-700 shadow-2xl">
                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-5xl font-black">
                  {profile?.display_name?.charAt(0) || profile?.username?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full border-4 border-slate-800 flex items-center justify-center">
                <Activity className="w-4 h-4 text-white" />
              </div>
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center lg:text-left">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-4">
                <div>
                  <h1 className="text-4xl font-black text-white tracking-tight">
                    {profile?.display_name || profile?.username || 'User'}
                  </h1>
                  <p className="text-slate-400 text-lg">@{profile?.username}</p>
                </div>
                <div className="flex items-center justify-center lg:justify-start gap-2">
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 px-3 py-1">
                    <Shield className="w-3 h-3 mr-1" />
                    Active
                  </Badge>
                  {rankedInfo?.division_name && (
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 px-3 py-1">
                      <Crown className="w-3 h-3 mr-1" />
                      {rankedInfo.division_name}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Bio */}
              {profile?.bio ? (
                <p className="text-slate-300 max-w-xl mb-4">{profile.bio}</p>
              ) : (
                <p className="text-slate-500 italic mb-4">No bio added yet</p>
              )}

              {/* Meta Info */}
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-sm text-slate-400">
                {profile?.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    <span>{profile.email}</span>
                  </div>
                )}
                {profile?.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    <span>{profile.location}</span>
                  </div>
                )}
                {profile?.website && (
                  <div className="flex items-center gap-1">
                    <Link2 className="w-4 h-4" />
                    <a href={profile.website} target="_blank" rel="noopener" className="hover:text-emerald-400 transition-colors">
                      {profile.website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Joined {formatDate(profile?.created_at)}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3">
              <Link href="/app/settings">
                <Button variant="outline" className="border-slate-600 text-slate-300 hover:text-white w-full lg:w-auto">
                  <Edit3 className="w-4 h-4 mr-2" />
                  Edit Profile
                </Button>
              </Link>
              <Link href="/app/stats">
                <Button className="bg-emerald-600 hover:bg-emerald-700 w-full lg:w-auto">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  View Stats
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid md:grid-cols-4 gap-4">
        <StatTile 
          value={overallStats?.total_matches || 0} 
          label="Matches" 
          icon={Gamepad2} 
          color="bg-blue-500" 
        />
        <StatTile 
          value={`${calculateWinRate()}%`} 
          label="Win Rate" 
          icon={TrendingUp} 
          color="bg-emerald-500" 
        />
        <StatTile 
          value={overallStats?.highest_checkout || '-'} 
          label="Best Checkout" 
          icon={Target} 
          color="bg-amber-500" 
        />
        <StatTile 
          value={overallStats?.visits_180 || 0} 
          label="180s Scored" 
          icon={Flame} 
          color="bg-orange-500" 
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Stats */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overall Stats */}
          <Card className="bg-slate-800/40 border-slate-700/50 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Overall Stats</h2>
                  <p className="text-slate-400 text-sm">Your complete performance history</p>
                </div>
              </div>
            </div>
            <div className="p-6">
              {overallStats ? (
                <PlayerStatsCard stats={overallStats} title="" icon={null} />
              ) : (
                <div className="text-center py-8">
                  <Gamepad2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">No stats available yet</p>
                </div>
              )}
            </div>
          </Card>

          {/* Recent Matches */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-emerald-400" />
                </div>
                <h2 className="text-lg font-bold text-white">Recent Matches</h2>
              </div>
              <Link href="/app/stats">
                <Button variant="ghost" className="text-slate-400 hover:text-white">
                  View All
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
            <MatchHistoryList limit={5} />
          </div>
        </div>

        {/* Right Column - Ranked & Quick Info */}
        <div className="space-y-6">
          {/* Ranked Status */}
          <Card className="bg-slate-800/40 border-slate-700/50 overflow-hidden">
            <div className="p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Ranked Status</h2>
                  <p className="text-slate-400 text-sm">Competitive stats</p>
                </div>
              </div>
            </div>
            <div className="p-6 text-center">
              <p className="text-6xl font-black text-white">{rankedInfo?.rp || 0}</p>
              <p className="text-slate-400 mt-1">Ranked Points</p>
              
              {rankedInfo?.division_name && (
                <div className="mt-4 p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
                  <p className="text-amber-400 font-bold text-xl">{rankedInfo.division_name}</p>
                  <p className="text-slate-400 text-sm">Current Division</p>
                </div>
              )}
              
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div>
                  <p className="text-xl font-bold text-white">{rankedInfo?.wins || 0}</p>
                  <p className="text-slate-400 text-xs">Wins</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{rankedInfo?.losses || 0}</p>
                  <p className="text-slate-400 text-xs">Losses</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{calculateRankedWinRate()}%</p>
                  <p className="text-slate-400 text-xs">Win Rate</p>
                </div>
              </div>
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

          {/* Quick Stats Summary */}
          <Card className="bg-slate-800/40 border-slate-700/50 p-6">
            <h3 className="text-lg font-bold text-white mb-4">Quick Summary</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">3-Dart Average</span>
                <span className="text-white font-bold">
                  {(overallStats as any)?.overall_3dart_avg?.toFixed(1) || '0.0'}
                </span>
              </div>
              <div className="w-full h-px bg-slate-700/50" />
              <div className="flex items-center justify-between">
                <span className="text-slate-400">First 9 Average</span>
                <span className="text-white font-bold">
                  {(overallStats as any)?.first9_avg?.toFixed(1) || '0.0'}
                </span>
              </div>
              <div className="w-full h-px bg-slate-700/50" />
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Checkout %</span>
                <span className="text-white font-bold">
                  {overallStats?.checkout_percentage?.toFixed(1) || '0.0'}%
                </span>
              </div>
              <div className="w-full h-px bg-slate-700/50" />
              <div className="flex items-center justify-between">
                <span className="text-slate-400">100+ Visits</span>
                <span className="text-white font-bold">{overallStats?.visits_100_plus || 0}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
