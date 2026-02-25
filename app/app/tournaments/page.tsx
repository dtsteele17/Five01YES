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
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <Card 
        className="bg-slate-900/60 backdrop-blur-sm border-white/10 hover:border-white/20 hover:shadow-xl hover:shadow-slate-900/25 transition-all duration-300 cursor-pointer h-full overflow-hidden group rounded-2xl"
        onClick={onClick}
      >
        <CardHeader className="pb-4 relative">
          {/* Background Gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          <div className="flex items-start justify-between gap-3 relative">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors duration-200 truncate leading-tight">
                {tournament.name}
              </CardTitle>
              <CardDescription className="text-slate-400 text-sm mt-1 flex items-center gap-2">
                <Target className="w-3 h-3" />
                {tournament.game_mode} • Best of {tournament.legs_per_match}
              </CardDescription>
            </div>
            <Badge 
              className={`${statusInfo.color} text-xs font-semibold border shrink-0 ${statusInfo.pulse ? 'animate-pulse' : ''} shadow-sm`}
            >
              <StatusIcon className="w-3 h-3 mr-1.5" />
              {statusInfo.label}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 space-y-4">
          {/* Participants */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <div className="w-8 h-8 bg-slate-800/50 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <span className="font-medium">{tournament.participant_count || 0}/{tournament.max_participants}</span>
            </div>
            <div className="flex items-center gap-1">
              {[...Array(Math.min(3, tournament.participant_count || 0))].map((_, i) => (
                <Avatar key={i} className="w-7 h-7 border-2 border-white/20 shadow-sm">
                  <AvatarFallback className="bg-gradient-to-br from-slate-700 to-slate-800 text-xs font-semibold text-slate-300">
                    {String.fromCharCode(65 + i)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {(tournament.participant_count || 0) > 3 && (
                <div className="w-7 h-7 rounded-full bg-slate-700 border-2 border-white/20 flex items-center justify-center text-xs font-semibold text-slate-300 shadow-sm">
                  +{(tournament.participant_count || 0) - 3}
                </div>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400 font-medium">
              <span>Registration Progress</span>
              <span>{Math.round(((tournament.participant_count || 0) / tournament.max_participants) * 100)}%</span>
            </div>
            <div className="w-full bg-slate-800/50 rounded-full h-2.5 overflow-hidden backdrop-blur-sm">
              <motion.div 
                className="bg-gradient-to-r from-emerald-500 to-blue-500 h-full rounded-full shadow-sm"
                initial={{ width: 0 }}
                animate={{ width: `${((tournament.participant_count || 0) / tournament.max_participants) * 100}%` }}
                transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              {tournament.start_at && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/30 px-2 py-1 rounded-lg">
                  <Calendar className="w-3 h-3" />
                  <span>{formatDate(tournament.start_at)}</span>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-slate-400 border-slate-600 text-xs">
                {tournament.entry_type === 'open' ? 'Open' : 'Invite Only'}
              </Badge>
              {tournament.is_registered && (
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs font-semibold shadow-sm">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Joined
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
              className={`${statusInfo.color} font-semibold border ${statusInfo.pulse ? 'animate-pulse' : ''}`}
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
  const [activeTab, setActiveTab] = useState<'open' | 'live' | 'completed'>('open');
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
      
      // Get tournaments with participant counts and user registration status
      const { data: tournamentsData, error } = await supabase
        .from('tournaments')
        .select(`
          *,
          tournament_participants!inner(count),
          user_participation:tournament_participants!left(user_id)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Process tournaments and add participant counts + user registration status
      const processedTournaments = tournamentsData?.map(t => ({
        ...t,
        participant_count: t.tournament_participants?.[0]?.count || 0,
        is_registered: t.user_participation?.some((p: any) => p.user_id === currentUserId) || false
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
    
    // Filter based on active tab
    switch (activeTab) {
      case 'open':
        return matchesSearch && ['registration', 'ready'].includes(tournament.status);
      case 'live':
        return matchesSearch && tournament.status === 'in_progress';
      case 'completed':
        return matchesSearch && tournament.status === 'completed';
      default:
        return matchesSearch;
    }
  });

  // Get counts for tab badges
  const openCount = tournaments.filter(t => ['registration', 'ready'].includes(t.status)).length;
  const liveCount = tournaments.filter(t => t.status === 'in_progress').length;
  const completedCount = tournaments.filter(t => t.status === 'completed').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-7xl mx-auto">
        
        {/* Premium Header Section */}
        <div className="bg-slate-900/40 backdrop-blur-xl border-b border-white/10 sticky top-0 z-40">
          <div className="px-6 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 via-emerald-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
                  <Trophy className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-black text-white tracking-tight">Tournaments</h1>
                  <p className="text-slate-400">Compete in organized competitions</p>
                </div>
              </div>
              
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold shadow-lg shadow-emerald-500/25 border-0"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Tournament
              </Button>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 space-y-8")

          {/* Featured Tournaments */}
          {featuredTournaments.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-lg flex items-center justify-center">
                  <Star className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-white">Featured Tournaments</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

          {/* Tab Navigation */}
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-white/10 p-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('open')}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-medium transition-all duration-200 ${
                  activeTab === 'open'
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Open to Join</span>
                {openCount > 0 && (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                    {openCount}
                  </Badge>
                )}
              </button>
              
              <button
                onClick={() => setActiveTab('live')}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-medium transition-all duration-200 ${
                  activeTab === 'live'
                    ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <PlayCircle className="w-4 h-4" />
                <span>Live Now</span>
                {liveCount > 0 && (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs animate-pulse">
                    {liveCount}
                  </Badge>
                )}
              </button>
              
              <button
                onClick={() => setActiveTab('completed')}
                className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-medium transition-all duration-200 ${
                  activeTab === 'completed'
                    ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Crown className="w-4 h-4" />
                <span>Completed</span>
                {completedCount > 0 && (
                  <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">
                    {completedCount}
                  </Badge>
                )}
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              placeholder="Search tournaments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 bg-slate-900/50 backdrop-blur-sm border-white/10 text-white placeholder:text-slate-500 rounded-2xl focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500/50"
            />
          </div>

          {/* Tournament Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <Card key={i} className="bg-slate-900/50 backdrop-blur-sm border-white/10 animate-pulse rounded-2xl">
                  <CardHeader className="pb-3">
                    <div className="h-6 bg-slate-700 rounded-xl w-3/4 mb-2" />
                    <div className="h-4 bg-slate-700 rounded-lg w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="h-4 bg-slate-700 rounded-lg" />
                      <div className="h-2 bg-slate-700 rounded-full" />
                      <div className="h-4 bg-slate-700 rounded-lg w-2/3" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredTournaments.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredTournaments.map(tournament => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  onClick={() => handleTournamentClick(tournament.id)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="w-24 h-24 bg-slate-800/50 backdrop-blur-sm rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-slate-900/25">
                <Trophy className="w-12 h-12 text-slate-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-300 mb-4">
                {searchQuery 
                  ? 'No tournaments found'
                  : activeTab === 'open' 
                    ? 'No open tournaments'
                    : activeTab === 'live'
                      ? 'No live tournaments'
                      : 'No completed tournaments'
                }
              </h3>
              <p className="text-slate-500 mb-10 max-w-md mx-auto leading-relaxed">
                {searchQuery 
                  ? 'Try adjusting your search terms or check a different category'
                  : activeTab === 'open'
                    ? 'Create the first tournament and invite others to compete!'
                    : activeTab === 'live'
                      ? 'No tournaments are currently in progress. Check back soon!'
                      : 'No tournaments have finished recently. Check out the open tournaments!'
                }
              </p>
              {activeTab === 'open' && !searchQuery && (
                <Button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold shadow-lg shadow-emerald-500/25 px-8 py-3 rounded-xl"
                >
                  <Plus className="w-5 h-5 mr-3" />
                  Create Your First Tournament
                </Button>
              )}
            </div>
          )}
      </div>

        </div>
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