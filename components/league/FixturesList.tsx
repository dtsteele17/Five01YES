"use client";

import { League, Fixture } from '@/lib/context/LeaguesContext';
import { useLeagues } from '@/lib/context/LeaguesContext';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface FixturesListProps {
  league: League;
}

export default function FixturesList({ league }: FixturesListProps) {
  const router = useRouter();
  const { state } = useLeagues();
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'completed'>('all');
  const [playerFilter, setPlayerFilter] = useState<string>('all');
  const [startingMatch, setStartingMatch] = useState<string | null>(null);

  let filteredFixtures = league.fixtures;

  if (filter === 'upcoming') {
    filteredFixtures = filteredFixtures.filter(f => f.status === 'Scheduled');
  } else if (filter === 'completed') {
    filteredFixtures = filteredFixtures.filter(f => f.status === 'Completed');
  }

  if (playerFilter !== 'all') {
    filteredFixtures = filteredFixtures.filter(
      f => f.homePlayerId === playerFilter || f.awayPlayerId === playerFilter
    );
  }

  const groupedFixtures = filteredFixtures.reduce((acc, fixture) => {
    const matchday = fixture.matchday || 1;
    if (!acc[matchday]) {
      acc[matchday] = [];
    }
    acc[matchday].push(fixture);
    return acc;
  }, {} as Record<number, Fixture[]>);

  const sortedMatchdays = Object.keys(groupedFixtures)
    .map(Number)
    .sort((a, b) => a - b);

  const handleStartMatch = async (matchId: string) => {
    setStartingMatch(matchId);
    const supabase = createClient();

    try {
      const { data, error } = await supabase.rpc('create_room_for_league_match', {
        p_league_match_id: matchId
      });

      if (error) throw error;

      const roomId = data;
      toast.success('Match starting!');
      router.push(`/app/play/quick-match/match/${roomId}`);
    } catch (error: any) {
      console.error('Failed to start match:', error);
      toast.error(error.message || 'Failed to start match');
      setStartingMatch(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
            className={filter === 'all' ? 'bg-teal-600 hover:bg-teal-700' : ''}
          >
            All
          </Button>
          <Button
            variant={filter === 'upcoming' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('upcoming')}
            className={filter === 'upcoming' ? 'bg-teal-600 hover:bg-teal-700' : ''}
          >
            Upcoming
          </Button>
          <Button
            variant={filter === 'completed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('completed')}
            className={filter === 'completed' ? 'bg-teal-600 hover:bg-teal-700' : ''}
          >
            Completed
          </Button>
        </div>

        <Select value={playerFilter} onValueChange={setPlayerFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by player" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Players</SelectItem>
            {league.players.map(player => (
              <SelectItem key={player.id} value={player.id}>
                {player.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-6">
        {sortedMatchdays.map(matchday => (
          <div key={matchday}>
            <div className="flex items-center gap-2 mb-4">
              <div className="bg-gradient-to-r from-teal-500 to-cyan-600 rounded-lg px-3 py-1">
                <span className="text-white font-semibold text-sm">Matchday {matchday}</span>
              </div>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            <div className="space-y-3">
              {groupedFixtures[matchday].map(fixture => {
                const homePlayer = league.players.find(p => p.id === fixture.homePlayerId);
                const awayPlayer = league.players.find(p => p.id === fixture.awayPlayerId);

                if (!homePlayer || !awayPlayer) return null;

                const isUserMatch = fixture.homePlayerId === state.currentUserId ||
                                   fixture.awayPlayerId === state.currentUserId;
                const canPlayMatch = isUserMatch && fixture.status === 'Scheduled';

                return (
                  <div
                    key={fixture.matchId}
                    className={`
                      bg-slate-800/30 backdrop-blur-sm border rounded-xl p-4 transition-all
                      ${isUserMatch
                        ? 'border-teal-500/30 hover:border-teal-500/50'
                        : 'border-slate-700/30 hover:border-slate-700/50'
                      }
                    `}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3 text-sm text-slate-400">
                          <Calendar className="w-4 h-4" />
                          <span>{format(fixture.dateTime, 'EEE, MMM d, yyyy')}</span>
                          <Clock className="w-4 h-4 ml-2" />
                          <span>{format(fixture.dateTime, 'HH:mm')}</span>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-3 flex-1">
                            <div className="text-right flex-1">
                              <div className={`font-medium ${
                                fixture.homePlayerId === state.currentUserId
                                  ? 'text-teal-400'
                                  : 'text-white'
                              }`}>
                                {homePlayer.displayName}
                              </div>
                            </div>

                            {fixture.status === 'Completed' ? (
                              <div className="flex items-center gap-3 bg-slate-900/50 rounded-lg px-4 py-2">
                                <span className={`text-2xl font-bold ${
                                  (fixture.legsWonHome || 0) > (fixture.legsWonAway || 0)
                                    ? 'text-green-400'
                                    : 'text-slate-400'
                                }`}>
                                  {fixture.legsWonHome}
                                </span>
                                <span className="text-slate-600">-</span>
                                <span className={`text-2xl font-bold ${
                                  (fixture.legsWonAway || 0) > (fixture.legsWonHome || 0)
                                    ? 'text-green-400'
                                    : 'text-slate-400'
                                }`}>
                                  {fixture.legsWonAway}
                                </span>
                              </div>
                            ) : (
                              <div className="bg-slate-900/50 rounded-lg px-4 py-2">
                                <span className="text-slate-400 text-sm">vs</span>
                              </div>
                            )}

                            <div className="flex-1">
                              <div className={`font-medium ${
                                fixture.awayPlayerId === state.currentUserId
                                  ? 'text-teal-400'
                                  : 'text-white'
                              }`}>
                                {awayPlayer.displayName}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge
                          variant={fixture.status === 'Completed' ? 'secondary' : 'default'}
                          className={
                            fixture.status === 'Completed'
                              ? 'bg-green-500/20 text-green-400 border-green-500/30'
                              : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                          }
                        >
                          {fixture.status}
                        </Badge>

                        {canPlayMatch ? (
                          <Button
                            size="sm"
                            className="bg-teal-600 hover:bg-teal-700"
                            onClick={() => handleStartMatch(fixture.matchId)}
                            disabled={startingMatch === fixture.matchId}
                          >
                            {startingMatch === fixture.matchId ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Starting...
                              </>
                            ) : (
                              <>
                                Play Match
                                <ChevronRight className="w-4 h-4 ml-1" />
                              </>
                            )}
                          </Button>
                        ) : fixture.status === 'Completed' ? (
                          <Button size="sm" variant="outline">
                            View
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {filteredFixtures.length === 0 && (
        <div className="text-center py-12">
          <div className="text-slate-400 mb-2">No fixtures found</div>
          <div className="text-slate-500 text-sm">
            {filter !== 'all'
              ? 'Try changing the filter'
              : 'Fixtures will be generated based on league settings'
            }
          </div>
        </div>
      )}
    </div>
  );
}
