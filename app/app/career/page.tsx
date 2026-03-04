'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Trophy, Target, Flame, Shield, Crown, Skull, Swords, Play, ChevronRight,
  ArrowLeft, Loader2, Star, TrendingUp, Calendar, MapPin, Dumbbell,
  Award, Zap, Users, BarChart3, Sparkles, Clock,
} from 'lucide-react';

const TIER_CONFIG: Record<number, { name: string; icon: any; color: string; bgClass: string; borderClass: string }> = {
  1: { name: 'Local Circuit Trials', icon: Target, color: 'emerald', bgClass: 'from-emerald-500/20 to-emerald-600/10', borderClass: 'border-emerald-500/30' },
  2: { name: 'Pub Leagues', icon: Flame, color: 'blue', bgClass: 'from-blue-500/20 to-blue-600/10', borderClass: 'border-blue-500/30' },
  3: { name: 'County Circuit', icon: Shield, color: 'purple', bgClass: 'from-purple-500/20 to-purple-600/10', borderClass: 'border-purple-500/30' },
  4: { name: 'Regional Tour', icon: Trophy, color: 'orange', bgClass: 'from-orange-500/20 to-orange-600/10', borderClass: 'border-orange-500/30' },
  5: { name: 'World Tour', icon: Crown, color: 'amber', bgClass: 'from-amber-500/20 to-amber-600/10', borderClass: 'border-amber-500/30' },
};

const DIFFICULTY_COLORS: Record<string, string> = {
  'rookie': 'text-emerald-400',
  'amateur': 'text-blue-400',
  'semi-pro': 'text-amber-400',
  'pro': 'text-orange-400',
  'world-class': 'text-purple-400',
  'nightmare': 'text-red-400',
};

const EVENT_ICONS: Record<string, any> = {
  'league': Calendar,
  'open': Trophy,
  'qualifier': Zap,
  'promotion': Crown,
  'training': Dumbbell,
  'rest': Clock,
  'trial_tournament': Swords,
  'premier_league_night': Star,
  'major': Award,
  'season_finals': Sparkles,
};

interface CareerHome {
  career: {
    id: string;
    tier: number;
    season: number;
    week: number;
    day: number;
    rep: number;
    form: number;
    difficulty: string;
    premier_league_active: boolean;
  };
  next_event: {
    id: string;
    event_type: string;
    event_name: string;
    format_legs: number;
    bracket_size: number | null;
    sequence_no: number;
  } | null;
  standings: any[] | null;
  sponsors: any[] | null;
  recent_milestones: any[] | null;
}

export default function CareerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const careerId = searchParams.get('id');
  const [data, setData] = useState<CareerHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [saves, setSaves] = useState<any[]>([]);
  const [showSaveSelect, setShowSaveSelect] = useState(false);

  useEffect(() => {
    loadCareer();
  }, [careerId]);

  async function loadCareer() {
    setLoading(true);
    const supabase = createClient();

    if (careerId) {
      // Load specific career
      const { data: homeData, error } = await supabase.rpc('rpc_get_career_home', {
        p_career_id: careerId,
      });

      if (error || homeData?.error) {
        toast.error('Failed to load career');
        router.push('/app/career/start');
        return;
      }

      setData(homeData);
    } else {
      // Check for existing saves
      const { data: savesData } = await supabase.rpc('rpc_get_career_saves');
      const activeSaves = (savesData?.saves || []).filter((s: any) => s.status === 'active');

      if (activeSaves.length === 0) {
        router.push('/app/career/start');
        return;
      } else if (activeSaves.length === 1) {
        // Auto-load single save
        router.replace(`/app/career?id=${activeSaves[0].id}`);
        return;
      } else {
        setSaves(activeSaves);
        setShowSaveSelect(true);
      }
    }

    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-amber-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Loading career...</p>
        </div>
      </div>
    );
  }

  // Save selection screen
  if (showSaveSelect) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <Swords className="w-12 h-12 text-amber-400 mx-auto mb-3" />
            <h1 className="text-2xl font-black text-white mb-2">Career Mode</h1>
            <p className="text-slate-400">Select a career to continue</p>
          </div>
          <div className="space-y-3">
            {saves.map((save: any) => {
              const tierCfg = TIER_CONFIG[save.tier] || TIER_CONFIG[1];
              return (
                <Card
                  key={save.id}
                  className={`p-4 cursor-pointer border border-white/10 bg-slate-800/50 hover:border-amber-500/30 hover:bg-slate-800 transition-all`}
                  onClick={() => {
                    setShowSaveSelect(false);
                    router.replace(`/app/career?id=${save.id}`);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${tierCfg.bgClass} flex items-center justify-center`}>
                      <tierCfg.icon className="w-5 h-5 text-white/80" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{tierCfg.name}</span>
                        <Badge className="bg-slate-700 text-slate-300 text-xs">Slot {save.save_slot}</Badge>
                      </div>
                      <p className="text-sm text-slate-400">
                        Season {save.season} • Week {save.week} • <span className={DIFFICULTY_COLORS[save.difficulty]}>{save.difficulty}</span>
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500" />
                  </div>
                </Card>
              );
            })}
            <Button
              variant="ghost"
              className="w-full text-slate-400 hover:text-white"
              onClick={() => router.push('/app/career/start')}
            >
              + New Career
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { career, next_event, standings, sponsors, recent_milestones } = data;
  const tierCfg = TIER_CONFIG[career.tier] || TIER_CONFIG[1];
  const TierIcon = tierCfg.icon;
  const EventIcon = next_event ? (EVENT_ICONS[next_event.event_type] || Calendar) : Calendar;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => router.push('/app/play')} className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-1" /> Play
          </Button>
          <Badge className={`${DIFFICULTY_COLORS[career.difficulty]} bg-white/5 capitalize`}>
            {career.difficulty}
          </Badge>
        </div>

        {/* Tier + Season Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`p-5 bg-gradient-to-r ${tierCfg.bgClass} border ${tierCfg.borderClass}`}>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                <TierIcon className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-black text-white">{tierCfg.name}</h1>
                <p className="text-sm text-white/60">
                  {career.tier === 1
                    ? `Day ${career.day}`
                    : `Season ${career.season} — Week ${career.week}`}
                </p>
              </div>
            </div>

            {/* REP bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-white/60 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 text-amber-400" /> REP
                </span>
                <span className="text-white font-bold">{career.rep.toLocaleString()}</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (career.rep % 1000) / 10)}%` }}
                />
              </div>
            </div>

            {/* Form indicator */}
            {career.form !== 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                <TrendingUp className={`w-3.5 h-3.5 ${career.form > 0 ? 'text-emerald-400' : 'text-red-400'}`} />
                <span className={career.form > 0 ? 'text-emerald-400' : 'text-red-400'}>
                  Form: {career.form > 0 ? '+' : ''}{(career.form * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Next Event Card */}
        {next_event && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="p-5 bg-slate-800/60 border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <EventIcon className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Next Event</span>
              </div>

              <h2 className="text-lg font-bold text-white mb-1">{next_event.event_name}</h2>

              <div className="flex flex-wrap gap-2 mb-4">
                <Badge className="bg-slate-700/50 text-slate-300 text-xs">
                  Best of {next_event.format_legs}
                </Badge>
                {next_event.bracket_size && (
                  <Badge className="bg-slate-700/50 text-slate-300 text-xs">
                    <Users className="w-3 h-3 mr-1" />
                    {next_event.bracket_size} players
                  </Badge>
                )}
                <Badge className="bg-slate-700/50 text-slate-300 text-xs capitalize">
                  {next_event.event_type.replace('_', ' ')}
                </Badge>
              </div>

              <Button
                className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-3 text-base"
                onClick={() => {
                  // TODO: Implement rpc_play_next_event and route to match
                  toast.info('Match engine coming soon!');
                }}
              >
                <Play className="w-5 h-5 mr-2" />
                Play Next Event
              </Button>
            </Card>
          </motion.div>
        )}

        {!next_event && (
          <Card className="p-5 bg-slate-800/60 border border-white/10 text-center">
            <Trophy className="w-10 h-10 text-amber-400 mx-auto mb-3" />
            <h2 className="text-lg font-bold text-white mb-1">Season Complete!</h2>
            <p className="text-slate-400 text-sm mb-4">Check your promotion status below.</p>
          </Card>
        )}

        {/* League Standings */}
        {standings && standings.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="p-4 bg-slate-800/60 border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-white">League Table</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs border-b border-white/5">
                      <th className="text-left pb-2 font-medium">#</th>
                      <th className="text-left pb-2 font-medium">Name</th>
                      <th className="text-center pb-2 font-medium">P</th>
                      <th className="text-center pb-2 font-medium">W</th>
                      <th className="text-center pb-2 font-medium">L</th>
                      <th className="text-center pb-2 font-medium">LD</th>
                      <th className="text-center pb-2 font-medium">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row: any, i: number) => (
                      <tr
                        key={i}
                        className={`border-b border-white/5 ${row.is_player ? 'bg-amber-500/10' : ''}`}
                      >
                        <td className="py-1.5 text-slate-400">{i + 1}</td>
                        <td className={`py-1.5 font-medium ${row.is_player ? 'text-amber-400' : 'text-white'}`}>
                          {row.name}
                        </td>
                        <td className="py-1.5 text-center text-slate-300">{row.played}</td>
                        <td className="py-1.5 text-center text-slate-300">{row.won}</td>
                        <td className="py-1.5 text-center text-slate-300">{row.lost}</td>
                        <td className="py-1.5 text-center text-slate-300">{row.legs_diff > 0 ? `+${row.legs_diff}` : row.legs_diff}</td>
                        <td className="py-1.5 text-center font-bold text-white">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Active Sponsors */}
        {sponsors && sponsors.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="p-4 bg-slate-800/60 border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <Award className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-semibold text-white">Sponsors</span>
              </div>
              <div className="space-y-2">
                {sponsors.map((sp: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                    <div>
                      <span className="text-white font-medium text-sm">{sp.name}</span>
                      <span className="text-slate-400 text-xs ml-2">+{(sp.rep_bonus_pct * 100).toFixed(0)}% REP</span>
                    </div>
                    <Badge className="bg-purple-500/20 text-purple-400 text-xs">Slot {sp.slot}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Recent Milestones */}
        {recent_milestones && recent_milestones.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
            <Card className="p-4 bg-slate-800/60 border border-white/10">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">Career Timeline</span>
              </div>
              <div className="space-y-2">
                {recent_milestones.map((ms: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
                    <div>
                      <span className="text-white text-sm font-medium">{ms.title}</span>
                      {ms.description && (
                        <p className="text-slate-400 text-xs mt-0.5">{ms.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
