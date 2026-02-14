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
import { Badge } from '@/components/ui/badge';
import { Target, Trophy, TrendingUp, Award, Camera, Zap, Crosshair, Crown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { motion } from 'framer-motion';

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
  // Opponent stats (stored in user's row by fn_update_player_match_stats)
  opponent_three_dart_avg: number | null;
  opponent_first9_avg: number | null;
  opponent_highest_checkout: number | null;
  opponent_checkout_percentage: number | null;
  opponent_darts_thrown: number | null;
  opponent_visits_100_plus: number | null;
  opponent_visits_140_plus: number | null;
  opponent_visits_180: number | null;
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

      // If there's an opponent, get their stats
      if (userMatchData.opponent_id) {
        // First try to fetch opponent's match history entry (their perspective)
        const { data: opponentMatchData } = await supabase
          .from('match_history')
          .select('*')
          .eq('room_id', matchId)
          .eq('user_id', userMatchData.opponent_id)
          .maybeSingle();

        if (opponentMatchData) {
          // Use opponent's own match history row
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
        } else {
          // Fall back to opponent stats stored in user's row (from fn_update_player_match_stats)
          setOpponentStats({
            three_dart_average: userMatchData.opponent_three_dart_avg || 0,
            first_9_dart_avg: userMatchData.opponent_first9_avg || 0,
            highest_checkout: userMatchData.opponent_highest_checkout || 0,
            checkout_percentage: userMatchData.opponent_checkout_percentage || 0,
            checkout_hits: 0, // Not stored in opponent_* columns
            checkout_attempts: 0, // Not stored in opponent_* columns
            count_100_plus: userMatchData.opponent_visits_100_plus || 0,
            count_140_plus: userMatchData.opponent_visits_140_plus || 0,
            count_180: userMatchData.opponent_visits_180 || 0,
            legs_won: userMatchData.legs_lost || 0, // Opponent won what user lost
            legs_lost: userMatchData.legs_won || 0,
            darts_thrown: userMatchData.opponent_darts_thrown || 0,
            total_score: 0, // Not stored in opponent_* columns
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
      <DialogContent className="bg-gradient-to-br from-slate-900 to-slate-950 border-white/10 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black flex items-center justify-center gap-3">
            <Crown className="w-8 h-8 text-yellow-400" />
            <span className="bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-400 bg-clip-text text-transparent">
              Match Stats
            </span>
          </DialogTitle>
          <p className="text-center text-slate-400 text-sm">
            {MODE_LABELS[match?.match_format || ''] || match?.match_format} • {match?.game_mode || 501} • 
            Best of {(match?.legs_won || 0) + (match?.legs_lost || 0)}
            {match?.played_at && ` • ${new Date(match.played_at).toLocaleDateString()}`}
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-slate-400">Loading stats...</div>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 mt-4"
          >
            {/* Score Board */}
            <Card className="bg-gradient-to-r from-slate-800/80 to-slate-900/80 border-white/10 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-center gap-8">
                {/* User */}
                <div className={`text-center ${userWon ? 'scale-110' : 'opacity-70'}`}>
                  <div className={`w-16 h-16 mx-auto mb-2 rounded-full flex items-center justify-center text-2xl font-black ${
                    userWon 
                      ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30' 
                      : 'bg-slate-700 text-slate-400'
                  }`}>
                    {userName.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-sm font-medium text-white mb-1">{userName}</p>
                  <motion.p 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-5xl font-black text-white"
                  >
                    {userLegsWon}
                  </motion.p>
                  {userWon && (
                    <Badge className="mt-2 bg-gradient-to-r from-yellow-500 to-orange-500 text-white border-0">
                      <Crown className="w-3 h-3 mr-1" />
                      WINNER
                    </Badge>
                  )}
                </div>
                
                {/* VS */}
                <div className="text-3xl font-black text-slate-600">VS</div>
                
                {/* Opponent */}
                <div className={`text-center ${!userWon ? 'scale-110' : 'opacity-70'}`}>
                  <div className={`w-16 h-16 mx-auto mb-2 rounded-full flex items-center justify-center text-2xl font-black ${
                    !userWon 
                      ? 'bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/30' 
                      : 'bg-slate-700 text-slate-400'
                  }`}>
                    {opponentName.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-sm font-medium text-white mb-1">{opponentName}</p>
                  <motion.p 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="text-5xl font-black text-white"
                  >
                    {opponentLegsWon}
                  </motion.p>
                  {!userWon && (
                    <Badge className="mt-2 bg-gradient-to-r from-orange-500 to-red-500 text-white border-0">
                      <Crown className="w-3 h-3 mr-1" />
                      WINNER
                    </Badge>
                  )}
                </div>
              </div>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              {/* User Stats */}
              <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-emerald-500/30 p-6 backdrop-blur-sm">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-emerald-500/20">
                    {userName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{userName}</h3>
                    <p className="text-sm text-emerald-400">You</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <StatRow icon={Target} label="3-Dart Average" value={userStats ? Number(userStats.three_dart_average).toFixed(1) : '—'} highlight />
                  <StatRow icon={TrendingUp} label="First 9 Dart Avg" value={userStats ? Number(userStats.first_9_dart_avg).toFixed(1) : '—'} />
                  <StatRow icon={Zap} label="Darts Thrown" value={userStats?.darts_thrown?.toString() || '—'} />
                  <StatRow
                    icon={Crosshair}
                    label="Checkout %"
                    value={userStats && userStats.checkout_attempts > 0 
                      ? `${Number(userStats.checkout_percentage).toFixed(1)}%` 
                      : userStats?.checkout_hits ? `${userStats.checkout_hits} checkouts` : '—'}
                    subvalue={userStats && userStats.checkout_attempts > 0 ? `(${userStats.checkout_hits}/${userStats.checkout_attempts})` : undefined}
                  />
                  <StatRow icon={Award} label="Highest Checkout" value={userStats?.highest_checkout?.toString() || '0'} color={userStats?.highest_checkout ? 'text-emerald-400' : 'text-slate-400'} />
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div className="text-center p-2 bg-slate-900/50 rounded-lg">
                      <div className="text-lg font-bold text-purple-400">{userStats?.count_180 || 0}</div>
                      <div className="text-xs text-slate-500">180s</div>
                    </div>
                    <div className="text-center p-2 bg-slate-900/50 rounded-lg">
                      <div className="text-lg font-bold text-blue-400">{userStats?.count_140_plus || 0}</div>
                      <div className="text-xs text-slate-500">140+</div>
                    </div>
                    <div className="text-center p-2 bg-slate-900/50 rounded-lg">
                      <div className="text-lg font-bold text-emerald-400">{userStats?.count_100_plus || 0}</div>
                      <div className="text-xs text-slate-500">100+</div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Opponent Stats */}
              <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-orange-500/30 p-6 backdrop-blur-sm">
                <div className="flex items-center space-x-3 mb-6">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-orange-500/20">
                    {opponentName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{opponentName}</h3>
                    <p className="text-sm text-orange-400">Opponent</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <StatRow icon={Target} label="3-Dart Average" value={opponentStats ? Number(opponentStats.three_dart_average).toFixed(1) : '—'} highlight />
                  <StatRow icon={TrendingUp} label="First 9 Dart Avg" value={opponentStats ? Number(opponentStats.first_9_dart_avg).toFixed(1) : '—'} />
                  <StatRow icon={Zap} label="Darts Thrown" value={opponentStats?.darts_thrown?.toString() || '—'} />
                  <StatRow
                    icon={Crosshair}
                    label="Checkout %"
                    value={opponentStats && opponentStats.checkout_attempts > 0 
                      ? `${Number(opponentStats.checkout_percentage).toFixed(1)}%` 
                      : opponentStats?.checkout_hits ? `${opponentStats.checkout_hits} checkouts` : '—'}
                    subvalue={opponentStats && opponentStats.checkout_attempts > 0 ? `(${opponentStats.checkout_hits}/${opponentStats.checkout_attempts})` : undefined}
                  />
                  <StatRow icon={Award} label="Highest Checkout" value={opponentStats?.highest_checkout?.toString() || '0'} color={opponentStats?.highest_checkout ? 'text-emerald-400' : 'text-slate-400'} />
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <div className="text-center p-2 bg-slate-900/50 rounded-lg">
                      <div className="text-lg font-bold text-purple-400">{opponentStats?.count_180 || 0}</div>
                      <div className="text-xs text-slate-500">180s</div>
                    </div>
                    <div className="text-center p-2 bg-slate-900/50 rounded-lg">
                      <div className="text-lg font-bold text-blue-400">{opponentStats?.count_140_plus || 0}</div>
                      <div className="text-xs text-slate-500">140+</div>
                    </div>
                    <div className="text-center p-2 bg-slate-900/50 rounded-lg">
                      <div className="text-lg font-bold text-emerald-400">{opponentStats?.count_100_plus || 0}</div>
                      <div className="text-xs text-slate-500">100+</div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Summary Stats */}
            {userStats && (
              <Card className="bg-gradient-to-r from-slate-800/80 to-slate-900/80 border-white/10 p-6 backdrop-blur-sm">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  Your Performance Summary
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-gradient-to-br from-emerald-500/10 to-emerald-600/10 rounded-xl border border-emerald-500/20">
                    <p className="text-2xl font-black text-emerald-400">{Number(userStats.three_dart_average).toFixed(1)}</p>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">3-Dart Avg</p>
                  </div>
                  <div className="text-center p-4 bg-gradient-to-br from-purple-500/10 to-purple-600/10 rounded-xl border border-purple-500/20">
                    <p className="text-2xl font-black text-purple-400">{userStats.count_180}</p>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">180s</p>
                  </div>
                  <div className="text-center p-4 bg-gradient-to-br from-blue-500/10 to-blue-600/10 rounded-xl border border-blue-500/20">
                    <p className="text-2xl font-black text-blue-400">{userStats.count_140_plus}</p>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">140+</p>
                  </div>
                  <div className="text-center p-4 bg-gradient-to-br from-orange-500/10 to-orange-600/10 rounded-xl border border-orange-500/20">
                    <p className="text-2xl font-black text-orange-400">{userStats.highest_checkout || 0}</p>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">High Checkout</p>
                  </div>
                </div>
              </Card>
            )}

            <div className="flex justify-end">
              <Button 
                onClick={onClose} 
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold px-8"
              >
                Close
              </Button>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatRow({
  icon: Icon,
  label,
  value,
  subvalue,
  color = 'text-white',
  highlight = false
}: {
  icon: any;
  label: string;
  value: string;
  subvalue?: string;
  color?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-lg ${highlight ? 'bg-white/10' : 'bg-white/5'}`}>
      <div className="flex items-center space-x-2">
        <Icon className={`w-4 h-4 ${highlight ? 'text-emerald-400' : 'text-slate-400'}`} />
        <span className="text-slate-300 text-sm font-medium">{label}</span>
      </div>
      <div className="text-right">
        <span className={`font-bold ${color}`}>{value}</span>
        {subvalue && <span className="text-slate-500 text-xs ml-1">{subvalue}</span>}
      </div>
    </div>
  );
}
