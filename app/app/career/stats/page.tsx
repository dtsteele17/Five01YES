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
  tierName: string;
  played: number;
  won: number;
  lost: number;
  legs_for: number;
  legs_against: number;
  average: number;
  tournament_wins: number;
  league_position?: number;
  league_total?: number;
  ranking_finish?: number;
}

interface AllTimeStats {
  total_played: number;
  total_won: number;
  total_lost: number;
  total_legs_for: number;
  total_legs_against: number;
  win_rate: number;
  overall_average: number;
  tournament_wins: number;
  highest_tier: number;
  current_ranking: number | null;
  seasons: SeasonStats[];
}

const TIER_NAMES: Record<number, string> = {
  1: 'Local Circuit Trials',
  2: 'Pub Leagues',
  3: 'County Circuit',
  4: 'National Tour',
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

    // Get ALL career matches with their events — single source of truth
    const { data: matches } = await supabase
      .from('career_matches')
      .select('id, event_id, result, player_legs_won, opponent_legs_won, player_average')
      .eq('career_id', careerId)
      .in('result', ['win', 'loss']);

    // Get all career events
    const { data: events } = await supabase
      .from('career_events')
      .select('id, season, event_type, event_name')
      .eq('career_id', careerId);

    // Get tier per season from career_league_standings (most reliable source)
    const { data: standingsTiers } = await supabase
      .from('career_league_standings')
      .select('season, tier')
      .eq('career_id', careerId)
      .eq('is_player', true);
    
    const seasonTierFromStandings: Record<number, number> = {};
    for (const st of (standingsTiers || [])) {
      seasonTierFromStandings[st.season] = st.tier;
    }
    // Season 1 is always Tier 1 (Local Circuit Trials)
    if (!seasonTierFromStandings[1]) seasonTierFromStandings[1] = 1;

    // Get player's league position per season
    const leaguePositions: Record<number, { position: number; total: number }> = {};
    for (const season of Object.keys(seasonTierFromStandings).map(Number)) {
      const { data: allStandings } = await supabase
        .from('career_league_standings')
        .select('is_player, points, legs_for, legs_against')
        .eq('career_id', careerId)
        .eq('season', season)
        .order('points', { ascending: false });
      if (allStandings && allStandings.length > 1) {
        const sorted = allStandings.sort((a: any, b: any) => {
          if (b.points !== a.points) return b.points - a.points;
          return (b.legs_for - b.legs_against) - (a.legs_for - a.legs_against);
        });
        const pos = sorted.findIndex((s: any) => s.is_player) + 1;
        leaguePositions[season] = { position: pos, total: sorted.length };
      }
    }

    // Get Pro Tour season end rankings from milestones
    const { data: rankMilestones } = await supabase
      .from('career_milestones')
      .select('season, title')
      .eq('career_id', careerId)
      .eq('milestone_type', 'season_ranking');
    const seasonRankings: Record<number, number> = {};
    for (const rm of (rankMilestones || [])) {
      const match = rm.title?.match(/#(\d+)/);
      if (match) seasonRankings[rm.season] = parseInt(match[1]);
    }

    // Get tournament wins from milestones
    const { data: tWins } = await supabase
      .from('career_milestones')
      .select('season')
      .eq('career_id', careerId)
      .in('milestone_type', ['tournament_win', 'league_champion']);

    // Build event lookup
    const eventMap: Record<string, any> = {};
    for (const e of (events || [])) {
      eventMap[e.id] = e;
    }

    // Use standings-based tier lookup, enriched with Pro Tour event types
    const seasonTiersFromEvents: Record<number, number> = {};
    for (const e of (events || [])) {
      if (e.event_type?.startsWith('pro_') || e.event_type?.startsWith('champions_series')) {
        seasonTiersFromEvents[e.season] = 5;
      }
    }
    const seasonTiers = { ...seasonTiersFromEvents, ...seasonTierFromStandings };

    const seasonMap: Record<number, SeasonStats> = {};

    for (const m of (matches || [])) {
      const evt = eventMap[m.event_id];
      const season = evt?.season || 1;
      const tier = seasonTiers[season] || career?.tier || 1;

      if (!seasonMap[season]) {
        seasonMap[season] = {
          season,
          tier,
          tierName: TIER_NAMES[tier] || `Tier ${tier}`,
          played: 0,
          won: 0,
          lost: 0,
          legs_for: 0,
          legs_against: 0,
          average: 0,
          tournament_wins: 0,
          league_position: leaguePositions[season]?.position,
          league_total: leaguePositions[season]?.total,
          ranking_finish: seasonRankings[season],
        };
      }

      const s = seasonMap[season];
      s.played++;
      if (m.result === 'win') s.won++;
      if (m.result === 'loss') s.lost++;
      s.legs_for += m.player_legs_won || 0;
      s.legs_against += m.opponent_legs_won || 0;

      // Running average
      if (m.player_average && m.player_average > 0) {
        const prevCount = s.played - 1;
        s.average = prevCount > 0
          ? ((s.average * prevCount) + m.player_average) / s.played
          : m.player_average;
      }
    }

    // Count tournament wins per season
    for (const tw of (tWins || [])) {
      const s = tw.season || 1;
      if (seasonMap[s]) seasonMap[s].tournament_wins++;
    }

    const seasons = Object.values(seasonMap).sort((a, b) => a.season - b.season);

    // All-time totals
    const totalPlayed = seasons.reduce((sum, s) => sum + s.played, 0);
    const totalWon = seasons.reduce((sum, s) => sum + s.won, 0);
    const totalLost = seasons.reduce((sum, s) => sum + s.lost, 0);
    const totalLegsFor = seasons.reduce((sum, s) => sum + s.legs_for, 0);
    const totalLegsAgainst = seasons.reduce((sum, s) => sum + s.legs_against, 0);
    const tournamentWins = seasons.reduce((sum, s) => sum + s.tournament_wins, 0);

    // Weighted average across all matches
    const totalAvgSum = (matches || []).reduce((sum, m) => sum + (m.player_average || 0), 0);
    const matchesWithAvg = (matches || []).filter(m => m.player_average && m.player_average > 0).length;
    const overallAvg = matchesWithAvg > 0 ? totalAvgSum / matchesWithAvg : 0;

    // Get current world ranking (if on Pro Tour)
    let currentRanking: number | null = null;
    if (career.tier >= 5) {
      const { data: rankData } = await supabase
        .from('career_pro_rankings')
        .select('ranking_position')
        .eq('career_id', careerId)
        .eq('is_player', true)
        .maybeSingle();
      if (rankData) currentRanking = rankData.ranking_position;
    }

    setStats({
      total_played: totalPlayed,
      total_won: totalWon,
      total_lost: totalLost,
      total_legs_for: totalLegsFor,
      total_legs_against: totalLegsAgainst,
      win_rate: totalPlayed > 0 ? (totalWon / totalPlayed) * 100 : 0,
      overall_average: overallAvg,
      tournament_wins: tournamentWins,
      highest_tier: career.tier,
      current_ranking: currentRanking,
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
                {stats.current_ranking && (
                  <div className="text-center p-2 rounded-lg bg-gradient-to-b from-amber-500/10 to-transparent border border-amber-500/20">
                    <p className="text-amber-400 text-sm font-bold">#{stats.current_ranking}</p>
                    <p className="text-amber-400/60 text-[10px]">World Ranking</p>
                  </div>
                )}
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
                        <span className="text-slate-500 text-xs ml-2">{season.tierName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {season.ranking_finish && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
                            #{season.ranking_finish} World
                          </span>
                        )}
                        {season.league_position && season.league_total && season.tier >= 2 && season.tier < 5 && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            season.league_position <= 2 ? 'bg-emerald-500/20 text-emerald-400' :
                            season.league_position > season.league_total - 2 ? 'bg-red-500/20 text-red-400' :
                            'bg-slate-700/50 text-slate-300'
                          }`}>
                            {season.league_position}{season.league_position === 1 ? 'st' : season.league_position === 2 ? 'nd' : season.league_position === 3 ? 'rd' : 'th'}/{season.league_total}
                          </span>
                        )}
                        {season.tournament_wins > 0 && (
                          <div className="flex items-center gap-1 text-amber-400">
                            <Trophy className="w-3.5 h-3.5" />
                            <span className="text-xs font-bold">×{season.tournament_wins}</span>
                          </div>
                        )}
                      </div>
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
