'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { 
  ArrowLeft, 
  Users, 
  Trophy, 
  Calendar, 
  Clock, 
  Target, 
  UserPlus, 
  Settings,
  PlayCircle,
  Crown,
  Star,
  CheckCircle,
  AlertCircle,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import TournamentBracketTab from '@/components/app/TournamentBracketTab';
import { TournamentInviteModal } from '@/components/app/TournamentInviteModal';

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
}

interface Participant {
  id: string;
  tournament_id: string;
  user_id: string;
  role: string;
  status_type: string;
  joined_at: string;
  profiles: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  } | null;
}

const statusConfig = {
  registration: { 
    label: 'Registration Open', 
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    description: 'Players can join this tournament',
    icon: Users
  },
  ready: { 
    label: 'Starting Soon', 
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    description: 'Tournament will begin shortly',
    icon: Clock
  },
  in_progress: { 
    label: 'Live Tournament', 
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    description: 'Matches are in progress',
    icon: PlayCircle,
    pulse: true
  },
  completed: { 
    label: 'Tournament Complete', 
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    description: 'Tournament has finished',
    icon: Crown
  },
};

export default function TournamentDetailPage({ params }: { params: { tournamentId: string } }) {
  const { tournamentId } = params;
  const router = useRouter();
  const supabase = createClient();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joinLoading, setJoinLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  useEffect(() => {
    loadTournament();
    loadCurrentUser();
  }, [tournamentId]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUserId(user?.id || null);
  };

  const loadTournament = async () => {
    try {
      setLoading(true);
      
      const { data: tournamentData, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .single();

      if (tournamentError) throw tournamentError;
      if (!tournamentData) throw new Error('Tournament not found');

      setTournament(tournamentData);
      setIsCreator(currentUserId === tournamentData.created_by);

      // Load participants
      const { data: participantsData, error: participantsError } = await supabase
        .from('tournament_participants')
        .select(`
          *,
          profiles:user_id (
            id,
            username,
            avatar_url
          )
        `)
        .eq('tournament_id', tournamentId)
        .order('joined_at', { ascending: true });

      if (participantsError) throw participantsError;

      setParticipants(participantsData || []);
      setIsRegistered(participantsData?.some(p => p.user_id === currentUserId) || false);

    } catch (error) {
      console.error('Error loading tournament:', error);
      toast.error('Failed to load tournament');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinTournament = async () => {
    if (!currentUserId) {
      toast.error('Please log in to join tournaments');
      return;
    }

    try {
      setJoinLoading(true);
      
      const { error } = await supabase.rpc('join_tournament', {
        p_tournament_id: tournamentId,
        p_user_id: currentUserId
      });

      if (error) throw error;

      toast.success('Successfully joined tournament!');
      loadTournament(); // Reload to update UI
      
    } catch (error: any) {
      console.error('Error joining tournament:', error);
      toast.error(error.message || 'Failed to join tournament');
    } finally {
      setJoinLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getRegistrationProgress = () => {
    if (!tournament) return 0;
    return Math.round((participants.length / tournament.max_participants) * 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="animate-pulse">
            <div className="h-8 bg-slate-700 rounded w-1/3 mb-4" />
            <div className="h-6 bg-slate-700 rounded w-1/2 mb-6" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="h-64 bg-slate-800 rounded-xl" />
              </div>
              <div className="h-96 bg-slate-800 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
        <div className="max-w-6xl mx-auto text-center py-12">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Tournament Not Found</h2>
          <p className="text-slate-400 mb-6">The tournament you're looking for doesn't exist or has been removed.</p>
          <Button onClick={() => router.push('/app/tournaments')} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tournaments
          </Button>
        </div>
      </div>
    );
  }

  const statusInfo = statusConfig[tournament.status as keyof typeof statusConfig] || statusConfig.registration;
  const StatusIcon = statusInfo.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => router.push('/app/tournaments')}
              className="text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div className="text-sm text-slate-500">
              / Tournaments / {tournament.name}
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-xl flex items-center justify-center">
                  <Trophy className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-black text-white">{tournament.name}</h1>
                  <div className="flex items-center gap-4 text-slate-400">
                    <span>{tournament.game_mode} Darts</span>
                    <span>•</span>
                    <span>Best of {tournament.legs_per_match}</span>
                    <span>•</span>
                    <span>{tournament.max_participants} Players</span>
                    <span>•</span>
                    <span className="capitalize">{tournament.entry_type}</span>
                  </div>
                </div>
              </div>
              
              <Badge
                className={`${statusInfo.color} text-base font-semibold border px-3 py-1 w-fit ${'pulse' in statusInfo && statusInfo.pulse ? 'animate-pulse' : ''}`}
              >
                <StatusIcon className="w-4 h-4 mr-2" />
                {statusInfo.label}
              </Badge>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm">
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
              
              {isCreator && (
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              )}
            </div>
          </div>

          {/* Status Card */}
          <Card className="bg-slate-900/50 border-white/10">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Registration Progress */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">Registration</span>
                    <span className="text-sm text-slate-400">{participants.length}/{tournament.max_participants}</span>
                  </div>
                  <Progress 
                    value={getRegistrationProgress()} 
                    className="h-2 bg-slate-800"
                  />
                  <div className="text-xs text-slate-500">
                    {getRegistrationProgress()}% Full
                  </div>
                </div>

                {/* Start Time */}
                {tournament.start_at && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Calendar className="w-4 h-4" />
                      <span>Tournament Start</span>
                    </div>
                    <div className="text-sm font-medium text-white">
                      {formatDate(tournament.start_at)}
                    </div>
                  </div>
                )}

                {/* Format */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <Target className="w-4 h-4" />
                    <span>Format</span>
                  </div>
                  <div className="text-sm font-medium text-white">
                    {tournament.round_scheduling === 'singleDay' ? 'Single Day' : 'Multi-Day'} Tournament
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-3">
            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3 bg-slate-800/50 border-white/10">
                <TabsTrigger value="overview" className="data-[state=active]:bg-emerald-600">
                  🎯 Overview
                </TabsTrigger>
                <TabsTrigger value="players" className="data-[state=active]:bg-emerald-600">
                  👥 Players ({participants.length})
                </TabsTrigger>
                <TabsTrigger value="bracket" className="data-[state=active]:bg-emerald-600">
                  🏆 Bracket
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <Card className="bg-slate-900/50 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white">About This Tournament</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {tournament.description ? (
                      <p className="text-slate-300 leading-relaxed">{tournament.description}</p>
                    ) : (
                      <p className="text-slate-400 italic">No description provided for this tournament.</p>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-700">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-white">Tournament Rules</h4>
                        <ul className="space-y-1 text-sm text-slate-300">
                          <li>• {tournament.game_mode} starting score</li>
                          <li>• Best of {tournament.legs_per_match} legs per match</li>
                          <li>• Double out finish required</li>
                          <li>• Standard tournament bracket elimination</li>
                        </ul>
                      </div>
                      <div className="space-y-2">
                        <h4 className="font-semibold text-white">Format Details</h4>
                        <ul className="space-y-1 text-sm text-slate-300">
                          <li>• {tournament.max_participants} player maximum</li>
                          <li>• {tournament.entry_type === 'open' ? 'Open registration' : 'Invite only'}</li>
                          <li>• {tournament.round_scheduling === 'singleDay' ? 'Single day' : 'Multi-day'} event</li>
                          <li>• Real-time match progression</li>
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card className="bg-slate-900/50 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white">Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {participants.slice(-3).reverse().map((participant, index) => (
                        <motion.div
                          key={participant.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className="flex items-center gap-3 text-sm"
                        >
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-slate-700 text-slate-300">
                              {participant.profiles?.username?.[0]?.toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <span className="text-white font-medium">
                              {participant.profiles?.username || 'Unknown Player'}
                            </span>
                            <span className="text-slate-400"> joined the tournament</span>
                          </div>
                          <span className="text-xs text-slate-500">
                            {new Date(participant.joined_at).toLocaleDateString()}
                          </span>
                        </motion.div>
                      ))}
                      
                      {participants.length === 0 && (
                        <p className="text-slate-400 text-center py-4">No players have joined yet</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Players Tab */}
              <TabsContent value="players" className="space-y-6">
                <Card className="bg-slate-900/50 border-white/10">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white flex items-center gap-3">
                        Registered Players
                        <Badge variant="outline" className="text-slate-400 border-slate-600">
                          {participants.length}/{tournament.max_participants}
                        </Badge>
                      </CardTitle>
                      
                      {/* Invite Button - Only for tournament creators */}
                      {isCreator && tournament.status === 'registration' && (
                        <Button
                          onClick={() => setShowInviteModal(true)}
                          size="sm"
                          className="bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-semibold"
                        >
                          <UserPlus className="w-4 h-4 mr-2" />
                          Invite Players
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {participants.map((participant, index) => (
                        <motion.div
                          key={participant.id}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.05 }}
                          className="flex items-center gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50"
                        >
                          <Avatar className="w-10 h-10">
                            <AvatarFallback className="bg-slate-700 text-white font-semibold">
                              {participant.profiles?.username?.[0]?.toUpperCase() || 'U'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-medium truncate">
                              {participant.profiles?.username || 'Unknown Player'}
                            </div>
                            <div className="text-xs text-slate-400">
                              Joined {new Date(participant.joined_at).toLocaleDateString()}
                            </div>
                          </div>
                          {participant.role === 'admin' && (
                            <Crown className="w-4 h-4 text-yellow-400" />
                          )}
                        </motion.div>
                      ))}
                    </div>
                    
                    {participants.length === 0 && (
                      <div className="text-center py-8">
                        <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400">No players registered yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Bracket Tab */}
              <TabsContent value="bracket">
                <Card className="bg-slate-900/50 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white">Tournament Bracket</CardTitle>
                    <CardDescription className="text-slate-400">
                      {tournament.bracket_generated_at 
                        ? 'Interactive tournament bracket - click matches for details'
                        : 'Bracket will be generated when tournament starts'
                      }
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {tournament.bracket_generated_at ? (
                      <TournamentBracketTab tournamentId={tournamentId} />
                    ) : (
                      <div className="text-center py-12">
                        <Trophy className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-slate-300 mb-2">Bracket Not Generated</h3>
                        <p className="text-slate-400 mb-4">
                          The tournament bracket will be created automatically when the tournament starts.
                        </p>
                        {tournament.status === 'registration' && (
                          <p className="text-sm text-slate-500">
                            Waiting for more players to join ({participants.length}/{tournament.max_participants} registered)
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Join/Status Card */}
            <Card className="bg-slate-900/50 border-white/10 sticky top-6">
              <CardContent className="p-6">
                {!isRegistered ? (
                  <div className="space-y-4">
                    <div className="text-center">
                      <h3 className="text-lg font-semibold text-white mb-2">Join Tournament</h3>
                      <p className="text-sm text-slate-400 mb-4">
                        {participants.length === tournament.max_participants 
                          ? 'Tournament is full!'
                          : `${tournament.max_participants - participants.length} spots remaining`
                        }
                      </p>
                    </div>
                    
                    <Button
                      onClick={handleJoinTournament}
                      disabled={joinLoading || participants.length >= tournament.max_participants || tournament.status !== 'registration'}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                    >
                      {joinLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                          Joining...
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4 mr-2" />
                          Join Tournament
                        </>
                      )}
                    </Button>

                    {tournament.entry_type === 'invite_only' && (
                      <p className="text-xs text-amber-400 text-center">
                        ⚠️ This tournament requires an invitation
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircle className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">You're Registered!</h3>
                      <p className="text-sm text-slate-400">
                        {tournament.status === 'registration' && 'You will be notified when the tournament starts'}
                        {tournament.status === 'ready' && 'Tournament is starting soon!'}
                        {tournament.status === 'in_progress' && 'Good luck in your matches!'}
                        {tournament.status === 'completed' && 'Tournament has ended'}
                      </p>
                    </div>

                    {tournament.status === 'in_progress' && (
                      <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                        <PlayCircle className="w-4 h-4 mr-2" />
                        View My Matches
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tournament Stats */}
            <Card className="bg-slate-900/50 border-white/10">
              <CardHeader>
                <CardTitle className="text-white text-base">Tournament Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="p-3 bg-slate-800/30 rounded-lg">
                    <div className="text-lg font-bold text-emerald-400">{participants.length}</div>
                    <div className="text-xs text-slate-400">Players</div>
                  </div>
                  <div className="p-3 bg-slate-800/30 rounded-lg">
                    <div className="text-lg font-bold text-blue-400">
                      {tournament.max_participants === 4 ? '2' :
                       tournament.max_participants === 8 ? '3' :
                       tournament.max_participants === 16 ? '4' :
                       tournament.max_participants === 32 ? '5' : '6'}
                    </div>
                    <div className="text-xs text-slate-400">Rounds</div>
                  </div>
                </div>

                <div className="text-xs text-slate-500 space-y-1">
                  <div>Created: {new Date(tournament.created_at).toLocaleDateString()}</div>
                  {tournament.started_at && (
                    <div>Started: {new Date(tournament.started_at).toLocaleDateString()}</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Tournament Invite Modal */}
        {tournament && (
          <TournamentInviteModal
            isOpen={showInviteModal}
            onClose={() => setShowInviteModal(false)}
            tournamentId={tournament.id}
            tournamentName={tournament.name}
          />
        )}
      </div>
    </div>
  );
}