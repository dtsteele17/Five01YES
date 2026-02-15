'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Trophy, 
  TrendingUp, 
  Target, 
  ChevronLeft, 
  ChevronRight, 
  Crown, 
  Star, 
  Award,
  Gamepad2,
  Flame,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

interface RankedTier {
  id: string;
  tier_name: string;
  division_name: string;
  tier_order: number;
  division_order: number;
  rp_min: number;
  rp_max: number;
}

interface PlayerState {
  season_id: string;
  player_id: string;
  rp: number;
  mmr: number;
  games_played: number;
  wins: number;
  losses: number;
  provisional_games_remaining: number;
  division_name: string;
}

interface Season {
  id: string;
  name: string;
}

interface RecentRankedMatch {
  id: string;
  result: 'win' | 'loss' | 'draw';
  game_mode: number;
  rp_change: number;
  opponent_username: string;
  played_at: string;
}

// Animation variants
const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 100,
      damping: 15,
    },
  },
};

// Tier color definitions - matching dashboard exactly (toned down for readability)
const TIER_COLORS = {
  bronze: {
    gradient: 'from-orange-800 via-amber-800 to-orange-900',
    bg: 'bg-orange-600',
    accent: 'bg-orange-600',
    text: 'text-orange-400',
    border: 'border-orange-600/30',
    glow: 'shadow-orange-600/25',
  },
  silver: {
    gradient: 'from-gray-500 via-slate-500 to-gray-600',
    bg: 'bg-gray-500',
    accent: 'bg-gray-500',
    text: 'text-gray-400',
    border: 'border-gray-500/30',
    glow: 'shadow-gray-500/25',
  },
  gold: {
    gradient: 'from-yellow-600 via-amber-600 to-yellow-700',
    bg: 'bg-amber-600',
    accent: 'bg-amber-600',
    text: 'text-amber-400',
    border: 'border-amber-600/30',
    glow: 'shadow-amber-600/25',
  },
  platinum: {
    gradient: 'from-cyan-600 via-sky-600 to-cyan-700',
    bg: 'bg-cyan-600',
    accent: 'bg-cyan-600',
    text: 'text-cyan-400',
    border: 'border-cyan-600/30',
    glow: 'shadow-cyan-600/25',
  },
  champion: {
    gradient: 'from-red-600 via-rose-600 to-red-700',
    bg: 'bg-red-600',
    accent: 'bg-red-600',
    text: 'text-red-400',
    border: 'border-red-600/30',
    glow: 'shadow-red-600/25',
  },
  grandchampion: {
    gradient: 'from-purple-600 via-violet-600 to-purple-700',
    bg: 'bg-purple-600',
    accent: 'bg-purple-600',
    text: 'text-purple-400',
    border: 'border-purple-600/30',
    glow: 'shadow-purple-600/25',
  },
};

// Get tier key from tier name
function getTierKey(tierName: string): keyof typeof TIER_COLORS {
  const name = tierName.toLowerCase();
  if (name.includes('grand')) return 'grandchampion';
  if (name.includes('champion')) return 'champion';
  if (name.includes('platinum')) return 'platinum';
  if (name.includes('gold')) return 'gold';
  if (name.includes('silver')) return 'silver';
  return 'bronze';
}

// Get tier icon based on tier name
function getTierIcon(tierName: string) {
  const name = tierName.toLowerCase();
  if (name.includes('grand champion')) return <Crown className="w-8 h-8 text-white" />;
  if (name.includes('champion')) return <Trophy className="w-8 h-8 text-white" />;
  if (name.includes('platinum')) return <Award className="w-8 h-8 text-white" />;
  if (name.includes('gold')) return <Star className="w-8 h-8 text-white" />;
  if (name.includes('silver')) return <Shield className="w-8 h-8 text-white" />;
  return <Target className="w-8 h-8 text-white" />;
}

// Current Rank Card - Premium Elite Edition
function CurrentRankCard({ 
  playerState, 
  season,
  nextTier,
  rpToNext 
}: { 
  playerState: PlayerState; 
  season: Season | null;
  nextTier: RankedTier | null;
  rpToNext: number;
}) {
  const tierKey = getTierKey(playerState.division_name);
  const colors = TIER_COLORS[tierKey];
  const isGrandChampion = tierKey === 'grandchampion';
  const winRate = playerState.games_played > 0 
    ? Math.round((playerState.wins / playerState.games_played) * 100) 
    : 0;

  return (
    <div className={`relative overflow-hidden rounded-3xl ${isGrandChampion ? 'bg-gradient-to-br from-purple-900/60 via-slate-900/80 to-slate-950' : 'bg-slate-800/50'} border-2 ${isGrandChampion ? 'border-purple-500/50' : colors.border} shadow-2xl ${colors.glow}`}>
      {/* Animated background effects */}
      <div className={`absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,${isGrandChampion ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.03)'}_50%,transparent_75%)] animate-pulse`} />
      <div className={`absolute top-0 left-1/4 w-96 h-96 ${colors.bg}/10 rounded-full blur-3xl animate-pulse`} />
      <div className={`absolute bottom-0 right-1/4 w-64 h-64 ${colors.bg}/5 rounded-full blur-3xl`} />
      
      {/* Top accent line */}
      <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-transparent ${isGrandChampion ? 'via-purple-500' : 'via-amber-500'} to-transparent`} />
      
      {/* Corner decorations for Grand Champion */}
      {isGrandChampion && (
        <>
          <div className="absolute top-4 left-4">
            <Star className="w-5 h-5 text-purple-400/50 animate-pulse" />
          </div>
          <div className="absolute top-4 right-4">
            <Star className="w-5 h-5 text-purple-400/50 animate-pulse" />
          </div>
          <div className="absolute bottom-4 left-4">
            <Star className="w-4 h-4 text-amber-400/40" />
          </div>
          <div className="absolute bottom-4 right-4">
            <Star className="w-4 h-4 text-amber-400/40" />
          </div>
        </>
      )}
      
      <div className="relative z-10 p-8">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8">
          {/* Left - Crown Icon & Division */}
          <div className="flex items-center gap-5">
            <div className="relative">
              {/* Multiple glow layers for premium effect */}
              <div className={`absolute inset-0 ${colors.bg}/50 rounded-2xl blur-2xl animate-pulse`} />
              <div className={`absolute inset-0 ${colors.bg}/30 rounded-2xl blur-xl`} />
              <div className={`absolute -inset-2 ${colors.bg}/20 rounded-3xl blur-lg`} />
              <div className={`relative w-24 h-24 rounded-2xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-2xl ${colors.glow} ring-2 ring-white/30 ${isGrandChampion ? 'animate-pulse' : ''}`}>
                {getTierIcon(playerState.division_name)}
              </div>
              {/* Floating badge for Grand Champion */}
              {isGrandChampion && (
                <div className="absolute -top-2 -right-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold px-2 py-1 rounded-lg shadow-lg">
                  APEX
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className={`${colors.text} text-sm font-bold uppercase tracking-wider`}>Current Rank</p>
                {isGrandChampion && <Crown className="w-4 h-4 text-amber-400" />}
              </div>
              <div className="relative">
                <h2 className={`text-4xl font-black text-white mt-1 drop-shadow-[0_0_15px_${isGrandChampion ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.3)'}]`}>
                  {playerState.division_name}
                </h2>
                <div className={`absolute -inset-3 ${colors.bg}/30 rounded-xl blur-lg -z-10`} />
              </div>
              {isGrandChampion && (
                <p className="text-purple-300/80 text-xs mt-1 font-medium">Elite of the Elite</p>
              )}
            </div>
          </div>

          {/* Center - ELO Display */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className={`absolute -inset-6 ${colors.bg}/20 rounded-full blur-3xl animate-pulse`} />
              <div className={`absolute -inset-4 ${colors.bg}/10 rounded-full blur-2xl`} />
              <p className={`relative text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white ${isGrandChampion ? 'to-purple-300' : 'to-slate-300'} drop-shadow-2xl`}>
                {playerState.rp}
              </p>
            </div>
            <p className={`${colors.text}/80 text-sm font-bold uppercase tracking-[0.3em] mt-2`}>ELO Rating</p>
          </div>

          {/* Right - Play Button & Placement */}
          <div className="flex flex-col items-end gap-4">
            {playerState.provisional_games_remaining ? (
              <div className="w-52 bg-slate-900/50 rounded-xl p-3 border border-amber-500/20">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-amber-400 font-medium">Placement</span>
                  <span className="text-white font-bold">{10 - playerState.provisional_games_remaining}/10</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-500"
                    style={{ width: `${(10 - playerState.provisional_games_remaining) * 10}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-400/60 text-sm">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Ranked Active
              </div>
            )}
            {nextTier && (
              <div className="text-right">
                <p className="text-slate-400 text-sm">Next: <span className="text-emerald-400 font-semibold">{nextTier.division_name}</span></p>
                <p className="text-xs text-slate-500">{rpToNext} RP needed</p>
              </div>
            )}
          </div>
        </div>

        {/* Stats Row - Enhanced */}
        <div className="mt-8 pt-6 border-t border-slate-700/50">
          <div className="grid grid-cols-4 gap-4">
            <div className={`text-center p-4 rounded-xl bg-slate-900/40 border ${isGrandChampion ? 'border-emerald-500/30' : 'border-emerald-500/20'} backdrop-blur-sm hover:bg-slate-900/60 transition-colors`}>
              <p className="text-2xl font-black text-emerald-400">{playerState.wins}</p>
              <p className="text-slate-400 text-xs uppercase tracking-wider mt-1">Wins</p>
            </div>
            <div className={`text-center p-4 rounded-xl bg-slate-900/40 border ${isGrandChampion ? 'border-rose-500/30' : 'border-rose-500/20'} backdrop-blur-sm hover:bg-slate-900/60 transition-colors`}>
              <p className="text-2xl font-black text-rose-400">{playerState.losses}</p>
              <p className="text-slate-400 text-xs uppercase tracking-wider mt-1">Losses</p>
            </div>
            <div className={`text-center p-4 rounded-xl bg-slate-900/40 border ${isGrandChampion ? 'border-blue-500/30' : 'border-blue-500/20'} backdrop-blur-sm hover:bg-slate-900/60 transition-colors`}>
              <p className="text-2xl font-black text-blue-400">{winRate}%</p>
              <p className="text-slate-400 text-xs uppercase tracking-wider mt-1">Win Rate</p>
            </div>
            <div className={`text-center p-4 rounded-xl bg-slate-900/40 border ${isGrandChampion ? 'border-purple-500/30' : 'border-purple-500/20'} backdrop-blur-sm hover:bg-slate-900/60 transition-colors`}>
              <p className="text-2xl font-black text-purple-400">{playerState.games_played}</p>
              <p className="text-slate-400 text-xs uppercase tracking-wider mt-1">Games</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Tier Page Header - Premium Elite Edition
function TierPageHeader({ tierName }: { tierName: string }) {
  const tierKey = getTierKey(tierName);
  const colors = TIER_COLORS[tierKey];
  const isGrandChampion = tierKey === 'grandchampion';

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${colors.gradient} p-6 mb-6 shadow-2xl ${colors.glow} border border-white/10`}>
      {/* Animated background effects */}
      <div className="absolute inset-0 bg-black/20" />
      <div className={`absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.1)_50%,transparent_75%)]`} />
      {isGrandChampion && (
        <>
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl animate-pulse" />
        </>
      )}
      
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${isGrandChampion ? 'bg-white/30 backdrop-blur-sm ring-2 ring-white/30' : 'bg-white/20 backdrop-blur-sm'} shadow-lg`}>
            {getTierIcon(tierName)}
          </div>
          <div>
            <p className="text-white/80 text-sm font-semibold uppercase tracking-wider">
              {isGrandChampion ? (
                <span className="flex items-center gap-2">
                  <Star className="w-3 h-3 text-amber-300" />
                  Apex Tier
                  <Star className="w-3 h-3 text-amber-300" />
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <TrendingUp className="w-3 h-3" />
                  Rank Progression
                </span>
              )}
            </p>
            <h2 className={`text-3xl font-black text-white ${isGrandChampion ? 'drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]' : ''}`}>
              {tierName}
            </h2>
          </div>
        </div>
        <div className={`px-4 py-2 rounded-xl ${isGrandChampion ? 'bg-gradient-to-r from-amber-500/30 to-purple-500/30 border border-amber-400/30' : 'bg-white/20'} backdrop-blur-sm`}>
          <span className="text-white font-bold text-sm">
            {isGrandChampion ? '👑 Grand Champion' :
             tierKey === 'champion' ? '🏆 Elite Tier' : 
             tierKey === 'platinum' ? '💎 Advanced Tier' : 
             tierKey === 'gold' ? '⭐ Intermediate Tier' : 
             tierKey === 'silver' ? '🛡️ Developing Tier' : '🎯 Entry Tier'}
          </span>
        </div>
      </div>
    </div>
  );
}

// Tier Navigator - Premium Edition with Grand Champion as separate tier
function TierNavigator({ 
  tiers, 
  playerState,
  currentTierIndex 
}: { 
  tiers: RankedTier[]; 
  playerState: PlayerState | null;
  currentTierIndex: number;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const ranksPerPage = 4;
  
  // Separate Grand Champion from other tiers - it gets its own page
  const grandChampionTier = tiers.find(t => t.tier_name.toLowerCase().includes('grand'));
  const normalTiers = tiers.filter(t => !t.tier_name.toLowerCase().includes('grand'));
  
  // Create pages: normal tiers + Grand Champion as separate final page
  const allPages: RankedTier[][] = [];
  
  // Add normal tier pages (4 per page)
  for (let i = 0; i < normalTiers.length; i += ranksPerPage) {
    allPages.push(normalTiers.slice(i, i + ranksPerPage));
  }
  
  // Add Grand Champion as its own page if it exists
  if (grandChampionTier) {
    allPages.push([grandChampionTier]);
  }
  
  const totalPages = allPages.length;

  // Set initial page to show user's current tier
  useEffect(() => {
    if (currentTierIndex >= 0) {
      const userTier = tiers[currentTierIndex];
      if (userTier) {
        if (userTier.tier_name.toLowerCase().includes('grand')) {
          // Grand Champion is always last page
          setCurrentPage(totalPages - 1);
        } else {
          // Find which page the user's tier is on
          const userPage = allPages.findIndex(page => 
            page.some(t => t.id === userTier.id)
          );
          if (userPage >= 0) setCurrentPage(userPage);
        }
      }
    }
  }, [currentTierIndex, tiers, totalPages, allPages]);

  const currentTiers = allPages[currentPage] || [];
  const isGrandChampionPage = currentTiers.length === 1 && currentTiers[0]?.tier_name.toLowerCase().includes('grand');

  // Get the dominant tier name for the header (first tier on current page)
  const currentTierName = currentTiers[0]?.tier_name || '';
  const tierKey = getTierKey(currentTierName);
  const colors = TIER_COLORS[tierKey];

  const goToPrevious = () => {
    setCurrentPage(prev => Math.max(0, prev - 1));
  };

  const goToNext = () => {
    setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
  };

  return (
    <div className="space-y-6">
      {/* Tier Navigator - Premium Edition */}
      <Card className={`relative overflow-hidden p-6 ${isGrandChampionPage ? 'bg-gradient-to-br from-purple-900/30 via-slate-900/60 to-slate-900/80 border-purple-500/40' : 'bg-slate-800/40 border-slate-700/50'} border-2`}>
        <div className={`absolute top-0 right-0 w-96 h-96 ${colors.bg}/5 rounded-full blur-3xl`} />
        {isGrandChampionPage && (
          <>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-3xl" />
            <div className="absolute top-4 left-4"><Star className="w-4 h-4 text-amber-400/30" /></div>
            <div className="absolute top-4 right-4"><Star className="w-4 h-4 text-amber-400/30" /></div>
            <div className="absolute bottom-4 left-4"><Star className="w-3 h-3 text-purple-400/30" /></div>
            <div className="absolute bottom-4 right-4"><Star className="w-3 h-3 text-purple-400/30" /></div>
          </>
        )}
        
        <div className="relative">
          {/* Tier Header with colors */}
          <TierPageHeader tierName={currentTierName} />
          
          {/* Navigation Arrows - Premium Styling */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <button
              onClick={goToPrevious}
              disabled={currentPage === 0}
              className={`w-12 h-12 rounded-xl bg-slate-800 border ${colors.border} flex items-center justify-center text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-105 ${isGrandChampionPage ? 'shadow-lg shadow-purple-500/20' : ''}`}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            
            <div className={`px-6 py-3 rounded-xl bg-slate-800/80 border ${colors.border} ${isGrandChampionPage ? 'shadow-lg shadow-purple-500/20' : ''}`}>
              <span className={`${colors.text} font-bold text-lg`}>
                Tier {currentPage + 1} of {totalPages}
              </span>
            </div>
            
            <button
              onClick={goToNext}
              disabled={currentPage === totalPages - 1}
              className={`w-12 h-12 rounded-xl bg-slate-800 border ${colors.border} flex items-center justify-center text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-105 ${isGrandChampionPage ? 'shadow-lg shadow-purple-500/20' : ''}`}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          {/* Rank Cards Grid - Premium Styling */}
          <div className={`grid gap-4 ${isGrandChampionPage ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-2 md:grid-cols-4'}`}>
            <AnimatePresence mode="wait">
              {currentTiers.map((tier, index) => {
                const isCurrent = playerState && 
                  playerState.rp >= tier.rp_min && 
                  playerState.rp <= tier.rp_max;
                const tierK = getTierKey(tier.tier_name);
                const tierColors = TIER_COLORS[tierK];
                const isGrandChampion = tierK === 'grandchampion';
                
                return (
                  <motion.div
                    key={tier.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                    className={`relative overflow-hidden rounded-2xl p-6 border-2 transition-all ${
                      isCurrent 
                        ? `bg-gradient-to-br ${tierColors.gradient} border-white/60 shadow-2xl ${tierColors.glow} ${isGrandChampion ? 'ring-2 ring-amber-400/50' : ''}` 
                        : isGrandChampion
                        ? 'bg-gradient-to-br from-purple-900/60 via-violet-900/40 to-purple-900/60 border-purple-500/40 hover:border-purple-400/60 hover:shadow-xl hover:shadow-purple-500/20'
                        : 'bg-slate-900/80 border-slate-700/50 hover:border-slate-500 hover:shadow-lg'
                    }`}
                  >
                    {/* Background effects for Grand Champion */}
                    {isGrandChampion && (
                      <>
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-400/20 via-transparent to-transparent" />
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/20 rounded-full blur-2xl animate-pulse" />
                      </>
                    )}
                    
                    {isCurrent && (
                      <div className="absolute top-0 right-0">
                        <Badge className={`bg-white text-slate-900 text-xs font-bold rounded-tl-none rounded-br-none rounded-tr-lg rounded-bl-lg px-3 py-1 ${isGrandChampion ? 'shadow-lg' : ''}`}>
                          YOU
                        </Badge>
                      </div>
                    )}
                    
                    {isGrandChampion && !isCurrent && (
                      <div className="absolute top-0 right-0">
                        <Badge className="bg-purple-500/30 text-purple-200 text-xs font-bold rounded-tl-none rounded-br-none rounded-tr-lg rounded-bl-lg px-3 py-1 border border-purple-400/30">
                          APEX
                        </Badge>
                      </div>
                    )}
                    
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isCurrent ? 'bg-white/20' : isGrandChampion ? 'bg-gradient-to-br from-amber-500/30 to-purple-500/30' : 'bg-slate-800'}`}>
                          {getTierIcon(tier.tier_name)}
                        </div>
                      </div>
                      
                      <p className={`text-xs uppercase tracking-wider mb-1 font-semibold ${
                        isCurrent ? 'text-white/90' : isGrandChampion ? 'text-amber-300' : tierColors.text
                      }`}>
                        {tier.tier_name}
                      </p>
                      <h3 className={`text-2xl font-black mb-4 ${isGrandChampion ? 'text-white drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]' : 'text-white'}`}>
                        {tier.division_name}
                      </h3>
                      
                      <div className="space-y-2">
                        <div className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg ${
                          isCurrent ? 'bg-white/15' : isGrandChampion ? 'bg-purple-500/20 border border-purple-500/20' : 'bg-slate-800'
                        }`}>
                          <span className={isCurrent ? 'text-white/80' : isGrandChampion ? 'text-purple-300' : 'text-slate-500'}>Entry</span>
                          <span className={`font-bold ${isCurrent ? 'text-white' : isGrandChampion ? 'text-amber-300' : 'text-slate-300'}`}>
                            {isGrandChampion ? `${tier.rp_min}+` : `${tier.rp_min} RP`}
                          </span>
                        </div>
                        {tier.rp_max < 999999 && !isGrandChampion && (
                          <div className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg ${
                            isCurrent ? 'bg-white/15' : 'bg-slate-800'
                          }`}>
                            <span className={isCurrent ? 'text-white/80' : 'text-slate-500'}>Max</span>
                            <span className={`font-bold ${isCurrent ? 'text-white' : 'text-slate-300'}`}>{tier.rp_max} RP</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Grand Champion special text */}
                      {isGrandChampion && (
                        <div className="mt-4 pt-4 border-t border-purple-500/30">
                          <p className="text-purple-200/80 text-xs text-center">
                            The pinnacle of competitive play
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Progress Dots */}
          <div className="flex items-center justify-center gap-2 mt-6">
            {Array.from({ length: totalPages }).map((_, index) => {
              const pageTierName = allTiers[index * ranksPerPage]?.tier_name || '';
              const pageTierKey = getTierKey(pageTierName);
              const pageColors = TIER_COLORS[pageTierKey];
              
              return (
                <button
                  key={index}
                  onClick={() => setCurrentPage(index)}
                  className={`h-2 rounded-full transition-all ${
                    index === currentPage 
                      ? `w-8 ${pageColors.bg}` 
                      : 'w-2 bg-slate-600 hover:bg-slate-500'
                  }`}
                />
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}

// Recent Ranked Matches Component
function RecentRankedMatches({ userId }: { userId: string }) {
  const [matches, setMatches] = useState<RecentRankedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadMatches() {
      try {
        const { data } = await supabase
          .from('match_history')
          .select('id, result, game_mode, rp_change, opponent_username, played_at')
          .eq('user_id', userId)
          .eq('match_type', 'ranked')
          .order('played_at', { ascending: false })
          .limit(10);

        if (data) {
          setMatches(data as RecentRankedMatch[]);
        }
      } catch (err) {
        console.error('Error loading recent matches:', err);
      } finally {
        setLoading(false);
      }
    }

    loadMatches();
  }, [userId, supabase]);

  if (loading) {
    return (
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </Card>
    );
  }

  if (matches.length === 0) {
    return (
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="text-center py-12">
          <Gamepad2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No ranked matches played yet.</p>
          <p className="text-slate-500 text-sm mt-1">Start playing to see your match history!</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Last Ranked Games</h2>
            <p className="text-slate-400 text-sm">Your recent competitive matches</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {matches.map((match, index) => (
          <motion.div
            key={match.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 hover:border-slate-600/50 transition-colors"
          >
            <div className="flex items-center gap-4">
              {/* Result Badge */}
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                match.result === 'win' 
                  ? 'bg-emerald-500/20 border border-emerald-500/30' 
                  : match.result === 'loss'
                  ? 'bg-rose-500/20 border border-rose-500/30'
                  : 'bg-amber-500/20 border border-amber-500/30'
              }`}>
                {match.result === 'win' ? (
                  <Trophy className="w-6 h-6 text-emerald-400" />
                ) : match.result === 'loss' ? (
                  <Flame className="w-6 h-6 text-rose-400" />
                ) : (
                  <Activity className="w-6 h-6 text-amber-400" />
                )}
              </div>
              
              <div>
                <p className="text-white font-semibold">
                  {match.result === 'win' ? 'Victory' : match.result === 'loss' ? 'Defeat' : 'Draw'}
                  <span className="text-slate-500 mx-2">vs</span>
                  <span className="text-slate-300">{match.opponent_username || 'Unknown'}</span>
                </p>
                <p className="text-slate-500 text-sm">
                  {match.game_mode} • {formatDistanceToNow(new Date(match.played_at), { addSuffix: true })}
                </p>
              </div>
            </div>

            {/* RP Change */}
            <div className="text-right">
              <p className={`text-lg font-bold ${
                (match.rp_change || 0) > 0 
                  ? 'text-emerald-400' 
                  : (match.rp_change || 0) < 0 
                  ? 'text-rose-400' 
                  : 'text-slate-400'
              }`}>
                {(match.rp_change || 0) > 0 ? '+' : ''}{match.rp_change || 0} RP
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

export default function RankedDivisionsPage() {
  const supabase = createClient();

  const [tiers, setTiers] = useState<RankedTier[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      }

      const { data: tiersData, error: tiersError } = await supabase
        .from('ranked_tiers')
        .select('*')
        .order('tier_order', { ascending: true })
        .order('division_order', { ascending: false });

      if (tiersError) {
        console.error('Error fetching tiers:', tiersError);
        toast.error('Failed to load ranked tiers');
      } else {
        setTiers(tiersData || []);
      }

      const { data: stateData, error: stateError } = await supabase.rpc('rpc_ranked_get_my_state');

      if (stateError) {
        console.error('Error fetching player state:', stateError);
      } else if (stateData) {
        setSeason(stateData.season);
        setPlayerState(stateData.player_state);
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  // Get current tier index
  const currentTierIndex = playerState ? tiers.findIndex(t => 
    playerState.rp >= t.rp_min && playerState.rp <= t.rp_max
  ) : -1;

  // Get next tier
  const nextTier = currentTierIndex > 0 ? tiers[currentTierIndex - 1] : null;

  // Calculate RP to next tier
  const rpToNext = nextTier ? nextTier.rp_min - (playerState?.rp || 0) : 0;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <Skeleton className="h-10 w-64 bg-slate-800 mb-2" />
          <Skeleton className="h-5 w-96 bg-slate-800" />
        </div>
        <Skeleton className="h-32 bg-slate-800 rounded-2xl" />
        <Skeleton className="h-64 bg-slate-800 rounded-2xl" />
      </div>
    );
  }

  return (
    <motion.div 
      className="max-w-7xl mx-auto space-y-8"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <motion.p 
            className="text-amber-400 text-sm font-semibold uppercase tracking-wider mb-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
          >
            Competitive Play
          </motion.p>
          <motion.h1 
            className="text-4xl md:text-5xl font-black text-white tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Ranked Divisions
          </motion.h1>
          <motion.p 
            className="text-slate-400 mt-2 text-lg max-w-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            Climb divisions by earning Ranking Points. Face tougher opponents as you rise.
          </motion.p>
        </div>
        
        {season && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Badge
              variant="outline"
              className="border-amber-500/30 text-amber-400 px-4 py-2 text-sm"
            >
              <Trophy className="w-4 h-4 mr-2" />
              {season.name}
            </Badge>
          </motion.div>
        )}
      </div>

      {/* Single Current Rank Card - Dashboard Style */}
      {playerState && (
        <motion.div variants={itemVariants}>
          <CurrentRankCard 
            playerState={playerState} 
            season={season}
            nextTier={nextTier}
            rpToNext={rpToNext}
          />
        </motion.div>
      )}

      {/* Tier Navigator - 4 ranks at a time with colored pages */}
      <motion.div variants={itemVariants}>
        <TierNavigator 
          tiers={tiers} 
          playerState={playerState}
          currentTierIndex={currentTierIndex}
        />
      </motion.div>

      {/* Last Ranked Games */}
      {userId && (
        <motion.div variants={itemVariants}>
          <RecentRankedMatches userId={userId} />
        </motion.div>
      )}
    </motion.div>
  );
}
