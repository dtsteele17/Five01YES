'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Crown,
  Play,
  ChevronRight,
  Swords,
  Dices,
  ArrowRight,
  ChevronDown,
  TargetIcon,
  RotateCcw,
  Sparkles,
  Award,
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

// Bento Grid Item Component
function BentoItem({ 
  children, 
  className = '', 
  colSpan = 1,
  rowSpan = 1,
}: { 
  children: React.ReactNode; 
  className?: string;
  colSpan?: number;
  rowSpan?: number;
}) {
  return (
    <div className={`${className} ${colSpan === 2 ? 'md:col-span-2' : ''} ${rowSpan === 2 ? 'md:row-span-2' : ''}`}>
      {children}
    </div>
  );
}

// Large Game Mode Card
function GameModeCard({
  href,
  onClick,
  icon: Icon,
  title,
  subtitle,
  description,
  color,
  disabled = false,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  disabled?: boolean;
}) {
  const content = (
    <div className={`group relative h-full overflow-hidden rounded-3xl bg-gradient-to-br ${color} p-8 transition-all duration-300 ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02] hover:shadow-2xl'}`}>
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_50%_50%,_white_1px,transparent_1px)] bg-[length:24px_24px]" />
      <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-500" />
      
      <div className="relative z-10 h-full flex flex-col">
        <div className="flex items-start justify-between mb-6">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg">
            <Icon className="w-8 h-8 text-white" />
          </div>
          <div className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-white/90 text-sm font-medium">
            {subtitle}
          </div>
        </div>
        
        <div className="flex-1">
          <h3 className="text-3xl font-bold text-white mb-3">{title}</h3>
          <p className="text-white/80 text-lg leading-relaxed max-w-md">{description}</p>
        </div>
        
        <div className="mt-6 flex items-center text-white font-semibold">
          <span>Enter Arena</span>
          <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform" />
        </div>
      </div>
    </div>
  );

  if (disabled) return content;
  if (href) return <Link href={href}>{content}</Link>;
  return <div onClick={onClick}>{content}</div>;
}

// Compact Game Card for training
function CompactGameCard({
  title,
  icon: Icon,
  color,
  onClick,
  active = false,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full p-4 rounded-2xl border-2 transition-all duration-200 text-left ${
        active 
          ? `bg-gradient-to-r ${color} border-transparent` 
          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${active ? 'bg-white/20' : `bg-gradient-to-br ${color}`}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <span className={`font-semibold ${active ? 'text-white' : 'text-slate-300'}`}>{title}</span>
      </div>
    </button>
  );
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
      <div className="text-center py-8">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">Game Center</h1>
        <p className="text-xl text-gray-400">Choose your arena and start competing</p>
      </div>

      {/* Bento Grid Layout */}
      <div className="grid md:grid-cols-3 gap-6 auto-rows-[200px]">
        {/* Ranked - Large Card */}
        <BentoItem colSpan={2} rowSpan={2}>
          <GameModeCard
            href="/app/ranked"
            icon={Crown}
            title="Ranked Matches"
            subtitle="Competitive"
            description="Climb the leaderboard and prove your skills against equally matched opponents. Earn RP and climb divisions."
            color="from-amber-600 via-orange-600 to-red-600"
            disabled={rankedSearching}
          />
        </BentoItem>

        {/* Quick Match */}
        <BentoItem>
          <GameModeCard
            href="/app/play/quick-match"
            icon={Zap}
            title="Quick Match"
            subtitle="Casual"
            description="Jump into instant matches. No pressure, just darts."
            color="from-emerald-600 via-teal-600 to-cyan-600"
            disabled={rankedSearching}
          />
        </BentoItem>

        {/* Private Match */}
        <BentoItem>
          <GameModeCard
            onClick={() => setShowPrivateModal(true)}
            icon={Users}
            title="Private Match"
            subtitle="Friends"
            description="Create a room and invite friends."
            color="from-blue-600 via-indigo-600 to-purple-600"
            disabled={rankedSearching}
          />
        </BentoItem>

        {/* Training Hub */}
        <BentoItem colSpan={2}>
          <div className="h-full bg-slate-900/60 border border-white/10 rounded-3xl p-6 overflow-hidden">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Training Hub</h3>
                <p className="text-sm text-gray-400">Practice against DartBot</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <CompactGameCard
                title="301"
                icon={Target}
                color="from-blue-500 to-blue-600"
                onClick={() => setTrainingMode('301')}
                active={trainingMode === '301'}
              />
              <CompactGameCard
                title="501"
                icon={Target}
                color="from-indigo-500 to-indigo-600"
                onClick={() => setTrainingMode('501')}
                active={trainingMode === '501'}
              />
              <CompactGameCard
                title="Practice"
                icon={Sparkles}
                color="from-purple-500 to-purple-600"
                onClick={() => setTrainingMode('practice-games')}
                active={trainingMode === 'practice-games'}
              />
            </div>

            {/* Quick Settings */}
            <div className="mt-4 flex items-center gap-3">
              {trainingMode !== 'practice-games' ? (
                <>
                  <Select value={botDifficulty} onValueChange={(v) => setBotDifficulty(v as any)}>
                    <SelectTrigger className="w-32 h-9 bg-slate-800 border-slate-700 text-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {Object.entries(BOT_DIFFICULTY_CONFIG).map(([key, value]) => (
                        <SelectItem key={key} value={key}>{value.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={bestOf} onValueChange={(v) => setBestOf(v as any)}>
                    <SelectTrigger className="w-28 h-9 bg-slate-800 border-slate-700 text-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      <SelectItem value="best-of-1">Best of 1</SelectItem>
                      <SelectItem value="best-of-3">Best of 3</SelectItem>
                      <SelectItem value="best-of-5">Best of 5</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <Select value={practiceGameMode} onValueChange={(v) => setPracticeGameMode(v as any)}>
                  <SelectTrigger className="w-48 h-9 bg-slate-800 border-slate-700 text-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="around-the-clock">Around the Clock</SelectItem>
                    <SelectItem value="finish-training">Finish Training</SelectItem>
                    <SelectItem value="pdc-challenge">PDC Challenge</SelectItem>
                    <SelectItem value="jdc-challenge">JDC Challenge</SelectItem>
                    <SelectItem value="killer">Killer</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" onClick={handleStartTraining} className="ml-auto bg-indigo-600 hover:bg-indigo-500">
                <Play className="w-4 h-4 mr-1" />
                Start
              </Button>
            </div>
          </div>
        </BentoItem>

        {/* Recent Matches Mini */}
        <BentoItem>
          <div className="h-full bg-slate-900/60 border border-white/10 rounded-3xl p-5 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-white">Recent</h3>
              </div>
              <Link href="/app/history">
                <ChevronRight className="w-4 h-4 text-gray-400 hover:text-white" />
              </Link>
            </div>

            {loadingMatches ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
              </div>
            ) : recentMatches.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-500 text-sm">No matches yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentMatches.slice(0, 2).map((match) => (
                  <div
                    key={match.id}
                    onClick={() => handleShowStats(match.id)}
                    className={`p-3 rounded-xl cursor-pointer transition-colors ${
                      match.result === 'win' 
                        ? 'bg-emerald-500/10 border border-emerald-500/20' 
                        : 'bg-red-500/10 border border-red-500/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm font-medium truncate">{match.player2_name}</span>
                      <span className={`text-sm font-bold ${match.result === 'win' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {match.player1_legs_won}-{match.player2_legs_won}
                      </span>
                    </div>
                    <p className="text-gray-500 text-xs mt-1">{getTimeAgo(match.completed_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </BentoItem>
      </div>

      {/* Ranked Search Modal */}
      {showRankedSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <Card className="relative w-full max-w-md bg-slate-900 border-amber-500/30 p-8 text-center">
            <div className="relative w-24 h-24 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
              <div className="absolute inset-2 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <Crown className="w-10 h-10 text-white" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Finding Opponent</h3>
            <p className="text-gray-400 mb-6">Searching for a worthy challenger...</p>
            <div className="flex items-center justify-center gap-2 text-sm text-amber-400 mb-8">
              <Clock className="w-4 h-4" />
              <span>Average wait: 30-60 seconds</span>
            </div>
            <Button variant="outline" onClick={cancelRankedSearch} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
              Cancel Search
            </Button>
          </Card>
        </div>
      )}

      {/* Modals */}
      <MatchErrorBoundary>
        <PrivateMatchModal isOpen={showPrivateModal} onClose={() => setShowPrivateModal(false)} />
      </MatchErrorBoundary>

      {selectedMatchId && (
        <MatchStatsModal isOpen={showStatsModal} onClose={() => setShowStatsModal(false)} matchId={selectedMatchId} />
      )}
    </div>
  );
}
