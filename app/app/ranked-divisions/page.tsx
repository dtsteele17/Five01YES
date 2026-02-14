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

// Tier color definitions - matching dashboard exactly
const TIER_COLORS = {
  bronze: {
    gradient: 'from-orange-700 via-amber-700 to-orange-800',
    bg: 'bg-orange-500',
    accent: 'bg-orange-500',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    glow: 'shadow-orange-500/20',
  },
  silver: {
    gradient: 'from-gray-400 via-slate-400 to-gray-500',
    bg: 'bg-gray-400',
    accent: 'bg-gray-400',
    text: 'text-gray-300',
    border: 'border-gray-400/30',
    glow: 'shadow-gray-400/20',
  },
  gold: {
    gradient: 'from-yellow-400 via-amber-400 to-yellow-500',
    bg: 'bg-amber-500',
    accent: 'bg-amber-500',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    glow: 'shadow-amber-500/20',
  },
  platinum: {
    gradient: 'from-cyan-400 via-blue-400 to-cyan-500',
    bg: 'bg-cyan-500',
    accent: 'bg-cyan-500',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    glow: 'shadow-cyan-500/20',
  },
  champion: {
    gradient: 'from-red-500 via-rose-500 to-red-600',
    bg: 'bg-red-500',
    accent: 'bg-red-500',
    text: 'text-red-400',
    border: 'border-red-500/30',
    glow: 'shadow-red-500/20',
  },
  grandchampion: {
    gradient: 'from-purple-500 via-violet-500 to-purple-600',
    bg: 'bg-purple-500',
    accent: 'bg-purple-500',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    glow: 'shadow-purple-500/20',
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

// Current Rank Card - IDENTICAL to Dashboard
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
  const winRate = playerState.games_played > 0 
    ? Math.round((playerState.wins / playerState.games_played) * 100) 
    : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700/50">
      {/* Top gradient line */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
      
      <div className="relative z-10 p-8">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-8">
          {/* Left - Crown Icon & Division */}
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className={`absolute inset-0 ${colors.bg}/30 rounded-2xl blur-lg`} />
              <div className={`relative w-20 h-20 rounded-2xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center shadow-xl`}>
                {getTierIcon(playerState.division_name)}
              </div>
            </div>
            <div>
              <p className={`${colors.text} text-sm font-semibold uppercase tracking-wider`}>Current Rank</p>
              <h2 className="text-3xl font-black text-white mt-1">
                {playerState.division_name}
              </h2>
            </div>
          </div>

          {/* Center - ELO Display */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className={`absolute -inset-4 ${colors.bg}/10 rounded-full blur-2xl`} />
              <p className="relative text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-slate-300 drop-shadow-2xl">
                {playerState.rp}
              </p>
            </div>
            <p className={`${colors.text}/80 text-sm font-bold uppercase tracking-[0.2em] mt-2`}>ELO Rating</p>
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

        {/* Stats Row */}
        <div className="mt-8 pt-6 border-t border-slate-700/50">
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-xl bg-slate-900/40 border border-emerald-500/20 backdrop-blur-sm">
              <p className="text-2xl font-black text-emerald-400">{playerState.wins}</p>
              <p className="text-slate-400 text-xs uppercase tracking-wider mt-1">Wins</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-slate-900/40 border border-rose-500/20 backdrop-blur-sm">
              <p className="text-2xl font-black text-rose-400">{playerState.losses}</p>
              <p className="text-slate-400 text-xs uppercase tracking-wider mt-1">Losses</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-slate-900/40 border border-blue-500/20 backdrop-blur-sm">
              <p className="text-2xl font-black text-blue-400">{winRate}%</p>
              <p className="text-slate-400 text-xs uppercase tracking-wider mt-1">Win Rate</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-slate-900/40 border border-purple-500/20 backdrop-blur-sm">
              <p className="text-2xl font-black text-purple-400">{playerState.games_played}</p>
              <p className="text-slate-400 text-xs uppercase tracking-wider mt-1">Games</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Tier Page Header - Elite styling
function TierPageHeader({ tierName, isGrandChampion }: { tierName: string; isGrandChampion?: boolean }) {
  const tierKey = getTierKey(tierName);
  const colors = TIER_COLORS[tierKey];

  // Special styling for Grand Champion
  if (isGrandChampion) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 via-violet-600 to-purple-700 p-6 mb-6 shadow-2xl shadow-purple-500/30 border border-purple-400/30">
        {/* Animated background effect */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-400/20 via-transparent to-transparent" />
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl animate-pulse" />
        
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-purple-400/50 rounded-xl blur-lg animate-pulse" />
              <div className="relative w-16 h-16 rounded-xl bg-gradient-to-br from-purple-400 to-violet-600 flex items-center justify-center shadow-xl border border-purple-300/50">
                <Crown className="w-8 h-8 text-white drop-shadow-lg" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-purple-300" />
                <p className="text-purple-200 text-sm font-semibold uppercase tracking-wider">
                  Ultimate Elite
                </p>
                <Star className="w-4 h-4 text-purple-300" />
              </div>
              <h2 className="text-3xl font-black text-white drop-shadow-lg">
                Grand Champion
              </h2>
            </div>
          </div>
          <div className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500/30 to-violet-500/30 backdrop-blur-sm border border-purple-400/30">
            <span className="text-purple-100 font-bold text-sm">
              Apex Tier
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${colors.gradient} p-6 mb-6 shadow-lg ${colors.glow}`}>
      <div className="absolute inset-0 bg-black/20" />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            {getTierIcon(tierName)}
          </div>
          <div>
            <p className="text-white/80 text-sm font-semibold uppercase tracking-wider">
              Rank Progression
            </p>
            <h2 className="text-3xl font-black text-white">
              {tierName}
            </h2>
          </div>
        </div>
        <div className={`px-4 py-2 rounded-xl bg-white/20 backdrop-blur-sm`}>
          <span className="text-white font-bold text-sm">
            {tierKey === 'champion' ? 'Elite Tier' : 
             tierKey === 'platinum' ? 'Advanced Tier' : 
             tierKey === 'gold' ? 'Intermediate Tier' : 
             tierKey === 'silver' ? 'Developing Tier' : 'Entry Tier'}
          </span>
        </div>
      </div>
    </div>
  );
}

// Tier Navigator - Elite styling with Grand Champion as special rank
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
  
  // Separate Grand Champion from other tiers
  const grandChampionTier = tiers.find(t => t.tier_name.toLowerCase().includes('grand'));
  const normalTiers = tiers.filter(t => !t.tier_name.toLowerCase().includes('grand'));
  const totalPages = Math.ceil(normalTiers.length / ranksPerPage);

  // Set initial page to show user's current tier
  useEffect(() => {
    if (currentTierIndex >= 0) {
      // Adjust index for normal tiers only
      const userTier = tiers[currentTierIndex];
      if (userTier && !userTier.tier_name.toLowerCase().includes('grand')) {
        const userPage = Math.floor(normalTiers.findIndex(t => t.id === userTier.id) / ranksPerPage);
        if (userPage >= 0) setCurrentPage(userPage);
      }
    }
  }, [currentTierIndex, normalTiers, tiers]);

  const currentTiers = normalTiers.slice(
    currentPage * ranksPerPage, 
    (currentPage + 1) * ranksPerPage
  );

  const currentTierName = currentTiers[0]?.tier_name || '';
  const tierKey = getTierKey(currentTierName);
  const colors = TIER_COLORS[tierKey];

  const goToPrevious = () => {
    setCurrentPage(prev => Math.max(0, prev - 1));
  };

  const goToNext = () => {
    setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
  };

  // Check if user is Grand Champion
  const isGrandChampion = playerState?.division_name.toLowerCase().includes('grand');

  return (
    <div className="space-y-6">
      {/* Grand Champion Section - Special Elite Display */}
      {grandChampionTier && (
        <Card className={`relative overflow-hidden p-6 ${isGrandChampion ? 'bg-gradient-to-br from-purple-900/40 to-violet-900/40 border-purple-500/50 shadow-2xl shadow-purple-500/20' : 'bg-slate-800/40 border-slate-700/50'}`}>
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
          
          <TierPageHeader tierName="Grand Champion" isGrandChampion />
          
          <div className="relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`relative overflow-hidden rounded-xl p-6 border-2 transition-all ${
                isGrandChampion
                  ? 'bg-gradient-to-br from-purple-600 via-violet-600 to-purple-700 border-purple-300 shadow-xl shadow-purple-500/30' 
                  : 'bg-slate-900/80 border-purple-500/30 hover:border-purple-500/50'
              }`}
            >
              {/* Special effects for Grand Champion */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-400/10 via-transparent to-transparent" />
              {isGrandChampion && (
                <div className="absolute top-0 right-0">
                  <Badge className="bg-white text-purple-900 text-xs font-bold rounded-tl-none rounded-br-none rounded-tr-lg rounded-bl-lg px-3 py-1">
                    YOU
                  </Badge>
                </div>
              )}
              
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
                    isGrandChampion 
                      ? 'bg-white/20' 
                      : 'bg-purple-500/20'
                  }`}>
                    <Crown className={`w-8 h-8 ${isGrandChampion ? 'text-white' : 'text-purple-400'}`} />
                  </div>
                  <div>
                    <p className={`text-xs uppercase tracking-wider font-semibold ${
                      isGrandChampion ? 'text-purple-200' : 'text-purple-400'
                    }`}>
                      Grand Champion
                    </p>
                    <h3 className={`text-2xl font-black ${isGrandChampion ? 'text-white' : 'text-white'}`}>
                      {grandChampionTier.division_name}
                    </h3>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={`text-3xl font-black ${isGrandChampion ? 'text-white' : 'text-purple-400'}`}>
                    {grandChampionTier.rp_min}+
                  </div>
                  <p className={`text-sm ${isGrandChampion ? 'text-purple-200' : 'text-slate-500'}`}>RP Required</p>
                </div>
              </div>
              
              {/* Elite badge */}
              <div className="mt-4 flex items-center gap-2">
                <Star className={`w-4 h-4 ${isGrandChampion ? 'text-amber-300' : 'text-purple-500'}`} />
                <span className={`text-sm font-semibold ${isGrandChampion ? 'text-amber-200' : 'text-purple-400'}`}>
                  Apex of Competitive Play
                </span>
                <Star className={`w-4 h-4 ${isGrandChampion ? 'text-amber-300' : 'text-purple-500'}`} />
              </div>
            </motion.div>
          </div>
        </Card>
      )}

      {/* Normal Tier Navigator */}
      <Card className="relative overflow-hidden bg-slate-800/40 border-slate-700/50 p-6">
        <div className={`absolute top-0 right-0 w-96 h-96 ${colors.bg}/5 rounded-full blur-3xl`} />
        
        <div className="relative">
          {/* Tier Header with colors */}
          <TierPageHeader tierName={currentTierName} />
          
          {/* Navigation Arrows - More Elite Styling */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <button
              onClick={goToPrevious}
              disabled={currentPage === 0}
              className={`w-12 h-12 rounded-xl bg-slate-800 border ${colors.border} flex items-center justify-center text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-105`}
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            
            <div className={`px-6 py-3 rounded-xl bg-slate-800/80 border ${colors.border}`}>
              <span className={`${colors.text} font-bold text-lg`}>
                Tier {currentPage + 1} of {totalPages}
              </span>
            </div>
            
            <button
              onClick={goToNext}
              disabled={currentPage === totalPages - 1}
              className={`w-12 h-12 rounded-xl bg-slate-800 border ${colors.border} flex items-center justify-center text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-105`}
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>

          {/* Rank Cards Grid - Elite Styling */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <AnimatePresence mode="wait">
              {currentTiers.map((tier, index) => {
                const isCurrent = playerState && 
                  playerState.rp >= tier.rp_min && 
                  playerState.rp <= tier.rp_max;
                const tierK = getTierKey(tier.tier_name);
                const tierColors = TIER_COLORS[tierK];
                
                return (
                  <motion.div
                    key={tier.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.05 }}
                    className={`relative overflow-hidden rounded-xl p-5 border-2 transition-all ${
                      isCurrent 
                        ? `bg-gradient-to-br ${tierColors.gradient} border-white/50 shadow-xl ${tierColors.glow}` 
                        : 'bg-slate-900/80 border-slate-700/50 hover:border-slate-500 hover:shadow-lg'
                    }`}
                  >
                    {isCurrent && (
                      <div className="absolute top-0 right-0">
                        <Badge className="bg-white text-slate-900 text-xs font-bold rounded-tl-none rounded-br-none rounded-tr-lg rounded-bl-lg px-3 py-1">
                          YOU
                        </Badge>
                      </div>
                    )}
                    
                    <p className={`text-xs uppercase tracking-wider mb-2 font-semibold ${
                      isCurrent ? 'text-white/80' : tierColors.text
                    }`}>
                      {tier.tier_name}
                    </p>
                    <h3 className={`text-xl font-black mb-3 ${isCurrent ? 'text-white' : 'text-white'}`}>
                      {tier.division_name}
                    </h3>
                    
                    <div className="space-y-2">
                      <div className={`flex items-center justify-between text-sm px-2 py-1 rounded-lg ${
                        isCurrent ? 'bg-white/10' : 'bg-slate-800'
                      }`}>
                        <span className={isCurrent ? 'text-white/70' : 'text-slate-500'}>Entry</span>
                        <span className={`font-bold ${isCurrent ? 'text-white' : 'text-slate-300'}`}>{tier.rp_min} RP</span>
                      </div>
                      {tier.rp_max < 999999 && (
                        <div className={`flex items-center justify-between text-sm px-2 py-1 rounded-lg ${
                          isCurrent ? 'bg-white/10' : 'bg-slate-800'
                        }`}>
                          <span className={isCurrent ? 'text-white/70' : 'text-slate-500'}>Max</span>
                          <span className={`font-bold ${isCurrent ? 'text-white' : 'text-slate-300'}`}>{tier.rp_max} RP</span>
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
              const pageTierName = normalTiers[index * ranksPerPage]?.tier_name || '';
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
