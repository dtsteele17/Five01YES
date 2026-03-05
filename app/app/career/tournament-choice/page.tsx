'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Trophy, Users, ArrowLeft, Loader2, X, CheckCircle } from 'lucide-react';

interface Tournament {
  name: string;
  size: number;
  description: string;
}

interface TournamentChoiceEvent {
  id: string;
  event_name: string;
  season: number;
  sequence_no: number;
  metadata: {
    description: string;
    tournaments: Tournament[];
    can_decline: boolean;
  };
}

export default function TournamentChoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const careerId = searchParams.get('careerId');
  const eventId = searchParams.get('eventId');
  
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<TournamentChoiceEvent | null>(null);
  const [selecting, setSelecting] = useState(false);
  
  useEffect(() => {
    if (careerId && eventId) {
      loadEvent();
    }
  }, [careerId, eventId]);

  async function loadEvent() {
    try {
      const supabase = createClient();
      
      // Get the tournament choice event details
      const { data: eventData, error } = await supabase
        .from('career_events')
        .select(`
          id, event_name, season, sequence_no,
          career_schedule_templates!template_id (metadata)
        `)
        .eq('id', eventId)
        .single();
        
      if (error) throw error;
      
      setEvent({
        id: eventData.id,
        event_name: eventData.event_name,
        season: eventData.season,
        sequence_no: eventData.sequence_no,
        metadata: eventData.career_schedule_templates?.metadata || {}
      });
    } catch (err: any) {
      toast.error('Failed to load tournament choices');
      console.error(err);
      router.back();
    } finally {
      setLoading(false);
    }
  }

  async function handleTournamentChoice(choice: number) {
    if (!careerId || !eventId) return;
    
    setSelecting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('rpc_career_tournament_choice', {
        p_career_id: careerId,
        p_event_id: eventId,
        p_tournament_choice: choice
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      if (data?.declined) {
        toast.info('Tournament declined - continuing with league play');
        router.push(`/app/career?id=${careerId}`);
      } else if (data?.tournament_chosen) {
        toast.success(`${data.tournament_name} selected!`);
        // Redirect to the tournament bracket page
        router.push(`/app/career/bracket?careerId=${careerId}&eventId=${eventId}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to process tournament choice');
    } finally {
      setSelecting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-white text-center">
          <p>Tournament choice not found</p>
          <Button onClick={() => router.back()} className="mt-4">Go Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.push(`/app/career?id=${careerId}`)}
            className="text-slate-400 hover:text-white px-2"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Trophy className="w-6 h-6 text-amber-400" />
          <div>
            <h1 className="text-2xl font-black text-white">{event.event_name}</h1>
            <p className="text-slate-400 text-sm">Season {event.season}</p>
          </div>
        </div>

        {/* Description */}
        <Card className="bg-slate-800/50 border-slate-700 mb-8">
          <div className="p-6">
            <p className="text-slate-300 text-center text-lg">
              {event.metadata.description}
            </p>
          </div>
        </Card>

        {/* Tournament Options */}
        <div className="grid gap-6 max-w-4xl mx-auto">
          {event.metadata.tournaments?.map((tournament, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="bg-gradient-to-r from-slate-800/80 to-slate-700/80 border-slate-600 hover:border-amber-400/50 transition-all cursor-pointer">
                <div 
                  className="p-6 flex items-center justify-between"
                  onClick={() => !selecting && handleTournamentChoice(index + 1)}
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-amber-400/20 p-3 rounded-lg">
                      <Trophy className="w-8 h-8 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">
                        {tournament.name}
                      </h3>
                      <p className="text-slate-300 mb-2">
                        {tournament.description}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-amber-400">
                        <Users className="w-4 h-4" />
                        <span>{tournament.size} Players</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      size="lg"
                      className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold"
                      disabled={selecting}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTournamentChoice(index + 1);
                      }}
                    >
                      {selecting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Select
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
          
          {/* Decline Option */}
          {event.metadata.can_decline && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: event.metadata.tournaments?.length * 0.1 + 0.1 }}
            >
              <Card className="bg-slate-800/30 border-slate-600 hover:border-slate-500 transition-all">
                <div className="p-6 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-slate-600/20 p-3 rounded-lg">
                      <X className="w-8 h-8 text-slate-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">
                        Skip Tournament
                      </h3>
                      <p className="text-slate-300">
                        Continue with league play instead
                      </p>
                    </div>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="lg"
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                    disabled={selecting}
                    onClick={() => handleTournamentChoice(0)}
                  >
                    {selecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Skip'
                    )}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </div>

        {/* Additional Info */}
        <div className="text-center mt-8">
          <p className="text-slate-400 text-sm">
            Choose wisely - tournament performance affects your career progression and sponsor opportunities
          </p>
        </div>
      </div>
    </div>
  );
}