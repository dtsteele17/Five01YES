'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Crown, Trophy, Loader2 } from 'lucide-react';

interface TournamentMatch {
  id: string;
  tournament_id: string;
  round: number;
  match_index: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  match_room_id: string | null;
  status: string;
}

interface MatchScore {
  player1_legs: number;
  player2_legs: number;
}

interface TournamentBracketProps {
  tournamentId: string;
  isCreator?: boolean;
  tournamentStatus?: string;
}

interface PlayerProfile {
  username: string | null;
  avatar_url: string | null;
}

export function TournamentBracket({ tournamentId, tournamentStatus }: TournamentBracketProps) {
  const supabase = createClient();
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [profiles, setProfiles] = useState<Record<string, PlayerProfile>>({});
  const [loading, setLoading] = useState(true);
  const [totalRounds, setTotalRounds] = useState(0);
  const [liveScores, setLiveScores] = useState<Record<string, MatchScore>>({});

  useEffect(() => {
    loadBracket();
    // Refresh bracket every 5s for live scores
    const interval = setInterval(loadBracket, 5000);

    // Subscribe to tournament match updates for instant bracket progression
    const sub = supabase
      .channel(`bracket-${tournamentId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournament_matches', filter: `tournament_id=eq.${tournamentId}` }, () => {
        loadBracket();
      })
      .subscribe();

    return () => { clearInterval(interval); sub.unsubscribe(); };
  }, [tournamentId]);

  const loadBracket = async () => {
    try {
      // Load matches without joins
      const { data: matchesData, error } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', tournamentId)
        .order('round')
        .order('match_index');

      if (error) throw error;
      if (!matchesData || matchesData.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }

      setMatches(matchesData);

      // Calculate total rounds
      const maxRound = Math.max(...matchesData.map(m => m.round));
      setTotalRounds(maxRound);

      // Get all player IDs
      const playerIds = new Set<string>();
      matchesData.forEach(m => {
        if (m.player1_id) playerIds.add(m.player1_id);
        if (m.player2_id) playerIds.add(m.player2_id);
        if (m.winner_id) playerIds.add(m.winner_id);
      });

      // Fetch profiles
      if (playerIds.size > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('user_id, username, avatar_url')
          .in('user_id', Array.from(playerIds));

        const profileMap: Record<string, PlayerProfile> = {};
        profileData?.forEach(p => {
          profileMap[p.user_id] = { username: p.username, avatar_url: p.avatar_url };
        });
        setProfiles(profileMap);
      }

      // Fetch live scores for active matches (matches with match_room_id)
      const activeRoomIds = matchesData
        .filter(m => m.match_room_id && m.status !== 'completed')
        .map(m => m.match_room_id!);

      const completedRoomIds = matchesData
        .filter(m => m.match_room_id && m.status === 'completed')
        .map(m => m.match_room_id!);

      const allRoomIds = [...activeRoomIds, ...completedRoomIds];

      if (allRoomIds.length > 0) {
        const { data: roomData } = await supabase
          .from('match_rooms')
          .select('id, player1_legs, player2_legs')
          .in('id', allRoomIds);

        if (roomData) {
          const scores: Record<string, MatchScore> = {};
          roomData.forEach(room => {
            const tmMatch = matchesData.find(m => m.match_room_id === room.id);
            if (tmMatch) {
              scores[tmMatch.id] = {
                player1_legs: room.player1_legs || 0,
                player2_legs: room.player2_legs || 0,
              };
            }
          });
          setLiveScores(scores);
        }
      }
    } catch (error) {
      console.error('Error loading bracket:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPlayerName = (playerId: string | null) => {
    if (!playerId) return 'TBD';
    return profiles[playerId]?.username || 'Unknown';
  };

  const getRoundName = (round: number) => {
    const roundsFromEnd = totalRounds - round;
    if (roundsFromEnd === 0) return 'Final';
    if (roundsFromEnd === 1) return 'Semi-Final';
    if (roundsFromEnd === 2) return 'Quarter-Final';
    return `Round ${round}`;
  };

  const getMatchesByRound = () => {
    const rounds: Record<number, TournamentMatch[]> = {};
    matches.forEach(match => {
      if (!rounds[match.round]) rounds[match.round] = [];
      rounds[match.round].push(match);
    });
    return rounds;
  };

  // Find the champion (winner of final match)
  const getChampion = () => {
    const finalMatch = matches.find(m => m.round === totalRounds);
    if (finalMatch?.winner_id) return getPlayerName(finalMatch.winner_id);
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-300 mb-2">Bracket Not Generated Yet</h3>
        <p className="text-slate-400">The bracket will appear when the tournament starts.</p>
      </div>
    );
  }

  const roundsData = getMatchesByRound();
  const roundNumbers = Object.keys(roundsData).map(Number).sort((a, b) => a - b);
  const champion = getChampion();

  return (
    <div className="w-full overflow-x-auto pb-4">
      <div className="flex items-stretch gap-0 min-w-max px-4">
        {roundNumbers.map((roundNum, roundIndex) => {
          const roundMatches = roundsData[roundNum];
          const roundName = getRoundName(roundNum);
          
          // Calculate vertical spacing - increases with each round
          const matchHeight = 72; // Height of each match slot
          const gap = matchHeight * Math.pow(2, roundIndex); // Exponentially increasing gap

          return (
            <div key={roundNum} className="flex flex-col items-center">
              {/* Round header */}
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-4">
                {roundName}
              </div>
              
              {/* Matches for this round */}
              <div 
                className="flex flex-col justify-around flex-1"
                style={{ gap: `${gap - matchHeight}px` }}
              >
                {roundMatches.map((match) => (
                  <div key={match.id} className="flex items-center">
                    {/* Match box */}
                    <div className="w-48 flex-shrink-0">
                      {/* Player 1 */}
                      <div className={`
                        flex items-center justify-between px-3 py-2 border rounded-t-lg text-sm
                        ${match.winner_id === match.player1_id && match.player1_id && match.player2_id
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold'
                          : match.winner_id && match.winner_id !== match.player1_id && match.player1_id && match.player2_id
                            ? 'bg-slate-800/40 border-slate-700/50 text-slate-500 line-through'
                            : match.status === 'in_progress'
                              ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                              : 'bg-slate-800/60 border-slate-700/50 text-slate-300'
                        }
                      `}>
                        <span className="truncate flex-1">{getPlayerName(match.player1_id)}</span>
                        <div className="flex items-center gap-1 ml-2">
                          {/* Live leg score */}
                          {(liveScores[match.id] || match.status === 'in_progress' || match.status === 'completed') && liveScores[match.id] && (
                            <span className={`text-xs font-bold min-w-[16px] text-center ${
                              match.winner_id === match.player1_id ? 'text-emerald-300' : 'text-white'
                            }`}>
                              {liveScores[match.id].player1_legs}
                            </span>
                          )}
                          {match.winner_id === match.player1_id && match.player1_id && match.player2_id && (
                            <Crown className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                      
                      {/* Player 2 */}
                      <div className={`
                        flex items-center justify-between px-3 py-2 border border-t-0 rounded-b-lg text-sm
                        ${match.winner_id === match.player2_id && match.player1_id && match.player2_id
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold'
                          : match.winner_id && match.winner_id !== match.player2_id && match.player1_id && match.player2_id
                            ? 'bg-slate-800/40 border-slate-700/50 text-slate-500 line-through'
                            : match.status === 'in_progress'
                              ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                              : 'bg-slate-800/60 border-slate-700/50 text-slate-300'
                        }
                      `}>
                        <span className="truncate flex-1">{getPlayerName(match.player2_id)}</span>
                        <div className="flex items-center gap-1 ml-2">
                          {/* Live leg score */}
                          {(liveScores[match.id] || match.status === 'in_progress' || match.status === 'completed') && liveScores[match.id] && (
                            <span className={`text-xs font-bold min-w-[16px] text-center ${
                              match.winner_id === match.player2_id ? 'text-emerald-300' : 'text-white'
                            }`}>
                              {liveScores[match.id].player2_legs}
                            </span>
                          )}
                          {match.winner_id === match.player2_id && match.player1_id && match.player2_id && (
                            <Crown className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Connector line to next round */}
                    {roundIndex < roundNumbers.length - 1 && (
                      <div className="w-8 flex-shrink-0 border-t border-slate-600" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Champion box */}
        {totalRounds > 0 && (
          <div className="flex flex-col items-center">
            <div className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-4 px-4">
              Champion
            </div>
            <div className="flex flex-col justify-center flex-1">
              <div className={`
                w-48 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 text-sm font-bold
                ${champion 
                  ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300'
                  : 'bg-slate-800/40 border-slate-700/50 text-slate-500'
                }
              `}>
                {champion ? (
                  <>
                    <Trophy className="w-5 h-5 text-yellow-400" />
                    <span>{champion} Wins!</span>
                  </>
                ) : (
                  <span>TBD</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
