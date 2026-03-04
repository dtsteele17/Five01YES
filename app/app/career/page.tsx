'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Trophy, Target, Flame, Shield, Crown, Skull, Swords, Play, ChevronRight,
  ArrowLeft, Loader2, Star, TrendingUp, Calendar, Dumbbell,
  Award, Zap, Users, BarChart3, Sparkles, Clock, Settings, Save,
  Bell, Table2, ChevronDown, X,
} from 'lucide-react';
import { useTraining } from '@/lib/context/TrainingContext';

const TIER_CONFIG: Record<number, { name: string; icon: any; color: string; accent: string }> = {
  1: { name: 'Local Circuit Trials', icon: Target, color: 'emerald', accent: 'emerald-500' },
  2: { name: 'Pub Leagues', icon: Flame, color: 'blue', accent: 'blue-500' },
  3: { name: 'County Circuit', icon: Shield, color: 'purple', accent: 'purple-500' },
  4: { name: 'Regional Tour', icon: Trophy, color: 'orange', accent: 'orange-500' },
  5: { name: 'World Tour', icon: Crown, color: 'amber', accent: 'amber-500' },
};

const DIFFICULTY_LABELS: Record<string, { label: string; color: string }> = {
  'rookie': { label: 'Rookie', color: 'text-emerald-400' },
  'amateur': { label: 'Amateur', color: 'text-blue-400' },
  'semi-pro': { label: 'Semi-Pro', color: 'text-amber-400' },
  'pro': { label: 'Pro', color: 'text-orange-400' },
  'world-class': { label: 'World Class', color: 'text-purple-400' },
  'nightmare': { label: 'Nightmare', color: 'text-red-400' },
};

const TRIAL_TOURNAMENTS = [
  { id: 'brass_anchor', name: 'The Brass Anchor Open' },
  { id: 'saturday_shoutout', name: 'Saturday Shoutout Cup' },
  { id: 'northside', name: 'Northside Neighbourhood Classic' },
];

interface CareerHome {
  career: {
    id: string; tier: number; season: number; week: number; day: number;
    rep: number; form: number; difficulty: string; premier_league_active: boolean;
  };
  next_event: {
    id: string; event_type: string; event_name: string;
    format_legs: number; bracket_size: number | null; sequence_no: number;
  } | null;
  standings: any[] | null;
  sponsors: any[] | null;
  recent_milestones: any[] | null;
}

export default function CareerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const careerId = searchParams.get('id');
  const { setConfig } = useTraining();

  const [data, setData] = useState<CareerHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [saves, setSaves] = useState<any[]>([]);
  const [showSaveSelect, setShowSaveSelect] = useState(false);
  const [playingEvent, setPlayingEvent] = useState(false);

  // Settings dialog
  const [showSettings, setShowSettings] = useState(false);
  const [careerName, setCareerName] = useState('');
  const [saving, setSaving] = useState(false);

  // World Rankings popup
  const [showRankings, setShowRankings] = useState(false);
  const [worldRankings, setWorldRankings] = useState<any[]>([]);

  // Tournament choice (Tier 1 first event)
  const [showTournamentChoice, setShowTournamentChoice] = useState(false);
  const [chosenTournament, setChosenTournament] = useState<string | null>(null);

  useEffect(() => { loadCareer(); }, [careerId]);

  async function loadCareer() {
    setLoading(true);
    const supabase = createClient();

    if (careerId) {
      const { data: homeData, error } = await supabase.rpc('rpc_get_career_home', { p_career_id: careerId });
      if (error || homeData?.error) {
        toast.error('Failed to load career');
        router.push('/app/career/start');
        return;
      }
      setData(homeData);

      // Show tournament choice if Tier 1, Day 1, first event is a trial
      if (homeData.career.tier === 1 && homeData.career.day === 1 && homeData.next_event?.event_type === 'trial_tournament') {
        const ctx = sessionStorage.getItem(`career_tournament_chosen_${careerId}`);
        if (!ctx) setShowTournamentChoice(true);
      }
    } else {
      const { data: savesData } = await supabase.rpc('rpc_get_career_saves');
      const activeSaves = (savesData?.saves || []).filter((s: any) => s.status === 'active');
      if (activeSaves.length === 0) { router.push('/app/career/start'); return; }
      else if (activeSaves.length === 1) { router.replace(`/app/career?id=${activeSaves[0].id}`); return; }
      else { setSaves(activeSaves); setShowSaveSelect(true); }
    }
    setLoading(false);
  }

  async function handleSaveGame() {
    setSaving(true);
    // Career auto-saves on every action. This is a user-facing "save" confirmation.
    await new Promise(r => setTimeout(r, 800));
    toast.success('Career saved!');
    setSaving(false);
  }

  async function loadWorldRankings() {
    // Generate simulated world rankings (top 40 AI players)
    const supabase = createClient();
    if (!careerId) return;
    const { data: opponents } = await supabase
      .from('career_opponents')
      .select('first_name, last_name, nickname, skill_rating, archetype')
      .eq('career_id', careerId)
      .order('skill_rating', { ascending: false })
      .limit(40);

    if (opponents) {
      setWorldRankings(opponents.map((o: any, i: number) => ({
        rank: i + 1,
        name: `${o.first_name}${o.nickname ? ` '${o.nickname}'` : ''} ${o.last_name}`,
        rating: Math.round(o.skill_rating * 10),
        archetype: o.archetype,
      })));
    }
    setShowRankings(true);
  }

  function handleChooseTournament(id: string) {
    setChosenTournament(id);
    sessionStorage.setItem(`career_tournament_chosen_${careerId}`, id);
    setShowTournamentChoice(false);
  }

  async function handlePlayEvent() {
    if (!careerId || !data?.next_event || playingEvent) return;
    setPlayingEvent(true);
    try {
      const { next_event } = data;
      const bracketTypes = ['open', 'qualifier', 'trial_tournament', 'major', 'season_finals'];
      if (bracketTypes.includes(next_event.event_type) && next_event.bracket_size) {
        router.push(`/app/career/bracket?careerId=${careerId}&eventId=${next_event.id}`);
        return;
      }

      const supabase = createClient();
      const { data: matchData, error } = await supabase.rpc('rpc_career_play_next_event', { p_career_id: careerId });
      if (error) throw error;
      if (matchData?.error) throw new Error(matchData.error);
      if (matchData?.skipped) { toast.info(matchData.message); loadCareer(); return; }

      const avg = matchData.bot_average || 50;
      const diffKey = avg <= 30 ? 'novice' : avg <= 40 ? 'beginner' : avg <= 50 ? 'casual'
        : avg <= 60 ? 'intermediate' : avg <= 70 ? 'advanced' : avg <= 80 ? 'elite'
        : avg <= 90 ? 'pro' : 'worldClass';
      const bestOfMap: Record<number, any> = { 1: 'best-of-1', 3: 'best-of-3', 5: 'best-of-5', 7: 'best-of-7', 9: 'best-of-9', 11: 'best-of-11' };

      setConfig({
        mode: '501', botDifficulty: diffKey as any, botAverage: avg, doubleOut: true,
        bestOf: bestOfMap[matchData.best_of] || 'best-of-3', atcOpponent: 'bot',
        career: { careerId, eventId: matchData.event_id, matchId: matchData.match_id, opponentId: matchData.opponent.id, opponentName: matchData.opponent.name },
      });
      router.push('/app/play/training/501');
    } catch (err: any) {
      toast.error(err.message || 'Failed to start match');
    } finally {
      setPlayingEvent(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
      </div>
    );
  }

  // Save selection
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
                <Card key={save.id} className="p-4 cursor-pointer border border-white/10 bg-slate-800/50 hover:border-amber-500/30 transition-all"
                  onClick={() => { setShowSaveSelect(false); router.replace(`/app/career?id=${save.id}`); }}>
                  <div className="flex items-center gap-3">
                    <tierCfg.icon className="w-5 h-5 text-white/60" />
                    <div className="flex-1">
                      <span className="font-bold text-white">{tierCfg.name}</span>
                      <p className="text-sm text-slate-400">Season {save.season} • Week {save.week} • {save.difficulty}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-500" />
                  </div>
                </Card>
              );
            })}
            <Button variant="ghost" className="w-full text-slate-400" onClick={() => router.push('/app/career/start')}>+ New Career</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { career, next_event, standings, sponsors, recent_milestones } = data;
  const tierCfg = TIER_CONFIG[career.tier] || TIER_CONFIG[1];
  const diffInfo = DIFFICULTY_LABELS[career.difficulty] || { label: career.difficulty, color: 'text-white' };
  const chosenName = chosenTournament ? TRIAL_TOURNAMENTS.find(t => t.id === chosenTournament)?.name : null;
  const displayEventName = (career.tier === 1 && chosenName) ? chosenName : next_event?.event_name;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 sm:p-5">
      <div className="max-w-5xl mx-auto space-y-3">

        {/* ═══ TOP BAR: Name + Tier + REP ═══ */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/app/play')} className="text-slate-400 hover:text-white px-2">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-2">
              <tierCfg.icon className="w-5 h-5 text-white/70" />
              <span className="font-bold text-white text-lg">{tierCfg.name}</span>
            </div>
            <Badge className={`${diffInfo.color} bg-white/5 text-xs`}>{diffInfo.label}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400" />
            <span className="text-amber-400 font-bold">{career.rep.toLocaleString()}</span>
            <span className="text-slate-500 text-xs">REP</span>
          </div>
        </div>

        {/* ═══ MAIN GRID: FIFA-style dashboard ═══ */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">

          {/* ─── LEFT COLUMN: Continue + Notifications ─── */}
          <div className="md:col-span-5 space-y-3">

            {/* CONTINUE / NEXT EVENT — highlighted card */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-4 bg-gradient-to-br from-amber-500/20 to-orange-600/10 border border-amber-500/30 relative overflow-hidden">
                <div className="absolute -top-8 -right-8 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                      {career.tier === 1 ? `Day ${career.day}` : `Season ${career.season} — Week ${career.week}`}
                    </span>
                    {career.form !== 0 && (
                      <span className={`text-xs ${career.form > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        Form {career.form > 0 ? '+' : ''}{(career.form * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>

                  {next_event ? (
                    <>
                      <h2 className="text-lg font-black text-white mb-1">{displayEventName}</h2>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        <Badge className="bg-white/10 text-white/70 text-[10px]">Best of {next_event.format_legs}</Badge>
                        {next_event.bracket_size && (
                          <Badge className="bg-white/10 text-white/70 text-[10px]">
                            <Users className="w-3 h-3 mr-0.5" />{next_event.bracket_size}
                          </Badge>
                        )}
                        <Badge className="bg-white/10 text-white/70 text-[10px] capitalize">{next_event.event_type.replace('_', ' ')}</Badge>
                      </div>
                      <Button
                        className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-2.5"
                        disabled={playingEvent}
                        onClick={handlePlayEvent}
                      >
                        {playingEvent ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                        Continue
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <Trophy className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                      <p className="text-white font-bold">Season Complete!</p>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>

            {/* NOTIFICATIONS — Sponsors + REP */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="p-4 bg-slate-800/60 border border-white/10">
                <div className="flex items-center gap-2 mb-3">
                  <Bell className="w-4 h-4 text-rose-400" />
                  <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">Notifications</span>
                </div>

                {sponsors && sponsors.length > 0 ? (
                  <div className="space-y-2">
                    {sponsors.map((sp: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                        <div>
                          <span className="text-white font-medium text-sm">{sp.name}</span>
                          <p className="text-slate-400 text-xs">+{(sp.rep_bonus_pct * 100).toFixed(0)}% REP bonus</p>
                        </div>
                        <Award className="w-4 h-4 text-purple-400" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-3">
                    <Award className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                    <p className="text-slate-500 text-xs">No sponsor offers yet</p>
                    <p className="text-slate-600 text-[10px]">Win matches to attract sponsors</p>
                  </div>
                )}

                {/* REP progress */}
                <div className="mt-3 pt-3 border-t border-white/5">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">REP Progress</span>
                    <span className="text-amber-400 font-bold">{career.rep.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" style={{ width: `${Math.min(100, (career.rep % 1000) / 10)}%` }} />
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>

          {/* ─── CENTER COLUMN: Standings ─── */}
          <div className="md:col-span-4 space-y-3">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card className="p-4 bg-slate-800/60 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                      {career.tier >= 5 ? 'World Rankings' : standings && standings.length > 0 ? 'League Table' : 'World Rankings'}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white text-xs px-2 h-6" onClick={loadWorldRankings}>
                    View All
                  </Button>
                </div>

                {standings && standings.length > 0 ? (
                  <div className="space-y-0">
                    <div className="flex items-center text-[10px] text-slate-500 font-medium px-2 pb-1 border-b border-white/5">
                      <span className="w-5">#</span>
                      <span className="flex-1">Name</span>
                      <span className="w-8 text-center">P</span>
                      <span className="w-8 text-center">Pts</span>
                    </div>
                    {standings.slice(0, 8).map((row: any, i: number) => (
                      <div key={i} className={`flex items-center text-xs px-2 py-1.5 ${row.is_player ? 'bg-amber-500/10 rounded' : ''} ${i < standings.length - 1 ? 'border-b border-white/5' : ''}`}>
                        <span className="w-5 text-slate-500">{i + 1}</span>
                        <span className={`flex-1 font-medium truncate ${row.is_player ? 'text-amber-400' : 'text-white'}`}>{row.name}</span>
                        <span className="w-8 text-center text-slate-400">{row.played}</span>
                        <span className="w-8 text-center font-bold text-white">{row.points}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Show top 8 "world" AI players as placeholder */
                  <div className="text-center py-4">
                    <Trophy className="w-6 h-6 text-slate-600 mx-auto mb-1" />
                    <p className="text-slate-500 text-xs">Rankings available from Tier 2</p>
                    <Button variant="ghost" size="sm" className="text-blue-400 text-xs mt-2" onClick={loadWorldRankings}>
                      Preview World Rankings
                    </Button>
                  </div>
                )}
              </Card>
            </motion.div>

            {/* Career Timeline */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <Card className="p-4 bg-slate-800/60 border border-white/10">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Timeline</span>
                </div>
                {recent_milestones && recent_milestones.length > 0 ? (
                  <div className="space-y-2">
                    {recent_milestones.map((ms: any, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        <div>
                          <span className="text-white text-xs font-medium">{ms.title}</span>
                          {ms.description && <p className="text-slate-500 text-[10px]">{ms.description}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs text-center py-2">Your story begins...</p>
                )}
              </Card>
            </motion.div>
          </div>

          {/* ─── RIGHT COLUMN: Current bracket/table + Settings ─── */}
          <div className="md:col-span-3 space-y-3">

            {/* Current event / bracket preview */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="p-4 bg-slate-800/60 border border-white/10">
                <div className="flex items-center gap-2 mb-3">
                  <Table2 className="w-4 h-4 text-teal-400" />
                  <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                    {next_event?.bracket_size ? 'Tournament Draw' : 'Schedule'}
                  </span>
                </div>

                {next_event ? (
                  <div>
                    <p className="text-white text-sm font-medium mb-1">{displayEventName}</p>
                    <p className="text-slate-400 text-xs mb-2 capitalize">{next_event.event_type.replace('_', ' ')}</p>
                    {next_event.bracket_size && (
                      <div className="bg-white/5 rounded-lg p-2 text-center">
                        <Swords className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                        <p className="text-slate-400 text-[10px]">{next_event.bracket_size}-player bracket</p>
                        <p className="text-slate-500 text-[10px]">Draw revealed on entry</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs text-center py-2">Season complete</p>
                )}
              </Card>
            </motion.div>

            {/* Settings + Save */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <div className="grid grid-cols-2 gap-2">
                <Card
                  className="p-3 bg-slate-800/60 border border-white/10 cursor-pointer hover:border-white/20 transition-all text-center"
                  onClick={() => setShowSettings(true)}
                >
                  <Settings className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                  <span className="text-slate-400 text-[10px] font-medium">Settings</span>
                </Card>
                <Card
                  className="p-3 bg-slate-800/60 border border-white/10 cursor-pointer hover:border-emerald-500/30 transition-all text-center"
                  onClick={handleSaveGame}
                >
                  {saving ? (
                    <Loader2 className="w-5 h-5 text-emerald-400 mx-auto mb-1 animate-spin" />
                  ) : (
                    <Save className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                  )}
                  <span className="text-emerald-400 text-[10px] font-medium">Save</span>
                </Card>
              </div>
            </motion.div>
          </div>
        </div>

        {/* ═══ DIALOGS ═══ */}

        {/* Tournament Choice (Tier 1 first event) */}
        <Dialog open={showTournamentChoice} onOpenChange={setShowTournamentChoice}>
          <DialogContent className="bg-slate-900 border-white/10 max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-white text-center">Choose Your Tournament</DialogTitle>
            </DialogHeader>
            <p className="text-slate-400 text-sm text-center mb-4">Pick one of three local tournaments to enter. This is your first step.</p>
            <div className="space-y-2">
              {TRIAL_TOURNAMENTS.map(t => (
                <Card key={t.id} className="p-3 cursor-pointer border border-white/10 bg-slate-800/50 hover:border-amber-500/30 transition-all"
                  onClick={() => handleChooseTournament(t.id)}>
                  <div className="flex items-center gap-3">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    <span className="text-white font-medium text-sm">{t.name}</span>
                    <ChevronRight className="w-4 h-4 text-slate-500 ml-auto" />
                  </div>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Settings Dialog */}
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="bg-slate-900 border-white/10 max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-white">Career Settings</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-xs font-medium mb-1 block">Difficulty</label>
                <p className={`text-sm font-bold ${diffInfo.color}`}>{diffInfo.label}</p>
                <p className="text-slate-500 text-[10px]">Difficulty cannot be changed mid-career</p>
              </div>
              <div>
                <label className="text-slate-400 text-xs font-medium mb-1 block">Career Display Name</label>
                <Input
                  value={careerName}
                  onChange={(e) => setCareerName(e.target.value)}
                  placeholder="Enter a name for this career..."
                  className="bg-slate-800 border-white/10 text-white"
                />
              </div>
              <Button variant="outline" className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10"
                onClick={() => { toast.info('Abandon career from the Play page menu'); setShowSettings(false); }}>
                Abandon Career
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* World Rankings Popup */}
        <Dialog open={showRankings} onOpenChange={setShowRankings}>
          <DialogContent className="bg-slate-900 border-white/10 max-w-md max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" /> World Rankings
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-0">
              <div className="flex items-center text-[10px] text-slate-500 font-medium px-2 pb-1 border-b border-white/5 sticky top-0 bg-slate-900">
                <span className="w-8">#</span>
                <span className="flex-1">Player</span>
                <span className="w-12 text-right">Rating</span>
              </div>
              {worldRankings.map((r, i) => (
                <div key={i} className={`flex items-center text-xs px-2 py-1.5 border-b border-white/5 ${i < 8 ? 'bg-amber-500/5' : ''}`}>
                  <span className={`w-8 ${i < 3 ? 'text-amber-400 font-bold' : i < 8 ? 'text-white' : 'text-slate-500'}`}>{r.rank}</span>
                  <div className="flex-1">
                    <span className={`font-medium ${i < 8 ? 'text-white' : 'text-slate-300'}`}>{r.name}</span>
                    <span className="text-slate-500 text-[10px] ml-1 capitalize">({r.archetype})</span>
                  </div>
                  <span className="w-12 text-right text-slate-400">{r.rating}</span>
                </div>
              ))}
              {worldRankings.length === 0 && (
                <div className="text-center py-4">
                  <Loader2 className="w-5 h-5 text-slate-400 animate-spin mx-auto" />
                </div>
              )}
            </div>
            <p className="text-slate-500 text-[10px] text-center mt-2">Top 8 qualify for Premier League (Tier 5+)</p>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
