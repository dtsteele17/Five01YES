'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Trophy,
  Target,
  TrendingUp,
  Award,
  Edit,
  Share2,
  Calendar,
  MapPin,
  Shield,
} from 'lucide-react';
import { ProfileProvider, useProfile } from '@/lib/context/ProfileContext';
import { EditProfileModal } from '@/components/app/EditProfileModal';
import { RankCard } from '@/components/app/RankCard';
import { RankedStatsCard } from '@/components/app/RankedStatsCard';
import { ProfileRankBadge } from '@/components/app/ProfileRankBadge';
import { TrustRatingBadge } from '@/components/app/TrustRatingBadge';
import { createClient } from '@/lib/supabase/client';

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

function ProfileContent() {
  const { profile, loading } = useProfile();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [rankedState, setRankedState] = useState<RankedPlayerState | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchRankedState() {
      try {
        const { data, error } = await supabase.rpc('rpc_ranked_get_my_state');
        if (error) {
          console.error('Error fetching ranked state:', error);
        } else if (data) {
          setSeason(data.season);
          setRankedState(data.player_state);
        }
      } catch (err) {
        console.error('Unexpected error:', err);
      }
    }

    if (!loading) {
      fetchRankedState();
    }
  }, [loading]);

  const getInitials = () => {
    if (!profile?.display_name) return 'JD';
    const names = profile.display_name.split(' ');
    if (names.length >= 2) {
      return `${names[0][0]}${names[1][0]}`.toUpperCase();
    }
    return profile.display_name.substring(0, 2).toUpperCase();
  };

  const formatJoinDate = () => {
    if (!profile?.created_at) return 'Joined Jan 2026';
    const date = new Date(profile.created_at);
    return `Joined ${date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">Loading profile...</div>
      </div>
    );
  }
  return (
    <>
      <div className="space-y-8">
        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center space-x-6">
              <Avatar className="w-24 h-24">
                <AvatarImage src={profile?.avatar_url || ''} />
                <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-3xl">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h1 className="text-3xl font-bold text-white">
                    {profile?.display_name || 'Anonymous Player'}
                  </h1>
                  <TrustRatingBadge rating={profile?.trust_rating_letter} size="md" />
                </div>
                <p className="text-gray-400 mb-3">@{profile?.username || 'user'}</p>
                <div className="flex items-center space-x-4 text-sm text-gray-400 mb-4">
                  {profile?.location && (
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 mr-1" />
                      {profile.location}
                    </div>
                  )}
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    {formatJoinDate()}
                  </div>
                </div>
                <ProfileRankBadge />
              </div>
            </div>
            <div className="flex space-x-3">
              <Button variant="outline" className="border-white/10 text-white hover:bg-white/5">
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
              <Button
                onClick={() => setEditModalOpen(true)}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Profile
              </Button>
            </div>
          </div>
        </Card>

        <RankCard rankedState={rankedState} season={season} loading={loading} />

        <RankedStatsCard />

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
            <h2 className="text-xl font-bold text-white mb-6">About</h2>
            <p className="text-gray-300 mb-6">
              {profile?.about || 'No bio added yet. Click Edit Profile to add information about yourself.'}
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-gray-400">Favorite Format</span>
                <span className="text-white font-medium">{profile?.favorite_format || 'Not set'}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-gray-400">Playing Since</span>
                <span className="text-white font-medium">{profile?.playing_since || 'Not set'}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-gray-400">Preferred Hand</span>
                <span className="text-white font-medium">{profile?.preferred_hand || 'Not set'}</span>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Achievements</h2>
              <Link href="/app/achievements">
                <span className="text-sm text-teal-400 hover:text-teal-300 hover:underline transition-all cursor-pointer">
                  View All
                </span>
              </Link>
            </div>

            <div className="space-y-3">
              {[
                { title: '7-Game Win Streak', desc: 'Won 7 consecutive matches', color: 'from-orange-500 to-red-500' },
                { title: 'Century Club', desc: 'Achieved 100+ average score', color: 'from-emerald-500 to-teal-500' },
                { title: 'Tournament Victor', desc: 'Won weekly tournament', color: 'from-yellow-500 to-orange-500' },
                { title: 'Perfect Game', desc: 'Won without opponent scoring', color: 'from-blue-500 to-cyan-500' },
              ].map((achievement, index) => (
                <div
                  key={index}
                  className="flex items-center space-x-3 p-3 bg-white/5 rounded-xl border border-white/5"
                >
                  <div className={`w-10 h-10 bg-gradient-to-br ${achievement.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Award className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{achievement.title}</p>
                    <p className="text-gray-400 text-xs">{achievement.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
          <h2 className="text-xl font-bold text-white mb-6">Match History</h2>

          <div className="py-8 text-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-8 h-8 text-gray-500" />
            </div>
            <p className="text-gray-400 mb-2">No match history yet</p>
            <p className="text-gray-500 text-sm">Play matches to build your history</p>
          </div>

          <div className="space-y-3 hidden">
            {[].map((match: any, index: number) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5"
              >
                <div className="flex items-center space-x-4">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${
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
                  <p className={`text-sm ${match.result === 'W' ? 'text-green-400' : 'text-red-400'}`}>
                    {match.rating}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <EditProfileModal open={editModalOpen} onClose={() => setEditModalOpen(false)} />
    </>
  );
}

export default function ProfilePage() {
  return (
    <ProfileProvider>
      <ProfileContent />
    </ProfileProvider>
  );
}
