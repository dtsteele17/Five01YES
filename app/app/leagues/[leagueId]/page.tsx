"use client";

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Shield, Calendar, Clock, Users, Trophy, Loader2, Settings, UserPlus, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

type TabType = 'standings' | 'fixtures' | 'players' | 'stats';

interface LeagueData {
  league: any;
  standings: any[] | null;
  fixtures: any[] | null;
  members: any[] | null;
  is_member: boolean;
  is_owner: boolean;
  member_count: number;
}

export default function LeagueOverview() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabType>('standings');
  const [data, setData] = useState<LeagueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const leagueId = params.leagueId as string;

  useEffect(() => {
    loadLeague();
  }, [leagueId]);

  const loadLeague = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.rpc('rpc_get_league_details', {
        p_league_id: leagueId,
      });
      if (error) throw error;
      if (result?.error) { toast.error(result.error); return; }
      setData(result);
    } catch (err: any) {
      console.error('[LEAGUE]', err);
      toast.error('Failed to load league');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setJoining(true);
    try {
      const { data: res, error } = await supabase.rpc('rpc_join_league', { p_league_id: leagueId });
      if (error) throw error;
      if (res?.error) { toast.error(res.error); return; }
      toast.success('Joined league!');
      loadLeague();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm('Are you sure you want to leave this league?')) return;
    setLeaving(true);
    try {
      const { data: res, error } = await supabase.rpc('rpc_leave_league', { p_league_id: leagueId });
      if (error) throw error;
      if (res?.error) { toast.error(res.error); return; }
      toast.success('Left league');
      router.push('/app/leagues');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLeaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!data?.league) {
    return (
      <div className="text-center py-16">
        <p className="text-white text-lg mb-4">League not found</p>
        <Button variant="ghost" onClick={() => router.push('/app/leagues')}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Leagues
        </Button>
      </div>
    );
  }

  const { league, standings, fixtures, members, is_member, is_owner, member_count } = data;
  const tabs: { key: TabType; label: string }[] = [
    { key: 'standings', label: 'Standings' },
    { key: 'fixtures', label: 'Fixtures' },
    { key: 'players', label: 'Players' },
    { key: 'stats', label: 'Stats' },
  ];

  const completedFixtures = fixtures?.filter(f => f.status === 'completed') || [];
  const upcomingFixtures = fixtures?.filter(f => f.status === 'scheduled') || [];

  return (
    <div className="space-y-6 max-sm:px-1">
      {/* Header */}
      <div>
        <button onClick={() => router.push('/app/leagues')} className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to Leagues
        </button>
        
        <Card className="bg-slate-900/50 border-white/10 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-white">{league.name}</h1>
                  <p className="text-slate-400 text-xs">by {league.owner_name}</p>
                </div>
              </div>
              {league.description && <p className="text-slate-400 text-sm mb-3">{league.description}</p>}
              
              <Badge className={`text-xs mr-2 ${
                league.status === 'open' ? 'bg-emerald-500/20 text-emerald-400' :
                league.status === 'active' ? 'bg-blue-500/20 text-blue-400' :
                league.status === 'completed' ? 'bg-amber-500/20 text-amber-400' :
                'bg-slate-500/20 text-slate-400'
              }`}>
                {league.status === 'open' ? '○ Open' : league.status === 'active' ? '● Active' : league.status === 'completed' ? '✓ Completed' : '○ ' + league.status}
              </Badge>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              {!is_member && league.status === 'open' && (
                <Button onClick={handleJoin} disabled={joining} className="bg-emerald-500 hover:bg-emerald-400 text-white">
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  {joining ? 'Joining...' : 'Join League'}
                </Button>
              )}
              {is_member && !is_owner && (
                <Button variant="outline" onClick={handleLeave} disabled={leaving} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                  <LogOut className="w-4 h-4 mr-1.5" />
                  Leave
                </Button>
              )}
              {is_owner && (
                <Button variant="outline" onClick={() => router.push(`/app/leagues/${leagueId}/manage`)} className="border-white/10 text-white hover:bg-white/5">
                  <Settings className="w-4 h-4 mr-1.5" />
                  Manage
                </Button>
              )}
            </div>
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider">Players</p>
              <p className="text-white font-bold">{member_count}/{league.max_participants}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider">Format</p>
              <p className="text-white font-bold">Best of {league.legs_per_game}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider">Match Days</p>
              <p className="text-white font-bold text-sm">{league.match_days?.join(', ') || '—'}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider">Time</p>
              <p className="text-white font-bold">{league.match_time?.slice(0, 5) || '—'}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-800/50 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors ${
              activeTab === t.key ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'standings' && (
        <Card className="bg-slate-900/50 border-white/10 overflow-hidden">
          {!standings || standings.length === 0 ? (
            <div className="p-8 text-center">
              <Trophy className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No standings yet</p>
              <p className="text-slate-500 text-xs">Standings will appear once the league starts</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-slate-500 text-xs uppercase">
                    <th className="text-left p-3 w-8">#</th>
                    <th className="text-left p-3">Player</th>
                    <th className="text-center p-3 w-10">P</th>
                    <th className="text-center p-3 w-10">W</th>
                    <th className="text-center p-3 w-10">L</th>
                    <th className="text-center p-3 w-14">LD</th>
                    <th className="text-center p-3 w-10 font-bold">Pts</th>
                    <th className="text-center p-3 w-20 hidden sm:table-cell">Form</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s: any, idx: number) => (
                    <tr key={s.user_id} className={`border-b border-white/5 ${idx < 2 ? 'bg-emerald-500/5' : ''}`}>
                      <td className="p-3 text-slate-400 text-xs">{idx + 1}</td>
                      <td className="p-3 text-white font-medium">{s.username}</td>
                      <td className="p-3 text-center text-slate-400">{s.played}</td>
                      <td className="p-3 text-center text-slate-400">{s.won}</td>
                      <td className="p-3 text-center text-slate-400">{s.lost}</td>
                      <td className={`p-3 text-center font-medium ${s.leg_diff > 0 ? 'text-emerald-400' : s.leg_diff < 0 ? 'text-red-400' : 'text-slate-400'}`}>
                        {s.leg_diff > 0 ? '+' : ''}{s.leg_diff}
                      </td>
                      <td className="p-3 text-center text-white font-bold">{s.points}</td>
                      <td className="p-3 text-center hidden sm:table-cell">
                        <div className="flex justify-center gap-0.5">
                          {(s.form || '').split('').map((r: string, i: number) => (
                            <span key={i} className={`w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                              r === 'W' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                            }`}>{r}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'fixtures' && (
        <div className="space-y-4">
          {upcomingFixtures.length > 0 && (
            <Card className="bg-slate-900/50 border-white/10 p-4">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Upcoming</h3>
              <div className="space-y-2">
                {upcomingFixtures.map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-white text-sm font-medium text-right flex-1">{f.home_username}</span>
                      <span className="text-slate-600 text-xs">vs</span>
                      <span className="text-white text-sm font-medium text-left flex-1">{f.away_username}</span>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-slate-400 text-xs">{new Date(f.scheduled_date).toLocaleDateString()}</p>
                      <p className="text-slate-500 text-[10px]">{f.scheduled_time?.slice(0, 5)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {completedFixtures.length > 0 && (
            <Card className="bg-slate-900/50 border-white/10 p-4">
              <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Results</h3>
              <div className="space-y-2">
                {completedFixtures.map((f: any) => {
                  const homeWon = f.home_legs_won > f.away_legs_won;
                  return (
                    <div key={f.id} className="flex items-center justify-center gap-3 bg-white/5 rounded-lg px-3 py-2">
                      <span className={`text-sm font-medium flex-1 text-right ${homeWon ? 'text-white' : 'text-slate-400'}`}>{f.home_username}</span>
                      <div className="flex items-center gap-2 min-w-[60px] justify-center">
                        <span className={`text-lg font-bold ${homeWon ? 'text-white' : 'text-slate-500'}`}>{f.home_legs_won}</span>
                        <span className="text-slate-700 text-xs">-</span>
                        <span className={`text-lg font-bold ${!homeWon ? 'text-white' : 'text-slate-500'}`}>{f.away_legs_won}</span>
                      </div>
                      <span className={`text-sm font-medium flex-1 text-left ${!homeWon ? 'text-white' : 'text-slate-400'}`}>{f.away_username}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {(!fixtures || fixtures.length === 0) && (
            <Card className="bg-slate-900/50 border-white/10 p-8 text-center">
              <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No fixtures yet</p>
              <p className="text-slate-500 text-xs">Fixtures are generated when the admin closes registration</p>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'players' && (
        <Card className="bg-slate-900/50 border-white/10">
          {!members || members.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">No players yet</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {members.map((m: any) => (
                <div key={m.user_id} className="flex items-center justify-between p-3 sm:p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {(m.username || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{m.username}</p>
                      <p className="text-slate-500 text-xs">Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.role === 'owner' && (
                      <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">
                        <Shield className="w-3 h-3 mr-0.5" /> Owner
                      </Badge>
                    )}
                    {m.status === 'kicked' && (
                      <Badge className="bg-red-500/20 text-red-400 text-[10px]">Kicked</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'stats' && (
        <Card className="bg-slate-900/50 border-white/10 p-8 text-center">
          <Trophy className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Stats coming soon</p>
          <p className="text-slate-500 text-xs">Detailed statistics will appear as matches are played</p>
        </Card>
      )}
    </div>
  );
}
