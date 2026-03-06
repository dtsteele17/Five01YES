'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, Trophy, Users, Play } from 'lucide-react';
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
      
      // Get current week fixtures and simulate all non-player matches
      const { data, error } = await supabase.rpc('rpc_get_week_fixtures', { 
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
      const { data: matchData, error } = await supabase.rpc('rpc_career_play_next_event', { 
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
        season: weekData.season
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
          returnToFixtures: true // Flag to return here instead of career home
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
        <div className="w-10 h-10 text-amber-400 animate-spin border-4 border-amber-400/30 border-t-amber-400 rounded-full" />
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

        {/* Player Match */}
        {playerFixture && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Your Match
            </h2>
            
            <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">You</div>
                    <div className="text-slate-300 text-sm">Home</div>
                    {playerFixture.status === 'completed' && (
                      <div className="text-3xl font-black text-amber-400 mt-2">
                        {playerFixture.home_score}
                      </div>
                    )}
                  </div>
                  
                  <div className="text-4xl font-bold text-slate-600">
                    {playerFixture.status === 'completed' ? 'vs' : 'vs'}
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">{playerFixture.away_team}</div>
                    <div className="text-slate-300 text-sm">Away</div>
                    {playerFixture.status === 'completed' && (
                      <div className="text-3xl font-black text-slate-300 mt-2">
                        {playerFixture.away_score}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-right">
                  {playerFixture.status === 'pending' ? (
                    <Button 
                      onClick={handlePlayMatch}
                      disabled={playingMatch}
                      className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold px-8 py-3 text-lg"
                    >
                      <Play className="w-5 h-5 mr-2" />
                      {playingMatch ? 'Starting...' : 'Play Match'}
                    </Button>
                  ) : (
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${playerFixture.home_score! > playerFixture.away_score! ? 'text-emerald-400' : 'text-red-400'}`}>
                        {playerFixture.home_score! > playerFixture.away_score! ? 'WIN' : 'LOSS'}
                      </div>
                      <div className="text-slate-400 text-sm">Match Completed</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Other Fixtures */}
        {otherFixtures.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-400" />
              Other Matches
            </h2>
            
            <div className="grid gap-4">
              {otherFixtures.map((fixture) => (
                <div key={fixture.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-lg font-semibold text-white">{fixture.home_team}</div>
                        {fixture.status === 'completed' && (
                          <div className="text-xl font-bold text-slate-300 mt-1">
                            {fixture.home_score}
                          </div>
                        )}
                      </div>
                      
                      <div className="text-2xl font-bold text-slate-600">vs</div>
                      
                      <div className="text-center">
                        <div className="text-lg font-semibold text-white">{fixture.away_team}</div>
                        {fixture.status === 'completed' && (
                          <div className="text-xl font-bold text-slate-300 mt-1">
                            {fixture.away_score}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-right">
                      {fixture.status === 'pending' ? (
                        <div className="flex items-center gap-2 text-amber-400">
                          <Clock className="w-4 h-4" />
                          <span className="text-sm">Pending</span>
                        </div>
                      ) : (
                        <div className="text-emerald-400 text-sm font-medium">
                          Complete
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Continue Button */}
        {allMatchesCompleted && (
          <div className="text-center">
            <Button 
              onClick={handleBackToCareer}
              className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-bold px-8 py-3 text-lg"
            >
              Continue to Next Week
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}