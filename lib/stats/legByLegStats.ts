import { createClient } from '@/lib/supabase/client';

export interface LegStats {
  legNumber: number;
  playerStats: {
    visits: number;
    average: number;
    darts: number;
    highestVisit: number;
    visits100Plus: number;
    visits140Plus: number;
    visits180: number;
    checkout: number | null;
    won: boolean;
  };
  opponentStats: {
    visits: number;
    average: number;
    darts: number;
    highestVisit: number;
    visits100Plus: number;
    visits140Plus: number;
    visits180: number;
    checkout: number | null;
    won: boolean;
  };
}

interface QuickMatchVisit {
  id: string;
  room_id: string;
  player_id: string;
  leg: number;
  turn_no: number;
  score: number;
  remaining_before: number;
  remaining_after: number;
  darts: any; // JSON array of dart objects
  darts_thrown: number;
  darts_at_double: number;
  is_bust: boolean;
  is_checkout: boolean;
  created_at: string;
}

export async function calculateLegByLegStats(
  roomId: string, 
  playerId: string, 
  opponentId: string
): Promise<LegStats[]> {
  const supabase = createClient();

  // Get all visits for this match
  const { data: visits, error } = await supabase
    .from('quick_match_visits')
    .select('*')
    .eq('room_id', roomId)
    .order('leg', { ascending: true })
    .order('turn_no', { ascending: true });

  if (error) {
    console.error('Failed to fetch match visits:', error);
    return [];
  }

  if (!visits || visits.length === 0) {
    return [];
  }

  // Group visits by leg
  const visitsByLeg = visits.reduce((acc, visit) => {
    const legNum = visit.leg || 1;
    if (!acc[legNum]) {
      acc[legNum] = [];
    }
    acc[legNum].push(visit);
    return acc;
  }, {} as Record<number, QuickMatchVisit[]>);

  // Calculate stats for each leg
  const legStats: LegStats[] = [];

  for (const [legNumber, legVisits] of Object.entries(visitsByLeg)) {
    const legNum = parseInt(legNumber);
    const typedLegVisits = legVisits as QuickMatchVisit[];

    const playerVisits = typedLegVisits.filter(v => v.player_id === playerId);
    const opponentVisits = typedLegVisits.filter(v => v.player_id === opponentId);

    const playerStats = calculatePlayerLegStats(playerVisits);
    const opponentStats = calculatePlayerLegStats(opponentVisits);

    legStats.push({
      legNumber: legNum,
      playerStats,
      opponentStats
    });
  }

  return legStats.sort((a, b) => a.legNumber - b.legNumber);
}

function calculatePlayerLegStats(visits: QuickMatchVisit[]) {
  if (visits.length === 0) {
    return {
      visits: 0,
      average: 0,
      darts: 0,
      highestVisit: 0,
      visits100Plus: 0,
      visits140Plus: 0,
      visits180: 0,
      checkout: null,
      won: false
    };
  }

  let totalScore = 0;
  let totalDarts = 0;
  let highestVisit = 0;
  let visits100Plus = 0;
  let visits140Plus = 0;
  let visits180 = 0;
  let checkout: number | null = null;
  let won = false;

  for (const visit of visits) {
    if (!visit.is_bust) {
      totalScore += visit.score;
      totalDarts += visit.darts_thrown;
      
      if (visit.score > highestVisit) {
        highestVisit = visit.score;
      }

      if (visit.score >= 100) visits100Plus++;
      if (visit.score >= 140) visits140Plus++;
      if (visit.score >= 180) visits180++;

      if (visit.is_checkout) {
        checkout = visit.score;
        won = true;
      }
    } else {
      // Bust visits still count for dart totals
      totalDarts += visit.darts_thrown;
    }
  }

  const average = totalDarts > 0 ? (totalScore / totalDarts) * 3 : 0;

  return {
    visits: visits.length,
    average,
    darts: totalDarts,
    highestVisit,
    visits100Plus,
    visits140Plus,
    visits180,
    checkout,
    won
  };
}

// For dartbot matches, calculate leg stats from stored dartbot data
export async function calculateDartbotLegByLegStats(
  gameMode: number,
  allLegs: any[], // The dartbot leg data structure
  currentLeg: any
): Promise<LegStats[]> {
  const legStats: LegStats[] = [];

  // Process completed legs
  for (let i = 0; i < allLegs.length; i++) {
    const leg = allLegs[i];
    
    const playerStats = calculateDartbotPlayerLegStats(leg.visits.filter((v: any) => v.player === 'player1'));
    const opponentStats = calculateDartbotPlayerLegStats(leg.visits.filter((v: any) => v.player === 'player2'));

    legStats.push({
      legNumber: i + 1,
      playerStats,
      opponentStats
    });
  }

  // Process current leg if it has visits
  if (currentLeg && currentLeg.visits.length > 0) {
    const playerStats = calculateDartbotPlayerLegStats(currentLeg.visits.filter((v: any) => v.player === 'player1'));
    const opponentStats = calculateDartbotPlayerLegStats(currentLeg.visits.filter((v: any) => v.player === 'player2'));

    legStats.push({
      legNumber: currentLeg.legNumber,
      playerStats,
      opponentStats
    });
  }

  return legStats;
}

function calculateDartbotPlayerLegStats(visits: any[]) {
  if (visits.length === 0) {
    return {
      visits: 0,
      average: 0,
      darts: 0,
      highestVisit: 0,
      visits100Plus: 0,
      visits140Plus: 0,
      visits180: 0,
      checkout: null,
      won: false
    };
  }

  let totalScore = 0;
  let totalDarts = 0;
  let highestVisit = 0;
  let visits100Plus = 0;
  let visits140Plus = 0;
  let visits180 = 0;
  let checkout: number | null = null;
  let won = false;

  for (const visit of visits) {
    if (!visit.isBust) {
      totalScore += visit.score;
      totalDarts += visit.dartsThrown;
      
      if (visit.score > highestVisit) {
        highestVisit = visit.score;
      }

      if (visit.score >= 100) visits100Plus++;
      if (visit.score >= 140) visits140Plus++;
      if (visit.score >= 180) visits180++;

      if (visit.isCheckout) {
        checkout = visit.score;
        won = true;
      }
    } else {
      // Bust visits still count for dart totals
      totalDarts += visit.dartsThrown;
    }
  }

  const average = totalDarts > 0 ? (totalScore / totalDarts) * 3 : 0;

  return {
    visits: visits.length,
    average,
    darts: totalDarts,
    highestVisit,
    visits100Plus,
    visits140Plus,
    visits180,
    checkout,
    won
  };
}