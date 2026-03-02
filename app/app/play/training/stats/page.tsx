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
  Crosshair,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────
interface TrainingSession {
  id: string;
  training_mode: string;
  game_type: string;
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

// All format values that match training modes (including ATC sub-modes)
const TRAINING_FORMAT_VALUES = [
  '121', 'around-the-clock', 'around-the-clock-singles', 'around-the-clock-doubles',
  'around-the-clock-trebles', 'around-the-clock-mixed',
  'bobs-27', 'bobs27', 'finish-training', 'jdc-challenge', 'jdc_challenge',
  'killer', 'pdc-challenge', 'pdc_challenge',
];

// Map various stored mode names to canonical filter values
function canonicalMode(mode: string): string {
  if (mode.startsWith('around-the-clock')) return 'around-the-clock';
  if (mode === 'bobs27') return 'bobs-27';
  if (mode === 'jdc_challenge') return 'jdc-challenge';
  if (mode === 'pdc_challenge') return 'pdc-challenge';
  return mode;
}

// ATC sub-mode from a training_mode string
function getATCSubMode(mode: string): string | null {
  if (mode === 'around-the-clock-singles') return 'Singles';
  if (mode === 'around-the-clock-doubles') return 'Doubles';
  if (mode === 'around-the-clock-trebles') return 'Trebles';
  if (mode === 'around-the-clock-mixed') return 'Mixed';
  if (mode === 'around-the-clock') return null;
  return null;
}

const ATC_SUB_MODES = [
  { value: 'all', label: 'All Modes' },
  { value: 'around-the-clock-singles', label: 'Singles' },
  { value: 'around-the-clock-doubles', label: 'Doubles' },
  { value: 'around-the-clock-trebles', label: 'Trebles' },
  { value: 'around-the-clock-mixed', label: 'Mixed' },
];

// ── Mode config ─────────────────────────────────────────────
const MODE_FILTERS = [
  { value: 'all', label: 'All Training', icon: Target },
  { value: '121', label: '121', icon: Zap },
  { value: 'around-the-clock', label: 'Around the Clock', icon: Clock },
  { value: 'bobs-27', label: "Bob's 27", icon: Dices },
  { value: 'finish-training', label: 'Finish Training', icon: Flame },
  { value: 'jdc-challenge', label: 'JDC Challenge', icon: TrendingUp },
  { value: 'killer', label: 'Killer', icon: Activity },
  { value: 'pdc-challenge', label: 'PDC Challenge', icon: Crown },
];

const BREAKDOWN_MODES = MODE_FILTERS.filter(m => m.value !== 'all');

function formatModeName(mode: string): string {
  const canonical = canonicalMode(mode);
  const found = MODE_FILTERS.find(m => m.value === canonical);
  return found?.label || mode;
}

function getModeIcon(mode: string) {
  const canonical = canonicalMode(mode);
  const found = MODE_FILTERS.find(m => m.value === canonical);
  const Icon = found?.icon || Target;
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

// ── Score extraction helpers ────────────────────────────────

// 121: highest target reached
function get121Score(s: TrainingSession): number {
  return s.session_data?.highestTarget || s.score || 0;
}

// Bob's 27: final score (points)
function getBobs27Score(s: TrainingSession): number {
  return s.score || s.session_data?.score || 0;
}

// Finish Training: number of checkouts
function getFinishCheckoutCount(s: TrainingSession): number {
  return s.session_data?.successfulCheckouts || s.session_data?.finishesHit?.length || 0;
}

// Finish Training: list of checkout values
function getFinishCheckoutValues(s: TrainingSession): number[] {
  return s.session_data?.finishesHit || [];
}

// Finish Training: highest checkout
function getFinishHighestCheckout(s: TrainingSession): number {
  const hits = getFinishCheckoutValues(s);
  return hits.length > 0 ? Math.max(...hits) : (s.score || 0);
}

// JDC/PDC: points scored
function getChallengePoints(s: TrainingSession): number {
  return s.score || s.session_data?.totalScore || 0;
}

// Around the Clock: darts thrown
function getATCDarts(s: TrainingSession): number {
  return s.session_data?.total_darts || s.session_data?.totalDarts || s.score || 0;
}

// ATC: accuracy
function getATCAccuracy(s: TrainingSession): number {
  const acc = s.session_data?.accuracy;
  if (typeof acc === 'number') return acc;
  if (typeof acc === 'string') return parseFloat(acc) || 0;
  const hits = s.session_data?.total_hits || 0;
  const darts = s.session_data?.total_darts || 1;
  return darts > 0 ? (hits / darts) * 100 : 0;
}

// Bob's 27: accuracy
function getBobs27Accuracy(s: TrainingSession): number {
  const acc = s.session_data?.accuracy;
  if (typeof acc === 'number') return acc;
  if (typeof acc === 'string') return parseFloat(acc) || 0;
  const hits = s.session_data?.total_hits || 0;
  const darts = s.session_data?.total_darts || 1;
  return darts > 0 ? (hits / darts) * 100 : 0;
}

// ── Components ──────────────────────────────────────────────

function FilterButton({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
        active ? 'bg-purple-500 text-white' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({ value, label, icon, color, sublabel }: {
  value: string; label: string; icon: React.ReactNode; color: string; sublabel?: string;
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

// ── Session Row ─────────────────────────────────────────────
function SessionRow({ session, isMatch }: { session: MatchEntry | TrainingSession; isMatch: boolean }) {
  const rawMode = isMatch ? (session as MatchEntry).match_format : (session as TrainingSession).training_mode || (session as TrainingSession).game_type;
  const mode = canonicalMode(rawMode);
  const date = isMatch ? (session as MatchEntry).played_at : (session as TrainingSession).created_at;
  const xp = isMatch ? 0 : (session as TrainingSession).xp_earned;
  const result = isMatch ? (session as MatchEntry).result : null;
  const ts = !isMatch ? (session as TrainingSession) : null;

  // ATC sub-mode label
  const atcSub = getATCSubMode(rawMode);

  // Mode-specific stats for the row
  const renderStats = () => {
    const stats: React.ReactNode[] = [];

    if (mode === '121' && ts) {
      const score = get121Score(ts);
      if (score > 121) {
        stats.push(
          <div key="score" className="text-right">
            <p className="text-white font-bold text-sm">{score}</p>
            <p className="text-slate-500 text-[10px] uppercase">Highest</p>
          </div>
        );
      } else {
        stats.push(
          <div key="score" className="text-right">
            <p className="text-slate-500 font-medium text-sm">No Score</p>
          </div>
        );
      }
    } else if (mode === 'bobs-27' && ts) {
      const score = getBobs27Score(ts);
      stats.push(
        <div key="score" className="text-right">
          <p className="text-white font-bold text-sm">{score > 0 ? `${score} pts` : 'No Score'}</p>
          {score > 0 && <p className="text-slate-500 text-[10px] uppercase">Score</p>}
        </div>
      );
    } else if (mode === 'finish-training' && ts) {
      const checkouts = getFinishCheckoutValues(ts);
      const count = getFinishCheckoutCount(ts);
      if (count > 0) {
        stats.push(
          <div key="co" className="text-right">
            <p className="text-white font-bold text-sm">{count} checkout{count !== 1 ? 's' : ''}</p>
            <p className="text-slate-500 text-[10px]">{checkouts.join(', ')}</p>
          </div>
        );
      } else {
        stats.push(
          <div key="co" className="text-right">
            <p className="text-slate-500 font-medium text-sm">No Score Yet</p>
          </div>
        );
      }
    } else if ((mode === 'jdc-challenge' || mode === 'pdc-challenge') && ts) {
      const pts = getChallengePoints(ts);
      stats.push(
        <div key="pts" className="text-right">
          <p className="text-white font-bold text-sm">{pts > 0 ? pts : '-'}</p>
          <p className="text-slate-500 text-[10px] uppercase">Points</p>
        </div>
      );
    } else if (mode === 'around-the-clock' && ts) {
      const darts = getATCDarts(ts);
      const acc = getATCAccuracy(ts);
      if (darts > 0) {
        stats.push(
          <div key="darts" className="text-right">
            <p className="text-white font-bold text-sm">{darts}</p>
            <p className="text-slate-500 text-[10px] uppercase">Darts</p>
          </div>
        );
      }
      if (acc > 0) {
        stats.push(
          <div key="acc" className="text-right">
            <p className="text-white font-bold text-sm">{acc.toFixed(1)}%</p>
            <p className="text-slate-500 text-[10px] uppercase">Acc</p>
          </div>
        );
      }
      if (darts === 0 && acc === 0) {
        stats.push(<div key="ns" className="text-right"><p className="text-slate-500 font-medium text-sm">No Score Yet</p></div>);
      }
    } else if (mode === 'killer' && ts) {
      const score = ts.score || 0;
      stats.push(
        <div key="pts" className="text-right">
          <p className="text-white font-bold text-sm">{score > 0 ? `${score} pts` : 'No Score Yet'}</p>
          {score > 0 && <p className="text-slate-500 text-[10px] uppercase">Points</p>}
        </div>
      );
    } else if (isMatch) {
      // Match history fallback
      const m = session as MatchEntry;
      if (m.three_dart_avg && m.three_dart_avg > 0) {
        stats.push(
          <div key="avg" className="text-right">
            <p className="text-white font-bold text-sm">{m.three_dart_avg.toFixed(1)}</p>
            <p className="text-slate-500 text-[10px] uppercase">Avg</p>
          </div>
        );
      }
    }

    if (xp > 0) {
      stats.push(
        <div key="xp" className="text-right">
          <p className="text-amber-400 font-bold text-sm">+{xp}</p>
          <p className="text-slate-500 text-[10px] uppercase">XP</p>
        </div>
      );
    }

    return stats;
  };

  return (
    <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-slate-900/40 border border-slate-700/30 hover:border-slate-600/50 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
        {getModeIcon(mode)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-white font-semibold text-sm truncate">{formatModeName(mode)}</p>
          {atcSub && <Badge className="text-[10px] bg-slate-700 text-slate-300">{atcSub}</Badge>}
          {result && (
            <Badge className={`text-[10px] ${result === 'win' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
              {result === 'win' ? 'W' : 'L'}
            </Badge>
          )}
        </div>
        <p className="text-slate-500 text-xs">{timeAgo(date)}</p>
      </div>
      <div className="flex items-center gap-4 sm:gap-6 shrink-0">
        {renderStats()}
      </div>
    </div>
  );
}

// ── Breakdown Card ──────────────────────────────────────────
function ModeBreakdownCard({ mode, sessions }: { mode: string; sessions: TrainingSession[] }) {
  if (sessions.length === 0) return null;
  const totalXp = sessions.reduce((s, t) => s + (t.xp_earned || 0), 0);

  const renderKeyStats = () => {
    if (mode === '121') {
      const scores = sessions.map(s => get121Score(s)).filter(s => s > 121);
      const best = scores.length > 0 ? Math.max(...scores) : 0;
      return (
        <div className="bg-slate-900/40 rounded-lg p-2">
          <p className="text-slate-400">Highest Score</p>
          <p className="text-white font-bold">{best > 0 ? best : 'No Score Yet'}</p>
        </div>
      );
    }
    if (mode === 'bobs-27') {
      const scores = sessions.map(s => getBobs27Score(s)).filter(s => s > 0);
      const best = scores.length > 0 ? Math.max(...scores) : 0;
      return (
        <div className="bg-slate-900/40 rounded-lg p-2">
          <p className="text-slate-400">Highest Score</p>
          <p className="text-white font-bold">{best > 0 ? `${best} pts` : 'No Score Yet'}</p>
        </div>
      );
    }
    if (mode === 'finish-training') {
      const totalCheckouts = sessions.reduce((s, t) => s + getFinishCheckoutCount(t), 0);
      const highest = sessions.reduce((max, t) => Math.max(max, getFinishHighestCheckout(t)), 0);
      return (
        <>
          <div className="bg-slate-900/40 rounded-lg p-2">
            <p className="text-slate-400">Total Checkouts</p>
            <p className="text-white font-bold">{totalCheckouts}</p>
          </div>
          <div className="bg-slate-900/40 rounded-lg p-2">
            <p className="text-slate-400">Highest CO</p>
            <p className="text-white font-bold">{highest > 0 ? highest : '-'}</p>
          </div>
        </>
      );
    }
    if (mode === 'jdc-challenge' || mode === 'pdc-challenge') {
      const scores = sessions.map(s => getChallengePoints(s)).filter(s => s > 0);
      const best = scores.length > 0 ? Math.max(...scores) : 0;
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return (
        <>
          <div className="bg-slate-900/40 rounded-lg p-2">
            <p className="text-slate-400">Most Points</p>
            <p className="text-white font-bold">{best > 0 ? `${best} pts` : 'No Score Yet'}</p>
          </div>
          <div className="bg-slate-900/40 rounded-lg p-2">
            <p className="text-slate-400">Average</p>
            <p className="text-white font-bold">{avg > 0 ? `${avg.toFixed(1)} pts` : '-'}</p>
          </div>
        </>
      );
    }
    if (mode === 'around-the-clock') {
      const darts = sessions.map(s => getATCDarts(s)).filter(s => s > 0);
      const best = darts.length > 0 ? Math.min(...darts) : 0;
      return (
        <div className="bg-slate-900/40 rounded-lg p-2">
          <p className="text-slate-400">Fewest Darts</p>
          <p className="text-white font-bold">{best > 0 ? best : 'No Score Yet'}</p>
        </div>
      );
    }
    if (mode === 'killer') {
      const scores = sessions.map(s => s.score || 0).filter(s => s > 0);
      const best = scores.length > 0 ? Math.max(...scores) : 0;
      return (
        <div className="bg-slate-900/40 rounded-lg p-2">
          <p className="text-slate-400">Highest Points</p>
          <p className="text-white font-bold">{best > 0 ? `${best} pts` : 'No Score Yet'}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="bg-slate-800/40 border-slate-700/50 p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
          {getModeIcon(mode)}
        </div>
        <div>
          <p className="text-white font-bold text-sm">{formatModeName(mode)}</p>
          <p className="text-slate-500 text-xs">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {renderKeyStats()}
        <div className="bg-slate-900/40 rounded-lg p-2">
          <p className="text-slate-400">Total XP</p>
          <p className="text-amber-400 font-bold">{totalXp}</p>
        </div>
        <div className="bg-slate-900/40 rounded-lg p-2">
          <p className="text-slate-400">Sessions</p>
          <p className="text-purple-400 font-bold">{sessions.length}</p>
        </div>
      </div>
    </Card>
  );
}

// ── Main Page ───────────────────────────────────────────────
export default function TrainingStatsPage() {
  const [modeFilter, setModeFilter] = useState('all');
  const [atcSubFilter, setAtcSubFilter] = useState('all');
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
        .order('created_at', { ascending: false });

      const { data: mhData } = await supabase
        .from('match_history')
        .select('id, match_format, three_dart_avg, highest_checkout, result, played_at, session_data, total_darts')
        .eq('user_id', user.id)
        .in('match_format', TRAINING_FORMAT_VALUES)
        .order('played_at', { ascending: false });

      // Filter training_stats to only training modes (exclude dartbot etc)
      const filtered = (tsData || []).filter(t => {
        const mode = t.training_mode || t.game_type || '';
        return TRAINING_FORMAT_VALUES.includes(mode) || TRAINING_FORMAT_VALUES.includes(canonicalMode(mode));
      });

      setTrainingStats(filtered);
      setMatchHistory(mhData || []);
    } catch (err) {
      console.error('Error fetching training stats:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset ATC sub-filter when mode changes
  useEffect(() => { if (modeFilter !== 'around-the-clock') setAtcSubFilter('all'); }, [modeFilter]);

  // Filter sessions
  const filteredTraining = useMemo(() => {
    let sessions = trainingStats;
    if (modeFilter !== 'all') {
      sessions = sessions.filter(t => {
        const mode = t.training_mode || t.game_type || '';
        return canonicalMode(mode) === modeFilter;
      });
    }
    // ATC sub-filter
    if (modeFilter === 'around-the-clock' && atcSubFilter !== 'all') {
      sessions = sessions.filter(t => {
        const mode = t.training_mode || t.game_type || '';
        return mode === atcSubFilter;
      });
    }
    return sessions;
  }, [trainingStats, modeFilter, atcSubFilter]);

  const filteredMatches = useMemo(() => {
    if (modeFilter === 'all') return matchHistory;
    return matchHistory.filter(m => canonicalMode(m.match_format) === modeFilter);
  }, [matchHistory, modeFilter]);

  // Aggregate stats
  const aggregated = useMemo(() => {
    const totalSessions = filteredTraining.length + filteredMatches.length;
    const totalXp = filteredTraining.reduce((s, t) => s + (t.xp_earned || 0), 0);
    return { totalSessions, totalXp };
  }, [filteredTraining, filteredMatches]);

  // Mode-specific top cards
  const modeCards = useMemo(() => {
    if (modeFilter === '121') {
      const scores = filteredTraining.map(s => get121Score(s)).filter(s => s > 121);
      const best = scores.length > 0 ? Math.max(...scores) : 0;
      return {
        card2: { value: best > 0 ? String(best) : 'No Score Yet', label: 'Highest Score', icon: <Trophy className="w-5 h-5 text-white" />, color: 'bg-amber-500' },
        card3: null,
      };
    }
    if (modeFilter === 'around-the-clock') {
      const darts = filteredTraining.map(s => getATCDarts(s)).filter(s => s > 0);
      const best = darts.length > 0 ? Math.min(...darts) : 0;
      const accs = filteredTraining.map(s => getATCAccuracy(s)).filter(a => a > 0);
      const avgAcc = accs.length > 0 ? accs.reduce((a, b) => a + b, 0) / accs.length : 0;
      return {
        card2: { value: best > 0 ? String(best) : '-', label: 'Lowest Darts Thrown', icon: <Clock className="w-5 h-5 text-white" />, color: 'bg-emerald-500' },
        card3: { value: avgAcc > 0 ? `${avgAcc.toFixed(1)}%` : '-', label: 'Accuracy', icon: <Crosshair className="w-5 h-5 text-white" />, color: 'bg-amber-500' },
      };
    }
    if (modeFilter === 'bobs-27') {
      const scores = filteredTraining.map(s => getBobs27Score(s)).filter(s => s > 0);
      const best = scores.length > 0 ? Math.max(...scores) : 0;
      const accs = filteredTraining.map(s => getBobs27Accuracy(s)).filter(a => a > 0);
      const avgAcc = accs.length > 0 ? accs.reduce((a, b) => a + b, 0) / accs.length : 0;
      return {
        card2: { value: best > 0 ? `${best}` : '-', label: 'Highest Score', icon: <Trophy className="w-5 h-5 text-white" />, color: 'bg-emerald-500' },
        card3: { value: avgAcc > 0 ? `${avgAcc.toFixed(1)}%` : '-', label: 'Accuracy', icon: <Crosshair className="w-5 h-5 text-white" />, color: 'bg-amber-500' },
      };
    }
    if (modeFilter === 'finish-training') {
      const totalCheckouts = filteredTraining.reduce((s, t) => s + getFinishCheckoutCount(t), 0);
      const highest = filteredTraining.reduce((max, t) => Math.max(max, getFinishHighestCheckout(t)), 0);
      return {
        card2: { value: highest > 0 ? String(highest) : '-', label: 'Highest Checkout', icon: <Trophy className="w-5 h-5 text-white" />, color: 'bg-amber-500' },
        card3: { value: String(totalCheckouts), label: 'Total Checkouts', icon: <Flame className="w-5 h-5 text-white" />, color: 'bg-emerald-500' },
      };
    }
    if (modeFilter === 'jdc-challenge' || modeFilter === 'pdc-challenge') {
      const scores = filteredTraining.map(s => getChallengePoints(s)).filter(s => s > 0);
      const best = scores.length > 0 ? Math.max(...scores) : 0;
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return {
        card2: { value: best > 0 ? String(best) : '-', label: 'Most Points', icon: <Trophy className="w-5 h-5 text-white" />, color: 'bg-amber-500' },
        card3: { value: avg > 0 ? avg.toFixed(1) : '-', label: 'Avg Points', icon: <BarChart3 className="w-5 h-5 text-white" />, color: 'bg-emerald-500' },
      };
    }
    if (modeFilter === 'killer') {
      const scores = filteredTraining.map(s => s.score || 0).filter(s => s > 0);
      const best = scores.length > 0 ? Math.max(...scores) : 0;
      return {
        card2: { value: best > 0 ? `${best}` : '-', label: 'Highest Points', icon: <Trophy className="w-5 h-5 text-white" />, color: 'bg-amber-500' },
        card3: null,
      };
    }
    // Default (all)
    const validAvgs = filteredMatches.filter(m => m.three_dart_avg && m.three_dart_avg > 0).map(m => m.three_dart_avg!);
    const avg3Dart = validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : 0;
    const bestCheckout = filteredMatches.reduce((max, m) => Math.max(max, m.highest_checkout || 0), 0);
    return {
      card2: { value: avg3Dart > 0 ? avg3Dart.toFixed(1) : '-', label: 'Avg 3-Dart', icon: <TrendingUp className="w-5 h-5 text-white" />, color: 'bg-emerald-500', sublabel: 'Across training sessions' },
      card3: { value: bestCheckout > 0 ? String(bestCheckout) : '-', label: 'Best Checkout', icon: <Trophy className="w-5 h-5 text-white" />, color: 'bg-amber-500' },
    };
  }, [modeFilter, filteredTraining, filteredMatches]);

  // Combined recent sessions
  const recentSessions = useMemo(() => {
    const combined: { item: MatchEntry | TrainingSession; isMatch: boolean; date: string }[] = [];
    for (const m of filteredMatches) combined.push({ item: m, isMatch: true, date: m.played_at });
    for (const t of filteredTraining) combined.push({ item: t, isMatch: false, date: t.created_at });
    combined.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return combined.slice(0, 20);
  }, [filteredMatches, filteredTraining]);

  // Group training sessions by canonical mode for breakdown
  const sessionsByMode = useMemo(() => {
    const map: Record<string, TrainingSession[]> = {};
    for (const m of BREAKDOWN_MODES) map[m.value] = [];
    for (const t of trainingStats) {
      const mode = canonicalMode(t.training_mode || t.game_type || '');
      if (map[mode]) map[mode].push(t);
    }
    return map;
  }, [trainingStats]);

  const isFiltered = modeFilter !== 'all';

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
            <Filter className="w-4 h-4 mr-2" />Filters
            <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </Button>
          <Button onClick={fetchData} variant="outline" className="border-slate-600 text-slate-300 hover:text-white">
            <RefreshCw className="w-4 h-4 mr-2" />Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="bg-slate-800/40 border-slate-700/50 p-4 sm:p-6">
          <label className="text-slate-400 text-sm mb-3 block font-medium">Training Mode</label>
          <div className="flex flex-wrap gap-2">
            {MODE_FILTERS.map((mode) => (
              <FilterButton key={mode.value} active={modeFilter === mode.value} onClick={() => setModeFilter(mode.value)}>
                {mode.label}
              </FilterButton>
            ))}
          </div>
          {/* ATC sub-filter */}
          {modeFilter === 'around-the-clock' && (
            <div className="mt-4 pt-4 border-t border-slate-700/50">
              <label className="text-slate-400 text-sm mb-2 block font-medium">Game Mode</label>
              <div className="flex flex-wrap gap-2">
                {ATC_SUB_MODES.map((sub) => (
                  <FilterButton key={sub.value} active={atcSubFilter === sub.value} onClick={() => setAtcSubFilter(sub.value)}>
                    {sub.label}
                  </FilterButton>
                ))}
              </div>
            </div>
          )}
          {isFiltered && (
            <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center gap-2">
              <span className="text-slate-400 text-sm">Active:</span>
              <Badge className="bg-purple-500/20 text-purple-400">{formatModeName(modeFilter)}</Badge>
              {modeFilter === 'around-the-clock' && atcSubFilter !== 'all' && (
                <Badge className="bg-slate-700 text-slate-300">{ATC_SUB_MODES.find(s => s.value === atcSubFilter)?.label}</Badge>
              )}
              <Button variant="ghost" size="sm" onClick={() => { setModeFilter('all'); setAtcSubFilter('all'); }} className="text-slate-400 hover:text-white">Clear</Button>
            </div>
          )}
        </Card>
      )}

      {/* Top Stats */}
      <div className={`grid ${modeCards.card3 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3'} gap-3 sm:gap-4`}>
        <StatCard
          value={String(aggregated.totalSessions)}
          label="Total Sessions"
          icon={<Target className="w-5 h-5 text-white" />}
          color="bg-purple-500"
        />
        {modeCards.card2 && (
          <StatCard
            value={modeCards.card2.value}
            label={modeCards.card2.label}
            icon={modeCards.card2.icon}
            color={modeCards.card2.color}
            sublabel={(modeCards.card2 as any).sublabel}
          />
        )}
        {modeCards.card3 && (
          <StatCard
            value={modeCards.card3.value}
            label={modeCards.card3.label}
            icon={modeCards.card3.icon}
            color={modeCards.card3.color}
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
              {BREAKDOWN_MODES.map(m => (
                <ModeBreakdownCard key={m.value} mode={m.value} sessions={sessionsByMode[m.value] || []} />
              ))}
            </div>
            {BREAKDOWN_MODES.every(m => (sessionsByMode[m.value] || []).length === 0) && (
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
