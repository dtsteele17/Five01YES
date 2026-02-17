'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Target, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { getRankImageUrl } from '@/lib/rank-badge-helpers';

interface RankCardProps {
  rankedState: {
    season_id: string;
    player_id: string;
    rp: number;
    mmr: number;
    games_played: number;
    wins: number;
    losses: number;
    provisional_games_remaining: number;
    division_name: string;
  } | null;
  season: {
    id: string;
    name: string;
  } | null;
  loading?: boolean;
}

export function RankCard({ rankedState, season, loading = false }: RankCardProps) {
  if (loading) {
    return (
      <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-amber-500/30 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-700 rounded w-32"></div>
          <div className="h-16 bg-slate-700 rounded"></div>
          <div className="grid grid-cols-4 gap-4">
            <div className="h-12 bg-slate-700 rounded"></div>
            <div className="h-12 bg-slate-700 rounded"></div>
            <div className="h-12 bg-slate-700 rounded"></div>
            <div className="h-12 bg-slate-700 rounded"></div>
          </div>
        </div>
      </Card>
    );
  }

  if (!rankedState || !season) {
    return (
      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="flex items-center space-x-4 mb-6">
          <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center">
            <span className="text-gray-500 text-xs">--</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Ranked Status</h3>
            <p className="text-sm text-gray-400">No active season</p>
          </div>
        </div>
        <div className="text-center py-6">
          <p className="text-gray-400 mb-4">Join a ranked match to get started!</p>
          <Link
            href="/app/play"
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg text-white font-medium hover:opacity-90 transition-opacity"
          >
            Start Playing
          </Link>
        </div>
      </Card>
    );
  }

  const isInPlacements = rankedState.provisional_games_remaining > 0;
  const placementsCompleted = 10 - rankedState.provisional_games_remaining;
  const winRate =
    rankedState.games_played > 0
      ? Math.round((rankedState.wins / rankedState.games_played) * 100)
      : 0;

  return (
    <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-amber-500/30 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-800 flex items-center justify-center">
            <img 
              src={getRankImageUrl(rankedState.division_name)} 
              alt={rankedState.division_name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Ranked Status</h3>
            <p className="text-sm text-gray-400">{season.name}</p>
          </div>
        </div>
        <Link
          href="/app/ranked-divisions"
          className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
        >
          View Ladder
        </Link>
      </div>

      {isInPlacements ? (
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <Badge className="bg-amber-500 text-white">
                Placement Matches: {placementsCompleted}/10
              </Badge>
              <span className="text-amber-400 font-semibold">{rankedState.rp} RP</span>
            </div>
            <p className="text-sm text-gray-300 mt-2">
              Complete {rankedState.provisional_games_remaining} more {rankedState.provisional_games_remaining === 1 ? 'match' : 'matches'} to receive your official rank
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <TrendingUp className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-white">{rankedState.games_played}</p>
              <p className="text-xs text-gray-400">Played</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <Trophy className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-white">{rankedState.wins}</p>
              <p className="text-xs text-gray-400">Wins</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <Target className="w-5 h-5 text-red-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-white">{rankedState.losses}</p>
              <p className="text-xs text-gray-400">Losses</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="w-5 h-5 mx-auto mb-1 flex items-center justify-center text-amber-400 font-bold">
                %
              </div>
              <p className="text-lg font-bold text-white">{winRate}%</p>
              <p className="text-xs text-gray-400">Win Rate</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Current Rank</p>
                <div className="flex items-center gap-2">
                  <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-base px-3 py-1">
                    {rankedState.division_name}
                  </Badge>
                  <span className="text-2xl font-bold text-white">{rankedState.rp}</span>
                  <span className="text-sm text-gray-400">RP</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-400 mb-1">Record</p>
                <p className="text-xl font-bold text-white">
                  <span className="text-emerald-400">{rankedState.wins}</span>
                  <span className="text-gray-500 mx-1">-</span>
                  <span className="text-red-400">{rankedState.losses}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <TrendingUp className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-white">{rankedState.games_played}</p>
              <p className="text-xs text-gray-400">Games</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <Trophy className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-white">{rankedState.wins}</p>
              <p className="text-xs text-gray-400">Wins</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <Target className="w-5 h-5 text-red-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-white">{rankedState.losses}</p>
              <p className="text-xs text-gray-400">Losses</p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 text-center">
              <div className="w-5 h-5 mx-auto mb-1 flex items-center justify-center text-amber-400 font-bold">
                %
              </div>
              <p className="text-lg font-bold text-white">{winRate}%</p>
              <p className="text-xs text-gray-400">Win Rate</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
