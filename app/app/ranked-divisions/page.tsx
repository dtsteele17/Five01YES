'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { motion, Variants } from 'framer-motion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Shield, Trophy, TrendingUp, Target, ChevronRight, ArrowRight, Crown, Star, Award } from 'lucide-react';
import { toast } from 'sonner';

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

// Hero Stat Card - Dashboard Style
function HeroStat({ value, label, icon: Icon, color, subtext }: { 
  value: string | number; 
  label: string; 
  icon: any; 
  color: string;
  subtext?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6 group hover:border-slate-600/50 transition-all`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${color}`} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-4xl font-black text-white tracking-tight">{value}</p>
          <p className="text-sm text-slate-400 mt-1 uppercase tracking-wider font-medium">{label}</p>
          {subtext && (
            <p className="text-xs text-emerald-400 mt-2">{subtext}</p>
          )}
        </div>
        <div className={`w-12 h-12 rounded-xl ${color} bg-opacity-20 flex items-center justify-center`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

// Rank Tile Component
function RankTile({ 
  tier, 
  isCurrent, 
  isNext,
  rp,
  rpToNext
}: { 
  tier: RankedTier; 
  isCurrent: boolean;
  isNext?: boolean;
  rp?: number;
  rpToNext?: number;
}) {
  const tierColor = getTierColorClass(tier.tier_name);
  const tierGradient = getTierGradient(tier.tier_name);
  
  return (
    <motion.div
      variants={itemVariants}
      className={`relative overflow-hidden rounded-2xl border p-5 min-w-[180px] flex-shrink-0 ${
        isCurrent 
          ? 'bg-slate-800/80 border-amber-500/50 shadow-lg shadow-amber-500/10' 
          : isNext
          ? 'bg-slate-800/40 border-slate-600/50 opacity-75'
          : 'bg-slate-800/40 border-slate-700/50'
      }`}
    >
      {/* Current Rank Indicator */}
      {isCurrent && (
        <div className="absolute top-0 right-0">
          <Badge className="bg-amber-500 text-white text-xs rounded-tl-none rounded-br-none rounded-tr-2xl rounded-bl-lg px-3 py-1">
            You Are Here
          </Badge>
        </div>
      )}
      
      {/* Next Rank Indicator */}
      {isNext && (
        <div className="absolute top-0 right-0">
          <Badge className="bg-emerald-500/80 text-white text-xs rounded-tl-none rounded-br-none rounded-tr-2xl rounded-bl-lg px-3 py-1">
            Next
          </Badge>
        </div>
      )}
      
      <div className="relative">
        {/* Tier Icon */}
        <div className={`w-12 h-12 rounded-xl ${tierGradient} flex items-center justify-center mb-4 ${isCurrent ? 'shadow-lg' : ''}`}>
          {getTierIcon(tier.tier_name)}
        </div>
        
        {/* Tier Name */}
        <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">
          {tier.tier_name}
        </p>
        <h3 className="text-lg font-bold text-white mb-2">{tier.division_name}</h3>
        
        {/* RP Info */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Entry</span>
            <span className="text-white font-semibold">{tier.rp_min} RP</span>
          </div>
          {tier.rp_max < 999999 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Max</span>
              <span className="text-white font-semibold">{tier.rp_max} RP</span>
            </div>
          )}
        </div>
        
        {/* Progress to next (only for current rank) */}
        {isCurrent && rpToNext !== undefined && rpToNext > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-700/50">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400">Progress</span>
              <span className="text-emerald-400 font-medium">{rpToNext} RP to next</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                style={{ width: `${Math.min(100, ((rp || 0) - tier.rp_min) / (tier.rp_max - tier.rp_min) * 100)}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Grand Champion special indicator */}
        {tier.rp_max === 999999 && (
          <div className="mt-3 pt-3 border-t border-slate-700/50">
            <div className="flex items-center gap-1 text-amber-400 text-xs">
              <Crown className="w-3 h-3" />
              <span className="font-medium">Top Tier</span>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Helper functions
function getTierColorClass(tierName: string): string {
  const name = tierName.toLowerCase();
  if (name.includes('grand champion')) return 'bg-purple-500';
  if (name.includes('champion')) return 'bg-amber-500';
  if (name.includes('platinum')) return 'bg-cyan-500';
  if (name.includes('gold')) return 'bg-yellow-500';
  if (name.includes('silver')) return 'bg-gray-400';
  if (name.includes('bronze')) return 'bg-orange-700';
  return 'bg-gray-600';
}

function getTierGradient(tierName: string): string {
  const name = tierName.toLowerCase();
  if (name.includes('grand champion')) return 'bg-gradient-to-br from-purple-500 to-pink-500';
  if (name.includes('champion')) return 'bg-gradient-to-br from-amber-500 to-orange-500';
  if (name.includes('platinum')) return 'bg-gradient-to-br from-cyan-500 to-blue-500';
  if (name.includes('gold')) return 'bg-gradient-to-br from-yellow-500 to-amber-500';
  if (name.includes('silver')) return 'bg-gradient-to-br from-gray-400 to-gray-500';
  if (name.includes('bronze')) return 'bg-gradient-to-br from-orange-700 to-orange-800';
  return 'bg-gradient-to-br from-gray-600 to-gray-700';
}

function getTierIcon(tierName: string) {
  const name = tierName.toLowerCase();
  if (name.includes('grand champion')) return <Crown className="w-6 h-6 text-white" />;
  if (name.includes('champion')) return <Trophy className="w-6 h-6 text-white" />;
  if (name.includes('platinum')) return <Award className="w-6 h-6 text-white" />;
  if (name.includes('gold')) return <Star className="w-6 h-6 text-white" />;
  if (name.includes('silver')) return <Shield className="w-6 h-6 text-white" />;
  if (name.includes('bronze')) return <Target className="w-6 h-6 text-white" />;
  return <Shield className="w-6 h-6 text-white" />;
}

export default function RankedDivisionsPage() {
  const supabase = createClient();

  const [tiers, setTiers] = useState<RankedTier[]>([]);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyMyTier, setShowOnlyMyTier] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    try {
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

  const uniqueTierNames = Array.from(new Set(tiers.map((t) => t.tier_name)));

  const filteredTiers = tiers.filter((tier) => {
    if (showOnlyMyTier && playerState) {
      if (!(playerState.rp >= tier.rp_min && playerState.rp <= tier.rp_max)) {
        return false;
      }
    }

    if (selectedTier !== 'all') {
      if (tier.tier_name !== selectedTier) {
        return false;
      }
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return tier.division_name.toLowerCase().includes(query);
    }

    return true;
  });

  // Get current tier
  const currentTier = playerState ? tiers.find(t => 
    playerState.rp >= t.rp_min && playerState.rp <= t.rp_max
  ) : null;

  // Get next tier
  const nextTierIndex = currentTier ? tiers.findIndex(t => t.id === currentTier.id) - 1 : -1;
  const nextTier = nextTierIndex >= 0 ? tiers[nextTierIndex] : null;

  // Calculate RP to next tier
  const rpToNext = nextTier ? nextTier.rp_min - (playerState?.rp || 0) : 0;

  const isMyTier = (tier: RankedTier) => {
    if (!playerState) return false;
    return playerState.rp >= tier.rp_min && playerState.rp <= tier.rp_max;
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <Skeleton className="h-10 w-64 bg-slate-800 mb-2" />
          <Skeleton className="h-5 w-96 bg-slate-800" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 bg-slate-800 rounded-2xl" />)}
        </div>
        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
          <Skeleton className="h-24 w-full bg-slate-800 rounded-xl" />
        </Card>
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
            Climb divisions by earning Ranking Points (RP). Face tougher opponents as you rise through the ranks.
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

      {/* Hero Stats Grid - Dashboard Style */}
      {playerState && (
        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <HeroStat 
            value={playerState.division_name} 
            label="Current Rank" 
            icon={Shield} 
            color="bg-amber-500"
            subtext={playerState.provisional_games_remaining > 0 ? `${10 - playerState.provisional_games_remaining}/10 Placements` : undefined}
          />
          <HeroStat 
            value={playerState.rp} 
            label="Ranking Points" 
            icon={Trophy} 
            color="bg-emerald-500"
            subtext={nextTier ? `${rpToNext} RP to ${nextTier.division_name}` : 'Top Rank Achieved!'}
          />
          <HeroStat 
            value={`${playerState.wins}-${playerState.losses}`} 
            label="Record" 
            icon={Target} 
            color="bg-blue-500"
            subtext={`${playerState.games_played} Games Played`}
          />
          <HeroStat 
            value={playerState.games_played > 0 ? Math.round((playerState.wins / playerState.games_played) * 100) + '%' : '0%'} 
            label="Win Rate" 
            icon={TrendingUp} 
            color="bg-purple-500"
          />
        </motion.div>
      )}

      {/* Rank Progression Path */}
      <motion.div variants={itemVariants}>
        <Card className="relative overflow-hidden bg-slate-800/40 border-slate-700/50 p-6">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl" />
          
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-amber-400 text-sm font-semibold uppercase tracking-wider">
                    Progression Path
                  </p>
                  <h2 className="text-xl font-bold text-white">
                    Rank Ladder
                  </h2>
                </div>
              </div>
              
              {currentTier && (
                <div className="text-right hidden md:block">
                  <p className="text-slate-400 text-sm">Current Progress</p>
                  <p className="text-emerald-400 font-bold">
                    {playerState?.rp || 0} / {currentTier.rp_max === 999999 ? '∞' : currentTier.rp_max} RP
                  </p>
                </div>
              )}
            </div>

            {/* Rank Tiles with Arrows */}
            <div className="overflow-x-auto pb-4">
              <div className="flex items-stretch gap-3 min-w-max">
                {tiers.map((tier, index) => {
                  const isCurrent = isMyTier(tier);
                  const isNext = nextTier?.id === tier.id;
                  
                  return (
                    <div key={tier.id} className="flex items-center">
                      <RankTile 
                        tier={tier} 
                        isCurrent={isCurrent}
                        isNext={isNext}
                        rp={playerState?.rp}
                        rpToNext={isCurrent ? rpToNext : undefined}
                      />
                      {/* Arrow to next rank (if not last) */}
                      {index < tiers.length - 1 && (
                        <div className="flex items-center justify-center px-2">
                          <div className="flex flex-col items-center">
                            <ArrowRight className="w-5 h-5 text-slate-600" />
                            {tier.rp_max !== 999999 && (
                              <span className="text-[10px] text-slate-500 mt-1 whitespace-nowrap">
                                {tier.rp_max - tier.rp_min} RP
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Detailed Divisions Table */}
      <motion.div variants={itemVariants}>
        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
          <div className="flex flex-col lg:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="search"
                placeholder="Search by rank name (e.g., Gold 2)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800/50 border-white/10 text-white placeholder:text-gray-500"
              />
            </div>

            <Select value={selectedTier} onValueChange={setSelectedTier}>
              <SelectTrigger className="w-full lg:w-48 bg-slate-800/50 border-white/10 text-white">
                <SelectValue placeholder="All Tiers" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-white/10">
                <SelectItem value="all" className="text-white hover:bg-white/10">
                  All Tiers
                </SelectItem>
                {uniqueTierNames.map((tierName) => (
                  <SelectItem
                    key={tierName}
                    value={tierName}
                    className="text-white hover:bg-white/10"
                  >
                    {tierName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={showOnlyMyTier ? 'default' : 'outline'}
              onClick={() => setShowOnlyMyTier(!showOnlyMyTier)}
              disabled={!playerState}
              className={
                showOnlyMyTier
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-white'
                  : 'border-white/10 text-white hover:bg-white/5'
              }
            >
              {showOnlyMyTier ? 'Showing My Tier' : 'Show My Tier Only'}
            </Button>
          </div>

          {filteredTiers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">No divisions found matching your search.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(
                filteredTiers.reduce((acc, tier) => {
                  if (!acc[tier.tier_name]) {
                    acc[tier.tier_name] = [];
                  }
                  acc[tier.tier_name].push(tier);
                  return acc;
                }, {} as Record<string, RankedTier[]>)
              ).map(([tierName, tierDivisions]) => (
                <div key={tierName} className="space-y-2">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getTierGradient(tierName)} flex items-center justify-center`}>
                      {getTierIcon(tierName)}
                    </div>
                    <h3 className="text-xl font-bold text-white">{tierName}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-4 text-sm font-semibold text-gray-400">Division</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Entry RP</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">Relegation RP</th>
                          <th className="text-right py-3 px-4 text-sm font-semibold text-gray-400">RP Range</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tierDivisions.map((tier) => {
                          const isCurrentTier = isMyTier(tier);
                          return (
                            <tr
                              key={tier.id}
                              className={`border-b border-white/5 transition-all ${
                                isCurrentTier
                                  ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/30'
                                  : 'hover:bg-white/5'
                              }`}
                            >
                              <td className="py-4 px-4">
                                <div className="flex items-center space-x-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <p className="text-white font-semibold">{tier.division_name}</p>
                                      {isCurrentTier && (
                                        <Badge className="bg-amber-500 text-white text-xs">
                                          You are here
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-4 text-right">
                                <p className="text-white font-semibold">{tier.rp_min}</p>
                                <p className="text-xs text-gray-400">to enter</p>
                              </td>
                              <td className="py-4 px-4 text-right">
                                <p className="text-white font-semibold">{tier.rp_min}</p>
                                <p className="text-xs text-gray-400">protected</p>
                              </td>
                              <td className="py-4 px-4 text-right">
                                <p className="text-white font-semibold">
                                  {tier.rp_min} - {tier.rp_max === 999999 ? '∞' : tier.rp_max}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {tier.rp_max === 999999 ? 'No limit' : `${tier.rp_max - tier.rp_min} RP span`}
                                </p>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </motion.div>

      {/* How It Works */}
      <motion.div variants={itemVariants}>
        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center">
            <Trophy className="w-5 h-5 mr-2 text-amber-500" />
            How Ranked Divisions Work
          </h2>
          <div className="space-y-4 text-gray-300">
            <div>
              <h3 className="text-white font-semibold mb-2 flex items-center">
                <TrendingUp className="w-4 h-4 mr-2 text-emerald-400" />
                Earning Ranking Points (RP)
              </h3>
              <p className="text-sm">
                Win ranked matches to earn RP and climb the divisions. The amount of RP you gain or lose depends on the match outcome:
              </p>
              <ul className="text-sm mt-2 space-y-1 ml-6 list-disc">
                <li>3-0 sweep: ±30 RP (1.5x multiplier)</li>
                <li>3-1 victory: ±24 RP (1.2x multiplier)</li>
                <li>3-2 close match: ±20 RP (1.0x multiplier)</li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-2">Promotion & Relegation</h3>
              <p className="text-sm">
                Reach the entry RP of the next division to get promoted. In most divisions, there is no automatic relegation - you can only move up by reaching the next tier's minimum RP.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-2">Division Tiers</h3>
              <p className="text-sm">
                Progress through Bronze, Silver, Gold, Platinum, Champion, and Grand Champion. The higher you climb, the more skilled opponents you'll face.
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-2">Provisional Matches</h3>
              <p className="text-sm">
                New players start with 10 provisional matches. During this period, your RP may fluctuate more as the system calibrates your skill level.
              </p>
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}
