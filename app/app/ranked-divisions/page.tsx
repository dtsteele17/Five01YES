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

// Helper functions
function getTierGradient(tierName: string): string {
  const name = tierName.toLowerCase();
  if (name.includes('grand champion')) return 'from-purple-500 to-pink-500';
  if (name.includes('champion')) return 'from-amber-500 to-orange-500';
  if (name.includes('platinum')) return 'from-cyan-500 to-blue-500';
  if (name.includes('gold')) return 'from-yellow-500 to-amber-500';
  if (name.includes('silver')) return 'from-gray-400 to-gray-500';
  if (name.includes('bronze')) return 'from-orange-700 to-amber-600';
  return 'from-gray-600 to-gray-700';
}

function getTierIcon(tierName: string) {
  const name = tierName.toLowerCase();
  if (name.includes('grand champion')) return <Crown className="w-8 h-8 text-white" />;
  if (name.includes('champion')) return <Trophy className="w-8 h-8 text-white" />;
  if (name.includes('platinum')) return <Award className="w-8 h-8 text-white" />;
  if (name.includes('gold')) return <Star className="w-8 h-8 text-white" />;
  if (name.includes('silver')) return <Shield className="w-8 h-8 text-white" />;
  if (name.includes('bronze')) return <Target className="w-8 h-8 text-white" />;
  return <Shield className="w-8 h-8 text-white" />;
}

// Current Rank Card - Dashboard Style (Single Tile)
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
  const currentTierGradient = getTierGradient(playerState.division_name);
  const winRate = playerState.games_played > 0 
    ? Math.round((playerState.wins / playerState.games_played) * 100) 
    : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
      <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${currentTierGradient}`} />
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Rank Info */}
        <div className="flex items-center gap-4">
          <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${currentTierGradient} flex items-center justify-center shadow-xl`}>
            {getTierIcon(playerState.division_name)}
          </div>
          <div>
            <p className="text-slate-400 text-sm">{season?.name || 'Current Season'}</p>
            <h2 className="text-3xl font-black text-white">{playerState.division_name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                <Trophy className="w-3 h-3 mr-1" />
                {playerState.rp} RP
              </Badge>
              {playerState.provisional_games_remaining > 0 && (
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                  {10 - playerState.provisional_games_remaining}/10 Placements
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-8">
          <div className="text-center">
            <p className="text-3xl font-black text-white">{playerState.wins}-{playerState.losses}</p>
            <p className="text-xs text-slate-400 uppercase tracking-wider">Record</p>
          </div>
          <div className="w-px h-12 bg-slate-700" />
          <div className="text-center">
            <p className="text-3xl font-black text-emerald-400">{winRate}%</p>
            <p className="text-xs text-slate-400 uppercase tracking-wider">Win Rate</p>
          </div>
          <div className="w-px h-12 bg-slate-700" />
          <div className="text-center">
            <p className="text-3xl font-black text-blue-400">{playerState.games_played}</p>
            <p className="text-xs text-slate-400 uppercase tracking-wider">Games</p>
          </div>
        </div>

        {/* Progress to Next */}
        {nextTier && (
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/50 min-w-[200px]">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-400">Next Rank</span>
              <span className="text-emerald-400 font-medium">{nextTier.division_name}</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                style={{ width: `${Math.min(100, (playerState.rp / nextTier.rp_min) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-2">{rpToNext} RP needed</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Tier Navigator - Shows 4 ranks at a time with arrow navigation
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
  const totalPages = Math.ceil(tiers.length / ranksPerPage);

  // Set initial page to show user's current tier
  useEffect(() => {
    if (currentTierIndex >= 0) {
      const userPage = Math.floor(currentTierIndex / ranksPerPage);
      setCurrentPage(userPage);
    }
  }, [currentTierIndex]);

  const currentTiers = tiers.slice(
    currentPage * ranksPerPage, 
    (currentPage + 1) * ranksPerPage
  );

  const currentTierName = currentTiers[0]?.tier_name || '';
  const tierGradient = getTierGradient(currentTierName);

  const goToPrevious = () => {
    setCurrentPage(prev => Math.max(0, prev - 1));
  };

  const goToNext = () => {
    setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
  };

  return (
    <Card className="relative overflow-hidden bg-slate-800/40 border-slate-700/50 p-6">
      <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl" />
      
      <div className="relative">
        {/* Header with Navigation */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tierGradient} flex items-center justify-center shadow-lg`}>
              {getTierIcon(currentTierName)}
            </div>
            <div>
              <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider">
                Rank Progression
              </p>
              <h2 className="text-xl font-bold text-white">
                {currentTierName}
              </h2>
            </div>
          </div>
          
          {/* Navigation Arrows */}
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevious}
              disabled={currentPage === 0}
              className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-slate-400 text-sm min-w-[60px] text-center">
              {currentPage + 1} / {totalPages}
            </span>
            <button
              onClick={goToNext}
              disabled={currentPage === totalPages - 1}
              className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Rank Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <AnimatePresence mode="wait">
            {currentTiers.map((tier, index) => {
              const isCurrent = playerState && 
                playerState.rp >= tier.rp_min && 
                playerState.rp <= tier.rp_max;
              
              return (
                <motion.div
                  key={tier.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className={`relative overflow-hidden rounded-xl p-4 border ${
                    isCurrent 
                      ? 'bg-slate-800/80 border-amber-500/50 shadow-lg shadow-amber-500/10' 
                      : 'bg-slate-900/50 border-slate-700/50'
                  }`}
                >
                  {isCurrent && (
                    <div className="absolute top-0 right-0">
                      <Badge className="bg-amber-500 text-white text-[10px] rounded-tl-none rounded-br-none rounded-tr-lg rounded-bl-lg px-2 py-0.5">
                        You
                      </Badge>
                    </div>
                  )}
                  
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">
                    {tier.tier_name}
                  </p>
                  <h3 className="text-lg font-bold text-white mb-2">{tier.division_name}</h3>
                  
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Min</span>
                      <span className="text-white font-medium">{tier.rp_min} RP</span>
                    </div>
                    {tier.rp_max < 999999 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Max</span>
                        <span className="text-white font-medium">{tier.rp_max} RP</span>
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
          {Array.from({ length: totalPages }).map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentPage(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentPage 
                  ? 'w-6 bg-amber-500' 
                  : 'bg-slate-600 hover:bg-slate-500'
              }`}
            />
          ))}
        </div>
      </div>
    </Card>
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

      {/* Single Current Rank Card */}
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

      {/* Tier Navigator - 4 ranks at a time with arrows */}
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
