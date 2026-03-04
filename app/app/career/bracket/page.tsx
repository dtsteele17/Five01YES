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

  // Check if returning from a match (career match result in sessionStorage)
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

    const { data, error } = await supabase.rpc('rpc_career_init_bracket_event', {
      p_career_id: careerId,
      p_event_id: eventId,
    });

    if (error || data?.error) {
      toast.error(data?.error || 'Failed to initialize bracket');
      router.push(`/app/career?id=${careerId}`);
      return;
    }

    setBracketId(data.bracket_id);
    setEventName(data.event_name || '');
    setEventType(data.event_type || '');
    setFormatLegs(data.format_legs || 3);

    if (data.bracket_data && data.bracket_data.length > 0) {
      // Existing bracket — restore from DB
      // The bracket_data stores the full BracketData object
      setBracket(data.bracket_data);
    } else if (data.participants) {
      // New bracket — generate from participants
      const participants: BracketParticipant[] = data.participants;
      const newBracket = generateBracket(participants, data.bracket_size, data.format_legs);
      setBracket(newBracket);

      // Save initial bracket state
      await supabase.rpc('rpc_career_save_bracket', {
        p_bracket_id: data.bracket_id,
        p_bracket_data: newBracket as any,
        p_current_round: 1 as any,
      });
    }

    setLoading(false);
  }

  async function handleMatchResult(won: boolean, playerLegs: number, opponentLegs: number) {
    if (!bracket || !bracketId || !careerId || !eventId) return;

    const updated = processRoundAfterPlayerMatch(bracket, won, playerLegs, opponentLegs, formatLegs);
    setBracket(updated);

    const supabase = createClient();

    // Save bracket state
    await supabase.rpc('rpc_career_save_bracket', {
      p_bracket_id: bracketId,
      p_bracket_data: updated as any,
      p_current_round: updated.currentRound as any,
      p_winner_id: updated.winnerId,
      p_player_eliminated_round: updated.playerEliminatedRound as any,
      p_completed: updated.completed,
    });

    // If tournament is complete, finalize
    if (updated.completed) {
      const playerWon = updated.winnerId === 'player';
      const { data: completeData } = await supabase.rpc('rpc_career_complete_bracket_event', {
        p_career_id: careerId,
        p_event_id: eventId,
        p_bracket_id: bracketId,
        p_player_won_tournament: playerWon,
        p_player_eliminated_round: updated.playerEliminatedRound as any,
        p_total_rounds: updated.totalRounds as any,
      });

      setTournamentResult({
        ...completeData,
        placement: getPlacement(updated.playerEliminatedRound, updated.totalRounds, playerWon),
        playerWon,
      });
      setShowResults(true);
    }
  }

  function handlePlayMatch() {
    if (!bracket || !careerId || !eventId || !bracketId) return;

    const opponent = getPlayerOpponent(bracket);
    if (!opponent) {
      toast.error('No opponent found');
      return;
    }

    // Map skill to bot average
    const avg = Math.max(20, Math.min(100, Math.round(opponent.skill)));
    const diffKey = avg <= 30 ? 'novice' : avg <= 40 ? 'beginner' : avg <= 50 ? 'casual'
      : avg <= 60 ? 'intermediate' : avg <= 70 ? 'advanced' : avg <= 80 ? 'elite'
      : avg <= 90 ? 'pro' : 'worldClass';

    const bestOfMap: Record<number, any> = {
      1: 'best-of-1', 3: 'best-of-3', 5: 'best-of-5',
      7: 'best-of-7', 9: 'best-of-9', 11: 'best-of-11',
    };

    // Store bracket context so we can return after match
    sessionStorage.setItem('career_bracket_context', JSON.stringify({
      careerId, eventId, bracketId,
    }));

    setConfig({
      mode: '501',
      botDifficulty: diffKey as any,
      botAverage: avg,
      doubleOut: true,
      bestOf: bestOfMap[formatLegs] || 'best-of-3',
      atcOpponent: 'bot',
      career: {
        careerId,
        eventId,
        matchId: `bracket-${bracketId}-r${bracket.currentRound}`,
        opponentId: opponent.id,
        opponentName: opponent.name,
        bracketRound: bracket.currentRound,
      },
    });

    router.push('/app/play/training/501');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
      </div>
    );
  }

  if (!bracket) return null;

  const playerOpponent = getPlayerOpponent(bracket);
  const roundName = getRoundName(bracket.currentRound, bracket.totalRounds);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/app/career?id=${careerId}`)} className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-1" /> Career
          </Button>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-5 bg-gradient-to-r from-purple-500/20 to-pink-500/10 border border-purple-500/30">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="w-6 h-6 text-purple-400" />
              <h1 className="text-xl font-black text-white">{eventName}</h1>
            </div>
            <div className="flex gap-2">
              <Badge className="bg-white/10 text-white/70">{bracket.size}-Player Bracket</Badge>
              <Badge className="bg-white/10 text-white/70">Best of {formatLegs}</Badge>
              <Badge className="bg-purple-500/20 text-purple-400">{roundName}</Badge>
            </div>
          </Card>
        </motion.div>

        {/* Player's Next Match */}
        {!bracket.completed && !bracket.playerEliminated && playerOpponent && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="p-5 bg-slate-800/60 border border-white/10">
              <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-3">
                Your {roundName} Match
              </div>

              <div className="flex items-center justify-between mb-4">
                <div className="text-center flex-1">
                  <div className="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center mx-auto mb-2">
                    <Star className="w-6 h-6 text-amber-400" />
                  </div>
                  <span className="text-white font-bold text-sm">You</span>
                </div>

                <div className="px-4">
                  <Swords className="w-6 h-6 text-slate-500" />
                </div>

                <div className="text-center flex-1">
                  <div className="w-12 h-12 rounded-full bg-slate-700 border border-white/10 flex items-center justify-center mx-auto mb-2">
                    <Shield className="w-6 h-6 text-slate-400" />
                  </div>
                  <span className="text-white font-bold text-sm">{playerOpponent.name}</span>
                  <p className="text-slate-500 text-xs capitalize">{playerOpponent.archetype}</p>
                </div>
              </div>

              <Button
                className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold py-3"
                onClick={handlePlayMatch}
                disabled={playingMatch}
              >
                <Play className="w-5 h-5 mr-2" />
                Play Match
              </Button>
            </Card>
          </motion.div>
        )}

        {/* Full Bracket View */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="p-4 bg-slate-800/60 border border-white/10">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Bracket
            </div>

            <div className="space-y-4">
              {Array.from({ length: bracket.totalRounds }, (_, r) => r + 1).map(round => {
                const roundMatches = bracket.matches.filter(m => m.round === round);
                const rName = getRoundName(round, bracket.totalRounds);
                const isCurrentRound = round === bracket.currentRound;

                return (
                  <div key={round}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-semibold ${isCurrentRound ? 'text-amber-400' : 'text-slate-500'}`}>
                        {rName}
                      </span>
                      {isCurrentRound && !bracket.completed && (
                        <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">Current</Badge>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {roundMatches.map((match, i) => (
                        <BracketMatchRow key={`${round}-${i}`} match={match} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>

        {/* Tournament Results Modal */}
        <AnimatePresence>
          {showResults && tournamentResult && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full text-center"
              >
                {tournamentResult.playerWon ? (
                  <Crown className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                ) : (
                  <Trophy className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                )}

                <h2 className="text-2xl font-black text-white mb-1">
                  {tournamentResult.playerWon ? 'Champion!' : tournamentResult.placement}
                </h2>

                {tournamentResult.promo_message && (
                  <p className="text-amber-400 text-sm italic mb-3">"{tournamentResult.promo_message}"</p>
                )}

                <div className="flex justify-center gap-4 mb-4">
                  <div className="text-center">
                    <span className="text-2xl font-bold text-amber-400">+{tournamentResult.rep_earned}</span>
                    <p className="text-xs text-slate-400">REP</p>
                  </div>
                </div>

                {tournamentResult.promoted && (
                  <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg p-3 mb-4">
                    <Zap className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                    <span className="text-emerald-400 font-bold text-sm">Promoted to Tier {tournamentResult.new_tier}!</span>
                  </div>
                )}

                <Button
                  className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold"
                  onClick={() => router.push(`/app/career?id=${careerId}`)}
                >
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

function BracketMatchRow({ match }: { match: BracketMatch }) {
  const p1Name = match.participant1?.name || 'TBD';
  const p2Name = match.participant2?.name || 'TBD';
  const p1IsPlayer = match.participant1?.isPlayer;
  const p2IsPlayer = match.participant2?.isPlayer;
  const p1Won = match.winnerId === match.participant1?.id;
  const p2Won = match.winnerId === match.participant2?.id;
  const decided = match.winnerId !== null;

  return (
    <div className={`rounded-lg border text-xs ${match.isPlayerMatch ? 'border-amber-500/20 bg-amber-500/5' : 'border-white/5 bg-white/[0.02]'}`}>
      <div className={`flex items-center justify-between px-2.5 py-1.5 ${decided && p1Won ? 'bg-white/5' : ''}`}>
        <span className={`font-medium truncate flex-1 ${p1IsPlayer ? 'text-amber-400' : decided && p1Won ? 'text-white' : 'text-slate-400'}`}>
          {p1Name}
        </span>
        {decided && (
          <span className={`font-bold ml-2 ${p1Won ? 'text-white' : 'text-slate-600'}`}>
            {match.score?.p1Legs}
          </span>
        )}
        {decided && p1Won && <Check className="w-3 h-3 text-emerald-400 ml-1" />}
      </div>
      <div className="border-t border-white/5" />
      <div className={`flex items-center justify-between px-2.5 py-1.5 ${decided && p2Won ? 'bg-white/5' : ''}`}>
        <span className={`font-medium truncate flex-1 ${p2IsPlayer ? 'text-amber-400' : decided && p2Won ? 'text-white' : 'text-slate-400'}`}>
          {p2Name}
        </span>
        {decided && (
          <span className={`font-bold ml-2 ${p2Won ? 'text-white' : 'text-slate-600'}`}>
            {match.score?.p2Legs}
          </span>
        )}
        {decided && p2Won && <Check className="w-3 h-3 text-emerald-400 ml-1" />}
      </div>
    </div>
  );
}
