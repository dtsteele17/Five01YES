'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Trophy,
  Plus,
  Calendar,
  Clock,
  Search,
  Globe,
  Lock,
} from 'lucide-react';
import { CreateLeagueModal } from '@/components/app/CreateLeagueModal';
import { toast } from 'sonner';

interface BrowseLeague {
  id: string;
  name: string;
  description?: string;
  access: string;
  status: string;
  start_date: string;
  close_date?: string;
  max_participants: number;
  legs_per_game: number;
  match_days: string[];
  match_time: string;
  games_per_day: number;
  playoffs: string;
  owner_name: string;
  member_count: number;
  is_member: boolean;
}

export default function LeaguesPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tab, setTab] = useState<'browse' | 'yours'>('browse');
  const [allLeagues, setAllLeagues] = useState<BrowseLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadLeagues();
  }, []);

  const loadLeagues = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('rpc_browse_leagues');
      if (error) throw error;
      setAllLeagues(data || []);
    } catch (err: any) {
      console.error('[LEAGUES] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (leagueId: string) => {
    setJoining(leagueId);
    try {
      const { data, error } = await supabase.rpc('rpc_join_league', { p_league_id: leagueId });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success('Joined league!');
      loadLeagues();
    } catch (err: any) {
      toast.error(err.message || 'Failed to join');
    } finally {
      setJoining(null);
    }
  };

  const myLeagues = allLeagues.filter(l => l.is_member);
  const browseLeagues = allLeagues.filter(l => !l.is_member && l.status === 'open');
  const filtered = (tab === 'browse' ? browseLeagues : myLeagues).filter(l =>
    !searchQuery || l.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getLeagueColor = (index: number) => {
    const colors = ['from-yellow-500 to-orange-500', 'from-blue-500 to-cyan-500', 'from-emerald-500 to-teal-500', 'from-purple-500 to-pink-500'];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-6 max-sm:px-1">
      {/* Testing Lock */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-center">
        <Lock className="w-6 h-6 text-amber-400 mx-auto mb-2" />
        <p className="text-amber-400 font-semibold">Leagues are currently locked for testing</p>
        <p className="text-slate-400 text-sm mt-1">This feature will be available soon.</p>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-1">Leagues</h1>
          <p className="text-gray-400 text-sm">Join or create leagues and compete with others.</p>
        </div>
        <Button
          disabled
          className="bg-slate-700 text-slate-400 cursor-not-allowed w-full sm:w-auto opacity-60"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create League
        </Button>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex bg-slate-800/50 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('browse')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'browse' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-4 h-4 inline mr-1.5" />
            Browse ({browseLeagues.length})
          </button>
          <button
            onClick={() => setTab('yours')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'yours' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4 inline mr-1.5" />
            Your Leagues ({myLeagues.length})
          </button>
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search leagues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800/50 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
        </div>
      </div>

      {/* League Cards */}
      {loading ? (
        <div className="text-center py-16">
          <p className="text-gray-400">Loading leagues...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-slate-900/50 border-white/10 p-8 text-center">
          <Trophy className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-4">
            {tab === 'browse' ? 'No open leagues available' : "You haven't joined any leagues yet"}
          </p>
          {tab === 'browse' && (
            <Button onClick={() => setIsModalOpen(true)} className="bg-emerald-500 hover:bg-emerald-400 text-white">
              Create One
            </Button>
          )}
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((league, index) => (
            <Card
              key={league.id}
              className="bg-slate-900/50 border-white/10 hover:border-emerald-500/30 transition-colors overflow-hidden cursor-pointer"
              onClick={() => router.push(`/app/leagues/${league.id}`)}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 sm:p-5">
                <div className={`w-12 h-12 bg-gradient-to-br ${getLeagueColor(index)} rounded-xl flex items-center justify-center flex-shrink-0`}>
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-semibold text-base truncate">{league.name}</h3>
                    <Badge className={`text-[10px] ${
                      league.status === 'open' ? 'bg-emerald-500/20 text-emerald-400' :
                      league.status === 'active' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-slate-500/20 text-slate-400'
                    }`}>
                      {league.access === 'invite' && <Lock className="w-3 h-3 mr-0.5" />}
                      {league.status === 'open' ? 'Open' : league.status === 'active' ? 'In Progress' : league.status}
                    </Badge>
                  </div>
                  {league.description && (
                    <p className="text-slate-500 text-xs mb-1.5 line-clamp-1">{league.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {league.member_count}/{league.max_participants}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(league.start_date).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {league.match_time?.slice(0, 5)}
                    </span>
                    <span>Best of {league.legs_per_game}</span>
                    <span>by {league.owner_name}</span>
                  </div>
                </div>

                <div className="flex gap-2 sm:flex-shrink-0">
                  {tab === 'browse' && league.status === 'open' && !league.is_member && (
                    <Button
                      size="sm"
                      className="bg-emerald-500 hover:bg-emerald-400 text-white font-medium"
                      disabled={joining === league.id}
                      onClick={(e) => { e.stopPropagation(); handleJoin(league.id); }}
                    >
                      {joining === league.id ? 'Joining...' : 'Join'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/10 text-white hover:bg-white/5"
                    onClick={(e) => { e.stopPropagation(); router.push(`/app/leagues/${league.id}`); }}
                  >
                    View
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateLeagueModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onLeagueCreated={async (id) => {
          setIsModalOpen(false);
          await loadLeagues();
          router.push(`/app/leagues/${id}`);
        }}
      />
    </div>
  );
}
