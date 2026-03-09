'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, Target, BarChart3, TrendingUp, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

interface SeasonStats {
  season: number;
  tier: number;
  played: number;
  won: number;
  lost: number;
  legs_for: number;
  legs_against: number;
  points: number;
  average: number;
  tournament_wins: number;
  tournament_played: number;
}

interface AllTimeStats {
  total_played: number;
  total_won: number;
  total_lost: number;
  total_legs_for: number;
  total_legs_against: number;
  win_rate: number;
  best_average: number;
  overall_average: number;
  tournament_wins: number;
  seasons_played: number;
  highest_tier: number;
  seasons: SeasonStats[];
}

const TIER_NAMES: Record<number, string> = {
  1: 'Local Circuit Trials',
  2: 'Pub Leagues',
  3: 'County Circuit',
  4: 'Regional Tour',
  5: 'World Tour',
};

export default function CareerStatsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const careerId = searchParams.get('id');
  const [stats, setStats] = useState<AllTimeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!careerId) return;
    loadStats();
  }, [careerId]);

  async function loadStats() {
    setLoading(true);
    const supabase = createClient();

    // Get career profile
    const { data: career } = await supabase
      .from('career_profiles')
      .select('id, tier, season')
      .eq('id', careerId)
      .single();

    if (!career) { setLoading(false); return; }

    // Get league standings per season (Tier 2+)
    const { data: standings } = await supabase
      .from('career_league_standings')
      .select('season, tier, played, won, lost, legs_for, legs_against, points, average')
      .eq('career_id', careerId)
      .eq('is_player', true)
      .order('season', { ascending: true });

    // Get ALL career matches (includes Tier 1 tournaments + league matches)
    const { data: allMatches } = await supabase
      .from('career_matches')
      .select('id, event_id, result, player_legs, opponent_legs')
      .eq('career_id', careerId)
      .in('result', ['win', 'loss']);

    // Get all career events to map matches to seasons/types
    const { data: allEvents } = await supabase
      .from('career_events')
      .select('id, season, tier, event_type, event_name, status')
      .eq('career_id', careerId);

    // Get tournament wins from milestones (only tournament_win, not first_tournament_win to avoid double-counting)
    const { data: tWins } = await supabase
      .from('career_milestones')
      .select('season, title')
      .eq('career_id', careerId)
      .eq('milestone_type', 'tournament_win');

    // Build event lookup
    const eventMap: Record<string, any> = {};
    for (const e of (allEvents || [])) {
      eventMap[e.id] = e;
    }

    // Build per-season stats
    const seasonMap: Record<number, SeasonStats> = {};

    // Start with league standings for Tier 2+
    for (const s of (standings || [])) {
      seasonMap[s.season] = {
        season: s.season,
        tier: s.tier,
        played: s.played || 0,
        won: s.won || 0,
        lost: s.lost || 0,
        legs_for: s.legs_for || 0,
        legs_against: s.legs_against || 0,
        points: s.points || 0,
        average: s.average || 0,
        tournament_wins: 0,
        tournament_played: 0,
      };
    }

    // Add tournament/trial matches from career_matches (covers Tier 1 + all tournaments)
    for (const m of (allMatches || [])) {
      const evt = eventMap[m.event_id];
      if (!evt) continue;
      const season = evt.season || 1;
      const isLeague = evt.event_type === 'league';
      
      // Skip league matches — already counted in standings
      if (isLeague && seasonMap[season]) continue;

      if (!seasonMap[season]) {
        seasonMap[season] = {
          season, tier: evt.tier || 1, played: 0, won: 0, lost: 0,
          legs_for: 0, legs_against: 0, points: 0, average: 0,
          tournament_wins: 0, tournament_played: 0,
        };
      }

      // Only count non-league matches here (tournaments)
      if (!isLeague) {
        seasonMap[season].played++;
        seasonMap[season].tournament_played++;
        if (m.result === 'win') seasonMap[season].won++;
        if (m.result === 'loss') seasonMap[season].lost++;
        seasonMap[season].legs_for += m.player_legs || 0;
        seasonMap[season].legs_against += m.opponent_legs || 0;
      }
    }

    // Count tournament wins
    for (const tw of (tWins || [])) {
      const s = tw.season || 1;
      if (seasonMap[s]) seasonMap[s].tournament_wins++;
    }

    const seasons = Object.values(seasonMap).sort((a, b) => a.season - b.season);

    // Compute all-time totals
    const totalPlayed = seasons.reduce((sum, s) => sum + s.played, 0);
    const totalWon = seasons.reduce((sum, s) => sum + s.won, 0);
    const totalLost = seasons.reduce((sum, s) => sum + s.lost, 0);
    const totalLegsFor = seasons.reduce((sum, s) => sum + s.legs_for, 0);
    const totalLegsAgainst = seasons.reduce((sum, s) => sum + s.legs_against, 0);
    const tournamentWins = seasons.reduce((sum, s) => sum + s.tournament_wins, 0);
    const bestAvg = seasons.length > 0 ? Math.max(...seasons.map(s => s.average)) : 0;
    const overallAvg = seasons.length > 0 ? seasons.reduce((sum, s) => sum + s.average, 0) / seasons.length : 0;

    setStats({
      total_played: totalPlayed,
      total_won: totalWon,
      total_lost: totalLost,
      total_legs_for: totalLegsFor,
      total_legs_against: totalLegsAgainst,
      win_rate: totalPlayed > 0 ? (totalWon / totalPlayed) * 100 : 0,
      best_average: bestAvg,
      overall_average: overallAvg,
      tournament_wins: tournamentWins,
      seasons_played: seasons.length,
      highest_tier: career.tier,
      seasons,
    });
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <p className="text-slate-400">No stats found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-400" /> Career Statistics
            </h1>
            <p className="text-slate-500 text-xs">All time performance breakdown</p>
          </div>
        </motion.div>

        {/* All Time Overview */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-0 bg-slate-800/40 backdrop-blur-sm ring-1 ring-white/[0.06] shadow-lg mb-4">
            <div className="p-5">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> All Time
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                <div className="text-center p-3 rounded-lg bg-white/[0.03]">
                  <p className="text-white text-lg font-bold">{stats.total_played}</p>
                  <p className="text-slate-500 text-[10px]">Played</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-emerald-500/[0.06]">
                  <p className="text-emerald-400 text-lg font-bold">{stats.total_won}</p>
                  <p className="text-slate-500 text-[10px]">Won</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-500/[0.06]">
                  <p className="text-red-400 text-lg font-bold">{stats.total_lost}</p>
                  <p className="text-slate-500 text-[10px]">Lost</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-blue-500/[0.06]">
                  <p className="text-blue-400 text-lg font-bold">{stats.win_rate.toFixed(0)}%</p>
                  <p className="text-slate-500 text-[10px]">Win Rate</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-amber-500/[0.06]">
                  <p className="text-amber-400 text-lg font-bold">{stats.overall_average.toFixed(1)}</p>
                  <p className="text-slate-500 text-[10px]">Avg</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-purple-500/[0.06]">
                  <p className="text-purple-400 text-lg font-bold">{stats.tournament_wins}</p>
                  <p className="text-slate-500 text-[10px]">Trophies</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="text-center p-2 rounded-lg bg-white/[0.02]">
                  <p className="text-slate-300 text-sm font-semibold">{stats.total_legs_for}</p>
                  <p className="text-slate-600 text-[10px]">Legs Won</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-white/[0.02]">
                  <p className="text-slate-300 text-sm font-semibold">{stats.total_legs_against}</p>
                  <p className="text-slate-600 text-[10px]">Legs Lost</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-white/[0.02]">
                  <p className="text-slate-300 text-sm font-semibold">{TIER_NAMES[stats.highest_tier] || `Tier ${stats.highest_tier}`}</p>
                  <p className="text-slate-600 text-[10px]">Current Tier</p>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Season Breakdown */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h2 className="text-sm font-bold text-white uppercase tracking-widest mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" /> Season Breakdown
          </h2>
          <div className="space-y-3">
            {stats.seasons.map((season, i) => (
              <motion.div key={season.season} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.05 }}>
                <Card className="border-0 bg-slate-800/40 backdrop-blur-sm ring-1 ring-white/[0.06] shadow-lg">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <span className="text-white text-sm font-bold">Season {season.season}</span>
                        <span className="text-slate-500 text-xs ml-2">{TIER_NAMES[season.tier] || `Tier ${season.tier}`}</span>
                      </div>
                      {season.tournament_wins > 0 && (
                        <div className="flex items-center gap-1 text-amber-400">
                          <Trophy className="w-3.5 h-3.5" />
                          <span className="text-xs font-bold">×{season.tournament_wins}</span>
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      <div className="text-center p-2 rounded-lg bg-white/[0.03]">
                        <p className="text-white text-sm font-bold">{season.played}</p>
                        <p className="text-slate-500 text-[9px]">P</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-emerald-500/[0.05]">
                        <p className="text-emerald-400 text-sm font-bold">{season.won}</p>
                        <p className="text-slate-500 text-[9px]">W</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-red-500/[0.05]">
                        <p className="text-red-400 text-sm font-bold">{season.lost}</p>
                        <p className="text-slate-500 text-[9px]">L</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-amber-500/[0.05]">
                        <p className="text-amber-400 text-sm font-bold">{season.average > 0 ? season.average.toFixed(1) : '-'}</p>
                        <p className="text-slate-500 text-[9px]">Avg</p>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-blue-500/[0.05]">
                        <p className="text-blue-400 text-sm font-bold">{season.legs_for - season.legs_against > 0 ? '+' : ''}{season.legs_for - season.legs_against}</p>
                        <p className="text-slate-500 text-[9px]">LD</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
            {stats.seasons.length === 0 && (
              <Card className="border-0 bg-slate-800/40 backdrop-blur-sm ring-1 ring-white/[0.06] shadow-lg p-6 text-center">
                <Target className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No season data yet</p>
                <p className="text-slate-600 text-xs">Complete league matches to see your stats here</p>
              </Card>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
