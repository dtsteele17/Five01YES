'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Trophy, 
  Users, 
  Crown, 
  PlayCircle, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Target,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

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
  created_at: string;
  updated_at: string;
  player1?: {
    id: string;
    username: string | null;
  };
  player2?: {
    id: string;
    username: string | null;
  };
  player1_score?: number;
  player2_score?: number;
}

interface TournamentBracketProps {
  tournamentId: string;
  isCreator?: boolean;
  tournamentStatus?: string;
}

interface BracketRound {
  round: number;
  name: string;
  matches: TournamentMatch[];
}

const matchStatusConfig = {
  pending: {
    label: 'Waiting',
    color: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    icon: Clock
  },
  ready: {
    label: 'Ready',
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    icon: Users
  },
  in_progress: {
    label: 'Live',
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: PlayCircle,
    pulse: true
  },
  completed: {
    label: 'Complete',
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    icon: CheckCircle
  },
};

function MatchCard({ match, onClick, roundName }: { 
  match: TournamentMatch; 
  onClick: () => void; 
  roundName: string;
}) {
  const statusInfo = matchStatusConfig[match.status as keyof typeof matchStatusConfig] || matchStatusConfig.pending;
  const StatusIcon = statusInfo.icon;
  
  const player1Name = match.player1?.username || 'TBD';
  const player2Name = match.player2?.username || 'TBD';
  const hasWinner = match.winner_id;
  
  const isPlayer1Winner = match.winner_id === match.player1_id;
  const isPlayer2Winner = match.winner_id === match.player2_id;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <Card 
        className={`
          bg-slate-900/60 border-white/10 hover:border-white/20 transition-all cursor-pointer 
          ${match.status === 'in_progress' ? 'ring-1 ring-red-500/30' : ''}
          ${hasWinner ? 'border-emerald-500/30' : ''}
        `}
        onClick={onClick}
      >
        <CardContent className="p-4">
          {/* Match Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs text-slate-400 font-medium">{roundName}</div>
            <Badge
              className={`${statusInfo.color} text-xs border ${'pulse' in statusInfo && statusInfo.pulse ? 'animate-pulse' : ''}`}
            >
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusInfo.label}
            </Badge>
          </div>

          {/* Players */}
          <div className="space-y-2">
            {/* Player 1 */}
            <div className={`
              flex items-center gap-3 p-2 rounded-lg transition-all
              ${isPlayer1Winner 
                ? 'bg-emerald-500/10 border border-emerald-500/30' 
                : match.player1_id 
                  ? 'bg-slate-800/30' 
                  : 'bg-slate-800/10 border-2 border-dashed border-slate-700'
              }
            `}>
              <Avatar className="w-8 h-8">
                <AvatarFallback className={`
                  text-xs font-semibold
                  ${isPlayer1Winner ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}
                `}>
                  {match.player1_id ? player1Name[0]?.toUpperCase() : '?'}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className={`
                  font-medium truncate text-sm
                  ${isPlayer1Winner ? 'text-emerald-400' : match.player1_id ? 'text-white' : 'text-slate-500'}
                `}>
                  {player1Name}
                </div>
              </div>
              
              {/* Score/Winner Indicator */}
              <div className="flex items-center gap-2">
                {match.player1_score !== undefined && (
                  <div className={`
                    text-sm font-bold px-2 py-1 rounded
                    ${isPlayer1Winner ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}
                  `}>
                    {match.player1_score}
                  </div>
                )}
                {isPlayer1Winner && (
                  <Crown className="w-4 h-4 text-yellow-400" />
                )}
              </div>
            </div>

            {/* VS Indicator */}
            <div className="flex justify-center">
              <div className="text-xs text-slate-500 bg-slate-800/50 px-2 py-1 rounded">
                {match.status === 'in_progress' ? 'LIVE' : 'vs'}
              </div>
            </div>

            {/* Player 2 */}
            <div className={`
              flex items-center gap-3 p-2 rounded-lg transition-all
              ${isPlayer2Winner 
                ? 'bg-emerald-500/10 border border-emerald-500/30' 
                : match.player2_id 
                  ? 'bg-slate-800/30' 
                  : 'bg-slate-800/10 border-2 border-dashed border-slate-700'
              }
            `}>
              <Avatar className="w-8 h-8">
                <AvatarFallback className={`
                  text-xs font-semibold
                  ${isPlayer2Winner ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}
                `}>
                  {match.player2_id ? player2Name[0]?.toUpperCase() : '?'}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className={`
                  font-medium truncate text-sm
                  ${isPlayer2Winner ? 'text-emerald-400' : match.player2_id ? 'text-white' : 'text-slate-500'}
                `}>
                  {player2Name}
                </div>
              </div>
              
              {/* Score/Winner Indicator */}
              <div className="flex items-center gap-2">
                {match.player2_score !== undefined && (
                  <div className={`
                    text-sm font-bold px-2 py-1 rounded
                    ${isPlayer2Winner ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}
                  `}>
                    {match.player2_score}
                  </div>
                )}
                {isPlayer2Winner && (
                  <Crown className="w-4 h-4 text-yellow-400" />
                )}
              </div>
            </div>
          </div>

          {/* Action Button */}
          {match.status === 'in_progress' && (
            <Button size="sm" className="w-full mt-3 bg-red-600 hover:bg-red-700 text-white">
              <PlayCircle className="w-3 h-3 mr-1" />
              Watch Live
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function BracketConnector({ roundIndex, totalRounds }: { roundIndex: number; totalRounds: number }) {
  if (roundIndex === totalRounds - 1) return null;
  
  return (
    <div className="hidden lg:flex items-center justify-center w-8">
      <div className="w-full h-px bg-slate-700" />
      <div className="w-2 h-2 bg-slate-600 rounded-full -mx-1" />
      <div className="w-full h-px bg-slate-700" />
    </div>
  );
}

export function TournamentBracket({ tournamentId, isCreator, tournamentStatus }: TournamentBracketProps) {
  const router = useRouter();
  const supabase = createClient();
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<TournamentMatch | null>(null);

  useEffect(() => {
    loadMatches();
    
    // Subscribe to match updates
    const matchSubscription = supabase
      .channel(`tournament-matches-${tournamentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_matches',
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => {
          loadMatches();
        }
      )
      .subscribe();

    return () => {
      matchSubscription.unsubscribe();
    };
  }, [tournamentId]);

  const loadMatches = async () => {
    try {
      setLoading(true);
      
      const { data: matchesData, error } = await supabase
        .from('tournament_matches')
        .select(`
          *,
          player1:player1_id (id, username),
          player2:player2_id (id, username)
        `)
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true })
        .order('match_index', { ascending: true });

      if (error) throw error;

      setMatches(matchesData || []);
    } catch (error) {
      console.error('Error loading matches:', error);
      toast.error('Failed to load tournament bracket');
    } finally {
      setLoading(false);
    }
  };

  const handleMatchClick = (match: TournamentMatch) => {
    setSelectedMatch(match);
    
    if (match.match_room_id && match.status === 'in_progress') {
      // Navigate to live match
      router.push(`/app/play/quick-match/match/${match.match_room_id}`);
    }
  };

  const getRoundName = (round: number, totalRounds: number): string => {
    if (round === totalRounds) return 'Final';
    if (round === totalRounds - 1) return 'Semifinals';
    if (round === totalRounds - 2) return 'Quarterfinals';
    return `Round ${round}`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="bg-slate-900/60 border-white/10 animate-pulse">
              <CardContent className="p-4">
                <div className="space-y-3">
                  <div className="h-4 bg-slate-700 rounded w-1/3" />
                  <div className="space-y-2">
                    <div className="h-10 bg-slate-700 rounded" />
                    <div className="h-4 bg-slate-700 rounded w-8 mx-auto" />
                    <div className="h-10 bg-slate-700 rounded" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-slate-300 mb-2">No Bracket Generated</h3>
        <p className="text-slate-400">
          Tournament bracket will be created when the tournament starts.
        </p>
      </div>
    );
  }

  // Group matches by round
  const roundsMap = new Map<number, TournamentMatch[]>();
  matches.forEach(match => {
    if (!roundsMap.has(match.round)) {
      roundsMap.set(match.round, []);
    }
    roundsMap.get(match.round)!.push(match);
  });

  const rounds: BracketRound[] = Array.from(roundsMap.entries())
    .map(([round, roundMatches]) => ({
      round,
      name: getRoundName(round, Math.max(...matches.map(m => m.round))),
      matches: roundMatches.sort((a, b) => a.match_index - b.match_index)
    }))
    .sort((a, b) => a.round - b.round);

  return (
    <div className="space-y-6">
      {/* Tournament Status */}
      <div className="flex items-center justify-between p-4 bg-slate-800/30 rounded-lg border border-slate-700">
        <div className="flex items-center gap-3">
          <Trophy className="w-5 h-5 text-emerald-400" />
          <div>
            <h3 className="font-semibold text-white">Tournament Bracket</h3>
            <p className="text-sm text-slate-400">
              {rounds.length} rounds • Click matches for details
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-slate-400">
              {matches.filter(m => m.status === 'in_progress').length} live
            </span>
          </div>
          <div className="text-slate-600">•</div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-emerald-500 rounded-full" />
            <span className="text-slate-400">
              {matches.filter(m => m.status === 'completed').length} complete
            </span>
          </div>
        </div>
      </div>

      {/* Desktop Bracket Layout */}
      <div className="hidden lg:block overflow-x-auto">
        <div className="flex items-start gap-4 min-w-max p-4">
          {rounds.map((round, roundIndex) => (
            <div key={round.round} className="flex items-center">
              {/* Round Column */}
              <div className="space-y-4 min-w-[280px]">
                <div className="text-center">
                  <h3 className="font-bold text-white text-lg">{round.name}</h3>
                  <p className="text-xs text-slate-400">Round {round.round}</p>
                </div>
                
                <div className="space-y-4">
                  {round.matches.map((match, matchIndex) => (
                    <motion.div
                      key={match.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: roundIndex * 0.1 + matchIndex * 0.05 }}
                    >
                      <MatchCard 
                        match={match} 
                        onClick={() => handleMatchClick(match)}
                        roundName={round.name}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
              
              {/* Connector */}
              <BracketConnector roundIndex={roundIndex} totalRounds={rounds.length} />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile Bracket Layout */}
      <div className="lg:hidden space-y-6">
        {rounds.map(round => (
          <div key={round.round} className="space-y-4">
            <div className="text-center">
              <h3 className="font-bold text-white text-lg">{round.name}</h3>
              <p className="text-xs text-slate-400">Round {round.round}</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {round.matches.map(match => (
                <MatchCard 
                  key={match.id}
                  match={match} 
                  onClick={() => handleMatchClick(match)}
                  roundName={round.name}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Tournament Winner */}
      {tournamentStatus === 'completed' && rounds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border-yellow-500/30">
            <CardContent className="p-6 text-center">
              <Crown className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-white mb-2">Tournament Champion</h2>
              {(() => {
                const finalMatch = rounds[rounds.length - 1]?.matches[0];
                const winner = finalMatch?.winner_id === finalMatch?.player1_id 
                  ? finalMatch?.player1?.username 
                  : finalMatch?.player2?.username;
                
                return winner ? (
                  <p className="text-lg text-yellow-400 font-semibold">{winner}</p>
                ) : (
                  <p className="text-slate-400">Winner TBD</p>
                );
              })()}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}