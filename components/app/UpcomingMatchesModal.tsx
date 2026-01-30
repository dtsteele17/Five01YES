'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Clock, Trophy, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface UpcomingMatch {
  id: string;
  opponentName: string;
  scheduledAt: Date;
  leagueName?: string;
  tournamentName?: string;
}

interface UpcomingMatchesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpcomingMatchesModal({ open, onOpenChange }: UpcomingMatchesModalProps) {
  const [leagueMatches, setLeagueMatches] = useState<Record<string, UpcomingMatch[]>>({});
  const [tournamentMatches, setTournamentMatches] = useState<Record<string, UpcomingMatch[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchUpcomingMatches();
    }
  }, [open]);

  const fetchUpcomingMatches = async () => {
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      // Fetch league fixtures
      const { data: leagueFixtures } = await supabase
        .from('fixtures')
        .select(`
          id,
          scheduled_at,
          home_user_id,
          away_user_id,
          status,
          leagues!inner(name),
          home_player:profiles!fixtures_home_user_id_fkey(display_name, username),
          away_player:profiles!fixtures_away_user_id_fkey(display_name, username)
        `)
        .or(`home_user_id.eq.${user.id},away_user_id.eq.${user.id}`)
        .eq('status', 'scheduled')
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true });

      // Fetch tournament matches (using mock data structure - replace when tournament matches are implemented)
      const { data: tournamentEntries } = await supabase
        .from('tournament_entries')
        .select(`
          tournament_id,
          tournaments!inner(name, start_date, status)
        `)
        .eq('user_id', user.id)
        .in('tournaments.status', ['open', 'active']);

      // Group league fixtures by league name
      const groupedLeague: Record<string, UpcomingMatch[]> = {};
      leagueFixtures?.forEach((fixture: any) => {
        const leagueName = fixture.leagues.name;
        const isHome = fixture.home_user_id === user.id;
        const opponent = isHome ? fixture.away_player : fixture.home_player;

        if (!groupedLeague[leagueName]) {
          groupedLeague[leagueName] = [];
        }

        groupedLeague[leagueName].push({
          id: fixture.id,
          opponentName: opponent?.display_name || opponent?.username || 'Unknown',
          scheduledAt: new Date(fixture.scheduled_at),
          leagueName,
        });
      });

      // Group tournament entries by tournament name (mock structure)
      const groupedTournament: Record<string, UpcomingMatch[]> = {};
      tournamentEntries?.forEach((entry: any) => {
        const tournamentName = entry.tournaments.name;

        if (!groupedTournament[tournamentName]) {
          groupedTournament[tournamentName] = [];
        }

        // This is a placeholder - replace with actual tournament match data when available
        if (new Date(entry.tournaments.start_date) > new Date()) {
          groupedTournament[tournamentName].push({
            id: entry.tournament_id,
            opponentName: 'TBD',
            scheduledAt: new Date(entry.tournaments.start_date),
            tournamentName,
          });
        }
      });

      setLeagueMatches(groupedLeague);
      setTournamentMatches(groupedTournament);
    } catch (error) {
      console.error('Error fetching upcoming matches:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const hasLeagueMatches = Object.keys(leagueMatches).length > 0;
  const hasTournamentMatches = Object.keys(tournamentMatches).length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] bg-slate-900 border-white/10">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">Upcoming Matches</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-400">Loading matches...</div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* League Matches Section */}
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <Users className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-lg font-semibold text-white">League Matches</h3>
                </div>

                {!hasLeagueMatches ? (
                  <div className="p-6 bg-white/5 rounded-xl border border-white/5 text-center">
                    <p className="text-gray-400">No upcoming league games.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(leagueMatches).map(([leagueName, matches]) => (
                      <div key={leagueName}>
                        <h4 className="text-sm font-medium text-emerald-400 mb-3">{leagueName}</h4>
                        <div className="space-y-3">
                          {matches.map((match) => (
                            <div
                              key={match.id}
                              className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors"
                            >
                              <div>
                                <p className="text-white font-medium">
                                  You vs {match.opponentName}
                                </p>
                                <div className="flex items-center space-x-4 mt-1">
                                  <div className="flex items-center text-gray-400 text-sm">
                                    <Calendar className="w-3.5 h-3.5 mr-1.5" />
                                    {formatDate(match.scheduledAt)}
                                  </div>
                                  <div className="flex items-center text-gray-400 text-sm">
                                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                                    {formatTime(match.scheduledAt)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tournament Matches Section */}
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <Trophy className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-lg font-semibold text-white">Tournament Matches</h3>
                </div>

                {!hasTournamentMatches ? (
                  <div className="p-6 bg-white/5 rounded-xl border border-white/5 text-center">
                    <p className="text-gray-400">No upcoming tournaments.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(tournamentMatches).map(([tournamentName, matches]) => (
                      <div key={tournamentName}>
                        <h4 className="text-sm font-medium text-emerald-400 mb-3">{tournamentName}</h4>
                        <div className="space-y-3">
                          {matches.map((match) => (
                            <div
                              key={match.id}
                              className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors"
                            >
                              <div>
                                <p className="text-white font-medium">
                                  You vs {match.opponentName}
                                </p>
                                <div className="flex items-center space-x-4 mt-1">
                                  <div className="flex items-center text-gray-400 text-sm">
                                    <Calendar className="w-3.5 h-3.5 mr-1.5" />
                                    {formatDate(match.scheduledAt)}
                                  </div>
                                  <div className="flex items-center text-gray-400 text-sm">
                                    <Clock className="w-3.5 h-3.5 mr-1.5" />
                                    {formatTime(match.scheduledAt)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
