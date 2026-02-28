"use client";

import { useParams, useRouter } from 'next/navigation';
import { useTournaments } from '@/lib/context/TournamentsContext';
import { useState, useEffect } from 'react';
import { ArrowLeft, Settings, Calendar, Trophy, Users, FileText, Save, X, Ban, UserX, Shield, ShieldCheck, Clock, Plus, Trash2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Tournament, TournamentParticipant } from '@/lib/types/tournament';
import { createClient } from '@/lib/supabase/client';

type TabType = 'settings' | 'schedule' | 'bracket' | 'players' | 'rules';

interface TournamentSettings {
  name: string;
  description: string;
  startDateISO: string;
  startTime: string;
  entryType: 'open' | 'invite';
  maxParticipants: number;
  schedulingMode: 'one-day' | 'multi-day';
  startingScore: 301 | 501;
  legsPerMatch: number;
  doubleOut: boolean;
  straightIn: boolean;
  tournamentFormat: 'single-elimination' | 'double-elimination';
  seedingType: 'random' | 'by-rp' | 'manual';
}

interface TournamentMatch {
  id: string;
  roundNumber: number;
  matchNumber: number;
  roundName: string;
  player1?: TournamentParticipant;
  player2?: TournamentParticipant;
  scheduledDate: string;
  scheduledTime: string;
  status: 'scheduled' | 'live' | 'completed' | 'bye';
  winnerId?: string;
  player1Score: number;
  player2Score: number;
}

export default function ManageTournamentPage() {
  const params = useParams();
  const router = useRouter();
  const { getTournament, state, dispatch } = useTournaments();
  const tournamentId = params.tournamentId as string;
  const tournament = getTournament(tournamentId);

  const [activeTab, setActiveTab] = useState<TabType>('settings');
  const [tournamentSettings, setTournamentSettings] = useState<TournamentSettings | null>(null);
  const [rulesText, setRulesText] = useState('');
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [showKickDialog, setShowKickDialog] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<TournamentParticipant | null>(null);
  const [banRounds, setBanRounds] = useState<number>(1);
  const [bracketGenerated, setBracketGenerated] = useState(false);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  
  const supabase = createClient();

  const isCreator = tournament?.createdByUserId === state.currentUserId;
  const isAdmin = tournament?.participants.some(
    p => p.userId === state.currentUserId && (p as any).role === 'admin'
  );
  const hasAccess = isCreator || isAdmin;

  useEffect(() => {
    if (tournament) {
      setTournamentSettings({
        name: tournament.name,
        description: tournament.description || '',
        startDateISO: tournament.startDateISO,
        startTime: tournament.startTime,
        entryType: tournament.entryType,
        maxParticipants: tournament.maxParticipants,
        schedulingMode: tournament.schedulingMode,
        startingScore: 501,
        legsPerMatch: tournament.legsPerMatch,
        doubleOut: true,
        straightIn: true,
        tournamentFormat: 'single-elimination',
        seedingType: 'random',
      });
      setRulesText('Standard tournament rules apply. All matches must be completed on time. Camera verification is recommended for all matches.');

      if (tournament.status !== 'Open') {
        // P0.3 FIX: Load real matches from DB instead of generating mock ones
        loadRealMatches();
      }
    }
  }, [tournament]);

  // P0.3 FIX: Load real matches from DB instead of generating mock ones
  const loadRealMatches = async () => {
    if (!tournament) return;

    try {
      const { data: matchesData, error } = await supabase
        .from('tournament_matches')
        .select(`
          *,
          player1:player1_id (
            id,
            username
          ),
          player2:player2_id (
            id,
            username
          )
        `)
        .eq('tournament_id', tournamentId)
        .order('round', { ascending: true })
        .order('match_number', { ascending: true });

      if (error) throw error;

      if (matchesData && matchesData.length > 0) {
        // Convert DB matches to expected format
        const formattedMatches: TournamentMatch[] = matchesData.map(match => ({
          id: match.id,
          roundNumber: match.round,
          matchNumber: match.match_number || match.match_index || 1,
          roundName: getRoundName(match.round, tournament.maxParticipants),
          scheduledDate: tournament.startDateISO,
          scheduledTime: tournament.startTime,
          status: match.status as any,
          player1Score: 0, // TODO: Get real scores if available
          player2Score: 0, // TODO: Get real scores if available
          player1: match.player1 as any,
          player2: match.player2 as any,
          winnerId: match.winner_id,
        }));
        
        setMatches(formattedMatches);
        setBracketGenerated(true);
      } else {
        // No matches found - bracket not generated yet
        setMatches([]);
        setBracketGenerated(false);
      }
    } catch (error: any) {
      console.error('Error loading real matches:', error);
      // Fallback to empty state - don't generate mock data
      setMatches([]);
      setBracketGenerated(false);
    }
  };

  const getRoundName = (round: number, maxParticipants: number): string => {
    const totalRounds = Math.log2(maxParticipants);
    const roundsRemaining = totalRounds - round + 1;

    if (roundsRemaining === 1) return 'Final';
    if (roundsRemaining === 2) return 'Semi-Finals';
    if (roundsRemaining === 3) return 'Quarter-Finals';
    return `Round of ${Math.pow(2, roundsRemaining)}`;
  };

  if (!tournament) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 flex items-center justify-center">
        <Card className="bg-slate-900/80 backdrop-blur-xl border border-red-500/20 p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Tournament Not Found</h1>
          <p className="text-slate-400 mb-6">
            The tournament you're looking for doesn't exist.
          </p>
          <Button
            onClick={() => router.push('/app/tournaments')}
            className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tournaments
          </Button>
        </Card>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 flex items-center justify-center">
        <Card className="bg-slate-900/80 backdrop-blur-xl border border-red-500/20 p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400 mb-6">
            You don't have permission to manage this tournament. Only tournament owners and admins can access this page.
          </p>
          <Button
            onClick={() => router.push(`/app/tournaments/${tournamentId}`)}
            className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tournament
          </Button>
        </Card>
      </div>
    );
  }

  const tournamentStarted = tournament.status !== 'Open';

  const handleSaveSettings = () => {
    if (!tournamentSettings) return;

    dispatch({
      type: 'UPDATE_TOURNAMENT',
      payload: {
        id: tournamentId,
        updates: {
          name: tournamentSettings.name,
          description: tournamentSettings.description,
          startDateISO: tournamentSettings.startDateISO,
          startTime: tournamentSettings.startTime,
          entryType: tournamentSettings.entryType,
          maxParticipants: tournamentSettings.maxParticipants as any,
          schedulingMode: tournamentSettings.schedulingMode,
          legsPerMatch: tournamentSettings.legsPerMatch,
        },
      },
    });

    toast.success('Tournament settings updated successfully');
  };

  const handleSaveRules = () => {
    toast.success('Tournament rules updated successfully');
  };

  const handleBanParticipant = () => {
    if (!selectedParticipant) return;

    dispatch({
      type: 'UPDATE_PARTICIPANT_STATUS',
      payload: {
        tournamentId,
        userId: selectedParticipant.userId,
        status: 'Eliminated',
      },
    });

    setShowBanDialog(false);
    setSelectedParticipant(null);
    toast.success(`Participant banned for ${banRounds} round${banRounds > 1 ? 's' : ''}`);
  };

  const handleKickParticipant = () => {
    if (!selectedParticipant) return;

    const updatedParticipants = tournament.participants.filter(
      p => p.userId !== selectedParticipant.userId
    );

    dispatch({
      type: 'UPDATE_TOURNAMENT',
      payload: {
        id: tournamentId,
        updates: {
          participants: updatedParticipants,
          status: updatedParticipants.length < tournament.maxParticipants ? 'Open' : tournament.status,
        },
      },
    });

    setShowKickDialog(false);
    setSelectedParticipant(null);
    toast.success('Participant removed from tournament');
  };

  const handleGenerateBracket = async () => {
    // P0.3 FIX: Remove mock bracket - use real DB bracket generation
    // This should call actual bracket generation RPC, not generate mock data
    try {
      const { data, error } = await supabase.rpc('generate_tournament_bracket', {
        p_tournament_id: tournamentId
      });
      
      if (error) throw error;
      
      setBracketGenerated(true);
      // Load real matches from DB instead of generating mock ones
      await loadRealMatches();
      toast.success('Tournament bracket generated successfully');
    } catch (error: any) {
      console.error('Error generating bracket:', error);
      toast.error(error.message || 'Failed to generate bracket - DB function may not be available');
      
      // Fallback: Show message that bracket generation is not available
      toast.error('Real bracket generation not yet available. Please use bracket tab for live tournaments.');
    }
  };

  const handleRegenerateBracket = () => {
    if (tournamentStarted) {
      toast.error('Cannot regenerate bracket after tournament has started');
      return;
    }

    setBracketGenerated(false);
    setMatches([]);
    setShowRegenerateDialog(false);
    toast.success('Bracket cleared. Generate a new bracket to continue.');
  };

  const handleUpdateMatchSchedule = (matchId: string, date: string, time: string) => {
    setMatches(prev =>
      prev.map(m =>
        m.id === matchId
          ? { ...m, scheduledDate: date, scheduledTime: time }
          : m
      )
    );
    toast.success('Match schedule updated');
  };

  const handleSetMatchWinner = (matchId: string, winnerId: string) => {
    setMatches(prev =>
      prev.map(m =>
        m.id === matchId
          ? { ...m, winnerId, status: 'completed' as const }
          : m
      )
    );
    toast.success('Match winner updated');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => router.push(`/app/tournaments/${tournamentId}`)}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Tournament
        </button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Manage Tournament</h1>
          <p className="text-slate-400">{tournament.name}</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="space-y-6">
          <TabsList className="bg-slate-900/50 border border-slate-800/50">
            <TabsTrigger value="settings" className="data-[state=active]:bg-teal-600">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="schedule" className="data-[state=active]:bg-teal-600">
              <Calendar className="w-4 h-4 mr-2" />
              Schedule
            </TabsTrigger>
            <TabsTrigger value="bracket" className="data-[state=active]:bg-teal-600">
              <Trophy className="w-4 h-4 mr-2" />
              Bracket
            </TabsTrigger>
            <TabsTrigger value="players" className="data-[state=active]:bg-teal-600">
              <Users className="w-4 h-4 mr-2" />
              Players
            </TabsTrigger>
            <TabsTrigger value="rules" className="data-[state=active]:bg-teal-600">
              <FileText className="w-4 h-4 mr-2" />
              Rules
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-6">
            <Card className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 p-4 sm:p-6">
              <h2 className="text-xl font-bold text-white mb-6">Tournament Settings</h2>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="tournament-name" className="text-white">Tournament Name</Label>
                    <Input
                      id="tournament-name"
                      value={tournamentSettings?.name || ''}
                      onChange={(e) => setTournamentSettings(prev => prev ? ({ ...prev, name: e.target.value }) : null)}
                      className="bg-slate-800/50 border-slate-700 text-white mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="entry-type" className="text-white">Entry Type</Label>
                    <Select
                      value={tournamentSettings?.entryType}
                      onValueChange={(value: 'open' | 'invite') =>
                        setTournamentSettings(prev => prev ? ({ ...prev, entryType: value }) : null)
                      }
                    >
                      <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="invite">Invite Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description" className="text-white">Description</Label>
                  <Textarea
                    id="description"
                    value={tournamentSettings?.description || ''}
                    onChange={(e) => setTournamentSettings(prev => prev ? ({ ...prev, description: e.target.value }) : null)}
                    className="bg-slate-800/50 border-slate-700 text-white mt-2 min-h-[100px]"
                    placeholder="Enter tournament description..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="start-date" className="text-white">Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={tournamentSettings?.startDateISO.split('T')[0] || ''}
                      onChange={(e) => setTournamentSettings(prev => prev ? ({ ...prev, startDateISO: e.target.value }) : null)}
                      className="bg-slate-800/50 border-slate-700 text-white mt-2"
                      disabled={tournamentStarted}
                    />
                    {tournamentStarted && (
                      <p className="text-xs text-slate-500 mt-1">Locked after tournament start</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="start-time" className="text-white">Start Time</Label>
                    <Input
                      id="start-time"
                      type="time"
                      value={tournamentSettings?.startTime || ''}
                      onChange={(e) => setTournamentSettings(prev => prev ? ({ ...prev, startTime: e.target.value }) : null)}
                      className="bg-slate-800/50 border-slate-700 text-white mt-2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label htmlFor="max-participants" className="text-white">Max Participants</Label>
                    <Select
                      value={tournamentSettings?.maxParticipants.toString()}
                      onValueChange={(value) =>
                        setTournamentSettings(prev => prev ? ({ ...prev, maxParticipants: parseInt(value) as any }) : null)
                      }
                      disabled={tournamentStarted}
                    >
                      <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="4">4</SelectItem>
                        <SelectItem value="8">8</SelectItem>
                        <SelectItem value="16">16</SelectItem>
                        <SelectItem value="32">32</SelectItem>
                        <SelectItem value="64">64</SelectItem>
                        <SelectItem value="128">128</SelectItem>
                      </SelectContent>
                    </Select>
                    {tournamentStarted && (
                      <p className="text-xs text-slate-500 mt-1">Locked after tournament start</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="scheduling-mode" className="text-white">Scheduling Mode</Label>
                    <Select
                      value={tournamentSettings?.schedulingMode}
                      onValueChange={(value: 'one-day' | 'multi-day') =>
                        setTournamentSettings(prev => prev ? ({ ...prev, schedulingMode: value }) : null)
                      }
                    >
                      <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-700">
                        <SelectItem value="one-day">One-Day</SelectItem>
                        <SelectItem value="multi-day">Multi-Day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-6 mt-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Match Format</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="starting-score" className="text-white">Starting Score</Label>
                      <Select
                        value={tournamentSettings?.startingScore.toString()}
                        onValueChange={(value) =>
                          setTournamentSettings(prev => prev ? ({ ...prev, startingScore: parseInt(value) as 301 | 501 }) : null)
                        }
                        disabled={tournamentStarted}
                      >
                        <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                          <SelectItem value="301">301</SelectItem>
                          <SelectItem value="501">501</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="legs-per-match" className="text-white">Legs per Match</Label>
                      <Select
                        value={tournamentSettings?.legsPerMatch.toString()}
                        onValueChange={(value) =>
                          setTournamentSettings(prev => prev ? ({ ...prev, legsPerMatch: parseInt(value) }) : null)
                        }
                        disabled={tournamentStarted}
                      >
                        <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                          <SelectItem value="1">Best of 1</SelectItem>
                          <SelectItem value="3">Best of 3</SelectItem>
                          <SelectItem value="5">Best of 5</SelectItem>
                          <SelectItem value="7">Best of 7</SelectItem>
                          <SelectItem value="9">Best of 9</SelectItem>
                          <SelectItem value="11">Best of 11</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="double-out" className="text-white">Double Out</Label>
                        <p className="text-sm text-slate-400 mt-1">Require double to finish</p>
                      </div>
                      <Switch
                        id="double-out"
                        checked={tournamentSettings?.doubleOut}
                        onCheckedChange={(checked) =>
                          setTournamentSettings(prev => prev ? ({ ...prev, doubleOut: checked }) : null)
                        }
                        disabled={tournamentStarted}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="straight-in" className="text-white">Straight In</Label>
                        <p className="text-sm text-slate-400 mt-1">No double required to start</p>
                      </div>
                      <Switch
                        id="straight-in"
                        checked={tournamentSettings?.straightIn}
                        onCheckedChange={(checked) =>
                          setTournamentSettings(prev => prev ? ({ ...prev, straightIn: checked }) : null)
                        }
                        disabled={tournamentStarted}
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-6 mt-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Tournament Format</h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="tournament-format" className="text-white">Format Type</Label>
                      <Select
                        value={tournamentSettings?.tournamentFormat}
                        onValueChange={(value: 'single-elimination' | 'double-elimination') =>
                          setTournamentSettings(prev => prev ? ({ ...prev, tournamentFormat: value }) : null)
                        }
                        disabled={tournamentStarted}
                      >
                        <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                          <SelectItem value="single-elimination">Single Elimination</SelectItem>
                          <SelectItem value="double-elimination">Double Elimination</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="seeding-type" className="text-white">Seeding</Label>
                      <Select
                        value={tournamentSettings?.seedingType}
                        onValueChange={(value: 'random' | 'by-rp' | 'manual') =>
                          setTournamentSettings(prev => prev ? ({ ...prev, seedingType: value }) : null)
                        }
                        disabled={tournamentStarted}
                      >
                        <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-700">
                          <SelectItem value="random">Random</SelectItem>
                          <SelectItem value="by-rp">By RP (Ranked Points)</SelectItem>
                          <SelectItem value="manual">Manual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={handleSaveSettings}
                    className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Changes
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/app/tournaments/${tournamentId}`)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-6">
            <Card className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 p-4 sm:p-6">
              <h2 className="text-xl font-bold text-white mb-6">Manage Schedule</h2>

              {matches.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No matches scheduled yet</p>
                  <p className="text-sm mt-2">Generate the bracket to create match schedule</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Array.from(new Set(matches.map(m => m.roundNumber))).map(roundNum => {
                    const roundMatches = matches.filter(m => m.roundNumber === roundNum);
                    const roundName = roundMatches[0]?.roundName;

                    return (
                      <div key={roundNum}>
                        <h3 className="text-lg font-semibold text-white mb-3">{roundName}</h3>
                        <div className="space-y-3">
                          {roundMatches.map(match => (
                            <div
                              key={match.id}
                              className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="text-white font-medium mb-2">
                                    Match {match.matchNumber}
                                    {match.player1 && match.player2 ? (
                                      <span className="text-sm font-normal text-slate-400 ml-2">
                                        {match.player1.displayName} vs {match.player2.displayName}
                                      </span>
                                    ) : (
                                      <span className="text-sm font-normal text-slate-400 ml-2">TBD</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4 text-sm">
                                    <Input
                                      type="date"
                                      value={match.scheduledDate.split('T')[0]}
                                      onChange={(e) => handleUpdateMatchSchedule(match.id, e.target.value, match.scheduledTime)}
                                      className="bg-slate-800/50 border-slate-700 text-white w-40"
                                    />
                                    <Input
                                      type="time"
                                      value={match.scheduledTime}
                                      onChange={(e) => handleUpdateMatchSchedule(match.id, match.scheduledDate, e.target.value)}
                                      className="bg-slate-800/50 border-slate-700 text-white w-32"
                                    />
                                    <Badge variant={match.status === 'completed' ? 'default' : 'secondary'}>
                                      {match.status}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="bracket" className="space-y-6">
            <Card className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Tournament Bracket</h2>
                <div className="flex gap-2">
                  {!bracketGenerated && matches.length === 0 && (
                    <Button
                      onClick={handleGenerateBracket}
                      className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Generate Bracket
                    </Button>
                  )}
                  {(bracketGenerated || matches.length > 0) && !tournamentStarted && (
                    <Button
                      onClick={() => setShowRegenerateDialog(true)}
                      variant="outline"
                      className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Regenerate Bracket
                    </Button>
                  )}
                </div>
              </div>

              {matches.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Trophy className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Bracket not generated yet</p>
                  <p className="text-sm mt-2">Click Generate Bracket to create the tournament structure</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Array.from(new Set(matches.map(m => m.roundNumber))).map(roundNum => {
                    const roundMatches = matches.filter(m => m.roundNumber === roundNum);
                    const roundName = roundMatches[0]?.roundName;

                    return (
                      <div key={roundNum}>
                        <h3 className="text-lg font-semibold text-white mb-3">{roundName}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {roundMatches.map(match => (
                            <div
                              key={match.id}
                              className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-white font-medium">Match {match.matchNumber}</span>
                                <Badge variant={match.status === 'completed' ? 'default' : 'secondary'}>
                                  {match.status}
                                </Badge>
                              </div>

                              <div className="space-y-2">
                                <div className={`flex items-center justify-between p-2 rounded ${match.winnerId === match.player1?.userId ? 'bg-teal-500/20 border border-teal-500/30' : 'bg-slate-800/50'}`}>
                                  <span className="text-white text-sm">
                                    {match.player1?.displayName || 'TBD'}
                                  </span>
                                  {match.status === 'scheduled' && match.player1 && match.player2 && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleSetMatchWinner(match.id, match.player1!.userId)}
                                      className="h-6 text-xs"
                                    >
                                      Set Winner
                                    </Button>
                                  )}
                                  {match.winnerId === match.player1?.userId && (
                                    <CheckCircle className="w-4 h-4 text-teal-400" />
                                  )}
                                </div>

                                <div className={`flex items-center justify-between p-2 rounded ${match.winnerId === match.player2?.userId ? 'bg-teal-500/20 border border-teal-500/30' : 'bg-slate-800/50'}`}>
                                  <span className="text-white text-sm">
                                    {match.player2?.displayName || 'TBD'}
                                  </span>
                                  {match.status === 'scheduled' && match.player1 && match.player2 && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleSetMatchWinner(match.id, match.player2!.userId)}
                                      className="h-6 text-xs"
                                    >
                                      Set Winner
                                    </Button>
                                  )}
                                  {match.winnerId === match.player2?.userId && (
                                    <CheckCircle className="w-4 h-4 text-teal-400" />
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="players" className="space-y-6">
            <Card className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 p-4 sm:p-6">
              <h2 className="text-xl font-bold text-white mb-6">Manage Players</h2>

              <div className="space-y-3">
                {tournament.participants.map((participant) => {
                  const isOwner = participant.userId === tournament.createdByUserId;
                  const participantIsAdmin = (participant as any).role === 'admin';

                  return (
                    <div
                      key={participant.userId}
                      className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center text-white font-bold">
                          {participant.displayName[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">{participant.displayName}</span>
                            {isOwner && (
                              <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                Owner
                              </Badge>
                            )}
                            {participantIsAdmin && !isOwner && (
                              <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/30">
                                <Shield className="w-3 h-3 mr-1" />
                                Admin
                              </Badge>
                            )}
                            {participant.status === 'Eliminated' && (
                              <Badge variant="destructive">
                                <Ban className="w-3 h-3 mr-1" />
                                Eliminated
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-slate-400">{participant.status}</div>
                        </div>
                      </div>
                      {!isOwner && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                            onClick={() => {
                              setSelectedParticipant(participant);
                              setShowBanDialog(true);
                            }}
                          >
                            <Ban className="w-3 h-3 mr-1" />
                            Ban
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                            onClick={() => {
                              setSelectedParticipant(participant);
                              setShowKickDialog(true);
                            }}
                          >
                            <UserX className="w-3 h-3 mr-1" />
                            Kick
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="rules" className="space-y-6">
            <Card className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 p-4 sm:p-6">
              <h2 className="text-xl font-bold text-white mb-6">Tournament Rules</h2>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="rules-text" className="text-white">Rules Content</Label>
                  <Textarea
                    id="rules-text"
                    value={rulesText}
                    onChange={(e) => setRulesText(e.target.value)}
                    className="bg-slate-800/50 border-slate-700 text-white mt-2 min-h-[300px]"
                    placeholder="Enter tournament rules and regulations..."
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleSaveRules}
                    className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Rules
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={showBanDialog} onOpenChange={setShowBanDialog}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Ban Participant</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Select the number of rounds this participant will be banned for.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="ban-rounds" className="text-white">Number of Rounds</Label>
            <Select value={banRounds.toString()} onValueChange={(v) => setBanRounds(parseInt(v))}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="1">1 round</SelectItem>
                <SelectItem value="2">2 rounds</SelectItem>
                <SelectItem value="3">3 rounds</SelectItem>
                <SelectItem value="999">From this tournament</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBanParticipant}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Ban Participant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showKickDialog} onOpenChange={setShowKickDialog}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Kick Participant</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to remove this participant from the tournament? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleKickParticipant}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Kick Participant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Regenerate Bracket</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              This will clear the current bracket and all match data. This action cannot be undone. Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRegenerateBracket}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Regenerate Bracket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
