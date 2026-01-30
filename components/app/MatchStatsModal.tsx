'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Target, Trophy, TrendingUp, Award } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface MatchStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
}

interface MatchData {
  id: string;
  match_type: string;
  game_mode: string;
  match_format: string;
  player1_name: string;
  player2_name: string;
  player1_legs_won: number;
  player2_legs_won: number;
  winner_name: string | null;
  completed_at: string | null;
  user_id: string;
  user_avg: number | null;
  opponent_avg: number | null;
  user_first9_avg: number | null;
  opponent_first9_avg: number | null;
  user_checkout_pct: number | null;
  opponent_checkout_pct: number | null;
}

interface MatchPlayerData {
  player: string;
  three_dart_average: number;
  first_9_dart_avg: number;
  highest_score: number;
  highest_checkout: number;
  checkout_percentage: number;
  checkout_darts_attempted: number;
  checkout_hits: number;
  count_100_plus: number;
  count_140_plus: number;
  count_180: number;
}

interface LegData {
  leg_number: number;
  winner: string;
  player1_darts_thrown: number;
  player2_darts_thrown: number;
}

const MODE_LABELS: Record<string, string> = {
  'ranked': 'Ranked',
  'quick': 'Quick Match',
  'private': 'Private',
  'training': 'Training',
  'league': 'League',
  'tournament': 'Tournament',
};

export function MatchStatsModal({ isOpen, onClose, matchId }: MatchStatsModalProps) {
  const [match, setMatch] = useState<MatchData | null>(null);
  const [player1Stats, setPlayer1Stats] = useState<MatchPlayerData | null>(null);
  const [player2Stats, setPlayer2Stats] = useState<MatchPlayerData | null>(null);
  const [legs, setLegs] = useState<LegData[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && matchId) {
      fetchMatchStats();
    }
  }, [isOpen, matchId]);

  async function fetchMatchStats() {
    setLoading(true);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUserId(user.id);

    const { data: matchData } = await supabase
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (matchData) {
      setMatch(matchData);

      const { data: matchPlayersData } = await supabase
        .from('match_players')
        .select('*')
        .eq('match_id', matchId)
        .order('seat', { ascending: true });

      if (matchPlayersData && matchPlayersData.length >= 2) {
        const p1Data = matchPlayersData[0];
        const p2Data = matchPlayersData[1];

        setPlayer1Stats({
          player: 'player1',
          three_dart_average: Number(p1Data.avg_3dart) || 0,
          first_9_dart_avg: Number(p1Data.first_9_dart_avg) || 0,
          highest_score: Number(p1Data.highest_score) || 0,
          highest_checkout: Number(p1Data.highest_checkout) || 0,
          checkout_percentage: Number(p1Data.checkout_percentage) || 0,
          checkout_darts_attempted: Number(p1Data.checkout_darts_attempted) || 0,
          checkout_hits: Number(p1Data.checkout_hits) || 0,
          count_100_plus: Number(p1Data.count_100_plus) || 0,
          count_140_plus: Number(p1Data.count_140_plus) || 0,
          count_180: Number(p1Data.count_180) || 0,
        });

        setPlayer2Stats({
          player: 'player2',
          three_dart_average: Number(p2Data.avg_3dart) || 0,
          first_9_dart_avg: Number(p2Data.first_9_dart_avg) || 0,
          highest_score: Number(p2Data.highest_score) || 0,
          highest_checkout: Number(p2Data.highest_checkout) || 0,
          checkout_percentage: Number(p2Data.checkout_percentage) || 0,
          checkout_darts_attempted: Number(p2Data.checkout_darts_attempted) || 0,
          checkout_hits: Number(p2Data.checkout_hits) || 0,
          count_100_plus: Number(p2Data.count_100_plus) || 0,
          count_140_plus: Number(p2Data.count_140_plus) || 0,
          count_180: Number(p2Data.count_180) || 0,
        });
      }
    }

    const { data: legsData } = await supabase
      .from('match_legs')
      .select('*')
      .eq('match_id', matchId)
      .order('leg_number', { ascending: true });

    if (legsData) {
      setLegs(legsData);
    }

    setLoading(false);
  }

  const computeFirst9Average = (stats: MatchPlayerData | null): number => {
    if (stats && stats.first_9_dart_avg !== null && stats.first_9_dart_avg !== undefined) {
      return Number(stats.first_9_dart_avg);
    }
    return 0;
  };

  const isPlayer1User = match?.user_id === userId;
  const userStats = isPlayer1User ? player1Stats : player2Stats;
  const opponentStats = isPlayer1User ? player2Stats : player1Stats;
  const userName = isPlayer1User ? match?.player1_name : match?.player2_name;
  const opponentName = isPlayer1User ? match?.player2_name : match?.player1_name;
  const userLegsWon = isPlayer1User ? match?.player1_legs_won : match?.player2_legs_won;
  const opponentLegsWon = isPlayer1User ? match?.player2_legs_won : match?.player1_legs_won;

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Match Stats</DialogTitle>
          <p className="text-gray-400 text-sm">
            {userName} vs {opponentName} • {MODE_LABELS[match?.match_type || ''] || match?.match_type} • {match?.game_mode} • {match?.match_format?.replace('best-of-', 'Best of ')}
            {match?.completed_at && ` • ${new Date(match.completed_at).toLocaleDateString()}`}
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-400">Loading stats...</div>
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="bg-slate-800/50 border-white/10 p-6">
                <div className="flex items-center space-x-3 mb-6">
                  <Avatar className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500">
                    <div className="w-full h-full flex items-center justify-center text-white font-bold">
                      {userName?.charAt(0).toUpperCase()}
                    </div>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-bold text-white">{userName}</h3>
                    <p className="text-sm text-gray-400">You</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <StatRow icon={Target} label="3-Dart Average" value={userStats ? Number(userStats.three_dart_average).toFixed(1) : '—'} />
                  <StatRow icon={TrendingUp} label="First 9 Dart Avg" value={computeFirst9Average(userStats).toFixed(1)} />
                  <StatRow icon={Award} label="Highest Score" value={userStats?.highest_score.toString() || '—'} />
                  <StatRow
                    icon={Target}
                    label="Checkout %"
                    value={userStats ? `${Number(userStats.checkout_percentage).toFixed(1)}% (${userStats.checkout_hits}/${userStats.checkout_darts_attempted})` : '—'}
                  />
                  <StatRow icon={Award} label="Highest Checkout" value={userStats?.highest_checkout ? userStats.highest_checkout.toString() : '0'} color={userStats?.highest_checkout ? 'text-emerald-400' : 'text-gray-400'} />
                  <StatRow icon={Trophy} label="180s" value={userStats?.count_180.toString() || '0'} />
                  <StatRow icon={Trophy} label="140+" value={userStats?.count_140_plus.toString() || '0'} />
                  <StatRow icon={Trophy} label="100+" value={userStats?.count_100_plus.toString() || '0'} />
                  <StatRow icon={Trophy} label="Legs Won" value={userLegsWon?.toString() || '0'} color={Number(userLegsWon) > Number(opponentLegsWon) ? 'text-emerald-400' : 'text-gray-400'} />
                </div>
              </Card>

              <Card className="bg-slate-800/50 border-white/10 p-6">
                <div className="flex items-center space-x-3 mb-6">
                  <Avatar className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500">
                    <div className="w-full h-full flex items-center justify-center text-white font-bold">
                      {opponentName?.charAt(0).toUpperCase()}
                    </div>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-bold text-white">{opponentName}</h3>
                    <p className="text-sm text-gray-400">Opponent</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <StatRow icon={Target} label="3-Dart Average" value={opponentStats ? Number(opponentStats.three_dart_average).toFixed(1) : '—'} />
                  <StatRow icon={TrendingUp} label="First 9 Dart Avg" value={computeFirst9Average(opponentStats).toFixed(1)} />
                  <StatRow icon={Award} label="Highest Score" value={opponentStats?.highest_score.toString() || '—'} />
                  <StatRow
                    icon={Target}
                    label="Checkout %"
                    value={opponentStats ? `${Number(opponentStats.checkout_percentage).toFixed(1)}% (${opponentStats.checkout_hits}/${opponentStats.checkout_darts_attempted})` : '—'}
                  />
                  <StatRow icon={Award} label="Highest Checkout" value={opponentStats?.highest_checkout ? opponentStats.highest_checkout.toString() : '0'} color={opponentStats?.highest_checkout ? 'text-emerald-400' : 'text-gray-400'} />
                  <StatRow icon={Trophy} label="180s" value={opponentStats?.count_180.toString() || '0'} />
                  <StatRow icon={Trophy} label="140+" value={opponentStats?.count_140_plus.toString() || '0'} />
                  <StatRow icon={Trophy} label="100+" value={opponentStats?.count_100_plus.toString() || '0'} />
                  <StatRow icon={Trophy} label="Legs Won" value={opponentLegsWon?.toString() || '0'} color={Number(opponentLegsWon) > Number(userLegsWon) ? 'text-emerald-400' : 'text-gray-400'} />
                </div>
              </Card>
            </div>

            {legs.length > 0 && (
              <Card className="bg-slate-800/50 border-white/10 p-6">
                <h3 className="text-lg font-bold text-white mb-4">Leg-by-Leg Breakdown</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Leg</th>
                        <th className="text-left py-3 px-4 text-gray-400 font-medium">Winner</th>
                        <th className="text-right py-3 px-4 text-gray-400 font-medium">Darts Thrown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legs.map((leg) => {
                        const winnerName = leg.winner === 'player1'
                          ? (isPlayer1User ? userName : opponentName)
                          : (isPlayer1User ? opponentName : userName);
                        const dartsThrown = leg.winner === 'player1' ? leg.player1_darts_thrown : leg.player2_darts_thrown;
                        const isUserWinner = (leg.winner === 'player1' && isPlayer1User) || (leg.winner === 'player2' && !isPlayer1User);

                        return (
                          <tr key={leg.leg_number} className="border-b border-white/5">
                            <td className="py-3 px-4 text-white">Leg {leg.leg_number}</td>
                            <td className={`py-3 px-4 font-medium ${isUserWinner ? 'text-emerald-400' : 'text-orange-400'}`}>
                              {winnerName}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-400">{dartsThrown}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <div className="flex justify-end">
              <Button onClick={onClose} className="bg-emerald-500 hover:bg-emerald-600 text-white">
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatRow({
  icon: Icon,
  label,
  value,
  color = 'text-white'
}: {
  icon: any;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-white/5 rounded-lg">
      <div className="flex items-center space-x-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <span className="text-gray-300 text-sm">{label}</span>
      </div>
      <span className={`font-bold ${color}`}>{value}</span>
    </div>
  );
}
