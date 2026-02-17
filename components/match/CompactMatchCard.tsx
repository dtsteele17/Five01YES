'use client';

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

export interface CompactMatch {
  id: string;
  room_id?: string;
  opponent_id?: string;
  opponent_username?: string;
  game_mode: number | string;
  match_format?: string;
  result: 'win' | 'loss' | 'draw';
  legs_won: number;
  legs_lost: number;
  three_dart_avg?: number;
  first9_avg?: number;
  highest_checkout?: number;
  checkout_percentage?: number;
  visits_180?: number;
  opponent_three_dart_avg?: number;
  opponent_first9_avg?: number;
  opponent_highest_checkout?: number;
  opponent_visits_180?: number;
  played_at: string;
  bot_level?: number;
}

interface CompactMatchCardProps {
  match: CompactMatch;
  onClick?: () => void;
  showOpponentStats?: boolean;
}

export function CompactMatchCard({ match, onClick, showOpponentStats = true }: CompactMatchCardProps) {
  const getResultColor = (result: string) => {
    switch (result) {
      case 'win': return 'text-emerald-400';
      case 'loss': return 'text-rose-400';
      case 'draw': return 'text-amber-400';
      default: return 'text-slate-400';
    }
  };

  const getResultBgColor = (result: string) => {
    switch (result) {
      case 'win': return 'bg-emerald-500/20 border-emerald-500/30';
      case 'loss': return 'bg-rose-500/20 border-rose-500/30';
      case 'draw': return 'bg-amber-500/20 border-amber-500/30';
      default: return 'bg-slate-500/20 border-slate-500/30';
    }
  };

  const getResultGradient = (result: string) => {
    switch (result) {
      case 'win': return 'from-emerald-500/10 to-emerald-600/5';
      case 'loss': return 'from-rose-500/10 to-rose-600/5';
      case 'draw': return 'from-amber-500/10 to-amber-600/5';
      default: return 'from-slate-500/10 to-slate-600/5';
    }
  };

  const timeAgo = formatDistanceToNow(new Date(match.played_at), { addSuffix: true });

  // Format game mode display
  const gameModeDisplay = typeof match.game_mode === 'number' 
    ? `${match.game_mode}` 
    : match.game_mode;

  // Determine opponent name
  const opponentName = match.match_format === 'dartbot' 
    ? `Bot (${match.bot_level || '?'})`
    : match.opponent_username || 'Unknown';

  return (
    <motion.div 
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${getResultGradient(match.result)} border border-slate-700/50 hover:border-slate-500/50 cursor-pointer transition-all group`}
    >
      {/* Result indicator strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
        match.result === 'win' ? 'bg-emerald-500' : 
        match.result === 'loss' ? 'bg-rose-500' : 'bg-amber-500'
      }`} />
      
      <div className="p-3 pl-4">
        {/* Top Row: Game Info */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Badge className={`text-xs ${getResultBgColor(match.result)} ${getResultColor(match.result)}`}>
              {match.result === 'win' ? 'W' : match.result === 'loss' ? 'L' : 'D'}
            </Badge>
            <span className="text-slate-400 text-xs">{gameModeDisplay} • {timeAgo}</span>
          </div>
        </div>
        
        {/* Main Row: You | Score | Opponent */}
        <div className="flex items-center justify-between">
          {/* Left: You */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <span className="text-emerald-400 font-bold text-sm">You</span>
              </div>
              <div>
                <p className="text-emerald-400 font-bold text-lg">{match.legs_won}</p>
                <p className="text-slate-500 text-xs">legs</p>
              </div>
            </div>
            {/* Your Stats */}
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                Avg: {match.three_dart_avg?.toFixed(1) || '-'}
              </span>
              <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                180s: {match.visits_180 || 0}
              </span>
            </div>
          </div>
          
          {/* Center: VS / Score Display */}
          <div className="px-4 flex flex-col items-center">
            <span className="text-slate-500 text-xs mb-1">vs</span>
            <div className={`text-3xl font-black ${getResultColor(match.result)}`}>
              {match.legs_won} - {match.legs_lost}
            </div>
            <span className="text-slate-500 text-[10px] mt-1 truncate max-w-[80px]">
              {opponentName}
            </span>
          </div>
          
          {/* Right: Opponent */}
          <div className="flex-1 text-right">
            <div className="flex items-center justify-end gap-2 mb-1">
              <div>
                <p className="text-orange-400 font-bold text-lg">{match.legs_lost}</p>
                <p className="text-slate-500 text-xs">legs</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center">
                <span className="text-orange-400 font-bold text-xs">Opp</span>
              </div>
            </div>
            {/* Opponent Stats - Only show if enabled */}
            {showOpponentStats && (
              <div className="flex flex-wrap gap-1 mt-1 justify-end">
                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                  Avg: {match.opponent_three_dart_avg?.toFixed(1) || '-'}
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                  180s: {match.opponent_visits_180 || 0}
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Bottom Row: Additional Stats */}
        <div className="mt-2 pt-2 border-t border-slate-700/30 flex items-center justify-between text-[10px] text-slate-400">
          <div className="flex gap-3">
            <span>First 9: {match.first9_avg?.toFixed(1) || '-'}</span>
            <span>Checkout: {match.highest_checkout || '-'}</span>
          </div>
          {showOpponentStats && (
            <div className="flex gap-3">
              <span>First 9: {match.opponent_first9_avg?.toFixed(1) || '-'}</span>
              <span>Checkout: {match.opponent_highest_checkout || '-'}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
