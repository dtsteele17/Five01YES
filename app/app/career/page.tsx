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
import { Trophy, Target, Flame, Shield, Crown, Skull, Swords, Play, ChevronRight, ArrowLeft, Loader as Loader2, Star, TrendingUp, Calendar, Dumbbell, Award, Zap, Users, ChartBar as BarChart3, Sparkles, Clock, Settings, Save, Bell, Table2, ChevronDown, X, Trash2, Mail } from 'lucide-react';
import { useTraining } from '@/lib/context/TrainingContext';
import { CAREER_TRAINING_RETURN_KEY, getRandomCareerTrainingRoute } from '@/lib/career/trainingRoutes';

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
    format_legs: number; bracket_size: number | null; sequence_no: number; day: number;
    league_opponent_name?: string | null; league_opponent_id?: string | null;
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
  const [advancingSeason, setAdvancingSeason] = useState(false);
  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<{ event_id: string; event_name: string; bracket_size: number } | null>(null);
  const [pendingInvites, setPendingInvites] = useState<{ event_id: string; event_name: string; bracket_size: number }[]>([]);
  const [showTournamentChoicePopup, setShowTournamentChoicePopup] = useState(false);
  const [sponsorOffer, setSponsorOffer] = useState<any>(null);
  const [tournamentChoiceEvent, setTournamentChoiceEvent] = useState<{ id: string; name: string } | null>(null);
  const [tournamentOptions, setTournamentOptions] = useState<{ option1: any; option2: any } | null>(null);
  const [choosingTournament, setChoosingTournament] = useState(false);
  const [showSponsorRenewal, setShowSponsorRenewal] = useState(false);
  const [sponsorRenewalData, setSponsorRenewalData] = useState<any>(null);
  const [processingRenewal, setProcessingRenewal] = useState(false);

  useEffect(() => { loadCareer(); }, [careerId]);

  async function checkSponsorOffer() {
    if (!careerId) return;
    
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('rpc_career_check_sponsor_offer', {
        p_career_id: careerId
      });
      
      if (error) throw error;
      
      if (data?.sponsor_offer) {
        // Redirect to sponsor offer page
        router.push(`/app/career/sponsor-offer?careerId=${careerId}`);
        return true;
      }
    } catch (err) {
      console.error('Failed to check sponsor offer:', err);
    }
    
    return false;
  }

  async function loadCareer() {
    setLoading(true);
    const supabase = createClient();

    if (careerId) {
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
      
      setData(homeData);

      // Check if next event is a tournament choice — show popup
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
          .single();
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

      // Check for sponsor offer (tier 3+)
      if (homeData.career.tier >= 3) {
        const hasSponsorOffer = await checkSponsorOffer();
        if (hasSponsorOffer) return; // Redirected to sponsor offer page
      }

      // Email generation is handled client-side below (no server RPC needed)

      // Load active bracket data if current event is an active tournament
      if (homeData.next_event?.bracket_size) {
        const { data: bracketData } = await supabase
          .from('career_brackets')
          .select('bracket_data, current_round, status')
          .eq('event_id', homeData.next_event.id)
          .eq('career_id', careerId)
          .single();
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
        newEmails.push({ id: `win-${tournamentWin.day || day}`, subject: `🏆 ${winTournamentName} — Champion!`, body: `Congratulations! You won ${winTournamentName}. That's a statement performance — keep this form up and bigger stages await.`, type: 'win' });
      }
      if (leagueWin) {
        newEmails.push({ id: `league-win-s${homeData.career.season}`, subject: `🏆 ${leagueWin.title}`, body: leagueWin.description || 'You won the league! Incredible season.', type: 'win' });
      }
      // Sponsor offer email
      const sponsorOfferMilestone = milestones.find((m: any) => m.milestone_type === 'sponsor_offer');
      if (sponsorOfferMilestone) {
        newEmails.push({ 
          id: `sponsor-offer-${sponsorOfferMilestone.day || day}`, 
          subject: `💼 ${sponsorOfferMilestone.title}`, 
          body: `${sponsorOfferMilestone.description} Check your notifications — looks like you have a sponsorship offer!`, 
          type: 'sponsor_offer' 
        });
      }

      if (hasPromotion) {
        const tierNames: Record<number, string> = { 2: 'Pub Leagues', 3: 'County Circuit', 4: 'Pro Tour', 5: 'Premier League' };
        const tierName = tierNames[tier] || `Tier ${tier}`;
        newEmails.push({ id: `promo-${tier}`, subject: `Welcome to the ${tierName}!`, body: `You've earned your place. The ${tierName} is a step up — tougher opponents, higher stakes. Time to prove you belong.`, type: 'promotion' });
      }
      if (tournamentLoss && tier === 1 && !hasPromotion) {
        const nextType = homeData.next_event?.event_type;
        if (nextType === 'training') {
          newEmails.push({ id: `regroup-${day}`, subject: 'Time to Regroup', body: 'The last tournament didn\'t go to plan. Get some practice in — we think you\'ve got what it takes for the pub leagues.', type: 'knockout' });
        } else if (nextType === 'trial_tournament') {
          newEmails.push({ id: `retry-${day}`, subject: 'Here\'s Another Shot! 🎯', body: 'Here is your shot at another tournament after the last one didn\'t go to plan! Good luck!', type: 'knockout' });
        }
      }
      if (tier === 1 && day <= 1 && !tournamentLoss) {
        newEmails.push({ id: 'welcome', subject: 'Welcome, Rookie!', body: 'Good luck in your first tournament! Show them what you\'ve got. Win this and the pub leagues are calling.', type: 'welcome' });
      }
      if (tier >= 2 && !hasPromotion && !tournamentWin) {
        newEmails.push({ id: `league-s${homeData.career.season}`, subject: 'League Update', body: `Season ${homeData.career.season} is underway. Check the league table and keep climbing the standings.`, type: 'league' });
      }

      // Check for pending tournament invites (show all)
      try {
        const { data: inviteEvents } = await supabase
          .from('career_events')
          .select('id, event_name, bracket_size')
          .eq('career_id', careerId)
          .eq('status', 'pending_invite')
          .eq('event_type', 'open')
          .order('sequence_no', { ascending: true });
        if (inviteEvents && inviteEvents.length > 0) {
          // Track all pending invites for dual popup
          setPendingInvites(inviteEvents.map(inv => ({
            event_id: inv.id,
            event_name: inv.event_name,
            bracket_size: inv.bracket_size || 16,
          })));
          // Also set single pendingInvite for backward compat
          setPendingInvite({
            event_id: inviteEvents[0].id,
            event_name: inviteEvents[0].event_name,
            bracket_size: inviteEvents[0].bracket_size || 16,
          });
          for (const inv of inviteEvents) {
            newEmails.unshift({
              id: `tournament-invite-${inv.id}`,
              subject: `🏆 ${inv.event_name} — You're Invited!`,
              body: `You've been invited to the ${inv.event_name}! A ${inv.bracket_size || 16}-player end-of-season knockout tournament at the local. Do you want to enter?`,
              type: 'tournament_invite',
              isNew: true,
            });
          }
        } else {
          setPendingInvites([]);
        }
      } catch (e) { /* ignore */ }
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
      // Tier 5+: show actual Tier 5 opponents as world rankings
      const supabase = createClient();
      const { data: opponents } = await supabase
        .from('career_opponents')
        .select('first_name, last_name, nickname, skill_rating, archetype')
        .eq('career_id', careerId)
        .eq('tier', 5)
        .order('skill_rating', { ascending: false })
        .limit(21);

      if (opponents) {
        setWorldRankings(opponents.map((o: any, i: number) => ({
          rank: i + 1,
          name: `${o.first_name}${o.nickname ? ` '${o.nickname}'` : ''} ${o.last_name}`,
          rating: Math.round(o.skill_rating * 10),
          archetype: o.archetype,
        })));
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
      // Seeded pseudo-random using career ID characters — Fisher-Yates shuffle
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
        // Each player's form fluctuates differently per day — some gain, some drop
        // Accumulate small rating changes over career days for natural drift
        // Each player gets a small shift per day that accumulates
        let ratingShift = 0;
        for (let d = 1; d <= Math.min(careerDay, 50); d++) {
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
        ratingShift = Math.max(-15, Math.min(15, ratingShift));
        return { ...p, rating: Math.max(750, p.baseRating + ratingShift) };
      });
      // Sort by current rating, take top 21
      simulated.sort((a, b) => b.rating - a.rating);
      const top21 = simulated.slice(0, 21);
      setWorldRankings(top21.map((s, i) => ({ rank: i + 1, name: s.name, rating: s.rating, archetype: s.archetype })));
    }
    setShowRankings(true);
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
      const { data: result, error } = await supabase.rpc('rpc_career_advance_to_next_season', {
        p_career_id: careerId,
      });
      if (error) throw error;
      if (result?.promoted) {
        setPromotionTierName(result.tier_name);
        setShowPromotionPopup(true);
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

    // If there's a pending tournament invite, force user to decide before continuing
    if (pendingInvite && data.next_event.event_type === 'league') {
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

      const bracketTypes = ['open', 'qualifier', 'trial_tournament', 'major', 'season_finals'];
      if (bracketTypes.includes(next_event.event_type) && next_event.bracket_size) {
        router.push(`/app/career/bracket?careerId=${careerId}&eventId=${next_event.id}`);
        return;
      }

      // Training event → pick a random training mode and route there
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
          toast.success(`🎉 ${matchData.message}`, { duration: 5000 });
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
      const bestOfMap: Record<number, any> = { 1: 'best-of-1', 3: 'best-of-3', 5: 'best-of-5', 7: 'best-of-7', 9: 'best-of-9', 11: 'best-of-11' };

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
                          <p className="text-sm text-slate-400">Season {save.season} • Week {save.week} • {save.difficulty}</p>
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
  const seasonComplete = playerStanding && (playerStanding.played || 0) >= totalLeagueOpponents;
  const playerRank = seasonComplete && standings ? [...standings].sort((a: any, b: any) => b.points - a.points || (b.legs_diff ?? 0) - (a.legs_diff ?? 0)).findIndex((s: any) => s.is_player) + 1 : 0;
  const willPromote = seasonComplete && playerRank <= 2;
  const displayEventName = (career.tier === 1 && chosenName) ? chosenName
    : next_event?.event_type === 'league' ? `Weekend League Night — Matchday ${leagueMatchday}`
    : next_event?.event_name;
  const displayDay = Math.max(next_event?.day || 0, career.day || 0) || 1;

  // Generate bracket preview slots for visualization
  const bracketSize = next_event?.bracket_size || 0;
  const bracketRounds = bracketSize > 0 ? Math.log2(bracketSize) : 0;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-3 sm:p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-4">

        {/* ═══ TOP BAR: Name + Tier + REP ═══ */}
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
                  <span className="text-slate-600 text-xs">•</span>
                  <span className="text-slate-400 text-xs">
                    {career.tier === 1 ? `Day ${displayDay}` : `S${career.season} W${career.week}`}
                  </span>
                  <span className="text-slate-600 text-xs">•</span>
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
            {career.form !== 0 && (
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${career.form > 0 ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
                <TrendingUp className="w-3 h-3" />
                {career.form > 0 ? '+' : ''}{(career.form * 100).toFixed(0)}%
              </div>
            )}
          </div>
        </div>

        {/* ═══ MAIN GRID: FIFA-style dashboard ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* ─── LEFT COLUMN: Continue + Notifications ─── */}
          <div className="lg:col-span-4 space-y-4">

            {/* CONTINUE / NEXT EVENT — highlighted card */}
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
                        <p className="text-xs text-slate-500 mb-4">{willPromote ? '🎉 Promotion secured!' : 'New season with fresh competition ahead.'}</p>
                      </div>
                      <Button
                        className={`w-full font-black py-3 text-base shadow-lg transition-all hover:scale-[1.01] active:scale-[0.99] ${willPromote ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-emerald-500/20' : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-amber-500/20'} text-white`}
                        disabled={advancingSeason}
                        onClick={async () => {
                          // Check for pending tournament invites first
                          if (pendingInvites.length > 0) {
                            setShowInvitePopup(true);
                            return;
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
                          // No sponsor — advance directly
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
                          {next_event.event_type.replace('_', ' ')}
                        </Badge>
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
                        <p className="text-amber-400/70 text-[10px] mb-3">🎯 Goal: {sponsorOffer.objectives[0]?.description}</p>
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
                                <span className="text-emerald-400 font-bold">✅ Goal Reached! +10 REP</span>
                              ) : (
                                <span className="text-amber-400/70">🎯 Goal: {sp.rep_objectives[0]?.description}</span>
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

            {/* Timeline (moved from center) */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <Card className="border-0 bg-slate-800/40 backdrop-blur-sm ring-1 ring-white/[0.06] shadow-lg">
                <div className="p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-md bg-amber-500/15 flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">Timeline</span>
                  </div>
                  {recent_milestones && recent_milestones.length > 0 ? (
                    <div className="space-y-3">
                      {recent_milestones.map((ms: any, i: number) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="mt-1 shrink-0">
                            <div className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-400/20" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-white text-sm font-semibold">{ms.title}</span>
                              {ms.day && <span className="text-slate-600 text-[10px] font-medium">Day {ms.day}</span>}
                            </div>
                            {ms.description && <p className="text-slate-500 text-xs mt-0.5">{ms.description}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="mt-1 shrink-0">
                        <div className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-400/20" />
                      </div>
                      <div>
                        <span className="text-white text-sm font-semibold">The Journey Begins</span>
                        <p className="text-slate-500 text-xs mt-0.5">Started a new career on {diffInfo.label.toLowerCase()} difficulty.</p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          </div>

          {/* ─── CENTER COLUMN: Tournament Draw (BIGGER) ─── */}
          <div className="lg:col-span-5 space-y-4">

            {/* Tournament Draw / Bracket Preview — LARGE */}
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
                      {[...standings].sort((a: any, b: any) => b.points - a.points || (b.legs_diff ?? 0) - (a.legs_diff ?? 0)).slice(0, 12).map((row: any, i: number) => (
                        <div key={i} className={`flex items-center text-xs px-2 py-2 transition-colors ${row.is_player ? 'bg-amber-500/10 rounded-lg ring-1 ring-amber-500/20' : 'hover:bg-white/[0.02]'} ${i < standings.length - 1 && !row.is_player ? 'border-b border-white/[0.04]' : ''}`}>
                          <span className={`w-5 font-bold ${i < 2 ? 'text-emerald-400' : i >= standings.length - 2 ? 'text-red-400' : 'text-slate-500'}`}>{i + 1}</span>
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
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Relegation</span>
                      </div>
                    </div>
                  ) : next_event ? (
                    <div>
                      <h3 className="text-lg font-black text-white mb-1">{displayEventName}</h3>
                      <p className="text-slate-400 text-sm mb-4 capitalize">{next_event.event_type.replace('_', ' ')}</p>

                      {next_event.bracket_size ? (
                        /* Visual bracket - show real bracket if active, placeholder if not started */
                        <div className="bg-slate-900/60 rounded-xl border border-white/5 p-4 overflow-x-auto">
                          {activeBracket?.matches ? (
                            /* Real bracket data */
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
                          ) : (
                            /* Placeholder bracket - not yet started */
                            <div className="flex items-stretch gap-3 min-w-fit justify-center">
                              {Array.from({ length: bracketRounds }).map((_, roundIdx) => {
                                const matchesInRound = bracketSize / Math.pow(2, roundIdx + 1);
                                const roundLabel = getRoundName(roundIdx + 1, bracketRounds);
                                return (
                                  <div key={roundIdx} className="flex flex-col items-center gap-1 min-w-[100px]">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">{roundLabel}</span>
                                    <div className="flex flex-col gap-2 justify-center flex-1">
                                      {Array.from({ length: matchesInRound }).map((_, matchIdx) => (
                                        <div key={matchIdx} className="border border-white/[0.08] rounded-lg overflow-hidden bg-slate-800/50">
                                          <div className="px-2.5 py-1.5 border-b border-white/[0.04] flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                            <span className="text-[10px] text-slate-500 font-medium truncate">TBD</span>
                                          </div>
                                          <div className="px-2.5 py-1.5 flex items-center gap-1.5">
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                            <span className="text-[10px] text-slate-500 font-medium truncate">TBD</span>
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
                          )}
                        </div>
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
                                    .map(e => e.id === email.id ? { ...e, type: 'tournament_accepted', body: `You accepted the invitation to ${email.subject.replace('🏆 ', '').replace(' — You\'re Invited!', '')}. Good luck! 🎯` } : e)
                                  );
                                  setPendingInvites([]);
                                  setPendingInvite(null);
                                  loadCareer();
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
                                    e.id === email.id ? { ...e, type: 'tournament_declined', body: `You declined the invitation. Focus on the league! 💪` } : e
                                  ));
                                  // Update pending invites list
                                  setPendingInvites(prev => prev.filter(inv => inv.event_id !== eventId));
                                  loadCareer();
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

          {/* ─── RIGHT COLUMN: World Rankings (always) ─── */}
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
                    <p className="text-slate-400 text-xs font-medium">Top 21 World Players</p>
                    <Button variant="ghost" size="sm" className="text-blue-400 text-xs mt-2 hover:text-blue-300" onClick={loadWorldRankings}>
                      Preview World Rankings
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>

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
                    const awards = (data.awards || []).filter((a: any) => a.milestone_type !== 'first_tournament_win');
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
                                {award.count > 1 && <Badge className="bg-amber-500/20 text-amber-400 text-[9px] px-1 py-0 border-0">×{award.count}</Badge>}
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
                      <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">League Stats</span>
                    </div>
                  </div>
                  {(() => {
                    const p = playerStanding;
                    const played = p?.played || 0;
                    const won = p?.won || 0;
                    const lost = p?.lost || 0;
                    const avg = p?.average || career.form || 0;
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
                          View All Time Stats →
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
                        const { data: res, error } = await supabase.rpc('rpc_career_respond_tournament_invite', {
                          p_career_id: careerId,
                          p_event_id: invite.event_id,
                          p_accept: true,
                        });
                        if (!error) {
                          toast.success(res?.message || 'Tournament accepted!');
                          // Clear all invites (accept auto-declines the other on backend)
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
                        const { data: res, error } = await supabase.rpc('rpc_career_respond_tournament_invite', {
                          p_career_id: careerId,
                          p_event_id: invite.event_id,
                          p_accept: false,
                        });
                        if (!error) {
                          toast.success(res?.message || 'Tournament declined.');
                          deleteEmail(`tournament-invite-${invite.event_id}`);
                          // Remove this invite from the list
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
                <div className="text-4xl mb-3">💼</div>
                <h2 className="text-xl font-bold text-white mb-1">Season End — Sponsor Decision</h2>
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
                      <span className="text-xs text-purple-400 font-bold uppercase">🔄 Renew</span>
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
                      <span className="text-xs text-blue-400 font-bold uppercase">🔀 Switch to</span>
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
                  Drop sponsor — go independent →
                </button>
              </div>
            </Card>
          </motion.div>
        </div>
      )}

      {/* Tournament Choice Popup (Tier 3+) */}
      {showTournamentChoicePopup && tournamentOptions && tournamentChoiceEvent && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="relative max-w-lg w-full mx-4"
          >
            <Card className="border-0 bg-gradient-to-b from-slate-800 to-slate-900 ring-1 ring-amber-500/30 shadow-2xl overflow-hidden">
              <div className="p-6 text-center">
                <div className="text-4xl mb-3">🏆</div>
                <h2 className="text-xl font-bold text-white mb-1">Tournament Invitation</h2>
                <p className="text-slate-400 text-sm mb-5">Choose a tournament to enter, or skip and continue with the league.</p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {/* Option 1 */}
                  <Button
                    disabled={choosingTournament}
                    className="p-4 h-auto rounded-xl bg-gradient-to-b from-emerald-500/10 to-emerald-500/5 ring-1 ring-emerald-500/20 hover:ring-emerald-500/40 hover:bg-emerald-500/15 transition-all text-left flex flex-col items-start"
                    variant="ghost"
                    onClick={async () => {
                      setChoosingTournament(true);
                      const supabase = createClient();
                      const { data: res, error } = await supabase.rpc('rpc_career_tournament_choice', {
                        p_career_id: careerId,
                        p_event_id: tournamentChoiceEvent.id,
                        p_tournament_choice: 1 as any,
                      });
                      if (error) { toast.error(error.message || 'Failed'); setChoosingTournament(false); return; }
                      if (res?.error) { toast.error(res.error); setChoosingTournament(false); return; }
                      toast.success(res?.message || 'Tournament entered!');
                      setShowTournamentChoicePopup(false);
                      setChoosingTournament(false);
                      loadCareer();
                    }}
                  >
                    <div className="text-amber-400 text-lg font-bold mb-1">{tournamentOptions.option1.name}</div>
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                      <span>👥 {tournamentOptions.option1.bracket_size} players</span>
                      <span>•</span>
                      <span>{tournamentOptions.option1.format}</span>
                    </div>
                  </Button>

                  {/* Option 2 */}
                  <Button
                    disabled={choosingTournament}
                    className="p-4 h-auto rounded-xl bg-gradient-to-b from-blue-500/10 to-blue-500/5 ring-1 ring-blue-500/20 hover:ring-blue-500/40 hover:bg-blue-500/15 transition-all text-left flex flex-col items-start"
                    variant="ghost"
                    onClick={async () => {
                      setChoosingTournament(true);
                      const supabase = createClient();
                      const { data: res, error } = await supabase.rpc('rpc_career_tournament_choice', {
                        p_career_id: careerId,
                        p_event_id: tournamentChoiceEvent.id,
                        p_tournament_choice: 2 as any,
                      });
                      if (error) { toast.error(error.message || 'Failed'); setChoosingTournament(false); return; }
                      if (res?.error) { toast.error(res.error); setChoosingTournament(false); return; }
                      toast.success(res?.message || 'Tournament entered!');
                      setShowTournamentChoicePopup(false);
                      setChoosingTournament(false);
                      loadCareer();
                    }}
                  >
                    <div className="text-blue-400 text-lg font-bold mb-1">{tournamentOptions.option2.name}</div>
                    <div className="flex items-center gap-2 text-slate-400 text-xs">
                      <span>👥 {tournamentOptions.option2.bracket_size} players</span>
                      <span>•</span>
                      <span>{tournamentOptions.option2.format}</span>
                    </div>
                  </Button>
                </div>

                {/* Decline both */}
                <Button
                  variant="ghost"
                  disabled={choosingTournament}
                  className="w-full text-slate-500 hover:text-slate-300 text-sm"
                  onClick={async () => {
                    setChoosingTournament(true);
                    const supabase = createClient();
                    const { data: res, error } = await supabase.rpc('rpc_career_tournament_choice', {
                      p_career_id: careerId,
                      p_event_id: tournamentChoiceEvent.id,
                      p_tournament_choice: 0 as any,
                    });
                    if (error) { toast.error(error.message || 'Failed'); setChoosingTournament(false); return; }
                    if (res?.error) { toast.error(res.error); setChoosingTournament(false); return; }
                    toast.success('Carrying on with the league.');
                    setShowTournamentChoicePopup(false);
                    setChoosingTournament(false);
                    loadCareer();
                  }}
                >
                  Decline both — continue with league →
                </Button>
              </div>
            </Card>
          </motion.div>
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
                    onClick={() => {
                      setShowPromotionPopup(false);
                      loadCareer();
                    }}
                  >
                    Let&apos;s Go! 🎯
                  </Button>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
