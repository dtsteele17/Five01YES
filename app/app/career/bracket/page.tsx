'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { useTraining } from '@/lib/context/TrainingContext';
import {
  Trophy, Swords, ArrowLeft, Loader2, Play, Crown, ChevronRight,
  Shield, Star, Zap, Check, X,
} from 'lucide-react';
import {
  generateBracket,
  processRoundAfterPlayerMatch,
  getPlayerOpponent,
  getRoundName,
  getPlacement,
  type BracketData,
  type BracketParticipant,
  type BracketMatch,
} from '@/lib/career/bracketEngine';

export default function CareerBracketPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const careerId = searchParams.get('careerId');
  const eventId = searchParams.get('eventId');
  const { setConfig } = useTraining();

  const [loading, setLoading] = useState(true);
  const [bracket, setBracket] = useState<BracketData | null>(null);
  const [bracketId, setBracketId] = useState<string | null>(null);
  const [eventName, setEventName] = useState('');
  const [eventType, setEventType] = useState('');
  const [formatLegs, setFormatLegs] = useState(3);
  const [playingMatch, setPlayingMatch] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [tournamentResult, setTournamentResult] = useState<any>(null);

  useEffect(() => {
    if (careerId && eventId) initBracket();
  }, [careerId, eventId]);

  useEffect(() => {
    const resultStr = sessionStorage.getItem('career_bracket_result');
    if (resultStr && bracket && bracketId) {
      sessionStorage.removeItem('career_bracket_result');
      const result = JSON.parse(resultStr);
      handleMatchResult(result.won, result.playerLegs, result.opponentLegs);
    }
  }, [bracket, bracketId]);

  async function initBracket() {
    setLoading(true);
    const supabase = createClient();

    // Get event info
    const { data: eventInfo } = await supabase
      .from('career_events')
      .select('event_name, event_type, format_legs, bracket_size, status')
      .eq('id', eventId)
      .single();

    if (eventInfo) {
      setEventName(eventInfo.event_name || '');
      setEventType(eventInfo.event_type || '');
      setFormatLegs(eventInfo.format_legs || 3);
    }

    // Step 1: Check if bracket already exists in DB with real data
    const { data: existingBracket } = await supabase
      .from('career_brackets')
      .select('id, bracket_data, bracket_size, rounds_total, current_round, status')
      .eq('event_id', eventId)
      .eq('career_id', careerId)
      .single();

    if (existingBracket?.bracket_data?.matches?.length > 0) {
      // ✅ Bracket has real data — load it directly, no RPC call
      setBracketId(existingBracket!.id);
      setBracket(existingBracket!.bracket_data);
      setLoading(false);
      return;
    }

    if (existingBracket?.id && (!existingBracket.bracket_data?.matches || existingBracket.bracket_data.matches.length === 0)) {
      // Bracket row exists but data is empty — generate from opponents directly (NO RPC call)
      const bSize = existingBracket.bracket_size || eventInfo?.bracket_size || 8;
      const fLegs = eventInfo?.format_legs || 3;
      const participants = await buildParticipantsFromDB(supabase, careerId!, bSize, eventId!);
      if (participants.length >= bSize) {
        const newBracket = generateBracket(participants, bSize, fLegs);
        await supabase.from('career_brackets').update({ bracket_data: newBracket as any }).eq('id', existingBracket.id);
        // Also mark event active if still pending
        if (eventInfo?.status === 'pending') {
          await supabase.from('career_events').update({ status: 'active' }).eq('id', eventId);
        }
        setBracketId(existingBracket.id);
        setBracket(newBracket);
        setLoading(false);
        return;
      }
    }

    // Step 2: No bracket at all — call init RPC ONCE to create the bracket row + generate opponents
    const { data, error } = await supabase.rpc('rpc_career_init_bracket_event', { p_career_id: careerId, p_event_id: eventId });
    if (error || data?.error) { toast.error(data?.error || 'Failed to init bracket'); router.push(`/app/career?id=${careerId}`); return; }

    setBracketId(data.bracket_id);
    if (data.event_name) setEventName(data.event_name);
    if (data.format_legs) setFormatLegs(data.format_legs);

    if (data.bracket_data?.matches?.length > 0) {
      setBracket(data.bracket_data);
    } else {
      // Generate from participants returned by RPC
      const participants = data.participants?.length > 0 ? data.participants
        : await buildParticipantsFromDB(supabase, careerId!, data.bracket_size || 8, eventId!);
      const newBracket = generateBracket(participants, data.bracket_size || 8, data.format_legs || 3);
      // Save using direct update (more reliable than RPC)
      await supabase.from('career_brackets').update({ bracket_data: newBracket as any }).eq('id', data.bracket_id);
      setBracket(newBracket);
    }
    setLoading(false);
  }

  // Build participants from career_opponents table (deterministic, no RPC needed)
  async function buildParticipantsFromDB(supabase: any, carId: string, bracketSize: number, evtId: string) {
    const { data: career } = await supabase.from('career_profiles').select('tier, career_seed, difficulty').eq('id', carId).single();
    const { data: evt } = await supabase.from('career_events').select('sequence_no').eq('id', evtId).single();
    if (!career) return [];
    const { data: opponents } = await supabase
      .from('career_opponents')
      .select('id, first_name, last_name, nickname, skill_rating, archetype')
      .eq('career_id', carId)
      .eq('tier', career.tier)
      .order('id') // deterministic order
      .limit(50);
    if (!opponents) return [];
    // Deterministic shuffle using career_seed + event sequence
    const seed = (career.career_seed || 0) + (evt?.sequence_no || 0) * 100;
    const shuffled = [...opponents].sort((a: any, b: any) => {
      const ha = Math.abs(((a.id.charCodeAt(0) + seed) * 2654435761) | 0);
      const hb = Math.abs(((b.id.charCodeAt(0) + seed) * 2654435761) | 0);
      return ha - hb;
    });
    const diffMult: Record<string, number> = { rookie: 0.7, amateur: 0.85, 'semi-pro': 1.0, pro: 1.15, 'world-class': 1.3, nightmare: 1.5 };
    const mult = diffMult[career.difficulty] || 1.0;
    const participants: BracketParticipant[] = [
      { id: 'player', name: 'You', skill: 50, archetype: 'allrounder', isPlayer: true, seed: 1 },
    ];
    for (let i = 0; i < bracketSize - 1 && i < shuffled.length; i++) {
      const o = shuffled[i];
      participants.push({
        id: o.id,
        name: `${o.first_name}${o.nickname ? ` '${o.nickname}'` : ''} ${o.last_name}`,
        skill: Math.round(o.skill_rating * mult),
        archetype: o.archetype,
        isPlayer: false,
        seed: i + 2,
      });
    }
    return participants;
  }

  async function handleMatchResult(won: boolean, playerLegs: number, opponentLegs: number) {
    if (!bracket || !bracketId || !careerId || !eventId) return;
    const updated = processRoundAfterPlayerMatch(bracket, won, playerLegs, opponentLegs, formatLegs);
    setBracket(updated);
    const supabase = createClient();
    // Save bracket state directly to table (more reliable than RPC)
    await supabase.from('career_brackets').update({
      bracket_data: updated as any,
      current_round: updated.currentRound,
      status: updated.completed ? 'completed' : 'active',
    }).eq('id', bracketId);
    if (updated.completed) {
      const playerWon = updated.winnerId === 'player';
      const { data: completeData } = await supabase.rpc('rpc_career_complete_bracket_event', {
        p_career_id: careerId, p_event_id: eventId, p_bracket_id: bracketId,
        p_player_won_tournament: playerWon, p_player_eliminated_round: updated.playerEliminatedRound as any,
        p_total_rounds: updated.totalRounds as any,
      });
      setTournamentResult({ ...completeData, placement: getPlacement(updated.playerEliminatedRound, updated.totalRounds, playerWon), playerWon });
      setShowResults(true);
    }
  }

  function handlePlayMatch() {
    if (!bracket || !careerId || !eventId || !bracketId) return;
    const opponent = getPlayerOpponent(bracket);
    if (!opponent) { toast.error('No opponent found'); return; }
    const avg = Math.max(20, Math.min(100, Math.round(opponent.skill)));
    const diffKey = avg <= 30 ? 'novice' : avg <= 40 ? 'beginner' : avg <= 50 ? 'casual'
      : avg <= 60 ? 'intermediate' : avg <= 70 ? 'advanced' : avg <= 80 ? 'elite'
      : avg <= 90 ? 'pro' : 'worldClass';
    const bestOfMap: Record<number, any> = { 1: 'best-of-1', 3: 'best-of-3', 5: 'best-of-5', 7: 'best-of-7', 9: 'best-of-9', 11: 'best-of-11' };
    setConfig({
      mode: '501', botDifficulty: diffKey as any, botAverage: avg, doubleOut: true,
      bestOf: bestOfMap[formatLegs] || 'best-of-3', atcOpponent: 'bot',
      career: { careerId, eventId, eventName, matchId: `bracket-${bracketId}-r${bracket.currentRound}`,
        opponentId: opponent.id, opponentName: opponent.name, bracketRound: bracket.currentRound, totalRounds: bracket.totalRounds },
    });
    router.push('/app/play/training/501');
  }

  if (loading) {
    return <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
      <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
    </div>;
  }
  if (!bracket) return null;

  const playerOpponent = getPlayerOpponent(bracket);
  const roundName = getRoundName(bracket.currentRound, bracket.totalRounds);

  // Build rounds for horizontal bracket view
  const rounds: { round: number; name: string; matches: BracketMatch[] }[] = [];
  for (let r = 1; r <= bracket.totalRounds; r++) {
    rounds.push({
      round: r,
      name: getRoundName(r, bracket.totalRounds),
      matches: bracket.matches.filter(m => m.round === r),
    });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 sm:p-5">
      <div className="max-w-6xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push(`/app/career?id=${careerId}`)} className="text-slate-400 hover:text-white px-2">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Trophy className="w-5 h-5 text-purple-400" />
            <h1 className="text-lg font-black text-white">{eventName}</h1>
          </div>
          <div className="flex gap-1.5">
            <Badge className="bg-white/10 text-white/70 text-[10px]">{bracket.size}-Player</Badge>
            <Badge className="bg-white/10 text-white/70 text-[10px]">Best of {formatLegs}</Badge>
            {!bracket.completed && <Badge className="bg-purple-500/20 text-purple-400 text-[10px]">{roundName}</Badge>}
            {bracket.completed && <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">Complete</Badge>}
          </div>
        </div>

        {/* Your Match Fixture Bar */}
        {!bracket.completed && !bracket.playerEliminated && playerOpponent && (
          <Card className="p-3 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 border border-amber-500/20">
            <div className="flex items-center justify-between">
              <div className="w-20" />
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                    <Star className="w-5 h-5 text-amber-400" />
                  </div>
                  <span className="text-amber-400 font-bold text-xs mt-1 block">You</span>
                </div>
                <div className="text-center">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">{roundName}</span>
                  <span className="text-white text-lg font-black">VS</span>
                </div>
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-slate-700 border border-white/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-slate-400" />
                  </div>
                  <span className="text-white font-bold text-xs mt-1 block">{playerOpponent.name}</span>
                </div>
              </div>
              <Button className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold px-6"
                onClick={handlePlayMatch} disabled={playingMatch}>
                <Play className="w-4 h-4 mr-1" /> Play
              </Button>
            </div>
          </Card>
        )}

        {/* ═══ HORIZONTAL BRACKET ═══ */}
        <Card className="p-5 bg-slate-800/60 border border-white/10 overflow-x-auto">
          <div className="flex gap-0 min-w-max">
            {rounds.map((round, ri) => {
              const isFinalRound = round.round === bracket.totalRounds;
              return (
              <div key={round.round} className={`flex flex-col ${isFinalRound ? 'relative' : ''}`}>
                {/* Round header */}
                <div className="text-center mb-4 px-3">
                  {isFinalRound ? (
                    <div className="flex items-center justify-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-black uppercase tracking-widest text-amber-400">
                        {round.name}
                      </span>
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                  ) : (
                  <span className={`text-xs font-bold uppercase tracking-wider ${
                    round.round === bracket.currentRound && !bracket.completed ? 'text-amber-400' : 'text-slate-500'
                  }`}>
                    {round.name}
                  </span>
                  )}
                </div>

                {/* Matches in this round */}
                <div className="flex flex-col justify-around flex-1" style={{ gap: `${Math.pow(2, ri) * 12}px` }}>
                  {round.matches.map((match, mi) => {
                    const isActive = round.round === bracket.currentRound && !bracket.completed;
                    return (
                      <div key={`${round.round}-${mi}`} className="flex items-center">
                        {/* Match card */}
                        <div className={`w-56 rounded-lg border text-xs ${
                          isFinalRound
                            ? match.isPlayerMatch && isActive
                              ? 'border-amber-500/50 bg-gradient-to-br from-amber-500/10 to-orange-500/5 shadow-lg shadow-amber-500/10'
                              : match.winnerId
                                ? 'border-amber-500/30 bg-amber-500/5'
                                : 'border-amber-500/20 bg-slate-900/50'
                          : match.isPlayerMatch && isActive
                            ? 'border-amber-500/30 bg-amber-500/5'
                            : match.winnerId
                              ? 'border-white/10 bg-slate-800/50'
                              : 'border-white/5 bg-slate-900/30'
                        }`}>
                          <MatchSlot
                            name={match.participant1?.name || 'TBD'}
                            isPlayer={match.participant1?.isPlayer}
                            isWinner={match.winnerId === match.participant1?.id}
                            score={match.score?.p1Legs}
                            decided={!!match.winnerId}
                          />
                          <div className="border-t border-white/5" />
                          <MatchSlot
                            name={match.participant2?.name || 'TBD'}
                            isPlayer={match.participant2?.isPlayer}
                            isWinner={match.winnerId === match.participant2?.id}
                            score={match.score?.p2Legs}
                            decided={!!match.winnerId}
                          />
                        </div>

                        {/* Connector lines */}
                        {ri < rounds.length - 1 && (
                          <div className="w-8 flex items-center justify-center">
                            <div className="w-full h-px bg-white/10" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
            })}

            {/* Winner column */}
            {bracket.completed && bracket.winnerId && (
              <div className="flex flex-col justify-center pl-2">
                <div className="text-center mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Winner</span>
                </div>
                <div className="w-36 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                  <Crown className="w-6 h-6 text-amber-400 mx-auto mb-1" />
                  <span className={`text-sm font-bold ${bracket.winnerId === 'player' ? 'text-amber-400' : 'text-white'}`}>
                    {bracket.winnerId === 'player' ? 'You!' : (() => {
                      const finalMatch = bracket.matches.find(m => m.round === bracket.totalRounds);
                      if (finalMatch?.participant1?.id === bracket.winnerId) return finalMatch.participant1.name;
                      if (finalMatch?.participant2?.id === bracket.winnerId) return finalMatch.participant2.name;
                      return 'Champion';
                    })()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Tournament Results Modal */}
        <AnimatePresence>
          {showResults && tournamentResult && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
                className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full text-center">
                {tournamentResult.playerWon ? (
                  <Crown className="w-14 h-14 text-amber-400 mx-auto mb-3" />
                ) : (
                  <Trophy className="w-14 h-14 text-slate-400 mx-auto mb-3" />
                )}
                <h2 className="text-2xl font-black text-white mb-1">
                  {tournamentResult.playerWon ? 'Champion!' : tournamentResult.placement}
                </h2>
                {tournamentResult.promo_message && (
                  <p className="text-amber-400 text-sm italic mb-3">"{tournamentResult.promo_message}"</p>
                )}
                <div className="mb-4">
                  <span className="text-2xl font-bold text-amber-400">+{tournamentResult.rep_earned}</span>
                  <p className="text-xs text-slate-400">REP earned</p>
                </div>
                {tournamentResult.promoted && (
                  <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-3 mb-4">
                    <Zap className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                    <span className="text-emerald-400 font-bold text-sm">
                      {tournamentResult.new_tier === 2 ? 'Welcome to the Pub Leagues!' 
                        : tournamentResult.new_tier === 3 ? 'Moving up to the County Circuit!'
                        : tournamentResult.new_tier === 4 ? 'You\'ve made the Pro Tour!'
                        : tournamentResult.new_tier === 5 ? 'Premier League awaits!'
                        : 'Moving up!'}
                    </span>
                  </div>
                )}
                <Button className="w-full bg-gradient-to-r from-amber-600 to-orange-600 text-white font-bold"
                  onClick={() => router.push(`/app/career?id=${careerId}`)}>
                  Continue
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function MatchSlot({ name, isPlayer, isWinner, score, decided }: {
  name: string; isPlayer?: boolean; isWinner: boolean; score?: number; decided: boolean;
}) {
  const isTBD = name === 'TBD';
  return (
    <div className={`flex items-center justify-between px-3 py-2 ${decided && isWinner ? 'bg-white/5' : ''}`}>
      <span className={`flex-1 ${
        isTBD ? 'text-slate-600 italic'
        : isPlayer ? 'text-amber-400 font-semibold'
        : decided && isWinner ? 'text-white font-semibold'
        : decided ? 'text-slate-500'
        : 'text-slate-300'
      }`}>
        {name}
      </span>
      {decided && (
        <span className={`ml-2 font-bold ${isWinner ? 'text-white' : 'text-slate-600'}`}>{score}</span>
      )}
      {decided && isWinner && <Check className="w-3 h-3 text-emerald-400 ml-0.5 shrink-0" />}
    </div>
  );
}