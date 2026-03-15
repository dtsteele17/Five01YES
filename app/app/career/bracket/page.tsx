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
import { getTierTheme, getEventTheme } from '@/lib/career/tierThemes';
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
  const [playerName, setPlayerName] = useState('You');
  const [formatLegs, setFormatLegs] = useState(3);
  const [roundFormats, setRoundFormats] = useState<Record<string, number> | null>(null);
  const [playingMatch, setPlayingMatch] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [tournamentResult, setTournamentResult] = useState<any>(null);
  const [routingToTraining, setRoutingToTraining] = useState(false);

  // Replace "You" with actual player name in bracket data
  function patchPlayerName(bracketData: any, name: string): any {
    if (!bracketData?.matches || name === 'You') return bracketData;
    const patched = JSON.parse(JSON.stringify(bracketData));
    for (const m of patched.matches) {
      if (m.participant1?.isPlayer && m.participant1.name === 'You') m.participant1.name = name;
      if (m.participant2?.isPlayer && m.participant2.name === 'You') m.participant2.name = name;
    }
    return patched;
  }

  // Inject ranking data into bracket participants (for brackets created before rank was stored)
  async function patchRankings(bracketData: any, carId: string): Promise<any> {
    if (!bracketData?.matches || careerTier < 5) return bracketData;
    const supabase = createClient();
    const { data: rankings } = await supabase
      .from('career_pro_rankings')
      .select('player_name, ranking_position, is_player')
      .eq('career_id', carId)
      .order('ranking_position')
      .limit(50);
    if (!rankings || rankings.length === 0) return bracketData;
    const rankMap = new Map<string, number>();
    for (const r of rankings) {
      rankMap.set(r.player_name, r.ranking_position);
      if (r.is_player) rankMap.set('__player__', r.ranking_position);
    }
    const patched = JSON.parse(JSON.stringify(bracketData));
    for (const m of patched.matches) {
      if (m.participant1) {
        if (m.participant1.isPlayer && rankMap.has('__player__')) m.participant1.rank = rankMap.get('__player__');
        else if (rankMap.has(m.participant1.name)) m.participant1.rank = rankMap.get(m.participant1.name);
      }
      if (m.participant2) {
        if (m.participant2.isPlayer && rankMap.has('__player__')) m.participant2.rank = rankMap.get('__player__');
        else if (rankMap.has(m.participant2.name)) m.participant2.rank = rankMap.get(m.participant2.name);
      }
    }
    return patched;
  }
  const [pendingResult, setPendingResult] = useState<{ won: boolean; playerLegs: number; opponentLegs: number } | null>(null);

  useEffect(() => {
    if (careerId && eventId) initBracket();
  }, [careerId, eventId]);

  // Process pending result when bracket is ready
  useEffect(() => {
    if (pendingResult && bracket && bracketId) {
      console.log('[BRACKET] Processing pending result:', pendingResult, 'currentRound:', bracket.currentRound);
      handleMatchResult(pendingResult.won, pendingResult.playerLegs, pendingResult.opponentLegs, pendingResult);
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
      const { data: cp } = await supabase.from('career_profiles').select('tier, player_name').eq('id', careerId).single();
      if (cp) { setCareerTier(cp.tier); if (cp.player_name) setPlayerName(cp.player_name); }

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
      // For CS events, verify the bracket has the correct CS players (not random names)
      const isCSEvent = eventInfo?.event_type?.startsWith('champions_series');
      if (isCSEvent && existingBracket?.bracket_data?.matches?.[0]) {
        const bracketNames = new Set<string>();
        for (const m of existingBracket!.bracket_data.matches) {
          if (m.participant1?.name && !m.participant1.isPlayer) bracketNames.add(m.participant1.name);
          if (m.participant2?.name && !m.participant2.isPlayer) bracketNames.add(m.participant2.name);
        }
        // Check if bracket players match CS standings
        const { data: csCheck } = await supabase
          .from('career_champions_series')
          .select('player_name')
          .eq('career_id', careerId)
          .eq('is_player', false);
        const csNames = new Set((csCheck || []).map((p: any) => p.player_name));
        const hasCorrectPlayers = [...bracketNames].some(n => csNames.has(n));
        if (!hasCorrectPlayers && csNames.size > 0) {
          console.warn('[BRACKET] CS bracket has wrong players, regenerating...');
          // Delete old bracket and regenerate
          await supabase.from('career_brackets').delete().eq('id', existingBracket.id);
          const bSize = existingBracket.bracket_size || 8;
          const fLegs = eventInfo?.format_legs || 11;
          const participants = await buildParticipantsFromDB(supabase, careerId!, bSize, eventId!);
          if (participants.length >= bSize) {
            const newBracket = generateBracket(participants, bSize, fLegs);
            const { data: newRow } = await supabase.from('career_brackets').insert({
              event_id: eventId, career_id: careerId, bracket_size: bSize,
              rounds_total: Math.log2(bSize), current_round: 1, bracket_data: newBracket, status: 'active'
            }).select('id').single();
            if (newRow) { setBracketId(newRow.id); setBracket(patchPlayerName(newBracket, playerName)); setLoading(false); return; }
          }
        }
      }
      // Check for duplicate names in bracket — regenerate if found (legacy brackets)
      if (existingBracket!.bracket_data?.currentRound === 1 && !existingBracket!.bracket_data?.matches?.some((m: any) => m.winnerId)) {
        const allNames: string[] = [];
        for (const m of existingBracket!.bracket_data.matches) {
          if (m.participant1?.name) allNames.push(m.participant1.name);
          if (m.participant2?.name) allNames.push(m.participant2.name);
        }
        const baseNames = allNames.map(n => n.replace(/'[^']*'\s*/g, ''));
        const uniqueBase = new Set(baseNames);
        if (uniqueBase.size < baseNames.length) {
          console.warn('[BRACKET] Found duplicate names, regenerating bracket...');
          await supabase.from('career_brackets').delete().eq('id', existingBracket!.id);
          const bSize = existingBracket!.bracket_size || 16;
          const fLegs = eventInfo?.format_legs || 9;
          const participants = await buildParticipantsFromDB(supabase, careerId!, bSize, eventId!);
          if (participants.length >= 2) {
            const newBracket = generateBracket(participants, bSize, fLegs);
            const { data: newRow } = await supabase.from('career_brackets').insert({
              event_id: eventId, career_id: careerId, bracket_size: bSize,
              rounds_total: Math.log2(bSize), current_round: 1, bracket_data: newBracket, status: 'active'
            }).select('id').single();
            if (newRow) {
              setBracketId(newRow.id);
              const patched2 = patchPlayerName(newBracket, playerName);
              patchRankings(patched2, careerId!).then(ranked => setBracket(ranked));
              setLoading(false);
              return;
            }
          }
        }
      }
      // ✅ Bracket has real data - load it directly, no RPC call
      setBracketId(existingBracket!.id);
      const patched = patchPlayerName(existingBracket!.bracket_data, playerName);
      patchRankings(patched, careerId!).then(ranked => setBracket(ranked));
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
      // Bracket row exists but data is empty - generate from opponents directly (NO RPC call)
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
        setBracket(patchPlayerName(newBracket, playerName));
        setLoading(false);
        return;
      }
    }

    // Step 2: No bracket at all - call init RPC ONCE to create the bracket row + generate opponents
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
          setBracket(patchPlayerName(newBracket, playerName));
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

    // For CS events, ALWAYS regenerate with correct CS players (RPC uses random opponents)
    const isCSEvent2 = eventInfo?.event_type?.startsWith('champions_series');
    if (isCSEvent2) {
      // CS semi = 4 players, CS final = 2 players, CS night = 8 players
      const csBracketSize = eventInfo?.event_type === 'champions_series_semi' ? 4 
        : eventInfo?.event_type === 'champions_series_final' ? 2 
        : data.bracket_size || 8;
      const csParticipants = await buildParticipantsFromDB(supabase, careerId!, csBracketSize, eventId!);
      if (csParticipants.length >= csBracketSize) {
        const newBracket = generateBracket(csParticipants, csBracketSize, data.format_legs || 11);
        await supabase.from('career_brackets').update({ bracket_data: newBracket as any }).eq('id', data.bracket_id);
        setBracket(patchPlayerName(newBracket, playerName));
      } else if (data.bracket_data?.matches?.length > 0) {
        setBracket(patchPlayerName(data.bracket_data, playerName));
      }
    } else if (data.bracket_data?.matches?.length > 0) {
      setBracket(patchPlayerName(data.bracket_data, playerName));
    } else {
      // Generate from participants returned by RPC
      const participants = data.participants?.length > 0 ? data.participants
        : await buildParticipantsFromDB(supabase, careerId!, data.bracket_size || 8, eventId!);
      const newBracket = generateBracket(participants, data.bracket_size || 8, data.format_legs || 3);
      // Save using direct update (more reliable than RPC)
      await supabase.from('career_brackets').update({ bracket_data: newBracket as any }).eq('id', data.bracket_id);
      setBracket(patchPlayerName(newBracket, playerName));
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
    const { data: career } = await supabase.from('career_profiles').select('tier, career_seed, difficulty, season, player_name').eq('id', carId).single();
    const { data: evt } = await supabase.from('career_events').select('sequence_no, event_type').eq('id', evtId).single();
    if (!career) return [];

    // Champions Series events - players from career_champions_series
    if (evt?.event_type?.startsWith('champions_series')) {
      const { data: csPlayers } = await supabase
        .from('career_champions_series')
        .select('player_name, is_player, ranking_at_qualification, points')
        .eq('career_id', carId)
        .eq('season', career.season)
        .order('points', { ascending: false });
      console.log('[BRACKET] CS players found:', csPlayers?.length, 'season:', career.season, 'event_type:', evt.event_type);
      if (!csPlayers || csPlayers.length === 0) {
        console.error('[BRACKET] No CS players found for season', career.season);
        return [];
      }

      // Semi-final: top 4 by points, seeded 1st vs 4th, 2nd vs 3rd
      if (evt.event_type === 'champions_series_semi') {
        const top4 = csPlayers.slice(0, 4);
        // Order for bracket: [1st, 4th, 2nd, 3rd] so generateBracket pairs 1v4, 2v3
        const seeded = [top4[0], top4[3], top4[1], top4[2]];
        console.log('[BRACKET] CS Semi seeding:', seeded.map((p: any, i: number) => `${i+1}. ${p.player_name} (${p.points}pts)`));
        return seeded.map((p: any, i: number) => ({
          id: p.is_player ? 'player' : `cs_${i}`,
          name: p.player_name,
          skill: Math.max(30, 80 - (p.ranking_at_qualification || 1) * 3),
          archetype: 'allrounder',
          isPlayer: p.is_player,
          seed: i + 1,
        }));
      }

      // Final: 2 winners from semi-final bracket
      if (evt.event_type === 'champions_series_final') {
        // Find the completed semi-final bracket for this season
        const { data: semiEvent } = await supabase
          .from('career_events')
          .select('id')
          .eq('career_id', carId)
          .eq('season', career.season)
          .eq('event_type', 'champions_series_semi')
          .eq('status', 'completed')
          .single();
        if (semiEvent) {
          const { data: semiBracket } = await supabase
            .from('career_brackets')
            .select('bracket_data')
            .eq('event_id', semiEvent.id)
            .single();
          if (semiBracket?.bracket_data?.matches) {
            // Find the semi-final match winners (final round matches)
            const matches = semiBracket.bracket_data.matches;
            const maxRound = Math.max(...matches.map((m: any) => m.round));
            const finalRoundMatches = matches.filter((m: any) => m.round === maxRound);
            const finalists: any[] = [];
            for (const m of finalRoundMatches) {
              if (m.winnerId) {
                const winner = m.player1Id === m.winnerId ? m.player1Name : m.player2Name;
                const isPlayer = m.winnerId === 'player';
                const csEntry = csPlayers.find((p: any) => p.player_name === winner);
                finalists.push({
                  id: isPlayer ? 'player' : `cs_final_${finalists.length}`,
                  name: winner,
                  skill: csEntry ? Math.max(30, 80 - (csEntry.ranking_at_qualification || 1) * 3) : 70,
                  archetype: 'allrounder',
                  isPlayer,
                  seed: finalists.length + 1,
                });
              }
            }
            if (finalists.length === 2) {
              console.log('[BRACKET] CS Final finalists:', finalists.map((f: any) => f.name));
              return finalists;
            }
          }
        }
        // Fallback: top 2 by points
        const top2 = csPlayers.slice(0, 2);
        return top2.map((p: any, i: number) => ({
          id: p.is_player ? 'player' : `cs_final_${i}`,
          name: p.player_name,
          skill: Math.max(30, 80 - (p.ranking_at_qualification || 1) * 3),
          archetype: 'allrounder',
          isPlayer: p.is_player,
          seed: i + 1,
        }));
      }

      // For regular CS nights (8-player bracket), shuffle all 8
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
    const { data: opponents } = career.tier < 5 ? await supabase
      .from('career_opponents')
      .select('id, first_name, last_name, nickname, skill_rating, archetype')
      .eq('career_id', carId)
      .eq('tier', career.tier)
      .order('id')
      .limit(50) : { data: [] };
    if (!opponents && career.tier < 5) return [];
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
      { id: 'player', name: career.player_name || 'You', skill: 50, archetype: 'allrounder', isPlayer: true, seed: 1 },
    ];
    const usedNames = new Set<string>();
    const usedBaseNames = new Set<string>(); // first+last without nickname, for dedup
    const usedFirstNames = new Set<string>();
    // For Pro Tour (tier 5): ONLY use ranked players + random fill (no league opponents)
    // For other tiers: add league opponents first
    if (career.tier < 5) {
      for (let i = 0; i < bracketSize - 1 && i < shuffled.length; i++) {
        const o = shuffled[i];
        const baseName = `${o.first_name} ${o.last_name}`;
        if (usedBaseNames.has(baseName)) continue; // skip duplicate first+last combos
        const name = `${o.first_name}${o.nickname ? ` '${o.nickname}'` : ''} ${o.last_name}`;
        usedNames.add(name);
        usedBaseNames.add(baseName);
        usedFirstNames.add(o.first_name);
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
    // For Pro Tour (tier 5): add ALL ranked players, then fill with unique random names
    if (career.tier >= 5) {
      const { data: rankings } = await supabase
        .from('career_pro_rankings')
        .select('player_name, ranking_points, ranking_position, is_player')
        .eq('career_id', carId)
        .order('ranking_position')
        .limit(25);
      // Get player's ranking
      const playerRanking = rankings?.find((r: any) => r.is_player);
      if (playerRanking) {
        participants[0].rank = playerRanking.ranking_position;
      }
      if (rankings) {
        for (const r of rankings) {
          if (r.is_player) continue;
          if (participants.length >= bracketSize) break;
          // Extract all name parts for dedup
          const baseName = r.player_name.replace(/'[^']*'\s*/g, '').trim();
          const firstName = r.player_name.split(/[\s']/)[0];
          usedNames.add(r.player_name);
          usedBaseNames.add(baseName);
          usedFirstNames.add(firstName);
          participants.push({
            id: `ranked_${r.ranking_position}`,
            name: r.player_name,
            skill: Math.round(Math.max(40, 85 - (r.ranking_position - 1) * 1.5) * mult),
            archetype: 'allrounder',
            isPlayer: false,
            seed: participants.length + 1,
            rank: r.ranking_position,
          });
        }
      }
    }
    // Fill remaining spots with random outside players — ZERO duplicates
    if (participants.length < bracketSize) {
      const firstNames = ['James','Thomas','Chris','Ryan','Jake','Daniel','Michael','Sam','Luke','Alex','Joseph','William','Benjamin','Matt','Nathan','Robert','Stephen','David','Philip','Ian','Lee','Gary','Paul','Peter','Kevin','Andrew','Marcus','John','Liam','Owen','Theo','Max','Kai','Finn','Jack','Noah','Leon','Kyle','Callum','Connor','Declan','Ethan','Harry','Aiden','Charlie','Oscar','Rory','Wayne','Barry','Craig','Darren','Jason','Shaun','Neil','Glen','Karl','Ollie','Toby','Freddie','Alfie','George','Archie','Dylan','Logan','Tyler','Bradley','Patrick','Dominic','Kieran','Miguel','Carlos','Stefan','Jan','Lars','Kris','Sven','Marco','Fabio','Klaus','Hans','Erik','Nils','Piotr','Tomas','Andrei','Viktor','Isaac','Gabriel','Felix','Hugo','Rafael','Antonio','Pedro','Diego','Mateo','Sofia','Elena','Maria','Gemma','Amy','Sarah','Emma','Holly','Zoe','Kate','Lucy','Sophie','Lily','Eva','Isla','Ruby','Ellie','Freya','Hannah','Grace','Chloe','Lauren','Molly','Amber','Jade','Ella','Megan','Rachel','Becky','Natalie','Fiona','Bob','Mark','Adam','Richie','Kev','Niall','Mick','Sean','Colm','Oisin','Cian','Tadhg','Roisin','Siobhan','Aoife','Ciara','Maeve','Sorcha','Ewan','Blair','Hamish','Angus','Fraser','Murray','Ross','Trent','Brody','Heath','Zane','Jude','Reece','Troy','Dale','Clive','Stuart','Gareth','Rhys','Gavin','Trevor','Graham'];
      const lastNames = ['Smith','Jones','Brown','Wilson','Taylor','Clark','Lewis','Walker','Hall','Green','Baker','King','Wright','Scott','Adams','Hill','Moore','Wood','Kelly','Evans','Murphy','Cox','Webb','Stone','Cole','Ford','Ross','Reed','Mills','West','Fox','Hayes','Day','Hart','Long','Cross','Lane','Flynn','Nash','Burke','Walsh','Burns','Quinn','Rhodes','Marshall','Hunter','Barker','Holmes','Watson','Palmer','Ryan','Wells','Price','Bennett','Campbell','Murray','Stewart','Crawford','Cameron','Grant','Hamilton','Robertson','Thomson','Henderson','Ferguson','Simpson','Patterson','Byrne','Doyle','Brennan','Gallagher','Reilly','Novak','Kowalski','Petrov','Mueller','Fischer','Weber','Schneider','Becker','Berg','Johansson','Andersen','De Boer','Van Dijk','Jansen','Garcia','Martinez','Lopez','Hernandez','Santos','Silva','Costa','Ferreira','Patel','Sharma','Tanaka','Chen','Kim','Merz','Russo','Romano','Diaz','Maguire','Wagner','Doherty','McLaughlin','O\'Brien','McCarthy','O\'Sullivan','Carroll','Fitzgerald','Sweeney','Lynch','Nolan','Duffy','Power','Whelan','Buckley','Healy'];
      const archetypes = ['allrounder','power','precision','finishing'];
      const nicknames = ['The Hammer','Ice','Bulletproof','The Ace','Dynamite','Ironside','The Flash','Viper','Blitz','Thunder','The Machine','Scorpion','Wildcard','The Wolf','Maverick','The Surgeon','Hotshot','Cobra','The Natural','Laser','The Viking','Tornado','The Dart','The Beast','Lightning','Big Dog','Hard Man','Showtime','Nino','Jackpot','Smooth','The Professor','Double Top','Treble Top','The Phoenix','The Chief','The Power','Barney','Sparky','The Magician'];
      // Filter out first names already used by ranked players
      const availableFirstNames = firstNames.filter(fn => !usedFirstNames.has(fn));
      const seededHash = (n: number) => { let t = (seed + n) | 0; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0); };
      // Pre-shuffle available first names deterministically
      const shuffledFN = [...availableFirstNames].sort((a, b) => seededHash(a.charCodeAt(0) * 31 + a.length) - seededHash(b.charCodeAt(0) * 31 + b.length));
      const remaining = bracketSize - participants.length;
      let fnIdx = 0;
      for (let i = 0; i < remaining && fnIdx < shuffledFN.length; fnIdx++) {
        const fn = shuffledFN[fnIdx];
        // Pick a last name that hasn't been used with any first name
        let ln = '';
        for (let attempt = 0; attempt < lastNames.length; attempt++) {
          const lnCandidate = lastNames[seededHash(fnIdx * 7 + attempt * 3 + 2) % lastNames.length];
          const baseName = `${fn} ${lnCandidate}`;
          if (!usedBaseNames.has(baseName)) { ln = lnCandidate; break; }
        }
        if (!ln) continue;
        const baseName = `${fn} ${ln}`;
        const hasNick = (seededHash(fnIdx * 3 + 3) % 4) === 0;
        const nick = hasNick ? nicknames[seededHash(fnIdx * 7 + 5) % nicknames.length] : null;
        const name = nick ? `${fn} '${nick}' ${ln}` : `${fn} ${ln}`;
        usedNames.add(name);
        usedBaseNames.add(baseName);
        usedFirstNames.add(fn);
        const skill = Math.round((30 + (seededHash(fnIdx * 11) % 40)) * mult);
        // For Pro Tour, assign a random ranking between 26-100
        const randomRank = career.tier >= 5 ? 26 + (seededHash(fnIdx * 17 + 7) % 75) : undefined;
        participants.push({
          id: `outside_${i}`,
          name,
          skill,
          archetype: archetypes[seededHash(fnIdx * 13) % archetypes.length],
          isPlayer: false,
          seed: participants.length + 1,
          rank: randomRank,
        });
        i++;
      }
    }
    // Final safety: remove any duplicates that slipped through (keep first occurrence)
    const finalNames = new Set<string>();
    const deduped = participants.filter(p => {
      const base = p.name.replace(/'[^']*'\s*/g, '').trim();
      if (finalNames.has(base)) {
        console.warn('[BRACKET] Removing duplicate:', p.name);
        return false;
      }
      finalNames.add(base);
      return true;
    });
    // Also ensure unique random ranks for non-top-25 players
    if (career.tier >= 5) {
      const usedRanks = new Set<number>();
      for (const p of deduped) {
        if (p.rank && p.rank <= 25) usedRanks.add(p.rank);
      }
      for (const p of deduped) {
        if (p.rank && p.rank > 25) {
          while (usedRanks.has(p.rank)) p.rank++;
          usedRanks.add(p.rank);
        }
      }
    }
    console.log(`[BRACKET] Built ${deduped.length} participants (${participants.length - deduped.length} dupes removed)`);
    return deduped;
  }

  async function handleMatchResult(won: boolean, playerLegs: number, opponentLegs: number, extraStats?: any) {
    if (!bracket || !bracketId || !careerId || !eventId) {
      console.error('[BRACKET] handleMatchResult: missing data', { bracket: !!bracket, bracketId, careerId, eventId });
      return;
    }
    console.log('[BRACKET] Processing result:', { won, playerLegs, opponentLegs, currentRound: bracket.currentRound });
    const updated = processRoundAfterPlayerMatch(bracket, won, playerLegs, opponentLegs, formatLegs);
    console.log('[BRACKET] After process:', { newRound: updated.currentRound, completed: updated.completed, playerEliminated: updated.playerEliminated });
    setBracket(updated);
    const supabase = createClient();

    // Record tournament match in career_matches for stats tracking
    try {
      const opponent = getPlayerOpponent(bracket);
      // Find or create a career_opponents entry for the bracket opponent
      if (opponent && !opponent.isPlayer) {
        // Use the bracket opponent's id to find the career_opponents record, or insert via RPC
        const nameClean = opponent.name || 'Unknown';
        // Try to find existing opponent by name
        const { data: existingOpp } = await supabase
          .from('career_opponents')
          .select('id')
          .eq('career_id', careerId)
          .or(`first_name.eq.${nameClean},last_name.eq.${nameClean}`)
          .limit(1)
          .maybeSingle();

        let oppId = existingOpp?.id;
        if (!oppId) {
          // Create a temporary opponent record for tournament tracking
          const { data: newOpp } = await supabase.from('career_opponents').insert({
            career_id: careerId,
            first_name: nameClean,
            last_name: '',
            skill_rating: opponent.skill || 50,
            archetype: 'allrounder',
            tier: careerTier || 5,
          }).select('id').single();
          oppId = newOpp?.id;
        }
        if (oppId) {
          await supabase.from('career_matches').insert({
            career_id: careerId,
            event_id: eventId,
            opponent_id: oppId,
            bracket_round: bracket.currentRound,
            format_legs: formatLegs,
            result: won ? 'win' : 'loss',
            player_legs_won: playerLegs,
            opponent_legs_won: opponentLegs,
            player_average: extraStats?.playerAverage || null,
            opponent_average: extraStats?.opponentAverage || null,
            player_checkout_pct: extraStats?.playerCheckoutPct || null,
            player_180s: extraStats?.player180s || null,
            player_highest_checkout: extraStats?.playerHighestCheckout || null,
            played_at: new Date().toISOString(),
          });
        }
      }
    } catch (e) { console.error('[BRACKET] Failed to record career_match:', e); }
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
      const promoted = completeData?.new_tier && completeData.new_tier > careerTier;
      setTournamentResult({ ...completeData, placement, playerWon, promoted, new_tier: completeData?.new_tier });
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
      // Award Pro Tour ranking points (Tier 5 only, NOT Champions Series)
      if (careerTier >= 5 && !eventType?.startsWith('champions_series')) try {
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

        // Simulate CS night for AI players when player is NOT in the CS
        // (keeps CS standings progressing in the background)
        if (!eventType?.startsWith('champions_series')) {
          try {
            // Check if player is in CS this season
            const { data: csEntry } = await supabase
              .from('career_champions_series')
              .select('id')
              .eq('career_id', careerId)
              .eq('is_player', true)
              .maybeSingle();
            if (!csEntry) {
              // Player not in CS — simulate a night for the AI
              await supabase.rpc('rpc_champions_series_simulate_night', { p_career_id: careerId });
            }
          } catch {}
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
            console.log('[BRACKET] Updating AI CS standings:', JSON.stringify(aiCSResults));
            const aiUpdateRes = await supabase.rpc('rpc_champions_series_update_ai', {
              p_career_id: careerId,
              p_results: aiCSResults,
            });
            console.log('[BRACKET] AI CS update result:', JSON.stringify(aiUpdateRes.data), 'error:', aiUpdateRes.error);
          } catch (e) { console.error('[BRACKET] AI CS update error:', e); }

          // CS Final completed — store champion name for career home popup
          if (eventType === 'champions_series_final') {
            const winnerMatch = updated.matches.find((m: any) => m.round === updated.totalRounds && m.winnerId);
            if (winnerMatch) {
              const winnerIsPlayer = winnerMatch.winnerId === 'player';
              const winnerName = winnerIsPlayer 
                ? (winnerMatch.participant1?.isPlayer ? winnerMatch.participant1.name : winnerMatch.participant2?.name)
                : (winnerMatch.participant1?.id === winnerMatch.winnerId ? winnerMatch.participant1?.name : winnerMatch.participant2?.name);
              sessionStorage.setItem('cs_champion', JSON.stringify({ 
                name: winnerName || 'Unknown', 
                isPlayer: winnerIsPlayer 
              }));
            }
          }
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
        opponentId: opponent.id, opponentName: opponent.name, bracketRound: bracket.currentRound, totalRounds: bracket.totalRounds,
        playerName, tier: careerTier, eventType },
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
    <div className={`min-h-screen p-3 sm:p-5 ${getEventTheme(careerTier, eventType, eventName).pageBg}`}>
      <div className={`fixed top-0 left-0 right-0 ${getEventTheme(careerTier, eventType, eventName).accentBarHeight} ${getEventTheme(careerTier, eventType, eventName).accentGradient} z-50`} />
      <div className="max-w-6xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => void handleBackToCareer()} className="text-slate-400 hover:text-white px-2" disabled={routingToTraining}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Trophy className={`w-5 h-5 ${getEventTheme(careerTier, eventType, eventName).accent}`} />
            <h1 className={`${getEventTheme(careerTier, eventType, eventName).titleSize} ${getEventTheme(careerTier, eventType, eventName).titleWeight} ${getEventTheme(careerTier, eventType, eventName).accent}`}>{eventName}</h1>
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
          <Card className={`p-3 ${getEventTheme(careerTier, eventType, eventName).borderStyle} ${getEventTheme(careerTier, eventType, eventName).cardBg} ${getEventTheme(careerTier, eventType, eventName).cardBorder} ${getEventTheme(careerTier, eventType, eventName).cardShadow}`}>
            <div className="flex items-center justify-between">
              <div className="w-20" />
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                    <Star className="w-5 h-5 text-amber-400" />
                  </div>
                  <span className="text-amber-400 font-bold text-xs mt-1 block">{playerName}</span>
                  {(() => { const pm = bracket.matches.find((m: any) => m.participant1?.isPlayer || m.participant2?.isPlayer); const p = pm?.participant1?.isPlayer ? pm.participant1 : pm?.participant2; return p?.rank ? <span className="text-slate-400 text-[10px]">#{p.rank}</span> : null; })()}
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
                  {playerOpponent.rank && <span className="text-slate-400 text-[10px]">#{playerOpponent.rank}</span>}
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
        <Card className={`p-5 overflow-x-auto ${getEventTheme(careerTier, eventType, eventName).borderStyle} ${getEventTheme(careerTier, eventType, eventName).cardBg} ${getEventTheme(careerTier, eventType, eventName).cardBorder} ${getEventTheme(careerTier, eventType, eventName).cardRadius}`}>
          <div className="flex gap-0 min-w-max">
            {rounds.map((round, ri) => {
              const isFinalRound = round.round === bracket.totalRounds;
              return (
              <div key={round.round} className={`flex flex-col ${isFinalRound ? 'relative' : ''}`}>
                {/* Round header */}
                <div className="text-center mb-4 px-3">
                  {isFinalRound ? (
                    <div className="flex items-center justify-center gap-1.5">
                      <Trophy className={`w-3.5 h-3.5 ${getEventTheme(careerTier, eventType, eventName).accent}`} />
                      <span className={`text-xs font-black uppercase tracking-widest ${getEventTheme(careerTier, eventType, eventName).accent}`}>
                        {round.name}
                      </span>
                      <Trophy className={`w-3.5 h-3.5 ${getEventTheme(careerTier, eventType, eventName).accent}`} />
                    </div>
                  ) : (
                  <span className={`text-xs font-bold uppercase tracking-wider ${
                    round.round === bracket.currentRound && !bracket.completed ? getEventTheme(careerTier, eventType, eventName).accent : 'text-slate-500'
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
                          <MatchSlot tierAccent={getEventTheme(careerTier, eventType, eventName).accent} name={match.participant1?.name || 'TBD'}
                            isPlayer={match.participant1?.isPlayer}
                            isWinner={match.winnerId === match.participant1?.id}
                            score={match.score?.p1Legs}
                            decided={!!match.winnerId}
                            rank={match.participant1?.rank}
                          />
                          <div className="border-t border-white/5" />
                          <MatchSlot tierAccent={getEventTheme(careerTier, eventType, eventName).accent} name={match.participant2?.name || 'TBD'}
                            isPlayer={match.participant2?.isPlayer}
                            isWinner={match.winnerId === match.participant2?.id}
                            score={match.score?.p2Legs}
                            decided={!!match.winnerId}
                            rank={match.participant2?.rank}
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
                  <p className="text-xs text-slate-400">Fans earned</p>
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

function MatchSlot({ name, isPlayer, isWinner, score, decided, tierAccent, rank }: {
  name: string; isPlayer?: boolean; isWinner: boolean; score?: number; decided: boolean; tierAccent?: string; rank?: number;
}) {
  const isTBD = name === 'TBD';
  return (
    <div className={`flex items-center justify-between px-3 py-2 ${decided && isWinner ? 'bg-white/5' : ''}`}>
      <span className={`flex-1 flex items-center gap-1.5 ${
        isTBD ? 'text-slate-600 italic'
        : isPlayer ? `${tierAccent || 'text-amber-400'} font-semibold`
        : decided && isWinner ? 'text-white font-semibold'
        : decided ? 'text-slate-500'
        : 'text-slate-300'
      }`}>
        {rank && rank <= 25 && (
          <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
            rank <= 3 ? 'bg-amber-500/30 text-amber-300' :
            rank <= 8 ? 'bg-purple-500/25 text-purple-300' :
            'bg-slate-600/40 text-slate-400'
          }`}>#{rank}</span>
        )}

        <span className="truncate">{name}</span>
      </span>
      {decided && (
        <span className={`ml-2 font-bold ${isWinner ? 'text-white' : 'text-slate-600'}`}>{score}</span>
      )}
      {decided && isWinner && <Check className="w-3 h-3 text-emerald-400 ml-0.5 shrink-0" />}
    </div>
  );
}



