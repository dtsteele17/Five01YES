"use client";

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Shield, Users, Calendar, AlertTriangle, Ban, Clock, Edit2, Lock, Play, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

export default function ManageLeague() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const leagueId = params.leagueId as string;

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [tab, setTab] = useState<'players' | 'fixtures' | 'settings'>('players');

  // Modal states
  const [warnModal, setWarnModal] = useState<{ userId: string; username: string } | null>(null);
  const [warnReason, setWarnReason] = useState('');
  const [kickModal, setKickModal] = useState<{ userId: string; username: string } | null>(null);
  const [kickReason, setKickReason] = useState('');
  const [rescheduleModal, setRescheduleModal] = useState<any>(null);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadLeague(); }, [leagueId]);

  const loadLeague = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.rpc('rpc_get_league_details', { p_league_id: leagueId });
      if (error) throw error;
      if (!result?.is_owner) { router.push(`/app/leagues/${leagueId}`); return; }
      setData(result);
      setEditName(result.league.name || '');
      setEditDesc(result.league.description || '');
    } catch (err: any) {
      toast.error('Failed to load league');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseRegistration = async () => {
    if (!confirm('Close registration and generate fixtures? No more players can join after this.')) return;
    setClosing(true);
    try {
      const { data: res, error } = await supabase.rpc('rpc_close_league', { p_league_id: leagueId });
      if (error) throw error;
      if (res?.error) { toast.error(res.error); return; }
      toast.success(`Registration closed! ${res.fixtures_created} fixtures generated.`);
      loadLeague();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setClosing(false);
    }
  };

  const handleKick = async () => {
    if (!kickModal) return;
    try {
      const { data: res, error } = await supabase.rpc('rpc_admin_kick_player', {
        p_league_id: leagueId, p_user_id: kickModal.userId, p_reason: kickReason || null,
      });
      if (error) throw error;
      if (res?.error) { toast.error(res.error); return; }
      toast.success(`${kickModal.username} has been kicked`);
      setKickModal(null); setKickReason('');
      loadLeague();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleWarn = async () => {
    if (!warnModal || !warnReason) return;
    try {
      const { data: res, error } = await supabase.rpc('rpc_admin_warn_player', {
        p_league_id: leagueId, p_user_id: warnModal.userId, p_reason: warnReason,
      });
      if (error) throw error;
      toast.success(`Warning issued to ${warnModal.username}`);
      setWarnModal(null); setWarnReason('');
    } catch (err: any) { toast.error(err.message); }
  };

  const handleReschedule = async () => {
    if (!rescheduleModal || !newDate || !newTime) return;
    try {
      const { data: res, error } = await supabase.rpc('rpc_admin_reschedule_fixture', {
        p_fixture_id: rescheduleModal.id, p_new_date: newDate, p_new_time: newTime,
      });
      if (error) throw error;
      toast.success('Fixture rescheduled');
      setRescheduleModal(null);
      loadLeague();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const { data: res, error } = await supabase.rpc('rpc_admin_update_league', {
        p_league_id: leagueId, p_name: editName || null, p_description: editDesc || null,
      });
      if (error) throw error;
      toast.success('Settings saved');
      loadLeague();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-400 animate-spin" /></div>;
  }

  if (!data) return null;
  const { league, members, fixtures } = data;
  const activeMembers = members?.filter((m: any) => m.status === 'active') || [];
  const scheduledFixtures = fixtures?.filter((f: any) => f.status === 'scheduled') || [];

  return (
    <div className="space-y-6 max-sm:px-1">
      <div>
        <button onClick={() => router.push(`/app/leagues/${leagueId}`)} className="flex items-center gap-1 text-slate-400 hover:text-white text-sm mb-3">
          <ArrowLeft className="w-4 h-4" /> Back to League
        </button>
        <h1 className="text-2xl font-bold text-white mb-1">Manage: {league.name}</h1>
        <Badge className={league.status === 'open' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}>
          {league.status}
        </Badge>
      </div>

      {/* Close Registration */}
      {league.status === 'open' && (
        <Card className="bg-amber-500/5 border-amber-500/20 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" /> Close Registration
              </h3>
              <p className="text-slate-400 text-xs">Generate fixtures and lock the league. {activeMembers.length} players registered.</p>
            </div>
            <Button onClick={handleCloseRegistration} disabled={closing} className="bg-amber-500 hover:bg-amber-400 text-black font-bold">
              {closing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Lock className="w-4 h-4 mr-1" />}
              {closing ? 'Generating...' : 'Close & Generate Fixtures'}
            </Button>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex bg-slate-800/50 rounded-lg p-1 w-fit">
        {(['players', 'fixtures', 'settings'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'}`}
          >{t}</button>
        ))}
      </div>

      {/* Players */}
      {tab === 'players' && (
        <Card className="bg-slate-900/50 border-white/10">
          <div className="divide-y divide-white/5">
            {activeMembers.map((m: any) => (
              <div key={m.user_id} className="flex items-center justify-between p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {(m.username || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">{m.username}</p>
                    <p className="text-slate-500 text-xs">{m.role === 'owner' ? 'Owner' : 'Member'}</p>
                  </div>
                </div>
                {m.role !== 'owner' && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 text-xs h-7 px-2"
                      onClick={() => { setWarnModal({ userId: m.user_id, username: m.username }); setWarnReason(''); }}>
                      <AlertTriangle className="w-3 h-3 mr-1" /> Warn
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs h-7 px-2"
                      onClick={() => { setKickModal({ userId: m.user_id, username: m.username }); setKickReason(''); }}>
                      <Ban className="w-3 h-3 mr-1" /> Kick
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Fixtures */}
      {tab === 'fixtures' && (
        <Card className="bg-slate-900/50 border-white/10">
          {scheduledFixtures.length === 0 ? (
            <div className="p-8 text-center">
              <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm">{league.status === 'open' ? 'Close registration to generate fixtures' : 'No scheduled fixtures'}</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {scheduledFixtures.map((f: any) => (
                <div key={f.id} className="flex items-center justify-between p-3 sm:p-4">
                  <div className="flex-1">
                    <p className="text-white text-sm"><span className="font-medium">{f.home_username}</span> <span className="text-slate-500">vs</span> <span className="font-medium">{f.away_username}</span></p>
                    <p className="text-slate-500 text-xs flex items-center gap-2">
                      <Calendar className="w-3 h-3" /> {new Date(f.scheduled_date).toLocaleDateString()}
                      <Clock className="w-3 h-3" /> {f.scheduled_time?.slice(0, 5)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="border-white/10 text-slate-400 text-xs h-7 px-2"
                    onClick={() => { setRescheduleModal(f); setNewDate(f.scheduled_date); setNewTime(f.scheduled_time?.slice(0, 5) || '19:00'); }}>
                    <Edit2 className="w-3 h-3 mr-1" /> Reschedule
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Settings */}
      {tab === 'settings' && (
        <Card className="bg-slate-900/50 border-white/10 p-4 sm:p-6">
          <div className="space-y-4">
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1">League Name</label>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
            </div>
            <div>
              <label className="text-slate-400 text-xs font-medium block mb-1">Description</label>
              <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
                className="w-full bg-slate-800/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/50" />
            </div>
            <Button onClick={handleSaveSettings} disabled={saving} className="bg-emerald-500 hover:bg-emerald-400 text-white">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </Card>
      )}

      {/* Warn Modal */}
      {warnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <Card className="bg-slate-900 border-white/10 p-6 max-w-sm w-full mx-4">
            <h3 className="text-white font-bold mb-2">Warn {warnModal.username}</h3>
            <textarea value={warnReason} onChange={e => setWarnReason(e.target.value)} placeholder="Reason for warning..."
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-3" rows={3} />
            <div className="flex gap-2">
              <Button className="flex-1 bg-amber-500 text-black font-bold" onClick={handleWarn} disabled={!warnReason}>Issue Warning</Button>
              <Button variant="outline" className="border-white/10 text-white" onClick={() => setWarnModal(null)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Kick Modal */}
      {kickModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <Card className="bg-slate-900 border-white/10 p-6 max-w-sm w-full mx-4">
            <h3 className="text-white font-bold mb-2">Kick {kickModal.username}</h3>
            <textarea value={kickReason} onChange={e => setKickReason(e.target.value)} placeholder="Reason (optional)..."
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white mb-3" rows={3} />
            <div className="flex gap-2">
              <Button className="flex-1 bg-red-500 text-white font-bold" onClick={handleKick}>Kick Player</Button>
              <Button variant="outline" className="border-white/10 text-white" onClick={() => setKickModal(null)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <Card className="bg-slate-900 border-white/10 p-6 max-w-sm w-full mx-4">
            <h3 className="text-white font-bold mb-2">Reschedule Fixture</h3>
            <p className="text-slate-400 text-xs mb-3">{rescheduleModal.home_username} vs {rescheduleModal.away_username}</p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-slate-500 text-xs block mb-1">Date</label>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="text-slate-500 text-xs block mb-1">Time</label>
                <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-emerald-500 text-white font-bold" onClick={handleReschedule}>Save</Button>
              <Button variant="outline" className="border-white/10 text-white" onClick={() => setRescheduleModal(null)}>Cancel</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
