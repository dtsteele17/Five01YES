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
import { getEventTheme } from '@/lib/career/tierThemes';

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
  format_legs?: number;
  fixtures: Fixture[];
}

const TIER_NAMES: Record<number, string> = {
  2: 'Pub Leagues',
  3: 'County Circuit',
  4: 'National Tour',
  5: 'World Tour',
};

export default function WeekFixtures() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { setConfig } = useTraining();
  
  const runId = params.runId as string;
  const careerId = searchParams.get('careerId') || runId;
  // If showResults param is present, we're viewing results of a just-completed match
  const showResultsEventId = searchParams.get('showResults');

  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [playingMatch, setPlayingMatch] = useState(false);
  const [showingResults, setShowingResults] = useState(!!showResultsEventId);

  useEffect(() => {
    if (careerId) {
      loadWeekFixtures();
    }
  }, [careerId, showResultsEventId]);

  async function loadWeekFixtures() {
    setLoading(true);
    console.log('[WEEK] Loading fixtures', { careerId, showResultsEventId, url: window.location.href });
    try {
      const supabase = createClient();
      
      if (showResultsEventId) {
        // Load specific completed event's results
        const { data, error } = await supabase.rpc('rpc_get_week_fixtures_for_event', {
          p_career_id: careerId,
          p_event_id: showResultsEventId,
        });
        if (error) {
          console.warn('[WEEK] rpc_get_week_fixtures_for_event failed, falling back:', error.message);
          // RPC doesn't exist yet - load the completed event directly from tables
          const { data: eventData } = await supabase
            .from('career_events')
            .select('id, event_name, status, format_legs, sequence_no')
            .eq('id', showResultsEventId)
            .single();
          
          if (eventData && eventData.status === 'completed') {
            // Get the matchday fixtures for this event's sequence
            const { data: fallbackData, error: fallbackError } = await supabase.rpc('rpc_get_week_fixtures_with_match_lock', {
              p_career_id: careerId
            });
            if (!fallbackError && fallbackData) {
              // Mark as showing results even with fallback data
              setWeekData(fixScores(fallbackData));
              setShowingResults(true);
            }
          } else {
            // Event not completed - just load next pending
            const { data: fallbackData, error: fallbackError } = await supabase.rpc('rpc_get_week_fixtures_with_match_lock', {
              p_career_id: careerId
            });
            if (fallbackError) throw fallbackError;
            setWeekData(fixScores(fallbackData));
          }
        } else {
          setWeekData(fixScores(data));
          if (showResultsEventId) setShowingResults(true);
        }
      } else {
        // Load next pending league event
        const { data, error } = await supabase.rpc('rpc_get_week_fixtures_with_match_lock', {
          p_career_id: careerId
        });
        if (error) throw error;
        setWeekData(fixScores(data));
      }
    } catch (err: any) {
      console.error('[WEEK] Error loading fixtures:', err);
      toast.error('Failed to load fixtures');
    } finally {
      console.log('[WEEK] Fixtures loaded:', weekData ? 'yes' : 'null');
      setLoading(false);
    }
  }

  function fixScores(data: any): WeekData | null {
    if (!data?.fixtures) return data;
    const bestOf = data.format_legs || (data.tier === 3 ? 5 : data.tier === 4 ? 7 : data.tier === 5 ? 9 : 3);
    const legsToWin = Math.ceil(bestOf / 2);
    
    data.fixtures = data.fixtures.map((f: Fixture) => {
      if (!f.is_player_match && f.status === 'completed') {
        // Ensure scores respect best-of format
        const hs = f.home_score ?? 0;
        const as = f.away_score ?? 0;
        if (hs > legsToWin || as > legsToWin || (hs !== legsToWin && as !== legsToWin)) {
          const homeWins = Math.random() < 0.5;
          const winnerLegs = legsToWin;
          const loserLegs = Math.floor(Math.random() * legsToWin);
          return {
            ...f,
            home_score: homeWins ? winnerLegs : loserLegs,
            away_score: homeWins ? loserLegs : winnerLegs,
          };
        }
      }
      return f;
    });
    return data;
  }

  async function handlePlayMatch() {
    if (!careerId || !weekData || playingMatch) return;
    setPlayingMatch(true);
    try {
      const playerFixture = (weekData.fixtures || []).find(f => f.is_player_match);
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

      const eventId = matchData.event?.id || playerFixture.event_id;
      const avg = Math.max(20, Math.min(100, Math.round(matchData.bot_average || 50)));
      const diffKey = avg <= 30 ? 'novice' : avg <= 40 ? 'beginner' : avg <= 50 ? 'casual'
        : avg <= 60 ? 'intermediate' : avg <= 70 ? 'advanced' : avg <= 80 ? 'elite'
        : avg <= 90 ? 'pro' : 'worldClass';
      const bestOfMap: Record<number, any> = { 1: 'best-of-1', 3: 'best-of-3', 5: 'best-of-5', 7: 'best-of-7', 9: 'best-of-9', 11: 'best-of-11', 13: 'best-of-13', 15: 'best-of-15', 17: 'best-of-17', 19: 'best-of-19', 21: 'best-of-21', 23: 'best-of-23' };

      const opponentName = playerFixture.away_team;
      const { data: cpName } = await supabase.from('career_profiles').select('player_name').eq('id', careerId).single();
      const pName = cpName?.player_name || 'You';
      
      // Store return context — return to THIS matchday's results after the game
      sessionStorage.setItem('career_fixtures_return', JSON.stringify({
        careerId,
        route: `/app/career/week/${runId}?careerId=${careerId}&showResults=${eventId}`,
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
          eventId: eventId,
          eventName: matchData.event?.name || `${TIER_NAMES[weekData.tier] || 'League'} Match`,
          matchId: matchData.match_id,
          opponentId: matchData.opponent?.id,
          opponentName: opponentName,
          returnToFixtures: true,
          tier: weekData.tier,
          playerName: pName,
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
    // Clear the fixtures return context
    sessionStorage.removeItem('career_fixtures_return');
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

  if (!weekData || (weekData as any).error || !weekData.fixtures) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-4">{(weekData as any)?.error || 'No fixtures found'}</h2>
          <p className="text-slate-500 text-sm mb-4">Try going back and clicking Continue again</p>
          <Button variant="ghost" onClick={() => router.back()} className="text-slate-300">
            <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
          </Button>
        </div>
      </div>
    );
  }

  const fixtures = weekData.fixtures || [];
  const playerFixture = fixtures.find(f => f.is_player_match);
  const otherFixtures = fixtures.filter(f => !f.is_player_match);
  const playerCompleted = playerFixture?.status === 'completed';
  const playerWon = playerCompleted && (playerFixture?.home_score || 0) > (playerFixture?.away_score || 0);
  const tierName = TIER_NAMES[weekData.tier] || `Tier ${weekData.tier}`;
  const bestOf = weekData.format_legs || (weekData.tier === 3 ? 5 : weekData.tier === 4 ? 7 : weekData.tier === 5 ? 9 : 3);
  const isResultsView = !!showResultsEventId || showingResults;

  const matchdayMatch = weekData.event_name.match(/Matchday\s*(\d+)/i);
  const matchday = matchdayMatch ? matchdayMatch[1] : weekData.week.toString();

  const theme = getEventTheme(weekData.tier, undefined, weekData.event_name);

  return (
    <div className={`min-h-screen ${theme.pageBg}`}>
      <div className={`fixed top-0 left-0 right-0 ${theme.accentBarHeight} ${theme.accentGradient} z-50`} />
      <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 sm:mb-8"
        >
          <button 
            onClick={handleBackToCareer}
            className="flex items-center gap-1 text-slate-400 hover:text-white text-xs sm:text-sm mb-3 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            ← Career Home
          </button>
          
          <div className="text-center">
            <div className={`text-[10px] sm:text-xs font-medium ${theme.accent} uppercase tracking-widest mb-1`}>
              {tierName} • Season {weekData.season}
            </div>
            <h1 className={`${theme.titleSize} sm:text-2xl ${theme.titleWeight} text-white`}>
              {isResultsView && playerCompleted ? `Matchday ${matchday} — Results` : `Matchday ${matchday}`}
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Best of {bestOf}</p>
          </div>
        </motion.div>

        {/* Player Match */}
        {playerFixture && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-4 sm:mb-6"
          >
            <div className={`relative ${theme.cardRadius} ${theme.borderStyle} overflow-hidden ${
              playerCompleted 
                ? playerWon 
                  ? `${theme.cardBg} ${theme.accentBorder}` 
                  : 'bg-red-500/5 border-red-500/20'
                : `${theme.cardBg} ${theme.cardBorder}`
            } ${theme.cardShadow}`}>
              <div className="p-4 sm:p-6">
                <div className="flex items-center justify-center gap-3 sm:gap-6">
                  <div className="flex-1 text-right">
                    <div className={`text-base sm:text-lg ${theme.titleWeight} text-white`}>{playerFixture.home_team}</div>
                  </div>
                  
                  <div className="flex items-center gap-2 sm:gap-3 min-w-[80px] sm:min-w-[100px] justify-center">
                    {playerCompleted ? (
                      <>
                        <span className={`text-2xl sm:text-3xl font-black ${playerWon ? theme.accent : 'text-white'}`}>
                          {playerFixture.home_score}
                        </span>
                        <span className="text-slate-600 text-xs sm:text-sm">-</span>
                        <span className={`text-2xl sm:text-3xl font-black ${!playerWon ? 'text-red-400' : 'text-white'}`}>
                          {playerFixture.away_score}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-600 font-bold text-base sm:text-lg">vs</span>
                    )}
                  </div>
                  
                  <div className="flex-1 text-left">
                    <div className={`text-base sm:text-lg ${theme.titleWeight} text-white`}>{playerFixture.away_team}</div>
                  </div>
                </div>

                <div className="flex justify-center mt-3 sm:mt-4">
                  {playerCompleted ? (
                    <Badge className={`text-xs px-3 py-1 ${
                      playerWon 
                        ? `${theme.badgeBg} ${theme.accent} ${theme.borderStyle} ${theme.accentBorder}` 
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {playerWon ? '✓ Victory' : '✗ Defeat'}
                    </Badge>
                  ) : (
                    <Button 
                      onClick={handlePlayMatch}
                      disabled={playingMatch}
                      size="lg"
                      className={`${theme.buttonBg} ${theme.buttonHover} ${theme.buttonText} font-bold px-10 gap-2 ${theme.buttonShadow}`}
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
          className="mb-6 sm:mb-8"
        >
          <h3 className={`text-[10px] sm:text-xs font-medium ${theme.accentMuted} uppercase tracking-widest mb-2 sm:mb-3 flex items-center gap-2`}>
            <Swords className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
            Other Matches
          </h3>
          
          <div className="space-y-1.5 sm:space-y-2">
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
                  <div className={`${theme.cardRadius} ${theme.borderStyle} px-3 sm:px-4 py-2 sm:py-3 ${
                    isCompleted 
                      ? `bg-slate-800/30 ${theme.cardBorder}` 
                      : `bg-slate-800/20 ${theme.cardBorder}`
                  }`}>
                    <div className="flex items-center justify-center gap-2 sm:gap-4">
                      <div className="flex-1 text-right">
                        <span className={`text-xs sm:text-sm font-medium ${
                          isCompleted && homeWon ? 'text-white' : 'text-slate-400'
                        }`}>
                          {fixture.home_team}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-[50px] sm:min-w-[70px] justify-center">
                        {isCompleted ? (
                          <>
                            <span className={`text-base sm:text-lg font-bold ${homeWon ? 'text-white' : 'text-slate-500'}`}>
                              {fixture.home_score}
                            </span>
                            <span className="text-slate-700 text-[10px] sm:text-xs">-</span>
                            <span className={`text-base sm:text-lg font-bold ${!homeWon ? 'text-white' : 'text-slate-500'}`}>
                              {fixture.away_score}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-600 text-xs font-medium">vs</span>
                        )}
                      </div>
                      
                      <div className="flex-1 text-left">
                        <span className={`text-xs sm:text-sm font-medium ${
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
              className={`${theme.buttonBg} ${theme.buttonHover} ${theme.buttonText} font-medium px-8 gap-2 ${theme.buttonShadow}`}
            >
              Back to Career
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
