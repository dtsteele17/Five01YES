'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, UserPlus, UserCheck, Clock, Trophy, TrendingUp, 
  Target, Loader2, MapPin, Globe, MessageCircle 
} from 'lucide-react';
import { toast } from 'sonner';

interface PlayerProfile {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  created_at: string;
}

interface PlayerStats {
  matches_played: number;
  matches_won: number;
  avg_score: number;
  highest_checkout: number;
  one_eighties: number;
}

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends' | 'self';

export default function PlayerProfilePage() {
  const { userId } = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none');
  const [loading, setLoading] = useState(true);
  const [friendLoading, setFriendLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;

    const load = async () => {
      setLoading(true);
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        const myId = user?.id || null;
        setCurrentUserId(myId);

        // Check if viewing own profile
        if (myId === userId) {
          setFriendStatus('self');
        }

        // Fetch profile
        const { data: profileData, error: profileErr } = await supabase
          .from('profiles')
          .select('user_id, username, display_name, avatar_url, bio, location, website, created_at')
          .eq('user_id', userId)
          .maybeSingle();

        if (profileErr || !profileData) {
          toast.error('Player not found');
          router.push('/app');
          return;
        }

        setProfile(profileData);

        // Fetch basic stats from match_stats or quick_match_stats
        const { data: matchStats } = await supabase
          .from('quick_match_stats')
          .select('*')
          .eq('user_id', userId);

        if (matchStats && matchStats.length > 0) {
          const totalMatches = matchStats.length;
          const wins = matchStats.filter((m: any) => m.result === 'win').length;
          const avgScore = matchStats.reduce((sum: number, m: any) => sum + (m.avg_score || 0), 0) / (totalMatches || 1);
          const highestCheckout = Math.max(0, ...matchStats.map((m: any) => m.highest_checkout || 0));
          const oneEighties = matchStats.reduce((sum: number, m: any) => sum + (m.one_eighties || 0), 0);

          setStats({
            matches_played: totalMatches,
            matches_won: wins,
            avg_score: Math.round(avgScore * 10) / 10,
            highest_checkout: highestCheckout,
            one_eighties: oneEighties,
          });
        }

        // Check friend status
        if (myId && myId !== userId) {
          const { data: friendData } = await supabase
            .from('friends')
            .select('id')
            .or(`and(user_id.eq.${myId},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${myId})`)
            .maybeSingle();

          if (friendData) {
            setFriendStatus('friends');
          } else {
            // Check pending requests
            const { data: sentReq } = await supabase
              .from('friend_requests')
              .select('id, status')
              .eq('from_user_id', myId)
              .eq('to_user_id', userId)
              .eq('status', 'pending')
              .maybeSingle();

            if (sentReq) {
              setFriendStatus('pending_sent');
            } else {
              const { data: receivedReq } = await supabase
                .from('friend_requests')
                .select('id, status')
                .eq('from_user_id', userId)
                .eq('to_user_id', myId)
                .eq('status', 'pending')
                .maybeSingle();

              if (receivedReq) {
                setFriendStatus('pending_received');
              }
            }
          }
        }
      } catch (err) {
        console.error('[PlayerProfile] Error:', err);
        toast.error('Failed to load player profile');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [userId]);

  const handleSendFriendRequest = async () => {
    if (!currentUserId || !userId) return;
    setFriendLoading(true);
    try {
      const { data, error } = await supabase.rpc('rpc_send_friend_request', {
        p_target_user_id: userId as string,
      });
      if (error) throw error;
      if (data && !data.success) {
        toast.error(data.error || 'Could not send friend request');
        return;
      }
      setFriendStatus('pending_sent');
      toast.success('Friend request sent!');
    } catch (err: any) {
      console.error('[PlayerProfile] Friend request error:', err);
      toast.error(err?.message || 'Failed to send friend request');
    } finally {
      setFriendLoading(false);
    }
  };

  const handleAcceptFriendRequest = async () => {
    if (!currentUserId || !userId) return;
    setFriendLoading(true);
    try {
      // Find the pending request from this player
      const { data: req } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('from_user_id', userId)
        .eq('to_user_id', currentUserId)
        .eq('status', 'pending')
        .maybeSingle();

      if (!req) {
        toast.error('Friend request not found');
        return;
      }

      const { data, error } = await supabase.rpc('rpc_respond_friend_request', {
        p_request_id: req.id,
        p_accept: true,
      });
      if (error) throw error;
      setFriendStatus('friends');
      toast.success('Friend request accepted!');
    } catch (err: any) {
      console.error('[PlayerProfile] Accept error:', err);
      toast.error('Failed to accept friend request');
    } finally {
      setFriendLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center pt-20">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center pt-20">
        <p className="text-slate-400">Player not found</p>
      </div>
    );
  }

  const joinDate = new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const winRate = stats && stats.matches_played > 0 
    ? Math.round((stats.matches_won / stats.matches_played) * 100) 
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 pt-20 pb-10">
      <div className="container mx-auto px-4 max-w-3xl">
        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="text-slate-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        {/* Profile Header */}
        <Card className="bg-slate-900/50 border-white/10 p-6 mb-6">
          <div className="flex items-start gap-5">
            <Avatar className="w-20 h-20 border-2 border-emerald-500/30">
              <AvatarImage src={profile.avatar_url || ''} />
              <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-2xl font-bold">
                {(profile.display_name || profile.username || 'U').substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-white">
                    {profile.display_name || profile.username}
                  </h1>
                  <p className="text-slate-400 text-sm">@{profile.username}</p>
                </div>

                {/* Friend button */}
                {friendStatus === 'none' && (
                  <Button
                    onClick={handleSendFriendRequest}
                    disabled={friendLoading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {friendLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4 mr-2" />
                    )}
                    Add Friend
                  </Button>
                )}
                {friendStatus === 'pending_sent' && (
                  <Button disabled variant="outline" className="border-amber-500/30 text-amber-400">
                    <Clock className="w-4 h-4 mr-2" />
                    Request Sent
                  </Button>
                )}
                {friendStatus === 'pending_received' && (
                  <Button
                    onClick={handleAcceptFriendRequest}
                    disabled={friendLoading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {friendLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <UserCheck className="w-4 h-4 mr-2" />
                    )}
                    Accept Request
                  </Button>
                )}
                {friendStatus === 'friends' && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 px-3 py-1.5">
                    <UserCheck className="w-4 h-4 mr-1.5" />
                    Friends
                  </Badge>
                )}
                {friendStatus === 'self' && (
                  <Button
                    variant="outline"
                    onClick={() => router.push('/app/profile')}
                    className="border-white/10 text-slate-300 hover:text-white"
                  >
                    Edit Profile
                  </Button>
                )}
              </div>

              {/* Bio */}
              {profile.bio && (
                <p className="text-slate-300 text-sm mt-3">{profile.bio}</p>
              )}

              {/* Meta info */}
              <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500">
                {profile.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {profile.location}
                  </span>
                )}
                {profile.website && (
                  <a href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`} 
                     target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-1 text-emerald-400 hover:underline">
                    <Globe className="w-3 h-3" /> {profile.website}
                  </a>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Joined {joinDate}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <h2 className="text-lg font-bold text-white mb-3">Stats</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <Card className="bg-slate-900/50 border-white/10 p-4 text-center">
            <p className="text-2xl font-bold text-white">{stats?.matches_played || 0}</p>
            <p className="text-xs text-slate-400 mt-1">Matches Played</p>
          </Card>
          <Card className="bg-slate-900/50 border-white/10 p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{winRate}%</p>
            <p className="text-xs text-slate-400 mt-1">Win Rate</p>
          </Card>
          <Card className="bg-slate-900/50 border-white/10 p-4 text-center">
            <p className="text-2xl font-bold text-white">{stats?.avg_score || '-'}</p>
            <p className="text-xs text-slate-400 mt-1">Avg Score</p>
          </Card>
          <Card className="bg-slate-900/50 border-white/10 p-4 text-center">
            <p className="text-2xl font-bold text-amber-400">{stats?.highest_checkout || 0}</p>
            <p className="text-xs text-slate-400 mt-1">Highest Checkout</p>
          </Card>
          <Card className="bg-slate-900/50 border-white/10 p-4 text-center">
            <p className="text-2xl font-bold text-purple-400">{stats?.one_eighties || 0}</p>
            <p className="text-xs text-slate-400 mt-1">180s</p>
          </Card>
          <Card className="bg-slate-900/50 border-white/10 p-4 text-center">
            <p className="text-2xl font-bold text-white">{stats?.matches_won || 0}</p>
            <p className="text-xs text-slate-400 mt-1">Wins</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
