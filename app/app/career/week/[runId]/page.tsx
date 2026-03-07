'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTraining } from '@/lib/context/TrainingContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Trophy, Users, Play, CheckCircle, RefreshCw, Swords, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface Fixture {
  id: string;
  home_team: string;
  away_team: string;
  home_score?: number;
  away_score?: number;
  status: 'pending' | 'completed';
  is_player_match: boolean;
  event_id?: string;
  match_id?: string;
}

interface WeekData {
  week: number;
  tier: number;
  season: number;
  event_name: string;
  fixtures: Fixture[];
}

const TIER_NAMES: Record<number, string> = {
  2: 'Pub Leagues',
  3: 'County Circuit',
  4: 'Regional Tour',
  5: 'World Tour',
};

export default function WeekFixtures() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { setConfig } = useTraining();
  
  const runId = params.runId as string;
  const careerId = searchParams.get('careerId') || runId;

  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [playingMatch, setPlayingMatch] = useState(false);

  useEffect(() => {
    if (careerId) {
      loadWeekFixtures();
    }
  }, [careerId]);

  async function loadWeekFixtures() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('rpc_get_week_fixtures_with_match_lock', {
        p_career_id: careerId
      });
      if (error) throw error;
      
      // Fix simulated scores to respect best-of format
      if (data?.fixtures) {
        const bestOf = data.tier === 3 ? 5 : data.tier === 4 ? 7 : data.tier === 5 ? 9 : 3;
        const legsToWin = Math.ceil(bestOf / 2);
        
        data.fixtures = data.fixtures.map((f: Fixture) => {
          if (!f.is_player_match && f.status === 'completed') {
            // Generate realistic best-of scores
            const winnerLegs = legsToWin;
            const loserLegs = Math.floor(Math.random() * legsToWin);
            const homeWins = Math.random() < 0.5;
            return {
              ...f,
              home_score: homeWins ? winnerLegs : loserLegs,
              away_score: homeWins ? loserLegs : winnerLegs,
            };
          }
          return f;
        });
      }
      
      setWeekData(data);
    } catch (err: any) {
      toast.error('Failed to load fixtures');
    } finally {
      setLoading(false);
    }
  }

  async function handlePlayMatch() {
    if (!careerId || !weekData || playingMatch) return;
    setPlayingMatch(true);
    try {
      const playerFixture = weekData.fixtures.find(f => f.is_player_match);
      if (!playerFixture || playerFixture.status === 'completed') {
        toast.error('No match to play');
        return;
      }

      const supabase = createClient();
      const { data: matchData, error } = await supabase.rpc('rpc_career_play_next_event_locked_fixed', {
        p_career_id: careerId
      });
      if (error) throw error;
      if (matchData?.error) {
        toast.error(matchData.error);
        return;
      }

      const avg = Math.max(20, Math.min(100, Math.round(matchData.bot_average || 50)));
      const diffKey = avg <= 30 ? 'novice' : avg <= 40 ? 'beginner' : avg <= 50 ? 'casual'
        : avg <= 60 ? 'intermediate' : avg <= 70 ? 'advanced' : avg <= 80 ? 'elite'
        : avg <= 90 ? 'pro' : 'worldClass';
      const bestOfMap: Record<number, any> = { 1: 'best-of-1', 3: 'best-of-3', 5: 'best-of-5', 7: 'best-of-7', 9: 'best-of-9', 11: 'best-of-11' };

      const opponentName = playerFixture.away_team;
      
      // Store return context so post-match navigates back to week fixtures
      sessionStorage.setItem('career_fixtures_return', JSON.stringify({
        careerId,
        route: `/app/career/week/${runId}?careerId=${careerId}`,
      }));

      setConfig({
        mode: '501',
        botDifficulty: diffKey as any,
        botAverage: avg,
        doubleOut: true,
        bestOf: bestOfMap[matchData.event?.format_legs] || (weekData.tier === 3 ? 'best-of-5' : 'best-of-3'),
        atcOpponent: 'bot',
        career: {
          careerId,
          eventId: matchData.event?.id,
          eventName: matchData.event?.name || `${TIER_NAMES[weekData.tier] || 'League'} Match`,
          matchId: matchData.match_id,
          opponentId: matchData.opponent?.id,
          opponentName: opponentName,
          returnToFixtures: true,
        },
      });
      
      toast.success(`Starting match vs ${opponentName}`);
      router.push('/app/play/training/501');
    } catch (err: any) {
      toast.error(err.message || 'Failed to start match');
    } finally {
      setPlayingMatch(false);
    }
  }

  function handleBackToCareer() {
    router.push(`/app/career?id=${careerId}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-slate-400 text-sm">Loading fixtures...</p>
        </motion.div>
      </div>
    );
  }

  if (!weekData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-4">No fixtures found</h2>
          <Button variant="ghost" onClick={() => router.back()} className="text-slate-300">
            <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
          </Button>
        </div>
      </div>
    );
  }

  const playerFixture = weekData.fixtures.find(f => f.is_player_match);
  const otherFixtures = weekData.fixtures.filter(f => !f.is_player_match);
  const playerCompleted = playerFixture?.status === 'completed';
  const playerWon = playerCompleted && (playerFixture?.home_score || 0) > (playerFixture?.away_score || 0);
  const tierName = TIER_NAMES[weekData.tier] || `Tier ${weekData.tier}`;
  const bestOf = weekData.tier === 3 ? 5 : weekData.tier === 4 ? 7 : weekData.tier === 5 ? 9 : 3;

  // Extract matchday number from event name
  const matchdayMatch = weekData.event_name.match(/Matchday\s*(\d+)/i);
  const matchday = matchdayMatch ? matchdayMatch[1] : weekData.week.toString();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-2xl mx-auto px-4 py-6">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <button 
            onClick={handleBackToCareer}
            className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Career Home
          </button>
          
          <div className="text-center">
            <div className="text-xs font-medium text-emerald-400 uppercase tracking-widest mb-1">
              {tierName} • Season {weekData.season}
            </div>
            <h1 className="text-2xl font-bold text-white">
              Matchday {matchday}
            </h1>
            <p className="text-slate-500 text-sm mt-1">Best of {bestOf}</p>
          </div>
        </motion.div>

        {/* Player Match */}
        {playerFixture && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6"
          >
            <div className={`relative rounded-xl border overflow-hidden ${
              playerCompleted 
                ? playerWon 
                  ? 'bg-emerald-500/5 border-emerald-500/20' 
                  : 'bg-red-500/5 border-red-500/20'
                : 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/20'
            }`}>
              {/* Match content */}
              <div className="p-6">
                <div className="flex items-center justify-center gap-6">
                  {/* Home (You) */}
                  <div className="flex-1 text-right">
                    <div className="text-lg font-bold text-white">You</div>
                  </div>
                  
                  {/* Score / VS */}
                  <div className="flex items-center gap-3 min-w-[100px] justify-center">
                    {playerCompleted ? (
                      <>
                        <span className={`text-3xl font-black ${playerWon ? 'text-emerald-400' : 'text-white'}`}>
                          {playerFixture.home_score}
                        </span>
                        <span className="text-slate-600 text-sm">-</span>
                        <span className={`text-3xl font-black ${!playerWon ? 'text-red-400' : 'text-white'}`}>
                          {playerFixture.away_score}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-600 font-bold text-lg">vs</span>
                    )}
                  </div>
                  
                  {/* Away (Opponent) */}
                  <div className="flex-1 text-left">
                    <div className="text-lg font-bold text-white">{playerFixture.away_team}</div>
                  </div>
                </div>

                {/* Result badge or Play button */}
                <div className="flex justify-center mt-4">
                  {playerCompleted ? (
                    <Badge className={`text-xs px-3 py-1 ${
                      playerWon 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {playerWon ? '✓ Victory' : '✗ Defeat'}
                    </Badge>
                  ) : (
                    <Button 
                      onClick={handlePlayMatch}
                      disabled={playingMatch}
                      size="lg"
                      className="bg-amber-500 hover:bg-amber-400 text-black font-bold px-10 gap-2 shadow-lg shadow-amber-500/20"
                    >
                      {playingMatch ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      {playingMatch ? 'Starting...' : 'Play Match'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Other Matches */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Swords className="w-3.5 h-3.5" />
            Other Matches
          </h3>
          
          <div className="space-y-2">
            {otherFixtures.map((fixture, index) => {
              const homeWon = (fixture.home_score || 0) > (fixture.away_score || 0);
              const isCompleted = fixture.status === 'completed';
              
              return (
                <motion.div
                  key={fixture.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.25 + index * 0.05 }}
                >
                  <div className={`rounded-lg border px-4 py-3 ${
                    isCompleted 
                      ? 'bg-slate-800/30 border-white/5' 
                      : 'bg-slate-800/20 border-white/5'
                  }`}>
                    <div className="flex items-center justify-center gap-4">
                      {/* Home */}
                      <div className="flex-1 text-right">
                        <span className={`text-sm font-medium ${
                          isCompleted && homeWon ? 'text-white' : 'text-slate-400'
                        }`}>
                          {fixture.home_team}
                        </span>
                      </div>
                      
                      {/* Score */}
                      <div className="flex items-center gap-2 min-w-[70px] justify-center">
                        {isCompleted ? (
                          <>
                            <span className={`text-lg font-bold ${homeWon ? 'text-white' : 'text-slate-500'}`}>
                              {fixture.home_score}
                            </span>
                            <span className="text-slate-700 text-xs">-</span>
                            <span className={`text-lg font-bold ${!homeWon ? 'text-white' : 'text-slate-500'}`}>
                              {fixture.away_score}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-600 text-xs font-medium">vs</span>
                        )}
                      </div>
                      
                      {/* Away */}
                      <div className="flex-1 text-left">
                        <span className={`text-sm font-medium ${
                          isCompleted && !homeWon ? 'text-white' : 'text-slate-400'
                        }`}>
                          {fixture.away_team}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* Bottom Action */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex justify-center"
        >
          {playerCompleted ? (
            <Button 
              onClick={handleBackToCareer}
              className="bg-slate-800 hover:bg-slate-700 text-white font-medium px-8 gap-2 border border-white/10"
            >
              Continue
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <button
              onClick={handleBackToCareer}
              className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
            >
              Return to Career Home
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}
