'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

// Current Rank Card - Ultra Premium Edition
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
    <div className={`relative overflow-hidden rounded-3xl ${isGrandChampion ? 'bg-gradient-to-br from-purple-900/80 via-slate-900/90 to-slate-950' : 'bg-gradient-to-br from-slate-800/80 via-slate-900/90 to-slate-950'} border-2 ${isGrandChampion ? 'border-purple-400/60' : colors.border} shadow-[0_0_60px_-15px] ${colors.glow} backdrop-blur-xl`}>
      {/* Animated mesh gradient background */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent" />
      <div className={`absolute inset-0 bg-[linear-gradient(60deg,transparent_30%,${isGrandChampion ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.05)'}_50%,transparent_70%)] animate-[shimmer_4s_ease-in-out_infinite]`} />
      
      {/* Animated floating orbs */}
      <div className={`absolute top-1/4 left-1/4 w-64 h-64 ${colors.bg}/20 rounded-full blur-[100px] animate-pulse`} />
      <div className={`absolute bottom-1/4 right-1/4 w-48 h-48 ${colors.bg}/15 rounded-full blur-[80px] animate-pulse delay-1000`} />
      
      {/* Premium top border glow */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-${isGrandChampion ? 'purple' : colors.bg.split('-')[1]}-400 to-transparent`} />
      <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white to-transparent opacity-50`} />
      
      {/* Corner star decorations */}
      <div className="absolute top-6 left-6">
        <Star className={`w-4 h-4 ${isGrandChampion ? 'text-purple-400/60' : `${colors.text}/40`} animate-pulse`} />
      </div>
      <div className="absolute top-6 right-6">
        <Star className={`w-4 h-4 ${isGrandChampion ? 'text-amber-400/60' : `${colors.text}/40`} animate-pulse delay-500`} />
      </div>
      
      <div className="relative z-10 p-10">
        {/* Header Badge */}
        <div className="flex justify-center mb-6">
          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r ${isGrandChampion ? 'from-amber-500/20 via-purple-500/20 to-amber-500/20' : 'from-white/10 to-white/5'} border ${isGrandChampion ? 'border-amber-400/30' : 'border-white/10'} backdrop-blur-sm`}>
            <Flame className={`w-4 h-4 ${isGrandChampion ? 'text-amber-400' : colors.text}`} />
            <span className={`text-sm font-bold uppercase tracking-wider ${isGrandChampion ? 'text-amber-300' : colors.text}`}>Current Season Active</span>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-10">
          {/* Left - Rank Badge & Division */}
          <div className="flex items-center gap-6">
            <div className="relative">
              {/* Multi-layered glow effect */}
              <div className={`absolute inset-0 ${colors.bg}/60 rounded-3xl blur-2xl animate-pulse`} />
              <div className={`absolute inset-0 ${colors.bg}/40 rounded-3xl blur-xl`} />
              <div className={`absolute -inset-3 ${colors.bg}/30 rounded-[2rem] blur-lg`} />
              
              {/* Main badge container */}
              <div className={`relative w-28 h-28 rounded-3xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-2xl ${colors.glow} ring-2 ring-white/40 ring-offset-2 ring-offset-slate-900/50`}>
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-t from-black/20 to-transparent" />
                <div className="relative transform scale-125">
                  {getTierIcon(playerState.division_name)}
                </div>
              </div>
              
              {/* Floating APEX badge for Grand Champion */}
              {isGrandChampion && (
                <div className="absolute -top-3 -right-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-black px-3 py-1.5 rounded-xl shadow-xl border-2 border-amber-300 animate-bounce">
                  APEX
                </div>
              )}
            </div>
            
            <div>
              <div className="flex items-center gap-3 mb-2">
                <p className={`${colors.text} text-sm font-black uppercase tracking-[0.2em]`}>Current Rank</p>
                {isGrandChampion && <Crown className="w-5 h-5 text-amber-400" />}
              </div>
              <div className="relative">
                <h2 className={`text-5xl font-black text-white tracking-tight drop-shadow-[0_0_20px_${isGrandChampion ? 'rgba(168,85,247,0.6)' : 'rgba(255,255,255,0.4)'}]`}>
                  {playerState.division_name}
                </h2>
                <div className={`absolute -inset-4 ${colors.bg}/40 rounded-2xl blur-xl -z-10`} />
              </div>
              {isGrandChampion ? (
                <p className="text-purple-300/90 text-sm mt-2 font-medium flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  Elite of the Elite
                  <Star className="w-4 h-4 text-amber-400" />
                </p>
              ) : (
                <p className="text-slate-400 text-sm mt-2">Keep climbing to reach the next tier</p>
              )}
            </div>
          </div>

          {/* Center - ELO Display */}
          <div className="flex flex-col items-center">
            <div className="relative">
              {/* Glowing orb behind ELO */}
              <div className={`absolute inset-0 ${colors.bg}/30 rounded-full blur-3xl scale-150 animate-pulse`} />
              <div className={`absolute -inset-8 ${colors.bg}/20 rounded-full blur-2xl`} />
              
              <p className={`relative text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white ${isGrandChampion ? 'via-purple-200 to-purple-400' : 'via-slate-200 to-slate-400'} drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]`}>
                {playerState.rp}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <Activity className={`w-4 h-4 ${colors.text}`} />
              <p className={`${colors.text} text-sm font-black uppercase tracking-[0.3em]`}>ELO Rating</p>
            </div>
          </div>

          {/* Right - Status & Next Tier */}
          <div className="flex flex-col items-end gap-4">
            {playerState.provisional_games_remaining ? (
              <div className="w-56 bg-slate-900/60 rounded-2xl p-4 border border-amber-500/30 backdrop-blur-sm">
                <div className="flex justify-between text-sm mb-3">
                  <span className="text-amber-400 font-bold">Placement Matches</span>
                  <span className="text-white font-black">{10 - playerState.provisional_games_remaining}/10</span>
                </div>
                <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 transition-all duration-500"
                    style={{ width: `${(10 - playerState.provisional_games_remaining) * 10}%` }}
                  />
                </div>
                <p className="text-slate-400 text-xs mt-2 text-center">Complete placements to get your rank</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 rounded-xl border border-emerald-500/30">
                <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                <span className="text-emerald-400 font-bold text-sm">Ranked Active</span>
              </div>
            )}
            
            {nextTier && (
              <div className="text-right p-4 bg-slate-900/40 rounded-2xl border border-white/5 backdrop-blur-sm">
                <p className="text-slate-400 text-sm mb-1">Next Rank</p>
                <p className="text-emerald-400 font-bold text-lg">{nextTier.division_name}</p>
                <div className="flex items-center gap-2 mt-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <p className="text-slate-500 text-xs">{rpToNext} RP needed</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats Row - Ultra Premium */}
        <div className="mt-10 pt-8 border-t border-white/10">
          <div className="grid grid-cols-4 gap-6">
            {[
              { label: 'Wins', value: playerState.wins, color: 'emerald', icon: Trophy },
              { label: 'Losses', value: playerState.losses, color: 'rose', icon: Flame },
              { label: 'Win Rate', value: `${winRate}%`, color: 'blue', icon: TrendingUp },
              { label: 'Games', value: playerState.games_played, color: 'purple', icon: Gamepad2 },
            ].map((stat, index) => (
              <div 
                key={index}
                className={`relative group text-center p-5 rounded-2xl bg-gradient-to-b from-slate-800/50 to-slate-900/50 border ${isGrandChampion ? `border-${stat.color}-500/30` : 'border-white/5'} backdrop-blur-sm hover:border-${stat.color}-500/40 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-${stat.color}-500/20`}
              >
                <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-${stat.color}-500/50 to-transparent`} />
                <stat.icon className={`w-5 h-5 mx-auto mb-2 text-${stat.color}-400`} />
                <p className={`text-3xl font-black text-${stat.color}-400`}>{stat.value}</p>
                <p className="text-slate-400 text-xs uppercase tracking-wider mt-1 font-medium">{stat.label}</p>
              </div>
            ))}
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

// Tier Navigator - Ultra Premium Edition
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

  // Debug logging
  useEffect(() => {
    console.log('[RankedDivisions] totalPages:', totalPages, 'currentPage:', currentPage, 'allPages:', allPages.length);
  }, [totalPages, currentPage, allPages]);

  // Set initial page to show user's current tier
  useEffect(() => {
    if (currentTierIndex >= 0 && allPages.length > 0) {
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

  // Use refs for keyboard navigation to avoid stale closures
  const currentPageRef = useRef(currentPage);
  const totalPagesRef = useRef(totalPages);
  
  useEffect(() => {
    currentPageRef.current = currentPage;
    totalPagesRef.current = totalPages;
  }, [currentPage, totalPages]);

  const goToPrevious = useCallback(() => {
    console.log('[RankedDivisions] goToPrevious clicked');
    setCurrentPage(prev => {
      if (prev <= 0) return prev;
      return prev - 1;
    });
  }, []);

  const goToNext = useCallback(() => {
    console.log('[RankedDivisions] goToNext clicked');
    setCurrentPage(prev => {
      if (prev >= totalPagesRef.current - 1) return prev;
      return prev + 1;
    });
  }, []);

  // Keyboard navigation - using refs to avoid dependency issues
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentPage(prev => {
          if (prev <= 0) return prev;
          return prev - 1;
        });
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentPage(prev => {
          if (prev >= totalPagesRef.current - 1) return prev;
          return prev + 1;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // Empty deps - uses refs internally

  return (
    <div className="space-y-6">
      {/* Tier Navigator - Ultra Premium Edition */}
      <Card className={`relative overflow-hidden p-8 ${isGrandChampionPage ? 'bg-gradient-to-br from-purple-900/50 via-slate-900/80 to-slate-950 border-purple-400/50' : 'bg-gradient-to-br from-slate-800/60 via-slate-900/80 to-slate-950 border-slate-600/50'} border-2 shadow-2xl backdrop-blur-xl`}>
        {/* Animated background effects */}
        <div className={`absolute top-0 right-0 w-[500px] h-[500px] ${colors.bg}/10 rounded-full blur-[120px]`} />
        <div className={`absolute bottom-0 left-0 w-[300px] h-[300px] ${colors.bg}/5 rounded-full blur-[80px]`} />
        
        {isGrandChampionPage && (
          <>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-purple-500/10 rounded-full blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-500/10 via-transparent to-transparent" />
          </>
        )}
        
        {/* Decorative corner elements */}
        <div className="absolute top-6 left-6 w-8 h-8 border-l-2 border-t-2 border-white/10 rounded-tl-lg" />
        <div className="absolute top-6 right-6 w-8 h-8 border-r-2 border-t-2 border-white/10 rounded-tr-lg" />
        <div className="absolute bottom-6 left-6 w-8 h-8 border-l-2 border-b-2 border-white/10 rounded-bl-lg" />
        <div className="absolute bottom-6 right-6 w-8 h-8 border-r-2 border-b-2 border-white/10 rounded-br-lg" />
        
        <div className="relative">
          {/* Tier Header */}
          <TierPageHeader tierName={currentTierName} />
          
          {/* Navigation Controls - Ultra Premium */}
          <div className="flex items-center justify-center gap-4 mb-8 relative z-10">
            <button
              type="button"
              onClick={goToPrevious}
              disabled={currentPage === 0}
              className="w-14 h-14 rounded-2xl bg-slate-700 border-2 border-slate-600 flex items-center justify-center text-white transition-all duration-200 hover:scale-110 hover:bg-slate-600 hover:shadow-xl disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 cursor-pointer"
            >
              <ChevronLeft className="w-7 h-7 pointer-events-none" />
            </button>
            
            <div className="px-8 py-4 rounded-2xl bg-slate-800 border-2 border-slate-700 shadow-xl min-w-[180px] text-center">
              <span className="text-white font-black text-xl">
                Tier <span className="text-amber-400">{currentPage + 1}</span> / {totalPages}
              </span>
            </div>
            
            <button
              type="button"
              onClick={goToNext}
              disabled={currentPage >= totalPages - 1}
              className="w-14 h-14 rounded-2xl bg-slate-700 border-2 border-slate-600 flex items-center justify-center text-white transition-all duration-200 hover:scale-110 hover:bg-slate-600 hover:shadow-xl disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 cursor-pointer"
            >
              <ChevronRight className="w-7 h-7 pointer-events-none" />
            </button>
          </div>
          
          {/* Keyboard hint */}
          <p className="text-center text-slate-500 text-xs mb-6 flex items-center justify-center gap-2">
            <span className="px-2 py-1 bg-slate-800 rounded border border-slate-700">←</span>
            <span>Use arrow keys to navigate</span>
            <span className="px-2 py-1 bg-slate-800 rounded border border-slate-700">→</span>
          </p>

          {/* Rank Cards Grid - Ultra Premium Styling */}
          <div className={`grid gap-5 ${isGrandChampionPage ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-2 md:grid-cols-4'}`}>
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
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ delay: index * 0.08, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className={`relative overflow-hidden rounded-3xl p-6 border-2 transition-all duration-500 group cursor-pointer ${
                      isCurrent 
                        ? `bg-gradient-to-br ${tierColors.gradient} border-white/70 shadow-[0_0_40px_-10px] ${tierColors.glow} ${isGrandChampion ? 'ring-2 ring-amber-400/60' : ''} scale-105` 
                        : isGrandChampion
                        ? 'bg-gradient-to-br from-purple-900/80 via-violet-900/60 to-purple-900/80 border-purple-400/50 hover:border-purple-300/70 hover:shadow-2xl hover:shadow-purple-500/30'
                        : 'bg-gradient-to-b from-slate-800/80 to-slate-900/80 border-slate-600/50 hover:border-slate-400/50 hover:shadow-xl hover:shadow-white/5 hover:-translate-y-1'
                    }`}
                  >
                    {/* Premium background effects */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                    {isGrandChampion && (
                      <>
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-400/30 via-transparent to-transparent" />
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-500/30 rounded-full blur-3xl animate-pulse" />
                        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-700" />
                      </>
                    )}
                    
                    {/* Top shine effect */}
                    <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${isCurrent ? 'via-white/50' : 'via-white/20'} to-transparent`} />
                    
                    {/* Current rank badge */}
                    {isCurrent && (
                      <div className="absolute -top-1 -right-1">
                        <Badge className={`bg-gradient-to-r from-white to-slate-200 text-slate-900 text-xs font-black rounded-bl-xl rounded-tr-xl px-4 py-1.5 shadow-xl ${isGrandChampion ? 'shadow-amber-500/50' : ''}`}>
                          YOU
                        </Badge>
                      </div>
                    )}
                    
                    {isGrandChampion && !isCurrent && (
                      <div className="absolute -top-1 -right-1">
                        <Badge className="bg-gradient-to-r from-purple-500 to-violet-500 text-white text-xs font-black rounded-bl-xl rounded-tr-xl px-4 py-1.5 shadow-lg shadow-purple-500/30">
                          APEX
                        </Badge>
                      </div>
                    )}
                    
                    <div className="relative">
                      {/* Icon container */}
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${isCurrent ? 'bg-white/25 shadow-lg' : isGrandChampion ? 'bg-gradient-to-br from-amber-500/40 to-purple-500/40 shadow-lg shadow-purple-500/20' : 'bg-slate-800/80 border border-slate-700'} transition-transform group-hover:scale-110`}>
                        {getTierIcon(tier.tier_name)}
                      </div>
                      
                      <p className={`text-xs uppercase tracking-[0.15em] mb-1 font-bold ${
                        isCurrent ? 'text-white/90' : isGrandChampion ? 'text-amber-300' : tierColors.text
                      }`}>
                        {tier.tier_name}
                      </p>
                      <h3 className={`text-2xl font-black mb-5 ${isGrandChampion ? 'text-white drop-shadow-[0_0_15px_rgba(168,85,247,0.6)]' : 'text-white'}`}>
                        {tier.division_name}
                      </h3>
                      
                      <div className="space-y-2.5">
                        <div className={`flex items-center justify-between text-sm px-4 py-2.5 rounded-xl ${
                          isCurrent ? 'bg-white/15 backdrop-blur-sm' : isGrandChampion ? 'bg-purple-500/20 border border-purple-400/30 backdrop-blur-sm' : 'bg-slate-800/80 border border-slate-700/50'
                        }`}>
                          <span className={isCurrent ? 'text-white/80' : isGrandChampion ? 'text-purple-200' : 'text-slate-400'}>Entry</span>
                          <span className={`font-bold ${isCurrent ? 'text-white' : isGrandChampion ? 'text-amber-300' : 'text-slate-200'}`}>
                            {isGrandChampion ? `${tier.rp_min}+` : `${tier.rp_min} RP`}
                          </span>
                        </div>
                        {tier.rp_max < 999999 && !isGrandChampion && (
                          <div className={`flex items-center justify-between text-sm px-4 py-2.5 rounded-xl ${
                            isCurrent ? 'bg-white/15 backdrop-blur-sm' : 'bg-slate-800/80 border border-slate-700/50'
                          }`}>
                            <span className={isCurrent ? 'text-white/80' : 'text-slate-400'}>Max</span>
                            <span className={`font-bold ${isCurrent ? 'text-white' : 'text-slate-200'}`}>{tier.rp_max} RP</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Grand Champion special footer */}
                      {isGrandChampion && (
                        <div className="mt-5 pt-4 border-t border-purple-400/30">
                          <p className="text-purple-200/90 text-xs text-center font-medium flex items-center justify-center gap-2">
                            <Crown className="w-3 h-3 text-amber-400" />
                            The pinnacle of competitive play
                            <Crown className="w-3 h-3 text-amber-400" />
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Progress Dots - Premium */}
          <div className="flex items-center justify-center gap-3 mt-8">
            {Array.from({ length: totalPages }).map((_, index) => {
              const pageTierName = allPages[index]?.[0]?.tier_name || '';
              const pageTierKey = getTierKey(pageTierName);
              const pageColors = TIER_COLORS[pageTierKey];
              const isActive = index === currentPage;

              return (
                <button
                  key={index}
                  onClick={() => setCurrentPage(index)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    isActive
                      ? `w-10 ${pageColors.bg} shadow-lg ${pageColors.glow}`
                      : 'w-2.5 bg-slate-700 hover:bg-slate-500 hover:scale-125'
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
