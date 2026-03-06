'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';

interface Fixture {
  id: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  status: 'completed';
  is_player_match: boolean;
}

interface ResultsData {
  week: number;
  tier: number;
  season: number;
  event_name: string;
  fixtures: Fixture[];
  standings?: StandingRow[];
}

interface StandingRow {
  is_player: boolean;
  name: string;
  played: number;
  won: number;
  lost: number;
  legs_for: number;
  legs_against: number;
  legs_diff: number;
  points: number;
  average: number;
}

export default function WeekResults() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const careerId = searchParams.get('careerId');
  
  const [loading, setLoading] = useState(true);
  const [resultsData, setResultsData] = useState<ResultsData | null>(null);

  useEffect(() => {
    if (careerId) {
      loadWeekResults();
    }
  }, [careerId]);

  async function loadWeekResults() {
    if (!careerId) return;

    try {
      const supabase = createClient();
      
      // Get completed week results with updated standings
      const { data, error } = await supabase.rpc('rpc_get_week_results_with_standings', { 
        p_career_id: careerId 
      });
      
      if (error) throw error;
      
      setResultsData(data);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load results');
      router.back();
    } finally {
      setLoading(false);
    }
  }

  function handleContinueToCareer() {
    router.push(`/app/career?id=${careerId}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 text-amber-400 animate-spin border-4 border-amber-400/30 border-t-amber-400 rounded-full" />
      </div>
    );
  }

  if (!resultsData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">No results found</h2>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const playerFixture = resultsData.fixtures.find(f => f.is_player_match);
  const otherFixtures = resultsData.fixtures.filter(f => !f.is_player_match);
  const playerWon = playerFixture && playerFixture.home_score > playerFixture.away_score;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Week {resultsData.week} Results</h1>
          <p className="text-slate-400">{resultsData.event_name}</p>
          <p className="text-slate-500">Tier {resultsData.tier} • Season {resultsData.season}</p>
        </div>

        {/* Player Result Banner */}
        {playerFixture && (
          <div className={`mb-8 p-6 rounded-2xl border-2 ${playerWon ? 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 border-emerald-500/50' : 'bg-gradient-to-r from-red-500/20 to-pink-500/20 border-red-500/50'}`}>
            <div className="text-center">
              <div className={`text-4xl font-black mb-2 ${playerWon ? 'text-emerald-400' : 'text-red-400'}`}>
                {playerWon ? 'VICTORY!' : 'DEFEAT'}
              </div>
              <div className="text-white text-xl">
                You {playerFixture.home_score} - {playerFixture.away_score} {playerFixture.away_team}
              </div>
            </div>
          </div>
        )}

        {/* All Match Results */}
        <div className="mb-8">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            All Match Results
          </h2>
          
          <div className="grid gap-4">
            {resultsData.fixtures.map((fixture) => (
              <div key={fixture.id} className={`border rounded-xl p-4 ${fixture.is_player_match ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30' : 'bg-slate-800/50 border-slate-700/50'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 flex items-center justify-center gap-8">
                    <div className="text-center min-w-[120px]">
                      <div className={`text-lg font-semibold ${fixture.is_player_match ? 'text-amber-300' : 'text-white'}`}>
                        {fixture.home_team}
                      </div>
                      <div className={`text-2xl font-bold mt-1 ${fixture.home_score > fixture.away_score ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {fixture.home_score}
                      </div>
                    </div>
                    
                    <div className="text-2xl font-bold text-slate-600">vs</div>
                    
                    <div className="text-center min-w-[120px]">
                      <div className={`text-lg font-semibold ${fixture.is_player_match ? 'text-amber-300' : 'text-white'}`}>
                        {fixture.away_team}
                      </div>
                      <div className={`text-2xl font-bold mt-1 ${fixture.away_score > fixture.home_score ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {fixture.away_score}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right min-w-[80px]">
                    {fixture.is_player_match ? (
                      <div className="text-amber-400 text-sm font-medium">
                        Your Match
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

        {/* Updated League Standings */}
        {resultsData.standings && resultsData.standings.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              Updated League Table
            </h2>
            
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="grid grid-cols-8 gap-2 p-3 bg-slate-700/30 text-xs font-medium text-slate-300 border-b border-slate-600/50">
                <div className="text-left">Pos</div>
                <div className="col-span-3 text-left">Team</div>
                <div className="text-center">P</div>
                <div className="text-center">W</div>
                <div className="text-center">L</div>
                <div className="text-center">Pts</div>
              </div>
              
              {resultsData.standings.map((team, index) => (
                <div key={index} className={`grid grid-cols-8 gap-2 p-3 text-sm border-b border-slate-700/30 last:border-0 ${team.is_player ? 'bg-amber-500/10 text-amber-300' : 'text-slate-300'}`}>
                  <div className="font-bold">{index + 1}</div>
                  <div className="col-span-3 font-semibold">{team.name}</div>
                  <div className="text-center">{team.played}</div>
                  <div className="text-center text-emerald-400">{team.won}</div>
                  <div className="text-center text-red-400">{team.lost}</div>
                  <div className="text-center font-bold">{team.points}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Continue Button */}
        <div className="text-center">
          <Button 
            onClick={handleContinueToCareer}
            className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white font-bold px-8 py-3 text-lg"
          >
            Continue to Career
          </Button>
        </div>
      </div>
    </div>
  );
}