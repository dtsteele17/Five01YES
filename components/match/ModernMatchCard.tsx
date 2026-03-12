'use client';

import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { 
  Trophy, 
  Target, 
  TrendingUp, 
  Zap, 
  Crown,
  User,
  Bot,
  Calendar,
  ArrowRight
} from 'lucide-react';

export interface ModernMatch {
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
  visits_140_plus?: number;
  visits_100_plus?: number;
  darts_thrown?: number;
  opponent_three_dart_avg?: number;
  opponent_first9_avg?: number;
  opponent_highest_checkout?: number;
  opponent_visits_180?: number;
  played_at: string;
  bot_level?: number;
  opponent_avatar_url?: string | null;
  // Career-specific fields
  career_tier?: number;
  career_event?: string;
}

interface ModernMatchCardProps {
  match: ModernMatch;
  onClick?: () => void;
  showOpponentStats?: boolean;
  compact?: boolean;
}

export function ModernMatchCard({ 
  match, 
  onClick, 
  showOpponentStats = true,
  compact = false 
}: ModernMatchCardProps) {
  
  const isWin = match.result === 'win';
  const isLoss = match.result === 'loss';
  const isDraw = match.result === 'draw';
  
  // Result styling
  const resultConfig = {
    win: {
      bg: 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent',
      border: 'border-emerald-500/30',
      accent: 'bg-emerald-500',
      text: 'text-emerald-400',
      glow: 'shadow-emerald-500/10',
      badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
      label: 'WIN'
    },
    loss: {
      bg: 'bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent',
      border: 'border-rose-500/30',
      accent: 'bg-rose-500',
      text: 'text-rose-400',
      glow: 'shadow-rose-500/10',
      badge: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
      label: 'LOSS'
    },
    draw: {
      bg: 'bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent',
      border: 'border-amber-500/30',
      accent: 'bg-amber-500',
      text: 'text-amber-400',
      glow: 'shadow-amber-500/10',
      badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      label: 'DRAW'
    }
  };

  const result = resultConfig[match.result];
  const timeAgo = formatDistanceToNow(new Date(match.played_at), { addSuffix: true });
  
  // Format game mode
  const gameModeDisplay = typeof match.game_mode === 'number' 
    ? `${match.game_mode}` 
    : match.game_mode;

  // Opponent name
  const isBot = match.match_format === 'dartbot';
  const isCareer = match.match_format === 'career';
  const opponentName = isCareer
    ? match.opponent_username || 'AI Opponent'
    : isBot 
      ? `DartBot ${match.bot_level ? `(Level ${match.bot_level})` : ''}`
      : match.opponent_username || 'Unknown Player';

  // Calculate total legs
  const totalLegs = match.legs_won + match.legs_lost;

  if (compact) {
    return (
      <motion.div 
        onClick={onClick}
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        className={`relative overflow-hidden rounded-xl ${result.bg} border ${result.border} shadow-lg ${result.glow} cursor-pointer transition-all duration-300`}
      >
        {/* Result indicator strip */}
        <div className={`absolute left-0 top-0 bottom-0 w-1 ${result.accent}`} />
        
        <div className="p-3 pl-4">
          <div className="flex items-center justify-between">
            {/* Left: Opponent info */}
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className={`w-10 h-10 rounded-xl ${
                isCareer ? 'bg-yellow-500/20' : 
                isBot ? 'bg-blue-500/20' : 
                'bg-slate-700'
              } flex items-center justify-center overflow-hidden`}>
                {isCareer ? (
                  <Crown className="w-5 h-5 text-yellow-400" />
                ) : isBot ? (
                  <Bot className="w-5 h-5 text-blue-400" />
                ) : match.opponent_avatar_url ? (
                  <img src={match.opponent_avatar_url} alt={opponentName} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-slate-400" />
                )}
              </div>
              
              <div>
                <p className="text-white font-semibold text-sm">vs {opponentName}</p>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{gameModeDisplay}</span>
                  <span>•</span>
                  {isCareer && match.career_event && (
                    <>
                      <span className="text-yellow-400">{match.career_event}</span>
                      <span>•</span>
                    </>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {timeAgo}
                  </span>
                </div>
              </div>
            </div>

            {/* Center: Score */}
            <div className="flex flex-col items-center px-4">
              <Badge className={`${result.badge} font-bold text-xs`}>
                {result.label}
              </Badge>
              <div className={`text-xl font-black ${result.text} mt-1`}>
                {match.legs_won} - {match.legs_lost}
              </div>
            </div>

            {/* Right: Key stat */}
            <div className="text-right">
              <div className="flex items-center gap-1 text-emerald-400 text-sm font-bold">
                <TrendingUp className="w-4 h-4" />
                {match.three_dart_avg?.toFixed(1) || '-'}
              </div>
              <p className="text-xs text-slate-500">avg</p>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      onClick={onClick}
      whileHover={{ scale: 1.01, y: -2 }}
      whileTap={{ scale: 0.99 }}
      className={`relative overflow-hidden rounded-2xl ${result.bg} border ${result.border} shadow-xl ${result.glow} cursor-pointer transition-all duration-300`}
    >
      {/* Result indicator strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${result.accent}`} />
      
      {/* Top section - Header */}
      <div className="p-4 pl-5 border-b border-white/5">
        <div className="flex items-center justify-between">
          {/* Game mode and date */}
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="border-slate-600 text-slate-300 bg-slate-800/50">
              {gameModeDisplay}
            </Badge>
            <span className="flex items-center gap-1 text-sm text-slate-400">
              <Calendar className="w-3.5 h-3.5" />
              {timeAgo}
            </span>
          </div>
          
          {/* Result badge */}
          <Badge className={`${result.badge} font-bold px-3 py-1`}>
            <Trophy className="w-3.5 h-3.5 mr-1" />
            {result.label}
          </Badge>
        </div>
      </div>

      {/* Middle section - Players & Score */}
      <div className="p-4 pl-5">
        <div className="flex items-center justify-between">
          {/* YOU */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <span className="text-white font-bold text-lg">You</span>
              </div>
              <div>
                <p className="text-white font-bold text-lg">{match.legs_won}</p>
                <p className="text-slate-500 text-xs">legs won</p>
              </div>
            </div>
          </div>

          {/* VS / SCORE */}
          <div className="px-3 sm:px-6 flex flex-col items-center">
            <span className="text-slate-500 text-xs font-medium mb-1">VS</span>
            <div className={`text-2xl sm:text-4xl font-black ${result.text} tracking-tight`}>
              {match.legs_won}:{match.legs_lost}
            </div>
            <p className="text-slate-500 text-xs mt-1">Best of {totalLegs}</p>
          </div>

          {/* OPPONENT */}
          <div className="flex-1 text-right">
            <div className="flex items-center justify-end gap-3 mb-2">
              <div>
                <p className="text-white font-bold text-lg">{match.legs_lost}</p>
                <p className="text-slate-500 text-xs">legs won</p>
              </div>
              <div className={`w-12 h-12 rounded-2xl ${
                isCareer ? 'bg-gradient-to-br from-yellow-500 to-yellow-600' :
                isBot ? 'bg-gradient-to-br from-blue-500 to-blue-600' : 
                'bg-gradient-to-br from-orange-500 to-orange-600'
              } flex items-center justify-center shadow-lg overflow-hidden`}>
                {isCareer ? (
                  <Crown className="w-6 h-6 text-white" />
                ) : isBot ? (
                  <Bot className="w-6 h-6 text-white" />
                ) : match.opponent_avatar_url ? (
                  <img src={match.opponent_avatar_url} alt={opponentName} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-6 h-6 text-white" />
                )}
              </div>
            </div>
            <div className="text-right">
              <p className={`font-semibold text-sm truncate max-w-[140px] ml-auto ${isCareer ? 'text-yellow-400' : isBot ? 'text-blue-400' : 'text-orange-400'}`}>
                {opponentName}
              </p>
              {isCareer && match.career_event && (
                <p className="text-xs text-slate-400 mt-1 truncate max-w-[140px] ml-auto">
                  {match.career_event}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats section */}
      <div className="px-4 pb-4 pl-5">
        <div className="bg-slate-900/40 rounded-xl p-3 border border-white/5">
          {/* Your stats */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <span className="text-emerald-400 text-xs font-bold">Y</span>
            </div>
            <span className="text-slate-400 text-xs font-medium">Your Stats</span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatBox 
              icon={<TrendingUp className="w-3.5 h-3.5" />}
              label="3-Dart Avg"
              value={match.three_dart_avg?.toFixed(1) || '-'}
              color="text-emerald-400"
            />
            <StatBox 
              icon={<Target className="w-3.5 h-3.5" />}
              label="First 9"
              value={match.first9_avg?.toFixed(1) || '-'}
              color="text-blue-400"
            />
            <StatBox 
              icon={<Crown className="w-3.5 h-3.5" />}
              label="Checkout"
              value={match.highest_checkout || '-'}
              color="text-amber-400"
            />
            <StatBox 
              icon={<Zap className="w-3.5 h-3.5" />}
              label="180s"
              value={match.visits_180 || '0'}
              color="text-purple-400"
            />
          </div>

          {/* Opponent stats - only if enabled */}
          {showOpponentStats && (match.opponent_three_dart_avg || match.opponent_highest_checkout) && (
            <>
              <div className="h-px bg-white/10 my-3" />
              
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-6 h-6 rounded-lg ${isBot ? 'bg-blue-500/20' : 'bg-orange-500/20'} flex items-center justify-center`}>
                  <span className={`${isBot ? 'text-blue-400' : 'text-orange-400'} text-xs font-bold`}>O</span>
                </div>
                <span className="text-slate-400 text-xs font-medium">{opponentName}&apos;s Stats</span>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatBox 
                  icon={<TrendingUp className="w-3.5 h-3.5" />}
                  label="3-Dart Avg"
                  value={match.opponent_three_dart_avg?.toFixed(1) || '-'}
                  color="text-slate-400"
                />
                <StatBox 
                  icon={<Target className="w-3.5 h-3.5" />}
                  label="First 9"
                  value={match.opponent_first9_avg?.toFixed(1) || '-'}
                  color="text-slate-400"
                />
                <StatBox 
                  icon={<Crown className="w-3.5 h-3.5" />}
                  label="Checkout"
                  value={match.opponent_highest_checkout || '-'}
                  color="text-slate-400"
                />
                <StatBox 
                  icon={<Zap className="w-3.5 h-3.5" />}
                  label="180s"
                  value={match.opponent_visits_180 || '0'}
                  color="text-slate-400"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Click hint */}
      <div className="absolute bottom-2 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-xs text-slate-500 flex items-center gap-1">
          View details <ArrowRight className="w-3 h-3" />
        </span>
      </div>
    </motion.div>
  );
}

// Stat box component
function StatBox({ 
  icon, 
  label, 
  value, 
  color 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string | number; 
  color: string;
}) {
  return (
    <div className="text-center">
      <div className={`flex items-center justify-center gap-1 ${color} mb-1`}>
        {icon}
        <span className="text-sm font-bold">{value}</span>
      </div>
      <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
    </div>
  );
}
