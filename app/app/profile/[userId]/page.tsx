'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PlayerStatsCard } from '@/components/stats/PlayerStatsCard';
import { usePlayerStats } from '@/lib/hooks/usePlayerStats';
import {
  Trophy,
  Gamepad2,
  Mail,
  Calendar,
  MapPin,
  Link2,
  Crown,
  Shield,
  Activity,
  TrendingUp,
  Target,
  Flame,
  UserPlus,
  UserMinus,
  UserCheck,
  Clock,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';
import { SafetyRatingDetailed } from '@/components/safety/SafetyRatingBadge';
import { toast } from 'sonner';

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
  trust_rating_letter?: string;
  trust_rating_avg?: number;
  trust_rating_count?: number;
  ranked_points?: number;
}

interface RankedInfo {
  rp: number;
  division_name: string;
  wins: number;
  losses: number;
  games_played: number;
  global_rank?: number | null;
}

interface LastMatch {
  id: string;
  opponent_id: string | null;
  opponent_username: string;
  opponent_avatar_url?: string | null;
  game_mode: number;
  match_format: string;
  status: string;
  result: 'win' | 'loss' | 'draw';
  played_at?: string;
}

type FriendStatus = 'none' | 'pending' | 'friends';

function StatTile({
  value,
  label,
  icon: Icon,
  color,
}: {
  value: string | number;
  label: string;
  icon: any;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-4 bg-slate-800/40 rounded-xl border border-slate-700/50">
      <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-lg sm:text-2xl font-black text-white">{value}</p>
        <p className="text-slate-400 text-[11px] sm:text-sm uppercase tracking-wider truncate">{label}</p>
      </div>
    </div>
  );
}

export default function ProfileUserPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const routeUserId = useMemo(
    () => (Array.isArray(params?.userId) ? params.userId[0] : params?.userId),
    [params]
  );

  const [profile, setProfile] = useState<Profile | null>(null);
  const [rankedInfo, setRankedInfo] = useState<RankedInfo | null>(null);
  const [lastMatches, setLastMatches] = useState<LastMatch[]>([]);
  const [lastMatchesLoading, setLastMatchesLoading] = useState(true);
  const [lastMatchesError, setLastMatchesError] = useState<string | null>(null);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none');
  const [friendActionLoading, setFriendActionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const { overallStats } = usePlayerStats(routeUserId);

  const loadProfile = useCallback(async () => {
    if (!routeUserId) return;

    try {
      setLoading(true);
      setLastMatchesLoading(true);
      setProfileError(null);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const me = user?.id || null;
      setViewerId(me);

      const resolveFriendStatus = async (viewerUserId: string, targetUserId: string): Promise<FriendStatus> => {
        let friendRes = await supabase
          .from('friends')
          .select('id')
          .or(
            `and(user_low.eq.${viewerUserId},user_high.eq.${targetUserId}),and(user_low.eq.${targetUserId},user_high.eq.${viewerUserId})`
          )
          .limit(1)
          .maybeSingle();

        if (friendRes.error && /user_low|user_high/i.test(friendRes.error.message || '')) {
          friendRes = await supabase
            .from('friends')
            .select('id')
            .or(
              `and(user_id.eq.${viewerUserId},friend_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_id.eq.${viewerUserId})`
            )
            .limit(1)
            .maybeSingle();
        }

        if (friendRes.data) return 'friends';

        const { data: pendingReq } = await supabase
          .from('friend_requests')
          .select('id')
          .or(
            `and(from_user_id.eq.${viewerUserId},to_user_id.eq.${targetUserId},status.eq.pending),and(from_user_id.eq.${targetUserId},to_user_id.eq.${viewerUserId},status.eq.pending)`
          )
          .limit(1)
          .maybeSingle();

        return pendingReq ? 'pending' : 'none';
      };

      if (me && me === routeUserId) {
        router.replace('/app/profile');
        return;
      }

      const [{ data: profileData }, { data: rankedData }, { data: roomsData, error: roomsError }] =
        await Promise.all([
          supabase.from('profiles').select('*').eq('user_id', routeUserId).maybeSingle(),
          supabase
            .from('ranked_players')
            .select('rp, division_name, wins, losses, games_played')
            .eq('user_id', routeUserId)
            .maybeSingle(),
          supabase
            .from('match_rooms')
            .select(
              'id, player1_id, player2_id, winner_id, game_mode, match_format, status, created_at, updated_at'
            )
            .or(`player1_id.eq.${routeUserId},player2_id.eq.${routeUserId}`)
            .in('status', ['finished', 'forfeited'])
            .order('updated_at', { ascending: false })
            .limit(20),
        ]);

      if (!profileData) {
        setProfile(null);
        setProfileError('User not found.');
        return;
      }

      setProfile(profileData as Profile);

      if (rankedData && rankedData.games_played > 0 && rankedData.rp !== null && typeof rankedData.rp === 'number') {
        const { count: higherRpCount } = await supabase
          .from('ranked_players')
          .select('user_id', { count: 'exact', head: true })
          .gt('rp', rankedData.rp);

        setRankedInfo({
          rp: rankedData.rp,
          division_name: rankedData.division_name || 'Unranked',
          wins: rankedData.wins || 0,
          losses: rankedData.losses || 0,
          games_played: rankedData.games_played || 0,
          global_rank: typeof higherRpCount === 'number' ? higherRpCount + 1 : null,
        });
      } else if (rankedData) {
        setRankedInfo({
          rp: rankedData.rp || 0,
          division_name: rankedData.division_name || 'Unranked',
          wins: rankedData.wins || 0,
          losses: rankedData.losses || 0,
          games_played: rankedData.games_played || 0,
          global_rank: null,
        });
      } else {
        setRankedInfo(null);
      }

      if (me) {
        setFriendStatus(await resolveFriendStatus(me, routeUserId));
      }

      if (roomsError) {
        setLastMatches([]);
        setLastMatchesError(roomsError.message);
      } else {
        const baseMatches = (roomsData || []).map((room: any) => {
          const opponentId = room.player1_id === routeUserId ? room.player2_id : room.player1_id;
          const didWin = !!room.winner_id && room.winner_id === routeUserId;
          return {
            id: room.id,
            opponent_id: opponentId || null,
            game_mode: room.game_mode,
            match_format: room.match_format,
            status: room.status,
            result: room.winner_id ? (didWin ? 'win' : 'loss') : 'draw',
            played_at: room.updated_at || room.created_at,
          };
        });

        const opponentIds = Array.from(
          new Set(baseMatches.map((m) => m.opponent_id).filter((id): id is string => !!id))
        );

        const { data: opponentProfiles } =
          opponentIds.length > 0
            ? await supabase.from('profiles').select('user_id, username, avatar_url').in('user_id', opponentIds)
            : { data: [] as any[] };

        const profileMap = new Map((opponentProfiles || []).map((p: any) => [p.user_id, p]));

        const resolved = baseMatches.map((match) => {
          const opponent = match.opponent_id ? profileMap.get(match.opponent_id) : null;
          return {
            ...match,
            opponent_username: opponent?.username || 'Unknown',
            opponent_avatar_url: opponent?.avatar_url || null,
          } as LastMatch;
        });

        setLastMatches(resolved.slice(0, 3));
        setLastMatchesError(null);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
      setProfileError('Failed to load profile.');
    } finally {
      setLastMatchesLoading(false);
      setLoading(false);
    }
  }, [routeUserId, router, supabase]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleAddFriend = async () => {
    if (!routeUserId) return;
    setFriendActionLoading(true);
    try {
      const { data, error } = await supabase.rpc('rpc_send_friend_request', { p_target_user_id: routeUserId });
      if (error) throw error;
      if (data?.ok || data?.success) {
        setFriendStatus('pending');
        toast.success('Friend request sent');
        return;
      }
      if (data?.error === 'already_friends') {
        setFriendStatus('friends');
        toast.info('Already friends');
        return;
      }
      if (data?.error === 'request_already_sent') {
        setFriendStatus('pending');
        toast.info('Request already pending');
        return;
      }
      toast.error(data?.error || 'Failed to send request');
    } catch (error: any) {
      console.error('Error sending friend request:', error);
      toast.error(error?.message || 'Failed to send friend request');
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!routeUserId || !viewerId) return;
    setFriendActionLoading(true);

    try {
      let removed = false;

      const removeNew = await supabase
        .from('friends')
        .delete()
        .or(
          `and(user_low.eq.${viewerId},user_high.eq.${routeUserId}),and(user_low.eq.${routeUserId},user_high.eq.${viewerId})`
        );

      if (!removeNew.error) {
        removed = true;
      } else if (!/user_low|user_high/i.test(removeNew.error.message || '')) {
        throw removeNew.error;
      }

      if (!removed) {
        const removeLegacy = await supabase
          .from('friends')
          .delete()
          .or(
            `and(user_id.eq.${viewerId},friend_id.eq.${routeUserId}),and(user_id.eq.${routeUserId},friend_id.eq.${viewerId})`
          );

        if (removeLegacy.error) throw removeLegacy.error;
      }

      setFriendStatus('none');
      toast.success('Friend removed');
    } catch (error: any) {
      console.error('Error removing friend:', error);
      toast.error(error?.message || 'Failed to remove friend');
    } finally {
      setFriendActionLoading(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
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

  const isUnranked = !rankedInfo || rankedInfo.games_played === 0;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-64 bg-slate-800/50 rounded-3xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-800/50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="max-w-7xl mx-auto">
        <Card className="bg-slate-800/40 border-slate-700/50 p-6">
          <p className="text-slate-300">{profileError || 'User not found.'}</p>
          <Button onClick={() => router.push('/app')} className="mt-4">
            Back to App
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 border border-slate-700/50">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl" />

        <div className="relative z-10 p-4 sm:p-8">
          <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 sm:gap-8">
            <div className="relative flex-shrink-0">
              <Avatar className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl border-4 border-slate-700 shadow-2xl">
                {profile.avatar_url && (
                  <AvatarImage src={profile.avatar_url} alt="Avatar" className="rounded-2xl object-cover" />
                )}
                <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-4xl sm:text-5xl font-black rounded-2xl">
                  {profile.display_name?.charAt(0) || profile.username?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full border-4 border-slate-800 flex items-center justify-center">
                <Activity className="w-4 h-4 text-white" />
              </div>
            </div>

            <div className="flex-1 text-center lg:text-left">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-4">
                <div>
                  <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                    {profile.display_name || profile.username || 'User'}
                  </h1>
                  <p className="text-slate-400 text-base sm:text-lg">@{profile.username}</p>
                </div>
                <div className="flex items-center justify-center lg:justify-start gap-2">
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 px-3 py-1">
                    <Shield className="w-3 h-3 mr-1" />
                    Active
                  </Badge>
                  {!isUnranked && rankedInfo?.division_name ? (
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 px-3 py-1">
                      <Crown className="w-3 h-3 mr-1" />
                      {rankedInfo.division_name}
                    </Badge>
                  ) : (
                    <Badge className="bg-slate-700/40 text-slate-300 border-slate-600/50 px-3 py-1">
                      <Crown className="w-3 h-3 mr-1" />
                      Unranked
                    </Badge>
                  )}
                </div>
              </div>

              {profile.bio ? (
                <p className="text-slate-300 max-w-xl mb-4">{profile.bio}</p>
              ) : (
                <p className="text-slate-500 italic mb-4">No bio added yet</p>
              )}

              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-sm text-slate-400">
                {profile.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    <span>{profile.email}</span>
                  </div>
                )}
                {profile.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    <span>{profile.location}</span>
                  </div>
                )}
                {profile.website && (
                  <div className="flex items-center gap-1">
                    <Link2 className="w-4 h-4" />
                    <a href={profile.website} target="_blank" rel="noopener" className="hover:text-emerald-400 transition-colors">
                      {profile.website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Joined {formatDate(profile.created_at)}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {friendStatus === 'none' && (
                <Button
                  onClick={handleAddFriend}
                  disabled={friendActionLoading}
                  className="bg-emerald-600 hover:bg-emerald-700 w-full lg:w-auto"
                >
                  {friendActionLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4 mr-2" />
                  )}
                  Add Friend
                </Button>
              )}
              {friendStatus === 'pending' && (
                <Button
                  disabled
                  variant="outline"
                  className="border-slate-600 text-slate-300 w-full lg:w-auto"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Request Pending
                </Button>
              )}
              {friendStatus === 'friends' && (
                <>
                  <Button
                    disabled
                    variant="outline"
                    className="border-emerald-500/40 text-emerald-300 w-full lg:w-auto"
                  >
                    <UserCheck className="w-4 h-4 mr-2" />
                    Friends
                  </Button>
                  <Button
                    onClick={handleRemoveFriend}
                    disabled={friendActionLoading}
                    variant="outline"
                    className="border-slate-600 text-slate-300 hover:text-white w-full lg:w-auto"
                  >
                    {friendActionLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <UserMinus className="w-4 h-4 mr-2" />
                    )}
                    Remove Friend
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatTile value={overallStats?.total_matches || 0} label="Matches" icon={Gamepad2} color="bg-blue-500" />
        <StatTile value={`${calculateWinRate()}%`} label="Win Rate" icon={TrendingUp} color="bg-emerald-500" />
        <StatTile value={overallStats?.highest_checkout || '-'} label="Best Checkout" icon={Target} color="bg-amber-500" />
        <StatTile value={overallStats?.visits_180 || 0} label="180s Scored" icon={Flame} color="bg-orange-500" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-slate-800/40 border-slate-700/50 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Overall Stats</h2>
                  <p className="text-slate-400 text-sm">Complete performance history</p>
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-6">
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

          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-emerald-400" />
                </div>
                <h2 className="text-lg font-bold text-white">Last 3 Matches</h2>
              </div>
            </div>
            <Card className="bg-slate-800/40 border-slate-700/50 p-4">
              {lastMatchesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-slate-700/40 animate-pulse" />
                  ))}
                </div>
              ) : lastMatchesError ? (
                <p className="text-sm text-slate-400">{lastMatchesError}</p>
              ) : lastMatches.length === 0 ? (
                <p className="text-sm text-slate-400">No completed matches yet.</p>
              ) : (
                <div className="space-y-3">
                  {lastMatches.map((match) => (
                    <div
                      key={match.id}
                      className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/50 border border-slate-700/50 p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={match.opponent_avatar_url || ''} />
                          <AvatarFallback className="bg-slate-700 text-white text-xs">
                            {(match.opponent_username || 'U').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-white font-semibold truncate">vs {match.opponent_username}</p>
                          <p className="text-xs text-slate-400">
                            {match.game_mode} • {match.match_format || 'quick'} •{' '}
                            {match.played_at ? new Date(match.played_at).toLocaleDateString() : 'Unknown date'}
                          </p>
                        </div>
                      </div>
                      <Badge
                        className={
                          match.result === 'win'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : match.result === 'loss'
                              ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                              : 'bg-slate-600/40 text-slate-300 border-slate-500/40'
                        }
                      >
                        {match.result.toUpperCase()}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <SafetyRatingDetailed
            grade={(profile.trust_rating_letter as 'A' | 'B' | 'C' | 'D' | 'E') || null}
            average={profile.trust_rating_avg || null}
            totalRatings={profile.trust_rating_count || 0}
          />

          <Card className="bg-slate-800/40 border-slate-700/50 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-700/50">
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
            <div className="p-4 sm:p-6 text-center">
              <p className="text-4xl sm:text-6xl font-black text-white">
                {isUnranked ? profile.ranked_points || 0 : rankedInfo?.rp || 0}
              </p>
              <p className="text-slate-400 mt-1">Ranked Points</p>

              {!isUnranked && rankedInfo?.division_name ? (
                <div className="mt-4 p-3 sm:p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
                  <p className="text-amber-400 font-bold text-xl">{rankedInfo.division_name}</p>
                  <p className="text-slate-400 text-sm">Current Division</p>
                </div>
              ) : (
                <div className="mt-4 p-3 sm:p-4 bg-slate-700/30 rounded-xl border border-slate-600/40">
                  <p className="text-slate-200 font-bold text-xl">Unranked</p>
                  <p className="text-slate-400 text-sm">Play ranked matches to get placed</p>
                </div>
              )}

              {!isUnranked && typeof rankedInfo?.global_rank === 'number' && (
                <div className="mt-4 p-3 bg-slate-700/20 rounded-lg border border-slate-600/30">
                  <p className="text-white font-semibold">Global Rank #{rankedInfo.global_rank}</p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 sm:gap-4 mt-6">
                <div>
                  <p className="text-lg sm:text-xl font-bold text-white">{isUnranked ? 0 : rankedInfo?.wins || 0}</p>
                  <p className="text-slate-400 text-xs">Wins</p>
                </div>
                <div>
                  <p className="text-lg sm:text-xl font-bold text-white">{isUnranked ? 0 : rankedInfo?.losses || 0}</p>
                  <p className="text-slate-400 text-xs">Losses</p>
                </div>
                <div>
                  <p className="text-lg sm:text-xl font-bold text-white">{isUnranked ? '0.0' : calculateRankedWinRate()}%</p>
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
        </div>
      </div>
    </div>
  );
}
