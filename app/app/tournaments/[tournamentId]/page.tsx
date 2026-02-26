'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft,
  Users,
  Trophy,
  Calendar,
  Clock,
  Target,
  UserPlus,
  Settings,
  PlayCircle,
  Crown,
  Star,
  CheckCircle,
  AlertCircle,
  Share2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import TournamentBracketTab from '@/components/app/TournamentBracketTab';
import { TournamentInviteModal } from '@/components/app/TournamentInviteModal';
import { TournamentCountdownPopup } from '@/components/app/TournamentCountdownPopup';
import { TournamentMatchReadyUp } from '@/components/app/TournamentMatchReadyUp';
import { findActiveUserMatch, getMatchRedirect } from '@/lib/utils/tournament-match-status';
import { getParticipantState, updateParticipantStateOptimistically } from '@/lib/utils/tournament-participant-state';

interface Tournament {
  id: string;
  name: string;
  description: string | null;
  start_at: string | null;
  status: string;
  max_participants: number;
  round_scheduling: string;
  entry_type: string;
  game_mode: number;
  legs_per_match: number;
  created_by: string;
  created_at: string;
  bracket_generated_at: string | null;
  started_at: string | null;
}

interface Participant {
  id: string;
  tournament_id: string;
  user_id: string;
  role: string;
  status_type: string;
  joined_at: string;
  profiles: {
    username: string | null;
    avatar_url: string | null;
  } | null;
}

const statusConfig = {
  registration: {
    label: 'Registration Open',
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    description: 'Players can join this tournament',
    icon: Users
  },
  scheduled: {
    label: 'Registration Open',
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    description: 'Players can join this tournament',
    icon: Users
  },
  checkin: {
    label: 'Registration Open',
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    description: 'Players can join this tournament',
    icon: Users
  },
  ready: {
    label: 'Starting Soon',
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    description: 'Tournament will begin shortly',
    icon: Clock
  },
  in_progress: {
    label: 'Live Tournament',
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    description: 'Matches are in progress',
    icon: PlayCircle,
    pulse: true
  },
  completed: {
    label: 'Tournament Complete',
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    description: 'Tournament has finished',
    icon: Crown
  },
  cancelled: {
    label: 'Tournament Cancelled',
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    description: 'Tournament was cancelled',
    icon: X
  },
};

export default function TournamentDetailPage({ params }: { params: { tournamentId: string } }) {
  const { tournamentId } = params;
  const router = useRouter();
  const supabase = createClient();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [justJoined, setJustJoined] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joinLoading, setJoinLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showCountdownPopup, setShowCountdownPopup] = useState(false);
  const [showReadyUpModal, setShowReadyUpModal] = useState(false);
  const [countdownComplete, setCountdownComplete] = useState(false); // Guard: only show ready-up AFTER countdown
  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  
  // P1.1 FIX: Debounce tournament loading to prevent reload storms
  const [lastLoadTime, setLastLoadTime] = useState(0);
  const LOAD_DEBOUNCE_MS = 10000; // Don't reload more than once per 10 seconds (prevent request storms)

  useEffect(() => {
    loadTournament(true); // Force initial load
    loadCurrentUser();
  }, [tournamentId]);

  // SMART TOURNAMENT TIMER: Checks more frequently as start time approaches
  useEffect(() => {
    if (!tournament?.start_at) return;
    if (!['registration', 'scheduled', 'checkin'].includes(tournament?.status || '')) {
      // If already in_progress AND countdown is done, check for ready-up matches every 10s
      if (tournament?.status === 'in_progress' && countdownComplete) {
        const matchInterval = setInterval(() => {
          loadTournamentMatches().then(() => checkForReadyUpMatch());
        }, 10000);
        return () => clearInterval(matchInterval);
      }
      return;
    }

    const checkTournamentTiming = async () => {
      const now = new Date();
      const startTime = new Date(tournament.start_at!);
      const msUntilStart = startTime.getTime() - now.getTime();
      const secondsUntilStart = Math.ceil(msUntilStart / 1000);

      console.log(`⏱️ Tournament timing: ${secondsUntilStart}s until start`);

      // START TIME REACHED - trigger bracket generation! (strict: must be past start time, not just close)
      if (msUntilStart <= 0 && !showCountdownPopup && !countdownComplete) {
        console.log('🏆 START TIME REACHED! Generating bracket...');
        
        // Show the countdown popup (1-minute countdown before matches begin)
        setShowCountdownPopup(true);

        // Call RPC to transition tournament to in_progress + generate bracket
        try {
          const { data: result } = await supabase.rpc('complete_tournament_flow_progression', {
            p_tournament_id: tournamentId
          });
          console.log('Tournament progression result:', result);

          if (result?.action === 'tournament_cancelled') {
            toast.error('Tournament cancelled - not enough players');
            setShowCountdownPopup(false);
            loadTournament();
            return;
          }

          if (result?.action === 'tournament_live') {
            toast.success('🏆 Tournament is LIVE! Bracket generated!');
          }
        } catch (err: any) {
          console.log('Progression RPC error:', err?.message);
        }

        // Reload tournament data to get updated status
        loadTournament();
        return; // Stop checking, countdown popup handles the rest
      }
    };

    // Check every 5 seconds when within 2 minutes of start, otherwise every 30 seconds
    const now = new Date();
    const startTime = new Date(tournament.start_at);
    const msUntilStart = startTime.getTime() - now.getTime();
    const checkInterval = msUntilStart <= 120000 ? 5000 : 30000;

    console.log(`⏱️ Tournament check interval: ${checkInterval / 1000}s (${Math.round(msUntilStart / 1000)}s until start)`);

    // Run immediately once
    checkTournamentTiming();

    const interval = setInterval(checkTournamentTiming, checkInterval);
    return () => clearInterval(interval);
  }, [tournament?.status, tournament?.start_at, tournamentId]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  const checkAndUpdateTournamentStatus = async () => {
    try {
      console.log('Checking tournament status for:', tournamentId);
      
      // Use the SQL function to check and update tournament status
      const { data: statusResult, error: statusError } = await supabase
        .rpc('check_tournament_status', { p_tournament_id: tournamentId });

      if (statusError) {
        console.error('Error checking tournament status:', statusError);
        return;
      }

      console.log('Tournament status check result:', statusResult);

      // If tournament was cancelled, show toast
      if (statusResult?.action === 'cancelled') {
        toast.error(`Tournament cancelled: ${statusResult.reason || 'Insufficient participants'}`);
      } else if (statusResult?.action === 'started') {
        toast.success('Tournament has started!');
      }

    } catch (error) {
      console.error('Error in tournament status check:', error);
    }
  };

  const loadTournament = async (force = false) => {
    // P1.1 FIX: Debounce frequent reloads to prevent storm
    const now = Date.now();
    if (!force && (now - lastLoadTime) < LOAD_DEBOUNCE_MS) {
      console.log('Tournament detail reload debounced - too frequent');
      return;
    }
    setLastLoadTime(now);
    
    try {
      setLoading(true);

      // Load tournament data directly (status checking handled by interval)
      const { data: tournamentData, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .single();

      if (tournamentError) throw tournamentError;
      if (!tournamentData) throw new Error('Tournament not found');

      // REAL-TIME STATUS CHECK: Compare database status vs actual time
      const now = new Date();
      const startTime = tournamentData.start_at ? new Date(tournamentData.start_at) : null;
      const isBeforeStartTime = startTime ? now < startTime : true;
      const timeUntilStart = startTime ? startTime.getTime() - now.getTime() : null;
      const minutesUntilStart = timeUntilStart ? Math.round(timeUntilStart / (1000 * 60)) : null;

      // CRITICAL: If tournament start time has passed but status is still 'scheduled', it should NOT show as "Open"
      const shouldActuallyBeOpen = isBeforeStartTime && ['registration', 'scheduled', 'checkin'].includes(tournamentData.status);

      console.log('🕐 TOURNAMENT TIMING ANALYSIS:', {
        database_status: tournamentData.status,
        start_time: tournamentData.start_at,
        current_time: now.toISOString(),
        is_before_start_time: isBeforeStartTime,
        minutes_until_start: minutesUntilStart,
        should_be_open: shouldActuallyBeOpen,
        time_passed_but_still_scheduled: !isBeforeStartTime && ['registration', 'scheduled', 'checkin'].includes(tournamentData.status),
        created_by: tournamentData.created_by,
        currentUserId
      });

      setTournament(tournamentData);
      const userIsCreator = currentUserId === tournamentData.created_by;
      setIsCreator(userIsCreator);
      
      // If user is the creator, they should be automatically registered
      if (userIsCreator && !justJoined) {
        setIsRegistered(true);
        
        // Ensure creator is registered in the database
        try {
          const { data: autoRegisterResult } = await supabase.rpc('auto_register_tournament_creator', {
            p_tournament_id: tournamentId,
            p_creator_user_id: currentUserId
          });
          console.log('Auto-register creator result:', autoRegisterResult);
        } catch (error) {
          console.log('Auto-register creator not available yet:', error);
        }
      }

      // Load participants - direct query with manual profile lookup for reliability
      const { data: participantsData, error: participantsError } = await supabase
        .from('tournament_participants')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('joined_at', { ascending: true });

      console.log('Raw participants data:', { participantsData, participantsError });

      if (participantsError) throw participantsError;

      // Manually get profile data for each participant to ensure it works
      const participantsWithProfiles = [];
      for (const participant of (participantsData || [])) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('user_id', participant.user_id)
          .single();

        participantsWithProfiles.push({
          ...participant,
          profiles: profile
        });
      }

      console.log('Participants with profiles:', participantsWithProfiles);

      if (participantsError) throw participantsError;

      setParticipants(participantsWithProfiles);
      
      // P1.2 FIX: Use centralized participant state logic
      const participantState = getParticipantState(participantsWithProfiles, currentUserId);
      
      // Only update registration status if user didn't just join
      if (!justJoined) {
        setIsRegistered(participantState.isRegistered);
      } else {
        // User just joined - verify they're in the participant list, if so clear the flag
        if (participantState.isRegistered) {
          setJustJoined(false); // Registration confirmed in database
        }
      }

      // Countdown popup is now handled by the SMART TOURNAMENT TIMER useEffect
      // It only triggers at EXACT start time, not before

      // Skip activities for now - causing 400 errors
      setActivities([]);

      // If tournament is in progress, load matches (but only check ready-up after countdown)
      if (tournamentData.status === 'in_progress') {
        await loadTournamentMatches();
        // ONLY show ready-up if countdown has already completed
        if (countdownComplete) {
          await checkForReadyUpMatch();
        }
      }

    } catch (error) {
      console.error('Error loading tournament:', error);
      toast.error('Failed to load tournament');
    } finally {
      setLoading(false);
    }
  };

  const loadTournamentMatches = async () => {
    try {
      // Load matches WITHOUT foreign key joins (avoids PGRST200 error)
      const { data: matchesData, error } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('round')
        .order('match_index');

      if (error) throw error;

      // Get unique player IDs from matches
      const playerIds = new Set<string>();
      (matchesData || []).forEach(m => {
        if (m.player1_id) playerIds.add(m.player1_id);
        if (m.player2_id) playerIds.add(m.player2_id);
      });

      // Fetch all player profiles in one query
      let playerProfiles: Record<string, { username: string | null; avatar_url: string | null }> = {};
      if (playerIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, username, avatar_url')
          .in('user_id', Array.from(playerIds));

        if (profiles) {
          profiles.forEach(p => {
            playerProfiles[p.user_id] = { username: p.username, avatar_url: p.avatar_url };
          });
        }
      }

      // Attach profile data to matches
      const matchesWithProfiles = (matchesData || []).map(match => ({
        ...match,
        player1_profile: match.player1_id ? playerProfiles[match.player1_id] || null : null,
        player2_profile: match.player2_id ? playerProfiles[match.player2_id] || null : null,
      }));

      console.log('📊 Tournament matches loaded:', matchesWithProfiles);
      setMatches(matchesWithProfiles);
    } catch (error) {
      console.error('Error loading matches:', error);
    }
  };

  const checkForReadyUpMatch = async () => {
    if (!currentUserId) return;

    try {
      // Use canonical logic to find active match requiring action
      const activeMatch = findActiveUserMatch(matches, currentUserId);
      
      if (activeMatch) {
        const matchStatus = getMatchRedirect(activeMatch, tournamentId, currentUserId);
        
        if (matchStatus.canRedirect) {
          if (matchStatus.shouldShowReadyUp) {
            // Show ready-up modal
            setCurrentMatchId(activeMatch.id);
            setShowReadyUpModal(true);
          } else if (matchStatus.redirectUrl) {
            // Redirect to live match
            router.push(matchStatus.redirectUrl);
          }
        }
      }
    } catch (error) {
      console.error('Error checking for ready-up match:', error);
    }
  };

  const handleJoinTournament = async () => {
    if (!currentUserId) {
      toast.error('Please log in to join tournaments');
      return;
    }

    try {
      setJoinLoading(true);

      console.log('Attempting to join tournament:', { tournamentId, currentUserId });

      // Try RPC function first
      const { data: rpcResult, error: rpcError } = await supabase.rpc('join_tournament', {
        p_tournament_id: tournamentId,
        p_user_id: currentUserId
      });

      console.log('Join tournament RPC result:', { rpcResult, rpcError });

      if (rpcError) {
        console.error('RPC join_tournament failed:', rpcError);
        throw rpcError;
      }

      if (rpcResult && !rpcResult.success) {
        console.error('Join tournament failed:', rpcResult.error);
        throw new Error(rpcResult.error);
      }

      console.log('🎉 Successfully joined tournament!', rpcResult);
      toast.success(`🏆 Joined tournament! Welcome to the lobby! (${rpcResult?.participant_count || '?'} participants)`);
      
      // Force immediate reload to show user in participants
      setIsRegistered(true);
      setJustJoined(true);
      
      // Reload tournament data immediately to get updated participant list
      console.log('Reloading tournament data after successful join...');
      await loadTournament(true);

    } catch (error: any) {
      console.error('Error joining tournament:', error);
      if (error.code === '23505') {
        toast.error('You are already registered for this tournament');
      } else {
        toast.error(error.message || 'Failed to join tournament');
      }
    } finally {
      setJoinLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getRegistrationProgress = () => {
    if (!tournament) return 0;
    return Math.round((participants.length / tournament.max_participants) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="animate-pulse">
            <div className="h-8 bg-slate-700 rounded w-1/3 mb-4" />
            <div className="h-6 bg-slate-700 rounded w-1/2 mb-6" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="h-64 bg-slate-800 rounded-xl" />
              </div>
              <div className="h-96 bg-slate-800 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
        <div className="max-w-6xl mx-auto text-center py-12">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Tournament Not Found</h2>
          <p className="text-slate-400 mb-6">The tournament you're looking for doesn't exist or has been removed.</p>
          <Button onClick={() => router.push('/app/tournaments')} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tournaments
          </Button>
        </div>
      </div>
    );
  }

  const statusInfo = statusConfig[tournament.status as keyof typeof statusConfig] || statusConfig.registration;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Premium Header Section */}
      <div className="bg-slate-900/40 backdrop-blur-xl border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/app/tournaments')}
              className="text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div className="text-sm text-slate-500 font-medium">
              / Tournaments / {tournament.name}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >

          {/* Premium Tournament Header Card */}
          <Card className="bg-slate-900/60 backdrop-blur-sm border-white/10 shadow-2xl shadow-slate-900/25">
            <CardContent className="p-8">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 via-emerald-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
                      <Trophy className="w-8 h-8 text-white" />
                    </div>
                    <div>
                      <h1 className="text-4xl font-black text-white tracking-tight">{tournament.name}</h1>
                      <div className="flex items-center gap-4 text-slate-400 mt-2">
                        <div className="flex items-center gap-1">
                          <Target className="w-4 h-4" />
                          <span>{tournament.game_mode} Darts</span>
                        </div>
                        <span>•</span>
                        <span>Best of {tournament.legs_per_match}</span>
                        <span>•</span>
                        <span>{tournament.max_participants} Players</span>
                        <span>•</span>
                        <span className="capitalize">{tournament.entry_type}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <Badge
                      className={`${statusInfo.color} text-base font-semibold border px-4 py-2 w-fit shadow-sm ${'pulse' in statusInfo && statusInfo.pulse ? 'animate-pulse' : ''}`}
                    >
                      <StatusIcon className="w-5 h-5 mr-2" />
                      {statusInfo.label}
                    </Badge>

                    {tournament.start_at && (
                      <div className="flex items-center gap-2 text-slate-300 bg-slate-800/30 px-4 py-2 rounded-xl">
                        <Calendar className="w-4 h-4" />
                        <span className="font-medium">{formatDate(tournament.start_at)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button variant="outline" size="sm" className="bg-slate-800/30 border-white/20 text-white hover:bg-slate-700">
                    <Share2 className="w-4 h-4 mr-2" />
                    Share
                  </Button>

                  {isCreator && (
                    <Button variant="outline" size="sm" className="bg-slate-800/30 border-white/20 text-white hover:bg-slate-700">
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Premium Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Registration Progress */}
            <Card className="bg-slate-900/60 backdrop-blur-sm border-white/10 shadow-lg">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                      <Users className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white">{participants.length}/{tournament.max_participants}</div>
                      <div className="text-sm text-slate-400">Players Registered</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Progress
                      value={getRegistrationProgress()}
                      className="h-3 bg-slate-800"
                    />
                    <div className="text-xs text-slate-500 font-medium">
                      {getRegistrationProgress()}% Full
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tournament Format */}
            <Card className="bg-slate-900/60 backdrop-blur-sm border-white/10 shadow-lg">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                      <Target className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white">Best of {tournament.legs_per_match}</div>
                      <div className="text-sm text-slate-400">Match Format</div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-300">
                    {tournament.round_scheduling === 'singleDay' ? 'Single Day' : 'Multi-Day'} • {tournament.game_mode} Darts
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tournament Timing */}
            <Card className="bg-slate-900/60 backdrop-blur-sm border-white/10 shadow-lg">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center">
                      <Clock className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white">
                        {(() => {
                          // Real-time status check
                          const now = new Date();
                          const startTime = tournament.start_at ? new Date(tournament.start_at) : null;
                          const isBeforeStartTime = startTime ? now < startTime : true;
                          const shouldBeOpen = isBeforeStartTime && ['registration', 'scheduled', 'checkin'].includes(tournament.status);
                          
                          if (shouldBeOpen) return 'Open';
                          if (tournament.status === 'ready') return 'Starting';
                          if (tournament.status === 'in_progress') return 'Live';
                          if (tournament.status === 'cancelled') return 'Cancelled';
                          if (tournament.status === 'completed') return 'Complete';
                          
                          // If time has passed but tournament is still 'scheduled', it should be processed
                          if (!isBeforeStartTime && ['registration', 'scheduled', 'checkin'].includes(tournament.status)) {
                            return 'Processing';
                          }
                          
                          return 'Complete';
                        })()}
                      </div>
                      <div className="text-sm text-slate-400">Status</div>
                    </div>
                  </div>
                  <div className="text-sm text-slate-300">
                    {tournament.entry_type === 'open' ? 'Open Entry' : 'Invite Only'}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-3">
            <Tabs defaultValue="overview" className="space-y-8">
              <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-white/10 p-2">
                <TabsList className="grid w-full grid-cols-3 bg-transparent">
                  <TabsTrigger
                    value="overview"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/25 rounded-xl py-3 px-6 font-medium transition-all duration-200"
                  >
                    <Target className="w-4 h-4 mr-2" />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger
                    value="players"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/25 rounded-xl py-3 px-6 font-medium transition-all duration-200"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Players ({participants.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="bracket"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/25 rounded-xl py-3 px-6 font-medium transition-all duration-200"
                  >
                    <Trophy className="w-4 h-4 mr-2" />
                    Bracket
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <Card className="bg-slate-900/60 backdrop-blur-sm border-white/10 shadow-lg">
                  <CardHeader className="pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                        <Target className="w-5 h-5 text-emerald-400" />
                      </div>
                      <CardTitle className="text-white text-xl">About This Tournament</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {tournament.description ? (
                      <div className="bg-slate-800/30 rounded-xl p-4 border border-white/5">
                        <p className="text-slate-300 leading-relaxed">{tournament.description}</p>
                      </div>
                    ) : (
                      <div className="bg-slate-800/30 rounded-xl p-4 border border-white/5">
                        <p className="text-slate-400 italic">No description provided for this tournament.</p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-slate-800/30 rounded-xl p-4 space-y-3">
                        <h4 className="font-semibold text-white flex items-center gap-2">
                          <div className="w-6 h-6 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                            <Trophy className="w-3 h-3 text-emerald-400" />
                          </div>
                          Tournament Rules
                        </h4>
                        <ul className="space-y-2 text-sm text-slate-300">
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                            {tournament.game_mode} starting score
                          </li>
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                            Best of {tournament.legs_per_match} legs per match
                          </li>
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                            Double out finish required
                          </li>
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                            Single elimination bracket
                          </li>
                        </ul>
                      </div>
                      <div className="bg-slate-800/30 rounded-xl p-4 space-y-3">
                        <h4 className="font-semibold text-white flex items-center gap-2">
                          <div className="w-6 h-6 bg-blue-500/20 rounded-lg flex items-center justify-center">
                            <Users className="w-3 h-3 text-blue-400" />
                          </div>
                          Format Details
                        </h4>
                        <ul className="space-y-2 text-sm text-slate-300">
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                            {tournament.max_participants} player maximum
                          </li>
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                            {tournament.entry_type === 'open' ? 'Open registration' : 'Invite only'}
                          </li>
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                            {tournament.round_scheduling === 'singleDay' ? 'Single day' : 'Multi-day'} event
                          </li>
                          <li className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                            Real-time match progression
                          </li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card className="bg-slate-900/50 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white">Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {participants.slice(-5).reverse().map((participant, index) => (
                        <motion.div
                          key={participant.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="flex items-center gap-3 text-sm"
                        >
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-slate-700 text-slate-300">
                              {participant.profiles?.username?.[0]?.toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <span className="text-white font-medium">
                              {participant.profiles?.username || 'Unknown Player'}
                            </span>
                            <span className="text-slate-400"> joined the tournament</span>
                          </div>
                          <span className="text-xs text-slate-500">
                            {new Date(participant.joined_at).toLocaleDateString()}
                          </span>
                        </motion.div>
                      ))}

                      {participants.length === 0 && (
                        <p className="text-slate-400 text-center py-4">No players have joined yet</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Players Tab */}
              <TabsContent value="players" className="space-y-6">
                <Card className="bg-slate-900/60 backdrop-blur-sm border-white/10 shadow-lg">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                          <Users className="w-5 h-5 text-blue-400" />
                        </div>
                        <div>
                          <CardTitle className="text-white text-xl">Tournament Players</CardTitle>
                          <p className="text-slate-400 text-sm">{participants.length} of {tournament.max_participants} registered</p>
                        </div>
                      </div>
                      
                      {/* Invite Button - Only for tournament creators */}
                      {isCreator && tournament.status === 'registration' && (
                        <Button
                          onClick={() => setShowInviteModal(true)}
                          className="bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-semibold shadow-lg shadow-emerald-500/25"
                        >
                          <UserPlus className="w-4 h-4 mr-2" />
                          Invite Players
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {participants.map((participant, index) => (
                        <motion.div
                          key={participant.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.05 }}
                          className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50"
                        >
                          <Avatar className="w-10 h-10">
                            <AvatarFallback className="bg-slate-700 text-white font-semibold">
                              {participant.profiles?.username?.[0]?.toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-medium truncate">
                              {participant.profiles?.username || 'Unknown Player'}
                            </div>
                            <div className="text-xs text-slate-400">
                              Joined {new Date(participant.joined_at).toLocaleDateString()}
                            </div>
                          </div>
                          {participant.role === 'admin' && (
                            <Crown className="w-4 h-4 text-yellow-400" />
                          )}
                        </motion.div>
                      ))}
                    </div>

                    {participants.length === 0 && (
                      <div className="text-center py-8">
                        <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400">No players registered yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Bracket Tab */}
              <TabsContent value="bracket">
                <Card className="bg-slate-900/50 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white">Tournament Bracket</CardTitle>
                    <CardDescription className="text-slate-400">
                      {tournament.bracket_generated_at
                        ? 'Interactive tournament bracket - click matches for details'
                        : 'Bracket will be generated when tournament starts'
                      }
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {tournament.bracket_generated_at ? (
                      <TournamentBracketTab tournamentId={tournamentId} />
                    ) : (
                      <div className="text-center py-12">
                        <Trophy className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-slate-300 mb-2">Bracket Not Generated</h3>
                        <p className="text-slate-400 mb-4">
                          The tournament bracket will be created automatically when the tournament starts.
                        </p>
                        {tournament.status === 'registration' && (
                          <p className="text-sm text-slate-500">
                            Waiting for more players to join ({participants.length}/{tournament.max_participants} registered)
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>



          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Join/Status Card */}
            <Card className="bg-slate-900/50 border-white/10 sticky top-6">
              <CardContent className="p-6">
                {!isRegistered ? (
                  <div className="space-y-4">
                    <div className="text-center">
                      <h3 className="text-lg font-semibold text-white mb-2">Join Tournament</h3>
                      <p className="text-sm text-slate-400 mb-4">
                        {participants.length === tournament.max_participants
                          ? 'Tournament is full!'
                          : `${tournament.max_participants - participants.length} spots remaining`
                        }
                      </p>
                    </div>

                    <Button
                      onClick={handleJoinTournament}
                      disabled={(() => {
                        // Real-time join availability check
                        const now = new Date();
                        const startTime = tournament.start_at ? new Date(tournament.start_at) : null;
                        const isBeforeStartTime = startTime ? now < startTime : true;
                        const canJoin = isBeforeStartTime && ['registration', 'scheduled', 'checkin'].includes(tournament.status);
                        
                        return joinLoading || 
                               participants.length >= tournament.max_participants || 
                               !canJoin || 
                               justJoined;
                      })()}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {joinLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          Joining...
                        </>
                      ) : justJoined ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Registering...
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4 mr-2" />
                          Join Tournament
                        </>
                      )}
                    </Button>

                    {tournament.entry_type === 'invite_only' && (
                      <p className="text-xs text-amber-400 text-center">
                        ⚠️ This tournament requires an invitation
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">You're Registered!</h3>
                      <p className="text-sm text-slate-400">
                        {tournament.status === 'registration' && 'You will be notified when the tournament starts'}
                        {tournament.status === 'ready' && 'Tournament is starting soon!'}
                        {tournament.status === 'in_progress' && 'Good luck in your matches!'}
                        {tournament.status === 'completed' && 'Tournament has ended'}
                      </p>
                    </div>

                    {tournament.status === 'in_progress' && (
                      <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                        <PlayCircle className="w-4 h-4 mr-2" />
                        View My Matches
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tournament Stats */}
            <Card className="bg-slate-900/50 border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-base">Tournament Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="p-3 bg-slate-800/30 rounded-lg">
                    <div className="text-lg font-bold text-emerald-400">{participants.length}</div>
                    <div className="text-xs text-slate-400">Players</div>
                  </div>
                  <div className="p-3 bg-slate-800/30 rounded-lg">
                    <div className="text-lg font-bold text-blue-400">
                      {tournament.max_participants === 4 ? '2' :
                       tournament.max_participants === 8 ? '3' :
                       tournament.max_participants === 16 ? '4' :
                       tournament.max_participants === 32 ? '5' : '6'}
                    </div>
                    <div className="text-xs text-slate-400">Rounds</div>
                  </div>
                </div>

                <div className="text-xs text-slate-500 space-y-1">
                  <div>Created: {new Date(tournament.created_at).toLocaleDateString()}</div>
                  {tournament.started_at && (
                    <div>Started: {new Date(tournament.started_at).toLocaleDateString()}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Tournament Invite Modal */}
        {tournament && (
          <TournamentInviteModal
            isOpen={showInviteModal}
            onClose={() => setShowInviteModal(false)}
            tournamentId={tournament.id}
            tournamentName={tournament.name}
          />
        )}

        {/* Tournament Countdown Popup */}
        {tournament && tournament.start_at && (
          <TournamentCountdownPopup
            tournamentId={tournament.id}
            tournamentName={tournament.name}
            startTime={tournament.start_at}
            isVisible={showCountdownPopup}
            onComplete={() => {
              setShowCountdownPopup(false);
              setCountdownComplete(true); // NOW ready-up can show
              // Check for ready-up after countdown completes
              setTimeout(() => {
                loadTournament();
                loadTournamentMatches().then(() => {
                  checkForReadyUpMatch();
                });
              }, 1000);
            }}
          />
        )}

        {/* Tournament Ready-Up Modal */}
        {showReadyUpModal && currentMatchId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <TournamentMatchReadyUp
              matchId={currentMatchId}
              tournamentId={tournamentId}
              onComplete={(matchRoomId) => {
                setShowReadyUpModal(false);
                setCurrentMatchId(null);
                if (matchRoomId) {
                  // Navigate to match room
                  router.push(`/app/play/quick-match/match?room=${matchRoomId}&tournament=${tournamentId}`);
                } else {
                  // Stay on tournament page and refresh
                  loadTournament();
                  loadTournamentMatches();
                }
              }}
              onCancel={() => {
                setShowReadyUpModal(false);
                setCurrentMatchId(null);
                loadTournament();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}