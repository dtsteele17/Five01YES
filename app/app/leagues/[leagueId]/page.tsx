"use client";

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Shield, Lock, Calendar, Clock, Camera, Trophy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import StandingsTable from '@/components/league/StandingsTable';
import FixturesList from '@/components/league/FixturesList';
import PlayersManager from '@/components/league/PlayersManager';
import LiveUpdates from '@/components/league/LiveUpdates';
import StatsTable from '@/components/league/StatsTable';
import { Fixture, Standing } from '@/lib/context/LeaguesContext';

type TabType = 'standings' | 'fixtures' | 'players' | 'updates' | 'stats';

interface League {
  id: string;
  name: string;
  maxParticipants: number;
  access: 'invite' | 'open';
  startDate: Date;
  matchDays: string[];
  matchTime: string;
  gamesPerDay: number;
  legsPerGame: number;
  cameraRequired: boolean;
  playoffs: boolean;
  players: any[];
  fixtures: any[];
  standings: any[];
  stats: any[];
  liveUpdates: any[];
  invitedEmails: string[];
}

export default function LeagueOverview() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabType>('standings');
  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMember, setIsMember] = useState(false);

  const leagueId = params.leagueId as string;

  useEffect(() => {
    loadLeague();
  }, [leagueId]);

  const loadLeague = async () => {
    try {
      setLoading(true);
      console.log('[LEAGUE DETAIL] Starting to load league:', leagueId);

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error('[LEAGUE DETAIL] User error:', userError);
        router.push('/login');
        return;
      }

      console.log('[LEAGUE DETAIL] User authenticated:', user.id);

      // Try fetching league from Supabase (direct query)
      console.log('[LEAGUE DETAIL] Fetching league from Supabase...');
      let leagueData: any = null;
      let leagueError: any = null;

      const { data: directData, error: directError } = await supabase
        .from('leagues')
        .select('*')
        .eq('id', leagueId)
        .single();

      if (directError) {
        console.error('[LEAGUE DETAIL] Direct query failed:', directError.message);
        leagueError = directError;
        
        // If RLS blocked it, try using RPC function as fallback
        if (directError.code === 'PGRST301' || directError.message?.includes('row-level security') || directError.message?.includes('permission denied')) {
          console.log('[LEAGUE DETAIL] RLS blocked, trying RPC function as fallback...');
          
          const { data: rpcData, error: rpcError } = await supabase.rpc('get_league', {
            p_league_id: leagueId,
          });

          if (rpcError) {
            console.error('[LEAGUE DETAIL] RPC also failed:', rpcError);
            leagueError = rpcError;
          } else if (rpcData && !rpcData.error) {
            console.log('[LEAGUE DETAIL] ✅ League fetched via RPC');
            leagueData = rpcData;
            leagueError = null;
          } else if (rpcData?.error) {
            console.error('[LEAGUE DETAIL] RPC returned error:', rpcData.error);
            leagueError = { message: rpcData.error };
          }
        }
      } else {
        leagueData = directData;
        console.log('[LEAGUE DETAIL] ✅ League fetched successfully (direct):', leagueData.id, leagueData.name);
      }

      if (leagueError) {
        console.error('[LEAGUE DETAIL] ❌ Final error:', leagueError.message);
        
        // Debug: Check what's actually in the database
        console.log('[LEAGUE DETAIL] 🔍 Running debug check...');
        const { data: debugInfo, error: debugError } = await supabase.rpc('debug_league_access', {
          p_league_id: leagueId,
        });
        
        if (debugInfo) {
          console.log('[LEAGUE DETAIL] 🔍 Debug Info:', debugInfo);
          if (!debugInfo.can_access) {
            console.error('[LEAGUE DETAIL] ❌ Access denied:', {
              is_owner: debugInfo.is_owner,
              is_member: debugInfo.is_member,
              user_id: debugInfo.user_id,
              owner_id: debugInfo.owner_id,
            });
          } else if (debugInfo.league_data) {
            // If debug says we can access, use that data
            console.log('[LEAGUE DETAIL] ✅ Debug says we can access, using debug data');
            leagueData = debugInfo.league_data;
            leagueError = null;
          }
        } else if (debugError) {
          console.error('[LEAGUE DETAIL] Debug function error:', debugError);
        }
        
        if (leagueError) {
          setLoading(false);
          return;
        }
      }

      if (!leagueData) {
        console.error('[LEAGUE DETAIL] ❌ No league data returned');
        setLoading(false);
        return;
      }

      // Get all members with their roles
      const { data: members, error: membersError } = await supabase
        .from('league_members')
        .select('user_id, role')
        .eq('league_id', leagueId);

      if (membersError) {
        console.error('[LEAGUE DETAIL] Error fetching members:', membersError);
      }

      // Check if current user is a member and get their role
      const currentUserMember = members?.find(m => m.user_id === user.id);
      const userRole = currentUserMember?.role;
      const isOwner = leagueData.owner_id === user.id;
      setIsAdmin(isOwner || userRole === 'owner' || userRole === 'admin');
      setIsMember(!!currentUserMember || isOwner); // Owner is always a member

      // Get member profiles for players list
      const memberUserIds = members?.map(m => m.user_id) || [];
      let players: any[] = [];
      
      if (memberUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, user_id, username, display_name, avatar_url')
          .in('user_id', memberUserIds);

        // Create role map
        const roleMap = new Map<string, string>();
        members?.forEach(m => {
          roleMap.set(m.user_id, m.role || 'Player');
        });

        players = profiles?.map((profile) => {
          const memberRole = roleMap.get(profile.user_id) || 'Player';
          
          return {
            id: profile.id,
            name: profile.display_name || profile.username,
            displayName: profile.display_name || profile.username, // Add displayName for PlayersManager
            username: profile.username,
            avatar: profile.avatar_url,
            status: 'Active',
            role: memberRole === 'owner' ? 'Owner' : (memberRole === 'admin' ? 'Admin' : 'Player'),
            cameraRequiredAcknowledged: false, // Default value - TODO: fetch from database if this field exists
          };
        }) || [];
      }

      // Transform match_days array (integers) to day names
      // Handle both direct query result (array) and RPC JSONB result (might be string)
      let matchDaysArray: number[] = [];
      if (Array.isArray(leagueData.match_days)) {
        matchDaysArray = leagueData.match_days;
      } else if (typeof leagueData.match_days === 'string') {
        try {
          matchDaysArray = JSON.parse(leagueData.match_days);
        } catch {
          matchDaysArray = [];
        }
      }
      
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const matchDays = matchDaysArray.map((dayNum: number) => dayNames[dayNum] || 'Sun');

      // Fetch fixtures from league_matches
      const { data: leagueMatches, error: matchesError } = await supabase
        .from('league_matches')
        .select(`
          id,
          player1_id,
          player2_id,
          status,
          scheduled_date,
          match_room_id,
          best_of,
          created_at
        `)
        .eq('league_id', leagueId)
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (matchesError) {
        console.error('[LEAGUE DETAIL] Error fetching league matches:', matchesError);
      }

      // Get all match_room_ids from league_matches (even if status isn't completed yet)
      const matchRoomIds = leagueMatches
        ?.filter(m => m.match_room_id)
        .map(m => m.match_room_id) || [];

      // Fetch match_rooms to check their status and get results
      let matchRoomsData: any[] = [];
      if (matchRoomIds.length > 0) {
        const { data: rooms, error: roomsError } = await supabase
          .from('match_rooms')
          .select('id, status, summary, league_match_id')
          .in('id', matchRoomIds);

        if (roomsError) {
          console.error('[LEAGUE DETAIL] Error fetching match rooms:', roomsError);
        } else {
          matchRoomsData = rooms || [];
          
          // Update league_matches status if match_rooms is finished
          const finishedRooms = matchRoomsData.filter(r => r.status === 'finished');
          if (finishedRooms.length > 0) {
            for (const room of finishedRooms) {
              const leagueMatch = leagueMatches?.find(m => m.match_room_id === room.id);
              if (leagueMatch && leagueMatch.status !== 'completed') {
                // Update league_match status to completed
                await supabase
                  .from('league_matches')
                  .update({ status: 'completed' })
                  .eq('id', leagueMatch.id);
                
                // Update the local array too
                leagueMatch.status = 'completed';
              }
            }
          }
        }
      }

      // Transform league matches to fixtures
      const fixtures: Fixture[] = (leagueMatches || []).map((match, index) => {
        // Find the corresponding match_room data
        const roomData = matchRoomsData.find(r => r.league_match_id === match.id || r.id === match.match_room_id);
        
        let legsWonHome: number | undefined;
        let legsWonAway: number | undefined;
        
        // Check if match is completed (either league_matches.status='completed' OR match_rooms.status='finished')
        const isCompleted = match.status === 'completed' || roomData?.status === 'finished';
        
        if (isCompleted && roomData?.summary) {
          const summary = roomData.summary as any;
          legsWonHome = parseInt(summary.player1_legs || '0', 10);
          legsWonAway = parseInt(summary.player2_legs || '0', 10);
        }

        return {
          matchId: match.id,
          dateTime: match.scheduled_date ? new Date(match.scheduled_date) : new Date(match.created_at),
          homePlayerId: match.player1_id,
          awayPlayerId: match.player2_id,
          status: isCompleted ? 'Completed' : 
                 match.status === 'in_progress' ? 'Scheduled' : 'Scheduled',
          legsWonHome,
          legsWonAway,
          matchday: Math.floor(index / (leagueData.games_per_day || 3)) + 1,
        };
      });

      // Calculate standings from completed fixtures
      // IMPORTANT: league_matches.player1_id/player2_id are auth.users.id
      // But players array has profiles.id, so we need to map by user_id
      const standingsMap = new Map<string, Standing>();
      
      // Create a map from auth.users.id to profiles.id for players
      // players array was built from profiles (line 177), so player.id = profiles.id
      // We need to map league_matches.player1_id/player2_id (auth.users.id) to profiles.id
      const authIdToProfileIdMap = new Map<string, string>();
      
      // Build the mapping using the profiles that were already fetched (line 166)
      // Re-fetch profiles to get user_id -> id mapping
      let profileMapping: any[] = [];
      if (memberUserIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, user_id')
          .in('user_id', memberUserIds);
        
        profileMapping = profileData || [];
        profileMapping.forEach(profile => {
          authIdToProfileIdMap.set(profile.user_id, profile.id);
        });
      }
      
      // Initialize standings for all players (using profiles.id as key)
      players.forEach(player => {
        standingsMap.set(player.id, {
          playerId: player.id,
          played: 0,
          won: 0,
          lost: 0,
          legDifference: 0,
          points: 0,
          form: [],
        });
      });

      // Process completed fixtures
      const completedFixtures = fixtures.filter(f => f.status === 'Completed' && 
        f.legsWonHome !== undefined && f.legsWonAway !== undefined);
      
      console.log('[LEAGUE DETAIL] Processing standings:', {
        completedFixturesCount: completedFixtures.length,
        authIdToProfileIdMapSize: authIdToProfileIdMap.size,
        playersCount: players.length,
      });
      
      completedFixtures.forEach(fixture => {
        // Convert auth.users.id (from fixture) to profiles.id (for standings)
        const homeProfileId = authIdToProfileIdMap.get(fixture.homePlayerId);
        const awayProfileId = authIdToProfileIdMap.get(fixture.awayPlayerId);
        
        if (!homeProfileId || !awayProfileId) {
          console.warn('[LEAGUE DETAIL] Could not find profile IDs for players:', {
            homePlayerId: fixture.homePlayerId,
            awayPlayerId: fixture.awayPlayerId,
            availableMappings: Array.from(authIdToProfileIdMap.entries()),
          });
          return;
        }
        
        const homeStanding = standingsMap.get(homeProfileId);
        const awayStanding = standingsMap.get(awayProfileId);

        if (!homeStanding || !awayStanding) return;
        if (fixture.legsWonHome === undefined || fixture.legsWonAway === undefined) return;

        homeStanding.played++;
        awayStanding.played++;

        const homeLegDiff = fixture.legsWonHome - fixture.legsWonAway;
        const awayLegDiff = fixture.legsWonAway - fixture.legsWonHome;

        homeStanding.legDifference += homeLegDiff;
        awayStanding.legDifference += awayLegDiff;

        if (fixture.legsWonHome > fixture.legsWonAway) {
          homeStanding.won++;
          homeStanding.points += 2;
          homeStanding.form.unshift('W');
          awayStanding.lost++;
          awayStanding.form.unshift('L');
        } else {
          awayStanding.won++;
          awayStanding.points += 2;
          awayStanding.form.unshift('W');
          homeStanding.lost++;
          homeStanding.form.unshift('L');
        }

        // Keep only last 5 results
        if (homeStanding.form.length > 5) homeStanding.form.pop();
        if (awayStanding.form.length > 5) awayStanding.form.pop();
      });

      // Sort standings by points, then leg difference, then wins
      // IMPORTANT: Always return standings for ALL players, even if they haven't played
      // This ensures the table shows all players with 0 stats instead of "No standings yet"
      const standings = Array.from(standingsMap.values())
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.legDifference !== a.legDifference) return b.legDifference - a.legDifference;
          return b.won - a.won;
        });
      
      console.log('[LEAGUE DETAIL] Standings calculated:', {
        standingsCount: standings.length,
        playersCount: players.length,
        completedFixturesCount: completedFixtures.length,
        standings: standings.map(s => ({
          playerId: s.playerId,
          played: s.played,
          won: s.won,
          points: s.points,
        })),
      });

      // Transform league data to match expected interface
      // Handle both direct query result and RPC JSONB result
      const transformedLeague: League = {
        id: leagueData.id,
        name: leagueData.name,
        maxParticipants: leagueData.max_participants,
        access: leagueData.access_type,
        startDate: new Date(leagueData.start_date),
        matchDays: matchDays,
        matchTime: leagueData.match_time || '19:00',
        gamesPerDay: leagueData.games_per_day || 3,
        legsPerGame: leagueData.legs_per_game || 5,
        cameraRequired: leagueData.camera_required === true || leagueData.camera_required === 'required' || leagueData.camera_required === 'required',
        playoffs: leagueData.playoff_type !== 'none',
        players: players,
        fixtures: fixtures,
        standings: standings,
        stats: [], // TODO: Calculate from fixtures
        liveUpdates: [], // TODO: Fetch from notifications or updates
        invitedEmails: [], // Add missing property to prevent undefined error
      };

      setLeague(transformedLeague);
    } catch (error) {
      console.error('[LEAGUE DETAIL] Error loading league:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-teal-400 mx-auto mb-4" />
          <p className="text-slate-400">Loading league...</p>
        </div>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 flex items-center justify-center">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-red-500/20 rounded-2xl p-8 max-w-md">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">League Not Found</h1>
            <p className="text-slate-400 mb-6">
              The league you're looking for doesn't exist or has been removed.
            </p>
            <Button
              onClick={() => router.push('/app/leagues')}
              className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Leagues
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'standings', label: 'Standings' },
    { id: 'fixtures', label: 'Fixtures' },
    { id: 'players', label: 'Players' },
    { id: 'updates', label: 'Live Updates' },
    { id: 'stats', label: 'Stats' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="relative">
        <div
          className="absolute inset-0 bg-gradient-to-b from-teal-500/10 via-transparent to-transparent pointer-events-none"
          style={{ height: '300px' }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => router.push('/app/leagues')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Leagues
          </button>

          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 rounded-2xl p-6 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-start gap-4 mb-4">
                  <div className="bg-gradient-to-br from-teal-500 to-cyan-600 p-3 rounded-xl">
                    <Trophy className="w-8 h-8 text-white" />
                  </div>
                  <div className="flex-1">
                    <h1 className="text-3xl font-bold text-white mb-2">{league.name}</h1>
                    <p className="text-xs text-gray-500 mb-2">League ID: {leagueId}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={league.access === 'invite' ? 'secondary' : 'default'}>
                        {league.access === 'invite' ? (
                          <><Lock className="w-3 h-3 mr-1" /> Invite Only</>
                        ) : (
                          <><Shield className="w-3 h-3 mr-1" /> Open League</>
                        )}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-slate-400 text-xs mb-1">Legs</div>
                    <div className="text-white font-semibold">{league.legsPerGame}</div>
                  </div>
                  <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-slate-400 text-xs mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Match Days
                    </div>
                    <div className="text-white font-semibold text-sm">
                      {league.matchDays.map(d => d.slice(0, 3)).join(', ')}
                    </div>
                  </div>
                  <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-slate-400 text-xs mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Time
                    </div>
                    <div className="text-white font-semibold">{league.matchTime}</div>
                  </div>
                  <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-slate-400 text-xs mb-1 flex items-center gap-1">
                      <Camera className="w-3 h-3" />
                      Camera
                    </div>
                    <div className="text-white font-semibold">
                      {league.cameraRequired ? 'Required' : 'Optional'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {isAdmin && (
                  <>
                    <Button className="bg-teal-600 hover:bg-teal-700">
                      Invite Players
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push(`/app/leagues/${leagueId}/manage`)}
                    >
                      Manage League
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 rounded-2xl overflow-hidden">
            <div className="border-b border-slate-800/50">
              <div className="flex overflow-x-auto scrollbar-hide">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      relative px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap
                      ${activeTab === tab.id
                        ? 'text-teal-400'
                        : 'text-slate-400 hover:text-white'
                      }
                    `}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500 to-cyan-500" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6">
              {activeTab === 'standings' && <StandingsTable league={league} />}
              {activeTab === 'fixtures' && <FixturesList league={league} />}
              {activeTab === 'players' && <PlayersManager league={league} isAdmin={isAdmin} />}
              {activeTab === 'updates' && <LiveUpdates league={league} isAdmin={isAdmin} />}
              {activeTab === 'stats' && <StatsTable league={league} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
