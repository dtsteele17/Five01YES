'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Shield, Trophy, TrendingUp, Target, ChevronDown } from 'lucide-react';
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

  const groupedTiers = filteredTiers.reduce((acc, tier) => {
    if (!acc[tier.tier_name]) {
      acc[tier.tier_name] = [];
    }
    acc[tier.tier_name].push(tier);
    return acc;
  }, {} as Record<string, RankedTier[]>);

  const getTierColor = (tierName: string) => {
    const name = tierName.toLowerCase();
    if (name.includes('grand champion')) return 'from-purple-500 to-pink-500';
    if (name.includes('champion')) return 'from-amber-500 to-orange-500';
    if (name.includes('platinum')) return 'from-cyan-500 to-blue-500';
    if (name.includes('gold')) return 'from-yellow-500 to-amber-500';
    if (name.includes('silver')) return 'from-gray-400 to-gray-500';
    if (name.includes('bronze')) return 'from-orange-700 to-orange-800';
    return 'from-gray-600 to-gray-700';
  };

  const isMyTier = (tier: RankedTier) => {
    if (!playerState) return false;
    return playerState.rp >= tier.rp_min && playerState.rp <= tier.rp_max;
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <Skeleton className="h-10 w-64 bg-slate-800 mb-2" />
          <Skeleton className="h-5 w-96 bg-slate-800" />
        </div>
        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
          <Skeleton className="h-32 w-full bg-slate-800" />
        </Card>
        <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
          <div className="space-y-4">
            <Skeleton className="h-12 w-full bg-slate-800" />
            <Skeleton className="h-12 w-full bg-slate-800" />
            <Skeleton className="h-12 w-full bg-slate-800" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold text-white mb-2">Ranked Divisions</h1>
        <p className="text-gray-400">
          Climb divisions by earning Ranking Points (RP). Promotion and relegation thresholds are shown below.
        </p>
      </div>

      {playerState && season && (
        <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-amber-500/30 p-6">
          <div className="flex flex-col lg:flex-row items-start justify-between gap-6">
            <div className="flex items-center space-x-4">
              <div className="p-4 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-400">{season.name}</p>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-white">{playerState.division_name}</h2>
                  {playerState.provisional_games_remaining > 0 && (
                    <Badge className="bg-amber-500 text-white">
                      Placements: {10 - playerState.provisional_games_remaining}/10
                    </Badge>
                  )}
                </div>
                <p className="text-amber-400 font-semibold text-lg">{playerState.rp} RP</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-gray-400 text-sm">Games</p>
                <p className="text-2xl font-bold text-white">{playerState.games_played}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Wins</p>
                <p className="text-2xl font-bold text-emerald-400">{playerState.wins}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Losses</p>
                <p className="text-2xl font-bold text-red-400">{playerState.losses}</p>
              </div>
            </div>
          </div>
        </Card>
      )}

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
            {Object.entries(groupedTiers).map(([tierName, tierDivisions]) => (
              <div key={tierName} className="space-y-2">
                <div className="flex items-center space-x-3 mb-3">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getTierColor(tierName)} flex items-center justify-center`}>
                    <Shield className="w-5 h-5 text-white" />
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
    </div>
  );
}
