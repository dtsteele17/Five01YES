'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PlayerStatsCard } from '@/components/stats/PlayerStatsCard';
import { usePlayerStats } from '@/lib/hooks/usePlayerStats';
import { Trophy, Gamepad2, User, Mail, ArrowLeft, BarChart3, History } from 'lucide-react';
import { MatchHistoryList } from '@/components/stats/MatchHistoryList';
import Link from 'next/link';

interface Profile {
  user_id: string;
  username: string;
  email?: string;
  display_name?: string;
  avatar_url?: string;
  created_at?: string;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const { overallStats, quickMatchStats } = usePlayerStats();
  const supabase = createClient();

  useEffect(() => {
    async function loadProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        setProfile(profileData);
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-white text-center">Loading profile...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/app">
            <Button variant="outline" size="icon" className="border-slate-600">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <User className="w-8 h-8 text-emerald-400" />
            Profile
          </h1>
        </div>

        {/* Profile Card */}
        <Card className="bg-slate-900/50 border-slate-700 p-6 mb-8">
          <div className="flex items-center gap-6">
            <Avatar className="w-20 h-20">
              <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-2xl">
                {profile?.username?.substring(0, 2).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">
                {profile?.display_name || profile?.username || 'User'}
              </h2>
              <p className="text-slate-400">@{profile?.username}</p>
              {profile?.email && (
                <p className="text-slate-500 text-sm flex items-center gap-2 mt-1">
                  <Mail className="w-4 h-4" />
                  {profile.email}
                </p>
              )}
            </div>
            <Link href="/app/stats">
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <BarChart3 className="w-4 h-4 mr-2" />
                View Full Stats
              </Button>
            </Link>
          </div>
        </Card>

        {/* Quick Stats */}
        <h2 className="text-xl font-bold text-white mb-4">Quick Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <PlayerStatsCard
            stats={overallStats}
            title="Overall Stats"
            icon={<Trophy className="w-6 h-6 text-yellow-400" />}
          />
          
          <PlayerStatsCard
            stats={quickMatchStats}
            title="Quick Match Stats"
            icon={<Gamepad2 className="w-6 h-6 text-blue-400" />}
          />
        </div>

        {/* Recent Matches */}
        <div className="mt-8">
          <div className="flex items-center gap-3 mb-4">
            <History className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Recent Matches</h2>
          </div>
          <MatchHistoryList limit={10} />
        </div>
      </div>
    </div>
  );
}
