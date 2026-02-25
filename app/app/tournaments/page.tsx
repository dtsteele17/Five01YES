'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { CreateTournamentModal } from '@/components/app/CreateTournamentModal';
import { Plus, Search, Filter, Trophy, Users, Clock, Calendar, Target, Zap, Crown, Star, PlayCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface Tournament {
  id: string;
  name: string;
  description: string | null;
  start_at: string | null;
  status: string;
  max_participants: number;
  round_scheduling: string;
  entry_type: string;
  game_mode: number;
  legs_per_match: number;
  created_by: string;
  created_at: string;
  bracket_generated_at: string | null;
  started_at: string | null;
  participant_count?: number;
  is_registered?: boolean;
}

const statusConfig = {
  registration: { 
    label: 'Open', 
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    icon: Users
  },
  ready: { 
    label: 'Starting Soon', 
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    icon: Clock
  },
  in_progress: { 
    label: 'Live', 
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: PlayCircle,
    pulse: true
  },
  completed: { 
    label: 'Completed', 
    color: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    icon: Trophy
  },
};

function TournamentCard({ tournament, onClick }: { tournament: Tournament; onClick: () => void }) {
  const statusInfo = statusConfig[tournament.status as keyof typeof statusConfig] || statusConfig.registration;
  const StatusIcon = statusInfo.icon;
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toDateString() === date.toDateString();
    
    if (isToday) return `Today ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    if (isTomorrow) return `Tomorrow ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <Card 
        className="bg-slate-900/50 border-white/10 hover:border-white/20 transition-all cursor-pointer h-full overflow-hidden group"
        onClick={onClick}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors truncate">
                {tournament.name}
              </CardTitle>
              <CardDescription className="text-slate-400 text-sm">
                {tournament.game_mode} • Best of {tournament.legs_per_match}
              </CardDescription>
            </div>
            <Badge
              className={`${statusInfo.color} text-xs font-semibold border shrink-0 ${'pulse' in statusInfo && statusInfo.pulse ? 'animate-pulse' : ''}`}
            >
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusInfo.label}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          <div className="space-y-3">
            {/* Participants */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Users className="w-4 h-4 text-slate-400" />
                <span>{tournament.participant_count || 0}/{tournament.max_participants} players</span>
              </div>
              <div className="flex items-center gap-1">
                {[...Array(Math.min(3, tournament.participant_count || 0))].map((_, i) => (
                  <Avatar key={i} className="w-6 h-6 border border-white/20">
                    <AvatarFallback className="bg-slate-700 text-xs">
                      {String.fromCharCode(65 + i)}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {(tournament.participant_count || 0) > 3 && (
                  <div className="w-6 h-6 rounded-full bg-slate-700 border border-white/20 flex items-center justify-center text-xs text-slate-300">
                    +{(tournament.participant_count || 0) - 3}
                  </div>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Registration</span>
                <span>{Math.round(((tournament.participant_count || 0) / tournament.max_participants) * 100)}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <motion.div 
                  className="bg-gradient-to-r from-emerald-500 to-blue-500 h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${((tournament.participant_count || 0) / tournament.max_participants) * 100}%` }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                />
              </div>
            </div>

            {/* Timing */}
            {tournament.start_at && (
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>{formatDate(tournament.start_at)}</span>
              </div>
            )}

            {/* Entry Type */}
            <div className="flex items-center justify-between text-xs">
              <Badge variant="outline" className="text-slate-400 border-slate-600">
                {tournament.entry_type === 'open' ? 'Open Entry' : 'Invite Only'}
              </Badge>
              {tournament.is_registered && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  Registered
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function FeaturedTournamentCard({ tournament, onClick }: { tournament: Tournament; onClick: () => void }) {
  const statusInfo = statusConfig[tournament.status as keyof typeof statusConfig] || statusConfig.registration;
  const StatusIcon = statusInfo.icon;

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <Card 
        className="bg-gradient-to-br from-slate-900 to-slate-800 border-white/20 hover:border-emerald-500/50 transition-all cursor-pointer overflow-hidden group"
        onClick={onClick}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center">
                <Trophy className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white group-hover:text-emerald-400 transition-colors">
                  {tournament.name}
                </h3>
                <p className="text-slate-400">
                  {tournament.game_mode} • {tournament.max_participants} Players
                </p>
              </div>
            </div>
            <Badge
              className={`${statusInfo.color} font-semibold border ${'pulse' in statusInfo && statusInfo.pulse ? 'animate-pulse' : ''}`}
            >
              <StatusIcon className="w-3 h-3 mr-1" />
              {statusInfo.label}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-slate-300">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{tournament.participant_count || 0}/{tournament.max_participants}</span>
              </div>
              {tournament.start_at && (
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{new Date(tournament.start_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
            
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {tournament.is_registered ? 'View' : 'Join'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function TournamentsPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [featuredTournaments, setFeaturedTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadTournaments();
    loadCurrentUser();
  }, []);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  const loadTournaments = async () => {
    try {
      setLoading(true);
      
      // Get tournaments with participant counts
      const { data: tournamentsData, error } = await supabase
        .from('tournaments')
        .select(`
          *,
          tournament_participants(count)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Process tournaments and add participant counts
      const processedTournaments = tournamentsData?.map(t => ({
        ...t,
        participant_count: t.tournament_participants?.[0]?.count || 0
      })) || [];

      setTournaments(processedTournaments);
      
      // Featured tournaments - prioritize live/starting soon tournaments
      const featured = processedTournaments
        .filter(t => ['in_progress', 'ready', 'registration'].includes(t.status))
        .slice(0, 3);
      setFeaturedTournaments(featured);
      
    } catch (error) {
      console.error('Error loading tournaments:', error);
      toast.error('Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  };

  const handleTournamentClick = (tournamentId: string) => {
    router.push(`/app/tournaments/${tournamentId}`);
  };

  const filteredTournaments = tournaments.filter(tournament => {
    const matchesSearch = tournament.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || tournament.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openTournaments = filteredTournaments.filter(t => t.status === 'registration');
  const liveTournaments = filteredTournaments.filter(t => t.status === 'in_progress');
  const completedToday = filteredTournaments.filter(t => {
    if (t.status !== 'completed') return false;
    const today = new Date().toDateString();
    return new Date(t.created_at).toDateString() === today;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white">Tournaments</h1>
              <p className="text-slate-400">Compete in organized competitions</p>
            </div>
          </div>
          
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Tournament
          </Button>
        </div>

        {/* Featured Tournaments */}
        {featuredTournaments.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">Featured Tournaments</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {featuredTournaments.map(tournament => (
                <FeaturedTournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  onClick={() => handleTournamentClick(tournament.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Search tournaments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-800/50 border-white/10 text-white"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px] bg-slate-800/50 border-white/10 text-white">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="registration">Open</SelectItem>
              <SelectItem value="ready">Starting Soon</SelectItem>
              <SelectItem value="in_progress">Live</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tournament Categories */}
        <div className="space-y-6">
          {/* Open Tournaments */}
          {openTournaments.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                Open Tournaments ({openTournaments.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {openTournaments.map(tournament => (
                  <TournamentCard
                    key={tournament.id}
                    tournament={tournament}
                    onClick={() => handleTournamentClick(tournament.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Live Tournaments */}
          {liveTournaments.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <PlayCircle className="w-5 h-5 text-red-400" />
                Live Tournaments ({liveTournaments.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {liveTournaments.map(tournament => (
                  <TournamentCard
                    key={tournament.id}
                    tournament={tournament}
                    onClick={() => handleTournamentClick(tournament.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Today */}
          {completedToday.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-400" />
                Completed Today ({completedToday.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {completedToday.map(tournament => (
                  <TournamentCard
                    key={tournament.id}
                    tournament={tournament}
                    onClick={() => handleTournamentClick(tournament.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Empty State */}
        {!loading && filteredTournaments.length === 0 && (
          <div className="text-center py-12">
            <Trophy className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-400 mb-2">No tournaments found</h3>
            <p className="text-slate-500 mb-6">
              {searchQuery || statusFilter !== 'all' 
                ? 'Try adjusting your search or filters'
                : 'Be the first to create a tournament!'
              }
            </p>
            {(!searchQuery && statusFilter === 'all') && (
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Tournament
              </Button>
            )}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <Card key={i} className="bg-slate-900/50 border-white/10 animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-slate-700 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-slate-700 rounded w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="h-4 bg-slate-700 rounded" />
                    <div className="h-2 bg-slate-700 rounded" />
                    <div className="h-4 bg-slate-700 rounded w-2/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Tournament Modal */}
      <CreateTournamentModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onTournamentCreated={(tournamentId: string) => {
          setIsCreateModalOpen(false);
          toast.success('Tournament created successfully!');
          // Navigate directly to the new tournament
          router.push(`/app/tournaments/${tournamentId}`);
        }}
      />
    </div>
  );
}