'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TournamentCard } from '@/components/app/TournamentCard';
import { CreateTournamentModal } from '@/components/app/CreateTournamentModal';
import { Plus, Search, Filter, Trophy } from 'lucide-react';
import { listTournaments, subscribeToTournaments, TournamentRow } from '@/lib/db/tournaments';
import { toast } from 'sonner';

interface TournamentCardProps {
  id: string;
  name: string;
  startDate: string;
  startTime: string;
  maxParticipants: number;
  participantsCount: number;
  status: 'open' | 'full' | 'started' | 'completed';
  scheduleMode: 'singleDay' | 'multiDay';
  isOfficial: boolean;
  entryType: string;
  description: string;
  legsPerMatch: number;
  isRegistered?: boolean;
}

export default function TournamentsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [maxParticipantsFilter, setMaxParticipantsFilter] = useState<string>('all');
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [userRegistrations, setUserRegistrations] = useState<Record<string, boolean>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    loadTournaments();
    loadCurrentUser();

    const tournamentsUnsubscribe = subscribeToTournaments((tournament) => {
      setTournaments((prev) => {
        const existing = prev.find((t) => t.id === tournament.id);
        if (existing) {
          return prev.map((t) => (t.id === tournament.id ? tournament : t));
        }
        return [tournament, ...prev];
      });
    });

    // Subscribe to participant changes
    const participantsChannel = supabase
      .channel('tournament_participants_channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tournament_participants',
        },
        async () => {
          await loadParticipantCounts();
        }
      )
      .subscribe();

    const pollInterval = setInterval(async () => {
      try {
        await supabase.rpc('process_due_tournaments');
        await supabase.rpc('process_ready_deadlines');
      } catch (error) {
        console.error('Error polling tournament processing:', error);
      }
    }, 15000);

    return () => {
      tournamentsUnsubscribe();
      supabase.removeChannel(participantsChannel);
      clearInterval(pollInterval);
    };
  }, []);

  async function loadCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  }

  async function loadParticipantCounts() {
    try {
      const { data, error } = await supabase
        .from('tournament_participants')
        .select('tournament_id, user_id, status_type')
        .in('status_type', ['registered', 'checked-in']);  // Only count registered/checked-in participants

      if (error) throw error;

      const counts: Record<string, number> = {};
      const registrations: Record<string, boolean> = {};

      data?.forEach((entry: any) => {
        counts[entry.tournament_id] = (counts[entry.tournament_id] || 0) + 1;

        if (currentUserId && entry.user_id === currentUserId) {
          registrations[entry.tournament_id] = true;
        }
      });

      setParticipantCounts(counts);
      setUserRegistrations(registrations);
    } catch (error: any) {
      console.error('LOAD_PARTICIPANT_COUNTS_ERROR', error);
    }
  }

  async function loadTournaments() {
    try {
      setLoading(true);
      setLastError(null);
      console.log('LOADING_TOURNAMENTS_START');
      const data = await listTournaments();
      setTournaments(data);
      console.log('TOURNAMENTS_LOADED_INTO_STATE', {
        count: data.length,
        tournaments: data.map(t => ({ id: t.id, name: t.name }))
      });

      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);

      await loadParticipantCounts();
    } catch (error: any) {
      console.error('LOAD_TOURNAMENTS_ERROR', {
        message: error.message,
        stack: error.stack
      });
      setLastError(`List fetch error: ${error.message}`);
      toast.error(`Failed to load tournaments: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  const handleTournamentCreated = async (tournamentId: string) => {
    try {
      setIsCreateModalOpen(false);
      setLastError(null);
      console.log('TOURNAMENT_CREATED_CALLBACK', tournamentId);

      await loadTournaments();

      console.log('NAVIGATING_TO_TOURNAMENT', tournamentId);
      router.push(`/app/tournaments/${tournamentId}`);
    } catch (error: any) {
      console.error('TOURNAMENT_CREATED_NAVIGATION_ERROR', error);
      setLastError(`Create insert error: ${error.message}`);
    }
  };

  const handleJoinTournament = (tournamentId: string) => {
    console.log('JOIN_TOURNAMENT', tournamentId);
    router.push(`/app/tournaments/${tournamentId}`);
  };

  const filteredTournaments = tournaments.filter((tournament) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!tournament.name.toLowerCase().includes(query)) return false;
    }

    if (statusFilter !== 'all' && tournament.status.toLowerCase() !== statusFilter) {
      return false;
    }

    if (maxParticipantsFilter !== 'all' && tournament.max_participants !== parseInt(maxParticipantsFilter)) {
      return false;
    }

    return true;
  });

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Tournaments</h1>
          <p className="text-gray-400">Compete in tournaments and win prizes.</p>
        </div>
        <Button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Tournament
        </Button>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Search tournaments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-800/50 border-white/10 text-white placeholder:text-gray-500 focus:border-teal-500 focus:ring-teal-500/20"
            />
          </div>

          <div className="flex gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] bg-slate-800/50 border-white/10 text-white focus:border-teal-500 focus:ring-teal-500/20">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="full">Full</SelectItem>
                <SelectItem value="started">Started</SelectItem>
              </SelectContent>
            </Select>

            <Select value={maxParticipantsFilter} onValueChange={setMaxParticipantsFilter}>
              <SelectTrigger className="w-[160px] bg-slate-800/50 border-white/10 text-white focus:border-teal-500 focus:ring-teal-500/20">
                <SelectValue placeholder="All Sizes" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-white/10">
                <SelectItem value="all">All Sizes</SelectItem>
                <SelectItem value="4">4 Players</SelectItem>
                <SelectItem value="8">8 Players</SelectItem>
                <SelectItem value="16">16 Players</SelectItem>
                <SelectItem value="32">32 Players</SelectItem>
                <SelectItem value="64">64 Players</SelectItem>
                <SelectItem value="128">128 Players</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Tournaments</h2>
          <p className="text-gray-400">Browse and join active tournaments.</p>
        </div>

        {loading ? (
          <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-12 text-center">
            <p className="text-gray-400">Loading tournaments...</p>
          </div>
        ) : filteredTournaments.length > 0 ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredTournaments.map((tournament) => {
              const participantsCount = participantCounts[tournament.id] || 0;
              const isMyTournament = currentUserId && tournament.created_by === currentUserId;

              const startDate = tournament.start_at ? new Date(tournament.start_at) : null;
              const startDateStr = startDate ? startDate.toISOString().split('T')[0] : '';
              const startTimeStr = startDate ? startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';

              const cardProps: TournamentCardProps = {
                id: tournament.id,
                name: tournament.name,
                startDate: startDateStr,
                startTime: startTimeStr,
                maxParticipants: tournament.max_participants,
                participantsCount,
                status: tournament.status.toLowerCase() as 'open' | 'full' | 'started' | 'completed',
                scheduleMode: tournament.round_scheduling === 'one_day' ? 'singleDay' : 'multiDay',
                isOfficial: !!isMyTournament,
                entryType: tournament.entry_type === 'invite_only' ? 'invite_only' : 'open',
                description: tournament.description || '',
                legsPerMatch: tournament.best_of_legs || 3,
                isRegistered: userRegistrations[tournament.id] || false,
              };
              return (
                <TournamentCard key={tournament.id} tournament={cardProps} onJoin={handleJoinTournament} />
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-12 text-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-8 h-8 text-gray-500" />
            </div>
            <p className="text-gray-400 mb-2">
              {searchQuery || statusFilter !== 'all' || maxParticipantsFilter !== 'all'
                ? 'No tournaments match your filters'
                : 'No tournaments available'}
            </p>
            <p className="text-gray-500 text-sm mb-4">
              {searchQuery || statusFilter !== 'all' || maxParticipantsFilter !== 'all'
                ? 'Try adjusting your filters or create your own tournament'
                : 'Be the first to create a tournament'}
            </p>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              variant="outline"
              className="border-white/10 text-white hover:bg-white/5"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Tournament
            </Button>
          </div>
        )}
      </div>

      <CreateTournamentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onTournamentCreated={handleTournamentCreated}
      />

      {process.env.NODE_ENV === 'development' && lastError && (
        <div className="fixed bottom-4 right-4 bg-red-500/10 border border-red-500/20 rounded-lg p-4 max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-red-400 font-semibold mb-1">Dev Debug Panel</h4>
              <p className="text-red-400 text-sm font-mono">{lastError}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLastError(null)}
              className="text-red-400 hover:bg-red-500/20"
            >
              ×
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
