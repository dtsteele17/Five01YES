'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Clock, Trophy, Users, Play, CheckCircle, RefreshCw } from 'lucide-react';
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
  const params = useParams();
  const searchParams = useSearchParams();
  
  const runId = params.runId as string;
  const careerId = searchParams.get('careerId') || runId; // Support both patterns
  
  const [loading, setLoading] = useState(true);
  const [weekData, setWeekData] = useState<WeekData | null>(null);
  const [playingMatch, setPlayingMatch] = useState(false);

  useEffect(() => {
    if (careerId) {
      loadWeekFixtures();
    }
  }, [careerId]);

  async function loadWeekFixtures() {
    if (!careerId) return;

    try {
      const supabase = createClient();
      
      // Get current week fixtures with locked opponent consistency
      const { data, error } = await supabase.rpc('rpc_get_week_fixtures_with_match_lock', { 
        p_career_id: careerId 
      });
      
      if (error) throw error;
      
      setWeekData(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load fixtures');
      router.back();
    } finally {
      setLoading(false);
    }
  }

  async function handlePlayMatch() {
    if (!careerId || !weekData) return;
    
    const playerFixture = weekData.fixtures.find(f => f.is_player_match && f.status === 'pending');
    if (!playerFixture) {
      toast.error('No pending matches to play');
      return;
    }

    setPlayingMatch(true);
    try {
      const supabase = createClient();
      const { data: matchData, error } = await supabase.rpc('rpc_career_play_next_event_locked_fixed', { 
        p_career_id: careerId 
      });
      
      if (error) throw error;
      if (matchData?.error) throw new Error(matchData.error);

      // Set up game config and store return context
      const avg = 50; // Default for tier 2
      const diffKey = 'intermediate';
      const bestOfMap: Record<number, any> = { 1: 'best-of-1', 3: 'best-of-3', 5: 'best-of-5', 7: 'best-of-7', 9: 'best-of-9', 11: 'best-of-11' };

      // Store context to return to fixtures page after game
      sessionStorage.setItem('career_fixtures_return', JSON.stringify({
        careerId,
        week: weekData.week,
        tier: weekData.tier,
        season: weekData.season,
        route: `/app/career/week/${runId}?careerId=${careerId}`
      }));

      const config = {
        mode: '501',
        botDifficulty: diffKey as any,
        botAverage: avg,
        doubleOut: true,
        bestOf: bestOfMap[matchData.event?.format_legs] || 'best-of-3',
        atcOpponent: 'bot',
        career: {
          careerId,
          eventId: matchData.event?.id,
          eventName: matchData.event?.name,
          matchId: matchData.match_id,
          opponentId: matchData.opponent?.id,
          opponentName: matchData.opponent?.name,
          returnToFixtures: true // Flag to return to fixtures page after match
        },
      };

      // Store config for the game
      sessionStorage.setItem('game_config', JSON.stringify(config));
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
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-amber-400 animate-spin" />
          <p className="text-slate-400">Loading fixtures...</p>
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
            <p className="text-slate-400">Tier {weekData.tier} • Season {weekData.season} • Week {weekData.week}</p>
          </div>
          <div className="w-24" /> {/* Spacer */}
        </div>

        {/* Player Match - Only show if not completed yet */}
        {playerFixture && playerFixture.status === 'pending' && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Your Match
            </h2>
            
            <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1 flex items-center justify-center gap-8">
                  <div className="text-center min-w-[120px]">
                    <div className="text-2xl font-bold text-white">You</div>
                    <div className="text-slate-300 text-sm">Home</div>
                  </div>
                  
                  <div className="text-4xl font-bold text-slate-600">vs</div>
                  
                  <div className="text-center min-w-[120px]">
                    <div className="text-2xl font-bold text-white">{playerFixture.away_team}</div>
                    <div className="text-slate-300 text-sm">Away</div>
                  </div>
                </div>

                <Button 
                  onClick={handlePlayMatch}
                  disabled={playingMatch}
                  className="bg-amber-500 hover:bg-amber-600 text-black font-bold px-8 py-3"
                >
                  {playingMatch ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Play Your Match
                    </>
                  )}
                </Button>
              </div>
            </div>
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

        {/* Other Fixtures */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Other Matches
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
          ) : (
            <div className="text-center">
              <p className="text-slate-400 text-sm mb-4">
                Complete your match to see all results
              </p>
              <Button 
                variant="outline"
                onClick={handleBackToCareer}
                className="border-white/20 text-slate-400 hover:text-white"
              >
                Return to Career Home
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}