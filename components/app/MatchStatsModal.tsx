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
import { Target, Trophy, TrendingUp, Award, Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface MatchStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId: string;
}

interface MatchHistoryData {
  id: string;
  room_id: string;
  user_id: string;
  opponent_id: string | null;
  game_mode: number;
  match_format: string;
  bot_level: number | null;
  result: 'win' | 'loss' | 'draw';
  legs_won: number;
  legs_lost: number;
  three_dart_avg: number | null;
  first9_avg: number | null;
  highest_checkout: number | null;
  checkout_percentage: number | null;
  darts_thrown: number | null;
  total_score: number | null;
  total_checkouts: number | null;
  checkout_attempts: number | null;
  visits_100_plus: number | null;
  visits_140_plus: number | null;
  visits_180: number | null;
  played_at: string;
  // For DartBot matches
  metadata?: {
    bot_stats?: {
      three_dart_avg: number;
      first9_avg: number;
      checkout_pct: number;
      highest_checkout: number;
      darts_at_double: number;
      total_darts: number;
      visits_100_plus: number;
      visits_140_plus: number;
      visits_180: number;
      total_score: number;
    };
  };
}

interface MatchStats {
  three_dart_average: number;
  first_9_dart_avg: number;
  highest_checkout: number;
  checkout_percentage: number;
  checkout_hits: number;
  checkout_attempts: number;
  count_100_plus: number;
  count_140_plus: number;
  count_180: number;
  legs_won: number;
  legs_lost: number;
  darts_thrown: number;
  total_score: number;
}

const MODE_LABELS: Record<string, string> = {
  'ranked': 'Ranked',
  'quick': 'Quick Match',
  'private': 'Private',
  'training': 'Training',
  'dartbot': 'vs DartBot',
  'league': 'League',
  'tournament': 'Tournament',
};

export function MatchStatsModal({ isOpen, onClose, matchId }: MatchStatsModalProps) {
  const [match, setMatch] = useState<MatchHistoryData | null>(null);
  const [userStats, setUserStats] = useState<MatchStats | null>(null);
  const [opponentStats, setOpponentStats] = useState<MatchStats | null>(null);
  const [userProfile, setUserProfile] = useState<{ username: string } | null>(null);
  const [opponentProfile, setOpponentProfile] = useState<{ username: string } | null>(null);
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

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setUserId(user.id);

      // Fetch the current user's match history entry
      const { data: userMatchData } = await supabase
        .from('match_history')
        .select('*')
        .eq('room_id', matchId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!userMatchData) {
        console.error('[MatchStats] No match history found for user');
        setLoading(false);
        return;
      }

      setMatch(userMatchData);

      // Set user stats from their match history entry
      setUserStats({
        three_dart_average: userMatchData.three_dart_avg || 0,
        first_9_dart_avg: userMatchData.first9_avg || 0,
        highest_checkout: userMatchData.highest_checkout || 0,
        checkout_percentage: userMatchData.checkout_percentage || 0,
        checkout_hits: userMatchData.total_checkouts || 0,
        checkout_attempts: userMatchData.checkout_attempts || 0,
        count_100_plus: userMatchData.visits_100_plus || 0,
        count_140_plus: userMatchData.visits_140_plus || 0,
        count_180: userMatchData.visits_180 || 0,
        legs_won: userMatchData.legs_won || 0,
        legs_lost: userMatchData.legs_lost || 0,
        darts_thrown: userMatchData.darts_thrown || 0,
        total_score: userMatchData.total_score || 0,
      });

      // Fetch user profile
      const { data: userProf } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user.id)
        .maybeSingle();
      
      setUserProfile(userProf || { username: 'You' });

      // If there's an opponent, try to fetch their data
      if (userMatchData.opponent_id) {
        // Fetch opponent's match history entry (their perspective of the same match)
        const { data: opponentMatchData } = await supabase
          .from('match_history')
          .select('*')
          .eq('room_id', matchId)
          .eq('user_id', userMatchData.opponent_id)
          .maybeSingle();

        if (opponentMatchData) {
          setOpponentStats({
            three_dart_average: opponentMatchData.three_dart_avg || 0,
            first_9_dart_avg: opponentMatchData.first9_avg || 0,
            highest_checkout: opponentMatchData.highest_checkout || 0,
            checkout_percentage: opponentMatchData.checkout_percentage || 0,
            checkout_hits: opponentMatchData.total_checkouts || 0,
            checkout_attempts: opponentMatchData.checkout_attempts || 0,
            count_100_plus: opponentMatchData.visits_100_plus || 0,
            count_140_plus: opponentMatchData.visits_140_plus || 0,
            count_180: opponentMatchData.visits_180 || 0,
            legs_won: opponentMatchData.legs_won || 0,
            legs_lost: opponentMatchData.legs_lost || 0,
            darts_thrown: opponentMatchData.darts_thrown || 0,
            total_score: opponentMatchData.total_score || 0,
          });
        }

        // Fetch opponent profile
        const { data: oppProf } = await supabase
          .from('profiles')
          .select('username')
          .eq('user_id', userMatchData.opponent_id)
          .maybeSingle();
        
        setOpponentProfile(oppProf || { username: 'Opponent' });
      } else if (userMatchData.match_format === 'dartbot') {
        // For dartbot matches, show opponent as Dartbot(X) where X is the bot average
        setOpponentProfile({ username: `Dartbot(${userMatchData.bot_level || '?'})` });
        
        // Extract bot stats from metadata (stored by record_dartbot_match_completion)
        const botStats = (userMatchData as any).metadata?.bot_stats || {};
        const botLegsWon = userMatchData.legs_lost || 0;
        
        setOpponentStats({
          three_dart_average: botStats.three_dart_avg || botStats.avg || 0,
          first_9_dart_avg: botStats.first9_avg || 0,
          highest_checkout: botStats.highest_checkout || 0,
          checkout_percentage: botStats.checkout_pct || 0,
          checkout_hits: botLegsWon, // Bot wins legs via checkout
          checkout_attempts: botStats.darts_at_double || botLegsWon * 3,
          count_100_plus: botStats.visits_100_plus || 0,
          count_140_plus: botStats.visits_140_plus || 0,
          count_180: botStats.visits_180 || 0,
          legs_won: botLegsWon,
          legs_lost: userMatchData.legs_won || 0,
          darts_thrown: botStats.total_darts || 0,
          total_score: botStats.total_score || 0,
        });
      }
    } catch (error) {
      console.error('[MatchStats] Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  }

  const userName = userProfile?.username || 'You';
  const opponentName = opponentProfile?.username || 'Opponent';
  const userLegsWon = userStats?.legs_won || 0;
  const opponentLegsWon = opponentStats?.legs_won || 0;
  const userWon = userLegsWon > opponentLegsWon;

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-emerald-400" />
            Match Stats
          </DialogTitle>
          <p className="text-gray-400 text-sm">
            {MODE_LABELS[match?.match_format || ''] || match?.match_format} • {match?.game_mode || 501} • 
            Best of {(match?.legs_won || 0) + (match?.legs_lost || 0)}
            {match?.played_at && ` • ${new Date(match.played_at).toLocaleDateString()}`}
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-400">Loading stats...</div>
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* Score Board */}
            <Card className="bg-slate-800/50 border-white/10 p-6">
              <div className="flex items-center justify-center gap-8">
                <div className={`text-center ${userWon ? 'text-emerald-400' : 'text-gray-400'}`}>
                  <p className="text-sm mb-1">{userName}</p>
                  <p className="text-4xl font-bold">{userLegsWon}</p>
                  {userWon && <p className="text-xs text-emerald-400">WINNER</p>}
                </div>
                <div className="text-2xl font-bold text-gray-500">VS</div>
                <div className={`text-center ${!userWon ? 'text-orange-400' : 'text-gray-400'}`}>
                  <p className="text-sm mb-1">{opponentName}</p>
                  <p className="text-4xl font-bold">{opponentLegsWon}</p>
                  {!userWon && <p className="text-xs text-orange-400">WINNER</p>}
                </div>
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              {/* User Stats */}
              <Card className="bg-slate-800/50 border-white/10 p-6">
                <div className="flex items-center space-x-3 mb-6">
                  <Avatar className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500">
                    <div className="w-full h-full flex items-center justify-center text-white font-bold">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-bold text-white">{userName}</h3>
                    <p className="text-sm text-gray-400">You</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <StatRow icon={Target} label="3-Dart Average" value={userStats ? Number(userStats.three_dart_average).toFixed(1) : '—'} />
                  <StatRow icon={TrendingUp} label="First 9 Dart Avg" value={userStats ? Number(userStats.first_9_dart_avg).toFixed(1) : '—'} />
                  <StatRow icon={Award} label="Darts Thrown" value={userStats?.darts_thrown?.toString() || '—'} />
                  <StatRow
                    icon={Target}
                    label="Checkout %"
                    value={userStats && userStats.checkout_attempts > 0 
                      ? `${Number(userStats.checkout_percentage).toFixed(1)}% (${userStats.checkout_hits}/${userStats.checkout_attempts})` 
                      : userStats?.checkout_hits ? `${userStats.checkout_hits} checkouts` : '—'}
                  />
                  <StatRow icon={Award} label="Highest Checkout" value={userStats?.highest_checkout ? userStats.highest_checkout.toString() : '0'} color={userStats?.highest_checkout ? 'text-emerald-400' : 'text-gray-400'} />
                  <StatRow icon={Trophy} label="180s" value={userStats?.count_180?.toString() || '0'} />
                  <StatRow icon={Trophy} label="140+" value={userStats?.count_140_plus?.toString() || '0'} />
                  <StatRow icon={Trophy} label="100+" value={userStats?.count_100_plus?.toString() || '0'} />
                </div>
              </Card>

              {/* Opponent Stats */}
              <Card className="bg-slate-800/50 border-white/10 p-6">
                <div className="flex items-center space-x-3 mb-6">
                  <Avatar className="w-12 h-12 bg-gradient-to-br from-orange-500 to-red-500">
                    <div className="w-full h-full flex items-center justify-center text-white font-bold">
                      {opponentName.charAt(0).toUpperCase()}
                    </div>
                  </Avatar>
                  <div>
                    <h3 className="text-lg font-bold text-white">{opponentName}</h3>
                    <p className="text-sm text-gray-400">Opponent</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <StatRow icon={Target} label="3-Dart Average" value={opponentStats ? Number(opponentStats.three_dart_average).toFixed(1) : '—'} />
                  <StatRow icon={TrendingUp} label="First 9 Dart Avg" value={opponentStats ? Number(opponentStats.first_9_dart_avg).toFixed(1) : '—'} />
                  <StatRow icon={Award} label="Darts Thrown" value={opponentStats?.darts_thrown?.toString() || '—'} />
                  <StatRow
                    icon={Target}
                    label="Checkout %"
                    value={opponentStats && opponentStats.checkout_attempts > 0 
                      ? `${Number(opponentStats.checkout_percentage).toFixed(1)}% (${opponentStats.checkout_hits}/${opponentStats.checkout_attempts})` 
                      : opponentStats?.checkout_hits ? `${opponentStats.checkout_hits} checkouts` : '—'}
                  />
                  <StatRow icon={Award} label="Highest Checkout" value={opponentStats?.highest_checkout ? opponentStats.highest_checkout.toString() : '0'} color={opponentStats?.highest_checkout ? 'text-emerald-400' : 'text-gray-400'} />
                  <StatRow icon={Trophy} label="180s" value={opponentStats?.count_180?.toString() || '0'} />
                  <StatRow icon={Trophy} label="140+" value={opponentStats?.count_140_plus?.toString() || '0'} />
                  <StatRow icon={Trophy} label="100+" value={opponentStats?.count_100_plus?.toString() || '0'} />
                </div>
              </Card>
            </div>

            {/* Summary Stats */}
            {userStats && (
              <Card className="bg-slate-800/50 border-white/10 p-6">
                <h3 className="text-lg font-bold text-white mb-4">Your Performance Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-white/5 rounded-lg">
                    <p className="text-2xl font-bold text-emerald-400">{Number(userStats.three_dart_average).toFixed(1)}</p>
                    <p className="text-xs text-gray-400">3-Dart Avg</p>
                  </div>
                  <div className="text-center p-4 bg-white/5 rounded-lg">
                    <p className="text-2xl font-bold text-blue-400">{userStats.count_180}</p>
                    <p className="text-xs text-gray-400">180s</p>
                  </div>
                  <div className="text-center p-4 bg-white/5 rounded-lg">
                    <p className="text-2xl font-bold text-purple-400">{userStats.count_140_plus}</p>
                    <p className="text-xs text-gray-400">140+</p>
                  </div>
                  <div className="text-center p-4 bg-white/5 rounded-lg">
                    <p className="text-2xl font-bold text-orange-400">{userStats.highest_checkout || 0}</p>
                    <p className="text-xs text-gray-400">High Checkout</p>
                  </div>
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
