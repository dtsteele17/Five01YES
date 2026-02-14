'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
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
  Flame,
  ChevronRight,
  Play,
  Crown,
  Swords,
  Dices,
  ArrowRight,
  Settings2,
  ChevronDown,
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
  result: 'win' | 'loss' | 'draw';
  three_dart_avg: number | null;
  first9_avg: number | null;
  highest_checkout: number | null;
  checkout_percentage: number | null;
  darts_thrown: number | null;
  visits_100_plus: number | null;
  visits_140_plus: number | null;
  visits_180: number | null;
  opponent_three_dart_avg: number | null;
  opponent_first9_avg: number | null;
  opponent_highest_checkout: number | null;
  opponent_checkout_percentage: number | null;
}

const MODE_LABELS: Record<string, string> = {
  'ranked': 'Ranked',
  'quick': 'Quick Match',
  'private': 'Private',
  'training': 'Training',
  'league': 'League',
  'tournament': 'Tournament',
};

function normalizePollResult(data: any): { ok: boolean; queue_id?: string; status: string; match_room_id?: string | null; matched_at?: string | null; message?: string } | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

// Game Mode Button Component
function GameModeButton({
  href,
  onClick,
  icon: Icon,
  title,
  description,
  variant = 'default',
  disabled = false,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ElementType;
  title: string;
  description: string;
  variant?: 'default' | 'ranked' | 'quick' | 'private';
  disabled?: boolean;
}) {
  const variants = {
    default: 'from-slate-700 to-slate-800 border-slate-600/50 hover:border-slate-500',
    ranked: 'from-amber-600/90 to-amber-800/90 border-amber-500/50 hover:border-amber-400',
    quick: 'from-emerald-600/90 to-emerald-800/90 border-emerald-500/50 hover:border-emerald-400',
    private: 'from-blue-600/90 to-blue-800/90 border-blue-500/50 hover:border-blue-400',
  };

  const content = (
    <div className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${variants[variant]} p-6 border transition-all duration-300 group ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:shadow-xl hover:shadow-black/20 hover:-translate-y-0.5'}`}>
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_50%_50%,_white_1px,transparent_1px)] bg-[length:20px_20px]" />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-lg ${
            variant === 'ranked' ? 'bg-amber-500/20 text-amber-300' :
            variant === 'quick' ? 'bg-emerald-500/20 text-emerald-300' :
            variant === 'private' ? 'bg-blue-500/20 text-blue-300' :
            'bg-slate-600/50 text-slate-300'
          }`}>
            <Icon className="w-7 h-7" />
          </div>
          {variant === 'ranked' && (
            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30">
              Competitive
            </Badge>
          )}
        </div>
        
        <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
        <p className="text-white/70 text-sm leading-relaxed">{description}</p>
        
        <div className="mt-4 flex items-center text-white/50 text-sm font-medium group-hover:text-white/80 transition-colors">
          <span>Enter</span>
          <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </div>
  );

  if (disabled) return <div>{content}</div>;
  if (href) return <Link href={href}>{content}</Link>;
  return <div onClick={onClick}>{content}</div>;
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
  const [practiceGameMode, setPracticeGameMode] = useState<'around-the-clock' | 'form-analysis' | 'finish-training' | 'pdc-challenge' | 'bobs-27' | 'jdc-challenge' | '121-game' | 'killer'>('around-the-clock');
  const [botDifficulty, setBotDifficulty] = useState<keyof typeof BOT_DIFFICULTY_CONFIG>('intermediate');
  const [doubleOut, setDoubleOut] = useState(true);
  const [bestOf, setBestOf] = useState<'best-of-1' | 'best-of-3' | 'best-of-5' | 'best-of-7'>('best-of-3');
  const [atcOrderMode, setAtcOrderMode] = useState<'in_order' | 'random'>('in_order');
  const [atcSegmentRule, setAtcSegmentRule] = useState<'singles_only' | 'doubles_only' | 'trebles_only' | 'increase_by_segment'>('increase_by_segment');
  const [finishMin, setFinishMin] = useState<string>('');
  const [finishMax, setFinishMax] = useState<string>('');
  const [killerRounds, setKillerRounds] = useState<1 | 3 | 5 | 7>(3);

  useEffect(() => {
    fetchRecentMatches();

    const storedQueueId = localStorage.getItem('ranked_queue_id');
    if (storedQueueId) {
      setRankedQueueId(storedQueueId);
      setRankedSearching(true);
      setShowRankedSearch(true);
      startPolling(storedQueueId);
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('queue') === 'ranked' && !autoQueueAttempted.current) {
      autoQueueAttempted.current = true;
      router.replace('/app/play');
      setTimeout(() => startRankedSearch(), 500);
    }

    return () => stopPolling();
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

      const { data: matchesData, error } = await supabase
        .from('match_history')
        .select(`
          id, room_id, user_id, opponent_id, game_mode, match_format, bot_level, result,
          legs_won, legs_lost, three_dart_avg, first9_avg, highest_checkout,
          checkout_percentage, darts_thrown, visits_100_plus, visits_140_plus, visits_180,
          played_at, metadata, opponent_three_dart_avg, opponent_first9_avg,
          opponent_highest_checkout, opponent_checkout_percentage
        `)
        .eq('user_id', user.id)
        .order('played_at', { ascending: false })
        .limit(3);

      if (error) {
        setRecentMatches([]);
      } else {
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
        
        const transformed = (matchesData || []).map((match: any) => {
          const isWin = match.result === 'win';
          const userLegs = match.legs_won ?? 0;
          const opponentLegs = match.legs_lost ?? 0;
          const botStats = match.metadata?.bot_stats || {};
          const isDartbot = match.match_format === 'dartbot';
          
          return {
            id: match.room_id || match.id,
            match_type: match.match_format,
            game_mode: match.game_mode?.toString() || '501',
            match_format: `Best of ${userLegs + opponentLegs}`,
            player1_name: 'You',
            player2_name: isDartbot 
              ? `Dartbot(${match.bot_level || '?'})`
              : opponentProfiles[match.opponent_id] || 'Opponent',
            player1_legs_won: userLegs,
            player2_legs_won: opponentLegs,
            winner_id: isWin ? user.id : match.opponent_id,
            completed_at: match.played_at,
            user_id: user.id,
            result: match.result,
            three_dart_avg: match.three_dart_avg,
            first9_avg: match.first9_avg,
            highest_checkout: match.highest_checkout,
            checkout_percentage: match.checkout_percentage,
            darts_thrown: match.darts_thrown,
            visits_100_plus: match.visits_100_plus,
            visits_140_plus: match.visits_140_plus,
            visits_180: match.visits_180,
            opponent_three_dart_avg: isDartbot && botStats.three_dart_avg 
              ? botStats.three_dart_avg 
              : match.opponent_three_dart_avg,
            opponent_first9_avg: isDartbot && botStats.first9_avg 
              ? botStats.first9_avg 
              : match.opponent_first9_avg,
            opponent_highest_checkout: isDartbot && botStats.highest_checkout 
              ? botStats.highest_checkout 
              : match.opponent_highest_checkout,
            opponent_checkout_percentage: isDartbot && botStats.checkout_pct 
              ? botStats.checkout_pct 
              : match.opponent_checkout_percentage,
          };
        });
        setRecentMatches(transformed);
      }
    } catch (err) {
      setRecentMatches([]);
    } finally {
      setLoadingMatches(false);
    }
  }

  const startRankedSearch = async () => {
    if (rankedSearching && rankedQueueId) return;

    const supabase = createClient();
    setRankedSearching(true);
    setShowRankedSearch(true);

    try {
      const { data: queueId, error } = await supabase.rpc('rpc_ranked_enqueue');

      if (error || !queueId) {
        toast.error('Failed to join ranked queue');
        setShowRankedSearch(false);
        setRankedSearching(false);
        return;
      }

      setRankedQueueId(queueId);
      localStorage.setItem('ranked_queue_id', queueId);
      toast.success('Joined ranked queue');
      startPolling(queueId);
    } catch (err: any) {
      toast.error(err.message || 'Failed to start ranked search');
      setShowRankedSearch(false);
      setRankedSearching(false);
    }
  };

  const startPolling = (queueId: string) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);

    pollingIntervalRef.current = setInterval(async () => {
      await pollRankedQueue(queueId);
    }, 1000);
  };

  const pollRankedQueue = async (queueId: string) => {
    const supabase = createClient();
    if (!queueId) return;

    try {
      const { data, error } = await supabase.rpc('rpc_ranked_poll', { p_queue_id: queueId });

      if (error) {
        stopPolling();
        localStorage.removeItem('ranked_queue_id');
        setShowRankedSearch(false);
        setRankedSearching(false);
        setRankedQueueId(null);
        return;
      }

      const poll = normalizePollResult(data);

      if (!poll || typeof poll.status !== 'string') return;
      if (poll.ok !== true) {
        stopPolling();
        localStorage.removeItem('ranked_queue_id');
        setShowRankedSearch(false);
        setRankedSearching(false);
        setRankedQueueId(null);
        return;
      }

      if (poll.status === 'matched' && poll.match_room_id) {
        if (!userId) {
          stopPolling();
          return;
        }

        const validation = await validateRoomBeforeNavigation(poll.match_room_id, userId);

        if (!validation.valid) {
          await clearStaleMatchState();
          stopPolling();
          localStorage.removeItem('ranked_queue_id');
          setShowRankedSearch(false);
          setRankedSearching(false);
          setRankedQueueId(null);
          toast.error(`Match room unavailable: ${validation.reason}`);
          return;
        }

        stopPolling();
        localStorage.removeItem('ranked_queue_id');
        toast.success('Match found!');
        router.push(`/app/ranked/match/${poll.match_room_id}`);
        setShowRankedSearch(false);
        setRankedSearching(false);
        setRankedQueueId(null);
      } else if (poll.status === 'not_found' || poll.status === 'cancelled') {
        stopPolling();
        localStorage.removeItem('ranked_queue_id');
        setShowRankedSearch(false);
        setRankedSearching(false);
        setRankedQueueId(null);
      }
    } catch (err) {
      console.error('Error polling:', err);
    }
  };

  const cancelRankedSearch = async () => {
    if (!rankedQueueId) {
      setShowRankedSearch(false);
      setRankedSearching(false);
      return;
    }

    const supabase = createClient();
    stopPolling();

    try {
      await supabase.rpc('rpc_ranked_cancel', { p_queue_id: rankedQueueId });
      toast.info('Search cancelled');
    } catch (err) {
      // ignore
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

  useEffect(() => () => stopPolling(), []);

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
      } else if (practiceGameMode === '121-game') {
        router.push('/app/play/training/121');
      } else if (practiceGameMode === 'killer') {
        const config: TrainingConfig = {
          mode: 'killer',
          botDifficulty,
          botAverage: BOT_DIFFICULTY_CONFIG[botDifficulty].average,
          doubleOut,
          bestOf,
          atcOpponent: 'bot',
          killerSettings: { rounds: killerRounds },
        };
        setConfig(config);
        router.push('/app/play/training/killer');
      } else if (practiceGameMode === 'finish-training') {
        if (finishMin === '' || finishMax === '') {
          toast.error('Both boxes should have a number in');
          return;
        }

        const minVal = parseInt(finishMin);
        const maxVal = parseInt(finishMax);

        if (isNaN(minVal) || isNaN(maxVal) || minVal < 2 || minVal > 150 || maxVal < 2 || maxVal > 170 || minVal >= maxVal) {
          toast.error('Invalid finish range');
          return;
        }

        const supabase = createClient();
        try {
          const { data, error } = await supabase.rpc('rpc_finish_training_create_session', {
            p_min: minVal,
            p_max: maxVal,
          });

          if (error || !data?.ok) {
            toast.error('Failed to create training session');
            return;
          }

          const sessionId = data.session_id;

          const { data: checkoutData, error: checkoutError } = await supabase.rpc('rpc_finish_training_random_checkout', {
            p_min: minVal,
            p_max: maxVal,
          });

          if (checkoutError || !checkoutData?.ok) {
            toast.error('Failed to get checkout number');
            return;
          }

          await supabase.rpc('rpc_finish_training_set_state', {
            p_session_id: sessionId,
            p_state: { current_target: checkoutData.checkout, attempt_no: 1 },
          });

          router.push(`/app/play/training/finish?session_id=${sessionId}`);
        } catch (err) {
          toast.error('Failed to start training');
        }
      } else {
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
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Game Center</h1>
          <p className="text-slate-400 mt-1">Choose your match type and start playing</p>
        </div>
      </div>

      {/* Main Game Modes */}
      <div className="grid md:grid-cols-3 gap-6">
        <GameModeButton
          href="/app/ranked"
          icon={Crown}
          title="Ranked Match"
          description="Compete for ranking points and climb the leaderboard. Test your skills against equally matched opponents."
          variant="ranked"
          disabled={rankedSearching}
        />
        <GameModeButton
          href="/app/play/quick-match"
          icon={Zap}
          title="Quick Match"
          description="Jump into casual matches instantly. No pressure, just pure darts action with players worldwide."
          variant="quick"
          disabled={rankedSearching}
        />
        <GameModeButton
          onClick={() => setShowPrivateModal(true)}
          icon={Users}
          title="Private Match"
          description="Create a private room and invite friends. Perfect for practice matches with people you know."
          variant="private"
          disabled={rankedSearching}
        />
      </div>

      {/* Training Section */}
      <Card className="bg-slate-900/80 border-slate-700/50 overflow-hidden">
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Training Grounds</h2>
              <p className="text-sm text-slate-400">Practice against DartBot or solo drills</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Mode Selection */}
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { value: '301', label: '301 vs Bot', desc: 'Quick games' },
              { value: '501', label: '501 vs Bot', desc: 'Classic darts' },
              { value: 'practice-games', label: 'Practice Games', desc: 'Training drills' },
            ].map((mode) => (
              <button
                key={mode.value}
                onClick={() => setTrainingMode(mode.value as any)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  trainingMode === mode.value
                    ? 'bg-emerald-500/10 border-emerald-500/50'
                    : 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                }`}
              >
                <p className={`font-medium ${trainingMode === mode.value ? 'text-emerald-400' : 'text-white'}`}>
                  {mode.label}
                </p>
                <p className="text-xs text-slate-400 mt-1">{mode.desc}</p>
              </button>
            ))}
          </div>

          {/* Configuration */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            {trainingMode === 'practice-games' ? (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-2 block">Training Game</label>
                  <Select value={practiceGameMode} onValueChange={(v) => setPracticeGameMode(v as any)}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      <SelectItem value="around-the-clock">Around the Clock</SelectItem>
                      <SelectItem value="finish-training">Finish Training</SelectItem>
                      <SelectItem value="pdc-challenge">PDC Challenge</SelectItem>
                      <SelectItem value="jdc-challenge">JDC Challenge</SelectItem>
                      <SelectItem value="bobs-27">Bob's 27</SelectItem>
                      <SelectItem value="121-game">121 Game</SelectItem>
                      <SelectItem value="killer">Killer</SelectItem>
                      <SelectItem value="form-analysis">Form Analysis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {practiceGameMode === 'finish-training' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Min Checkout</label>
                      <input
                        type="number"
                        min="2"
                        max="150"
                        value={finishMin}
                        onChange={(e) => setFinishMin(e.target.value)}
                        placeholder="2"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Max Checkout</label>
                      <input
                        type="number"
                        min="2"
                        max="170"
                        value={finishMax}
                        onChange={(e) => setFinishMax(e.target.value)}
                        placeholder="170"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm"
                      />
                    </div>
                  </div>
                )}

                {practiceGameMode === 'killer' && (
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Rounds</label>
                    <Select value={killerRounds.toString()} onValueChange={(v) => setKillerRounds(parseInt(v) as any)}>
                      <SelectTrigger className="bg-slate-900 border-slate-700 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="1">1 Round</SelectItem>
                        <SelectItem value="3">3 Rounds</SelectItem>
                        <SelectItem value="5">5 Rounds</SelectItem>
                        <SelectItem value="7">7 Rounds</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Bot Level</label>
                  <Select value={botDifficulty} onValueChange={(v) => setBotDifficulty(v as any)}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      {Object.entries(BOT_DIFFICULTY_CONFIG).map(([key, value]) => (
                        <SelectItem key={key} value={key}>{value.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Format</label>
                  <Select value={bestOf} onValueChange={(v) => setBestOf(v as any)}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      <SelectItem value="best-of-1">Best of 1</SelectItem>
                      <SelectItem value="best-of-3">Best of 3</SelectItem>
                      <SelectItem value="best-of-5">Best of 5</SelectItem>
                      <SelectItem value="best-of-7">Best of 7</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Double Out</label>
                  <button
                    onClick={() => setDoubleOut(!doubleOut)}
                    className={`w-full h-9 rounded-lg text-sm font-medium transition-colors ${
                      doubleOut 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-slate-900 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {doubleOut ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <Button
            onClick={handleStartTraining}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <Play className="w-4 h-4 mr-2" />
            Start Training
          </Button>
        </div>
      </Card>

      {/* Recent Matches */}
      <Card className="bg-slate-900/80 border-slate-700/50 overflow-hidden">
        <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Recent Matches</h2>
              <p className="text-sm text-slate-400">Your last 3 games</p>
            </div>
          </div>
          <Link href="/app/history">
            <Button variant="ghost" className="text-slate-400 hover:text-white">
              View All
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        <div className="p-6">
          {loadingMatches ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
          ) : recentMatches.length === 0 ? (
            <div className="text-center py-12">
              <Target className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">No recent games yet</p>
              <p className="text-slate-500 text-sm mt-1">Start playing to see your match history</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentMatches.map((match) => {
                const isWin = match.result === 'win';
                const isLoss = match.result === 'loss';
                const userLegs = match.player1_legs_won;
                const opponentLegs = match.player2_legs_won;

                return (
                  <div
                    key={match.id}
                    className={`group flex items-center gap-4 p-4 rounded-xl border transition-all hover:scale-[1.01] ${
                      isWin 
                        ? 'bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40' 
                        : isLoss 
                          ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/40'
                          : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      isWin 
                        ? 'bg-emerald-500/20 text-emerald-400' 
                        : isLoss 
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-slate-700 text-slate-400'
                    }`}>
                      {isWin ? <Trophy className="w-5 h-5" /> : isLoss ? <X className="w-5 h-5" /> : <Dices className="w-5 h-5" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium truncate">{match.player2_name}</span>
                        <Badge variant="outline" className={`text-xs ${
                          isWin ? 'border-emerald-500/30 text-emerald-400' : 
                          isLoss ? 'border-red-500/30 text-red-400' : 
                          'border-slate-500/30 text-slate-400'
                        }`}>
                          {isWin ? 'Win' : isLoss ? 'Loss' : 'Draw'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-slate-400 mt-1">
                        <span>{match.game_mode}</span>
                        <span className="text-slate-600">•</span>
                        <span className={isWin ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                          {userLegs} - {opponentLegs}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span>{getTimeAgo(match.completed_at)}</span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleShowStats(match.id)}
                      className="text-slate-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {/* Ranked Search Modal */}
      {showRankedSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="relative w-full max-w-md bg-slate-900 border-amber-500/30 p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-orange-500/10 rounded-xl" />
            
            <div className="relative text-center">
              <div className="relative w-24 h-24 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
                <div className="absolute inset-2 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                  <Crown className="w-10 h-10 text-white" />
                </div>
              </div>

              <h3 className="text-2xl font-bold text-white mb-2">Finding Opponent</h3>
              <p className="text-slate-400 mb-6">Searching for a worthy challenger...</p>

              <div className="flex items-center justify-center gap-2 text-sm text-amber-400 mb-8">
                <Clock className="w-4 h-4" />
                <span>Average wait: 30-60 seconds</span>
              </div>

              <Button
                variant="outline"
                onClick={cancelRankedSearch}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                Cancel Search
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modals */}
      <MatchErrorBoundary>
        <PrivateMatchModal isOpen={showPrivateModal} onClose={() => setShowPrivateModal(false)} />
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
