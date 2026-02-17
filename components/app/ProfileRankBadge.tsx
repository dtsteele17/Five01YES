'use client';

import { useState, useEffect } from 'react';
import { Trophy, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { createClient } from '@/lib/supabase/client';
import { getRankImageUrl } from '@/lib/rank-badge-helpers';

interface RankedPlayerState {
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

interface ProfileRankBadgeProps {
  profileId?: string;
}

export function ProfileRankBadge({ profileId }: ProfileRankBadgeProps) {
  const [loading, setLoading] = useState(true);
  const [rankedState, setRankedState] = useState<RankedPlayerState | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const supabase = createClient();

  useEffect(() => {
    fetchRankedData();
  }, [profileId]);

  async function fetchRankedData() {
    setLoading(true);
    try {
      if (profileId) {
        const { data: seasonResponse } = await supabase.rpc('rpc_ranked_get_my_state');

        if (!seasonResponse || !seasonResponse.season) {
          setLoading(false);
          return;
        }

        setSeason(seasonResponse.season);
        const activeSeasonId = seasonResponse.season.id;

        const { data: stateData } = await supabase
          .from('ranked_player_state')
          .select('*')
          .eq('season_id', activeSeasonId)
          .eq('player_id', profileId)
          .single();

        if (stateData) {
          const { data: tierData } = await supabase
            .from('ranked_tiers')
            .select('division_name')
            .lte('rp_min', stateData.rp)
            .gte('rp_max', stateData.rp)
            .single();

          setRankedState({
            ...stateData,
            division_name: tierData?.division_name || 'Unranked'
          });
        }
      } else {
        const { data: seasonData } = await supabase.rpc('rpc_ranked_get_my_state');

        if (!seasonData || !seasonData.season) {
          setLoading(false);
          return;
        }

        setSeason(seasonData.season);

        if (seasonData.player_state) {
          setRankedState(seasonData.player_state);
        }
      }
    } catch (error) {
      console.error('Error fetching ranked data:', error);
    } finally {
      setLoading(false);
    }
  }

  const getTierColor = (divisionName: string) => {
    const name = divisionName.toLowerCase();
    if (name.includes('grand champion')) return 'from-purple-500 to-pink-500';
    if (name.includes('champion')) return 'from-amber-500 to-orange-500';
    if (name.includes('platinum')) return 'from-cyan-500 to-blue-500';
    if (name.includes('gold')) return 'from-yellow-500 to-amber-500';
    if (name.includes('silver')) return 'from-gray-400 to-gray-500';
    if (name.includes('bronze')) return 'from-orange-700 to-orange-800';
    return 'from-gray-600 to-gray-700';
  };

  const getTierIconColor = (divisionName: string) => {
    const name = divisionName.toLowerCase();
    if (name.includes('grand champion')) return 'text-purple-400';
    if (name.includes('champion')) return 'text-amber-400';
    if (name.includes('platinum')) return 'text-cyan-400';
    if (name.includes('gold')) return 'text-yellow-400';
    if (name.includes('silver')) return 'text-gray-400';
    if (name.includes('bronze')) return 'text-orange-700';
    return 'text-gray-500';
  };

  const winRate = rankedState && rankedState.games_played > 0
    ? ((rankedState.wins / rankedState.games_played) * 100).toFixed(0)
    : '0';

  if (loading) {
    return (
      <div className="flex items-center space-x-4">
        <Skeleton className="w-12 h-12 rounded-lg bg-slate-800" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-32 bg-slate-800" />
          <Skeleton className="h-4 w-24 bg-slate-800" />
        </div>
      </div>
    );
  }

  if (!rankedState || !season) {
    return (
      <div className="flex items-center space-x-3 py-2 px-4 bg-slate-800/30 rounded-lg border border-white/5">
        <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center">
          <span className="text-gray-500 text-xs">--</span>
        </div>
        <div>
          <p className="text-sm text-gray-400">Unranked</p>
          <p className="text-xs text-gray-500">No ranked matches played</p>
        </div>
      </div>
    );
  }

  const isInPlacements = rankedState.provisional_games_remaining > 0;

  return (
    <div className="flex flex-col space-y-3">
      <div className="flex items-center space-x-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-14 h-14 rounded-lg overflow-hidden shadow-lg bg-slate-800 flex items-center justify-center">
                <img 
                  src={getRankImageUrl(rankedState.division_name)} 
                  alt={rankedState.division_name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback if image fails to load
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent className="bg-slate-800 border-white/10">
              <p className="text-sm">Rating updates after ranked matches</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div>
          <div className="flex items-center space-x-2">
            {isInPlacements ? (
              <>
                <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
                  Unranked
                </Badge>
                <span className="text-xs text-gray-400">
                  Placements: {10 - rankedState.provisional_games_remaining}/10
                </span>
              </>
            ) : (
              <h3 className="text-lg font-bold text-white">{rankedState.division_name}</h3>
            )}
          </div>
          <div className="flex items-center space-x-2 mt-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className={`text-sm font-semibold ${getTierIconColor(rankedState.division_name)}`}>
                    {rankedState.rp} {isInPlacements ? 'Placement RP' : 'RP'}
                  </p>
                </TooltipTrigger>
                <TooltipContent className="bg-slate-800 border-white/10">
                  <p className="text-xs">{season.name}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      <div className="flex items-center space-x-4 text-sm">
        <div className="flex items-center space-x-2 py-1.5 px-3 bg-slate-800/50 rounded-lg">
          <Trophy className="w-4 h-4 text-emerald-400" />
          <span className="text-gray-300">
            {rankedState.wins}W - {rankedState.losses}L
          </span>
        </div>
        <div className="flex items-center space-x-2 py-1.5 px-3 bg-slate-800/50 rounded-lg">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <span className="text-gray-300">{winRate}% WR</span>
        </div>
      </div>
    </div>
  );
}
