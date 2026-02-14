'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
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
  Star,
  Crown,
  Gamepad2,
  Dices,
  ChevronRight,
  Sparkles,
  TrendingUp,
  Award,
  Crosshair,
  Swords,
  Play,
  RotateCcw,
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

interface UserStats {
  totalMatches: number;
  wins: number;
  losses: number;
  currentStreak: number;
  bestStreak: number;
  average: number;
  highestCheckout: number;
  level: number;
  xp: number;
  xpToNext: number;
}

const MODE_LABELS: Record<string, string> = {
  'ranked': 'Ranked',
  'quick': 'Quick Match',
  'private': 'Private',
  'training': 'Training',
  'league': 'League',
  'tournament': 'Tournament',
};

const LEVEL_COLORS = [
  'from-gray-500 to-gray-600',
  'from-emerald-500 to-emerald-600',
  'from-blue-500 to-blue-600',
  'from-purple-500 to-purple-600',
  'from-amber-500 to-orange-500',
  'from-red-500 to-red-600',
  'from-pink-500 to-pink-600',
  'from-cyan-500 to-cyan-600',
];

function normalizePollResult(data: any): { ok: boolean; queue_id?: string; status: string; match_room_id?: string | null; matched_at?: string | null; message?: string } | null {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

// Animated Card Component
function GameModeCard({ 
  href, 
  onClick,
  gradient, 
  icon: Icon, 
  title, 
  description, 
  badge,
  disabled = false,
  delay = 0 
}: { 
  href?: string;
  onClick?: () => void;
  gradient: string;
  icon: React.ElementType;
  title: string;
  description: string;
  badge?: string;
  disabled?: boolean;
  delay?: number;
}) {
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      whileHover={disabled ? {} : { scale: 1.02, y: -4 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-6 h-full cursor-pointer group ${disabled ? 'opacity-60' : ''}`}
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/20 transition-all duration-500" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full -ml-12 -mb-12 blur-xl" />
      
      {/* Shine effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="w-14 h-14 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
            <Icon className="w-7 h-7 text-white" />
          </div>
          {badge && (
            <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
              {badge}
            </Badge>
          )}
        </div>
        
        <h3 className="text-xl font-bold text-white mb-2 group-hover:tracking-wide transition-all duration-300">
          {title}
        </h3>
        <p className="text-white/80 text-sm leading-relaxed">
          {description}
        </p>
        
        <div className="mt-4 flex items-center text-white/60 text-sm font-medium group-hover:text-white transition-colors">
          <span>Play Now</span>
          <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
        </div>
      </div>
    </motion.div>
  );

  if (disabled) {
    return <div>{content}</div>;
  }

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return <div onClick={onClick}>{content}</div>;
}

// Stat Card Component
function StatCard({ label, value, icon: Icon, color, delay = 0 }: { label: string; value: string | number; icon: React.ElementType; color: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.3 }}
      className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-white/5"
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-gray-400 text-xs uppercase tracking-wider">{label}</p>
          <p className="text-white font-bold text-lg">{value}</p>
        </div>
      </div>
    </motion.div>
  );
}

// Training Mode Card
function TrainingModeCard({ 
  title, 
  description, 
  icon: Icon, 
  color,
  onClick,
  active = false 
}: { 
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border transition-all duration-300 ${
        active 
          ? `bg-gradient-to-r ${color} border-transparent` 
          : 'bg-slate-800/30 border-white/10 hover:border-white/20 hover:bg-slate-800/50'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${active ? 'bg-white/20' : `bg-gradient-to-br ${color}`}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h4 className={`font-semibold ${active ? 'text-white' : 'text-white/90'}`}>{title}</h4>
          <p className={`text-sm ${active ? 'text-white/80' : 'text-gray-400'}`}>{description}</p>
        </div>
        {active && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center"
          >
            <Sparkles className="w-3 h-3 text-white" />
          </motion.div>
        )}
      </div>
    </motion.button>
  );
}

// Match History Item
function MatchHistoryItem({ match, onShowStats, index }: { match: RecentMatch; onShowStats: () => void; index: number }) {
  const isWin = match.result === 'win';
  const isLoss = match.result === 'loss';
  const userLegs = match.player1_legs_won;
  const opponentLegs = match.player2_legs_won;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`group relative overflow-hidden rounded-xl border transition-all duration-300 hover:scale-[1.02] ${
        isWin 
          ? 'bg-gradient-to-r from-emerald-500/10 to-transparent border-emerald-500/20 hover:border-emerald-500/40' 
          : isLoss 
            ? 'bg-gradient-to-r from-red-500/10 to-transparent border-red-500/20 hover:border-red-500/40'
            : 'bg-slate-800/30 border-white/5 hover:border-white/20'
      }`}
    >
      {/* Glow effect */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${
        isWin ? 'bg-emerald-500/5' : isLoss ? 'bg-red-500/5' : ''
      }`} />
      
      <div className="relative p-4 flex items-center gap-4">
        {/* Result Icon */}
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold shadow-lg ${
          isWin 
            ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white' 
            : isLoss 
              ? 'bg-gradient-to-br from-red-500 to-red-600 text-white'
              : 'bg-gradient-to-br from-gray-500 to-gray-600 text-white'
        }`}>
          {isWin ? <Trophy className="w-6 h-6" /> : isLoss ? <X className="w-6 h-6" /> : <Dices className="w-6 h-6" />}
        </div>

        {/* Match Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-white font-semibold truncate">{match.player2_name}</span>
            <Badge variant="outline" className={`text-xs ${
              isWin ? 'border-emerald-500/50 text-emerald-400' : 
              isLoss ? 'border-red-500/50 text-red-400' : 
              'border-gray-500/50 text-gray-400'
            }`}>
              {isWin ? 'Victory' : isLoss ? 'Defeat' : 'Draw'}
            </Badge>
          </div>
          
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <span className="flex items-center gap-1">
              <Target className="w-3.5 h-3.5" />
              {match.game_mode}
            </span>
            <span>•</span>
            <span className={`font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
              {userLegs} - {opponentLegs}
            </span>
            <span>•</span>
            <span>{new Date(match.completed_at).toLocaleDateString()}</span>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-4 mt-2 text-xs">
            <span className="text-emerald-400/80">Avg: {match.three_dart_avg?.toFixed(1) || '0.0'}</span>
            <span className="text-amber-400/80">Best: {match.highest_checkout || '0'}</span>
            <span className="text-purple-400/80">Checkout: {match.checkout_percentage ? Math.round(match.checkout_percentage) : '0'}%</span>
          </div>
        </div>

        {/* Action Button */}
        <Button
          size="sm"
          onClick={onShowStats}
          className="bg-slate-700 hover:bg-slate-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <BarChart3 className="w-4 h-4" />
        </Button>
      </div>
    </motion.div>
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
  const [userStats, setUserStats] = useState<UserStats | null>(null);

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

      // Fetch user stats
      const { data: statsData } = await supabase
        .from('player_stats')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (statsData) {
        // Calculate level based on matches played
        const totalMatches = statsData.matches_played || 0;
        const level = Math.min(50, Math.floor(totalMatches / 10) + 1);
        const xp = (totalMatches % 10) * 10;
        
        setUserStats({
          totalMatches,
          wins: statsData.matches_won || 0,
          losses: statsData.matches_lost || 0,
          currentStreak: statsData.current_streak || 0,
          bestStreak: statsData.best_streak || 0,
          average: statsData.overall_3dart_avg || 0,
          highestCheckout: statsData.highest_checkout || 0,
          level,
          xp,
          xpToNext: 100,
        });
      }

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
      // Ignore
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

  const levelColor = LEVEL_COLORS[Math.min((userStats?.level || 1) - 1, LEVEL_COLORS.length - 1)];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Header Section with User Stats */}
        {userStats && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/10 p-6 sm:p-8"
          >
            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -mr-48 -mt-48" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -ml-32 -mb-32" />
            
            <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                {/* Level Badge */}
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br ${levelColor} flex items-center justify-center shadow-xl`}
                >
                  <div className="text-center">
                    <p className="text-xs text-white/80 uppercase tracking-wider">Level</p>
                    <p className="text-3xl sm:text-4xl font-black text-white">{userStats.level}</p>
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center border-2 border-white/20">
                    <Star className="w-4 h-4 text-amber-400" />
                  </div>
                </motion.div>

                <div>
                  <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">
                    Ready to Play?
                  </h1>
                  <p className="text-gray-400 text-lg">
                    {userStats.currentStreak > 0 ? (
                      <span className="flex items-center gap-2">
                        <Flame className="w-5 h-5 text-orange-500" />
                        On a {userStats.currentStreak} game win streak!
                      </span>
                    ) : (
                      'Choose your game mode and start your journey.'
                    )}
                  </p>
                  
                  {/* XP Bar */}
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex-1 max-w-xs">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-400">XP Progress</span>
                        <span className="text-emerald-400">{userStats.xp}/{userStats.xpToNext}</span>
                      </div>
                      <Progress value={(userStats.xp / userStats.xpToNext) * 100} className="h-2 bg-slate-700" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
                <StatCard label="Matches" value={userStats.totalMatches} icon={Gamepad2} color="from-blue-500 to-blue-600" delay={0.1} />
                <StatCard label="Win Rate" value={`${userStats.totalMatches > 0 ? Math.round((userStats.wins / userStats.totalMatches) * 100) : 0}%`} icon={TrendingUp} color="from-emerald-500 to-emerald-600" delay={0.2} />
                <StatCard label="Average" value={userStats.average.toFixed(1)} icon={Crosshair} color="from-purple-500 to-purple-600" delay={0.3} />
                <StatCard label="Best Checkout" value={userStats.highestCheckout} icon={Award} color="from-amber-500 to-orange-500" delay={0.4} />
              </div>
            </div>
          </motion.div>
        )}

        {/* Main Game Modes Grid */}
        <div>
          <motion.h2
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xl font-bold text-white mb-4 flex items-center gap-2"
          >
            <Sparkles className="w-5 h-5 text-amber-400" />
            Choose Your Battle
          </motion.h2>
          
          <div className="grid md:grid-cols-3 gap-4">
            <GameModeCard
              href="/app/ranked"
              gradient="from-amber-500 via-orange-500 to-red-500"
              icon={Crown}
              title="Ranked Match"
              description="Compete for glory on the global leaderboard. Climb ranks and prove you're the best!"
              badge="Competitive"
              disabled={rankedSearching}
              delay={0}
            />
            
            <GameModeCard
              href="/app/play/quick-match"
              gradient="from-emerald-500 via-teal-500 to-cyan-500"
              icon={Zap}
              title="Quick Match"
              description="Jump into casual matches instantly. Practice your skills without rank pressure."
              badge="Casual"
              disabled={rankedSearching}
              delay={0.1}
            />
            
            <GameModeCard
              onClick={() => setShowPrivateModal(true)}
              gradient="from-blue-500 via-indigo-500 to-purple-500"
              icon={Users}
              title="Private Match"
              description="Create a private room and invite friends. Play together in your own space."
              badge="Friends"
              disabled={rankedSearching}
              delay={0.2}
            />
          </div>
        </div>

        {/* Training Hub */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-3xl bg-gradient-to-br from-slate-800/30 to-slate-900/30 border border-white/5 p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Training Grounds</h2>
              <p className="text-gray-400 text-sm">Master your skills against DartBot or solo</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Training Mode Selection */}
            <div className="space-y-3">
              <TrainingModeCard
                title="301 vs Bot"
                description="Quick games starting at 301"
                icon={Target}
                color="from-blue-500 to-blue-600"
                onClick={() => setTrainingMode('301')}
                active={trainingMode === '301'}
              />
              <TrainingModeCard
                title="501 vs Bot"
                description="Classic darts starting at 501"
                icon={Target}
                color="from-purple-500 to-purple-600"
                onClick={() => setTrainingMode('501')}
                active={trainingMode === '501'}
              />
              <TrainingModeCard
                title="Practice Games"
                description="Solo training drills and challenges"
                icon={Sparkles}
                color="from-amber-500 to-orange-500"
                onClick={() => setTrainingMode('practice-games')}
                active={trainingMode === 'practice-games'}
              />
            </div>

            {/* Configuration Panel */}
            <div className="bg-slate-900/50 rounded-2xl p-5 border border-white/5">
              {trainingMode === 'practice-games' ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-300 mb-2 block">Select Training Game</label>
                    <Select value={practiceGameMode} onValueChange={(v) => setPracticeGameMode(v as any)}>
                      <SelectTrigger className="bg-slate-800 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-white/10">
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
                        <label className="text-xs text-gray-400 mb-1 block">Min Checkout</label>
                        <input
                          type="number"
                          min="2"
                          max="150"
                          value={finishMin}
                          onChange={(e) => setFinishMin(e.target.value)}
                          placeholder="2"
                          className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Max Checkout</label>
                        <input
                          type="number"
                          min="2"
                          max="170"
                          value={finishMax}
                          onChange={(e) => setFinishMax(e.target.value)}
                          placeholder="170"
                          className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-white"
                        />
                      </div>
                    </div>
                  )}

                  {practiceGameMode === 'killer' && (
                    <div>
                      <label className="text-xs text-gray-400 mb-1 block">Rounds</label>
                      <Select value={killerRounds.toString()} onValueChange={(v) => setKillerRounds(parseInt(v) as any)}>
                        <SelectTrigger className="bg-slate-800 border-white/10 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-white/10">
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
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Bot Level</label>
                    <Select value={botDifficulty} onValueChange={(v) => setBotDifficulty(v as any)}>
                      <SelectTrigger className="bg-slate-800 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-white/10">
                        {Object.entries(BOT_DIFFICULTY_CONFIG).map(([key, value]) => (
                          <SelectItem key={key} value={key}>{value.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Best Of</label>
                    <Select value={bestOf} onValueChange={(v) => setBestOf(v as any)}>
                      <SelectTrigger className="bg-slate-800 border-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-white/10">
                        <SelectItem value="best-of-1">1 Leg</SelectItem>
                        <SelectItem value="best-of-3">3 Legs</SelectItem>
                        <SelectItem value="best-of-5">5 Legs</SelectItem>
                        <SelectItem value="best-of-7">7 Legs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Double Out</label>
                    <button
                      onClick={() => setDoubleOut(!doubleOut)}
                      className={`w-full h-10 rounded-lg text-sm font-medium transition-colors ${
                        doubleOut ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-gray-400 border border-white/10'
                      }`}
                    >
                      {doubleOut ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              )}

              <Button
                onClick={handleStartTraining}
                className="w-full mt-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white font-semibold py-3"
              >
                <Play className="w-5 h-5 mr-2" />
                Start Training
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Recent Matches */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-blue-400" />
              Recent Battles
            </h2>
            <Link href="/app/history">
              <Button variant="ghost" className="text-gray-400 hover:text-white">
                View All
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>

          {loadingMatches ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
          ) : recentMatches.length === 0 ? (
            <div className="text-center py-12 bg-slate-800/30 rounded-2xl border border-white/5">
              <Target className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">No battles fought yet!</p>
              <p className="text-gray-500 text-sm mt-1">Start playing to see your match history</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentMatches.map((match, index) => (
                <MatchHistoryItem
                  key={match.id}
                  match={match}
                  onShowStats={() => handleShowStats(match.id)}
                  index={index}
                />
              ))}
            </div>
          )}
        </motion.div>

        {/* Ranked Search Modal */}
        <AnimatePresence>
          {showRankedSearch && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative w-full max-w-md"
              >
                <Card className="bg-slate-900 border-amber-500/30 p-8 overflow-hidden">
                  {/* Animated Background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-orange-500/10" />
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl" />
                  
                  <div className="relative z-10 text-center">
                    <div className="relative w-24 h-24 mx-auto mb-6">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 rounded-full border-4 border-amber-500/30 border-t-amber-500"
                      />
                      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                        <Crown className="w-10 h-10 text-white" />
                      </div>
                    </div>

                    <h3 className="text-2xl font-bold text-white mb-2">Finding Opponent</h3>
                    <p className="text-gray-400 mb-6">Searching for a worthy challenger...</p>

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
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
    </div>
  );
}
