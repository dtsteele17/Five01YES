'use client';

import { useState, useEffect, useRef } from 'react';
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
  Swords,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import TournamentBracketTab from '@/components/app/TournamentBracketTab';
import { TournamentInviteModal } from '@/components/app/TournamentInviteModal';
import { TournamentCountdownPopup } from '@/components/app/TournamentCountdownPopup';
import { TournamentReadyUpModal } from '@/components/app/TournamentReadyUpModal';
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
  const [nextRoundCountdown, setNextRoundCountdown] = useState<number | null>(null); // seconds remaining
  const [nextRoundTotal, setNextRoundTotal] = useState<number>(60); // total countdown duration
  const [nextRoundMatchId, setNextRoundMatchId] = useState<string | null>(null);
  const nextRoundTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // P1.1 FIX: Debounce tournament loading to prevent reload storms
  const [lastLoadTime, setLastLoadTime] = useState(0);
  const LOAD_DEBOUNCE_MS = 10000; // Don't reload more than once per 10 seconds (prevent request storms)

  useEffect(() => {
    loadTournament(true); // Force initial load
    loadCurrentUser();
    return () => {
      if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current);
    };
  }, [tournamentId]);

  // When user is identified AND tournament is in progress, immediately check for matches
  useEffect(() => {
    if (currentUserId && tournament?.status === 'in_progress') {
      console.log('[Tournament] User ready + in_progress, checking for matches immediately');
      checkForReadyUpMatch();
    }
  }, [currentUserId, tournament?.status]);

  // SMART TOURNAMENT TIMER: Checks more frequently as start time approaches
  useEffect(() => {
    if (!tournament?.start_at) return;
    if (!['registration', 'scheduled', 'checkin'].includes(tournament?.status || '')) {
      // If already in_progress, check for ready-up matches every 10s (regardless of countdown state — user may return from match)
      if (tournament?.status === 'in_progress') {
        // Check immediately on page load/return
        console.log('[Tournament] Status is in_progress, starting ready-up polling');
        checkForReadyUpMatch();
        // Then check every 5 seconds
        const matchInterval = setInterval(() => {
          checkForReadyUpMatch();
        }, 5000);
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
      // GUARD: Only trigger if bracket hasn't been generated yet - prevents re-triggering on page revisit
      if (msUntilStart <= 0 && !showCountdownPopup && !countdownComplete && !tournament.bracket_generated_at) {
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
      
      // If bracket already generated but we just loaded the page after start time,
      // show countdown popup briefly to inform user tournament is live
      if (msUntilStart <= 0 && tournament.bracket_generated_at && !showCountdownPopup && !countdownComplete) {
        // Tournament already started, skip to ready-up flow
        setCountdownComplete(true);
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
  }, [tournament?.status, tournament?.start_at, tournament?.bracket_generated_at, tournamentId]);

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

      // If tournament is in progress, load matches and check for ready-up
      if (tournamentData.status === 'in_progress') {
        await loadTournamentMatches();
        // Check for ready-up matches — either after countdown or if navigated here mid-tournament
        const startTime = new Date(tournamentData.start_at || tournamentData.start_time || '');
        const msSinceStart = Date.now() - startTime.getTime();
        if (countdownComplete || msSinceStart > 60000) {
          // Tournament started more than 60s ago or countdown done — safe to check ready-up
          setCountdownComplete(true);
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

  // Use ref to track if we've already started a countdown for a match
  const countdownStartedForRef = useRef<string | null>(null);
  const readyUpShownForRef = useRef<string | null>(null);

  const checkForReadyUpMatch = async () => {
    if (!currentUserId) return;

    try {
      // Fetch fresh matches directly from DB
      const { data: freshMatches } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId);
      
      if (!freshMatches) return;
      
      console.log('[ReadyCheck] Checking matches:', freshMatches.map((m: any) => ({
        id: m.id.substring(0, 8),
        round: m.round,
        p1: m.player1_id?.substring(0, 8),
        p2: m.player2_id?.substring(0, 8),
        status: m.status,
        room: m.match_room_id?.substring(0, 8),
      })));

      // Find any match where:
      // 1. I'm a participant
      // 2. Both players are set
      // 3. Match hasn't started yet (no match_room_id)
      // 4. Not completed/cancelled
      const myNextMatch = freshMatches.find((m: any) => {
        const isParticipant = m.player1_id === currentUserId || m.player2_id === currentUserId;
        const bothPlayersSet = m.player1_id && m.player2_id;
        const notStarted = !m.match_room_id;
        const notDone = !['completed', 'cancelled', 'forfeited', 'bye', 'in_game'].includes(m.status);
        return isParticipant && bothPlayersSet && notStarted && notDone;
      });

      // Also check for in-progress matches to redirect to
      const myLiveMatch = freshMatches.find((m: any) => {
        const isParticipant = m.player1_id === currentUserId || m.player2_id === currentUserId;
        return isParticipant && m.match_room_id && ['in_game', 'in_progress'].includes(m.status);
      });

      if (myLiveMatch) {
        console.log('[ReadyCheck] Found live match, redirecting:', myLiveMatch.id);
        router.push(`/app/play/quick-match/match/${myLiveMatch.match_room_id}?tournamentMatch=${myLiveMatch.id}&tournamentId=${tournamentId}`);
        return;
      }

      if (myNextMatch) {
        console.log('[ReadyCheck] Found next match:', myNextMatch.id, 'round:', myNextMatch.round, 'status:', myNextMatch.status);
        
        // Update status to 'ready' if it's still pending
        if (myNextMatch.status === 'pending') {
          await supabase.from('tournament_matches').update({ status: 'ready' }).eq('id', myNextMatch.id);
        }

        // If we already started countdown for this match, don't restart
        if (countdownStartedForRef.current === myNextMatch.id) return;
        // If we already showed ready-up for this match, don't show again
        if (readyUpShownForRef.current === myNextMatch.id) return;

        // Round 1: 60s countdown. Later rounds: 10s (players already waiting)
        const countdownDuration = myNextMatch.round <= 1 ? 60 : 10;
        console.log(`🎯 Starting ${countdownDuration}s countdown for match:`, myNextMatch.id, 'round:', myNextMatch.round);
        countdownStartedForRef.current = myNextMatch.id;
        setNextRoundMatchId(myNextMatch.id);
        setNextRoundTotal(countdownDuration);
        setNextRoundCountdown(countdownDuration);
        
        if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current);
        let remaining = countdownDuration;
        nextRoundTimerRef.current = setInterval(() => {
          remaining--;
          setNextRoundCountdown(remaining);
          if (remaining <= 0) {
            if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current);
            nextRoundTimerRef.current = null;
            setNextRoundCountdown(null);
            // Show 3-minute ready-up modal
            readyUpShownForRef.current = myNextMatch.id;
            setCurrentMatchId(myNextMatch.id);
            setShowReadyUpModal(true);
          }
        }, 1000);
      }
    } catch (error) {
      console.error('[ReadyCheck] Error:', error);
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
      {/* Compact Sticky Header */}
      <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/app/tournaments')}
              className="text-slate-400 hover:text-white px-2"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1 min-w-0 text-center">
              <h1 className="text-base sm:text-lg font-bold text-white truncate">{tournament.name}</h1>
              <div className="flex items-center justify-center gap-1.5 text-[11px] sm:text-xs text-slate-400">
                <span>{tournament.game_mode}</span>
                <span className="text-slate-600">&middot;</span>
                <span>BO{tournament.legs_per_match}</span>
                <span className="text-slate-600">&middot;</span>
                <span>{participants.length}/{tournament.max_participants}</span>
                <span className="text-slate-600">&middot;</span>
                <Badge
                  className={`${statusInfo.color} text-[10px] font-medium border px-1.5 py-0 h-4 ${'pulse' in statusInfo && statusInfo.pulse ? 'animate-pulse' : ''}`}
                >
                  {statusInfo.label}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white px-2">
                <Share2 className="w-4 h-4" />
              </Button>
              {isCreator && (
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white px-2">
                  <Settings className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 py-3 sm:py-6 space-y-3 sm:space-y-6">

        {/* Join / Status Bar */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="bg-slate-900/60 border-white/10">
            <CardContent className="p-3 sm:p-4">
              {!isRegistered ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-white">{participants.length}/{tournament.max_participants} players</div>
                      {tournament.start_at && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(tournament.start_at)}
                        </span>
                      )}
                    </div>
                    <Progress value={getRegistrationProgress()} className="h-1.5 bg-slate-800 mt-1.5" />
                  </div>
                  <Button
                    onClick={handleJoinTournament}
                    disabled={(() => {
                      const now = new Date();
                      const startTime = tournament.start_at ? new Date(tournament.start_at) : null;
                      const isBeforeStartTime = startTime ? now < startTime : true;
                      const canJoin = isBeforeStartTime && ['registration', 'scheduled', 'checkin'].includes(tournament.status);
                      return joinLoading || participants.length >= tournament.max_participants || !canJoin || justJoined;
                    })()}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 shrink-0"
                  >
                    {joinLoading ? (
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                    ) : justJoined ? (
                      <><CheckCircle className="w-3.5 h-3.5 mr-1" /> Joining...</>
                    ) : (
                      <><UserPlus className="w-3.5 h-3.5 mr-1" /> Join</>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-white">Registered</span>
                    <span className="text-xs text-slate-400 ml-2">
                      {tournament.status === 'registration' && 'Waiting for start'}
                      {tournament.status === 'ready' && 'Starting soon!'}
                      {tournament.status === 'in_progress' && 'Good luck!'}
                      {tournament.status === 'completed' && 'Finished'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">{participants.length}/{tournament.max_participants}</div>
                  {tournament.status === 'in_progress' && (
                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3">
                      <PlayCircle className="w-3.5 h-3.5 mr-1" /> Matches
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Tabs */}
        <Tabs defaultValue={tournament.status === 'in_progress' || tournament.status === 'completed' ? 'bracket' : 'overview'} className="space-y-3 sm:space-y-6">
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-white/10 p-1.5">
            <TabsList className="grid w-full grid-cols-3 bg-transparent gap-1">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-lg py-2 px-2 text-xs sm:text-sm font-medium transition-all"
              >
                <Target className="w-3.5 h-3.5 mr-1 sm:mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="players"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-lg py-2 px-2 text-xs sm:text-sm font-medium transition-all"
              >
                <Users className="w-3.5 h-3.5 mr-1 sm:mr-2" />
                Players ({participants.length})
              </TabsTrigger>
              <TabsTrigger
                value="bracket"
                className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg rounded-lg py-2 px-2 text-xs sm:text-sm font-medium transition-all"
              >
                <Trophy className="w-3.5 h-3.5 mr-1 sm:mr-2" />
                Bracket
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-3 sm:space-y-4">
            {/* Description */}
            {tournament.description && (
              <Card className="bg-slate-900/60 border-white/10">
                <CardContent className="p-3 sm:p-5">
                  <p className="text-sm text-slate-300 leading-relaxed">{tournament.description}</p>
                </CardContent>
              </Card>
            )}

            {/* Rules & Format - compact 2-col */}
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              <Card className="bg-slate-900/60 border-white/10">
                <CardContent className="p-3 sm:p-4">
                  <h4 className="text-xs font-semibold text-white flex items-center gap-1.5 mb-2">
                    <Trophy className="w-3 h-3 text-emerald-400" />
                    Rules
                  </h4>
                  <ul className="space-y-1 text-[11px] sm:text-xs text-slate-400">
                    <li>{tournament.game_mode} start</li>
                    <li>BO{tournament.legs_per_match} legs</li>
                    <li>Double out</li>
                    <li>Single elim</li>
                  </ul>
                </CardContent>
              </Card>
              <Card className="bg-slate-900/60 border-white/10">
                <CardContent className="p-3 sm:p-4">
                  <h4 className="text-xs font-semibold text-white flex items-center gap-1.5 mb-2">
                    <Users className="w-3 h-3 text-blue-400" />
                    Format
                  </h4>
                  <ul className="space-y-1 text-[11px] sm:text-xs text-slate-400">
                    <li>{tournament.max_participants} players max</li>
                    <li>{tournament.entry_type === 'open' ? 'Open entry' : 'Invite only'}</li>
                    <li>{tournament.round_scheduling === 'multiDay' ? 'Multi-day' : 'Single day'}</li>
                    <li>Real-time</li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Recent Activity */}
            <Card className="bg-slate-900/50 border-white/10">
              <CardContent className="p-3 sm:p-5">
                <h4 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">Recent Activity</h4>
                <div className="space-y-2">
                  {participants.slice(-5).reverse().map((participant, index) => (
                    <motion.div
                      key={participant.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center gap-2 text-xs"
                    >
                      <Avatar className="w-6 h-6">
                        <AvatarFallback className="bg-slate-700 text-slate-300 text-[10px]">
                          {participant.profiles?.username?.[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-white font-medium">{participant.profiles?.username || 'Unknown'}</span>
                      <span className="text-slate-500">joined</span>
                      <span className="text-slate-600 ml-auto text-[10px]">
                        {new Date(participant.joined_at).toLocaleDateString()}
                      </span>
                    </motion.div>
                  ))}
                  {participants.length === 0 && (
                    <p className="text-slate-500 text-center text-xs py-3">No players yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Players Tab */}
          <TabsContent value="players">
            <Card className="bg-slate-900/60 border-white/10">
              <CardContent className="p-3 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-slate-400">{participants.length} of {tournament.max_participants} registered</div>
                  {isCreator && tournament.status === 'registration' && (
                    <Button onClick={() => setShowInviteModal(true)} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 h-7">
                      <UserPlus className="w-3 h-3 mr-1" /> Invite
                    </Button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {participants.map((participant, index) => (
                    <motion.div
                      key={participant.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.03 }}
                      className="flex items-center gap-2.5 p-2 bg-slate-800/30 rounded-lg border border-slate-700/30"
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="bg-slate-700 text-white text-xs font-semibold">
                          {participant.profiles?.username?.[0]?.toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium truncate">
                          {participant.profiles?.username || 'Unknown Player'}
                        </div>
                      </div>
                      {participant.role === 'admin' && (
                        <Crown className="w-3.5 h-3.5 text-yellow-400" />
                      )}
                    </motion.div>
                  ))}
                </div>
                {participants.length === 0 && (
                  <div className="text-center py-6">
                    <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-500 text-xs">No players registered yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bracket Tab */}
          <TabsContent value="bracket">
            <Card className="bg-slate-900/50 border-white/10">
              <CardContent className="p-3 sm:p-5">
                {tournament.bracket_generated_at ? (
                  <TournamentBracketTab tournamentId={tournamentId} />
                ) : (
                  <div className="text-center py-8">
                    <Trophy className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                    <h3 className="text-sm font-semibold text-slate-300 mb-1">Bracket Not Generated</h3>
                    <p className="text-xs text-slate-500">
                      Will be created when the tournament starts.
                      {tournament.status === 'registration' && ` (${participants.length}/${tournament.max_participants} registered)`}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
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
            onComplete={async () => {
              setShowCountdownPopup(false);
              setCountdownComplete(true);
              
              // Reload matches then start the 1-minute countdown flow
              await loadTournament();
              await loadTournamentMatches();
              // checkForReadyUpMatch will detect the match and start the 1-min countdown
              // which then triggers the 3-min ready-up
              await checkForReadyUpMatch();
            }}
          />
        )}

        {/* Next Round Countdown Banner */}
        {nextRoundCountdown !== null && nextRoundCountdown > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
            <div className="max-w-lg mx-auto bg-gradient-to-r from-amber-500/90 to-orange-500/90 backdrop-blur-sm rounded-xl border border-amber-400/30 p-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <Swords className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">Next Round Starting Soon!</p>
                    <p className="text-white/80 text-xs">Both players are ready — get prepared</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-black text-white tabular-nums">
                    {Math.floor(nextRoundCountdown / 60)}:{(nextRoundCountdown % 60).toString().padStart(2, '0')}
                  </div>
                </div>
              </div>
              {/* Progress bar */}
              <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white rounded-full transition-all duration-1000"
                  style={{ width: `${((nextRoundTotal - nextRoundCountdown) / nextRoundTotal) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tournament Ready-Up Modal */}
        {showReadyUpModal && currentMatchId && (
          <TournamentReadyUpModal
            matchId={currentMatchId}
            tournamentId={tournamentId}
            currentUserId={currentUserId || ''}
            onBothReady={async (roomId) => {
              setShowReadyUpModal(false);
              router.push(`/app/play/quick-match/match/${roomId}?tournamentMatch=${currentMatchId}&tournamentId=${tournamentId}`);
            }}
            onTimeout={async (iReadied: boolean, opponentReadied: boolean) => {
              setShowReadyUpModal(false);
              
              if (iReadied && !opponentReadied) {
                // I readied, opponent didn't → I win by forfeit
                try {
                  // Get the match to find opponent
                  const { data: match } = await supabase
                    .from('tournament_matches')
                    .select('player1_id, player2_id')
                    .eq('id', currentMatchId)
                    .single();
                  
                  if (match) {
                    // Set winner to the player who readied up
                    await supabase
                      .from('tournament_matches')
                      .update({ 
                        winner_id: currentUserId, 
                        status: 'completed',
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', currentMatchId);

                    // Progress the bracket
                    try {
                      await supabase.rpc('progress_tournament_bracket', {
                        p_match_id: currentMatchId,
                        p_winner_id: currentUserId,
                      });
                    } catch {}
                    
                    toast.success('🏆 You win! Opponent failed to ready up.');
                  }
                } catch (err) {
                  console.error('Error forfeiting match:', err);
                }
              } else if (!iReadied && opponentReadied) {
                // Opponent readied, I didn't → opponent wins
                try {
                  const { data: match } = await supabase
                    .from('tournament_matches')
                    .select('player1_id, player2_id')
                    .eq('id', currentMatchId)
                    .single();
                  
                  if (match) {
                    const opponentId = match.player1_id === currentUserId ? match.player2_id : match.player1_id;
                    await supabase
                      .from('tournament_matches')
                      .update({ 
                        winner_id: opponentId, 
                        status: 'completed',
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', currentMatchId);

                    try {
                      await supabase.rpc('progress_tournament_bracket', {
                        p_match_id: currentMatchId,
                        p_winner_id: opponentId,
                      });
                    } catch {}
                    
                    toast.error('You were eliminated — failed to ready up in time.');
                  }
                } catch (err) {
                  console.error('Error forfeiting match:', err);
                }
              } else {
                // Neither readied — both forfeit, cancel the match
                try {
                  await supabase
                    .from('tournament_matches')
                    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                    .eq('id', currentMatchId);
                  toast.error('Match cancelled — neither player readied up.');
                } catch {}
              }
              
              loadTournament();
            }}
          />
        )}
      </div>
    </div>
  );
}