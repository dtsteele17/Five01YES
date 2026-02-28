"use client";

import { League, PlayerStats } from '@/lib/context/LeaguesContext';
import { useLeagues } from '@/lib/context/LeaguesContext';
import { useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface StatsTableProps {
  league: League;
}

type SortKey = 'matchesPlayed' | 'average' | 'checkoutPercentage' | 'oneEighties' | 'highestCheckout' | 'wins' | 'losses';
type SortDirection = 'asc' | 'desc';

export default function StatsTable({ league }: StatsTableProps) {
  const { state } = useLeagues();
  const [sortKey, setSortKey] = useState<SortKey>('average');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const sortedStats = [...league.stats].sort((a, b) => {
    const aValue = a[sortKey];
    const bValue = b[sortKey];

    if (sortDirection === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortKey !== columnKey) {
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 ml-1" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-1" />
    );
  };

  const getPercentageColor = (percentage: number) => {
    if (percentage >= 40) return 'text-green-400';
    if (percentage >= 30) return 'text-yellow-400';
    return 'text-slate-400';
  };

  const getAverageColor = (average: number) => {
    if (average >= 80) return 'text-green-400';
    if (average >= 70) return 'text-yellow-400';
    return 'text-slate-400';
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase">
                Player
              </th>
              <th
                onClick={() => handleSort('matchesPlayed')}
                className="text-center py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center justify-center">
                  Played
                  <SortIcon columnKey="matchesPlayed" />
                </div>
              </th>
              <th
                onClick={() => handleSort('average')}
                className="text-center py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center justify-center">
                  Avg
                  <SortIcon columnKey="average" />
                </div>
              </th>
              <th
                onClick={() => handleSort('checkoutPercentage')}
                className="text-center py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center justify-center">
                  Checkout %
                  <SortIcon columnKey="checkoutPercentage" />
                </div>
              </th>
              <th
                onClick={() => handleSort('oneEighties')}
                className="text-center py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center justify-center">
                  180s
                  <SortIcon columnKey="oneEighties" />
                </div>
              </th>
              <th
                onClick={() => handleSort('highestCheckout')}
                className="text-center py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center justify-center">
                  High CO
                  <SortIcon columnKey="highestCheckout" />
                </div>
              </th>
              <th
                onClick={() => handleSort('wins')}
                className="text-center py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center justify-center">
                  W
                  <SortIcon columnKey="wins" />
                </div>
              </th>
              <th
                onClick={() => handleSort('losses')}
                className="text-center py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase cursor-pointer hover:text-white transition-colors"
              >
                <div className="flex items-center justify-center">
                  L
                  <SortIcon columnKey="losses" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((stat, index) => {
              const player = league.players.find(p => p.id === stat.playerId);
              const isCurrentUser = stat.playerId === state.currentUserId;
              const winRate = stat.matchesPlayed > 0
                ? Math.round((stat.wins / stat.matchesPlayed) * 100)
                : 0;

              if (!player) return null;

              return (
                <tr
                  key={stat.playerId}
                  className={`
                    border-b border-slate-800/50 transition-colors
                    ${isCurrentUser
                      ? 'bg-teal-500/10 hover:bg-teal-500/15'
                      : 'hover:bg-slate-800/30'
                    }
                  `}
                >
                  <td className="py-3 sm:py-4 px-2 sm:px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-semibold text-sm">
                        {player.displayName.charAt(0)}
                      </div>
                      <div className={`font-medium ${isCurrentUser ? 'text-teal-400' : 'text-white'}`}>
                        {player.displayName}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 sm:py-4 px-2 sm:px-4 text-center text-white font-medium">
                    {stat.matchesPlayed}
                  </td>
                  <td className="py-3 sm:py-4 px-2 sm:px-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`font-bold ${getAverageColor(stat.average)}`}>
                        {stat.average.toFixed(1)}
                      </span>
                      <div className="w-full max-w-[60px] h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            stat.average >= 80 ? 'bg-green-500' :
                            stat.average >= 70 ? 'bg-yellow-500' :
                            'bg-slate-500'
                          }`}
                          style={{ width: `${Math.min((stat.average / 100) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-3 sm:py-4 px-2 sm:px-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`font-bold ${getPercentageColor(stat.checkoutPercentage)}`}>
                        {stat.checkoutPercentage}%
                      </span>
                      <div className="w-full max-w-[60px] h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            stat.checkoutPercentage >= 40 ? 'bg-green-500' :
                            stat.checkoutPercentage >= 30 ? 'bg-yellow-500' :
                            'bg-slate-500'
                          }`}
                          style={{ width: `${stat.checkoutPercentage}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-3 sm:py-4 px-2 sm:px-4 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-purple-500/20 text-purple-400 font-bold text-sm">
                      {stat.oneEighties}
                    </span>
                  </td>
                  <td className="py-3 sm:py-4 px-2 sm:px-4 text-center">
                    <span className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-orange-500/20 text-orange-400 font-bold text-sm">
                      {stat.highestCheckout}
                    </span>
                  </td>
                  <td className="py-3 sm:py-4 px-2 sm:px-4 text-center">
                    <div className="flex flex-col items-center">
                      <span className="text-green-400 font-bold">{stat.wins}</span>
                      {stat.matchesPlayed > 0 && (
                        <span className="text-xs text-slate-500">{winRate}%</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 sm:py-4 px-2 sm:px-4 text-center">
                    <span className="text-red-400 font-bold">{stat.losses}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {league.stats.length === 0 && (
        <div className="text-center py-12">
          <div className="text-slate-400 mb-2">No stats available yet</div>
          <div className="text-slate-500 text-sm">Stats will be generated once matches are completed</div>
        </div>
      )}
    </div>
  );
}
