'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  UserPlus,
  Monitor,
  Copy,
  Check,
  Link as LinkIcon,
  Target,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

interface PrivateMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrivateMatchModal({ isOpen, onClose }: PrivateMatchModalProps) {
  const router = useRouter();
  const supabase = createClient();

  const [gameMode, setGameMode] = useState('501');
  const [matchFormat, setMatchFormat] = useState('best-of-3');
  const [doubleOut, setDoubleOut] = useState(true);
  const [straightIn, setStraightIn] = useState(true);
  const [username, setUsername] = useState('');
  const [opponentName, setOpponentName] = useState('');
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);

  const [atcStartNumber, setAtcStartNumber] = useState(1);
  const [atcEndNumber, setAtcEndNumber] = useState(20);
  const [atcIncludeBull, setAtcIncludeBull] = useState(false);
  const [atcIncreaseBySegment, setAtcIncreaseBySegment] = useState(true);
  const [atcOvershootHandling, setAtcOvershootHandling] = useState('cap');

  const [inviteLink, setInviteLink] = useState('');

  const handleCopyLink = async () => {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success('Invite link copied!');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreateOnlineMatch = async () => {
    if (gameMode === 'Around the Clock') {
      toast.error('Online matches only support 301 and 501');
      return;
    }

    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to create an online match');
        router.push('/login');
        return;
      }

      const bestOf = matchFormat === 'best-of-1' ? 1 : matchFormat === 'best-of-3' ? 3 : 5;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-online-match`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            gameMode,
            bestOf,
            doubleOut,
            straightIn,
          }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        const link = `${window.location.origin}/app/play/private/join?code=${result.match.inviteCode}`;
        setInviteLink(link);
        toast.success('Match created!');
        onClose();
        router.push(`/app/play/private/lobby/${result.match.id}`);
      } else {
        toast.error(result.error || 'Failed to create match');
      }
    } catch (error) {
      console.error('Error creating match:', error);
      toast.error('Failed to create match');
    } finally {
      setCreating(false);
    }
  };

  const handleStartLocalMatch = () => {
    if (!opponentName.trim()) {
      toast.error('Please enter opponent name');
      return;
    }

    const matchId = `local-${Date.now()}`;
    const matchConfig: any = {
      gameMode,
      bestOf: matchFormat,
      matchFormat,
      matchType: 'private',
      opponentName,
      player1Name: opponentName,
      player2Name: 'Opponent',
    };

    if (gameMode === 'Around the Clock') {
      matchConfig.atcSettings = {
        startNumber: atcStartNumber,
        endNumber: atcEndNumber,
        includeBull: atcIncludeBull,
        increaseBySegment: atcIncreaseBySegment,
        overshootHandling: atcOvershootHandling,
      };
    } else {
      matchConfig.doubleOut = doubleOut;
      matchConfig.straightIn = straightIn;
    }

    localStorage.setItem(`match-${matchId}`, JSON.stringify(matchConfig));

    onClose();
    router.push(`/app/match/local/${matchId}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Create Private Match</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="invite" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-white/5">
            <TabsTrigger
              value="invite"
              className="data-[state=active]:bg-emerald-500 data-[state=active]:text-white"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Friend
            </TabsTrigger>
            <TabsTrigger
              value="local"
              className="data-[state=active]:bg-blue-500 data-[state=active]:text-white"
            >
              <Monitor className="w-4 h-4 mr-2" />
              Local Play
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invite" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Game Mode</Label>
                <Select value={gameMode} onValueChange={setGameMode}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10">
                    <SelectItem value="301">301</SelectItem>
                    <SelectItem value="501">501</SelectItem>
                    <SelectItem value="Around the Clock">Around the Clock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Match Format</Label>
                <Select value={matchFormat} onValueChange={setMatchFormat}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10">
                    <SelectItem value="best-of-1">Best of 1</SelectItem>
                    <SelectItem value="best-of-3">Best of 3</SelectItem>
                    <SelectItem value="best-of-5">Best of 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {gameMode !== 'Around the Clock' ? (
                <>
                  <div className="flex items-center justify-between py-2">
                    <Label className="text-gray-300">Double Out</Label>
                    <Switch checked={doubleOut} onCheckedChange={setDoubleOut} />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <Label className="text-gray-300">Straight In</Label>
                    <Switch checked={straightIn} onCheckedChange={setStraightIn} />
                  </div>
                </>
              ) : (
                <>
                  <div className="border-t border-white/10 pt-4 mt-2">
                    <h3 className="text-sm font-semibold text-white mb-4">Around the Clock Settings</h3>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-gray-300 text-xs">Start Number</Label>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={atcStartNumber}
                            onChange={(e) => setAtcStartNumber(parseInt(e.target.value) || 1)}
                            className="bg-white/5 border-white/10 text-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-gray-300 text-xs">End Number</Label>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={atcEndNumber}
                            onChange={(e) => setAtcEndNumber(parseInt(e.target.value) || 20)}
                            className="bg-white/5 border-white/10 text-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <Label className="text-gray-300 text-sm">Include Bull</Label>
                        <Switch checked={atcIncludeBull} onCheckedChange={setAtcIncludeBull} />
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <Label className="text-gray-300 text-sm">Increase by Segment</Label>
                        <Switch checked={atcIncreaseBySegment} onCheckedChange={setAtcIncreaseBySegment} />
                      </div>
                      <p className="text-xs text-gray-500">
                        {atcIncreaseBySegment ? 'Single +1, Double +2, Treble +3' : 'Any hit +1'}
                      </p>

                      <div className="space-y-2">
                        <Label className="text-gray-300 text-sm">Overshoot Handling</Label>
                        <Select value={atcOvershootHandling} onValueChange={setAtcOvershootHandling}>
                          <SelectTrigger className="bg-white/5 border-white/10 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-white/10">
                            <SelectItem value="cap">Cap at End</SelectItem>
                            <SelectItem value="exact">Exact Finish Required</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-white/10 pt-6">
              <Label className="text-gray-300 mb-3 block">Invite by Username</Label>
              <div className="flex space-x-2">
                <Input
                  placeholder="Enter username..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                />
                <Button className="bg-emerald-500 hover:bg-emerald-600 text-white">
                  Send Invite
                </Button>
              </div>
            </div>

            <div className="border-t border-white/10 pt-6">
              <Label className="text-gray-300 mb-3 block">Share Invite Link</Label>
              <Card className="bg-white/5 border-white/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 mr-4">
                    <LinkIcon className="w-5 h-5 text-emerald-400" />
                    <code className="text-sm text-gray-300 truncate">{inviteLink}</code>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleCopyLink}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </div>

            <Button
              onClick={handleCreateOnlineMatch}
              disabled={creating}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white"
              size="lg"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Match...
                </>
              ) : (
                'Create Online Match'
              )}
            </Button>
          </TabsContent>

          <TabsContent value="local" className="space-y-6 mt-6">
            <Card className="bg-white/5 border-white/10 p-6">
              <div className="flex items-start space-x-4 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                  <Monitor className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Local Play Mode</h3>
                  <p className="text-gray-400 text-sm">
                    Play with someone in-person using the same device. Perfect for practice or
                    casual matches. Stats will be tracked for both players.
                  </p>
                </div>
              </div>
            </Card>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Game Mode</Label>
                <Select value={gameMode} onValueChange={setGameMode}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10">
                    <SelectItem value="301">301</SelectItem>
                    <SelectItem value="501">501</SelectItem>
                    <SelectItem value="Around the Clock">Around the Clock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Match Format</Label>
                <Select value={matchFormat} onValueChange={setMatchFormat}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10">
                    <SelectItem value="best-of-1">Best of 1</SelectItem>
                    <SelectItem value="best-of-3">Best of 3</SelectItem>
                    <SelectItem value="best-of-5">Best of 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {gameMode !== 'Around the Clock' ? (
                <>
                  <div className="flex items-center justify-between py-2">
                    <Label className="text-gray-300">Double Out</Label>
                    <Switch checked={doubleOut} onCheckedChange={setDoubleOut} />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <Label className="text-gray-300">Straight In</Label>
                    <Switch checked={straightIn} onCheckedChange={setStraightIn} />
                  </div>
                </>
              ) : (
                <>
                  <div className="border-t border-white/10 pt-4 mt-2">
                    <h3 className="text-sm font-semibold text-white mb-4">Around the Clock Settings</h3>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-gray-300 text-xs">Start Number</Label>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={atcStartNumber}
                            onChange={(e) => setAtcStartNumber(parseInt(e.target.value) || 1)}
                            className="bg-white/5 border-white/10 text-white"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-gray-300 text-xs">End Number</Label>
                          <Input
                            type="number"
                            min="1"
                            max="20"
                            value={atcEndNumber}
                            onChange={(e) => setAtcEndNumber(parseInt(e.target.value) || 20)}
                            className="bg-white/5 border-white/10 text-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <Label className="text-gray-300 text-sm">Include Bull</Label>
                        <Switch checked={atcIncludeBull} onCheckedChange={setAtcIncludeBull} />
                      </div>

                      <div className="flex items-center justify-between py-2">
                        <Label className="text-gray-300 text-sm">Increase by Segment</Label>
                        <Switch checked={atcIncreaseBySegment} onCheckedChange={setAtcIncreaseBySegment} />
                      </div>
                      <p className="text-xs text-gray-500">
                        {atcIncreaseBySegment ? 'Single +1, Double +2, Treble +3' : 'Any hit +1'}
                      </p>

                      <div className="space-y-2">
                        <Label className="text-gray-300 text-sm">Overshoot Handling</Label>
                        <Select value={atcOvershootHandling} onValueChange={setAtcOvershootHandling}>
                          <SelectTrigger className="bg-white/5 border-white/10 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-white/10">
                            <SelectItem value="cap">Cap at End</SelectItem>
                            <SelectItem value="exact">Exact Finish Required</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label className="text-gray-300">Opponent Name</Label>
                <Input
                  placeholder="Enter opponent's name..."
                  value={opponentName}
                  onChange={(e) => setOpponentName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                />
              </div>
            </div>

            <Button
              onClick={handleStartLocalMatch}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:opacity-90 text-white"
              size="lg"
            >
              <Target className="w-5 h-5 mr-2" />
              Start Local Match
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
