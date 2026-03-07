'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Trophy, Users, Clock, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

interface TournamentOption {
  name: string;
  description: string;
}

interface TournamentChoice {
  trigger_tournament: boolean;
  tournament_options: TournamentOption[];
}

export default function TournamentChoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const careerId = searchParams.get('careerId');
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TournamentChoice | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    if (careerId) {
      loadTournamentChoice();
    }
  }, [careerId]);

  async function loadTournamentChoice() {
    if (!careerId) return;

    try {
      const supabase = createClient();
      
      // Check for tournament trigger
      const { data: tournamentData, error } = await supabase.rpc('rpc_fifa_check_mid_season_tournament', {
        p_career_id: careerId
      });
      
      if (error) throw error;
      
      if (!tournamentData?.trigger_tournament) {
        // No tournament available, redirect back
        router.push(`/app/career?id=${careerId}`);
        return;
      }
      
      setData(tournamentData);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load tournament options');
      router.push(`/app/career?id=${careerId}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleTournamentChoice(tournamentIndex: number) {
    if (!careerId || !data) return;
    
    setChoosing(true);
    try {
      const supabase = createClient();
      
      // Record tournament choice and create tournament entry
      const selectedTournament = data.tournament_options[tournamentIndex];
      
      const { data: result, error } = await supabase.rpc('rpc_fifa_enter_mid_season_tournament', {
        p_career_id: careerId,
        p_tournament_name: selectedTournament.name
      });
      
      if (error) throw error;
      
      toast.success(`Entered ${selectedTournament.name}!`);
      
      // Route to tournament bracket or back to career
      if (result?.event_id) {
        router.push(`/app/career/bracket?careerId=${careerId}&eventId=${result.event_id}`);
      } else {
        router.push(`/app/career?id=${careerId}`);
      }
      
    } catch (err: any) {
      toast.error(err.message || 'Failed to enter tournament');
    } finally {
      setChoosing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Trophy className="w-12 h-12 text-amber-400 mx-auto mb-4 animate-pulse" />
          <p className="text-slate-400">Loading tournament options...</p>
        </div>
      </div>
    );
  }

  if (!data?.trigger_tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">No tournament available</h2>
          <Button onClick={() => router.push(`/app/career?id=${careerId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return to Career
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Button 
            variant="ghost" 
            onClick={() => router.push(`/app/career?id=${careerId}`)}
            className="text-slate-300 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Career
          </Button>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white">Mid-Season Tournament</h1>
            <p className="text-slate-400">Pub League • Choose your tournament</p>
          </div>
          <div className="w-24" /> {/* Spacer */}
        </div>

        {/* FIFA-style Tournament Choice Header */}
        <div className="mb-8">
          <Card className="bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-500/30 p-6">
            <div className="text-center">
              <Trophy className="w-12 h-12 text-amber-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Mid-Season Tournament Invitation</h2>
              <p className="text-blue-200 text-lg mb-4">
                After 4 league matches, you've earned the right to enter a mid-season tournament!
              </p>
              <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                FIFA-Style Career Mode
              </Badge>
            </div>
          </Card>
        </div>

        {/* Tournament Options */}
        <div className="space-y-4 mb-8">
          <h3 className="text-xl font-bold text-white text-center mb-6">Choose your tournament:</h3>
          
          {data.tournament_options.map((tournament, index) => (
            <Card 
              key={index}
              className="bg-slate-800/50 border-white/10 hover:border-amber-500/30 transition-all cursor-pointer group p-6"
              onClick={() => !choosing && handleTournamentChoice(index)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/20 flex items-center justify-center group-hover:from-amber-500/30 group-hover:to-orange-600/30 group-hover:border-amber-500/40 transition-all">
                    <Trophy className="w-6 h-6 text-amber-400" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-white mb-1">{tournament.name}</h4>
                    <div className="flex items-center gap-3 text-slate-400">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>16 Players</span>
                      </div>
                      <span>•</span>
                      <span>Single Elimination</span>
                      <span>•</span>
                      <span>Best of 3</span>
                    </div>
                    <p className="text-slate-300 text-sm mt-2">{tournament.description}</p>
                  </div>
                </div>
                
                <Button 
                  disabled={choosing}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold px-6"
                >
                  {choosing ? (
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ChevronRight className="w-4 h-4 mr-2" />
                  )}
                  Enter Tournament
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* FIFA-style Info Panel */}
        <Card className="bg-slate-800/30 border-white/5 p-6">
          <div className="text-center">
            <h4 className="text-lg font-semibold text-white mb-3">FIFA-Style Tournament System</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-400">
              <div>
                <div className="font-semibold text-white mb-1">Tournament Format</div>
                <div>16-player single elimination bracket with best-of-3 matches</div>
              </div>
              <div>
                <div className="font-semibold text-white mb-1">AI Opponents</div>
                <div>All other players are AI with skill-based difficulty</div>
              </div>
              <div>
                <div className="font-semibold text-white mb-1">League Continues</div>
                <div>After tournament, your Pub League season continues normally</div>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-xs text-slate-500">
                Tournament results don't affect league standings • 
                League promotion still based on final league position
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}