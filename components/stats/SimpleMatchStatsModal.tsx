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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Target, Trophy, TrendingUp, Award, Calendar, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';

interface SimpleMatchStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: MatchHistoryItem | null;
}

export interface MatchHistoryItem {
  id: string;
  room_id: string;
  opponent_id?: string;
  opponent_username?: string;
  opponent_avatar_url?: string | null;
  game_mode: number;
  match_format: string;
  result: 'win' | 'loss' | 'draw';
  legs_won: number;
  legs_lost: number;
  three_dart_avg: number;
  first9_avg: number;
  highest_checkout: number;
  checkout_percentage: number;
  darts_thrown: number;
  total_score: number;
  total_checkouts: number;
  checkout_attempts: number;
  visits_100_plus: number;
  visits_140_plus: number;
  visits_180: number;
  bot_level?: number;
  played_at: string;
}

const MODE_LABELS: Record<string, string> = {
  'ranked': 'Ranked Match',
  'quick': 'Quick Match',
  'private': 'Private Match',
  'training': 'Training',
  'local': 'Local Match',
  'dartbot': 'vs DartBot',
  'league': 'League Match',
  'tournament': 'Tournament Match',
};

const BOT_LEVEL_NAMES: Record<number, string> = {
  1: 'Beginner',
  2: 'Intermediate', 
  3: 'Advanced',
  4: 'Expert',
  5: 'Professional'
};

export function SimpleMatchStatsModal({ isOpen, onClose, match }: SimpleMatchStatsModalProps) {
  const [userName, setUserName] = useState<string>('You');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (isOpen && match) {
      fetchUserProfile();
    }
  }, [isOpen, match]);

  async function fetchUserProfile() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (profile?.username) {
        setUserName(profile.username);
      }
    }
    setLoading(false);
  }

  if (!isOpen || !match) return null;

  const getOpponentName = () => {
    if (match.match_format === 'dartbot' || match.bot_level) {
      return `DartBot (${BOT_LEVEL_NAMES[match.bot_level || 3] || 'Advanced'})`;
    }
    return match.opponent_username || 'Opponent';
  };

  const getResultColor = (result: string) => {
    switch (result) {
      case 'win': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
      case 'loss': return 'text-red-400 bg-red-400/10 border-red-400/30';
      case 'draw': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
      default: return 'text-slate-400 bg-slate-400/10 border-slate-400/30';
    }
  };

  const getResultText = (result: string) => {
    switch (result) {
      case 'win': return 'Victory';
      case 'loss': return 'Defeat';
      case 'draw': return 'Draw';
      default: return result;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold">Match Summary</DialogTitle>
            <div className={`px-4 py-2 rounded-lg border-2 font-bold ${getResultColor(match.result)}`}>
              {getResultText(match.result)}
            </div>
          </div>
          <p className="text-slate-400 text-sm mt-2">
            {MODE_LABELS[match.match_format] || match.match_format} • {match.game_mode} • {format(new Date(match.played_at), 'MMM d, yyyy • h:mm a')}
          </p>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-slate-400">Loading...</div>
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* Score Board */}
            <Card className="bg-slate-800/50 border-slate-700 p-6">
              <div className="flex items-center justify-center gap-8">
                {/* User */}
                <div className="text-center">
                  <Avatar className="w-16 h-16 mx-auto mb-2 bg-gradient-to-br from-emerald-500 to-teal-500">
                    <AvatarFallback className="text-xl font-bold text-white">
                      {userName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="font-semibold text-white">{userName}</p>
                  <p className="text-sm text-slate-400">You</p>
                </div>

                {/* Score */}
                <div className="text-center">
                  <div className="flex items-center gap-4">
                    <span className={`text-4xl font-bold ${match.result === 'win' ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {match.legs_won}
                    </span>
                    <span className="text-2xl text-slate-500">-</span>
                    <span className={`text-4xl font-bold ${match.result === 'loss' ? 'text-red-400' : 'text-slate-400'}`}>
                      {match.legs_lost}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">Final Score</p>
                </div>

                {/* Opponent */}
                <div className="text-center">
                  <Avatar className="w-16 h-16 mx-auto mb-2 bg-gradient-to-br from-orange-500 to-red-500">
                    <AvatarFallback className="text-xl font-bold text-white">
                      {getOpponentName().charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="font-semibold text-white">{getOpponentName()}</p>
                  <p className="text-sm text-slate-400">
                    {match.match_format === 'dartbot' ? 'Bot' : 'Opponent'}
                  </p>
                </div>
              </div>
            </Card>

            {/* Stats Comparison */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* User Stats */}
              <Card className="bg-slate-800/50 border-slate-700 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{userName}</h3>
                    <p className="text-xs text-slate-400">Your Performance</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <StatRow 
                    icon={TrendingUp} 
                    label="3-Dart Average" 
                    value={match.three_dart_avg?.toFixed(1) || '-'} 
                  />
                  <StatRow 
                    icon={Target} 
                    label="First 9 Avg" 
                    value={match.first9_avg?.toFixed(1) || '-'} 
                  />
                  <StatRow 
                    icon={Trophy} 
                    label="Highest Checkout" 
                    value={match.highest_checkout?.toString() || '0'} 
                    highlight={match.highest_checkout > 0}
                  />
                  <StatRow 
                    icon={Target} 
                    label="Checkout %" 
                    value={`${match.checkout_percentage?.toFixed(1) || '0'}%`} 
                    subtext={`${match.total_checkouts}/${match.checkout_attempts}`}
                  />
                  <StatRow 
                    icon={Award} 
                    label="Darts Thrown" 
                    value={match.darts_thrown?.toString() || '-'} 
                  />
                  <StatRow 
                    icon={Trophy} 
                    label="100+ / 140+ / 180s" 
                    value={`${match.visits_100_plus || 0} / ${match.visits_140_plus || 0} / ${match.visits_180 || 0}`} 
                  />
                </div>
              </Card>

              {/* Match Context */}
              <Card className="bg-slate-800/50 border-slate-700 p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Match Details</h3>
                    <p className="text-xs text-slate-400">Game Information</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <DetailRow label="Game Mode" value={`${match.game_mode}`} />
                  <DetailRow label="Match Type" value={MODE_LABELS[match.match_format] || match.match_format} />
                  <DetailRow label="Result" value={getResultText(match.result)} />
                  <DetailRow label="Legs Won" value={`${match.legs_won} - ${match.legs_lost}`} />
                  <DetailRow label="Total Score" value={match.total_score?.toString() || '-'} />
                  <DetailRow 
                    label="Played" 
                    value={format(new Date(match.played_at), 'MMM d, yyyy')} 
                  />
                  <DetailRow 
                    label="Time" 
                    value={format(new Date(match.played_at), 'h:mm a')} 
                  />
                </div>
              </Card>
            </div>

            {/* Key Highlights */}
            {(match.visits_180 > 0 || match.highest_checkout > 0 || match.visits_140_plus > 0) && (
              <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30 p-5">
                <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  Match Highlights
                </h3>
                <div className="flex flex-wrap gap-2">
                  {match.visits_180 > 0 && (
                    <span className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-medium">
                      {match.visits_180} × 180!
                    </span>
                  )}
                  {match.visits_140_plus > 0 && (
                    <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-sm font-medium">
                      {match.visits_140_plus} × 140+
                    </span>
                  )}
                  {match.highest_checkout > 0 && (
                    <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-sm font-medium">
                      Checkout: {match.highest_checkout}
                    </span>
                  )}
                  {match.three_dart_avg > 80 && (
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">
                      Avg: {match.three_dart_avg.toFixed(1)}
                    </span>
                  )}
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
  subtext,
  highlight = false 
}: { 
  icon: any; 
  label: string; 
  value: string; 
  subtext?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-slate-900/50 rounded-lg">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-slate-400" />
        <span className="text-slate-300 text-sm">{label}</span>
      </div>
      <div className="text-right">
        <span className={`font-bold ${highlight ? 'text-emerald-400' : 'text-white'}`}>{value}</span>
        {subtext && <span className="text-xs text-slate-500 ml-1">({subtext})</span>}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-700/50 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}
