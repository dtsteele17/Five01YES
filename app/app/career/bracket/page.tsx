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
    const { data, error } = await supabase.rpc('rpc_career_init_bracket_event', { p_career_id: careerId, p_event_id: eventId });
    if (error || data?.error) { toast.error(data?.error || 'Failed to init bracket'); router.push(`/app/career?id=${careerId}`); return; }

    setBracketId(data.bracket_id);
    setEventName(data.event_name || '');
    setEventType(data.event_type || '');
    setFormatLegs(data.format_legs || 3);

    if (data.bracket_data && data.bracket_data.length > 0) {
      setBracket(data.bracket_data);
    } else if (data.participants) {
      const newBracket = generateBracket(data.participants, data.bracket_size, data.format_legs);
      setBracket(newBracket);
      await supabase.rpc('rpc_career_save_bracket', { p_bracket_id: data.bracket_id, p_bracket_data: newBracket as any, p_current_round: 1 as any });
    }
    setLoading(false);
  }

  async function handleMatchResult(won: boolean, playerLegs: number, opponentLegs: number) {
    if (!bracket || !bracketId || !careerId || !eventId) return;
    const updated = processRoundAfterPlayerMatch(bracket, won, playerLegs, opponentLegs, formatLegs);
    setBracket(updated);
    const supabase = createClient();
    await supabase.rpc('rpc_career_save_bracket', {
      p_bracket_id: bracketId, p_bracket_data: updated as any, p_current_round: updated.currentRound as any,
      p_winner_id: updated.winnerId, p_player_eliminated_round: updated.playerEliminatedRound as any, p_completed: updated.completed,
    });
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
        opponentId: opponent.id, opponentName: opponent.name, bracketRound: bracket.currentRound },
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

        {/* Your Match Card */}
        {!bracket.completed && !bracket.playerEliminated && playerOpponent && (
          <Card className="p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/5 border border-amber-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                    <Star className="w-5 h-5 text-amber-400" />
                  </div>
                  <span className="text-white font-bold text-xs mt-1 block">You</span>
                </div>
                <span className="text-slate-500 text-xs font-bold">VS</span>
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-slate-700 border border-white/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-slate-400" />
                  </div>
                  <span className="text-white font-bold text-xs mt-1 block truncate max-w-[120px]">{playerOpponent.name}</span>
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
        <Card className="p-4 bg-slate-800/60 border border-white/10 overflow-x-auto">
          <div className="flex gap-0 min-w-max">
            {rounds.map((round, ri) => (
              <div key={round.round} className="flex flex-col">
                {/* Round header */}
                <div className="text-center mb-3 px-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    round.round === bracket.currentRound && !bracket.completed ? 'text-amber-400' : 'text-slate-500'
                  }`}>
                    {round.name}
                  </span>
                </div>

                {/* Matches in this round */}
                <div className="flex flex-col justify-around flex-1" style={{ gap: `${Math.pow(2, ri) * 8}px` }}>
                  {round.matches.map((match, mi) => {
                    const isActive = round.round === bracket.currentRound && !bracket.completed;
                    return (
                      <div key={`${round.round}-${mi}`} className="flex items-center">
                        {/* Match card */}
                        <div className={`w-40 rounded border text-[11px] ${
                          match.isPlayerMatch && isActive
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
                          <div className="w-6 flex items-center justify-center">
                            <div className="w-full h-px bg-white/10" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

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
                    <span className="text-emerald-400 font-bold text-sm">Promoted to Tier {tournamentResult.new_tier}!</span>
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
    <div className={`flex items-center justify-between px-2 py-1.5 ${decided && isWinner ? 'bg-white/5' : ''}`}>
      <span className={`truncate flex-1 ${
        isTBD ? 'text-slate-600 italic'
        : isPlayer ? 'text-amber-400 font-medium'
        : decided && isWinner ? 'text-white font-medium'
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
