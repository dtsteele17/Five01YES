'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getRoundName } from '@/lib/career/bracketEngine';
import {
 Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Trophy, Target, Flame, Shield, Crown, Skull, Swords, Play, ChevronRight, ArrowLeft, Loader as Loader2, Star, TrendingUp, Calendar, Dumbbell, Award, Zap, Users, ChartBar as BarChart3, Sparkles, Clock, Settings, Save, Bell, Table2, ChevronDown, X, Trash2, Mail, Globe } from 'lucide-react';
import { useTraining } from '@/lib/context/TrainingContext';
import { CAREER_TRAINING_RETURN_KEY, getRandomCareerTrainingRoute } from '@/lib/career/trainingRoutes';

const TIER_CONFIG: Record<number, { name: string; icon: any; color: string; accent: string }> = {
 1: { name: 'Local Circuit Trials', icon: Target, color: 'emerald', accent: 'emerald-500' },
 2: { name: 'Pub Leagues', icon: Flame, color: 'blue', accent: 'blue-500' },
 3: { name: 'County Circuit', icon: Shield, color: 'purple', accent: 'purple-500' },
 4: { name: 'National Tour', icon: Trophy, color: 'orange', accent: 'orange-500' },
 5: { name: 'Pro Tour', icon: Crown, color: 'amber', accent: 'amber-500' },
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
  format_legs: number; bracket_size: number | null; sequence_no: number; day: number;
  status?: string; league_opponent_name?: string | null; league_opponent_id?: string | null;
 } | null;
 standings: any[] | null;
 sponsors: any[] | null;
 recent_milestones: any[] | null;
 awards?: any[] | null;
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
 const [activeBracket, setActiveBracket] = useState<any>(null);

 // Settings dialog
 const [showSettings, setShowSettings] = useState(false);
 const [careerName, setCareerName] = useState('');
 const [saving, setSaving] = useState(false);

 // World Rankings popup
 const [showRankings, setShowRankings] = useState(false);
 const [worldRankings, setWorldRankings] = useState<any[]>([]);
 const [playerRankingRow, setPlayerRankingRow] = useState<any>(null);

 // Tournament choice (Tier 1 first event)
 const [showTournamentChoice, setShowTournamentChoice] = useState(false);
 const [chosenTournament, setChosenTournament] = useState<string | null>(null);
 const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
 const [showKnockoutPopup, setShowKnockoutPopup] = useState(false);
 const [knockoutMessage, setKnockoutMessage] = useState('');
 const [deletingId, setDeletingId] = useState<string | null>(null);
 const [emails, setEmails] = useState<{ id: string; subject: string; body: string; type: string; isNew?: boolean }[]>([]);
 const [showPromotionPopup, setShowPromotionPopup] = useState(false);
 const [promotionTierName, setPromotionTierName] = useState('');
 const [showRelegationPopup, setShowRelegationPopup] = useState(false);
 const [relegationData, setRelegationData] = useState<{ tier_name: string; rep_lost: number } | null>(null);
 const [advancingSeason, setAdvancingSeason] = useState(false);
 const [showInvitePopup, setShowInvitePopup] = useState(false);
 const [pendingInvite, setPendingInvite] = useState<{ event_id: string; event_name: string; bracket_size: number } | null>(null);
 const [pendingInvites, setPendingInvites] = useState<{ event_id: string; event_name: string; bracket_size: number }[]>([]);
 const [showTournamentChoicePopup, setShowTournamentChoicePopup] = useState(false);
 const [sponsorOffer, setSponsorOffer] = useState<any>(null);
 const [tournamentChoiceEvent, setTournamentChoiceEvent] = useState<{ id: string; name: string } | null>(null);
 const [tournamentOptions, setTournamentOptions] = useState<{ option1: any; option2: any } | null>(null);
 const [choosingTournament, setChoosingTournament] = useState(false);
 const [seasonMatchStats, setSeasonMatchStats] = useState<{ played: number; won: number; lost: number; average: number } | null>(null);
 const [showSponsorRenewal, setShowSponsorRenewal] = useState(false);
 const [sponsorRenewalData, setSponsorRenewalData] = useState<any>(null);
 const [processingRenewal, setProcessingRenewal] = useState(false);
 const [showRankingsPanel, setShowRankingsPanel] = useState(false);
 const [proRankings, setProRankings] = useState<any>(null);
 const [showPLInvite, setShowPLInvite] = useState(false);
 const [showQSchoolIntro, setShowQSchoolIntro] = useState(false);
 const [qSchoolData, setQSchoolData] = useState<{ player_rank: number; semi_opponent: string; semi_opponent_rank: number } | null>(null);
 const [showChampionshipIntro, setShowChampionshipIntro] = useState(false);
 const [showGroupResults, setShowGroupResults] = useState(false);
 const [groupStandings, setGroupStandings] = useState<any[]>([]);
 const [showOptionalTournament, setShowOptionalTournament] = useState(false);
 const [optionalTournamentEvent, setOptionalTournamentEvent] = useState<any>(null);
 const [showChampionsStandings, setShowChampionsStandings] = useState(false);
 const [championsStandings, setChampionsStandings] = useState<any[]>([]);
 const [showChampionsPlayoffs, setShowChampionsPlayoffs] = useState(false);
 const [championsPlayoffData, setChampionsPlayoffData] = useState<any>(null);
 const [groupQualified, setGroupQualified] = useState<boolean | null>(null);
 const [groupPlayerRank, setGroupPlayerRank] = useState<number>(0);

 useEffect(() => { loadCareer(); }, [careerId]);


 async function loadCareer() {
  setLoading(true);
  const supabase = createClient();

  if (careerId) {
   // Init world rankings if not yet created (idempotent)
   await supabase.rpc('rpc_pro_tour_init_rankings', { p_career_id: careerId });
   // Simulate small ranking changes for Tiers 1-4 (skipped at Tier 5)
   await supabase.rpc('rpc_world_rankings_simulate', { p_career_id: careerId });
   // Pro Tour: restore major event if qualifier was completed
   await supabase.rpc('rpc_pro_tour_restore_major_after_qualifier', { p_career_id: careerId });
   const { data: homeData, error } = await supabase.rpc('rpc_get_career_home_with_season_end_locked_fixed_v3', { p_career_id: careerId });
   if (error || homeData?.error) {
    toast.error('Failed to load career');
    router.push('/app/career/start');
    return;
   }
   // Check for season end state first
   if (homeData.season_end?.active) {
    router.push(`/app/career/season-end?careerId=${careerId}`);
    return;
   }
   
   // Auto-skip legacy relegation_tournament events (replaced by dynamic end-of-season tournaments)
   if (homeData.next_event?.event_type === 'relegation_tournament') {
    await supabase.from('career_events').update({ status: 'skipped' }).eq('id', homeData.next_event.id);
    // Reload to get the real next event
    const { data: refreshed } = await supabase.rpc('rpc_get_career_home_with_season_end_locked_fixed_v3', { p_career_id: careerId });
    if (refreshed && !refreshed.error) {
     setData(refreshed);
     setLoading(false);
     return;
    }
   }

   setData(homeData);

   // Tier 2 Pub Leagues: after 7 league matches, auto-create mandatory end-of-season tournament
   if (homeData.career.tier === 2 && homeData.standings) {
    const playerSt = homeData.standings.find((s: any) => s.is_player);
    const totalOpponents = homeData.standings.filter((s: any) => !s.is_player).length;
    const leagueDone = playerSt && (playerSt.played || 0) >= totalOpponents;
    const noPlayableEvents = !homeData.next_event || homeData.next_event.event_type === 'season_end';
    
    if (leagueDone && noPlayableEvents) {
     // Check if end-of-season tournament already exists
     const { data: endSeasonEvents } = await supabase
      .from('career_events').select('id, status')
      .eq('career_id', careerId)
      .eq('season', homeData.career.season)
      .eq('event_type', 'open')
      .gte('sequence_no', 200);
     
     const allDone = endSeasonEvents && endSeasonEvents.length > 0 && endSeasonEvents.every((e: any) => e.status === 'completed' || e.status === 'skipped');
     
     if (!endSeasonEvents || endSeasonEvents.length === 0) {
      // Create mandatory end-of-season tournament (Tier 2 only - single tournament, no choice)
      try { await supabase.rpc('rpc_create_tier2_end_season_tournament', { p_career_id: careerId }); } catch {}
      // Reload to pick up the new tournament as next_event
      const { data: refreshed } = await supabase.rpc('rpc_get_career_home_with_season_end_locked_fixed_v3', { p_career_id: careerId });
      if (refreshed && !refreshed.error) { setData(refreshed); setLoading(false); return; }
     }
     // If tournament exists and not done, it will show as next_event naturally
     // If all done, fall through to show Season Complete
    }
   }

   // Tier 3 County Circuit: tournament choices after match 3 and 6, mandatory tournament after match 9
   if (homeData.career.tier === 3 && homeData.standings) {
    const playerSt = homeData.standings.find((s: any) => s.is_player);
    const totalOpponents = homeData.standings.filter((s: any) => !s.is_player).length;
    const leagueGamesPlayed = playerSt?.played || 0;
    const leagueDone = leagueGamesPlayed >= totalOpponents;
    const noPlayableEvents = !homeData.next_event || homeData.next_event.event_type === 'season_end';
    const nextIsLeague = homeData.next_event?.event_type === 'league';

    // Auto-skip stale tournament invites if player has moved past the trigger point
    let skippedStale = false;
    if (leagueGamesPlayed > 3 && leagueGamesPlayed !== 6) {
     const { data: stale50 } = await supabase
      .from('career_events').select('id')
      .eq('career_id', careerId).eq('season', homeData.career.season)
      .eq('status', 'pending_invite').eq('event_type', 'open')
      .gte('sequence_no', 50).lt('sequence_no', 60);
     if (stale50 && stale50.length > 0) {
      for (const e of stale50) await supabase.from('career_events').update({ status: 'skipped' }).eq('id', e.id);
      skippedStale = true;
     }
    }
    if (leagueGamesPlayed > 6) {
     const { data: stale100 } = await supabase
      .from('career_events').select('id')
      .eq('career_id', careerId).eq('season', homeData.career.season)
      .eq('status', 'pending_invite').eq('event_type', 'open')
      .gte('sequence_no', 100).lt('sequence_no', 110);
     if (stale100 && stale100.length > 0) {
      for (const e of stale100) await supabase.from('career_events').update({ status: 'skipped' }).eq('id', e.id);
      skippedStale = true;
     }
    }
    if (skippedStale) {
     // Reload to clear stale pending invite from home RPC
     const { data: refreshed } = await supabase.rpc('rpc_get_career_home_with_season_end_locked_fixed_v3', { p_career_id: careerId });
     if (refreshed && !refreshed.error) { setData(refreshed); setPendingInvite(null); setPendingInvites([]); setLoading(false); return; }
    }

    // After match 3 or 6: check if tournament choices should be offered
    if ((leagueGamesPlayed === 3 || leagueGamesPlayed === 6) && nextIsLeague) {
     const seqBase = leagueGamesPlayed === 3 ? 50 : 100;
     const { data: existingChoices } = await supabase
      .from('career_events').select('id, status, event_name, bracket_size')
      .eq('career_id', careerId).eq('season', homeData.career.season)
      .eq('event_type', 'open').gte('sequence_no', seqBase).lt('sequence_no', seqBase + 10);
     
     const hasPending = existingChoices?.some((e: any) => e.status === 'pending_invite');
     
     if (!existingChoices || existingChoices.length === 0) {
      // Create tournament choices
      try { await supabase.rpc('rpc_create_tier3_tournament_choice', { p_career_id: careerId }); } catch {}
      const { data: newChoices } = await supabase
       .from('career_events').select('id, event_name, bracket_size')
       .eq('career_id', careerId).eq('status', 'pending_invite').eq('event_type', 'open')
       .gte('sequence_no', seqBase).lt('sequence_no', seqBase + 10)
       .order('sequence_no', { ascending: true });
      if (newChoices && newChoices.length > 0) {
       setPendingInvites(newChoices.map(inv => ({ event_id: inv.id, event_name: inv.event_name, bracket_size: inv.bracket_size || 16 })));
       setShowInvitePopup(true);
       setLoading(false);
       return;
      }
     } else if (hasPending) {
      const invites = existingChoices.filter((e: any) => e.status === 'pending_invite');
      setPendingInvites(invites.map((inv: any) => ({ event_id: inv.id, event_name: inv.event_name, bracket_size: inv.bracket_size || 16 })));
      setShowInvitePopup(true);
      setLoading(false);
      return;
     }
    }

    // After all 9 league matches: mandatory 32-player tournament (unless bottom 2)
    if (leagueDone && noPlayableEvents) {
     const { data: endSeasonEvents } = await supabase
      .from('career_events').select('id, status')
      .eq('career_id', careerId).eq('season', homeData.career.season)
      .eq('event_type', 'open').gte('sequence_no', 200);
     
     const allDone = endSeasonEvents && endSeasonEvents.length > 0 && endSeasonEvents.every((e: any) => e.status === 'completed' || e.status === 'skipped');
     
     if (!endSeasonEvents || endSeasonEvents.length === 0) {
      try {
       const { data: result } = await supabase.rpc('rpc_create_tier3_end_season_tournament', { p_career_id: careerId });
       if (result?.excluded) {
        // Bottom 2 - no tournament, go straight to season complete
       } else {
        const { data: refreshed } = await supabase.rpc('rpc_get_career_home_with_season_end_locked_fixed_v3', { p_career_id: careerId });
        if (refreshed && !refreshed.error) { setData(refreshed); setLoading(false); return; }
       }
      } catch {}
     }
    }
   }

   // Tier 4 National Tour: mandatory tournaments after match 5, 10, and 14 (with T3 qualification)
   if (homeData.career.tier === 4 && homeData.standings) {
    const playerSt = homeData.standings.find((s: any) => s.is_player);
    const totalOpponents = homeData.standings.filter((s: any) => !s.is_player).length;
    const leagueGamesPlayed = playerSt?.played || 0;
    const leagueDone = leagueGamesPlayed >= totalOpponents;
    const noPlayableEvents = !homeData.next_event || homeData.next_event.event_type === 'season_end';
    const nextIsLeague = homeData.next_event?.event_type === 'league';

    // After match 5: Tournament 1 (32-player, mandatory)
    if (leagueGamesPlayed >= 5 && (nextIsLeague || noPlayableEvents)) {
     const { data: t1 } = await supabase.from('career_events').select('id')
      .eq('career_id', careerId).eq('season', homeData.career.season)
      .eq('event_type', 'open').gte('sequence_no', 50).lt('sequence_no', 60).limit(1);
     if (!t1 || t1.length === 0) {
      try { await supabase.rpc('rpc_create_tier4_tournament', { p_career_id: careerId, p_tournament_num: 1 }); } catch {}
      const { data: refreshed } = await supabase.rpc('rpc_get_career_home_with_season_end_locked_fixed_v3', { p_career_id: careerId });
      if (refreshed && !refreshed.error) { setData(refreshed); setLoading(false); return; }
     }
    }

    // After match 10: Tournament 2 (32-player, mandatory)
    if (leagueGamesPlayed >= 10 && (nextIsLeague || noPlayableEvents)) {
     const { data: t2 } = await supabase.from('career_events').select('id')
      .eq('career_id', careerId).eq('season', homeData.career.season)
      .eq('event_type', 'open').gte('sequence_no', 100).lt('sequence_no', 110).limit(1);
     if (!t2 || t2.length === 0) {
      try { await supabase.rpc('rpc_create_tier4_tournament', { p_career_id: careerId, p_tournament_num: 2 }); } catch {}
      const { data: refreshed } = await supabase.rpc('rpc_get_career_home_with_season_end_locked_fixed_v3', { p_career_id: careerId });
      if (refreshed && !refreshed.error) { setData(refreshed); setLoading(false); return; }
     }
    }

    // After match 14: Tournament 3 (64-player major, with qualification check)
    if (leagueDone && noPlayableEvents) {
     const { data: t3 } = await supabase.from('career_events').select('id, status')
      .eq('career_id', careerId).eq('season', homeData.career.season)
      .eq('event_type', 'open').gte('sequence_no', 200).limit(1);
     const { data: qSchool } = await supabase.from('career_events').select('id, status')
      .eq('career_id', careerId).eq('season', homeData.career.season)
      .in('event_type', ['q_school_semi', 'q_school_final']);
     
     const t3Done = t3 && t3.length > 0 && t3.every((e: any) => e.status === 'completed' || e.status === 'skipped');
     const qDone = qSchool && qSchool.length > 0 && qSchool.every((e: any) => e.status === 'completed' || e.status === 'skipped');
     
     if (!t3 || t3.length === 0) {
      // Check qualification for Tournament 3
      try {
       const { data: qualResult } = await supabase.rpc('rpc_tier4_check_t3_qualification', { p_career_id: careerId });
       if (qualResult?.auto_qualify || qualResult?.needs_qualifier) {
        await supabase.rpc('rpc_create_tier4_tournament', { p_career_id: careerId, p_tournament_num: 3 });
        const { data: refreshed } = await supabase.rpc('rpc_get_career_home_with_season_end_locked_fixed_v3', { p_career_id: careerId });
        if (refreshed && !refreshed.error) { setData(refreshed); setLoading(false); return; }
       }
      } catch {}
     } else if (!t3Done) {
      // Tournament 3 in progress - will show as next event
     } else if (t3Done && !qSchool?.length) {
      // T3 done, check if Tour School needed (3rd-6th)
      // This is handled by Next Season button
     }
     // If everything done, fall through to Season Complete
    }
   }

   // Check if next event is a tournament choice show popup
   if (homeData.next_event?.event_type === 'tournament_choice') {
    const { data: options } = await supabase.rpc('rpc_get_tournament_choice_options', { 
     p_event_id: homeData.next_event.id 
    });
    if (options) {
     setTournamentChoiceEvent({ id: homeData.next_event.id, name: homeData.next_event.event_name });
     setTournamentOptions(options);
     setShowTournamentChoicePopup(true);
    }
   } else {
    setShowTournamentChoicePopup(false);
   }

   // Check for pending sponsor offers
   try {
    const { data: offerData } = await supabase
     .from('career_sponsor_contracts')
     .select('id, sponsor_id, status')
     .eq('career_id', careerId)
     .eq('status', 'offered')
     .limit(1)
     .maybeSingle();
    if (offerData) {
     const { data: sponsorData } = await supabase
      .from('career_sponsor_catalog')
      .select('name, rep_bonus_pct, flavour_text, rep_objectives')
      .eq('id', offerData.sponsor_id)
      .single();
     if (sponsorData) {
      setSponsorOffer({
       contract_id: offerData.id,
       sponsor_name: sponsorData.name,
       rep_bonus_pct: sponsorData.rep_bonus_pct,
       flavour_text: sponsorData.flavour_text,
       objectives: sponsorData.rep_objectives,
      });
     }
    } else {
     setSponsorOffer(null);
    }
   } catch (e) { /* no pending offer */ setSponsorOffer(null); }

   // Track pending tournament invite
   if (homeData.pending_invite) {
    setPendingInvite(homeData.pending_invite);
   } else {
    setPendingInvite(null);
   }

   // Fetch season match stats (all matches including tournaments)
   try {
    const { data: seasonMatches } = await supabase
     .from('career_matches')
     .select('result, player_average, event_id')
     .eq('career_id', careerId)
     .in('result', ['win', 'loss']);
    
    // Filter to current season by checking event season
    const { data: seasonEvents } = await supabase
     .from('career_events')
     .select('id, season')
     .eq('career_id', careerId)
     .eq('season', homeData.career.season);
    
    const seasonEventIds = new Set((seasonEvents || []).map((e: any) => e.id));
    const currentSeasonMatches = (seasonMatches || []).filter((m: any) => seasonEventIds.has(m.event_id));
    
    const played = currentSeasonMatches.length;
    const won = currentSeasonMatches.filter((m: any) => m.result === 'win').length;
    const lost = currentSeasonMatches.filter((m: any) => m.result === 'loss').length;
    const avgs = currentSeasonMatches.filter((m: any) => m.player_average > 0).map((m: any) => m.player_average);
    const average = avgs.length > 0 ? avgs.reduce((a: number, b: number) => a + b, 0) / avgs.length : 0;
    
    setSeasonMatchStats({ played, won, lost, average });
   } catch (e) { /* ignore */ }

   // Sponsor offers handled in notification tile (career_sponsor_contracts status='offered')

   // Email generation is handled client-side below (no server RPC needed)

   // Load active bracket data if current event is an active tournament
   if (homeData.next_event?.bracket_size) {
    const { data: bracketData } = await supabase
     .from('career_brackets')
     .select('bracket_data, current_round, status')
     .eq('event_id', homeData.next_event.id)
     .eq('career_id', careerId)
     .maybeSingle();
    if (bracketData?.bracket_data?.matches) {
     setActiveBracket(bracketData.bracket_data);
    }
   }

   // Generate contextual emails based on career state and milestones
   const newEmails: { id: string; subject: string; body: string; type: string; isNew?: boolean }[] = [];
   const milestones = homeData.recent_milestones || [];
   const tier = homeData.career.tier;
   const day = homeData.career.day;

   // Check milestones for context
   const hasPromotion = milestones.some((m: any) => m.milestone_type === 'promotion' || m.milestone_type === 'promotion_tier2');
   // Only use tournament_win (has event name as title), not first_tournament_win
   const tournamentWin = milestones.find((m: any) => m.milestone_type === 'tournament_win');
   const leagueWin = milestones.find((m: any) => m.milestone_type === 'league_win');
   const tournamentLoss = milestones.find((m: any) => m.milestone_type === 'tournament_loss' || m.title?.includes('Eliminated'));
   const winTournamentName = tournamentWin?.title || tournamentWin?.description?.replace('Won ', '') || 'the tournament';

   if (tournamentWin) {
    newEmails.push({ id: `win-${tournamentWin.day || day}`, subject: ` ${winTournamentName}Champion!`, body: `Congratulations! You won ${winTournamentName}. That's a statement performance keep this form up and bigger stages await.`, type: 'win' });
   }
   if (leagueWin) {
    newEmails.push({ id: `league-win-s${homeData.career.season}`, subject: ` ${leagueWin.title}`, body: leagueWin.description || 'You won the league! Incredible season.', type: 'win' });
   }
   // Sponsor offer email
   const sponsorOfferMilestone = milestones.find((m: any) => m.milestone_type === 'sponsor_offer');
   if (sponsorOfferMilestone) {
    newEmails.push({ 
     id: `sponsor-offer-${sponsorOfferMilestone.day || day}`, 
     subject: ` ${sponsorOfferMilestone.title}`, 
     body: `${sponsorOfferMilestone.description} Check your notifications looks like you have a sponsorship offer!`, 
     type: 'sponsor_offer' 
    });
   }

   if (hasPromotion) {
    const tierNames: Record<number, string> = { 2: 'Pub Leagues', 3: 'County Circuit', 4: 'National Tour', 5: 'Pro Tour' };
    const tierName = tierNames[tier] || `Tier ${tier}`;
    newEmails.push({ id: `promo-${tier}`, subject: `Welcome to the ${tierName}!`, body: `You've earned your place. The ${tierName} is a step up tougher opponents, higher stakes. Time to prove you belong.`, type: 'promotion' });
   }
   if (tournamentLoss && tier === 1 && !hasPromotion) {
    const nextType = homeData.next_event?.event_type;
    if (nextType === 'training') {
     newEmails.push({ id: `regroup-${day}`, subject: 'Time to Regroup', body: 'The last tournament didn\'t go to plan. Get some practice in we think you\'ve got what it takes for the pub leagues.', type: 'knockout' });
    } else if (nextType === 'trial_tournament') {
     newEmails.push({ id: `retry-${day}`, subject: 'Here\'s Another Shot! ', body: 'Here is your shot at another tournament after the last one didn\'t go to plan! Good luck!', type: 'knockout' });
    }
   }
   if (tier === 1 && day <= 1 && !tournamentLoss) {
    newEmails.push({ id: 'welcome', subject: 'Welcome, Rookie!', body: 'Good luck in your first tournament! Show them what you\'ve got. Win this and the pub leagues are calling.', type: 'welcome' });
   }
   if (tier >= 2 && !hasPromotion && !tournamentWin) {
    newEmails.push({ id: `league-s${homeData.career.season}`, subject: 'League Update', body: `Season ${homeData.career.season} is underway. Check the league table and keep climbing the standings.`, type: 'league' });
   }

   // Check for pending mid-season tournament invites (Tier 2 only - Tier 3+ handled by popup system)
   try {
    const { data: inviteEvents } = homeData.career.tier === 2 ? await supabase
     .from('career_events')
     .select('id, event_name, bracket_size')
     .eq('career_id', careerId)
     .eq('status', 'pending_invite')
     .eq('event_type', 'open')
     .lt('sequence_no', 200)
     .order('sequence_no', { ascending: true })
     .limit(1) : { data: null };
    if (inviteEvents && inviteEvents.length > 0) {
     setPendingInvite({
      event_id: inviteEvents[0].id,
      event_name: inviteEvents[0].event_name,
      bracket_size: inviteEvents[0].bracket_size || 16,
     });
     newEmails.unshift({
      id: `tournament-invite-${inviteEvents[0].id}`,
      subject: ` ${inviteEvents[0].event_name} You're Invited!`,
      body: `You've been invited to the ${inviteEvents[0].event_name}! A ${inviteEvents[0].bracket_size || 16}-player knockout tournament. Do you want to enter?`,
      type: 'tournament_invite',
      isNew: true,
     });
    } else {
     setPendingInvite(null);
    }
    setPendingInvites([]);
   } catch (e) { setPendingInvite(null); setPendingInvites([]); }
   if (newEmails.length === 0) {
    newEmails.push({ id: `default-${day}`, subject: 'Keep Going!', body: 'Your journey continues. Every match is a chance to prove yourself.', type: 'default' });
   }

   // Merge with stored emails from localStorage
   const storageKey = `career_emails_${homeData.career.id}`;
   const stored: typeof newEmails = JSON.parse(localStorage.getItem(storageKey) || '[]');
   const deletedKey = `career_emails_deleted_${homeData.career.id}`;
   const deletedIds: string[] = JSON.parse(localStorage.getItem(deletedKey) || '[]');

   // Add new emails that aren't already stored or deleted
   const existingIds = new Set(stored.map(e => e.id));
   const freshEmails = newEmails.filter(e => !existingIds.has(e.id) && !deletedIds.includes(e.id)).map(e => ({ ...e, isNew: true }));
   // Mark existing stored emails as not new
   const allEmails = [...freshEmails, ...stored.map(e => ({ ...e, isNew: false }))];
   localStorage.setItem(storageKey, JSON.stringify(allEmails.map(e => ({ ...e, isNew: false }))));
   setEmails(allEmails);

   // Check if County Championship group stage just completed
   if (homeData.career.tier === 3) {
    const { data: groupEvents } = await supabase
     .from('career_events').select('id, status').eq('career_id', homeData.career.id)
     .eq('season', homeData.career.season).eq('event_type', 'county_championship_group');
    const allGroupDone = groupEvents && groupEvents.length === 3 && groupEvents.every((e: any) => e.status === 'completed');
    if (allGroupDone) {
     const { data: knockoutEvents } = await supabase
      .from('career_events').select('id').eq('career_id', homeData.career.id)
      .eq('season', homeData.career.season).eq('event_type', 'county_championship_knockout').limit(1);
     if (!knockoutEvents || knockoutEvents.length === 0) {
      const { data: groupData } = await supabase.rpc('rpc_get_county_championship_group', { p_career_id: homeData.career.id });
      if (groupData?.standings) {
       const sorted = [...groupData.standings].sort((a: any, b: any) => b.pts - a.pts || (b.lf - b.la) - (a.lf - a.la));
       const playerIdx = sorted.findIndex((s: any) => s.is_player);
       setGroupStandings(groupData.standings);
       setGroupPlayerRank(playerIdx + 1);
       setGroupQualified(playerIdx < 2);
       setShowGroupResults(true);
      }
     }
    }
   }

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
  if (!careerId || !data) return;
  const tier = data.career.tier;

  if (tier >= 5) {
   const supabase = createClient();
   // Auto-init rankings if not yet created
   const { error: initErr } = await supabase.rpc('rpc_pro_tour_init_rankings', { p_career_id: careerId });
   if (initErr) console.error('[RANKINGS] Init error:', initErr);
   const { data: rankData, error: rankErr } = await supabase.rpc('rpc_pro_tour_get_rankings', { p_career_id: careerId });
   if (rankErr) console.error('[RANKINGS] Get error:', rankErr);
   console.log('[RANKINGS] Data:', rankData);
   if (rankData?.top25) {
    setWorldRankings(rankData.top25.map((r: any) => ({
     rank: r.ranking_position,
     name: r.player_name,
     rating: Math.round(r.ranking_points),
     isPlayer: r.is_player,
     pointsChange: Math.round(r.points_change || 0),
    })));
    if (rankData.player && rankData.player_rank > 25) {
     setPlayerRankingRow({
      rank: rankData.player_rank,
      name: rankData.player.player_name,
      rating: Math.round(rankData.player.ranking_points),
      isPlayer: true,
      pointsChange: Math.round(rankData.player.points_change || 0),
     });
    }
   }
  } else {
   // Tiers 1-4: generate fictional world-class players using seeded shuffle
   const fns = ['Marcus','Liam','Theo','Callum','Declan','Sven','Nico','Ruben','Finn','Oscar',
    'Erik','Hugo','Felix','Matty','Connor','Archie','Owen','Jake','Rhys','Kyle','Paddy',
    'Zach','Leo','Brendan','Noel','Aidan','Stefan','Kai','Roman','Joel','Toby',
    'Nathan','Kian','Ethan','Ronan','Cillian','Micah','Ellis','Jasper','Tyler','Harley'];
   const lns = ['Steele','Reeves','Fox','Knight','Griffin','Cole','Spencer','Rhodes','Pearce',
    'Burton','Walsh','Brennan','Gallagher','Keane','Sullivan','Richter','Bakker','Visser',
    'Moreno','Romano','Torres','Webb','Palmer','Mason','Hunt','Holmes','Noble','Fletcher',
    'Powell','Dixon','Chapman','Ellis','Shaw','Hughes','Barker','Brooks','Watts','Harvey',
    'Mitchell','Barnes','Doyle','Lynch','Quinn','Byrne','Collins','Maguire','Russell',
    'Bailey','Marshall','Cooper','Ward','Wells','Murphy','Price','Bennett','Gray',
    'Kearney','Vaughan','Holt','Jarvis','Whitworth','Donnelly','Finch','Blackwood',
    'Langley','Thorne','Hartley','Beckett','Crosby','Nolan','Yates','Ashworth',
    'Whitaker','Fielding','Faulkner','Kirby','Ramsey','Dalton','Conway','Frost',
    'Oakley','Mercer','Lawson','Calder','Drake','Phelan'];
   const nns: (string|null)[] = ['The Hammer','Lightning','The Sniper','Deadeye','The Professor','Iceman',
    'Powerhouse','The Cobra','Dynamite','Maverick','The Phantom','Crosshair','Apex','Nitro',
    'Wolfie','The General','Showtime','The Dagger','Fireball','Merlin','Thunder',
    'The Beast','Precision','Hard Man','The Bosh','Razor','The Rocket','Tombstone',
    'The Flash','Killer','Pitbull','Sidewinder','The Ace','Voltage','Sparky',
    'The Chief','Big Dog','Smooth','The Hawk','Iron Fist','The Thorn','Chopper',
    'Snakebite','The Magician','Demolition','The Viking','Stealth','Cyclone','The Machine',
    'Rapid','The Gladiator','Venomous','Bulletproof','The Tornado',
    null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null];
   const arcs: string[] = ['scorer','finisher','grinder','streaky','clutch','allrounder'];
   // Seeded pseudo-random using career ID characters Fisher-Yates shuffle
   const cid = data.career.id || '';
   const hash = (n: number) => {
    let h = 0; for (let c = 0; c < cid.length; c++) h = ((h << 5) - h + cid.charCodeAt(c) + n * 997) | 0;
    return Math.abs(h);
   };
   // Build 21 unique combos using seeded shuffle of indices
   const fnIdx = Array.from({length: fns.length}, (_, i) => i);
   const lnIdx = Array.from({length: lns.length}, (_, i) => i);
   const nnIdx = Array.from({length: nns.length}, (_, i) => i);
   // Seeded Fisher-Yates
   const shuffle = (arr: number[], seed: number) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = hash(seed + i * 31) % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
   };
   const sfn = shuffle(fnIdx, 1);
   const sln = shuffle(lnIdx, 2);
   const snn = shuffle(nnIdx, 3);
   // Generate a pool of ~30 world-class players (more than 21 so some can rotate in/out)
   const poolSize = 30;
   const pool = Array.from({length: poolSize}, (_, i) => {
    const nn = nns[snn[i % snn.length]];
    return {
     id: i,
     name: `${fns[sfn[i % sfn.length]]}${nn ? ` '${nn}'` : ''} ${lns[sln[i % sln.length]]}`,
     baseRating: 980 - i * 8,
     archetype: arcs[hash(i * 53 + 97) % arcs.length],
    };
   });
   // Simulate ranking fluctuations based on career day
   const careerDay = data.career.day || 1;
   const simulated = pool.map(p => {
    // Each player's form fluctuates differently per day some gain, some drop
    // Accumulate small rating changes over career days for natural drift
    // Each player gets a small shift per day that accumulates
    let ratingShift = 0;
    for (let d = 1; d <= Math.min(careerDay, 300); d++) {
     const dh = hash(p.id * 1777 + d * 311);
     const changes = (dh % 7) < 2; // ~30% chance of change per day
     if (changes) {
      // Top players (low id) shift less: -2 to +2; lower players: -4 to +4
      const maxShift = p.id < 10 ? 2 : 4;
      const shift = (dh % (maxShift * 2 + 1)) - maxShift;
      ratingShift += shift;
     }
    }
    // Clamp accumulated shift so rankings don't go crazy
    ratingShift = Math.max(-40, Math.min(40, ratingShift));
    return { ...p, rating: Math.max(750, p.baseRating + ratingShift) };
   });
   // Sort by current rating, take top 25
   simulated.sort((a, b) => b.rating - a.rating);
   const top25 = simulated.slice(0, 25);
   setWorldRankings(top25.map((s, i) => ({ rank: i + 1, name: s.name, rating: s.rating, archetype: s.archetype })));
  }
  setShowRankings(true);
 }

 async function handleSkipOptionalTournament() {
  if (!careerId || !optionalTournamentEvent) return;
  const supabase = createClient();
  const { data: result } = await supabase.rpc('rpc_pro_tour_skip_tournament', {
   p_career_id: careerId, p_event_id: optionalTournamentEvent.id
  });
  if (result?.error) { toast.error(result.error); return; }
  toast.info(`Skipped ${optionalTournamentEvent.event_name} — rankings updated in background`);
  setShowOptionalTournament(false);
  setOptionalTournamentEvent(null);
  loadCareer();
 }

 async function handleEnterOptionalTournament() {
  if (!careerId || !optionalTournamentEvent) return;
  setShowOptionalTournament(false);
  router.push(`/app/career/bracket?careerId=${careerId}&eventId=${optionalTournamentEvent.id}`);
 }

 async function loadChampionsStandings() {
  if (!careerId || !data?.career) return;
  const supabase = createClient();
  const { data: result } = await supabase.rpc('rpc_champions_series_get_standings', {
   p_career_id: careerId, p_season: data.career.season
  });
  if (result?.standings && result.standings.length > 0) {
   setChampionsStandings(result.standings);
   setShowChampionsStandings(true);
  } else {
   // Simulate CS from top 8 world rankings — progresses with each completed tournament
   const { data: rankData } = await supabase.rpc('rpc_pro_tour_get_rankings', { p_career_id: careerId });
   if (rankData?.top25) {
    // Count completed Pro Tour events this season to determine CS progress
    const { data: completedEvents } = await supabase
     .from('career_events').select('id')
     .eq('career_id', careerId).eq('season', data?.career?.season)
     .in('status', ['completed', 'skipped'])
     .in('event_type', ['pro_players_championship', 'pro_open', 'pro_major', 'pro_world_series']);
    const nightsPlayed = Math.min(completedEvents?.length || 0, 8);
    
    if (nightsPlayed === 0) {
     toast.info('Champions Series begins after the first Pro Tour event');
     return;
    }
    
    const cid = careerId || '';
    const hash = (n: number) => { let h = 0; for (let c = 0; c < cid.length; c++) h = ((h << 5) - h + cid.charCodeAt(c) + n * 997) | 0; return Math.abs(h); };
    const top8 = rankData.top25.slice(0, 8);
    // Points: winner=5, RU=3, SF=2, QF=0 per night. Accumulate over nights played.
    const simStandings = top8.map((r: any, i: number) => {
     let pts = 0; let lf = 0; let la = 0;
     for (let night = 1; night <= nightsPlayed; night++) {
      // Deterministic result per player per night
      const perf = hash(i * 41 + night * 71 + (data?.career?.season || 1) * 137) % 100;
      // Better-ranked players perform better on average
      const boost = (8 - i) * 5;
      if (perf + boost > 85) { pts += 5; lf += 6 + hash(i + night * 3) % 3; la += 2 + hash(i + night * 7) % 4; }
      else if (perf + boost > 70) { pts += 3; lf += 5 + hash(i + night * 5) % 3; la += 3 + hash(i + night * 9) % 3; }
      else if (perf + boost > 50) { pts += 2; lf += 4 + hash(i + night * 11) % 3; la += 4 + hash(i + night * 13) % 3; }
      else { lf += 2 + hash(i + night * 17) % 3; la += 5 + hash(i + night * 19) % 3; }
     }
     return { player_name: r.player_name, is_player: r.is_player, points: pts, legs_for: lf, legs_against: la, leg_difference: lf - la, ranking_at_qualification: i + 1 };
    });
    simStandings.sort((a: any, b: any) => b.points - a.points || b.leg_difference - a.leg_difference);
    setChampionsStandings(simStandings);
    setShowChampionsStandings(true);
   } else {
    toast.info('Champions Series data not available yet');
   }
  }
 }

 async function checkChampionsPlayoffs() {
  if (!careerId) return;
  const supabase = createClient();
  const { data: result } = await supabase.rpc('rpc_champions_series_playoffs', { p_career_id: careerId });
  if (result?.error) return;
  setChampionsPlayoffData(result);
  setShowChampionsPlayoffs(true);
 }

 function deleteEmail(emailId: string) {
  if (!data?.career?.id) return;
  const storageKey = `career_emails_${data.career.id}`;
  const deletedKey = `career_emails_deleted_${data.career.id}`;
  const updated = emails.filter(e => e.id !== emailId);
  const deletedIds: string[] = JSON.parse(localStorage.getItem(deletedKey) || '[]');
  deletedIds.push(emailId);
  localStorage.setItem(deletedKey, JSON.stringify(deletedIds));
  localStorage.setItem(storageKey, JSON.stringify(updated.map(e => ({ ...e, isNew: false }))));
  setEmails(updated);
 }

 function deleteAllEmails() {
  if (!data?.career?.id) return;
  const storageKey = `career_emails_${data.career.id}`;
  const deletedKey = `career_emails_deleted_${data.career.id}`;
  const deletedIds: string[] = JSON.parse(localStorage.getItem(deletedKey) || '[]');
  emails.forEach(e => deletedIds.push(e.id));
  localStorage.setItem(deletedKey, JSON.stringify(deletedIds));
  localStorage.setItem(storageKey, '[]');
  setEmails([]);
 }

 function handleChooseTournament(id: string) {
  setChosenTournament(id);
  sessionStorage.setItem(`career_tournament_chosen_${careerId}`, id);
  setShowTournamentChoice(false);
 }

 async function advanceToNextSeason() {
  setAdvancingSeason(true);
  try {
   const supabase = createClient();
   const tier = data?.career?.tier;

   // Pro Tour (Tier 5) — use dedicated season end + new season RPCs
   if (tier === 5) {
    const { data: seasonEnd } = await supabase.rpc('rpc_pro_tour_season_end', { p_career_id: careerId });
    if (seasonEnd?.error) throw new Error(seasonEnd.error);

    if (seasonEnd?.qualifies_champions_series) {
     toast.success('Qualified for the Champions Series!', { duration: 4000 });
    }

    const { data: newSeason, error: nsErr } = await supabase.rpc('rpc_pro_tour_new_season', { p_career_id: careerId });
    if (nsErr) throw nsErr;
    toast.success(`Pro Tour Season ${newSeason?.new_season} begins!${newSeason?.champions_series ? ' Champions Series awaits!' : ''}`);
    loadCareer();
    return;
   }

   const { data: result, error } = await supabase.rpc('rpc_career_advance_to_next_season', {
    p_career_id: careerId,
   });
   if (error) throw error;
   if (result?.promoted) {
    setPromotionTierName(result.tier_name);
    setShowPromotionPopup(true);
   } else if (result?.relegated) {
    setRelegationData({ tier_name: result.tier_name, rep_lost: result.rep_lost || 0 });
    setShowRelegationPopup(true);
   } else {
    toast.success(`Season ${result?.new_season} begins!`);
    loadCareer();
   }
  } catch (err: any) {
   toast.error(err.message || 'Failed to advance season');
  } finally {
   setAdvancingSeason(false);
  }
 }

 async function handlePlayEvent() {
  if (!careerId || !data?.next_event || playingEvent) return;

  // If next event is tournament_choice, show the choice popup
  if (data.next_event.event_type === 'tournament_choice') {
   if (!tournamentOptions) {
    const supabase = createClient();
    const { data: options } = await supabase.rpc('rpc_get_tournament_choice_options', {
     p_event_id: data.next_event.id
    });
    if (options) {
     setTournamentChoiceEvent({ id: data.next_event.id, name: data.next_event.event_name });
     setTournamentOptions(options);
    }
   }
   setShowTournamentChoicePopup(true);
   return;
  }

  // If there's a pending mid-season tournament invite, force user to decide before continuing
  if (pendingInvite && data.next_event?.event_type === 'league') {
   setShowInvitePopup(true);
   return;
  }

  setPlayingEvent(true);
  try {
   const { next_event } = data;
   
   // For Tier 2+ league matches, go to weekly fixtures page first
   if (data.career.tier >= 2 && next_event.event_type === 'league') {
    router.push(`/app/career/week/${careerId}?careerId=${careerId}`);
    return;
   }

   // Tournament choice - let user pick between tournaments or decline
   if (next_event.event_type === 'tournament_choice') {
    router.push(`/app/career/tournament-choice?careerId=${careerId}&eventId=${next_event.id}`);
    return;
   }

   // Pro Tour Major - check qualification first
   if (next_event.event_type === 'pro_major') {
    const supabase = createClient();
    const { data: qualResult } = await supabase.rpc('rpc_pro_tour_major_qualification', { p_career_id: careerId });
    if (qualResult?.error) { toast.error(qualResult.error); setPlayingEvent(false); return; }
    if (qualResult?.already_exists) {
     // Qualifier already created but not played yet - restore major to waiting and reload
     toast.info('Qualifier match is ready');
     loadCareer(); setPlayingEvent(false); return;
    }
    toast.info(qualResult.message, { duration: 5000 });
    await new Promise(r => setTimeout(r, 1500));
    if (qualResult.auto_qualified) {
     // Go straight to the major bracket
     router.push(`/app/career/bracket?careerId=${careerId}&eventId=${next_event.id}`);
    } else {
     // Qualifier event created, reload to show it
     loadCareer();
     setPlayingEvent(false);
    }
    return;
   }

   // Pro Tour Major Qualifier match - dartbot BO11
   if (next_event.event_type === 'pro_major_qualifier') {
    const supabase = createClient();
    const { data: matchData, error } = await supabase.rpc('rpc_pro_tour_start_qualifier', { p_career_id: careerId });
    if (error || matchData?.error) { toast.error(matchData?.error || 'Failed to start qualifier'); setPlayingEvent(false); return; }
    const avg = matchData.bot_average || 72;
    const diffKey = avg <= 40 ? 'beginner' : avg <= 50 ? 'casual' : avg <= 60 ? 'intermediate' : avg <= 70 ? 'advanced' : avg <= 80 ? 'elite' : avg <= 90 ? 'pro' : 'worldClass';
    setConfig({
     mode: '501', botDifficulty: diffKey as any, botAverage: avg, doubleOut: true,
     bestOf: 'best-of-11', atcOpponent: 'bot',
     career: { careerId, eventId: matchData.event_id, eventName: next_event.event_name, matchId: matchData.match_id, opponentId: 'qualifier_bot', opponentName: matchData.opponent.name },
    });
    router.push('/app/play/training/501');
    return;
   }

   // Premier League match - dartbot match
   if (next_event.event_type === 'champions_series_semi' || next_event.event_type === 'champions_series_final') {
    const supabase = createClient();
    const { data: matchData, error } = await supabase.rpc('rpc_career_play_next_event_locked_fixed', { p_career_id: careerId });
    if (error) throw error;
    if (matchData?.skipped) {
     toast.info('Not in Premier League - skipped');
     loadCareer(); setPlayingEvent(false); return;
    }
    if (matchData?.error) throw new Error(matchData.error);
    const avg = matchData.bot_average || 70;
    const diffKey = avg <= 40 ? 'beginner' : avg <= 50 ? 'casual' : avg <= 60 ? 'intermediate' : avg <= 70 ? 'advanced' : avg <= 80 ? 'elite' : avg <= 90 ? 'pro' : 'worldClass';
    const bestOfMap: Record<number, any> = { 1: 'best-of-1', 3: 'best-of-3', 5: 'best-of-5', 7: 'best-of-7', 9: 'best-of-9', 11: 'best-of-11', 13: 'best-of-13', 15: 'best-of-15', 17: 'best-of-17', 19: 'best-of-19', 21: 'best-of-21', 23: 'best-of-23' };
    setConfig({
     mode: '501', botDifficulty: diffKey as any, botAverage: avg, doubleOut: true,
     bestOf: bestOfMap[matchData.best_of] || 'best-of-11', atcOpponent: 'bot',
     career: { careerId, eventId: matchData.event_id, eventName: next_event.event_name, matchId: matchData.match_id, opponentId: matchData.opponent.id, opponentName: matchData.opponent.name },
    });
    router.push('/app/play/training/501');
    return;
   }

   // National Tour T3 Qualification - auto-check rank
   if (next_event.event_type === 'regional_t3_qualification') {
    const supabase = createClient();
    const { data: qualResult } = await supabase.rpc('rpc_regional_tour_t3_qualification', { p_career_id: careerId });
    if (qualResult?.error) { toast.error(qualResult.error); setPlayingEvent(false); return; }
    toast.info(qualResult.message, { duration: 5000 });
    await new Promise(r => setTimeout(r, 1500));
    loadCareer();
    setPlayingEvent(false);
    return;
   }

   // Tour School semi/final and Regional qual match - dartbot match BO9/BO7
   if (['q_school_semi', 'q_school_final', 'regional_qual_match'].includes(next_event.event_type)) {
    const supabase = createClient();
    const { data: matchData, error } = await supabase.rpc('rpc_career_play_next_event_locked_fixed', { p_career_id: careerId });
    if (error) throw error;
    if (matchData?.error) throw new Error(matchData.error);
    const avg = matchData.bot_average || 60;
    const diffKey = avg <= 30 ? 'novice' : avg <= 40 ? 'beginner' : avg <= 50 ? 'casual' : avg <= 60 ? 'intermediate' : avg <= 70 ? 'advanced' : avg <= 80 ? 'elite' : avg <= 90 ? 'pro' : 'worldClass';
    const bestOfMap: Record<number, any> = { 1: 'best-of-1', 3: 'best-of-3', 5: 'best-of-5', 7: 'best-of-7', 9: 'best-of-9', 11: 'best-of-11', 13: 'best-of-13', 15: 'best-of-15', 17: 'best-of-17', 19: 'best-of-19', 21: 'best-of-21', 23: 'best-of-23' };
    setConfig({
     mode: '501', botDifficulty: diffKey as any, botAverage: avg, doubleOut: true,
     bestOf: bestOfMap[matchData.best_of] || 'best-of-9', atcOpponent: 'bot',
     career: { careerId, eventId: matchData.event_id, eventName: next_event.event_name, matchId: matchData.match_id, opponentId: matchData.opponent.id, opponentName: matchData.opponent.name },
    });
    router.push('/app/play/training/501');
    return;
   }

   // County Championship group match - launch as dartbot match (like league)
   if (next_event.event_type === 'county_championship_group') {
    const supabase = createClient();
    const { data: matchData, error } = await supabase.rpc('rpc_career_play_next_event_locked_fixed', { p_career_id: careerId });
    if (error) throw error;
    if (matchData?.error) throw new Error(matchData.error);
    const avg = matchData.bot_average || 55;
    const diffKey = avg <= 30 ? 'novice' : avg <= 40 ? 'beginner' : avg <= 50 ? 'casual' : avg <= 60 ? 'intermediate' : avg <= 70 ? 'advanced' : avg <= 80 ? 'elite' : avg <= 90 ? 'pro' : 'worldClass';
    setConfig({
     mode: '501', botDifficulty: diffKey as any, botAverage: avg, doubleOut: true,
     bestOf: 'best-of-5', atcOpponent: 'bot',
     career: { careerId, eventId: matchData.event_id, eventName: next_event.event_name, matchId: matchData.match_id, opponentId: matchData.opponent.id, opponentName: matchData.opponent.name },
    });
    router.push('/app/play/training/501');
    return;
   }

   // Optional Pro Tour Players Championship — show Enter/Skip prompt (unless already entered)
   if (next_event.event_type === 'pro_players_championship') {
    const supabase = createClient();
    const { data: existingBracket } = await supabase
     .from('career_brackets').select('id').eq('career_id', careerId).eq('event_id', next_event.id).limit(1);
    if (existingBracket && existingBracket.length > 0) {
     router.push(`/app/career/bracket?careerId=${careerId}&eventId=${next_event.id}`);
     return;
    }
    setOptionalTournamentEvent(next_event);
    setShowOptionalTournament(true);
    setPlayingEvent(false);
    return;
   }

   // Champions Series night — mini bracket (8 players)
   if (next_event.event_type === 'champions_series_night') {
    router.push(`/app/career/bracket?careerId=${careerId}&eventId=${next_event.id}`);
    return;
   }

   const bracketTypes = ['open', 'qualifier', 'trial_tournament', 'major', 'season_finals', 'county_championship_knockout', 'regional_tournament', 'pro_open', 'pro_major', 'pro_world_series', 'relegation_tournament'];
   if (bracketTypes.includes(next_event.event_type) && next_event.bracket_size) {
    router.push(`/app/career/bracket?careerId=${careerId}&eventId=${next_event.id}`);
    return;
   }

   // Training event - pick a random training mode and route there
   if (next_event.event_type === 'training') {
    // Mark training event as completed
    const supabase = createClient();
    await supabase.rpc('rpc_career_play_next_event_locked_fixed', { p_career_id: careerId });
    // Store career context so training end screen shows "Return to Career"
    sessionStorage.setItem(CAREER_TRAINING_RETURN_KEY, careerId);
    router.push(getRandomCareerTrainingRoute());
    return;
   }

   const supabase = createClient();
   const { data: matchData, error } = await supabase.rpc('rpc_career_play_next_event_locked_fixed', { p_career_id: careerId });
   if (error) throw error;
   if (matchData?.error) throw new Error(matchData.error);
   if (matchData?.skipped) {
    if (matchData.promoted) {
     toast.success(` ${matchData.message}`, { duration: 5000 });
    } else {
     toast.info(matchData.message);
    }
    loadCareer();
    return;
   }

   const avg = matchData.bot_average || 50;
   const diffKey = avg <= 30 ? 'novice' : avg <= 40 ? 'beginner' : avg <= 50 ? 'casual'
    : avg <= 60 ? 'intermediate' : avg <= 70 ? 'advanced' : avg <= 80 ? 'elite'
    : avg <= 90 ? 'pro' : 'worldClass';
   const bestOfMap: Record<number, any> = { 1: 'best-of-1', 3: 'best-of-3', 5: 'best-of-5', 7: 'best-of-7', 9: 'best-of-9', 11: 'best-of-11', 13: 'best-of-13', 15: 'best-of-15', 17: 'best-of-17', 19: 'best-of-19', 21: 'best-of-21', 23: 'best-of-23' };

   setConfig({
    mode: '501', botDifficulty: diffKey as any, botAverage: avg, doubleOut: true,
    bestOf: bestOfMap[matchData.best_of] || 'best-of-3', atcOpponent: 'bot',
    career: { careerId, eventId: matchData.event_id, eventName: next_event.event_name, matchId: matchData.match_id, opponentId: matchData.opponent.id, opponentName: matchData.opponent.name },
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
        <Card key={save.id} className="p-4 border border-white/10 bg-slate-800/50 hover:border-amber-500/30 transition-all">
         <div className="flex items-center gap-3">
          <div className="flex-1 cursor-pointer" onClick={() => { setShowSaveSelect(false); router.replace(`/app/career?id=${save.id}`); }}>
           <div className="flex items-center gap-3">
            <tierCfg.icon className="w-5 h-5 text-white/60" />
            <div className="flex-1">
             <span className="font-bold text-white">{tierCfg.name}</span>
             <p className="text-sm text-slate-400">Season {save.season} - Week {save.week} - {save.difficulty}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500" />
           </div>
          </div>
          {confirmDeleteId === save.id ? (
           <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white text-xs h-7 px-2"
             onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white text-xs h-7 px-3"
             disabled={deletingId === save.id}
             onClick={async () => {
              setDeletingId(save.id);
              const supabase = createClient();
              const { data: res } = await supabase.rpc('rpc_abandon_career', { p_career_id: save.id });
              if (res?.success) {
               setSaves(prev => prev.filter((s: any) => s.id !== save.id));
               toast.success('Career deleted');
              } else { toast.error('Failed to delete'); }
              setDeletingId(null); setConfirmDeleteId(null);
             }}>
             {deletingId === save.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Delete'}
            </Button>
           </div>
          ) : (
           <Button size="sm" variant="ghost"
            className="text-red-400/60 hover:text-red-400 hover:bg-red-500/10 h-7 px-2"
            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(save.id); }}>
            <Trash2 className="w-4 h-4" />
           </Button>
          )}
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
 // For league events, show correct matchday based on player's games played
 const playerStanding = standings?.find((s: any) => s.is_player);
 const totalLeagueOpponents = standings ? standings.filter((s: any) => !s.is_player).length : 7;
 const leagueMatchday = playerStanding ? (playerStanding.played || 0) + 1 : 1;
 // Season is only complete when all league matches done AND no pending/active tournaments remain
 const leagueMatchesDone = playerStanding && (playerStanding.played || 0) >= totalLeagueOpponents;
 // A 'season_end' event is a marker, not playable - treat as no remaining events
 const hasRemainingEvents = next_event != null && next_event.event_type !== 'season_end';
 const seasonComplete = leagueMatchesDone && !hasRemainingEvents;
 const playerRank = seasonComplete && standings ? [...standings].sort((a: any, b: any) => b.points - a.points || (b.legs_diff ?? 0) - (a.legs_diff ?? 0)).findIndex((s: any) => s.is_player) + 1 : 0;
 const willPromote = seasonComplete && playerRank <= 2;
 const displayEventName = (career.tier === 1 && chosenName) ? chosenName
  : next_event?.event_type === 'league' ? `Weekend League Night - Matchday ${leagueMatchday}`
  : next_event?.event_name;
 const displayDay = Math.max(next_event?.day || 0, career.day || 0) || 1;

 // Generate bracket preview slots for visualization
 const bracketSize = next_event?.bracket_size || 0;
 const bracketRounds = bracketSize > 0 ? Math.log2(bracketSize) : 0;

 return (
  <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 sm:p-4 lg:p-6">
   <div className="max-w-7xl mx-auto space-y-4">

    {/* ? TOP BAR: Name + Tier + REP ? */}
    <div className="flex items-center justify-between">
     <div className="flex items-center gap-3">
      <Button variant="ghost" size="sm" onClick={() => router.push('/app/play')} className="text-slate-400 hover:text-white px-2">
       <ArrowLeft className="w-4 h-4" />
      </Button>
      <div className="flex items-center gap-2.5">
       <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30 flex items-center justify-center">
        <tierCfg.icon className="w-4 h-4 text-amber-400" />
       </div>
       <div>
        <h1 className="font-black text-white text-lg leading-tight">{tierCfg.name}</h1>
        <div className="flex items-center gap-2">
         <span className={`text-xs font-semibold ${diffInfo.color}`}>{diffInfo.label}</span>
         <span className="text-slate-600 text-xs"></span>
         <span className="text-slate-400 text-xs">
          {career.tier === 1 ? `Day ${displayDay}` : `S${career.season} W${career.week}`}
         </span>
         <span className="text-slate-600 text-xs"></span>
         <span className="text-slate-500 text-xs">Day {displayDay}</span>
        </div>
       </div>
      </div>
     </div>
     <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1.5">
       <Star className="w-3.5 h-3.5 text-amber-400" />
       <span className="text-amber-400 font-black text-sm">{career.rep.toLocaleString()}</span>
       <span className="text-amber-400/60 text-[10px] font-medium">REP</span>
      </div>
      {/* Form indicator hidden until form tracking is implemented */}
     </div>
    </div>

    {/* ? MAIN GRID: FIFA-style dashboard ? */}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

     {/* ? LEFT COLUMN: Continue + Notifications ? */}
     <div className="lg:col-span-4 space-y-4">

      {/* CONTINUE / NEXT EVENT - highlighted card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
       <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-amber-500/15 via-orange-600/10 to-slate-900/80 ring-1 ring-amber-500/30 shadow-lg shadow-amber-500/5">
        {/* Decorative glow */}
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-orange-600/8 rounded-full blur-3xl" />

        <div className="relative z-10 p-5">
         <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
           <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
           <span className="text-[11px] font-bold text-amber-400/80 uppercase tracking-widest">Next Match</span>
          </div>
         </div>

         {seasonComplete ? (
          <>
           <div className="text-center py-2">
            <Trophy className="w-10 h-10 text-amber-400 mx-auto mb-2" />
            <h2 className="text-xl font-black text-white mb-1">Season {career.season} Complete!</h2>
            <p className="text-sm text-slate-400 mb-1">You finished <span className={playerRank <= 2 ? 'text-emerald-400 font-bold' : 'text-white font-bold'}>{playerRank}{playerRank === 1 ? 'st' : playerRank === 2 ? 'nd' : playerRank === 3 ? 'rd' : 'th'}</span></p>
            <p className="text-xs text-slate-500 mb-4">{willPromote ? ' Promotion secured!' : (career.tier >= 3 && playerRank > (totalLeagueOpponents + 1 - 2)) ? ' Relegation...' : 'New season with fresh competition ahead.'}</p>
           </div>
           <Button
            className={`w-full font-black py-3 text-base shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99] ${willPromote ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-emerald-500/20' : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-amber-500/20'} text-white`}
            disabled={advancingSeason}
            onClick={async () => {
             // Tier 3: tournament is mandatory and handled in loadCareer, so just advance
             if (career.tier === 3) {
              // Fall through to advanceToNextSeason below
             }
             // National Tour (Tier 4): Tour School for 3rd-6th
             else if (career.tier === 4) {
              const supabase2 = createClient();
              const { data: qEvents } = await supabase2
               .from('career_events').select('id, status').eq('career_id', careerId)
               .eq('season', career.season)
               .in('event_type', ['q_school_semi', 'q_school_final']);
              const qAllDone = qEvents && qEvents.length > 0 && qEvents.every((e: any) => e.status === 'completed' || e.status === 'skipped');
              if (!qEvents || qEvents.length === 0) {
               if (playerRank >= 3 && playerRank <= 6) {
                const { data: qResult } = await supabase2.rpc('rpc_tier4_q_school', { p_career_id: careerId });
                if (qResult?.success) {
                 setQSchoolData({ player_rank: qResult.player_rank, semi_opponent: qResult.semi_opponent, semi_opponent_rank: qResult.semi_opponent_rank });
                 setShowQSchoolIntro(true);
                 return;
                }
               }
              } else if (!qAllDone) {
               // Tour School in progress, reload to show next match
               loadCareer();
               return;
              }
              // Tour School done or not needed, fall through to advance
             }
             // Tier 2: tournament is mandatory and handled in loadCareer, so just advance
             else if (career.tier === 2) {
              // Fall through to advanceToNextSeason below
             }
             
             // Check for sponsor renewal before advancing
             const supabase = createClient();
             const { data: sponsorOptions } = await supabase.rpc('rpc_get_season_end_sponsor_options', {
              p_career_id: careerId,
             });
             if (sponsorOptions?.has_sponsor) {
              setSponsorRenewalData(sponsorOptions);
              setShowSponsorRenewal(true);
              return;
             }
             // No sponsor advance directly
             await advanceToNextSeason();
            }}
           >
            {advancingSeason ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ChevronRight className="w-5 h-5 mr-1" />}
            Next Season
           </Button>
          </>
         ) : next_event ? (
          <>
           <h2 className="text-xl font-black text-white mb-1 leading-tight">{displayEventName}</h2>
           {next_event.league_opponent_name && (
            <p className="text-amber-400/80 text-sm font-semibold mb-2">vs {next_event.league_opponent_name}</p>
           )}
           <div className="flex flex-wrap gap-1.5 mb-4">
            <Badge className="bg-white/10 backdrop-blur-sm text-white/80 text-[11px] font-medium border border-white/5 px-2.5 py-0.5">
             Best of {next_event.format_legs}
            </Badge>
            {next_event.bracket_size && (
             <Badge className="bg-white/10 backdrop-blur-sm text-white/80 text-[11px] font-medium border border-white/5 px-2.5 py-0.5">
              <Users className="w-3 h-3 mr-1" />{next_event.bracket_size}
             </Badge>
            )}
            <Badge className="bg-white/10 backdrop-blur-sm text-white/80 text-[11px] font-medium capitalize border border-white/5 px-2.5 py-0.5">
             {next_event.event_type === 'open' ? 'Tournament'
              : next_event.event_type === 'league' ? 'League Match'
              : next_event.event_type === 'relegation_tournament' ? 'Tournament'
              : next_event.event_type?.startsWith('champions_series') ? 'Champions Series'
              : next_event.event_type?.startsWith('pro_') ? 'Pro Tour'
              : next_event.event_type === 'county_championship_group' ? 'Championship Group'
              : next_event.event_type === 'county_championship_knockout' ? 'Championship Knockout'
              : next_event.event_type === 'q_school_semi' ? 'Tour School Semi'
              : next_event.event_type === 'q_school_final' ? 'Tour School Final'
              : next_event.event_type.replace(/_/g, ' ')}
            </Badge>
            {next_event.event_type?.startsWith('pro_') && (() => {
             try { const m = JSON.parse((next_event as any).metadata || '{}'); if (m.country) return <Badge className="bg-blue-500/10 text-blue-400 text-[11px] font-medium border border-blue-500/20 px-2.5 py-0.5"><Globe className="w-3 h-3 mr-1" />{m.country}</Badge>; } catch {} return null;
            })()}
            {next_event.day && (
             <Badge className="bg-slate-700/50 backdrop-blur-sm text-slate-300 text-[11px] font-medium border border-white/5 px-2.5 py-0.5">
              Day {next_event.day}
             </Badge>
            )}
           </div>
           <Button
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black py-3 text-base shadow-lg shadow-amber-500/20 transition-all hover:shadow-amber-500/30 hover:scale-[1.01] active:scale-[0.99]"
            disabled={playingEvent}
            onClick={handlePlayEvent}
           >
            {playingEvent ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Play className="w-5 h-5 mr-2 fill-current" />}
            Continue
           </Button>
          </>
         ) : (
          <div className="text-center py-6">
           <Trophy className="w-10 h-10 text-amber-400 mx-auto mb-3" />
           <p className="text-white font-black text-lg">Season Complete!</p>
          </div>
         )}
        </div>
       </Card>
      </motion.div>

      {/* SPONSORS + REP */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
       <Card className="border-0 bg-slate-800/40 backdrop-blur-sm ring-1 ring-white/[0.06] shadow-lg">
        <div className="p-5">
         <div className="flex items-center gap-2 mb-4">
          <div className="w-6 h-6 rounded-md bg-rose-500/15 flex items-center justify-center">
           <Bell className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <span className="text-xs font-bold text-rose-400 uppercase tracking-widest">Notifications</span>
         </div>

         {/* Pending sponsor offer */}
         {sponsorOffer ? (
          <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/20">
           <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
             <Award className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1">
             <span className="text-amber-400 font-bold text-sm">{sponsorOffer.sponsor_name}</span>
             <p className="text-slate-400 text-[10px]">+{(sponsorOffer.rep_bonus_pct * 100).toFixed(0)}% REP bonus</p>
            </div>
           </div>
           <p className="text-slate-400 text-xs mb-3">{sponsorOffer.flavour_text}</p>
           {sponsorOffer.objectives && sponsorOffer.objectives.length > 0 && (
            <p className="text-amber-400/70 text-[10px] mb-3"> Goal: {sponsorOffer.objectives[0]?.description}</p>
           )}
           <div className="flex gap-2">
            <Button
             size="sm"
             className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-7"
             onClick={async () => {
              const supabase = createClient();
              const { data: res, error } = await supabase.rpc('rpc_career_respond_sponsor', {
               p_career_id: careerId,
               p_contract_id: sponsorOffer.contract_id,
               p_accept: true,
              });
              if (error || res?.error) { toast.error(res?.error || 'Failed'); return; }
              toast.success(res?.message || 'Sponsor accepted!');
              loadCareer();
             }}
            >
             Accept
            </Button>
            <Button
             size="sm"
             variant="outline"
             className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs h-7"
             onClick={async () => {
              const supabase = createClient();
              const { data: res, error } = await supabase.rpc('rpc_career_respond_sponsor', {
               p_career_id: careerId,
               p_contract_id: sponsorOffer.contract_id,
               p_accept: false,
              });
              if (error || res?.error) { toast.error(res?.error || 'Failed'); return; }
              toast.success('Offer declined.');
              setSponsorOffer(null);
             }}
            >
             Decline
            </Button>
           </div>
          </div>
         ) : sponsors && sponsors.length > 0 ? (
          <div className="space-y-2">
           {sponsors.map((sp: any, i: number) => (
            <div key={i} className="p-3 rounded-xl bg-gradient-to-r from-purple-500/10 to-transparent border border-purple-500/10">
             <div className="flex items-center justify-between mb-1">
              <div>
               <span className="text-white font-semibold text-sm">{sp.name}</span>
               <p className="text-purple-300/60 text-xs">+{Math.min(sp.rep_bonus_pct * 100, sp.first_sponsor ? 5 : sp.rep_bonus_pct * 100).toFixed(0)}% REP bonus</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
               <Award className="w-4 h-4 text-purple-400" />
              </div>
             </div>
             {sp.rep_objectives && sp.rep_objectives.length > 0 && (
              <div className={`text-[10px] mt-2 px-2 py-1.5 rounded-lg ${sp.objectives_progress?.completed ? 'bg-emerald-500/15 border border-emerald-500/20' : 'bg-white/5'}`}>
               {sp.objectives_progress?.completed ? (
                <span className="text-emerald-400 font-bold"> Goal Reached! +10 REP</span>
               ) : (
                <span className="text-amber-400/70"> Goal: {sp.rep_objectives[0]?.description}</span>
               )}
              </div>
             )}
            </div>
           ))}
          </div>
         ) : (
          <div className="text-center py-5">
           <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-2">
            <Award className="w-5 h-5 text-slate-600" />
           </div>
           <p className="text-slate-500 text-xs font-medium">No sponsor offers yet</p>
           <p className="text-slate-600 text-[10px] mt-0.5">Win matches to attract sponsors</p>
          </div>
         )}

         {/* REP total */}
         <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
          <span className="text-slate-400 text-xs font-medium">Reputation</span>
          <div className="flex items-baseline gap-1.5">
           <span className="text-amber-400 font-black text-lg tabular-nums">{career.rep.toLocaleString()}</span>
           <span className="text-amber-400/50 text-[10px] font-semibold uppercase">REP</span>
          </div>
         </div>
        </div>
       </Card>
      </motion.div>

      {/* Timeline Button */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
       <Card className="border-0 bg-slate-800/40 backdrop-blur-sm ring-1 ring-white/[0.06] shadow-lg">
        <div className="p-4">
         <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
           <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
           </div>
           <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Timeline</span>
           {recent_milestones && recent_milestones.length > 0 && (
            <span className="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded-full">{recent_milestones.length}+ events</span>
           )}
          </div>
          <Button
           variant="ghost" size="sm"
           onClick={() => router.push(`/app/career/timeline?careerId=${careerId}`)}
           className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 text-xs"
          >
           View Timeline &rarr;
          </Button>
         </div>
         {recent_milestones && recent_milestones.length > 0 && (
          <div className="mt-3 flex items-start gap-3">
           <div className="mt-1 shrink-0">
            <div className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-400/20" />
           </div>
           <div className="flex-1">
            <div className="flex items-center justify-between">
             <span className="text-white text-sm font-semibold">{recent_milestones[0].title}</span>
             {recent_milestones[0].day && <span className="text-slate-600 text-[10px] font-medium">Day {recent_milestones[0].day}</span>}
            </div>
            {recent_milestones[0].description && <p className="text-slate-500 text-xs mt-0.5">{recent_milestones[0].description}</p>}
           </div>
          </div>
         )}
        </div>
       </Card>
      </motion.div>
     </div>

     {/* ? CENTER COLUMN: Tournament Draw (BIGGER) ? */}
     <div className="lg:col-span-5 space-y-4">

      {/* Tournament Draw / Bracket Preview LARGE */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
       <Card className="border-0 bg-slate-800/40 backdrop-blur-sm ring-1 ring-white/[0.06] shadow-lg">
        <div className="p-5">
         <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
           <div className="w-6 h-6 rounded-md bg-teal-500/15 flex items-center justify-center">
            <Table2 className="w-3.5 h-3.5 text-teal-400" />
           </div>
           <span className="text-xs font-bold text-teal-400 uppercase tracking-widest">
            {standings && standings.length > 0 ? 'League Table' : next_event?.bracket_size ? 'Tournament Draw' : 'Current Event'}
           </span>
          </div>
          {next_event?.bracket_size && !standings?.length && (
           <Badge className="bg-teal-500/10 text-teal-400 text-[10px] border border-teal-500/20">
            {next_event.bracket_size} Players
           </Badge>
          )}
         </div>

         {/* League Table (Tier 2+) */}
         {standings && standings.length > 0 ? (
          <div className="space-y-0">
           <div className="flex items-center text-[10px] text-slate-500 font-bold px-2 pb-2 border-b border-white/5">
            <span className="w-5">#</span>
            <span className="flex-1">Name</span>
            <span className="w-7 text-center">P</span>
            <span className="w-7 text-center">W</span>
            <span className="w-7 text-center">L</span>
            <span className="w-8 text-center">LD</span>
            <span className="w-9 text-center">Pts</span>
           </div>
           {[...standings].sort((a: any, b: any) => b.points - a.points || (b.legs_diff ?? 0) - (a.legs_diff ?? 0)).map((row: any, i: number) => (
            <div key={i} className={`flex items-center text-xs px-2 py-2 transition-colors ${row.is_player ? 'bg-amber-500/10 rounded-lg ring-1 ring-amber-500/20' : 'hover:bg-white/[0.02]'} ${i < standings.length - 1 && !row.is_player ? 'border-b border-white/[0.04]' : ''}`}>
             <span className={`w-5 font-bold ${i < 2 ? 'text-emerald-400' : (career.tier === 4 && i >= 2 && i <= 5) ? 'text-amber-400' : (career.tier === 4 && i >= standings.length - 3) ? 'text-red-400' : (career.tier === 3 && i >= standings.length - 2) ? 'text-red-400' : 'text-slate-500'}`}>{i + 1}</span>
             <span className={`flex-1 font-medium truncate ${row.is_player ? 'text-amber-400' : 'text-white'}`}>{row.name}</span>
             <span className="w-7 text-center text-slate-500">{row.played}</span>
             <span className="w-7 text-center text-slate-500">{row.won || 0}</span>
             <span className="w-7 text-center text-slate-500">{row.lost || 0}</span>
             <span className={`w-8 text-center text-xs ${(row.legs_diff ?? 0) > 0 ? 'text-emerald-400' : (row.legs_diff ?? 0) < 0 ? 'text-red-400' : 'text-slate-500'}`}>{(row.legs_diff ?? 0) > 0 ? '+' : ''}{row.legs_diff ?? 0}</span>
             <span className={`w-9 text-center font-bold ${row.is_player ? 'text-amber-400' : 'text-white'}`}>{row.points}</span>
            </div>
           ))}
           <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Promotion</span>
            {career.tier === 4 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Tour School</span>}
            {career.tier >= 3 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Relegation</span>}
           </div>
          </div>
         ) : next_event ? (
          <div>
           <h3 className="text-lg font-black text-white mb-1">{displayEventName}</h3>
           <p className="text-slate-400 text-sm mb-4 capitalize">{next_event.event_type.replace('_', ' ')}</p>

           {next_event.bracket_size ? (
            next_event.bracket_size <= 16 && activeBracket?.matches ? (
             /* Small bracket (8/16) - show visual bracket */
             <div className="bg-slate-900/60 rounded-xl border border-white/5 p-4 overflow-x-auto">
              <div className="flex items-stretch gap-3 min-w-fit justify-center">
               {Array.from({ length: activeBracket.totalRounds }).map((_: any, roundIdx: number) => {
                const roundMatches = activeBracket.matches.filter((m: any) => m.round === roundIdx + 1);
                const roundLabel = roundIdx === activeBracket.totalRounds - 1 ? 'Final'
                 : roundIdx === activeBracket.totalRounds - 2 ? 'Semi-Final'
                 : roundIdx === activeBracket.totalRounds - 3 ? 'Quarter-Final'
                 : `Round ${roundIdx + 1}`;
                const isCurrentRound = roundIdx + 1 === activeBracket.currentRound;
                return (
                 <div key={roundIdx} className="flex flex-col items-center gap-1 min-w-[110px]">
                  <span className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isCurrentRound ? 'text-amber-400' : 'text-slate-500'}`}>{roundLabel}</span>
                  <div className="flex flex-col gap-2 justify-center flex-1">
                   {roundMatches.map((match: any, mi: number) => (
                    <div key={mi} className={`border rounded-lg overflow-hidden ${match.isPlayerMatch && isCurrentRound ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/[0.08] bg-slate-800/50'}`}>
                     <div className={`px-2.5 py-1.5 border-b border-white/[0.04] flex items-center justify-between gap-1.5 ${match.winnerId === match.participant1?.id ? 'bg-white/5' : ''}`}>
                      <span className={`text-[10px] font-medium truncate ${match.participant1?.isPlayer ? 'text-amber-400' : match.winnerId === match.participant1?.id ? 'text-white' : 'text-slate-400'}`}>
                       {match.participant1?.name || 'TBD'}
                      </span>
                      {match.score && <span className="text-[10px] text-slate-500 font-bold">{match.score.p1Legs}</span>}
                     </div>
                     <div className={`px-2.5 py-1.5 flex items-center justify-between gap-1.5 ${match.winnerId === match.participant2?.id ? 'bg-white/5' : ''}`}>
                      <span className={`text-[10px] font-medium truncate ${match.participant2?.isPlayer ? 'text-amber-400' : match.winnerId === match.participant2?.id ? 'text-white' : 'text-slate-400'}`}>
                       {match.participant2?.name || 'TBD'}
                      </span>
                      {match.score && <span className="text-[10px] text-slate-500 font-bold">{match.score.p2Legs}</span>}
                     </div>
                    </div>
                   ))}
                  </div>
                 </div>
                );
               })}
               <div className="flex flex-col items-center justify-center min-w-[50px]">
                <span className="text-[10px] font-bold text-amber-500/60 uppercase tracking-wider mb-2">Winner</span>
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/20 flex items-center justify-center">
                 <Trophy className="w-6 h-6 text-amber-400" />
                </div>
               </div>
              </div>
             </div>
            ) : (
             /* Large bracket (32/64/128) or not started - compact tournament info card */
             <div className="bg-slate-900/60 rounded-xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-4">
               <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/20 to-blue-600/20 border border-teal-500/20 flex items-center justify-center">
                 <Trophy className="w-6 h-6 text-teal-400" />
                </div>
                <div>
                 <p className="text-white font-bold text-sm">{next_event.bracket_size}-Player Knockout</p>
                 <p className="text-slate-500 text-xs">Single Elimination</p>
                </div>
               </div>
              </div>
              {(() => {
               const bs = next_event.bracket_size || 64;
               const rounds = Math.log2(bs);
               const roundNames = [];
               for (let i = rounds; i >= 1; i--) {
                const n = i === 1 ? 'Final' : i === 2 ? 'Semi-Final' : i === 3 ? 'Quarter-Final' : `Last ${Math.pow(2, i)}`;
                roundNames.push({ name: n, matches: Math.pow(2, i - 1) });
               }
               return (
                <div className="space-y-2">
                 {roundNames.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                   <span className={i === roundNames.length - 1 ? 'text-amber-400 font-bold' : 'text-slate-400'}>{r.name}</span>
                   <span className="text-slate-600">{r.matches} {r.matches === 1 ? 'match' : 'matches'}</span>
                  </div>
                 ))}
                </div>
               );
              })()}
              <div className="mt-4 pt-3 border-t border-white/5 text-center">
               <p className="text-slate-500 text-[10px]">Full bracket generated when you enter the tournament</p>
              </div>
             </div>
            )
           ) : (
            <div className="bg-slate-900/60 rounded-xl border border-white/5 p-6 text-center">
             <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center mx-auto mb-3">
              <Swords className="w-6 h-6 text-teal-400" />
             </div>
             <p className="text-white font-semibold text-sm">League Match</p>
             <p className="text-slate-500 text-xs mt-1">Best of {next_event.format_legs} legs</p>
            </div>
           )}
          </div>
         ) : (
          <div className="text-center py-8">
           <Trophy className="w-10 h-10 text-slate-600 mx-auto mb-2" />
           <p className="text-slate-500 text-sm font-medium">Season complete</p>
          </div>
         )}
        </div>
       </Card>
      </motion.div>

      {/* Emails Tile */}
      {emails.length > 0 && (
       <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
        <Card className={`border-0 backdrop-blur-sm shadow-lg ${
         emails.some(e => e.isNew) 
          ? 'bg-cyan-500/10 ring-2 ring-cyan-400/40 shadow-cyan-500/10' 
          : 'bg-slate-800/40 ring-1 ring-white/[0.06]'
        }`}>
         <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
           <div className={`w-6 h-6 rounded-md flex items-center justify-center ${emails.some(e => e.isNew) ? 'bg-cyan-500/30 animate-pulse' : 'bg-cyan-500/15'}`}>
            <Mail className="w-3.5 h-3.5 text-cyan-400" />
           </div>
           <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Emails</span>
           {emails.some(e => e.isNew) && <Badge className="bg-cyan-400 text-slate-900 text-[10px] font-black px-1.5">NEW</Badge>}
           <Badge className="bg-cyan-500/10 text-cyan-400 text-[10px] border border-cyan-500/20 ml-auto">{emails.length}</Badge>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
           {emails.map((email) => (
            <div key={email.id} className={`p-3 rounded-xl border group relative ${
             email.isNew 
              ? 'bg-gradient-to-r from-cyan-500/15 to-cyan-500/5 border-cyan-400/30' 
              : 'bg-gradient-to-r from-cyan-500/5 to-transparent border-cyan-500/10'
            }`}>
             <div className="flex items-start gap-2 mb-1">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${email.isNew ? 'bg-cyan-400 animate-pulse' : 'bg-cyan-400/50'}`} />
              <span className={`text-sm font-semibold flex-1 ${email.isNew ? 'text-cyan-50' : 'text-white'}`}>{email.subject}</span>
              <button onClick={() => deleteEmail(email.id)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity shrink-0 p-0.5">
               <X className="w-3.5 h-3.5" />
              </button>
             </div>
             <p className="text-slate-400 text-xs pl-3.5">{email.body}</p>
             {email.type === 'tournament_invite' && (
              <div className="flex gap-2 mt-2 pl-3.5">
               <Button
                size="sm"
                className="bg-emerald-500 hover:bg-emerald-400 text-white text-xs px-4 py-1 h-7"
                onClick={async () => {
                 const supabase = createClient();
                 const eventId = email.id.replace('tournament-invite-', '');
                 console.log('[TOURNAMENT INVITE] Accepting:', { careerId, eventId });
                 const { data: res, error } = await supabase.rpc('rpc_career_respond_tournament_invite', {
                  p_career_id: careerId,
                  p_event_id: eventId,
                  p_accept: true,
                 });
                 console.log('[TOURNAMENT INVITE] Accept result:', { res, error });
                 if (error) { toast.error(`Failed to accept: ${error.message}`); return; }
                 if (res?.error) { toast.error(res.error); return; }
                 toast.success(res?.message || 'Tournament accepted!');
                 // Update this email to accepted, remove all other tournament invites (auto-declined on backend)
                 setEmails(prev => prev
                  .filter(e => e.type !== 'tournament_invite' || e.id === email.id)
                  .map(e => e.id === email.id ? { ...e, type: 'tournament_accepted', body: `You accepted the invitation to ${email.subject.replace(' ', '').replace(' You\'re Invited!', '')}. Good luck! ` } : e)
                 );
                 setPendingInvites([]);
                 setPendingInvite(null);
                 // Delay reload to ensure DB commit completes
                 setTimeout(() => loadCareer(), 500);
                }}
               >
                Accept
               </Button>
               <Button
                size="sm"
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs px-4 py-1 h-7"
                onClick={async () => {
                 const supabase = createClient();
                 const eventId = email.id.replace('tournament-invite-', '');
                 console.log('[TOURNAMENT INVITE] Declining:', { careerId, eventId });
                 const { data: res, error } = await supabase.rpc('rpc_career_respond_tournament_invite', {
                  p_career_id: careerId,
                  p_event_id: eventId,
                  p_accept: false,
                 });
                 console.log('[TOURNAMENT INVITE] Decline result:', { res, error });
                 if (error) { toast.error(`Failed to decline: ${error.message}`); return; }
                 if (res?.error) { toast.error(res.error); return; }
                 toast.success(res?.message || 'Tournament declined.');
                 // Change email to show declined status
                 setEmails(prev => prev.map(e => 
                  e.id === email.id ? { ...e, type: 'tournament_declined', body: `You declined the invitation. Focus on the league! ` } : e
                 ));
                 // Update pending invites list
                 setPendingInvites(prev => prev.filter(inv => inv.event_id !== eventId));
                 setTimeout(() => loadCareer(), 500);
                }}
               >
                Decline
               </Button>
              </div>
             )}
            </div>
           ))}
          </div>
          {emails.length > 1 && (
           <button onClick={deleteAllEmails} className="mt-3 text-[10px] text-slate-500 hover:text-red-400 transition-colors uppercase tracking-wider font-semibold">
            Clear All Emails
           </button>
          )}
         </div>
        </Card>
       </motion.div>
      )}

     </div>

     {/* ? RIGHT COLUMN: World Rankings (always) ? */}
     <div className="lg:col-span-3 space-y-4">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
       <Card className="border-0 bg-slate-800/40 backdrop-blur-sm ring-1 ring-white/[0.06] shadow-lg">
        <div className="p-5">
         <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
           <div className="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center">
            <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
           </div>
           <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Rankings</span>
          </div>
          <Button variant="ghost" size="sm" className="text-slate-500 hover:text-white text-[10px] px-2 h-6" onClick={loadWorldRankings}>
           View All
          </Button>
         </div>

         <div className="text-center py-6">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-2">
           <Trophy className="w-5 h-5 text-blue-400/50" />
          </div>
          <p className="text-slate-400 text-xs font-medium">Top 25 World Players</p>
          <Button variant="ghost" size="sm" className="text-blue-400 text-xs mt-2 hover:text-blue-300" onClick={loadWorldRankings}>
           Preview World Rankings
          </Button>
         </div>
        </div>
       </Card>
      </motion.div>

      {/* Champions Series Standings (Tier 5 only) */}
      {career.tier >= 5 && (
       <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }}>
        <Card className="border-0 bg-slate-800/40 backdrop-blur-sm ring-1 ring-purple-500/20 shadow-lg">
         <div className="p-4">
          <div className="flex items-center gap-2 mb-2">
           <Trophy className="w-4 h-4 text-purple-400" />
           <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Champions Series</span>
          </div>
          <p className="text-slate-400 text-xs mb-2">Top 8 players compete over 8 nights</p>
          <Button variant="ghost" size="sm" className="text-purple-400 text-xs hover:text-purple-300"
           onClick={loadChampionsStandings}>
           View Standings
          </Button>
         </div>
        </Card>
       </motion.div>
      )}

      {/* Awards / Trophy Cabinet */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
       <Card className="border-0 bg-slate-800/40 backdrop-blur-sm ring-1 ring-white/[0.06] shadow-lg">
        <div className="p-4">
         <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center">
           <Trophy className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Awards</span>
         </div>
         {(() => {
          // Filter out first_tournament_win (has generic title), keep tournament_win + league_win
          const awards = (data.awards || []).filter((a: any) => a.milestone_type !== 'first_tournament_win' && a.milestone_type !== 'promotion' && a.milestone_type !== 'relegation');
          if (awards.length === 0) {
           return (
            <div className="text-center py-4">
             <Trophy className="w-8 h-8 text-slate-700 mx-auto mb-2" />
             <p className="text-slate-600 text-xs">No trophies yet</p>
             <p className="text-slate-700 text-[10px]">Win a tournament to earn your first!</p>
            </div>
           );
          }
          // Group by title (event name) for x2, x3 etc
          const grouped = awards.reduce((acc: Record<string, { title: string; days: number[]; count: number }>, a: any) => {
           const key = a.title || a.description || 'Unknown';
           if (!acc[key]) acc[key] = { title: key, days: [], count: 0 };
           acc[key].count++;
           if (a.day) acc[key].days.push(a.day);
           return acc;
          }, {});
          return (
           <div className="space-y-2 max-h-48 overflow-y-auto">
            {Object.values(grouped).map((award: any, i: number) => (
             <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
               <Trophy className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
               <div className="flex items-center gap-1.5">
                <span className="text-white text-xs font-semibold truncate">{award.title}</span>
                {award.count > 1 && <Badge className="bg-amber-500/20 text-amber-400 text-[9px] px-1 py-0 border-0">{award.count}</Badge>}
               </div>
               <p className="text-slate-500 text-[10px]">
                {award.days.length > 0 ? `Day ${award.days.join(', ')}` : ''}
               </p>
              </div>
             </div>
            ))}
           </div>
          );
         })()}
        </div>
       </Card>
      </motion.div>

      {/* Season Stats */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.29 }}>
       <Card className="border-0 bg-slate-800/40 backdrop-blur-sm ring-1 ring-white/[0.06] shadow-lg">
        <div className="p-4">
         <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
           <div className="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center">
            <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
           </div>
           <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Season Stats</span>
          </div>
         </div>
         {(() => {
          // Combine league standings + tournament matches for full season stats
          const p = playerStanding;
          const leaguePlayed = p?.played || 0;
          const leagueWon = p?.won || 0;
          const leagueLost = p?.lost || 0;
          const leagueAvg = p?.average || 0;
          // seasonMatchStats populated from career_matches in loadCareer
          const tourneyPlayed = (seasonMatchStats?.played || 0) - leaguePlayed;
          const tourneyWon = (seasonMatchStats?.won || 0) - leagueWon;
          const tourneyLost = (seasonMatchStats?.lost || 0) - leagueLost;
          const played = seasonMatchStats?.played || leaguePlayed;
          const won = seasonMatchStats?.won || leagueWon;
          const lost = seasonMatchStats?.lost || leagueLost;
          const avg = seasonMatchStats?.average || leagueAvg;
          return (
           <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2">
             <div className="text-center p-2 rounded-lg bg-white/[0.03]">
              <p className="text-white text-sm font-bold">{played}</p>
              <p className="text-slate-500 text-[10px]">P</p>
             </div>
             <div className="text-center p-2 rounded-lg bg-emerald-500/[0.06]">
              <p className="text-emerald-400 text-sm font-bold">{won}</p>
              <p className="text-slate-500 text-[10px]">W</p>
             </div>
             <div className="text-center p-2 rounded-lg bg-red-500/[0.06]">
              <p className="text-red-400 text-sm font-bold">{lost}</p>
              <p className="text-slate-500 text-[10px]">L</p>
             </div>
             <div className="text-center p-2 rounded-lg bg-amber-500/[0.06]">
              <p className="text-amber-400 text-sm font-bold">{typeof avg === 'number' ? avg.toFixed(1) : avg}</p>
              <p className="text-slate-500 text-[10px]">Avg</p>
             </div>
            </div>
            <button
             onClick={() => router.push(`/app/career/stats?id=${careerId}`)}
             className="w-full text-center text-blue-400 hover:text-blue-300 text-[11px] font-medium mt-1 transition-colors"
            >
             View All Time Stats 
            </button>
           </div>
          );
         })()}
        </div>
       </Card>
      </motion.div>

      {/* Settings + Save */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
       <div className="grid grid-cols-2 gap-3">
        <Card
         className="border-0 bg-slate-800/40 backdrop-blur-sm ring-1 ring-white/[0.06] cursor-pointer hover:ring-white/15 transition-all group shadow-lg p-4 text-center"
         onClick={() => setShowSettings(true)}
        >
         <div className="w-10 h-10 rounded-xl bg-white/5 group-hover:bg-white/10 flex items-center justify-center mx-auto mb-2 transition-colors">
          <Settings className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
         </div>
         <span className="text-slate-400 group-hover:text-white text-xs font-semibold transition-colors">Settings</span>
        </Card>
        <Card
         className="border-0 bg-slate-800/40 backdrop-blur-sm ring-1 ring-white/[0.06] cursor-pointer hover:ring-emerald-500/30 transition-all group shadow-lg p-4 text-center"
         onClick={handleSaveGame}
        >
         <div className="w-10 h-10 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500/20 flex items-center justify-center mx-auto mb-2 transition-colors">
          {saving ? (
           <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
          ) : (
           <Save className="w-5 h-5 text-emerald-400" />
          )}
         </div>
         <span className="text-emerald-400 text-xs font-semibold">Save</span>
        </Card>
       </div>
      </motion.div>
     </div>
    </div>

    {/* ? DIALOGS ? */}

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
        <div key={i} className={`flex items-center text-xs px-2 py-1.5 border-b border-white/5 ${r.isPlayer ? 'bg-blue-500/10 border-l-2 border-l-blue-400' : i < 8 ? 'bg-amber-500/5' : ''}`}>
         <span className={`w-8 ${i < 3 ? 'text-amber-400 font-bold' : i < 8 ? 'text-white' : 'text-slate-500'}`}>{r.rank}</span>
         <div className="flex-1">
          <span className={`font-medium ${r.isPlayer ? 'text-blue-400' : i < 8 ? 'text-white' : 'text-slate-300'}`}>{r.name}</span>
          {r.archetype && <span className="text-slate-500 text-[10px] ml-1 capitalize">({r.archetype})</span>}
         </div>
         <span className="w-12 text-right text-slate-400">{r.rating}</span>
         {career.tier >= 5 && r.pointsChange !== undefined && (
          <span className={`w-10 text-right text-[10px] ${r.pointsChange > 0 ? 'text-emerald-400' : r.pointsChange < 0 ? 'text-red-400' : 'text-slate-600'}`}>
           {r.pointsChange > 0 ? '+' : ''}{r.pointsChange}
          </span>
         )}
        </div>
       ))}
       {playerRankingRow && career.tier >= 5 && (
        <>
         <div className="text-center text-slate-600 text-[10px] py-1">...</div>
         <div className="flex items-center text-xs px-2 py-1.5 bg-blue-500/10 border-l-2 border-l-blue-400">
          <span className="w-8 text-slate-500">{playerRankingRow.rank}</span>
          <div className="flex-1">
           <span className="font-medium text-blue-400">{playerRankingRow.name}</span>
          </div>
          <span className="w-12 text-right text-slate-400">{playerRankingRow.rating}</span>
          <span className={`w-10 text-right text-[10px] ${playerRankingRow.pointsChange > 0 ? 'text-emerald-400' : playerRankingRow.pointsChange < 0 ? 'text-red-400' : 'text-slate-600'}`}>
           {playerRankingRow.pointsChange > 0 ? '+' : ''}{playerRankingRow.pointsChange}
          </span>
         </div>
        </>
       )}
       {worldRankings.length === 0 && (
        <div className="text-center py-4">
         <Loader2 className="w-5 h-5 text-slate-400 animate-spin mx-auto" />
        </div>
       )}
      </div>
      <p className="text-slate-500 text-[10px] text-center mt-2">{career.tier === 5 ? 'Top 8 qualify for Champions Series' : ''}</p>
     </DialogContent>
    </Dialog>
   </div>

   {/* Optional Pro Tour Tournament Prompt */}
   {showOptionalTournament && optionalTournamentEvent && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
     <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      className="bg-[#12121f] border border-white/10 rounded-xl p-6 max-w-sm w-full text-center">
      {(() => {
       let country = ''; let tournamentNum = 0;
       try { const m = JSON.parse(optionalTournamentEvent.metadata || '{}'); country = m.country || ''; tournamentNum = m.tournament_number || 0; } catch {}
       return (<>
        <Globe className="w-12 h-12 text-blue-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-white mb-1">{optionalTournamentEvent.event_name}</h3>
        {country && <p className="text-blue-400 text-sm font-medium mb-1">{country}</p>}
        {tournamentNum > 0 && <p className="text-slate-500 text-xs mb-3">Event {tournamentNum} of 8 this season</p>}
        <p className="text-slate-400 text-xs mb-5">
         {optionalTournamentEvent.bracket_size}-player knockout tournament. This event is optional — you can skip it, but other players will still earn ranking points.
        </p>
        <div className="flex flex-col gap-2">
         <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          onClick={handleEnterOptionalTournament}>
          Enter Tournament
         </Button>
         <Button variant="outline" className="w-full border-slate-600 text-slate-300 hover:bg-slate-800"
          onClick={handleSkipOptionalTournament}>
          Skip Tournament
         </Button>
         <Button variant="ghost" className="w-full text-slate-500 hover:text-slate-300 text-xs"
          onClick={() => { setShowOptionalTournament(false); setOptionalTournamentEvent(null); }}>
          Back to Career
         </Button>
        </div>
       </>);
      })()}
     </motion.div>
    </div>
   )}

   {/* Champions Series Standings */}
   <Dialog open={showChampionsStandings} onOpenChange={setShowChampionsStandings}>
    <DialogContent className="bg-[#12121f] border-white/10 text-white max-w-md">
     <DialogTitle className="flex items-center gap-2">
      <Trophy className="w-5 h-5 text-purple-400" /> Champions Series Standings
     </DialogTitle>
     <div className="space-y-0">
      <div className="flex text-[10px] text-slate-500 uppercase px-2 py-1 border-b border-white/10">
       <span className="w-6">#</span>
       <span className="flex-1">Player</span>
       <span className="w-8 text-center">Pts</span>
       <span className="w-10 text-center">LD</span>
       <span className="w-8 text-center">LF</span>
      </div>
      {championsStandings.map((p: any, i: number) => (
       <div key={i} className={`flex items-center text-xs px-2 py-1.5 border-b border-white/5 ${p.is_player ? 'bg-blue-500/10 border-l-2 border-l-blue-400' : i < 4 ? 'bg-purple-500/5' : ''}`}>
        <span className={`w-6 ${i < 4 ? 'text-purple-400 font-bold' : 'text-slate-500'}`}>{i + 1}</span>
        <span className={`flex-1 font-medium ${p.is_player ? 'text-blue-400' : 'text-slate-300'}`}>{p.player_name}</span>
        <span className="w-8 text-center text-white font-bold">{p.points}</span>
        <span className={`w-10 text-center ${p.leg_difference > 0 ? 'text-emerald-400' : p.leg_difference < 0 ? 'text-red-400' : 'text-slate-500'}`}>{p.leg_difference > 0 ? '+' : ''}{p.leg_difference}</span>
        <span className="w-8 text-center text-slate-500">{p.legs_for}</span>
       </div>
      ))}
     </div>
     <p className="text-slate-500 text-[10px] text-center mt-2">Top 4 qualify for playoffs</p>
    </DialogContent>
   </Dialog>

   {/* Champions Series Playoffs Result */}
   {showChampionsPlayoffs && championsPlayoffData && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
     <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      className="bg-[#12121f] border border-white/10 rounded-xl p-6 max-w-sm w-full text-center">
      <Trophy className="w-10 h-10 text-purple-400 mx-auto mb-3" />
      <h3 className="text-lg font-bold text-white mb-2">Champions Series Playoffs</h3>
      {championsPlayoffData.qualified ? (
       <>
        <p className="text-emerald-400 text-sm font-medium mb-2">
         Finished {championsPlayoffData.player_position}{championsPlayoffData.player_position === 1 ? 'st' : championsPlayoffData.player_position === 2 ? 'nd' : championsPlayoffData.player_position === 3 ? 'rd' : 'th'} — Qualified!
        </p>
        <p className="text-slate-400 text-xs mb-4">{championsPlayoffData.semi_matchup}</p>
        <Button className="bg-purple-600 hover:bg-purple-700 text-white w-full"
         onClick={() => { setShowChampionsPlayoffs(false); loadCareer(); }}>
         Continue to Playoffs
        </Button>
       </>
      ) : (
       <>
        <p className="text-red-400 text-sm font-medium mb-2">
         Finished {championsPlayoffData.player_position}th — Did not qualify
        </p>
        <p className="text-slate-500 text-xs mb-4">Only the Top 4 advance to the playoffs</p>
        <Button variant="outline" className="border-slate-600 text-slate-300 w-full"
         onClick={() => { setShowChampionsPlayoffs(false); loadCareer(); }}>
         Continue
        </Button>
       </>
      )}
     </motion.div>
    </div>
   )}

   {/* Tournament Invite Popup — forced decision (supports 1 or 2 invites side by side) */}
   {showInvitePopup && pendingInvites.length > 0 && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
     <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative w-full mx-4 flex gap-4 justify-center ${pendingInvites.length > 1 ? 'max-w-2xl' : 'max-w-sm'}`}
     >
      {pendingInvites.map((invite) => (
       <div key={invite.event_id} className="flex-1 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-amber-500/30 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
        <div className="p-5 text-center">
         <Trophy className="w-10 h-10 text-amber-400 mx-auto mb-2" />
         <h2 className="text-lg font-black text-white mb-1">{invite.event_name}</h2>
         <p className="text-slate-400 text-sm mb-1">
          {invite.bracket_size}-player knockout
         </p>
         <p className="text-slate-500 text-xs mb-5">
          Accept or decline before continuing.
         </p>
         <div className="flex gap-2">
          <Button
           className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm"
           onClick={async () => {
            const supabase = createClient();
            const rpcName = career.tier === 3 ? 'rpc_tier3_tournament_respond' : 'rpc_career_respond_tournament_invite';
            const { data: res, error } = await supabase.rpc(rpcName, {
             p_career_id: careerId,
             p_event_id: invite.event_id,
             p_accept: true,
            });
            if (!error) {
             toast.success(res?.message || 'Tournament accepted!');
             pendingInvites.forEach(inv => deleteEmail(`tournament-invite-${inv.event_id}`));
             setPendingInvites([]);
             setPendingInvite(null);
             setShowInvitePopup(false);
             loadCareer();
            }
           }}
          >
           Accept
          </Button>
          <Button
           variant="outline"
           className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 font-bold text-sm"
           onClick={async () => {
            const supabase = createClient();
            const rpcName = career.tier === 3 ? 'rpc_tier3_tournament_respond' : 'rpc_career_respond_tournament_invite';
            const { data: res, error } = await supabase.rpc(rpcName, {
             p_career_id: careerId,
             p_event_id: invite.event_id,
             p_accept: false,
            });
            if (!error) {
             toast.success(res?.message || 'Tournament declined.');
             deleteEmail(`tournament-invite-${invite.event_id}`);
             const remaining = pendingInvites.filter(inv => inv.event_id !== invite.event_id);
             setPendingInvites(remaining);
             if (remaining.length === 0) {
              setPendingInvite(null);
              setShowInvitePopup(false);
              loadCareer();
             }
            }
           }}
          >
           Decline
          </Button>
         </div>
        </div>
       </div>
      ))}
     </motion.div>
    </div>
   )}

   {/* Sponsor Renewal Popup */}
   {showSponsorRenewal && sponsorRenewalData && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
     <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="relative max-w-lg w-full mx-4"
     >
      <Card className="border-0 bg-gradient-to-b from-slate-800 to-slate-900 ring-1 ring-purple-500/30 shadow-2xl overflow-hidden">
       <div className="p-6 text-center">
        <div className="text-4xl mb-3"></div>
        <h2 className="text-xl font-bold text-white mb-1">Season End Sponsor Decision</h2>
        <p className="text-slate-400 text-sm mb-5">Your sponsorship deal is up for review.</p>

        {/* Current sponsor - Renew option */}
        {sponsorRenewalData.current_sponsor && (
         <button
          disabled={processingRenewal}
          className="w-full p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-transparent ring-1 ring-purple-500/20 hover:ring-purple-500/40 transition-all text-left mb-3 disabled:opacity-50"
          onClick={async () => {
           setProcessingRenewal(true);
           const supabase = createClient();
           await supabase.rpc('rpc_career_end_season_sponsor', { p_career_id: careerId, p_action: 'renew' });
           toast.success('Sponsor renewed!');
           setShowSponsorRenewal(false);
           setProcessingRenewal(false);
           await advanceToNextSeason();
          }}
         >
          <div className="flex items-center gap-2 mb-1">
           <span className="text-xs text-purple-400 font-bold uppercase"> Renew</span>
          </div>
          <div className="text-white font-bold">{sponsorRenewalData.current_sponsor.name}</div>
          <p className="text-purple-300/60 text-xs">+{(sponsorRenewalData.current_sponsor.rep_bonus_pct * 100).toFixed(0)}% REP bonus</p>
         </button>
        )}

        {/* Alternative sponsor - Switch option */}
        {sponsorRenewalData.alternative_sponsor && (
         <button
          disabled={processingRenewal}
          className="w-full p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-transparent ring-1 ring-blue-500/20 hover:ring-blue-500/40 transition-all text-left mb-3 disabled:opacity-50"
          onClick={async () => {
           setProcessingRenewal(true);
           const supabase = createClient();
           await supabase.rpc('rpc_career_end_season_sponsor', {
            p_career_id: careerId,
            p_action: 'switch',
            p_new_sponsor_id: sponsorRenewalData.alternative_sponsor.sponsor_id,
           });
           toast.success('Switched to ' + sponsorRenewalData.alternative_sponsor.name + '!');
           setShowSponsorRenewal(false);
           setProcessingRenewal(false);
           await advanceToNextSeason();
          }}
         >
          <div className="flex items-center gap-2 mb-1">
           <span className="text-xs text-blue-400 font-bold uppercase"> Switch to</span>
          </div>
          <div className="text-white font-bold">{sponsorRenewalData.alternative_sponsor.name}</div>
          <p className="text-blue-300/60 text-xs">+{(sponsorRenewalData.alternative_sponsor.rep_bonus_pct * 100).toFixed(0)}% REP bonus</p>
         </button>
        )}

        {/* Drop sponsor */}
        <button
         disabled={processingRenewal}
         className="text-slate-500 hover:text-slate-300 text-sm transition-colors disabled:opacity-50 mt-1"
         onClick={async () => {
          setProcessingRenewal(true);
          const supabase = createClient();
          await supabase.rpc('rpc_career_end_season_sponsor', { p_career_id: careerId, p_action: 'drop' });
          toast.success('Going sponsorless next season.');
          setShowSponsorRenewal(false);
          setProcessingRenewal(false);
          await advanceToNextSeason();
         }}
        >
         Drop sponsor go independent 
        </button>
       </div>
      </Card>
     </motion.div>
    </div>
   )}

   {/* Tournament Choice Popup (Tier 3+) */}
   {showTournamentChoicePopup && tournamentOptions && tournamentChoiceEvent && (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" style={{ pointerEvents: 'auto' }}>
     <div className="relative max-w-lg w-full mx-4 bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl ring-1 ring-amber-500/30 shadow-2xl overflow-hidden">
      <div className="p-6 text-center">
       <div className="text-4xl mb-3"></div>
       <h2 className="text-xl font-bold text-white mb-1">Tournament Invitation</h2>
       <p className="text-slate-400 text-sm mb-5">Choose a tournament to enter, or skip and continue with the league.</p>
       
       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {/* Option 1 */}
        <button
         type="button"
         disabled={choosingTournament}
         className="p-4 rounded-xl bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 ring-1 ring-emerald-500/20 hover:ring-emerald-500/50 hover:bg-emerald-500/20 active:scale-95 transition-all text-left cursor-pointer disabled:opacity-50 disabled:cursor-wait"
         onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('[TOURNAMENT CHOICE] Selecting option 1');
          setChoosingTournament(true);
          try {
           const supabase = createClient();
           const { data: res, error } = await supabase.rpc('rpc_career_tournament_choice', {
            p_career_id: careerId,
            p_event_id: tournamentChoiceEvent.id,
            p_tournament_choice: 1,
           });
           console.log('[TOURNAMENT CHOICE] Result:', { res, error });
           if (error) { toast.error(error.message || 'Failed'); return; }
           if (res?.error) { toast.error(res.error); return; }
           toast.success(res?.message || 'Tournament entered!');
           setShowTournamentChoicePopup(false);
           loadCareer();
          } catch (err: any) {
           console.error('[TOURNAMENT CHOICE] Error:', err);
           toast.error(err?.message || 'Something went wrong');
          } finally {
           setChoosingTournament(false);
          }
         }}
        >
         <div className="text-amber-400 text-lg font-bold mb-1">{tournamentOptions.option1.name}</div>
         <div className="flex items-center gap-2 text-slate-400 text-xs">
          <span> {tournamentOptions.option1.bracket_size} players</span>
          <span></span>
          <span>{tournamentOptions.option1.format}</span>
         </div>
        </button>

        {/* Option 2 */}
        <button
         type="button"
         disabled={choosingTournament}
         className="p-4 rounded-xl bg-gradient-to-b from-blue-500/10 to-blue-500/5 ring-1 ring-blue-500/20 hover:ring-blue-500/50 hover:bg-blue-500/20 active:scale-95 transition-all text-left cursor-pointer disabled:opacity-50 disabled:cursor-wait"
         onClick={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log('[TOURNAMENT CHOICE] Selecting option 2');
          setChoosingTournament(true);
          try {
           const supabase = createClient();
           const { data: res, error } = await supabase.rpc('rpc_career_tournament_choice', {
            p_career_id: careerId,
            p_event_id: tournamentChoiceEvent.id,
            p_tournament_choice: 2,
           });
           console.log('[TOURNAMENT CHOICE] Result:', { res, error });
           if (error) { toast.error(error.message || 'Failed'); return; }
           if (res?.error) { toast.error(res.error); return; }
           toast.success(res?.message || 'Tournament entered!');
           setShowTournamentChoicePopup(false);
           loadCareer();
          } catch (err: any) {
           console.error('[TOURNAMENT CHOICE] Error:', err);
           toast.error(err?.message || 'Something went wrong');
          } finally {
           setChoosingTournament(false);
          }
         }}
        >
         <div className="text-blue-400 text-lg font-bold mb-1">{tournamentOptions.option2.name}</div>
         <div className="flex items-center gap-2 text-slate-400 text-xs">
          <span> {tournamentOptions.option2.bracket_size} players</span>
          <span></span>
          <span>{tournamentOptions.option2.format}</span>
         </div>
        </button>
       </div>

       {/* Decline both */}
       <button
        type="button"
        disabled={choosingTournament}
        className="text-slate-500 hover:text-slate-300 text-sm transition-colors cursor-pointer disabled:opacity-50"
        onClick={async (e) => {
         e.preventDefault();
         e.stopPropagation();
         console.log('[TOURNAMENT CHOICE] Declining both');
         setChoosingTournament(true);
         try {
          const supabase = createClient();
          const { data: res, error } = await supabase.rpc('rpc_career_tournament_choice', {
           p_career_id: careerId,
           p_event_id: tournamentChoiceEvent.id,
           p_tournament_choice: 0,
          });
          console.log('[TOURNAMENT CHOICE] Decline result:', { res, error });
          if (error) { toast.error(error.message || 'Failed'); return; }
          if (res?.error) { toast.error(res.error); return; }
          toast.success('Carrying on with the league.');
          setShowTournamentChoicePopup(false);
          loadCareer();
         } catch (err: any) {
          toast.error(err?.message || 'Something went wrong');
         } finally {
          setChoosingTournament(false);
         }
        }}
       >
        Decline both continue with league 
       </button>
      </div>
     </div>
    </div>
   )}

   {/* Promotion Popup */}
   {showPromotionPopup && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
     <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="relative max-w-md w-full mx-4"
     >
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-cyan-500/20 rounded-2xl blur-xl" />
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-emerald-500/30 overflow-hidden">
       {/* Decorative top bar */}
       <div className="h-1.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400" />
       
       <div className="p-8 text-center">
        {/* Trophy animation */}
        <motion.div
         initial={{ scale: 0, rotate: -20 }}
         animate={{ scale: 1, rotate: 0 }}
         transition={{ delay: 0.2, type: 'spring', damping: 10 }}
        >
         <Trophy className="w-16 h-16 text-emerald-400 mx-auto mb-4 drop-shadow-[0_0_20px_rgba(52,211,153,0.5)]" />
        </motion.div>

        <motion.div
         initial={{ opacity: 0, y: 10 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ delay: 0.4 }}
        >
         <h2 className="text-3xl font-black text-white mb-2">PROMOTED!</h2>
         <div className="inline-block px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 mb-4">
          <span className="text-emerald-400 font-bold text-sm">Welcome to the {promotionTierName}</span>
         </div>
        </motion.div>

        <motion.div
         initial={{ opacity: 0 }}
         animate={{ opacity: 1 }}
         transition={{ delay: 0.6 }}
        >
         <p className="text-slate-400 text-sm mb-2">
          You&apos;ve earned your spot among the best. The {promotionTierName} brings tougher opponents, bigger tournaments, and higher stakes.
         </p>
         <p className="text-slate-500 text-xs mb-6">
          New rivals await. Time to prove you belong.
         </p>
        </motion.div>

        <motion.div
         initial={{ opacity: 0, y: 10 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ delay: 0.8 }}
        >
         <Button
          className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black py-3 text-base shadow-lg shadow-emerald-500/30"
          onClick={async () => {
           setShowPromotionPopup(false);
           // Init Pro Tour rankings when promoted to Tier 5
           if (promotionTierName === 'Pro Tour') {
            try {
             const supabase = createClient();
             await supabase.rpc('rpc_pro_tour_init_rankings', { p_career_id: careerId });
            } catch {}
           }
           loadCareer();
          }}
         >
          Let&apos;s Go! 
         </Button>
        </motion.div>
       </div>
      </div>
     </motion.div>
    </div>
   )}

   {/* Relegation Popup */}
   {showRelegationPopup && relegationData && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
     <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="relative max-w-md w-full mx-4"
     >
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/20 via-orange-500/10 to-red-500/20 rounded-2xl blur-xl" />
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-red-500/30 overflow-hidden">
       <div className="h-1.5 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />
       
       <div className="p-8 text-center">
        <motion.div
         initial={{ scale: 0 }}
         animate={{ scale: 1 }}
         transition={{ delay: 0.2, type: 'spring', damping: 10 }}
        >
         <div className="text-6xl mb-4"></div>
        </motion.div>

        <motion.div
         initial={{ opacity: 0, y: 10 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ delay: 0.4 }}
        >
         <h2 className="text-3xl font-black text-white mb-2">RELEGATED</h2>
         <div className="inline-block px-4 py-1.5 rounded-full bg-red-500/20 border border-red-500/30 mb-4">
          <span className="text-red-400 font-bold text-sm">Dropped to {relegationData.tier_name}</span>
         </div>
        </motion.div>

        <motion.div
         initial={{ opacity: 0 }}
         animate={{ opacity: 1 }}
         transition={{ delay: 0.6 }}
        >
         <p className="text-slate-400 text-sm mb-2">
          A tough season. You&apos;ve been dropped down to the {relegationData.tier_name}.
         </p>
         {relegationData.rep_lost > 0 && (
          <p className="text-red-400/80 text-xs mb-1">
           -{relegationData.rep_lost} REP lost
          </p>
         )}
         <p className="text-slate-500 text-xs mb-6">
          Sponsors dropped. Time to rebuild and fight your way back.
         </p>
        </motion.div>

        <motion.div
         initial={{ opacity: 0, y: 10 }}
         animate={{ opacity: 1, y: 0 }}
         transition={{ delay: 0.8 }}
        >
         <Button
          className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black py-3 text-base shadow-lg shadow-red-500/20"
          onClick={() => {
           setShowRelegationPopup(false);
           setRelegationData(null);
           loadCareer();
          }}
         >
          Time to Rebuild 
         </Button>
        </motion.div>
       </div>
      </div>
     </motion.div>
    </div>
   )}

   {/* Tour School Intro Popup */}
   {showQSchoolIntro && qSchoolData && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
     <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="relative max-w-md w-full mx-4">
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-orange-500/30 overflow-hidden">
       <div className="h-1.5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500" />
       <div className="p-8 text-center">
        <div className="text-6xl mb-4">&#x1F393;</div>
        <h2 className="text-2xl font-black text-white mb-2">Tour School</h2>
        <div className="inline-block px-4 py-1.5 rounded-full bg-orange-500/20 border border-orange-500/30 mb-4">
         <span className="text-orange-400 font-bold text-sm">Your Last Shot at Promotion</span>
        </div>
        <div className="text-left bg-slate-800/50 rounded-lg p-4 mb-4 space-y-2 text-sm">
         <p className="text-slate-400 text-xs">You finished <span className="text-white font-bold">{qSchoolData.player_rank}th</span> in the league.</p>
         <p className="text-white font-semibold mt-3">Semi-Final (BO9)</p>
         <p className="text-slate-400 text-xs">You vs <span className="text-orange-400 font-semibold">{qSchoolData.semi_opponent}</span></p>
         <p className="text-white font-semibold mt-3">Final (BO9)</p>
         <p className="text-slate-400 text-xs">Win the final = promoted to Pro Tour</p>
        </div>
        <Button className="w-full bg-gradient-to-r from-orange-500 to-amber-600 text-white font-black py-3"
         onClick={() => { setShowQSchoolIntro(false); loadCareer(); }}>
         Enter Tour School
        </Button>
       </div>
      </div>
     </motion.div>
    </div>
   )}

   {/* County Championship Intro Popup */}
   {showChampionshipIntro && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
     <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="relative max-w-md w-full mx-4">
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-purple-500/30 overflow-hidden">
       <div className="h-1.5 bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500" />
       <div className="p-8 text-center">
        <div className="text-6xl mb-4">&#x1F3C6;</div>
        <h2 className="text-2xl font-black text-white mb-2">County Championship</h2>
        <div className="inline-block px-4 py-1.5 rounded-full bg-purple-500/20 border border-purple-500/30 mb-4">
         <span className="text-purple-400 font-bold text-sm">End-of-Season Tournament</span>
        </div>
        <div className="text-left bg-slate-800/50 rounded-lg p-4 mb-4 space-y-2 text-sm">
         <p className="text-white font-semibold">Group Stage</p>
         <p className="text-slate-400 text-xs">4 players, round-robin, Best of 5. Top 2 advance.</p>
         <p className="text-white font-semibold mt-3">Knockout Stage</p>
         <p className="text-slate-400 text-xs">32-player bracket. BO5 all rounds, Final = BO7.</p>
         <p className="text-white font-semibold mt-3">Win = Promotion</p>
         <p className="text-slate-400 text-xs">Win the knockout to earn promotion!</p>
        </div>
        <Button className="w-full bg-gradient-to-r from-purple-500 to-blue-600 text-white font-black py-3"
         onClick={() => { setShowChampionshipIntro(false); loadCareer(); }}>
         Enter Championship
        </Button>
       </div>
      </div>
     </motion.div>
    </div>
   )}

   {/* County Championship Group Results Popup */}
   {showGroupResults && (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
     <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="relative max-w-md w-full mx-4">
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl border border-white/10 overflow-hidden">
       <div className={`h-1.5 ${groupQualified ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-red-500 to-orange-500'}`} />
       <div className="p-6 text-center">
        <h2 className="text-xl font-black text-white mb-3">Group Stage Results</h2>
        <div className="bg-slate-800/50 rounded-lg overflow-hidden mb-4">
         <table className="w-full text-xs">
          <thead>
           <tr className="border-b border-white/10 text-slate-400">
            <th className="text-left py-2 px-3">#</th>
            <th className="text-left py-2 px-2">Player</th>
            <th className="text-center py-2 px-1">W</th>
            <th className="text-center py-2 px-1">L</th>
            <th className="text-center py-2 px-1">Pts</th>
           </tr>
          </thead>
          <tbody>
           {[...groupStandings].sort((a, b) => b.pts - a.pts || (b.lf - b.la) - (a.lf - a.la)).map((s, i) => (
            <tr key={i} className={`border-b border-white/5 ${s.is_player ? 'bg-emerald-500/10' : ''} ${i >= 2 ? 'opacity-50' : ''}`}>
             <td className="py-2 px-3 text-slate-500">{i + 1}</td>
             <td className={`py-2 px-2 font-medium ${s.is_player ? 'text-emerald-400' : 'text-white'}`}>{s.name}</td>
             <td className="text-center py-2 px-1 text-emerald-400">{s.w}</td>
             <td className="text-center py-2 px-1 text-red-400">{s.l}</td>
             <td className="text-center py-2 px-1 text-white font-bold">{s.pts}</td>
            </tr>
           ))}
          </tbody>
         </table>
        </div>
        {groupQualified ? (
         <p className="text-emerald-400 font-bold text-sm mb-4">Qualified for the 32-player knockout!</p>
        ) : (
         <p className="text-red-400 font-bold text-sm mb-4">Eliminated in the group stage</p>
        )}
        <Button className={`w-full font-black py-3 ${groupQualified ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white'}`}
         onClick={async () => {
          setShowGroupResults(false);
          if (groupQualified) {
           const supabase = createClient();
           await supabase.rpc('rpc_county_championship_to_knockout', { p_career_id: careerId });
          }
          loadCareer();
         }}>
         {groupQualified ? 'Enter Knockout Stage' : 'Continue'}
        </Button>
       </div>
      </div>
     </motion.div>
    </div>
   )}
  </div>
 );
}

