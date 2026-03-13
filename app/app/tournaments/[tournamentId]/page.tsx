'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  X,
  Shield,
  Zap,
  Award,
  ChevronRight,
  CircleDot,
  Flame,
  Hash,
  Medal,
  Sparkles,
  TrendingUp
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
  const searchParams = useSearchParams();
  const skipCountdown = searchParams.get('skipCountdown') === '1';
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

    // Real-time: update player list when someone joins/leaves
    const participantChannel = supabase
      .channel(`tournament_participants_${tournamentId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tournament_participants',
        filter: `tournament_id=eq.${tournamentId}`
      }, () => {
        console.log('[Tournament] Participant change detected via realtime');
        loadTournament(true);
      })
      .subscribe();

    return () => {
      if (nextRoundTimerRef.current) clearInterval(nextRoundTimerRef.current);
      supabase.removeChannel(participantChannel);
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

        // Generate bracket and start tournament
        try {
          // Try the combined RPC first
          const { data: result, error: rpcErr } = await supabase.rpc('complete_tournament_flow_progression', {
            p_tournament_id: tournamentId
          });
          console.log('Tournament progression result:', result, rpcErr?.message);

          if (result?.action === 'tournament_cancelled') {
            toast.error('Tournament cancelled - not enough players');
            setShowCountdownPopup(false);
            loadTournament();
            return;
          }

          // If RPC failed or bracket still not generated, call individual RPCs directly
          const { data: tCheck } = await supabase
            .from('tournaments')
            .select('bracket_generated_at')
            .eq('id', tournamentId)
            .single();

          if (!tCheck?.bracket_generated_at) {
            console.log('Bracket not generated, calling individual RPCs');
            const { error: bracketErr } = await supabase.rpc('generate_tournament_bracket', { p_tournament_id: tournamentId });
            if (bracketErr) console.log('generate_tournament_bracket error:', bracketErr.message);
            const { error: startErr } = await supabase.rpc('start_tournament_round_one', { p_tournament_id: tournamentId });
            if (startErr) console.log('start_tournament_round_one error:', startErr.message);
            // Also set status to in_progress
            await supabase.from('tournaments').update({ status: 'in_progress' }).eq('id', tournamentId);
          }
          
          toast.success('Tournament is LIVE! Bracket generated!');
        } catch (err: any) {
          console.log('Progression error:', err?.message);
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
      let userIsCreator = currentUserId === tournamentData.created_by;
      // Fallback: check if user is admin participant
      if (!userIsCreator && currentUserId) {
        const { data: adminCheck } = await supabase
          .from('tournament_participants')
          .select('role')
          .eq('tournament_id', tournamentId)
          .eq('user_id', currentUserId)
          .eq('role', 'admin')
          .maybeSingle();
        if (adminCheck) userIsCreator = true;
      }
      setIsCreator(userIsCreator);
      
      // If user is the creator, they should be automatically registered
      if (userIsCreator && !justJoined) {
        setIsRegistered(true);
        
        // Ensure creator is registered in the database
        try {
          const { error: regError } = await supabase
            .from('tournament_participants')
            .upsert({
              tournament_id: tournamentId,
              user_id: currentUserId,
              role: 'admin',
              joined_at: new Date().toISOString()
            }, { onConflict: 'tournament_id,user_id' });
          if (regError) console.log('Creator auto-register:', regError.message);
        } catch (error) {
          console.log('Creator auto-register fallback failed:', error);
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
        countdownStartedForRef.current = myNextMatch.id;

        if (skipCountdown) {
          // Already counted down from dashboard/global monitor — go straight to ready-up
          console.log('Skipping countdown (came from global monitor)');
          readyUpShownForRef.current = myNextMatch.id;
          setCurrentMatchId(myNextMatch.id);
          setShowReadyUpModal(true);
        } else {
          const countdownDuration = 60;
          console.log(`Starting ${countdownDuration}s countdown for match:`, myNextMatch.id, 'round:', myNextMatch.round);
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
              readyUpShownForRef.current = myNextMatch.id;
              setCurrentMatchId(myNextMatch.id);
              setShowReadyUpModal(true);
            }
          }, 1000);
        }
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

  const handleDeleteTournament = async () => {
    if (!confirm('Are you sure you want to delete this tournament?')) return;
    try {
      await supabase.from('tournament_participants').delete().eq('tournament_id', tournamentId);
      await supabase.from('tournaments').delete().eq('id', tournamentId);
      toast.success('Tournament deleted');
      router.push('/app/tournaments');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete tournament');
    }
  };

  const canDeleteTournament = isCreator && tournament?.start_at && 
    (new Date(tournament.start_at).getTime() - Date.now()) > 24 * 60 * 60 * 1000;

  const handleUnregister = async () => {
    if (!currentUserId) return;
    try {
      const { error } = await supabase
        .from('tournament_participants')
        .delete()
        .eq('tournament_id', tournamentId)
        .eq('user_id', currentUserId);
      if (error) throw error;
      toast.success('Unregistered from tournament');
      setIsRegistered(false);
      setJustJoined(false);
      await loadTournament(true);
    } catch (err: any) {
      toast.error(err.message || 'Failed to unregister');
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
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        {/* Skeleton Hero */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 via-transparent to-blue-900/20" />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
            <div className="animate-pulse space-y-6">
              <div className="flex items-center gap-2">
                <div className="h-4 bg-slate-700/50 rounded w-20" />
                <div className="h-4 bg-slate-700/50 rounded w-4" />
                <div className="h-4 bg-slate-700/50 rounded w-32" />
              </div>
              <div className="flex items-center gap-5">
                <div className="w-20 h-20 bg-slate-700/50 rounded-2xl" />
                <div className="space-y-3 flex-1">
                  <div className="h-9 bg-slate-700/50 rounded-lg w-64" />
                  <div className="h-5 bg-slate-700/50 rounded w-80" />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                {[1,2,3,4].map(i => (
                  <div key={i} className="h-24 bg-slate-800/50 rounded-2xl border border-white/5" />
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Skeleton Content */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="animate-pulse space-y-6">
            <div className="h-14 bg-slate-800/50 rounded-2xl" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="h-72 bg-slate-800/40 rounded-2xl border border-white/5" />
                <div className="h-48 bg-slate-800/40 rounded-2xl border border-white/5" />
              </div>
              <div className="h-80 bg-slate-800/40 rounded-2xl border border-white/5" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md"
        >
          <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-red-500/20">
            <AlertCircle className="w-10 h-10 text-red-400" />
          </div>
          <h2 className="text-3xl font-black text-white mb-3">Tournament Not Found</h2>
          <p className="text-slate-400 mb-8 leading-relaxed">The tournament you're looking for doesn't exist or has been removed.</p>
          <Button onClick={() => router.push('/app/tournaments')} className="bg-slate-800 hover:bg-slate-700 text-white border border-white/10 px-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tournaments
          </Button>
        </motion.div>
      </div>
    );
  }

  const statusInfo = statusConfig[tournament.status as keyof typeof statusConfig] || statusConfig.registration;
  const StatusIcon = statusInfo.icon;

  // Compute total rounds for bracket display
  const totalRounds = tournament.max_participants > 1 ? Math.ceil(Math.log2(tournament.max_participants)) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">

      {/* ═══════════════════════════════════════════════════════════════
          HERO BANNER - Premium gradient header with decorative elements
          ═══════════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden">
        {/* Decorative background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/30 via-slate-900/0 to-blue-900/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

        {/* Breadcrumb nav */}
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-2">
          <nav className="flex items-center gap-1.5 text-sm">
            <button
              onClick={() => router.push('/app/tournaments')}
              className="text-slate-500 hover:text-emerald-400 transition-colors font-medium flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Tournaments
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-slate-300 font-medium truncate max-w-[200px]">{tournament.name}</span>
          </nav>
        </div>

        {/* Main Hero Content */}
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-6"
          >
            {/* Tournament Title Row */}
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
              <div className="flex items-start gap-5">
                {/* Trophy Icon */}
                <div className="relative flex-shrink-0">
                  <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 via-emerald-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-xl shadow-emerald-500/20 ring-1 ring-white/10">
                    <Trophy className="w-10 h-10 text-white drop-shadow-lg" />
                  </div>
                  {tournament.status === 'in_progress' && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center ring-2 ring-slate-950">
                      <Flame className="w-3 h-3 text-white animate-pulse" />
                    </div>
                  )}
                  {tournament.status === 'completed' && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center ring-2 ring-slate-950">
                      <Crown className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                      {tournament.name}
                    </h1>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400 mt-2 text-sm">
                      <span className="flex items-center gap-1.5">
                        <CircleDot className="w-3.5 h-3.5 text-emerald-400" />
                        {tournament.game_mode}
                      </span>
                      <span className="text-slate-600">|</span>
                      <span>BO{tournament.legs_per_match}</span>
                      <span className="text-slate-600">|</span>
                      <span>{tournament.max_participants} Players</span>
                      <span className="text-slate-600">|</span>
                      <span>Single Elim</span>
                    </div>
                  </div>

                  {/* Status + Date Row */}
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge
                      className={`${statusInfo.color} text-sm font-semibold border px-3.5 py-1.5 shadow-sm ${'pulse' in statusInfo && statusInfo.pulse ? 'animate-pulse' : ''}`}
                    >
                      <StatusIcon className="w-4 h-4 mr-1.5" />
                      {statusInfo.label}
                    </Badge>

                    {tournament.start_at && (
                      <div className="flex items-center gap-1.5 text-slate-400 text-sm">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDate(tournament.start_at)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
                {isCreator && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push(`/app/tournaments/${tournamentId}/manage`)}
                    className="bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-all"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Manage
                  </Button>
                )}
                {canDeleteTournament && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteTournament}
                    className="bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                )}
                {/* Join/Joined button in hero */}
                {isRegistered && ['registration', 'scheduled', 'checkin'].includes(tournament.status) ? (
                  <Button
                    disabled
                    className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Joined
                  </Button>
                ) : !isRegistered && ['registration', 'scheduled', 'checkin'].includes(tournament.status) ? (
                  <Button
                    onClick={handleJoinTournament}
                    disabled={joinLoading || participants.length >= tournament.max_participants}
                    className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold shadow-lg shadow-emerald-500/25 transition-all"
                  >
                    {joinLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Joining...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Join Tournament
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Bottom border glow */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          STATS ROW - Four premium stat cards
          ═══════════════════════════════════════════════════════════════ */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 -mt-1 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4"
        >
          {/* Players */}
          <div className="group bg-slate-900/70 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-emerald-500/20 transition-all duration-300">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-emerald-500/15 rounded-xl flex items-center justify-center group-hover:bg-emerald-500/25 transition-colors">
                <Users className="w-4.5 h-4.5 text-emerald-400" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Players</span>
            </div>
            <div className="text-2xl font-black text-white">{participants.length}<span className="text-slate-500 text-lg font-medium">/{tournament.max_participants}</span></div>
            <div className="mt-2.5">
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${getRegistrationProgress()}%` }}
                  transition={{ duration: 1, delay: 0.3 }}
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                />
              </div>
            </div>
          </div>

          {/* Format */}
          <div className="group bg-slate-900/70 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-blue-500/20 transition-all duration-300">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-blue-500/15 rounded-xl flex items-center justify-center group-hover:bg-blue-500/25 transition-colors">
                <Target className="w-4.5 h-4.5 text-blue-400" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Format</span>
            </div>
            <div className="text-2xl font-black text-white">BO{tournament.legs_per_match}</div>
            <div className="text-xs text-slate-500 mt-1">{tournament.game_mode} · {tournament.round_scheduling === 'multiDay' ? 'Multi-Day' : 'Single Day'}</div>
          </div>

          {/* Rounds */}
          <div className="group bg-slate-900/70 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-purple-500/20 transition-all duration-300">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 bg-purple-500/15 rounded-xl flex items-center justify-center group-hover:bg-purple-500/25 transition-colors">
                <Zap className="w-4.5 h-4.5 text-purple-400" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Rounds</span>
            </div>
            <div className="text-2xl font-black text-white">{totalRounds}</div>
            <div className="text-xs text-slate-500 mt-1">Single Elimination</div>
          </div>

          {/* Status */}
          <div className="group bg-slate-900/70 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-4 sm:p-5 hover:border-amber-500/20 transition-all duration-300">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                tournament.status === 'in_progress' ? 'bg-red-500/15 group-hover:bg-red-500/25' :
                tournament.status === 'completed' ? 'bg-amber-500/15 group-hover:bg-amber-500/25' :
                'bg-emerald-500/15 group-hover:bg-emerald-500/25'
              }`}>
                {tournament.status === 'in_progress' ? <Flame className="w-4.5 h-4.5 text-red-400" /> :
                 tournament.status === 'completed' ? <Crown className="w-4.5 h-4.5 text-amber-400" /> :
                 <Clock className="w-4.5 h-4.5 text-emerald-400" />}
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</span>
            </div>
            <div className={`text-2xl font-black ${
              tournament.status === 'in_progress' ? 'text-red-400' :
              tournament.status === 'completed' ? 'text-amber-400' : 'text-white'
            }`}>
              {(() => {
                const now = new Date();
                const startTime = tournament.start_at ? new Date(tournament.start_at) : null;
                const isBeforeStartTime = startTime ? now < startTime : true;
                if (isBeforeStartTime && ['registration', 'scheduled', 'checkin'].includes(tournament.status)) return 'Open';
                if (tournament.status === 'ready') return 'Starting';
                if (tournament.status === 'in_progress') return 'LIVE';
                if (tournament.status === 'cancelled') return 'Cancelled';
                if (tournament.status === 'completed') return 'Complete';
                if (!isBeforeStartTime && ['registration', 'scheduled', 'checkin'].includes(tournament.status)) return 'Processing';
                return 'Complete';
              })()}
            </div>
            <div className="text-xs text-slate-500 mt-1">{tournament.entry_type === 'open' ? 'Open Entry' : 'Invite Only'}</div>
          </div>
        </motion.div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          MAIN CONTENT - Tabs + Sidebar
          ═══════════════════════════════════════════════════════════════ */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
          {/* Left Column - Tabbed Content */}
          <div className="lg:col-span-3">
            <Tabs defaultValue={tournament.status === 'in_progress' || tournament.status === 'completed' ? 'bracket' : 'overview'} className="space-y-6">
              {/* Tab Navigation */}
              <div className="bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-white/[0.06] p-1.5">
                <TabsList className="grid w-full grid-cols-3 bg-transparent gap-1">
                  <TabsTrigger
                    value="overview"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-emerald-500/20 data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-200 data-[state=inactive]:hover:bg-white/5 rounded-xl py-3 font-semibold text-sm transition-all duration-200"
                  >
                    <Target className="w-4 h-4 mr-2" />
                    Overview
                  </TabsTrigger>
                  <TabsTrigger
                    value="players"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-blue-500/20 data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-200 data-[state=inactive]:hover:bg-white/5 rounded-xl py-3 font-semibold text-sm transition-all duration-200"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Players ({participants.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="bracket"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20 data-[state=inactive]:text-slate-400 data-[state=inactive]:hover:text-slate-200 data-[state=inactive]:hover:bg-white/5 rounded-xl py-3 font-semibold text-sm transition-all duration-200"
                  >
                    <Trophy className="w-4 h-4 mr-2" />
                    Bracket
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ─── Overview Tab ─── */}
              <TabsContent value="overview" className="space-y-6">
                {/* Description */}
                <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="px-6 py-5 border-b border-white/[0.04]">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-emerald-500/15 rounded-lg flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                      </div>
                      About This Tournament
                    </h3>
                  </div>
                  <div className="p-6">
                    {tournament.description ? (
                      <div className="relative pl-4 border-l-2 border-emerald-500/30">
                        <p className="text-slate-300 leading-relaxed text-[15px]">{tournament.description}</p>
                      </div>
                    ) : (
                      <p className="text-slate-500 italic text-sm">No description provided for this tournament.</p>
                    )}
                  </div>
                </div>

                {/* Rules & Format Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Rules */}
                  <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/[0.04] flex items-center gap-2.5">
                      <div className="w-7 h-7 bg-emerald-500/15 rounded-lg flex items-center justify-center">
                        <Shield className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <h4 className="font-bold text-white text-sm">Rules</h4>
                    </div>
                    <div className="p-5 space-y-3">
                      {[
                        { icon: CircleDot, label: `${tournament.game_mode} start`, color: 'emerald' },
                        { icon: Target, label: `Best of ${tournament.legs_per_match} legs`, color: 'emerald' },
                        { icon: Shield, label: 'Double out required', color: 'emerald' },
                        { icon: Zap, label: 'Single elimination', color: 'emerald' },
                      ].map((rule, i) => (
                        <div key={i} className="flex items-center gap-3 group">
                          <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                            <rule.icon className="w-4 h-4 text-emerald-400" />
                          </div>
                          <span className="text-sm text-slate-300 font-medium">{rule.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Format */}
                  <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/[0.04] flex items-center gap-2.5">
                      <div className="w-7 h-7 bg-blue-500/15 rounded-lg flex items-center justify-center">
                        <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <h4 className="font-bold text-white text-sm">Format</h4>
                    </div>
                    <div className="p-5 space-y-3">
                      {[
                        { icon: Users, label: `${tournament.max_participants} players max`, color: 'blue' },
                        { icon: tournament.entry_type === 'open' ? Users : Shield, label: tournament.entry_type === 'open' ? 'Open registration' : 'Invite only', color: 'blue' },
                        { icon: Calendar, label: `${tournament.round_scheduling === 'multiDay' ? 'Multi-day' : 'Single day'} event`, color: 'blue' },
                        { icon: Zap, label: 'Real-time matches', color: 'blue' },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center gap-3 group">
                          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                            <item.icon className="w-4 h-4 text-blue-400" />
                          </div>
                          <span className="text-sm text-slate-300 font-medium">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="px-6 py-5 border-b border-white/[0.04]">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-purple-500/15 rounded-lg flex items-center justify-center">
                        <Clock className="w-4 h-4 text-purple-400" />
                      </div>
                      Recent Activity
                    </h3>
                  </div>
                  <div className="p-6">
                    {participants.length > 0 ? (
                      <div className="space-y-1">
                        {participants.slice(-6).reverse().map((participant, index) => (
                          <motion.div
                            key={participant.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.06 }}
                            className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-white/[0.02] transition-colors group"
                          >
                            <div className="relative">
                              <Avatar className="w-9 h-9 ring-2 ring-slate-800">
                                {participant.profiles?.avatar_url && (
                                  <AvatarImage src={participant.profiles.avatar_url} alt={participant.profiles?.username || ''} />
                                )}
                                <AvatarFallback className="bg-gradient-to-br from-slate-700 to-slate-800 text-slate-200 text-sm font-bold">
                                  {participant.profiles?.username?.[0]?.toUpperCase() || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full ring-2 ring-slate-900 flex items-center justify-center">
                                <CheckCircle className="w-2 h-2 text-white" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-white font-semibold text-sm group-hover:text-emerald-400 transition-colors">
                                {participant.profiles?.username || 'Unknown Player'}
                              </span>
                              <span className="text-slate-500 text-sm"> joined</span>
                            </div>
                            <span className="text-[11px] text-slate-600 font-medium tabular-nums">
                              {new Date(participant.joined_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="w-14 h-14 bg-slate-800/50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                          <Users className="w-7 h-7 text-slate-600" />
                        </div>
                        <p className="text-slate-500 text-sm font-medium">No players have joined yet</p>
                        <p className="text-slate-600 text-xs mt-1">Be the first to register!</p>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ─── Players Tab ─── */}
              <TabsContent value="players" className="space-y-6">
                <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="px-6 py-5 border-b border-white/[0.04] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-500/15 rounded-lg flex items-center justify-center">
                        <Users className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">Players</h3>
                        <p className="text-xs text-slate-500">{participants.length} of {tournament.max_participants} registered</p>
                      </div>
                    </div>
                    {isCreator && tournament.status === 'registration' && (
                      <Button
                        onClick={() => setShowInviteModal(true)}
                        size="sm"
                        className="bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold shadow-lg shadow-emerald-500/20"
                      >
                        <UserPlus className="w-4 h-4 mr-2" />
                        Invite
                      </Button>
                    )}
                  </div>
                  <div className="p-5">
                    {participants.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {participants.map((participant, index) => (
                          <motion.div
                            key={participant.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.04 }}
                            className="flex items-center gap-3.5 p-3.5 bg-slate-800/30 rounded-xl border border-white/[0.04] hover:border-white/[0.08] hover:bg-slate-800/50 transition-all group"
                          >
                            {/* Player Number */}
                            <div className="w-7 h-7 bg-slate-700/50 rounded-lg flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-slate-400 tabular-nums">{index + 1}</span>
                            </div>
                            {/* Avatar */}
                            <Avatar className="w-10 h-10 ring-2 ring-slate-700/50 group-hover:ring-emerald-500/30 transition-all">
                              {participant.profiles?.avatar_url && (
                                <AvatarImage src={participant.profiles.avatar_url} alt={participant.profiles?.username || ''} />
                              )}
                              <AvatarFallback className="bg-gradient-to-br from-slate-700 to-slate-800 text-white font-bold">
                                {participant.profiles?.username?.[0]?.toUpperCase() || 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="text-white font-semibold text-sm truncate group-hover:text-emerald-400 transition-colors">
                                {participant.profiles?.username || 'Unknown Player'}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Joined {new Date(participant.joined_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                              </div>
                            </div>
                            {participant.role === 'admin' && (
                              <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/20">
                                <Crown className="w-3 h-3 text-amber-400" />
                                <span className="text-[10px] font-bold text-amber-400 uppercase">Host</span>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                          <Users className="w-8 h-8 text-slate-600" />
                        </div>
                        <p className="text-slate-400 font-medium">No players registered yet</p>
                        <p className="text-slate-600 text-sm mt-1">Share the tournament to get players!</p>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* ─── Bracket Tab ─── */}
              <TabsContent value="bracket">
                <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden">
                  <div className="px-6 py-5 border-b border-white/[0.04]">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-purple-500/15 rounded-lg flex items-center justify-center">
                        <Trophy className="w-4 h-4 text-purple-400" />
                      </div>
                      Tournament Bracket
                    </h3>
                    <p className="text-sm text-slate-500 mt-1 ml-[42px]">
                      {tournament.bracket_generated_at
                        ? 'Click on matches for details'
                        : 'Bracket generates when the tournament starts'
                      }
                    </p>
                  </div>
                  <div className="p-6">
                    {tournament.bracket_generated_at ? (
                      <TournamentBracketTab tournamentId={tournamentId} />
                    ) : (
                      <div className="text-center py-16">
                        <div className="relative inline-block mb-6">
                          <div className="w-20 h-20 bg-slate-800/60 rounded-3xl flex items-center justify-center border border-white/[0.04]">
                            <Trophy className="w-10 h-10 text-slate-600" />
                          </div>
                          <div className="absolute -top-2 -right-2 w-8 h-8 bg-slate-800/80 rounded-xl flex items-center justify-center border border-white/[0.06]">
                            <Clock className="w-4 h-4 text-slate-500" />
                          </div>
                        </div>
                        <h3 className="text-lg font-bold text-slate-300 mb-2">Bracket Not Yet Generated</h3>
                        <p className="text-slate-500 text-sm max-w-md mx-auto mb-4">
                          The tournament bracket will be created automatically when the tournament begins.
                        </p>
                        {tournament.status === 'registration' && (
                          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/40 rounded-full border border-white/[0.04] text-xs text-slate-400">
                            <Users className="w-3.5 h-3.5" />
                            <span>{participants.length}/{tournament.max_participants} players registered</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* ─── Right Sidebar ─── */}
          <div className="space-y-4">
            {/* Registration / Status Card */}
            <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl overflow-hidden sticky top-4">
              <div className="p-5">
                {!isRegistered ? (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-emerald-500/20">
                        <UserPlus className="w-6 h-6 text-emerald-400" />
                      </div>
                      <h3 className="text-lg font-bold text-white mb-1">Join Tournament</h3>
                      <p className="text-sm text-slate-500">
                        {participants.length === tournament.max_participants
                          ? 'Tournament is full'
                          : `${tournament.max_participants - participants.length} spots remaining`
                        }
                      </p>
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
                      className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3 shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {joinLoading ? (
                        <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" /> Joining...</>
                      ) : justJoined ? (
                        <><CheckCircle className="w-4 h-4 mr-2" /> Joined!</>
                      ) : (
                        <><UserPlus className="w-4 h-4 mr-2" /> Join Tournament</>
                      )}
                    </Button>

                    {tournament.entry_type === 'invite_only' && (
                      <p className="text-[11px] text-amber-400/80 text-center font-medium">
                        This tournament requires an invitation
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center space-y-3">
                    <div className="w-14 h-14 bg-emerald-500/15 rounded-2xl flex items-center justify-center mx-auto border border-emerald-500/20">
                      <CheckCircle className="w-7 h-7 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">You're In!</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {tournament.status === 'registration' && 'Waiting for the tournament to start'}
                        {tournament.status === 'ready' && 'Tournament is starting soon!'}
                        {tournament.status === 'in_progress' && 'Good luck in your matches!'}
                        {tournament.status === 'completed' && 'Tournament has ended'}
                      </p>
                    </div>
                    {tournament.status === 'in_progress' && (
                      <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-500/20">
                        <PlayCircle className="w-4 h-4 mr-2" />
                        View My Matches
                      </Button>
                    )}
                    {!isCreator && ['registration', 'scheduled', 'checkin'].includes(tournament.status) && (
                      <button
                        onClick={handleUnregister}
                        className="w-full text-xs text-slate-500 hover:text-red-400 transition-colors mt-2"
                      >
                        Unregister
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Info Card */}
            <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-5 space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Tournament Info
              </h4>
              <div className="space-y-3">
                {[
                  { label: 'Created', value: new Date(tournament.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
                  ...(tournament.started_at ? [{ label: 'Started', value: new Date(tournament.started_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }] : []),
                  { label: 'Host', value: participants.find(p => p.role === 'admin')?.profiles?.username || 'Unknown' },
                  { label: 'Entry', value: tournament.entry_type === 'open' ? 'Open' : 'Invite Only' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{item.label}</span>
                    <span className="text-slate-300 font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
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
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="max-w-lg mx-auto bg-gradient-to-r from-amber-600/95 to-orange-600/95 backdrop-blur-md rounded-2xl border border-amber-400/20 p-5 shadow-2xl shadow-amber-900/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
                    <Swords className="w-5.5 h-5.5 text-white" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">Next Round Starting!</p>
                    <p className="text-white/70 text-xs">Get ready for your match</p>
                  </div>
                </div>
                <div className="text-center bg-white/10 rounded-xl px-4 py-2">
                  <div className="text-3xl font-black text-white tabular-nums tracking-tight">
                    {Math.floor(nextRoundCountdown / 60)}:{(nextRoundCountdown % 60).toString().padStart(2, '0')}
                  </div>
                </div>
              </div>
              <div className="mt-4 h-1.5 bg-white/15 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-white/80 rounded-full"
                  style={{ width: `${((nextRoundTotal - nextRoundCountdown) / nextRoundTotal) * 100}%` }}
                  transition={{ duration: 1 }}
                />
              </div>
            </motion.div>
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