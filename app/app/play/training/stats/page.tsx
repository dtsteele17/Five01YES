'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeft,
  BarChart3,
  Trophy,
  Target,
  TrendingUp,
  Flame,
  Zap,
  Clock,
  Dices,
  Crown,
  Activity,
  Filter,
  ChevronDown,
  RefreshCw,
  Star,
  Calendar,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────
interface TrainingSession {
  id: string;
  training_mode: string;
  xp_earned: number;
  created_at: string;
  session_data: any;
  score: number | null;
  completed: boolean;
}

interface MatchEntry {
  id: string;
  match_format: string;
  three_dart_avg: number | null;
  highest_checkout: number | null;
  result: string;
  played_at: string;
  session_data: any;
  total_darts: number | null;
}

// ── Mode scoring config ─────────────────────────────────────
// Defines what the "key stat" is per training mode
interface ModeConfig {
  value: string;
  label: string;
  icon: any;
  scoreName: string;         // Label for the key stat
  scoreUnit?: string;        // Optional unit (e.g. "pts", "darts")
  lowerIsBetter?: boolean;   // true for Around the Clock (fewer darts = better)
  getScore: (t: TrainingSession) => number;   // Extract score from training_stats
  getMatchScore?: (m: MatchEntry) => number;  // Extract score from match_history
}

const MODE_CONFIGS: ModeConfig[] = [
  {
    value: '121',
    label: '121',
    icon: Zap,
    scoreName: 'Highest Score',
    getScore: (t) => t.score || 0,
    getMatchScore: (m) => m.session_data?.final_score || m.session_data?.score || 0,
  },
  {
    value: 'around-the-clock',
    label: 'Around the Clock',
    icon: Clock,
    scoreName: 'Least Darts',
    scoreUnit: 'darts',
    lowerIsBetter: true,
    getScore: (t) => t.session_data?.total_darts || t.score || 0,
    getMatchScore: (m) => m.total_darts || m.session_data?.total_darts || 0,
  },
  {
    value: 'bobs-27',
    label: "Bob's 27",
    icon: Dices,
    scoreName: 'Highest Points',
    scoreUnit: 'pts',
    getScore: (t) => t.score || 0,
    getMatchScore: (m) => m.session_data?.score || m.session_data?.final_score || 0,
  },
  {
    value: 'finish-training',
    label: 'Finish Training',
    icon: Flame,
    scoreName: 'Highest Checkout',
    getScore: (t) => t.score || t.session_data?.highest_checkout || 0,
    getMatchScore: (m) => m.highest_checkout || 0,
  },
  {
    value: 'jdc-challenge',
    label: 'JDC Challenge',
    icon: TrendingUp,
    scoreName: 'Most Points',
    scoreUnit: 'pts',
    getScore: (t) => t.score || 0,
    getMatchScore: (m) => m.session_data?.score || m.session_data?.totalScore || 0,
  },
  {
    value: 'killer',
    label: 'Killer',
    icon: Activity,
    scoreName: 'Highest Points',
    scoreUnit: 'pts',
    getScore: (t) => t.score || 0,
    getMatchScore: (m) => m.session_data?.score || 0,
  },
  {
    value: 'pdc-challenge',
    label: 'PDC Challenge',
    icon: Crown,
    scoreName: 'Most Points',
    scoreUnit: 'pts',
    getScore: (t) => t.score || 0,
    getMatchScore: (m) => m.session_data?.score || m.session_data?.totalScore || 0,
  },
];

const TRAINING_FORMAT_VALUES = MODE_CONFIGS.map(m => m.value);

const ALL_MODES = [
  { value: 'all', label: 'All Training', icon: Target },
  ...MODE_CONFIGS.map(m => ({ value: m.value, label: m.label, icon: m.icon })),
];

function getModeConfig(mode: string): ModeConfig | undefined {
  return MODE_CONFIGS.find(m => m.value === mode);
}

function formatModeName(mode: string): string {
  return getModeConfig(mode)?.label || mode;
}

function getModeIcon(mode: string) {
  const config = getModeConfig(mode);
  const Icon = config?.icon || Target;
  return <Icon className="w-5 h-5" />;
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Get session score based on mode
function getSessionScore(session: TrainingSession | MatchEntry, isMatch: boolean): number {
  const mode = isMatch ? (session as MatchEntry).match_format : (session as TrainingSession).training_mode;
  const config = getModeConfig(mode);
  if (!config) return 0;
  if (isMatch) return config.getMatchScore ? config.getMatchScore(session as MatchEntry) : 0;
  return config.getScore(session as TrainingSession);
}

function getSessionScoreLabel(mode: string): string {
  const config = getModeConfig(mode);
  if (!config) return 'Score';
  return config.scoreName;
}

// ── Components ──────────────────────────────────────────────

function FilterButton({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        active
          ? 'bg-purple-500 text-white'
          : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({ value, label, icon, color, sublabel }: {
  value: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  sublabel?: string;
}) {
  return (
    <Card className="relative overflow-hidden bg-slate-800/40 border-slate-700/50 p-4 sm:p-5">
      <div className={`absolute top-0 left-0 w-1 h-full ${color}`} />
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight">{value}</p>
          <p className="text-slate-400 text-xs sm:text-sm mt-1 uppercase tracking-wider font-medium">{label}</p>
          {sublabel && <p className="text-slate-500 text-xs mt-1">{sublabel}</p>}
        </div>
        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl ${color} bg-opacity-20 flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

function SessionRow({ session, isMatch }: { session: MatchEntry | TrainingSession; isMatch: boolean }) {
  const mode = isMatch ? (session as MatchEntry).match_format : (session as TrainingSession).training_mode;
  const date = isMatch ? (session as MatchEntry).played_at : (session as TrainingSession).created_at;
  const xp = isMatch ? 0 : (session as TrainingSession).xp_earned;
  const avg = isMatch ? (session as MatchEntry).three_dart_avg : null;
  const checkout = isMatch ? (session as MatchEntry).highest_checkout : null;
  const result = isMatch ? (session as MatchEntry).result : null;
  const totalDarts = isMatch ? (session as MatchEntry).total_darts : null;
  const config = getModeConfig(mode);
  const score = getSessionScore(session, isMatch);

  return (
    <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-slate-900/40 border border-slate-700/30 hover:border-slate-600/50 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
        {getModeIcon(mode)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-white font-semibold text-sm truncate">{formatModeName(mode)}</p>
          {result && (
            <Badge className={`text-[10px] ${result === 'win' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {result === 'win' ? 'W' : 'L'}
            </Badge>
          )}
        </div>
        <p className="text-slate-500 text-xs">{timeAgo(date)}</p>
      </div>
      <div className="flex items-center gap-4 sm:gap-6 shrink-0">
        {/* Mode-specific key stat */}
        {score > 0 && config && (
          <div className="text-right">
            <p className="text-white font-bold text-sm">{config.lowerIsBetter ? score : score}</p>
            <p className="text-slate-500 text-[10px] uppercase">{config.scoreName.split(' ').pop()}</p>
          </div>
        )}
        {/* 3-dart avg if available */}
        {avg != null && avg > 0 && (
          <div className="text-right">
            <p className="text-white font-bold text-sm">{avg.toFixed(1)}</p>
            <p className="text-slate-500 text-[10px] uppercase">Avg</p>
          </div>
        )}
        {/* Checkout if available and mode isn't finish-training (already shown as key stat) */}
        {checkout != null && checkout > 0 && mode !== 'finish-training' && (
          <div className="text-right">
            <p className="text-white font-bold text-sm">{checkout}</p>
            <p className="text-slate-500 text-[10px] uppercase">CO</p>
          </div>
        )}
        {/* Darts thrown for around-the-clock from match_history */}
        {totalDarts != null && totalDarts > 0 && mode !== 'around-the-clock' && (
          <div className="text-right">
            <p className="text-white font-bold text-sm">{totalDarts}</p>
            <p className="text-slate-500 text-[10px] uppercase">Darts</p>
          </div>
        )}
        {xp > 0 && (
          <div className="text-right">
            <p className="text-amber-400 font-bold text-sm">+{xp}</p>
            <p className="text-slate-500 text-[10px] uppercase">XP</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Per-mode breakdown card with mode-specific best score
function ModeBreakdownCard({ mode, sessions, matches }: {
  mode: string;
  sessions: TrainingSession[];
  matches: MatchEntry[];
}) {
  const config = getModeConfig(mode);
  if (!config) return null;
  const totalCount = sessions.length + matches.length;
  if (totalCount === 0) return null;

  // Get all scores for this mode
  const allScores = [
    ...sessions.map(s => config.getScore(s)),
    ...matches.map(m => config.getMatchScore ? config.getMatchScore(m) : 0),
  ].filter(s => s > 0);

  const bestScore = allScores.length > 0
    ? config.lowerIsBetter
      ? Math.min(...allScores)
      : Math.max(...allScores)
    : 0;

  const avgScore = allScores.length > 0
    ? allScores.reduce((a, b) => a + b, 0) / allScores.length
    : 0;

  const totalXp = sessions.reduce((s, t) => s + (t.xp_earned || 0), 0);

  return (
    <Card className="bg-slate-800/40 border-slate-700/50 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
          {getModeIcon(mode)}
        </div>
        <div>
          <p className="text-white font-bold text-sm">{config.label}</p>
          <p className="text-slate-500 text-xs">{totalCount} session{totalCount !== 1 ? 's' : ''}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {bestScore > 0 && (
          <div className="bg-slate-900/40 rounded-lg p-2">
            <p className="text-slate-400">{config.lowerIsBetter ? 'Best' : config.scoreName}</p>
            <p className="text-white font-bold">{Math.round(bestScore)}{config.scoreUnit ? ` ${config.scoreUnit}` : ''}</p>
          </div>
        )}
        {avgScore > 0 && (
          <div className="bg-slate-900/40 rounded-lg p-2">
            <p className="text-slate-400">Average</p>
            <p className="text-white font-bold">{avgScore.toFixed(1)}{config.scoreUnit ? ` ${config.scoreUnit}` : ''}</p>
          </div>
        )}
        <div className="bg-slate-900/40 rounded-lg p-2">
          <p className="text-slate-400">Total XP</p>
          <p className="text-amber-400 font-bold">{totalXp}</p>
        </div>
        <div className="bg-slate-900/40 rounded-lg p-2">
          <p className="text-slate-400">Sessions</p>
          <p className="text-purple-400 font-bold">{totalCount}</p>
        </div>
      </div>
    </Card>
  );
}

// ── Main Page ───────────────────────────────────────────────
export default function TrainingStatsPage() {
  const [modeFilter, setModeFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [trainingStats, setTrainingStats] = useState<TrainingSession[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: tsData } = await supabase
        .from('training_stats')
        .select('*')
        .eq('player_id', user.id)
        .in('training_mode', TRAINING_FORMAT_VALUES)
        .order('created_at', { ascending: false });

      const { data: mhData } = await supabase
        .from('match_history')
        .select('id, match_format, three_dart_avg, highest_checkout, result, played_at, session_data, total_darts')
        .eq('user_id', user.id)
        .in('match_format', TRAINING_FORMAT_VALUES)
        .order('played_at', { ascending: false });

      setTrainingStats(tsData || []);
      setMatchHistory(mhData || []);
    } catch (err) {
      console.error('Error fetching training stats:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredMatches = useMemo(() => {
    if (modeFilter === 'all') return matchHistory;
    return matchHistory.filter(m => m.match_format === modeFilter);
  }, [matchHistory, modeFilter]);

  const filteredTraining = useMemo(() => {
    if (modeFilter === 'all') return trainingStats;
    return trainingStats.filter(t => t.training_mode === modeFilter);
  }, [trainingStats, modeFilter]);

  // Aggregate stats (mode-aware when filtered)
  const aggregated = useMemo(() => {
    const totalSessions = filteredMatches.length + filteredTraining.length;
    const totalXp = filteredTraining.reduce((s, t) => s + (t.xp_earned || 0), 0);
    const bestCheckout = filteredMatches.reduce((max, m) => Math.max(max, m.highest_checkout || 0), 0);
    const validAvgs = filteredMatches.filter(m => m.three_dart_avg && m.three_dart_avg > 0).map(m => m.three_dart_avg!);
    const avg3Dart = validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : 0;

    // Mode-specific average when filtered to a single mode
    let modeAvg = 0;
    let modeAvgLabel = '';
    if (modeFilter !== 'all') {
      const config = getModeConfig(modeFilter);
      if (config) {
        const allScores = [
          ...filteredTraining.map(s => config.getScore(s)),
          ...filteredMatches.map(m => config.getMatchScore ? config.getMatchScore(m) : 0),
        ].filter(s => s > 0);
        if (allScores.length > 0) {
          modeAvg = allScores.reduce((a, b) => a + b, 0) / allScores.length;
          modeAvgLabel = `Avg ${config.scoreName}`;
        }
      }
    }

    // Mode-specific best
    let modeBest = 0;
    let modeBestLabel = '';
    if (modeFilter !== 'all') {
      const config = getModeConfig(modeFilter);
      if (config) {
        const allScores = [
          ...filteredTraining.map(s => config.getScore(s)),
          ...filteredMatches.map(m => config.getMatchScore ? config.getMatchScore(m) : 0),
        ].filter(s => s > 0);
        if (allScores.length > 0) {
          modeBest = config.lowerIsBetter ? Math.min(...allScores) : Math.max(...allScores);
          modeBestLabel = config.lowerIsBetter ? `Best (Fewest)` : config.scoreName;
        }
      }
    }

    return { totalSessions, totalXp, avg3Dart, bestCheckout, modeAvg, modeAvgLabel, modeBest, modeBestLabel };
  }, [filteredMatches, filteredTraining, modeFilter]);

  // Combined recent sessions
  const recentSessions = useMemo(() => {
    const combined: { item: MatchEntry | TrainingSession; isMatch: boolean; date: string }[] = [];
    for (const m of filteredMatches) combined.push({ item: m, isMatch: true, date: m.played_at });
    for (const t of filteredTraining) combined.push({ item: t, isMatch: false, date: t.created_at });
    combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return combined.slice(0, 20);
  }, [filteredMatches, filteredTraining]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="h-16 bg-slate-800/50 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-slate-800/50 rounded-2xl animate-pulse" />)}
        </div>
        <div className="h-64 bg-slate-800/50 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const isFiltered = modeFilter !== 'all';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <Link href="/app/play/training" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-2">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Training</span>
          </Link>
          <p className="text-purple-400 text-sm font-semibold uppercase tracking-wider mb-2">Training</p>
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-black text-white tracking-tight">Training Statistics</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="border-slate-600 text-slate-300 hover:text-white">
            <Filter className="w-4 h-4 mr-2" />
            Filters
            <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
          <Button onClick={fetchData} variant="outline" className="border-slate-600 text-slate-300 hover:text-white">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="bg-slate-800/40 border-slate-700/50 p-4 sm:p-6">
          <label className="text-slate-400 text-sm mb-3 block font-medium">Training Mode</label>
          <div className="flex flex-wrap gap-2">
            {ALL_MODES.map((mode) => (
              <FilterButton key={mode.value} active={modeFilter === mode.value} onClick={() => setModeFilter(mode.value)}>
                {mode.label}
              </FilterButton>
            ))}
          </div>
          {isFiltered && (
            <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center gap-2">
              <span className="text-slate-400 text-sm">Active:</span>
              <Badge className="bg-purple-500/20 text-purple-400">{formatModeName(modeFilter)}</Badge>
              <Button variant="ghost" size="sm" onClick={() => setModeFilter('all')} className="text-slate-400 hover:text-white">Clear</Button>
            </div>
          )}
        </Card>
      )}

      {/* Top Stats — changes based on filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          value={String(aggregated.totalSessions)}
          label="Total Sessions"
          icon={<Target className="w-5 h-5 text-white" />}
          color="bg-purple-500"
        />
        {isFiltered && aggregated.modeBest > 0 ? (
          <StatCard
            value={String(Math.round(aggregated.modeBest))}
            label={aggregated.modeBestLabel}
            icon={<Trophy className="w-5 h-5 text-white" />}
            color="bg-amber-500"
          />
        ) : (
          <StatCard
            value={aggregated.avg3Dart > 0 ? aggregated.avg3Dart.toFixed(1) : '-'}
            label="Avg 3-Dart"
            icon={<TrendingUp className="w-5 h-5 text-white" />}
            color="bg-emerald-500"
            sublabel="Across training sessions"
          />
        )}
        {isFiltered && aggregated.modeAvg > 0 ? (
          <StatCard
            value={aggregated.modeAvg.toFixed(1)}
            label={aggregated.modeAvgLabel}
            icon={<BarChart3 className="w-5 h-5 text-white" />}
            color="bg-emerald-500"
          />
        ) : (
          <StatCard
            value={aggregated.bestCheckout > 0 ? String(aggregated.bestCheckout) : '-'}
            label="Best Checkout"
            icon={<Trophy className="w-5 h-5 text-white" />}
            color="bg-amber-500"
          />
        )}
        <StatCard
          value={aggregated.totalXp.toLocaleString()}
          label="Training XP"
          icon={<Star className="w-5 h-5 text-white" />}
          color="bg-blue-500"
        />
      </div>

      {/* Per-Mode Breakdown (only when showing all) */}
      {!isFiltered && (
        <Card className="bg-slate-800/40 border-slate-700/50 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
                <Trophy className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Best Scores by Mode</h2>
                <p className="text-slate-400 text-sm">Your personal bests for each training game</p>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {MODE_CONFIGS.map(config => (
                <ModeBreakdownCard
                  key={config.value}
                  mode={config.value}
                  sessions={trainingStats.filter(t => t.training_mode === config.value)}
                  matches={matchHistory.filter(m => m.match_format === config.value)}
                />
              ))}
            </div>
            {MODE_CONFIGS.every(config => {
              const count = trainingStats.filter(t => t.training_mode === config.value).length +
                matchHistory.filter(m => m.match_format === config.value).length;
              return count === 0;
            }) && (
              <div className="text-center py-8">
                <Target className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400">No training data yet. Play some training games to see your breakdown.</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Recent Sessions */}
      <Card className="bg-slate-800/40 border-slate-700/50 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Recent Sessions</h2>
              <p className="text-slate-400 text-sm">
                {isFiltered ? formatModeName(modeFilter) : 'All training modes'}
                {' · '}{recentSessions.length} recent
              </p>
            </div>
          </div>
        </div>
        <div className="p-4 sm:p-6">
          {recentSessions.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="w-14 h-14 text-slate-600 mx-auto mb-3" />
              <h3 className="text-white font-bold mb-2">No Sessions Yet</h3>
              <p className="text-slate-400 text-sm mb-4">
                {isFiltered
                  ? `No ${formatModeName(modeFilter)} sessions found. Try a different filter or play some games.`
                  : 'Play some training games to see your session history here.'
                }
              </p>
              <Link href="/app/play/training">
                <Button className="bg-purple-600 hover:bg-purple-700 text-white">Start Training</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentSessions.map((s, i) => (
                <SessionRow key={`${s.isMatch ? 'm' : 't'}-${(s.item as any).id}-${i}`} session={s.item} isMatch={s.isMatch} />
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
