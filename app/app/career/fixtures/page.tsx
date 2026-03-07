'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Clock, Trophy, Users, Play, CheckCircle, RefreshCw, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

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

export default function WeekFixtures() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const careerId = searchParams.get('careerId');
  
  const [loading, setLoading] = useState(true);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    if (careerId) {
      loadWeekFixtures();
    }
  }, [careerId]);

  async function loadWeekFixtures() {
    if (!careerId) return;

    try {
      const supabase = createClient();
      
      // Initialize FIFA-style league if needed
      const { data: careerData } = await supabase
        .from('career_profiles')
        .select('tier, season')
        .eq('id', careerId)
        .single();
        
      if (careerData) {
        // Check if league standings exist, if not initialize them
        const { data: standings } = await supabase
          .from('career_league_standings')
          .select('id')
          .eq('career_id', careerId)
          .eq('season', careerData.season)
          .eq('tier', careerData.tier)
          .limit(1);
          
        if (!standings || standings.length === 0) {
          // Initialize FIFA-style league
          if (careerData.tier === 2) {
            await supabase.rpc('rpc_fifa_initialize_tier2_league', {
              p_career_id: careerId,
              p_season: careerData.season
            });
          } else if (careerData.tier === 3) {
            await supabase.rpc('rpc_fifa_initialize_tier3_league', {
              p_career_id: careerId,
              p_season: careerData.season
            });
          }
        }
      }
      
      // Get current week fixtures - use FIFA-style fixture generation
      const { data, error } = await supabase.rpc('rpc_fifa_get_week_fixtures', { 
        p_career_id: careerId 
      });
      
      if (error) {
        // Fallback to original function if FIFA version doesn't exist yet
        const { data: fallbackData, error: fallbackError } = await supabase.rpc('rpc_get_week_fixtures_with_match_lock', { 
          p_career_id: careerId 
        });
        
        if (fallbackError) throw fallbackError;
        setWeekData(fallbackData);
      } else {
        setWeekData(data);
      }
      
    } catch (err: any) {
      toast.error(err.message || 'Failed to load fixtures');
      router.back();
    } finally {
      setLoading(false);
    }
  }

  async function handleContinue() {
    if (!careerId || !weekData) return;
    
    const playerFixture = weekData.fixtures.find(f => f.is_player_match && f.status === 'pending');
    if (!playerFixture) {
      toast.error('No pending matches to play');
      return;
    }

    setContinuing(true);
    try {
      const supabase = createClient();
      
      // Use FIFA-style career continue function
      const { data: matchData, error } = await supabase.rpc('rpc_career_continue_fifa_style', { 
        p_career_id: careerId 
      });
      
      if (error) {
        // Fallback to original function if FIFA version fails
        const { data: fallbackData, error: fallbackError } = await supabase.rpc('rpc_career_play_next_event_locked_fixed', { 
          p_career_id: careerId 
        });
        
        if (fallbackError) throw fallbackError;
        
        // Use fallback data with original structure
        const config = {
          mode: '501',
          botDifficulty: 'amateur',
          botAverage: 50,
          doubleOut: true,
          bestOf: 'best-of-3',
          atcOpponent: 'bot',
          career: {
            careerId,
            eventId: fallbackData.event?.id,
            eventName: fallbackData.event?.name,
            matchId: fallbackData.match_id,
            opponentId: fallbackData.opponent?.id,
            opponentName: fallbackData.opponent?.name,
            returnToFixtures: true
          },
        };

        sessionStorage.setItem('game_config', JSON.stringify(config));
        toast.success(`Starting match vs ${fallbackData.opponent?.name}`);
        router.push('/app/play/training/501');
        return;
      }
      
      if (matchData?.error) throw new Error(matchData.error);

      // Store FIFA-style return context
      sessionStorage.setItem('career_return_context', JSON.stringify({
        careerId,
        tier: weekData.tier,
        season: weekData.season,
        week: weekData.week,
        returnType: 'career_home'
      }));

      // Set up FIFA-style game config for dartbot match
      const config = {
        mode: '501',
        botDifficulty: matchData.bot_config?.difficulty || 'amateur',
        botAverage: matchData.bot_config?.average || 50,
        doubleOut: true,
        bestOf: (() => {
          const legs = matchData.event?.format_legs || (weekData.tier === 3 ? 5 : 3);
          const bestOfMap: Record<number, string> = { 
            1: 'best-of-1', 3: 'best-of-3', 5: 'best-of-5', 
            7: 'best-of-7', 9: 'best-of-9', 11: 'best-of-11' 
          };
          return bestOfMap[legs] || (weekData.tier === 3 ? 'best-of-5' : 'best-of-3');
        })(),
        atcOpponent: 'bot',
        career: {
          careerId,
          matchId: matchData.match_id,
          eventId: matchData.event?.id,
          eventName: matchData.event?.name,
          opponentId: matchData.opponent?.id,
          opponentName: matchData.opponent?.name,
          roomId: matchData.room_id,
          tier: matchData.event?.tier || weekData.tier,
          season: matchData.event?.season || weekData.season,
          tierName: matchData.career_context?.tier_name || (weekData.tier === 2 ? 'Pub League' : 'County League'),
          source: 'career',
          matchType: 'career',
          returnToCareer: true,
          fifaStyle: true // Flag for FIFA-style completion
        },
      };

      // Store config for the game
      sessionStorage.setItem('game_config', JSON.stringify(config));
      
      // Launch FIFA-style career match
      const tierName = weekData.tier === 2 ? 'Pub League' : 
                       weekData.tier === 3 ? 'County League' : 'League';
      const matchFormat = weekData.tier === 3 ? 'Best of 5' : 'Best of 3';
      
      toast.success(`Starting ${tierName} match (${matchFormat}) vs ${matchData.opponent?.name}`);
      router.push('/app/play/training/501');
      
    } catch (err: any) {
      toast.error(err.message || 'Failed to start match');
    } finally {
      setContinuing(false);
    }
  }

  function handleBackToCareer() {
    router.push(`/app/career?id=${careerId}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-amber-400 animate-spin" />
          <p className="text-slate-400">Loading FIFA-style fixtures...</p>
        </div>
      </div>
    );
  }

  if (!weekData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">No fixtures found</h2>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const playerFixture = weekData.fixtures.find(f => f.is_player_match);
  const otherFixtures = weekData.fixtures.filter(f => !f.is_player_match);
  const allMatchesCompleted = weekData.fixtures.every(f => f.status === 'completed');
  
  // FIFA-style tier information
  const tierInfo = {
    2: { name: 'Pub League', players: 8, format: 'Best of 3', color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30' },
    3: { name: 'County League', players: 12, format: 'Best of 5', color: 'from-purple-500/20 to-indigo-500/20 border-purple-500/30' }
  };
  
  const currentTier = tierInfo[weekData.tier as keyof typeof tierInfo] || tierInfo[2];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Button 
            variant="ghost" 
            onClick={handleBackToCareer}
            className="text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Career
          </Button>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white">{weekData.event_name}</h1>
            <p className="text-slate-400">
              {currentTier.name} • Season {weekData.season} • Week {weekData.week}
            </p>
            <p className="text-slate-500 text-sm">
              {currentTier.players} Players • {currentTier.format} Format • FIFA-Style
            </p>
          </div>
          <div className="w-24" /> {/* Spacer */}
        </div>

        {/* FIFA-style Continue Card - Only show if user has a pending match */}
        {playerFixture && playerFixture.status === 'pending' && (
          <div className="mb-8">
            <Card className={`bg-gradient-to-r ${currentTier.color} p-6`}>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                    <Trophy className="w-6 h-6 text-amber-400" />
                    Your Match
                  </h2>
                  <div className="flex items-center gap-6 mb-4">
                    <div className="text-center">
                      <div className="text-xl font-bold text-white">You</div>
                      <div className="text-slate-300 text-sm">Home</div>
                    </div>
                    
                    <div className="text-2xl font-bold text-slate-600">vs</div>
                    
                    <div className="text-center">
                      <div className="text-xl font-bold text-white">{playerFixture.away_team}</div>
                      <div className="text-slate-300 text-sm">Away</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-slate-300 text-sm">
                    <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                      {currentTier.format}
                    </Badge>
                    <span>{currentTier.name} Match</span>
                    <span>FIFA-Style Career</span>
                  </div>
                </div>

                <Button 
                  onClick={handleContinue}
                  disabled={continuing}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold px-8 py-4 text-lg ml-6"
                  size="lg"
                >
                  {continuing ? (
                    <>
                      <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <ChevronRight className="w-5 h-5 mr-2" />
                      Continue
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Player Match Result - Show if completed */}
        {playerFixture && playerFixture.status === 'completed' && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              Your Match - Completed
            </h2>
            
            <Card className="bg-slate-800/50 border-white/10 p-6">
              <div className="flex items-center justify-center gap-8">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">You</div>
                  <div className="text-3xl font-bold text-green-400 mt-2">{playerFixture.home_score}</div>
                </div>
                
                <div className="text-2xl font-bold text-slate-600">-</div>
                
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">{playerFixture.away_team}</div>
                  <div className="text-3xl font-bold text-slate-400 mt-2">{playerFixture.away_score}</div>
                </div>
              </div>
              
              <div className="text-center mt-4">
                <Badge className={`${
                  (playerFixture.home_score || 0) > (playerFixture.away_score || 0) 
                    ? 'bg-green-500 text-white' 
                    : 'bg-red-500 text-white'
                }`}>
                  {(playerFixture.home_score || 0) > (playerFixture.away_score || 0) ? 'Victory!' : 'Defeat'}
                </Badge>
              </div>
            </Card>
          </div>
        )}

        {/* Other Fixtures - FIFA Style */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Other {currentTier.name} Matches
          </h2>
          
          <div className="grid gap-3">
            {otherFixtures.map((fixture, index) => (
              <Card key={fixture.id} className="bg-slate-800/30 border-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6 flex-1">
                    <div className="text-center min-w-[120px]">
                      <div className="text-white font-medium">{fixture.home_team}</div>
                      {fixture.status === 'completed' && (
                        <div className="text-lg font-bold text-white mt-1">{fixture.home_score}</div>
                      )}
                    </div>
                    
                    <div className="text-slate-500">vs</div>
                    
                    <div className="text-center min-w-[120px]">
                      <div className="text-white font-medium">{fixture.away_team}</div>
                      {fixture.status === 'completed' && (
                        <div className="text-lg font-bold text-white mt-1">{fixture.away_score}</div>
                      )}
                    </div>
                  </div>
                  
                  <div className="ml-6">
                    {fixture.status === 'completed' ? (
                      <Badge variant="outline" className="border-green-500/30 text-green-400">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Final
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/30 text-amber-400">
                        <Clock className="w-3 h-3 mr-1" />
                        Pending
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex justify-center">
          {allMatchesCompleted ? (
            <Button 
              onClick={handleBackToCareer}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-8 py-3"
            >
              Return to Career Home
            </Button>
          ) : !playerFixture || playerFixture.status === 'completed' ? (
            <div className="text-center">
              <p className="text-slate-400 text-sm mb-4">
                Other matches will be simulated after you complete yours (FIFA-style)
              </p>
              <Button 
                variant="outline"
                onClick={handleBackToCareer}
                className="border-white/20 text-slate-400 hover:text-white"
              >
                Return to Career Home
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}