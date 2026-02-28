"use client";

import { League } from '@/lib/context/LeaguesContext';
import { useLeagues } from '@/lib/context/LeaguesContext';

interface StandingsTableProps {
  league: League;
}

export default function StandingsTable({ league }: StandingsTableProps) {
  const { state } = useLeagues();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase">Pos</th>
            <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase">Player</th>
            <th className="text-center py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase">P</th>
            <th className="text-center py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase">W</th>
            <th className="text-center py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase">L</th>
            <th className="text-center py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase">Leg Diff</th>
            <th className="text-center py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase">Pts</th>
            <th className="text-center py-2 sm:py-3 px-2 sm:px-4 text-[10px] sm:text-xs font-semibold text-slate-400 uppercase">Form</th>
          </tr>
        </thead>
        <tbody>
          {league.standings.map((standing, index) => {
            const player = league.players.find(p => p.id === standing.playerId);
            const isCurrentUser = standing.playerId === state.currentUserId;

            if (!player) return null;

            return (
              <tr
                key={standing.playerId}
                className={`
                  border-b border-slate-800/50 transition-colors
                  ${isCurrentUser
                    ? 'bg-teal-500/10 hover:bg-teal-500/15'
                    : 'hover:bg-slate-800/30'
                  }
                `}
              >
                <td className="py-3 sm:py-4 px-2 sm:px-4">
                  <div className={`
                    w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm
                    ${index === 0
                      ? 'bg-gradient-to-br from-yellow-500 to-amber-600 text-white'
                      : index === 1
                      ? 'bg-gradient-to-br from-slate-400 to-slate-500 text-white'
                      : index === 2
                      ? 'bg-gradient-to-br from-orange-600 to-orange-700 text-white'
                      : 'bg-slate-800/50 text-slate-400'
                    }
                  `}>
                    {index + 1}
                  </div>
                </td>
                <td className="py-3 sm:py-4 px-2 sm:px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-semibold">
                      {player.displayName.charAt(0)}
                    </div>
                    <div>
                      <div className={`font-medium ${isCurrentUser ? 'text-teal-400' : 'text-white'}`}>
                        {player.displayName}
                      </div>
                      {player.role === 'Owner' && (
                        <div className="text-xs text-yellow-500">Owner</div>
                      )}
                      {player.role === 'Admin' && (
                        <div className="text-xs text-blue-400">Admin</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 sm:py-4 px-2 sm:px-4 text-center text-white font-medium">{standing.played}</td>
                <td className="py-3 sm:py-4 px-2 sm:px-4 text-center text-green-400 font-medium">{standing.won}</td>
                <td className="py-3 sm:py-4 px-2 sm:px-4 text-center text-red-400 font-medium">{standing.lost}</td>
                <td className="py-3 sm:py-4 px-2 sm:px-4 text-center">
                  <span className={`font-medium ${
                    standing.legDifference > 0 ? 'text-green-400' :
                    standing.legDifference < 0 ? 'text-red-400' :
                    'text-slate-400'
                  }`}>
                    {standing.legDifference > 0 ? '+' : ''}{standing.legDifference}
                  </span>
                </td>
                <td className="py-3 sm:py-4 px-2 sm:px-4 text-center">
                  <span className="inline-flex items-center justify-center w-12 h-8 rounded-lg bg-teal-500/20 text-teal-400 font-bold">
                    {standing.points}
                  </span>
                </td>
                <td className="py-3 sm:py-4 px-2 sm:px-4">
                  <div className="flex gap-1 justify-center">
                    {standing.form.slice(0, 5).map((result, i) => (
                      <div
                        key={i}
                        className={`
                          w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                          ${result === 'W'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                          }
                        `}
                      >
                        {result}
                      </div>
                    ))}
                    {standing.form.length === 0 && (
                      <div className="text-slate-500 text-sm">No games</div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {league.standings.length === 0 && (
        <div className="text-center py-12">
          <div className="text-slate-400 mb-2">No standings yet</div>
          <div className="text-slate-500 text-sm">Standings will appear once matches are completed</div>
        </div>
      )}
    </div>
  );
}
