'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Trophy, Users, Clock, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';

interface TournamentChoice {
  careerId: string;
  eventId: string;
  event: {
    id: string;
    event_name: string;
    metadata: {
      description: string;
      tournaments: Array<{
        name: string;
        size: number;
        description?: string;
      }>;
      can_decline: boolean;
    };
  };
  career: {
    tier: number;
    season: number;
    week: number;
  };
}

export default function TournamentChoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const careerId = searchParams.get('careerId');
  const eventId = searchParams.get('eventId');
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TournamentChoice | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    if (careerId && eventId) {
      loadTournamentChoice();
    }
  }, [careerId, eventId]);

  async function loadTournamentChoice() {
    if (!careerId || !eventId) return;

    try {
      const supabase = createClient();
      
      // Get tournament choice event details
      const { data: eventData, error } = await supabase
        .from('career_events')
        .select(`
          id, event_name, metadata,
          career_profiles!inner(tier, season, week)
        `)
        .eq('id', eventId)
        .eq('career_id', careerId)
        .single();
      
      if (error) throw error;
      
      setData({
        careerId,
        eventId,
        event: eventData,
        career: eventData.career_profiles
      });
      
    } catch (err: any) {
      toast.error(err.message || 'Failed to load tournament choice');
      router.back();
    } finally {
      setLoading(false);
    }
  }

  async function handleTournamentChoice(choice: number) {
    if (!careerId || !eventId) return;
    
    setChoosing(true);
    try {
      const supabase = createClient();
      
      // Process tournament choice
      const { data: result, error } = await supabase.rpc('rpc_career_tournament_choice', {
        p_career_id: careerId,
        p_event_id: eventId,
        p_tournament_choice: choice
      });
      
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      
      if (choice === -1) {
        // Declined tournaments, continue with league
        toast.success('Tournament declined - continuing with league');
        router.push(`/app/career?id=${careerId}`);
      } else {
        // Entered tournament
        const tournamentName = data?.event.metadata.tournaments[choice]?.name || 'Tournament';
        toast.success(`Entered ${tournamentName}!`);
        router.push(`/app/career?id=${careerId}`);
      }
      
    } catch (err: any) {
      toast.error(err.message || 'Failed to process tournament choice');
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

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Tournament choice not found</h2>
          <Button onClick={() => router.push(`/app/career?id=${careerId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return to Career
          </Button>
        </div>
      </div>
    );
  }

  const { event, career } = data;
  const tournaments = event.metadata?.tournaments || [];
  const canDecline = event.metadata?.can_decline || false;
  
  const tierInfo = {
    2: { name: 'Pub League', color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30' },
    3: { name: 'County League', color: 'from-purple-500/20 to-indigo-500/20 border-purple-500/30' }
  };
  
  const currentTier = tierInfo[career.tier as keyof typeof tierInfo] || tierInfo[2];

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
            <h1 className="text-3xl font-bold text-white">Tournament Choice</h1>
            <p className="text-slate-400">
              {currentTier.name} • Season {career.season} • Week {career.week}
            </p>
          </div>
          <div className="w-24" /> {/* Spacer */}
        </div>

        {/* FIFA-style Tournament Choice Header */}
        <div className="mb-8">
          <Card className={`bg-gradient-to-r ${currentTier.color} p-6`}>
            <div className="text-center">
              <Trophy className="w-12 h-12 text-amber-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">{event.event_name}</h2>
              <p className="text-slate-300 text-lg mb-4">{event.metadata?.description}</p>
              <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                FIFA-Style Career Choice
              </Badge>
            </div>
          </Card>
        </div>

        {/* Tournament Options */}
        <div className="space-y-4 mb-8">
          <h3 className="text-xl font-bold text-white text-center mb-6">Choose your next step:</h3>
          
          {tournaments.map((tournament, index) => (
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
                        <span>{tournament.size} Players</span>
                      </div>
                      <span>•</span>
                      <span>Single Elimination</span>
                      <span>•</span>
                      <span>
                        {career.tier === 3 ? 'Best of 5' : 'Best of 3'}
                      </span>
                    </div>
                    {tournament.description && (
                      <p className="text-slate-500 text-sm mt-2">{tournament.description}</p>
                    )}
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

          {/* Decline Option (if allowed) */}
          {canDecline && (
            <Card 
              className="bg-slate-800/30 border-slate-600/30 hover:border-red-500/30 transition-all cursor-pointer group p-6"
              onClick={() => !choosing && handleTournamentChoice(-1)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-700/50 border border-slate-600/50 flex items-center justify-center group-hover:bg-red-500/20 group-hover:border-red-500/50 transition-all">
                    <X className="w-6 h-6 text-slate-500 group-hover:text-red-400 transition-colors" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-white mb-1">Skip Tournaments</h4>
                    <div className="text-slate-400">
                      Continue with league matches instead
                    </div>
                    <p className="text-slate-500 text-sm mt-2">
                      You can focus on league position and wait for the next tournament opportunity
                    </p>
                  </div>
                </div>
                
                <Button 
                  variant="outline"
                  disabled={choosing}
                  className="border-slate-600 text-slate-400 hover:text-white hover:border-red-500/50 px-6"
                >
                  {choosing ? (
                    <Clock className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <ChevronRight className="w-4 h-4 mr-2" />
                  )}
                  Continue League
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* FIFA-style Info Panel */}
        <Card className="bg-slate-800/30 border-white/5 p-6">
          <div className="text-center">
            <h4 className="text-lg font-semibold text-white mb-3">FIFA-Style Tournament System</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-slate-400">
              <div>
                <div className="font-semibold text-white mb-1">Tournament Format</div>
                <div>Single elimination bracket with {career.tier === 3 ? 'best-of-5' : 'best-of-3'} matches</div>
              </div>
              <div>
                <div className="font-semibold text-white mb-1">AI Opponents</div>
                <div>All other players are AI with skill-based difficulty</div>
              </div>
              <div>
                <div className="font-semibold text-white mb-1">League Continues</div>
                <div>After tournament, your league season continues normally</div>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-xs text-slate-500">
                Tournament results can trigger sponsor offers in Tier 3+ • 
                Reaching finals may unlock special promotion opportunities
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}