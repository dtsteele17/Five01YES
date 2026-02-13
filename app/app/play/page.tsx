'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import {
  Target,
  Users,
  Zap,
  Clock,
  Trophy,
  Shield,
  Loader2,
  X,
  GraduationCap,
  BarChart3,
} from 'lucide-react';
import { PrivateMatchModal } from '@/components/app/PrivateMatchModal';
import { MatchStatsModal } from '@/components/app/MatchStatsModal';
import { MatchErrorBoundary } from '@/components/match/MatchErrorBoundary';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTraining, BOT_DIFFICULTY_CONFIG, TrainingConfig } from '@/lib/context/TrainingContext';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  validateRoomBeforeNavigation,
  clearStaleMatchState,
} from '@/lib/utils/stale-state-cleanup';

interface RecentMatch {
  id: string;
  match_type: string;
  game_mode: string;
  match_format: string;
  player1_name: string;
  player2_name: string;
  player1_legs_won: number;
  player2_legs_won: number;
  winner_id: string | null;
  completed_at: string;
  user_id: string;
}

const MODE_LABELS: Record<string, string> = {
  'ranked': 'Ranked',
  'quick': 'Quick Match',
  'private': 'Private',
  'training': 'Training',
  'league': 'League',
  'tournament': 'Tournament',
};

// Helper to normalize Supabase RPC return shapes
function normalizePollResult(data: any): { ok: boolean; queue_id?: string; status: string; match_room_id?: string | null; matched_at?: string | null; message?: string } | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

export default function PlayPage() {
  const router = useRouter();
  const { setConfig } = useTraining();
  const [showRankedSearch, setShowRankedSearch] = useState(false);
  const [showPrivateModal, setShowPrivateModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [recentMatches, setRecentMatches] = useState<RecentMatch[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [rankedQueueId, setRankedQueueId] = useState<string | null>(null);
  const [rankedSearching, setRankedSearching] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoQueueAttempted = useRef(false);

  const [trainingMode, setTrainingMode] = useState<'301' | '501' | 'practice-games'>('501');
  const [practiceGameMode, setPracticeGameMode] = useState<'around-the-clock' | 'form-analysis' | 'finish-training' | 'pdc-challenge' | 'bobs-27' | 'jdc-challenge'>('around-the-clock');
  const [botDifficulty, setBotDifficulty] = useState<keyof typeof BOT_DIFFICULTY_CONFIG>('intermediate');
  const [doubleOut, setDoubleOut] = useState(true);
  const [bestOf, setBestOf] = useState<'best-of-1' | 'best-of-3' | 'best-of-5' | 'best-of-7'>('best-of-3');

  // Around The Clock settings
  const [atcOrderMode, setAtcOrderMode] = useState<'in_order' | 'random'>('in_order');
  const [atcSegmentRule, setAtcSegmentRule] = useState<'singles_only' | 'doubles_only' | 'trebles_only' | 'increase_by_segment'>('increase_by_segment');

  // Finish Training settings
  const [finishMin, setFinishMin] = useState<string>('');
  const [finishMax, setFinishMax] = useState<string>('');

  useEffect(() => {
    fetchRecentMatches();

    // Check for stored queue_id and resume polling if in searching state
    const storedQueueId = localStorage.getItem('ranked_queue_id');
    if (storedQueueId) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Play/Ranked] Resuming polling with stored queueId:', storedQueueId);
      }
      setRankedQueueId(storedQueueId);
      setRankedSearching(true);
      setShowRankedSearch(true);
      startPolling(storedQueueId);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('queue') === 'ranked' && !autoQueueAttempted.current) {
      autoQueueAttempted.current = true;
      router.replace('/app/play');
      setTimeout(() => {
        startRankedSearch();
      }, 500);
    }

    return () => {
      stopPolling();
    };
  }, []);

  async function fetchRecentMatches() {
    setLoadingMatches(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadingMatches(false);
        return;
      }

      setUserId(user.id);

      // Query match_history for proper stats (includes dartbot, quick, ranked, etc.)
      console.log('[Play] Fetching recent matches for user:', user.id);
      const { data: matchesData, error } = await supabase
        .from('match_history')
        .select(`
          id,
          room_id,
          user_id,
          opponent_id,
          game_mode,
          match_format,
          bot_level,
          result,
          legs_won,
          legs_lost,
          three_dart_avg,
          highest_checkout,
          played_at
        `)
        .eq('user_id', user.id)
        .order('played_at', { ascending: false })
        .limit(3);

      if (error) {
        console.error('[Play] Error fetching recent matches:', error);
        setRecentMatches([]);
      } else {
        console.log('[Play] Fetched matches:', matchesData?.length || 0);
        
        // Fetch opponent profiles separately if needed
        const opponentIds = (matchesData || [])
          .filter(m => m.opponent_id && m.match_format !== 'dartbot')
          .map(m => m.opponent_id);
        
        let opponentProfiles: Record<string, string> = {};
        if (opponentIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, username')
            .in('user_id', opponentIds);
          
          opponentProfiles = (profiles || []).reduce((acc, p) => {
            acc[p.user_id] = p.username;
            return acc;
          }, {} as Record<string, string>);
        }
        
        // Transform data to match the expected format
        const transformed = (matchesData || []).map((match: any) => ({
          id: match.room_id || match.id,
          match_type: match.match_format,
          game_mode: match.game_mode?.toString() || '501',
          match_format: `best-of-${(match.legs_won || 0) + (match.legs_lost || 0)}`,
          player1_name: 'You',
          player2_name: match.match_format === 'dartbot' 
            ? `Dartbot(${match.bot_level || '?'})`
            : opponentProfiles[match.opponent_id] || 'Opponent',
          player1_legs_won: match.legs_won || 0,
          player2_legs_won: match.legs_lost || 0,
          winner_id: match.result === 'win' ? user.id : match.opponent_id,
          completed_at: match.played_at,
          user_id: user.id,
          // Include stats for display
          three_dart_avg: match.three_dart_avg,
          highest_checkout: match.highest_checkout,
          result: match.result,
        }));
        setRecentMatches(transformed);
      }
    } catch (err) {
      console.error('Error in fetchRecentMatches:', err);
      setRecentMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }

  const startRankedSearch = async () => {
    // Prevent duplicate enqueue if already searching
    if (rankedSearching && rankedQueueId) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[Play/Ranked] Already searching with queueId:', rankedQueueId);
      }
      return;
    }

    const supabase = createClient();
    setRankedSearching(true);
    setShowRankedSearch(true);

    try {
      console.log('[Play/Ranked] Calling rpc_ranked_enqueue (no params)');
      // rpc_ranked_enqueue returns a single UUID string, not a JSON object
      const { data: queueId, error } = await supabase.rpc('rpc_ranked_enqueue');

      if (error) {
        console.error('[Play/Ranked] Error enqueuing for ranked match:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        toast.error('Failed to join ranked queue');
        setShowRankedSearch(false);
        setRankedSearching(false);
        return;
      }

      if (!queueId) {
        console.error('[Play/Ranked] No queue ID returned from enqueue');
        toast.error('Failed to join ranked queue');
        setShowRankedSearch(false);
        setRankedSearching(false);
        return;
      }

      console.log('[Play/Ranked] Enqueue response - queueId:', queueId);

      // Store queue ID in state and localStorage
      setRankedQueueId(queueId);
      localStorage.setItem('ranked_queue_id', queueId);

      toast.success('Joined ranked queue');

      // Start polling to check status
      startPolling(queueId);
    } catch (err: any) {
      console.error('[Play/Ranked] Unexpected error:', err);
      toast.error(err.message || 'Failed to start ranked search');
      setShowRankedSearch(false);
      setRankedSearching(false);
    }
  };

  const startPolling = (queueId: string) => {
    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Poll every 1 second
    pollingIntervalRef.current = setInterval(async () => {
      await pollRankedQueue(queueId);
    }, 1000);
  };

  const pollRankedQueue = async (queueId: string) => {
    const supabase = createClient();

    // Safety check: don't poll if no queue ID
    if (!queueId) {
      console.warn('[Play/Ranked] pollRankedQueue called without queueId, skipping');
      return;
    }

    try {
      // Poll for status update - MUST pass p_queue_id parameter
      const { data, error } = await supabase.rpc('rpc_ranked_poll', {
        p_queue_id: queueId,
      });

      if (error) {
        console.error('[Play/Ranked] Error polling ranked queue:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        stopPolling();
        localStorage.removeItem('ranked_queue_id');
        setShowRankedSearch(false);
        setRankedSearching(false);
        setRankedQueueId(null);
        return;
      }

      // Normalize the response (handles plain object, array, or null)
      const poll = normalizePollResult(data);

      // Defensive guard: if poll is null or invalid, treat as still searching
      if (!poll || typeof poll.status !== 'string') {
        console.warn('[Play/Ranked] Poll returned null/invalid data, treating as still searching');
        return;
      }

      // Check ok field
      if (poll.ok !== true) {
        console.error('[Play/Ranked] Poll returned ok=false:', poll);
        stopPolling();
        localStorage.removeItem('ranked_queue_id');
        setShowRankedSearch(false);
        setRankedSearching(false);
        setRankedQueueId(null);
        toast.error(poll.message || 'Polling failed');
        return;
      }

      console.log('[Play/Ranked] Poll result:', { status: poll.status, matchRoomId: poll.match_room_id });

      if (poll.status === 'matched' && poll.match_room_id) {
        // Match found!
        console.log('[RESUME] Play/Ranked match found, validating room:', poll.match_room_id);

        if (!userId) {
          console.error('[RESUME] No userId available for validation');
          stopPolling();
          localStorage.removeItem('ranked_queue_id');
          setShowRankedSearch(false);
          setRankedSearching(false);
          setRankedQueueId(null);
          return;
        }

        // Validate room before navigation
        const validation = await validateRoomBeforeNavigation(poll.match_room_id, userId);

        if (!validation.valid) {
          console.log('[RESUME] invalid -> cleared room:', validation.reason);
          await clearStaleMatchState();
          stopPolling();
          localStorage.removeItem('ranked_queue_id');
          setShowRankedSearch(false);
          setRankedSearching(false);
          setRankedQueueId(null);
          toast.error(`Match room unavailable: ${validation.reason}`);
          return;
        }

        console.log('[RESUME] ok -> navigating to:', poll.match_room_id);
        stopPolling();
        localStorage.removeItem('ranked_queue_id');
        toast.success('Match found!');
        router.push(`/app/ranked/match/${poll.match_room_id}`);
        setShowRankedSearch(false);
        setRankedSearching(false);
        setRankedQueueId(null);
      } else if (poll.status === 'not_found' || poll.status === 'cancelled') {
        // Queue entry no longer exists (cancelled or error)
        console.log('[Play/Ranked] Status changed to:', poll.status);
        stopPolling();
        localStorage.removeItem('ranked_queue_id');
        setShowRankedSearch(false);
        setRankedSearching(false);
        setRankedQueueId(null);
        if (poll.status === 'cancelled') {
          toast.info('Search was cancelled');
        }
      }
      // If status === 'searching', keep polling (do nothing, let interval continue)
    } catch (err) {
      console.error('[Play/Ranked] Error polling:', err);
    }
  };

  const cancelRankedSearch = async () => {
    if (!rankedQueueId) {
      console.log('[Play/Ranked] Cancel called but no queueId, resetting UI');
      localStorage.removeItem('ranked_queue_id');
      setShowRankedSearch(false);
      setRankedSearching(false);
      return;
    }

    console.log('[Play/Ranked] Cancelling search for queueId:', rankedQueueId);
    const supabase = createClient();
    stopPolling();

    try {
      const { data, error } = await supabase.rpc('rpc_ranked_cancel', {
        p_queue_id: rankedQueueId,
      });

      if (error) {
        console.error('[Play/Ranked] Error cancelling ranked search:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        toast.error('Failed to cancel search');
      } else {
        console.log('[Play/Ranked] Successfully cancelled');
        toast.info('Search cancelled');
      }
    } catch (err) {
      console.error('[Play/Ranked] Unexpected error during cancel:', err);
    } finally {
      localStorage.removeItem('ranked_queue_id');
      setShowRankedSearch(false);
      setRankedSearching(false);
      setRankedQueueId(null);
    }
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const handleStartTraining = async () => {
    if (trainingMode === 'practice-games') {
      if (practiceGameMode === 'form-analysis') {
        router.push('/app/play/training/form-analysis');
      } else if (practiceGameMode === 'pdc-challenge') {
        router.push('/app/play/training/pdc-challenge');
      } else if (practiceGameMode === 'bobs-27') {
        router.push('/app/play/training/bobs-27');
      } else if (practiceGameMode === 'jdc-challenge') {
        router.push('/app/play/training/jdc-challenge');
      } else if (practiceGameMode === 'finish-training') {
        // Validate finish training settings
        if (finishMin === '' || finishMax === '') {
          toast.error('Both boxes should have a number in');
          return;
        }

        const minVal = parseInt(finishMin);
        const maxVal = parseInt(finishMax);

        if (isNaN(minVal) || isNaN(maxVal)) {
          toast.error('Both boxes should have a number in');
          return;
        }

        if (minVal < 2 || minVal > 150) {
          toast.error('Minimum must be between 2-150');
          return;
        }

        if (maxVal < 2 || maxVal > 170) {
          toast.error('Maximum must be between 2-170');
          return;
        }

        if (minVal >= maxVal) {
          toast.error('Minimum must be less than maximum');
          return;
        }

        // Create session
        const supabase = createClient();
        try {
          const { data, error } = await supabase.rpc('rpc_finish_training_create_session', {
            p_min: minVal,
            p_max: maxVal,
          });

          if (error || !data?.ok) {
            console.error('[Finish Training] Failed to create session:', error);
            toast.error('Failed to create training session');
            return;
          }

          const sessionId = data.session_id;

          // Get first random checkout
          const { data: checkoutData, error: checkoutError } = await supabase.rpc('rpc_finish_training_random_checkout', {
            p_min: minVal,
            p_max: maxVal,
          });

          if (checkoutError || !checkoutData?.ok) {
            console.error('[Finish Training] Failed to get checkout:', checkoutError);
            toast.error('Failed to get checkout number');
            return;
          }

          const checkout = checkoutData.checkout;

          // Set initial state
          const { error: stateError } = await supabase.rpc('rpc_finish_training_set_state', {
            p_session_id: sessionId,
            p_state: { current_target: checkout, attempt_no: 1 },
          });

          if (stateError) {
            console.error('[Finish Training] Failed to set state:', stateError);
            toast.error('Failed to set training state');
            return;
          }

          // Navigate to finish training page
          router.push(`/app/play/training/finish?session_id=${sessionId}`);
        } catch (err) {
          console.error('[Finish Training] Exception:', err);
          toast.error('Failed to start training');
        }
      } else {
        // Around The Clock with settings
        const config: TrainingConfig = {
          mode: 'around-the-clock',
          botDifficulty,
          botAverage: BOT_DIFFICULTY_CONFIG[botDifficulty].average,
          doubleOut,
          bestOf,
          atcOpponent: 'solo',
          atcSettings: {
            orderMode: atcOrderMode,
            segmentRule: atcSegmentRule,
            includeBull: true,
          },
        };
        setConfig(config);
        router.push('/app/play/training/around-the-clock');
      }
    } else {
      const config: TrainingConfig = {
        mode: trainingMode,
        botDifficulty,
        botAverage: BOT_DIFFICULTY_CONFIG[botDifficulty].average,
        doubleOut,
        bestOf,
        atcOpponent: 'solo',
      };
      setConfig(config);
      router.push('/app/play/training/501');
    }
  };

  const handleShowStats = (matchId: string) => {
    setSelectedMatchId(matchId);
    setShowStatsModal(true);
  };

  const getTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-white mb-2">Play</h1>
        <p className="text-gray-400">Choose your game mode and start playing.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-amber-600/20 to-orange-600/20 backdrop-blur-sm border-amber-500/30 p-8 hover:scale-105 transition-all">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center mb-6">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Ranked Match</h2>
          <p className="text-gray-300 mb-6">
            Compete in ranked matches to climb the leaderboard and prove your skills.
          </p>
          <Link href="/app/ranked">
            <Button className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-white">
              Find Ranked Match
            </Button>
          </Link>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-600/20 to-teal-600/20 backdrop-blur-sm border-emerald-500/30 p-8 hover:scale-105 transition-all">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mb-6">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Quick Match</h2>
          <p className="text-gray-300 mb-6">
            Jump into a casual match with players worldwide. No rank affected.
          </p>
          <Link href="/app/play/quick-match" className={rankedSearching ? 'pointer-events-none' : ''}>
            <Button
              disabled={rankedSearching}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white disabled:opacity-50"
            >
              Quick Match
            </Button>
          </Link>
        </Card>

        <Card className="bg-gradient-to-br from-blue-600/20 to-cyan-600/20 backdrop-blur-sm border-blue-500/30 p-8 hover:scale-105 transition-all">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mb-6">
            <Users className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Private Match</h2>
          <p className="text-gray-300 mb-6">
            Create a private match and invite friends or play locally.
          </p>
          <Button
            onClick={() => setShowPrivateModal(true)}
            disabled={rankedSearching}
            className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:opacity-90 text-white disabled:opacity-50"
          >
            Create Private Match
          </Button>
        </Card>
      </div>

      <Card className="bg-gradient-to-br from-emerald-600/20 to-teal-600/20 backdrop-blur-sm border-emerald-500/30 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex-shrink-0">
            <div className="flex items-center space-x-3 mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
                <GraduationCap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">Training</h2>
                <p className="text-gray-300 text-sm">Practice vs DartBot or solo drills</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="border-emerald-500/50 text-emerald-300 text-xs">
                301/501 vs Bot
              </Badge>
              <Badge variant="outline" className="border-emerald-500/50 text-emerald-300 text-xs">
                Practice Games
              </Badge>
            </div>
          </div>

          <div className="flex-1 max-w-2xl">
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Mode</label>
                <Tabs value={trainingMode} onValueChange={(v) => setTrainingMode(v as '301' | '501' | 'practice-games')}>
                  <TabsList className="bg-slate-800/50 w-full grid grid-cols-3">
                    <TabsTrigger value="301" className="data-[state=active]:bg-emerald-500">
                      301
                    </TabsTrigger>
                    <TabsTrigger value="501" className="data-[state=active]:bg-emerald-500">
                      501
                    </TabsTrigger>
                    <TabsTrigger value="practice-games" className="data-[state=active]:bg-emerald-500">
                      Practice Games
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {trainingMode === 'practice-games' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Training Game</label>
                    <Select value={practiceGameMode} onValueChange={(v) => setPracticeGameMode(v as 'around-the-clock' | 'form-analysis' | 'finish-training' | 'pdc-challenge' | 'bobs-27' | 'jdc-challenge')}>
                      <SelectTrigger className="bg-slate-800/50 border-emerald-500/30 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-emerald-500/30">
                        <SelectItem value="around-the-clock" className="text-white hover:bg-emerald-500/20">
                          Around the Clock
                        </SelectItem>
                        <SelectItem value="form-analysis" className="text-white hover:bg-emerald-500/20">
                          Throwing Form Analysis
                        </SelectItem>
                        <SelectItem value="finish-training" className="text-white hover:bg-emerald-500/20">
                          Finish Training
                        </SelectItem>
                        <SelectItem value="pdc-challenge" className="text-white hover:bg-emerald-500/20">
                          PDC Challenge
                        </SelectItem>
                        <SelectItem value="bobs-27" className="text-white hover:bg-emerald-500/20">
                          Bob's 27
                        </SelectItem>
                        <SelectItem value="jdc-challenge" className="text-white hover:bg-emerald-500/20">
                          JDC Challenge
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {practiceGameMode === 'around-the-clock' && (
                    <>
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-white mb-2 block">Target order</label>
                          <p className="text-xs text-gray-400 mb-2">Choose how the targets are presented during the session.</p>
                          <Select value={atcOrderMode} onValueChange={(v) => setAtcOrderMode(v as 'in_order' | 'random')}>
                            <SelectTrigger className="bg-slate-800/50 border-emerald-500/30 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-emerald-500/30">
                              <SelectItem value="in_order" className="text-white hover:bg-emerald-500/20">
                                In order (1–20 + Bull)
                              </SelectItem>
                              <SelectItem value="random" className="text-white hover:bg-emerald-500/20">
                                Random (1–20 + Bull)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-sm font-medium text-white mb-2 block">Segment rule</label>
                          <p className="text-xs text-gray-400 mb-2">Choose what counts as a valid hit and how progress advances.</p>
                          <Select value={atcSegmentRule} onValueChange={(v) => setAtcSegmentRule(v as any)}>
                            <SelectTrigger className="bg-slate-800/50 border-emerald-500/30 text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-emerald-500/30">
                              <SelectItem value="singles_only" className="text-white hover:bg-emerald-500/20">
                                Singles only
                              </SelectItem>
                              <SelectItem value="doubles_only" className="text-white hover:bg-emerald-500/20">
                                Doubles only
                              </SelectItem>
                              <SelectItem value="trebles_only" className="text-white hover:bg-emerald-500/20">
                                Trebles only
                              </SelectItem>
                              <SelectItem value="increase_by_segment" className="text-white hover:bg-emerald-500/20">
                                Increase by segment
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  )}

                  {practiceGameMode === 'finish-training' && (
                    <>
                      <div className="space-y-3">
                        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                          <p className="text-sm text-blue-200">
                            Finish training generates a random checkout you can complete in 3 darts (up to 170). You get 3 attempts per number, then it changes.
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-sm font-medium text-white mb-2 block">Minimum</label>
                            <input
                              type="number"
                              min="2"
                              max="150"
                              value={finishMin}
                              onChange={(e) => setFinishMin(e.target.value)}
                              placeholder="2-150"
                              className={`w-full px-3 py-2 bg-slate-800/50 border rounded-lg text-white placeholder:text-gray-500 ${
                                finishMin !== '' && (parseInt(finishMin) < 2 || parseInt(finishMin) > 150 || (finishMax !== '' && parseInt(finishMin) >= parseInt(finishMax)))
                                  ? 'border-red-500/50'
                                  : 'border-emerald-500/30'
                              }`}
                            />
                            {finishMin !== '' && (parseInt(finishMin) < 2 || parseInt(finishMin) > 150) && (
                              <p className="text-xs text-red-400 mt-1">Must be between 2-150</p>
                            )}
                          </div>

                          <div>
                            <label className="text-sm font-medium text-white mb-2 block">Maximum</label>
                            <input
                              type="number"
                              min="2"
                              max="170"
                              value={finishMax}
                              onChange={(e) => setFinishMax(e.target.value)}
                              placeholder="2-170"
                              className={`w-full px-3 py-2 bg-slate-800/50 border rounded-lg text-white placeholder:text-gray-500 ${
                                finishMax !== '' && (parseInt(finishMax) > 170 || (finishMin !== '' && parseInt(finishMax) <= parseInt(finishMin)))
                                  ? 'border-red-500/50'
                                  : 'border-emerald-500/30'
                              }`}
                            />
                            {finishMax !== '' && parseInt(finishMax) > 170 && (
                              <p className="text-xs text-red-400 mt-1">Must be 170 or less</p>
                            )}
                          </div>
                        </div>

                        {finishMin !== '' && finishMax !== '' && parseInt(finishMin) >= parseInt(finishMax) && (
                          <p className="text-xs text-red-400">Minimum must be less than maximum</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {(trainingMode === '301' || trainingMode === '501') && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Bot Difficulty</label>
                    <Select value={botDifficulty} onValueChange={(v) => setBotDifficulty(v as keyof typeof BOT_DIFFICULTY_CONFIG)}>
                      <SelectTrigger className="bg-slate-800/50 border-emerald-500/30 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-emerald-500/30">
                        {Object.entries(BOT_DIFFICULTY_CONFIG).map(([key, value]) => (
                          <SelectItem key={key} value={key} className="text-white hover:bg-emerald-500/20">
                            {value.name} ({value.average})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Best Of</label>
                    <Select value={bestOf} onValueChange={(v) => setBestOf(v as typeof bestOf)}>
                      <SelectTrigger className="bg-slate-800/50 border-emerald-500/30 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-emerald-500/30">
                        <SelectItem value="best-of-1" className="text-white hover:bg-emerald-500/20">Best of 1</SelectItem>
                        <SelectItem value="best-of-3" className="text-white hover:bg-emerald-500/20">Best of 3</SelectItem>
                        <SelectItem value="best-of-5" className="text-white hover:bg-emerald-500/20">Best of 5</SelectItem>
                        <SelectItem value="best-of-7" className="text-white hover:bg-emerald-500/20">Best of 7</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={() => setDoubleOut(!doubleOut)}
                      className={`w-full h-10 rounded-md text-sm font-medium transition-colors ${
                        doubleOut
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-800/50 text-gray-400 border border-emerald-500/30'
                      }`}
                    >
                      Double Out: {doubleOut ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              )}

              <Button
                onClick={handleStartTraining}
                disabled={
                  trainingMode === 'practice-games' &&
                  practiceGameMode === 'finish-training' &&
                  (finishMin === '' || finishMax === '' ||
                   parseInt(finishMin) < 2 || parseInt(finishMin) > 150 ||
                   parseInt(finishMax) < 2 || parseInt(finishMax) > 170 ||
                   parseInt(finishMin) >= parseInt(finishMax))
                }
                className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white px-8 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Training
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {showRankedSearch && (
        <Card className="bg-slate-900/90 backdrop-blur-sm border-amber-500/30 p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-white">Finding Ranked Match</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={cancelRankedSearch}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="relative">
              <div className="w-24 h-24 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center animate-pulse">
                <Shield className="w-12 h-12 text-white" />
              </div>
              <Loader2 className="w-32 h-32 text-amber-500 animate-spin absolute -top-4 -left-4" />
            </div>

            <div className="text-center space-y-2">
              <p className="text-2xl text-white font-bold">Finding player with similar rank...</p>
              <p className="text-gray-400">Matchmaking in progress</p>
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500 mt-4">
                <Clock className="w-4 h-4" />
                <span>Average wait time: 30-60 seconds</span>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={cancelRankedSearch}
              className="mt-4 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              Cancel Search
            </Button>
          </div>
        </Card>
      )}

      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-white">Last 3 Games</h2>
        </div>

        {loadingMatches ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-400">Loading matches...</div>
          </div>
        ) : recentMatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Target className="w-12 h-12 mb-3 opacity-50" />
            <p>No recent games yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentMatches.map((match) => {
              const isPlayer1 = match.user_id === userId;
              const opponentName = isPlayer1 ? match.player2_name : match.player1_name;
              const userLegs = isPlayer1 ? match.player1_legs_won : match.player2_legs_won;
              const opponentLegs = isPlayer1 ? match.player2_legs_won : match.player1_legs_won;

              return (
                <div
                  key={match.id}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <Avatar className="w-12 h-12 bg-gradient-to-br from-gray-600 to-gray-700">
                      <div className="w-full h-full flex items-center justify-center text-white font-bold">
                        {opponentName.charAt(0).toUpperCase()}
                      </div>
                    </Avatar>
                    <div>
                      <p className="text-white font-medium">{opponentName}</p>
                      <div className="flex items-center space-x-2 text-sm">
                        <span className="text-gray-400">
                          {MODE_LABELS[match.match_type] || match.match_type} • {match.game_mode} • {match.match_format.replace('best-of-', 'Best of ')}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 text-sm mt-1">
                        <span className="text-gray-400">Score: {userLegs}-{opponentLegs}</span>
                        <span className="text-gray-600">•</span>
                        <span className="text-gray-500">{getTimeAgo(match.completed_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <Button
                      size="sm"
                      onClick={() => handleShowStats(match.id)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      <BarChart3 className="w-4 h-4 mr-1" />
                      Stats
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <h2 className="text-xl font-bold text-white mb-6">Game Modes</h2>

        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { name: '301', desc: 'Quick matches', icon: Zap },
            { name: '501', desc: 'Classic darts', icon: Target },
            { name: 'Around the Clock', desc: 'Training drill', icon: Trophy },
          ].map((mode, index) => {
            const Icon = mode.icon;
            return (
              <div
                key={index}
                className="p-4 bg-white/5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-white font-semibold mb-1">{mode.name}</h3>
                <p className="text-gray-400 text-sm">{mode.desc}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <MatchErrorBoundary>
        <PrivateMatchModal
          isOpen={showPrivateModal}
          onClose={() => setShowPrivateModal(false)}
        />
      </MatchErrorBoundary>

      {selectedMatchId && (
        <MatchStatsModal
          isOpen={showStatsModal}
          onClose={() => setShowStatsModal(false)}
          matchId={selectedMatchId}
        />
      )}
    </div>
  );
}
