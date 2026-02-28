"use client";

import { useParams, useRouter } from 'next/navigation';
import { useLeagues, League } from '@/lib/context/LeaguesContext';
import { useState, useEffect } from 'react';
import { ArrowLeft, Settings, Calendar, Users, Save, X, Ban, UserX, Shield, ShieldCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

type TabType = 'settings' | 'fixtures' | 'players';

export default function ManageLeaguePage() {
  const params = useParams();
  const router = useRouter();
  const { getLeague, isOwnerOrAdmin, dispatch } = useLeagues();
  const leagueId = params.leagueId as string;
  const league = getLeague(leagueId);
  const isAdmin = league ? isOwnerOrAdmin(leagueId) : false;

  const [activeTab, setActiveTab] = useState<TabType>('settings');
  const [leagueSettings, setLeagueSettings] = useState<Partial<League> | null>(null);
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [showKickDialog, setShowKickDialog] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [banGames, setBanGames] = useState<number>(1);

  useEffect(() => {
    if (league) {
      setLeagueSettings({
        name: league.name,
        matchDays: league.matchDays,
        matchTime: league.matchTime,
        legsPerGame: league.legsPerGame,
        gamesPerDay: league.gamesPerDay,
        cameraRequired: league.cameraRequired,
        playoffs: league.playoffs,
        access: league.access,
        maxParticipants: league.maxParticipants,
      });
    }
  }, [league]);

  if (!league) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 flex items-center justify-center">
        <Card className="bg-slate-900/80 backdrop-blur-xl border border-red-500/20 p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-white mb-2">League Not Found</h1>
          <p className="text-slate-400 mb-6">
            The league you're looking for doesn't exist.
          </p>
          <Button
            onClick={() => router.push('/app/leagues')}
            className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Leagues
          </Button>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 flex items-center justify-center">
        <Card className="bg-slate-900/80 backdrop-blur-xl border border-red-500/20 p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400 mb-6">
            You don't have permission to manage this league. Only league owners and admins can access this page.
          </p>
          <Button
            onClick={() => router.push(`/app/leagues/${leagueId}`)}
            className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to League
          </Button>
        </Card>
      </div>
    );
  }

  const handleSaveSettings = () => {
    if (!leagueSettings) return;

    dispatch({
      type: 'UPDATE_LEAGUE',
      payload: {
        id: leagueId,
        updates: leagueSettings,
      },
    });

    toast.success('League settings updated successfully');
  };

  const handleBanPlayer = () => {
    if (!selectedPlayerId) return;

    dispatch({
      type: 'UPDATE_PLAYER',
      payload: {
        leagueId,
        playerId: selectedPlayerId,
        updates: {
          status: 'Banned',
        },
      },
    });

    setShowBanDialog(false);
    setSelectedPlayerId(null);
    toast.success(`Player banned for ${banGames} game${banGames > 1 ? 's' : ''}`);
  };

  const handleKickPlayer = () => {
    if (!selectedPlayerId) return;

    dispatch({
      type: 'REMOVE_PLAYER',
      payload: {
        leagueId,
        playerId: selectedPlayerId,
      },
    });

    setShowKickDialog(false);
    setSelectedPlayerId(null);
    toast.success('Player kicked from league');
  };

  const handleUpdateFixture = (matchId: string, updates: any) => {
    dispatch({
      type: 'UPDATE_FIXTURE',
      payload: {
        leagueId,
        matchId,
        updates,
      },
    });

    toast.success('Fixture updated successfully');
  };

  const isOwner = league.players.find(p => p.role === 'Owner')?.id === league.players[0]?.id;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <button
          onClick={() => router.push(`/app/leagues/${leagueId}`)}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to League
        </button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Manage League</h1>
          <p className="text-slate-400">{league.name}</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="space-y-6">
          <TabsList className="bg-slate-900/50 border border-slate-800/50">
            <TabsTrigger value="settings" className="data-[state=active]:bg-teal-600">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="fixtures" className="data-[state=active]:bg-teal-600">
              <Calendar className="w-4 h-4 mr-2" />
              Fixtures
            </TabsTrigger>
            <TabsTrigger value="players" className="data-[state=active]:bg-teal-600">
              <Users className="w-4 h-4 mr-2" />
              Players
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-6">
            <Card className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 p-4 sm:p-6">
              <h2 className="text-xl font-bold text-white mb-6">League Settings</h2>

              <div className="space-y-6">
                <div>
                  <Label htmlFor="league-name" className="text-white">League Name</Label>
                  <Input
                    id="league-name"
                    value={leagueSettings?.name || ''}
                    onChange={(e) => setLeagueSettings(prev => ({ ...prev, name: e.target.value }))}
                    className="bg-slate-800/50 border-slate-700 text-white mt-2"
                  />
                </div>

                <div>
                  <Label className="text-white">Match Days</Label>
                  <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mt-2">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                      <button
                        key={day}
                        onClick={() => {
                          const currentDays = leagueSettings?.matchDays || [];
                          const newDays = currentDays.includes(day)
                            ? currentDays.filter(d => d !== day)
                            : [...currentDays, day];
                          setLeagueSettings(prev => ({ ...prev, matchDays: newDays }));
                        }}
                        className={`p-2 rounded text-xs font-medium transition-colors ${
                          leagueSettings?.matchDays?.includes(day)
                            ? 'bg-teal-600 text-white'
                            : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="match-time" className="text-white">Match Time</Label>
                  <Input
                    id="match-time"
                    type="time"
                    value={leagueSettings?.matchTime || ''}
                    onChange={(e) => setLeagueSettings(prev => ({ ...prev, matchTime: e.target.value }))}
                    className="bg-slate-800/50 border-slate-700 text-white mt-2"
                  />
                </div>

                <div>
                  <Label htmlFor="camera-required" className="text-white">Camera Requirement</Label>
                  <Select
                    value={leagueSettings?.cameraRequired ? 'required' : 'optional'}
                    onValueChange={(value) => setLeagueSettings(prev => ({
                      ...prev,
                      cameraRequired: value === 'required'
                    }))}
                  >
                    <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      <SelectItem value="optional">Optional</SelectItem>
                      <SelectItem value="required">Required</SelectItem>
                      <SelectItem value="off">Off</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="legs-per-game" className="text-white">Legs per Match</Label>
                  <Select
                    value={leagueSettings?.legsPerGame?.toString() || '5'}
                    onValueChange={(value) => setLeagueSettings(prev => ({
                      ...prev,
                      legsPerGame: parseInt(value)
                    }))}
                  >
                    <SelectTrigger className="bg-slate-800/50 border-slate-700 text-white mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-700">
                      <SelectItem value="3">Best of 3</SelectItem>
                      <SelectItem value="5">Best of 5</SelectItem>
                      <SelectItem value="7">Best of 7</SelectItem>
                      <SelectItem value="9">Best of 9</SelectItem>
                      <SelectItem value="11">Best of 11</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="playoffs-enabled" className="text-white">Enable Playoffs</Label>
                    <p className="text-sm text-slate-400 mt-1">Top players compete in knockout format</p>
                  </div>
                  <Switch
                    id="playoffs-enabled"
                    checked={leagueSettings?.playoffs || false}
                    onCheckedChange={(checked) => setLeagueSettings(prev => ({
                      ...prev,
                      playoffs: checked
                    }))}
                  />
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
                    onClick={() => router.push(`/app/leagues/${leagueId}`)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="fixtures" className="space-y-6">
            <Card className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 p-4 sm:p-6">
              <h2 className="text-xl font-bold text-white mb-6">Manage Fixtures</h2>

              <div className="space-y-4">
                {league.fixtures.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No fixtures scheduled yet</p>
                  </div>
                ) : (
                  league.fixtures.map((fixture) => {
                    const homePlayer = league.players.find(p => p.id === fixture.homePlayerId);
                    const awayPlayer = league.players.find(p => p.id === fixture.awayPlayerId);

                    return (
                      <div
                        key={fixture.matchId}
                        className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 text-white font-medium mb-2">
                              <span>{homePlayer?.displayName || 'Unknown'}</span>
                              <span className="text-slate-500">vs</span>
                              <span>{awayPlayer?.displayName || 'Unknown'}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-slate-400">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {fixture.dateTime.toLocaleDateString()}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {fixture.dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <Badge variant={fixture.status === 'Completed' ? 'default' : 'secondary'}>
                                {fixture.status}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-slate-700 text-slate-300"
                              onClick={() => {
                                const newDate = prompt('Enter new date (YYYY-MM-DD):');
                                const newTime = prompt('Enter new time (HH:MM):');
                                if (newDate && newTime) {
                                  handleUpdateFixture(fixture.matchId, {
                                    dateTime: new Date(`${newDate}T${newTime}`),
                                    status: 'Scheduled',
                                  });
                                }
                              }}
                            >
                              Reschedule
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="players" className="space-y-6">
            <Card className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/50 p-4 sm:p-6">
              <h2 className="text-xl font-bold text-white mb-6">Manage Players</h2>

              <div className="space-y-3">
                {league.players.map((player) => (
                  <div
                    key={player.id}
                    className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/30 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center text-white font-bold">
                        {player.displayName[0]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{player.displayName}</span>
                          {player.role === 'Owner' && (
                            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                              <ShieldCheck className="w-3 h-3 mr-1" />
                              Owner
                            </Badge>
                          )}
                          {player.role === 'Admin' && (
                            <Badge className="bg-teal-500/20 text-teal-400 border-teal-500/30">
                              <Shield className="w-3 h-3 mr-1" />
                              Admin
                            </Badge>
                          )}
                          {player.status === 'Banned' && (
                            <Badge variant="destructive">
                              <Ban className="w-3 h-3 mr-1" />
                              Banned
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-slate-400">Member</div>
                      </div>
                    </div>
                    {player.role !== 'Owner' && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10"
                          onClick={() => {
                            setSelectedPlayerId(player.id);
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
                            setSelectedPlayerId(player.id);
                            setShowKickDialog(true);
                          }}
                        >
                          <UserX className="w-3 h-3 mr-1" />
                          Kick
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={showBanDialog} onOpenChange={setShowBanDialog}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Ban Player</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Select the number of games this player will be banned for.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="ban-games" className="text-white">Number of Games</Label>
            <Select value={banGames.toString()} onValueChange={(v) => setBanGames(parseInt(v))}>
              <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="1">1 game</SelectItem>
                <SelectItem value="2">2 games</SelectItem>
                <SelectItem value="3">3 games</SelectItem>
                <SelectItem value="5">5 games</SelectItem>
                <SelectItem value="10">10 games</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBanPlayer}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              Ban Player
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showKickDialog} onOpenChange={setShowKickDialog}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Kick Player</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to kick this player from the league? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleKickPlayer}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Kick Player
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
