"use client";

import { useParams, useRouter } from 'next/navigation';
import { useLeagues, League } from '@/lib/context/LeaguesContext';
import { useState, useEffect } from 'react';
import { ArrowLeft, Shield, Lock, Calendar, Clock, Camera, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import StandingsTable from '@/components/league/StandingsTable';
import FixturesList from '@/components/league/FixturesList';
import PlayersManager from '@/components/league/PlayersManager';
import LiveUpdates from '@/components/league/LiveUpdates';
import StatsTable from '@/components/league/StatsTable';

type TabType = 'standings' | 'fixtures' | 'players' | 'updates' | 'stats';

function getLeagueFromLocalStorage(leagueId: string): League | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const stored = localStorage.getItem('five01_leagues');
    if (stored) {
      const parsed = JSON.parse(stored);
      const foundInStorage = parsed.leagues?.find((l: any) => l.id === leagueId);
      if (foundInStorage) {
        console.log('LEAGUE_FOUND_IN_LOCALSTORAGE', foundInStorage);
        return {
          ...foundInStorage,
          startDate: new Date(foundInStorage.startDate),
          fixtures: foundInStorage.fixtures.map((f: any) => ({
            ...f,
            dateTime: new Date(f.dateTime),
          })),
          liveUpdates: foundInStorage.liveUpdates.map((u: any) => ({
            ...u,
            timestamp: new Date(u.timestamp),
          })),
        };
      }
    }
  } catch (error) {
    console.error('Failed to read from localStorage:', error);
  }

  return undefined;
}

export default function LeagueOverview() {
  const params = useParams();
  const router = useRouter();
  const { getLeague, isOwnerOrAdmin } = useLeagues();
  const [activeTab, setActiveTab] = useState<TabType>('standings');

  const leagueId = params.leagueId as string;
  console.log('LEAGUE_PAGE_RENDER', leagueId);
  console.log('LEAGUE_OVERVIEW_PARAMS', leagueId);

  let league = getLeague(leagueId);

  if (league) {
    console.log('LEAGUE_FOUND_IN_CONTEXT', league.id);
  } else {
    console.log('LEAGUE_NOT_FOUND_IN_CONTEXT', leagueId);
    league = getLeagueFromLocalStorage(leagueId);

    if (league) {
      console.log('LEAGUE_LOADED_FROM_LOCALSTORAGE', league.id);
    } else {
      console.log('LEAGUE_NOT_FOUND_ANYWHERE', leagueId);
    }
  }

  const isAdmin = league ? isOwnerOrAdmin(leagueId) : false;

  if (!league) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 flex items-center justify-center">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-red-500/20 rounded-2xl p-8 max-w-md">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">League Not Found</h1>
            <p className="text-slate-400 mb-6">
              The league you're looking for doesn't exist or has been removed.
            </p>
            <Button
              onClick={() => router.push('/app/leagues')}
              className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white w-full"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Leagues
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: TabType; label: string }[] = [
    { id: 'standings', label: 'Standings' },
    { id: 'fixtures', label: 'Fixtures' },
    { id: 'players', label: 'Players' },
    { id: 'updates', label: 'Live Updates' },
    { id: 'stats', label: 'Stats' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="relative">
        <div
          className="absolute inset-0 bg-gradient-to-b from-teal-500/10 via-transparent to-transparent pointer-events-none"
          style={{ height: '300px' }}
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => router.push('/app/leagues')}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Leagues
          </button>

          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 rounded-2xl p-6 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="flex-1">
                <div className="flex items-start gap-4 mb-4">
                  <div className="bg-gradient-to-br from-teal-500 to-cyan-600 p-3 rounded-xl">
                    <Trophy className="w-8 h-8 text-white" />
                  </div>
                  <div className="flex-1">
                    <h1 className="text-3xl font-bold text-white mb-2">{league.name}</h1>
                    <p className="text-xs text-gray-500 mb-2">League ID: {leagueId}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={league.access === 'invite' ? 'secondary' : 'default'}>
                        {league.access === 'invite' ? (
                          <><Lock className="w-3 h-3 mr-1" /> Invite Only</>
                        ) : (
                          <><Shield className="w-3 h-3 mr-1" /> Open League</>
                        )}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-slate-400 text-xs mb-1">Legs</div>
                    <div className="text-white font-semibold">{league.legsPerGame}</div>
                  </div>
                  <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-slate-400 text-xs mb-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Match Days
                    </div>
                    <div className="text-white font-semibold text-sm">
                      {league.matchDays.map(d => d.slice(0, 3)).join(', ')}
                    </div>
                  </div>
                  <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-slate-400 text-xs mb-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Time
                    </div>
                    <div className="text-white font-semibold">{league.matchTime}</div>
                  </div>
                  <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30">
                    <div className="text-slate-400 text-xs mb-1 flex items-center gap-1">
                      <Camera className="w-3 h-3" />
                      Camera
                    </div>
                    <div className="text-white font-semibold">
                      {league.cameraRequired ? 'Required' : 'Optional'}
                    </div>
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="flex flex-col gap-2">
                  <Button className="bg-teal-600 hover:bg-teal-700">
                    Invite Players
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/app/leagues/${leagueId}/manage`)}
                  >
                    Manage League
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 rounded-2xl overflow-hidden">
            <div className="border-b border-slate-800/50">
              <div className="flex overflow-x-auto scrollbar-hide">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`
                      relative px-6 py-4 text-sm font-medium transition-colors whitespace-nowrap
                      ${activeTab === tab.id
                        ? 'text-teal-400'
                        : 'text-slate-400 hover:text-white'
                      }
                    `}
                  >
                    {tab.label}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-teal-500 to-cyan-500" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6">
              {activeTab === 'standings' && <StandingsTable league={league} />}
              {activeTab === 'fixtures' && <FixturesList league={league} />}
              {activeTab === 'players' && <PlayersManager league={league} isAdmin={isAdmin} />}
              {activeTab === 'updates' && <LiveUpdates league={league} isAdmin={isAdmin} />}
              {activeTab === 'stats' && <StatsTable league={league} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
