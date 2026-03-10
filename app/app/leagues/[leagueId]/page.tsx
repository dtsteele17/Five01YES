'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Trophy, Users, Calendar, Clock, Shield, Crown,
  AlertTriangle, LogOut, UserMinus, Loader2, Swords,
} from 'lucide-react';
import { toast } from 'sonner';

interface LeagueDetails {
  league: {
    id: string; name: string; description?: string; format?: string;
    best_of?: number; max_players?: number; status: string;
    games_per_day?: number; match_days?: number[]; playoff_type?: string;
    access_type?: string; owner_id: string; created_at: string;
    legs_per_game?: number;
  };
  standings: {
    user_id: string; display_name: string; played: number;
    won: number; lost: number; legs_for: number; legs_against: number; points: number;
  }[];
  fixtures: {
    id: string; round: number; home_id: string; home_name: string;
    away_id: string; away_name: string; home_score: number | null;
    away_score: number | null; status: string; scheduled_for: string | null;
  }[];
  members: {
    user_id: string; display_name: string; role: string;
    joined_at: string; warnings: number;
  }[];
  is_member: boolean;
  is_owner: boolean;
  member_count: number;
}

type Tab = 'standings' | 'fixtures' | 'members';

export default function LeagueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const leagueId = params.leagueId as string;
  const supabase = createClient();

  const [data, setData] = useState<LeagueDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('standings');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadDetails();
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, [leagueId]);

  const loadDetails = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.rpc('rpc_get_league_details', { p_league_id: leagueId });
      if (error) throw error;
      setData(result);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load league');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setActionLoading('join');
    try {
      const { data: result, error } = await supabase.rpc('rpc_join_league', { p_league_id: leagueId });
      if (error) throw error;
      if (result?.error) { toast.error(result.error); return; }
      toast.success('Joined league!');
      loadDetails();
    } catch (err: any) {
      toast.error(err.message || 'Failed to join');
    } finally {
      setActionLoading(null);
    }
  };

  const handleLeave = async () => {
    setActionLoading('leave');
    try {
      const { data: result, error } = await supabase.rpc('rpc_leave_league', { p_league_id: leagueId });
      if (error) throw error;
      if (result?.error) { toast.error(result.error); return; }
      toast.success('Left league');
      loadDetails();
    } catch (err: any) {
      toast.error(err.message || 'Failed to leave');
    } finally {
      setActionLoading(null);
    }
  };

  const handleClose = async () => {
    setActionLoading('close');
    try {
      const { data: result, error } = await supabase.rpc('rpc_close_league', { p_league_id: leagueId });
      if (error) throw error;
      if (result?.error) { toast.error(result.error); return; }
      toast.success('Registration closed — fixtures generated!');
      loadDetails();
    } catch (err: any) {
      toast.error(err.message || 'Failed to close registration');
    } finally {
      setActionLoading(null);
    }
  };

  const handleKick = async (userId: string, name: string) => {
    if (!confirm(`Kick ${name} from the league?`)) return;
    setActionLoading(`kick-${userId}`);
    try {
      const { data: result, error } = await supabase.rpc('rpc_admin_kick_player', {
        p_league_id: leagueId, p_user_id: userId,
      });
      if (error) throw error;
      if (result?.error) { toast.error(result.error); return; }
      toast.success(`${name} kicked`);
      loadDetails();
    } catch (err: any) {
      toast.error(err.message || 'Failed to kick');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-24">
        <p className="text-slate-400 mb-4">League not found</p>
        <Button variant="outline" onClick={() => router.push('/app/leagues')}>Back to Leagues</Button>
      </div>
    );
  }

  const { league, standings, fixtures, members, is_member, is_owner, member_count } = data;
  const bestOf = league.best_of || league.legs_per_game || 3;
  const statusColor = league.status === 'open' ? 'bg-emerald-500/20 text-emerald-400'
    : league.status === 'active' ? 'bg-blue-500/20 text-blue-400'
    : league.status === 'completed' ? 'bg-amber-500/20 text-amber-400'
    : 'bg-slate-500/20 text-slate-400';

  const sortedStandings = [...(standings || [])].sort((a, b) =>
    b.points - a.points || (b.legs_for - b.legs_against) - (a.legs_for - a.legs_against)
  );

  const fixturesByRound: Record<number, typeof fixtures> = {};
  (fixtures || []).forEach(f => {
    if (!fixturesByRound[f.round]) fixturesByRound[f.round] = [];
    fixturesByRound[f.round].push(f);
  });
  const rounds = Object.keys(fixturesByRound).map(Number).sort((a, b) => a - b);

  return (
    <div className="space-y-4 max-sm:px-1">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white mt-1 -ml-2"
          onClick={() => router.push('/app/leagues')}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{league.name}</h1>
            <Badge className={`text-[10px] ${statusColor}`}>{league.status}</Badge>
          </div>
          {league.description && <p className="text-slate-500 text-xs mt-0.5">{league.description}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400 mt-1.5">
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{member_count}/{league.max_players || '?'}</span>
            <span className="flex items-center gap-1"><Swords className="w-3.5 h-3.5" />Best of {bestOf}</span>
            {league.playoff_type && <span>Playoffs: {league.playoff_type}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {is_owner && league.status === 'open' && (
            <Button size="sm" className="bg-amber-500 hover:bg-amber-400 text-white"
              disabled={actionLoading === 'close'} onClick={handleClose}>
              {actionLoading === 'close' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Close Registration'}
            </Button>
          )}
          {!is_member && league.status === 'open' && (
            <Button size="sm" className="bg-emerald-500 hover:bg-emerald-400 text-white"
              disabled={actionLoading === 'join'} onClick={handleJoin}>
              {actionLoading === 'join' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Join'}
            </Button>
          )}
          {is_member && !is_owner && league.status === 'open' && (
            <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              disabled={actionLoading === 'leave'} onClick={handleLeave}>
              <LogOut className="w-3.5 h-3.5 mr-1" />Leave
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-800/50 rounded-lg p-1 w-fit">
        {(['standings', 'fixtures', 'members'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'
            }`}>
            {t === 'standings' && <Trophy className="w-4 h-4 inline mr-1.5" />}
            {t === 'fixtures' && <Calendar className="w-4 h-4 inline mr-1.5" />}
            {t === 'members' && <Users className="w-4 h-4 inline mr-1.5" />}
            {t}
          </button>
        ))}
      </div>

      {/* Standings Tab */}
      {tab === 'standings' && (
        <Card className="bg-slate-900/50 border-white/10 overflow-hidden">
          {!sortedStandings.length ? (
            <div className="p-8 text-center text-slate-500">
              {league.status === 'open' ? 'Waiting for registration to close' : 'No standings yet'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400 text-xs">
                    <th className="text-left py-3 px-3 w-8">#</th>
                    <th className="text-left py-3 px-2">Player</th>
                    <th className="text-center py-3 px-2">P</th>
                    <th className="text-center py-3 px-2">W</th>
                    <th className="text-center py-3 px-2">L</th>
                    <th className="text-center py-3 px-2 hidden sm:table-cell">LF</th>
                    <th className="text-center py-3 px-2 hidden sm:table-cell">LA</th>
                    <th className="text-center py-3 px-2 font-bold">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStandings.map((s, i) => {
                    const isMe = s.user_id === currentUserId;
                    return (
                      <tr key={s.user_id} className={`border-b border-white/5 ${isMe ? 'bg-emerald-500/10' : 'hover:bg-white/5'}`}>
                        <td className="py-2.5 px-3 text-slate-500 font-mono text-xs">{i + 1}</td>
                        <td className={`py-2.5 px-2 font-medium truncate max-w-[140px] ${isMe ? 'text-emerald-400' : 'text-white'}`}>
                          {s.display_name} {isMe && <span className="text-[10px] text-emerald-500">(you)</span>}
                        </td>
                        <td className="text-center py-2.5 px-2 text-slate-400">{s.played}</td>
                        <td className="text-center py-2.5 px-2 text-emerald-400">{s.won}</td>
                        <td className="text-center py-2.5 px-2 text-red-400">{s.lost}</td>
                        <td className="text-center py-2.5 px-2 text-slate-400 hidden sm:table-cell">{s.legs_for}</td>
                        <td className="text-center py-2.5 px-2 text-slate-400 hidden sm:table-cell">{s.legs_against}</td>
                        <td className="text-center py-2.5 px-2 text-white font-bold">{s.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Fixtures Tab */}
      {tab === 'fixtures' && (
        <div className="space-y-4">
          {rounds.length === 0 ? (
            <Card className="bg-slate-900/50 border-white/10 p-8 text-center text-slate-500">
              {league.status === 'open' ? 'Fixtures generated when registration closes' : 'No fixtures yet'}
            </Card>
          ) : rounds.map(round => (
            <Card key={round} className="bg-slate-900/50 border-white/10 overflow-hidden">
              <div className="px-4 py-2 border-b border-white/10 bg-white/5">
                <h3 className="text-sm font-semibold text-white">Round {round}</h3>
              </div>
              <div className="divide-y divide-white/5">
                {fixturesByRound[round].map(f => {
                  const isMyFixture = f.home_id === currentUserId || f.away_id === currentUserId;
                  const homeWon = f.status === 'completed' && f.home_score !== null && f.away_score !== null && f.home_score > f.away_score;
                  const awayWon = f.status === 'completed' && f.home_score !== null && f.away_score !== null && f.away_score > f.home_score;
                  return (
                    <div key={f.id} className={`flex items-center gap-2 px-4 py-2.5 text-sm ${isMyFixture ? 'bg-emerald-500/5' : ''}`}>
                      <span className={`flex-1 text-right truncate ${f.home_id === currentUserId ? 'text-emerald-400 font-semibold' : homeWon ? 'text-white font-semibold' : 'text-slate-400'}`}>
                        {f.home_name}
                      </span>
                      <div className="flex items-center gap-1.5 flex-shrink-0 min-w-[60px] justify-center">
                        {f.status === 'completed' ? (
                          <span className="font-mono font-bold text-white">{f.home_score} - {f.away_score}</span>
                        ) : (
                          <Badge className={`text-[10px] ${
                            f.status === 'forfeited' ? 'bg-red-500/20 text-red-400' : 'bg-slate-700/50 text-slate-400'
                          }`}>
                            {f.status === 'forfeited' ? 'FF' : 'vs'}
                          </Badge>
                        )}
                      </div>
                      <span className={`flex-1 truncate ${f.away_id === currentUserId ? 'text-emerald-400 font-semibold' : awayWon ? 'text-white font-semibold' : 'text-slate-400'}`}>
                        {f.away_name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Members Tab */}
      {tab === 'members' && (
        <Card className="bg-slate-900/50 border-white/10 overflow-hidden">
          <div className="divide-y divide-white/5">
            {(members || []).map(m => {
              const isMe = m.user_id === currentUserId;
              return (
                <div key={m.user_id} className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-emerald-500/5' : ''}`}>
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                    {m.role === 'owner' ? <Crown className="w-4 h-4 text-amber-400" /> : <Users className="w-4 h-4 text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isMe ? 'text-emerald-400' : 'text-white'}`}>
                      {m.display_name} {isMe && <span className="text-[10px] text-emerald-500">(you)</span>}
                    </p>
                    <p className="text-xs text-slate-500">Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {m.role === 'owner' && <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">Owner</Badge>}
                    {m.warnings > 0 && (
                      <Badge className="bg-red-500/20 text-red-400 text-[10px]">
                        <AlertTriangle className="w-3 h-3 mr-0.5" />{m.warnings}
                      </Badge>
                    )}
                    {is_owner && m.role !== 'owner' && (
                      <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 h-7 px-2"
                        disabled={actionLoading === `kick-${m.user_id}`}
                        onClick={() => handleKick(m.user_id, m.display_name)}>
                        <UserMinus className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
