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
  CAREER_TRAINING_AUTO_PROMOTE_KEY,
  CAREER_TRAINING_RETURN_KEY,
  getRandomCareerTrainingRoute,
} from '@/lib/career/trainingRoutes';
import { Trophy, Swords, ArrowLeft, Loader as Loader2, Play, Crown, ChevronRight, Shield, Star, Zap, Check, X } from 'lucide-react';
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
  const [eventSequence, setEventSequence] = useState<number | null>(null);
  const [careerTier, setCareerTier] = useState<number>(0);
  const [formatLegs, setFormatLegs] = useState(3);
  const [roundFormats, setRoundFormats] = useState<Record<string, number> | null>(null);
  const [playingMatch, setPlayingMatch] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [tournamentResult, setTournamentResult] = useState<any>(null);
  const [routingToTraining, setRoutingToTraining] = useState(false);
  const [pendingResult, setPendingResult] = useState<{ won: boolean; playerLegs: number; opponentLegs: number } | null>(null);

  useEffect(() => {
    if (careerId && eventId) initBracket();
  }, [careerId, eventId]);

  // Process pending result when bracket is ready
  useEffect(() => {
    if (pendingResult && bracket && bracketId) {
      console.log('[BRACKET] Processing pending result:', pendingResult, 'currentRound:', bracket.currentRound);
      handleMatchResult(pendingResult.won, pendingResult.playerLegs, pendingResult.opponentLegs);
      setPendingResult(null);
    }
  }, [pendingResult, bracket, bracketId]);

  async function initBracket() {
    setLoading(true);
    const supabase = createClient();

    // Get event info
    const { data: eventInfo } = await supabase
      .from('career_events')
      .select('event_name, event_type, format_legs, bracket_size, status, sequence_no')
      .eq('id', eventId)
      .single();

    if (eventInfo) {
      setEventName(eventInfo.event_name || '');
      setEventType(eventInfo.event_type || '');
      setEventSequence(eventInfo.sequence_no ?? null);
      setFormatLegs(eventInfo.format_legs || 3);
      // Get career tier
      const { data: cp } = await supabase.from('career_profiles').select('tier').eq('id', careerId).single();
      if (cp) setCareerTier(cp.tier);
      
      // Load round-specific formats for Pro Tour events
      if (eventInfo.event_type?.startsWith('pro_') || eventInfo.event_type === 'champions_series_night') {
        const { data: tmpl } = await supabase
          .from('career_schedule_templates')
          .select('metadata')
          .eq('tier', 5)
          .eq('event_type', eventInfo.event_type)
          .limit(1)
          .single();
        if (tmpl?.metadata) {
          try {
            const meta = typeof tmpl.metadata === 'string' ? JSON.parse(tmpl.metadata) : tmpl.metadata;
            if (meta.round_formats) setRoundFormats(meta.round_formats);
          } catch {}
        }
      }
    }

    // Step 1: Check if bracket already exists in DB with real data
    const { data: existingBracket } = await supabase
      .from('career_brackets')
      .select('id, bracket_data, bracket_size, rounds_total, current_round, status')
      .eq('event_id', eventId)
      .eq('career_id', careerId)
      .maybeSingle();

    if (existingBracket?.bracket_data?.matches?.length > 0) {
      // ✅ Bracket has real data — load it directly, no RPC call
      setBracketId(existingBracket!.id);
      setBracket(existingBracket!.bracket_data);
      setLoading(false);
      // Check for pending match result from sessionStorage
      setTimeout(() => {
        const resultStr = sessionStorage.getItem('career_bracket_result');
        if (resultStr) {
          sessionStorage.removeItem('career_bracket_result');
          const result = JSON.parse(resultStr);
          console.log('[BRACKET] Processing stored result (existing bracket):', result);
          setPendingResult(result);
        }
      }, 100);
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
    if (error || data?.error) {
      console.warn('[BRACKET] RPC failed, falling back to client-side generation:', error?.message || data?.error);
      // Fallback: create bracket row manually and generate client-side
      const bSize = eventInfo?.bracket_size || searchParams.get('bracketSize') ? parseInt(searchParams.get('bracketSize')!) : 32;
      const fLegs = eventInfo?.format_legs || searchParams.get('formatLegs') ? parseInt(searchParams.get('formatLegs')!) : 7;
      const participants = await buildParticipantsFromDB(supabase, careerId!, bSize, eventId!);
      if (participants.length >= bSize) {
        // Mark event active
        await supabase.from('career_events').update({ status: 'active' }).eq('id', eventId);
        // Create bracket row
        const rounds = Math.log2(bSize);
        const { data: newRow } = await supabase.from('career_brackets').insert({
          event_id: eventId, career_id: careerId, bracket_size: bSize,
          rounds_total: rounds, current_round: 1, bracket_data: {}, status: 'active'
        }).select('id').single();
        if (newRow) {
          const newBracket = generateBracket(participants, bSize, fLegs);
          await supabase.from('career_brackets').update({ bracket_data: newBracket as any }).eq('id', newRow.id);
          setBracketId(newRow.id);
          setBracket(newBracket);
          setLoading(false);
          return;
        }
      }
      toast.error('Failed to create bracket');
      router.push(`/app/career?id=${careerId}`);
      return;
    }

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

    // Process any pending match result from sessionStorage
    // Use setTimeout to ensure state has settled after setBracket above
    setTimeout(() => {
      const resultStr = sessionStorage.getItem('career_bracket_result');
      if (resultStr) {
        sessionStorage.removeItem('career_bracket_result');
        const result = JSON.parse(resultStr);
        console.log('[BRACKET] Processing stored result (deferred):', result);
        // Trigger a re-render with a flag to process the result
        setPendingResult(result);
      }
    }, 100);
  }

  // Build participants from career_opponents table (deterministic, no RPC needed)
  async function buildParticipantsFromDB(supabase: any, carId: string, bracketSize: number, evtId: string) {
    const { data: career } = await supabase.from('career_profiles').select('tier, career_seed, difficulty, season').eq('id', carId).single();
    const { data: evt } = await supabase.from('career_events').select('sequence_no, event_type').eq('id', evtId).single();
    if (!career) return [];

    // Champions Series events — 8 fixed players from career_champions_series
    if (evt?.event_type?.startsWith('champions_series')) {
      const { data: csPlayers } = await supabase
        .from('career_champions_series')
        .select('player_name, is_player, ranking_at_qualification, points')
        .eq('career_id', carId)
        .eq('season', career.season)
        .order('ranking_at_qualification');
      console.log('[BRACKET] CS players found:', csPlayers?.length, 'season:', career.season);
      if (!csPlayers || csPlayers.length === 0) {
        console.error('[BRACKET] No CS players found for season', career.season);
        return [];
      }
      const seed = (career.career_seed || 0) + (evt.sequence_no || 0) * 100;
      const hash = (n: number) => { let t = n + 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      const shuffled = [...csPlayers].sort((a: any, b: any) => hash(seed + a.player_name.length * 31) - hash(seed + b.player_name.length * 37));
      return shuffled.map((p: any, i: number) => ({
        id: p.is_player ? 'player' : `cs_${i}`,
        name: p.player_name,
        skill: Math.max(30, 80 - (p.ranking_at_qualification || 1) * 3),
        archetype: 'allrounder',
        isPlayer: p.is_player,
        seed: i + 1,
      }));
    }
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
    const usedNames = new Set<string>();
    // For Pro Tour (tier 5): ONLY use ranked players + random fill (no league opponents)
    // For other tiers: add league opponents first
    if (career.tier < 5) {
      for (let i = 0; i < bracketSize - 1 && i < shuffled.length; i++) {
        const o = shuffled[i];
        const name = `${o.first_name}${o.nickname ? ` '${o.nickname}'` : ''} ${o.last_name}`;
        usedNames.add(name);
        participants.push({
          id: o.id,
          name,
          skill: Math.round(o.skill_rating * mult),
          archetype: o.archetype,
          isPlayer: false,
          seed: i + 2,
        });
      }
    }
    // For Pro Tour (tier 5): add top 25 ranked players first
    if (career.tier >= 5) {
      const { data: rankings } = await supabase
        .from('career_pro_rankings')
        .select('player_name, ranking_points, ranking_position, is_player')
        .eq('career_id', carId)
        .order('ranking_position')
        .limit(25);
      if (rankings) {
        for (const r of rankings) {
          if (r.is_player) continue; // player already added
          if (usedNames.has(r.player_name)) continue;
          if (participants.length >= bracketSize) break;
          usedNames.add(r.player_name);
          participants.push({
            id: `ranked_${r.ranking_position}`,
            name: r.player_name,
            skill: Math.round(Math.max(40, 85 - (r.ranking_position - 1) * 1.5) * mult),
            archetype: 'allrounder',
            isPlayer: false,
            seed: participants.length + 1,
          });
        }
      }
    }
    // Fill remaining spots with seeded random outside players (no duplicates)
    if (participants.length < bracketSize) {
      const firstNames = ['James','Thomas','Chris','Ryan','Jake','Daniel','Michael','Sam','Luke','Alex','Joseph','William','Benjamin','Matt','Nathan','Robert','Stephen','David','Philip','Ian','Lee','Gary','Paul','Peter','Kevin','Andrew','Marcus','John','Liam','Owen','Theo','Max','Kai','Finn','Jack','Noah','Leon','Kyle','Callum','Connor','Declan','Ethan','Harry','Aiden','Charlie','Oscar','Rory','Wayne','Barry','Craig','Darren','Jason','Shaun','Neil','Glen','Karl','Ollie','Toby','Freddie','Alfie','George','Archie','Dylan','Logan','Tyler','Bradley','Patrick','Dominic','Kieran','Miguel','Carlos','Stefan','Jan','Lars','Kris','Sven','Marco','Fabio','Klaus','Hans','Erik','Nils','Piotr','Tomas','Andrei','Viktor','Isaac','Gabriel','Felix','Hugo','Rafael','Antonio','Pedro','Diego','Mateo','Sofia','Elena','Maria','Gemma','Amy','Sarah','Emma','Holly','Zoe','Kate','Lucy','Sophie','Lily','Eva','Isla','Ruby','Ellie','Freya','Hannah','Grace','Chloe','Lauren','Molly','Amber','Jade','Ella','Megan','Rachel','Becky','Natalie','Fiona','Bob','Mark','Adam','Richie','Kev'];
      const lastNames = ['Smith','Jones','Brown','Wilson','Taylor','Clark','Lewis','Walker','Hall','Green','Baker','King','Wright','Scott','Adams','Hill','Moore','Wood','Kelly','Evans','Murphy','Cox','Webb','Stone','Cole','Ford','Ross','Reed','Mills','West','Fox','Hayes','Day','Hart','Long','Cross','Lane','Flynn','Nash','Burke','Walsh','Burns','Quinn','Rhodes','Marshall','Hunter','Barker','Holmes','Watson','Palmer','Ryan','Wells','Price','Bennett','Campbell','Murray','Stewart','Crawford','Cameron','Grant','Hamilton','Robertson','Thomson','Henderson','Ferguson','Simpson','Patterson','Byrne','Doyle','Brennan','Gallagher','Reilly','Novak','Kowalski','Petrov','Mueller','Fischer','Weber','Schneider','Becker','Berg','Johansson','Andersen','De Boer','Van Dijk','Jansen','Garcia','Martinez','Lopez','Hernandez','Santos','Silva','Costa','Ferreira','Patel','Sharma','Tanaka','Chen','Kim','Merz','Russo','Romano','Diaz','Maguire','Wagner'];
      const archetypes = ['allrounder','power','precision','finishing'];
      const nicknames = ['The Hammer','Ice','Bulletproof','The Ace','Dynamite','Ironside','The Flash','Viper','Blitz','Thunder','The Machine','Scorpion','Wildcard','The Wolf','Maverick','The Surgeon','Hotshot','Cobra','The Natural','Laser','The Viking','Tornado','The Dart','The Beast','Lightning','Big Dog','Hard Man','Showtime','Nino','Jackpot','Smooth'];
      // Seeded hash for deterministic generation per event
      const seededHash = (n: number) => { let t = (seed + n) | 0; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0); };
      const remaining = bracketSize - participants.length;
      let genIdx = 0;
      for (let i = 0; i < remaining && genIdx < 1000; genIdx++) {
        const fnI = seededHash(genIdx * 3 + 1) % firstNames.length;
        const lnI = seededHash(genIdx * 3 + 2) % lastNames.length;
        const hasNick = (seededHash(genIdx * 3 + 3) % 4) === 0;
        const nickI = seededHash(genIdx * 7 + 5) % nicknames.length;
        const fn = firstNames[fnI];
        const ln = lastNames[lnI];
        const nick = hasNick ? nicknames[nickI] : null;
        const name = nick ? `${fn} '${nick}' ${ln}` : `${fn} ${ln}`;
        if (!usedNames.has(name)) {
          usedNames.add(name);
          const skill = Math.round((30 + (seededHash(genIdx * 11) % 40)) * mult);
          participants.push({
            id: `outside_${i}`,
            name,
            skill,
            archetype: archetypes[seededHash(genIdx * 13) % archetypes.length],
            isPlayer: false,
            seed: participants.length + 1,
          });
          i++;
        }
      }
    }
    return participants;
  }

  async function handleMatchResult(won: boolean, playerLegs: number, opponentLegs: number) {
    if (!bracket || !bracketId || !careerId || !eventId) {
      console.error('[BRACKET] handleMatchResult: missing data', { bracket: !!bracket, bracketId, careerId, eventId });
      return;
    }
    console.log('[BRACKET] Processing result:', { won, playerLegs, opponentLegs, currentRound: bracket.currentRound });
    const updated = processRoundAfterPlayerMatch(bracket, won, playerLegs, opponentLegs, formatLegs);
    console.log('[BRACKET] After process:', { newRound: updated.currentRound, completed: updated.completed, playerEliminated: updated.playerEliminated });
    setBracket(updated);
    const supabase = createClient();
    // Save bracket state directly to table (more reliable than RPC)
    const { error: saveError } = await supabase.from('career_brackets').update({
      bracket_data: updated as any,
      current_round: updated.currentRound,
      status: updated.completed ? 'completed' : 'active',
    }).eq('id', bracketId);
    if (saveError) console.error('[BRACKET] Save error:', saveError);
    if (updated.completed) {
      const playerWon = updated.winnerId === 'player';
      const { data: completeData } = await supabase.rpc('rpc_career_complete_bracket_event', {
        p_career_id: careerId, p_event_id: eventId, p_bracket_id: bracketId,
        p_player_won_tournament: playerWon, p_player_eliminated_round: updated.playerEliminatedRound as any,
        p_total_rounds: updated.totalRounds as any,
      });
      const placement = getPlacement(updated.playerEliminatedRound, updated.totalRounds, playerWon);
      setTournamentResult({ ...completeData, placement, playerWon });
      // Pro Major Qualifier: restore major event if player won
      if (eventType === 'pro_major_qualifier') {
        try {
          await supabase.rpc('rpc_pro_tour_restore_major_after_qualifier', { p_career_id: careerId });
          if (playerWon) {
            toast.success('Qualified for the Pro Tour Major!', { duration: 5000 });
          } else {
            toast.error('Eliminated from Major qualification.', { duration: 5000 });
          }
        } catch {}
      }
      // Award tournament league points for Tier 4 National Tour
      try {
        await supabase.rpc('rpc_tier4_award_tournament_points', {
          p_career_id: careerId, p_event_id: eventId, p_placement: placement,
        });
      } catch {}
      // Award Pro Tour ranking points (Tier 5 only)
      if (careerTier >= 5) try {
        const placementMap: Record<string, string> = {
          'Winner': 'W', 'Runner-Up': 'RU', 'Semi-Finalist': 'SF',
          'Quarter-Finalist': 'QF', 'Round of 16 Exit': 'L16', 'Last 16': 'L16',
          'Round 2 Exit': 'L32', 'Round 1 Exit': 'L64',
        };
        const shortPlacement = placementMap[placement] || (() => {
          if (placement.includes('Round') && placement.includes('Exit')) {
            const round = parseInt(placement);
            if (updated.totalRounds >= 7) return round <= 1 ? 'L128' : round <= 2 ? 'L64' : round <= 3 ? 'L32' : 'L16';
            return round <= 1 ? 'L64' : round <= 2 ? 'L32' : 'L16';
          }
          return 'L64';
        })();
        console.log('[BRACKET] Awarding Pro Tour points:', { careerId, eventId, shortPlacement, careerTier });
        const { data: awardResult, error: awardErr } = await supabase.rpc('rpc_pro_tour_award_points', {
          p_career_id: careerId, p_event_id: eventId, p_placement: shortPlacement,
        });
        console.log('[BRACKET] Award result:', awardResult, 'Error:', awardErr);
        
        // Award ranking points to ALL AI players based on their bracket results
        if (updated.matches) {
          const aiResults: Record<string, string> = {};
          // Collect all unique AI participants from matches
          const aiPlayers = new Map<string, { id: string; name: string }>();
          for (const m of updated.matches) {
            if (m.participant1 && !m.participant1.isPlayer && m.participant1.name) {
              aiPlayers.set(m.participant1.id, { id: m.participant1.id, name: m.participant1.name });
            }
            if (m.participant2 && !m.participant2.isPlayer && m.participant2.name) {
              aiPlayers.set(m.participant2.id, { id: m.participant2.id, name: m.participant2.name });
            }
          }
          // Find how far each AI player got
          for (const [, p] of aiPlayers) {
            let lastRound = 0;
            let wasWinner = false;
            for (const m of updated.matches) {
              const isP1 = m.participant1?.id === p.id;
              const isP2 = m.participant2?.id === p.id;
              if (!isP1 && !isP2) continue;
              if (m.round > lastRound) {
                lastRound = m.round;
                wasWinner = m.winnerId === p.id;
              }
            }
            const totalRounds = updated.totalRounds || 6;
            if (wasWinner && lastRound === totalRounds) {
              aiResults[p.name] = 'W';
            } else if (lastRound === totalRounds) {
              aiResults[p.name] = 'RU';
            } else if (lastRound === totalRounds - 1) {
              aiResults[p.name] = 'SF';
            } else if (lastRound === totalRounds - 2) {
              aiResults[p.name] = 'QF';
            } else if (lastRound === totalRounds - 3) {
              aiResults[p.name] = 'L16';
            } else if (lastRound === totalRounds - 4) {
              aiResults[p.name] = 'L32';
            } else {
              aiResults[p.name] = 'L64';
            }
          }
          try {
            await supabase.rpc('rpc_pro_tour_award_ai_points', {
              p_career_id: careerId,
              p_event_id: eventId,
              p_results: aiResults,
            });
            console.log('[BRACKET] AI ranking points awarded:', Object.keys(aiResults).length, 'players');
          } catch (e) { console.error('[BRACKET] AI points error:', e); }
        }
        
        // Simulate a Champions Series night after each Pro Tour tournament
        if (!eventType?.startsWith('champions_series')) {
          try { await supabase.rpc('rpc_champions_series_simulate_night', { p_career_id: careerId }); } catch {}
        }
      } catch {}
      // Champions Series night completion (Tier 5)
      try {
        const csResult = eventType?.startsWith('champions_series') ? (
          playerWon ? 'winner' : updated.playerEliminatedRound === updated.totalRounds ? 'runner_up'
            : updated.playerEliminatedRound === updated.totalRounds - 1 ? 'semi' : 'qf'
        ) : null;
        if (csResult) {
          const playerMatches = updated.matches.filter(m => !m.simulated && m.score);
          const pLegsFor = playerMatches.reduce((s, m) => s + (m.participant1?.isPlayer ? (m.score?.p1Legs || 0) : (m.score?.p2Legs || 0)), 0);
          const pLegsAgainst = playerMatches.reduce((s, m) => s + (m.participant1?.isPlayer ? (m.score?.p2Legs || 0) : (m.score?.p1Legs || 0)), 0);
          await supabase.rpc('rpc_champions_series_night_complete', {
            p_career_id: careerId, p_event_id: eventId,
            p_player_result: csResult, p_player_legs_for: pLegsFor, p_player_legs_against: pLegsAgainst,
          });
          
          // Also update AI CS players based on bracket results
          const csPointsMap: Record<string, number> = { 'W': 5, 'RU': 3, 'SF': 2, 'QF': 1 };
          const aiCSResults: Record<string, { placement: string; legsFor: number; legsAgainst: number }> = {};
          const aiCSPlayers = new Map<string, { id: string; name: string }>();
          for (const m of updated.matches) {
            if (m.participant1 && !m.participant1.isPlayer && m.participant1.name) aiCSPlayers.set(m.participant1.id, m.participant1);
            if (m.participant2 && !m.participant2.isPlayer && m.participant2.name) aiCSPlayers.set(m.participant2.id, m.participant2);
          }
          for (const [, p] of aiCSPlayers) {
            let lastRound = 0; let wasWinner = false;
            let lf = 0; let la = 0;
            for (const m of updated.matches) {
              const isP1 = m.participant1?.id === p.id;
              const isP2 = m.participant2?.id === p.id;
              if (!isP1 && !isP2) continue;
              if (m.round > lastRound) { lastRound = m.round; wasWinner = m.winnerId === p.id; }
              if (m.score) { lf += isP1 ? (m.score.p1Legs||0) : (m.score.p2Legs||0); la += isP1 ? (m.score.p2Legs||0) : (m.score.p1Legs||0); }
            }
            const tr = updated.totalRounds || 3;
            const pl = wasWinner && lastRound === tr ? 'W' : lastRound === tr ? 'RU' : lastRound === tr-1 ? 'SF' : 'QF';
            aiCSResults[p.name] = { placement: pl, legsFor: lf, legsAgainst: la };
          }
          // Batch update AI CS standings
          try {
            await supabase.rpc('rpc_champions_series_update_ai', {
              p_career_id: careerId,
              p_results: aiCSResults,
            });
          } catch (e) { console.error('[BRACKET] AI CS update error:', e); }
        }
      } catch {}
      setShowResults(true);
    }
  }

  const isSecondStarterMissedSemi =
    bracket?.completed &&
    eventType === 'trial_tournament' &&
    eventSequence === 2 &&
    tournamentResult &&
    !tournamentResult.playerWon &&
    tournamentResult.placement !== 'Semi-Finalist' &&
    tournamentResult.placement !== 'Runner-Up';

  async function routeToFallbackTrainingIfNeeded() {
    if (!careerId || !isSecondStarterMissedSemi || routingToTraining) {
      return false;
    }

    setRoutingToTraining(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('rpc_career_play_next_event', { p_career_id: careerId });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!(data?.skipped && data?.event_type === 'training')) {
        throw new Error('No pending training event found.');
      }

      sessionStorage.setItem(CAREER_TRAINING_RETURN_KEY, careerId);
      sessionStorage.setItem(CAREER_TRAINING_AUTO_PROMOTE_KEY, '1');
      router.push(getRandomCareerTrainingRoute());
      return true;
    } catch (err: any) {
      toast.error(err.message || 'Failed to start training');
      return false;
    } finally {
      setRoutingToTraining(false);
    }
  }

  async function handleBackToCareer() {
    const startedTraining = await routeToFallbackTrainingIfNeeded();
    if (!startedTraining) {
      router.push(`/app/career?id=${careerId}`);
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
    const bestOfMap: Record<number, any> = { 1: 'best-of-1', 3: 'best-of-3', 5: 'best-of-5', 7: 'best-of-7', 9: 'best-of-9', 11: 'best-of-11', 13: 'best-of-13', 15: 'best-of-15', 17: 'best-of-17', 19: 'best-of-19', 21: 'best-of-21', 23: 'best-of-23' };
    // Determine round-specific format for Pro Tour events
    let matchFormat = formatLegs;
    if (roundFormats && bracket.totalRounds && bracket.currentRound) {
      const roundsFromEnd = bracket.totalRounds - bracket.currentRound;
      const roundKey = roundsFromEnd === 0 ? 'F' : roundsFromEnd === 1 ? 'SF' : roundsFromEnd === 2 ? 'QF'
        : `L${Math.pow(2, roundsFromEnd + 1)}`;
      matchFormat = roundFormats[roundKey] || formatLegs;
    }
    setConfig({
      mode: '501', botDifficulty: diffKey as any, botAverage: avg, doubleOut: true,
      bestOf: bestOfMap[matchFormat] || 'best-of-3', atcOpponent: 'bot',
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
            <Button variant="ghost" size="sm" onClick={() => void handleBackToCareer()} className="text-slate-400 hover:text-white px-2" disabled={routingToTraining}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Trophy className="w-5 h-5 text-purple-400" />
            <h1 className="text-lg font-black text-white">{eventName}</h1>
          </div>
          <div className="flex gap-1.5">
            <Badge className="bg-white/10 text-white/70 text-[10px]">{bracket.size}-Player</Badge>
            <Badge className="bg-white/10 text-white/70 text-[10px]">Best of {(() => {
              if (roundFormats && bracket?.totalRounds && bracket?.currentRound) {
                const rfe = bracket.totalRounds - bracket.currentRound;
                const rk = rfe === 0 ? 'F' : rfe === 1 ? 'SF' : rfe === 2 ? 'QF' : `L${Math.pow(2, rfe + 1)}`;
                return roundFormats[rk] || formatLegs;
              }
              return formatLegs;
            })()}</Badge>
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
                  <p className="text-amber-400 text-sm italic mb-3">&ldquo;{tournamentResult.promo_message}&rdquo;</p>
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
                  onClick={() => void handleBackToCareer()}
                  disabled={routingToTraining}>
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
