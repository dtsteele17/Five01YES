'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TournamentBracket } from './TournamentBracket';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Users, Target, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Tournament {
  id: string;
  name: string;
  status: string;
  max_participants: number;
  bracket_generated_at: string | null;
}

interface TournamentBracketTabProps {
  tournamentId: string;
}

export default function TournamentBracketTab({ tournamentId }: TournamentBracketTabProps) {
  const supabase = createClient();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTournament();
    loadCurrentUser();
  }, [tournamentId]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  const loadTournament = async () => {
    try {
      setLoading(true);
      
      const { data: tournamentData, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .single();

      if (error) throw error;
      if (!tournamentData) throw new Error('Tournament not found');

      setTournament(tournamentData);
      setIsCreator(currentUserId === tournamentData.created_by);
    } catch (error) {
      console.error('Error loading tournament:', error);
      toast.error('Failed to load tournament');
    } finally {
      setLoading(false);
    }
  };

  const generateBracket = async () => {
    if (!tournament || tournament.bracket_generated_at) return;

    try {
      const { error } = await supabase.rpc('generate_tournament_bracket', {
        p_tournament_id: tournamentId
      });

      if (error) throw error;

      toast.success('Tournament bracket generated!');
      loadTournament(); // Reload to update bracket_generated_at
    } catch (error: any) {
      console.error('Error generating bracket:', error);
      toast.error(error.message || 'Failed to generate bracket');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="text-center py-12">
        <Trophy className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-300 mb-2">Tournament Not Found</h3>
        <p className="text-slate-400">Unable to load tournament data.</p>
      </div>
    );
  }

  // Show bracket generation option if bracket hasn't been generated
  if (!tournament.bracket_generated_at && tournament.status === 'registration') {
    return (
      <div className="space-y-6">
        <Card className="bg-slate-800/30 border-slate-700">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-white">Bracket Setup</CardTitle>
                <p className="text-sm text-slate-400">Generate the tournament bracket to begin matches</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-900/50 rounded-lg p-4 space-y-3">
              <h4 className="font-semibold text-white">Tournament Status</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Format:</span>
                  <span className="text-white">Single Elimination</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Max Players:</span>
                  <span className="text-white">{tournament.max_participants}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span className="text-emerald-400 capitalize">{tournament.status}</span>
                </div>
              </div>
            </div>

            {isCreator && tournament.status === 'registration' && (
              <div className="text-center pt-4">
                <Button
                  onClick={generateBracket}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  Generate Bracket
                </Button>
                <p className="text-xs text-slate-500 mt-2">
                  This will create the tournament bracket and prepare for matches
                </p>
              </div>
            )}

            {!isCreator && (
              <div className="text-center pt-4">
                <p className="text-slate-400 text-sm">
                  Waiting for tournament organizer to generate the bracket...
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show the interactive bracket
  return (
    <div className="space-y-6">
      <TournamentBracket
        tournamentId={tournamentId}
        isCreator={isCreator}
        tournamentStatus={tournament.status}
      />
    </div>
  );
}