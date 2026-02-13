'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Target, Undo2, Trophy, Home, Bot, History } from 'lucide-react';

const TARGETS = Array.from({ length: 20 }, (_, i) => i + 1).concat(['BULL'] as any);

interface DartHit {
  label: string;
  valueAdvance: 0 | 1 | 2 | 3;
}

interface PlayerState {
  name: string;
  targetIndex: number;
  dartsThisVisit: DartHit[];
  visits: number;
  dartsThrown: number;
  history: Array<{
    targetIndex: number;
    dartsThisVisit: DartHit[];
    visits: number;
    dartsThrown: number;
  }>;
}

export type ATCPlayer = { id: string; name: string };

export type DartBotConfig = {
  enabled: boolean;
  levelAvg: number;
  name?: string;
};

export interface AroundTheClockMatchProps {
  players: [ATCPlayer, ATCPlayer];
  startingTurn?: 'p1' | 'p2';
  onEndMatch?: (winnerId: string) => void;
  context?: 'LOCAL' | 'PRIVATE' | 'TRAINING';
  dartBot?: DartBotConfig;
}

export function AroundTheClockMatch({
  players,
  startingTurn = 'p1',
  onEndMatch,
  context = 'LOCAL',
  dartBot,
}: AroundTheClockMatchProps) {
  const router = useRouter();

  const [currentTurn, setCurrentTurn] = useState<'p1' | 'p2'>(startingTurn);
  const [playerStates, setPlayerStates] = useState<{ p1: PlayerState; p2: PlayerState }>({
    p1: {
      name: players[0].name,
      targetIndex: 0,
      dartsThisVisit: [],
      visits: 0,
      dartsThrown: 0,
      history: [],
    },
    p2: {
      name: dartBot?.enabled && dartBot.name ? dartBot.name : players[1].name,
      targetIndex: 0,
      dartsThisVisit: [],
      visits: 0,
      dartsThrown: 0,
      history: [],
    },
  });

  const [winner, setWinner] = useState<'p1' | 'p2' | null>(null);
  const [showMatchComplete, setShowMatchComplete] = useState(false);
  const [showEndMatchDialog, setShowEndMatchDialog] = useState(false);
  const [botThinking, setBotThinking] = useState(false);

  const botRunIdRef = useRef(0);
  const botTimerRef = useRef<number | null>(null);
  const botFailSafeRef = useRef<number | null>(null);
  const isUnmountedRef = useRef(false);
  const botTurnRunningRef = useRef(false);
  const botWatchdogRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      isUnmountedRef.current = true;
      if (botTimerRef.current) window.clearTimeout(botTimerRef.current);
      if (botFailSafeRef.current) window.clearTimeout(botFailSafeRef.current);
      if (botWatchdogRef.current) window.clearTimeout(botWatchdogRef.current);
    };
  }, []);

  const getTargetLabel = (targetIndex: number): string | number => {
    if (targetIndex >= TARGETS.length - 1) return 'BULL';
    return TARGETS[targetIndex];
  };

  const handleDart = (hitType: 'S' | 'D' | 'T' | 'MISS') => {
    if (winner) return;

    const currentPlayer = playerStates[currentTurn];
    if (currentPlayer.dartsThisVisit.length >= 3) return;

    const currentTarget = getTargetLabel(currentPlayer.targetIndex);
    let label: string;
    let valueAdvance: 0 | 1 | 2 | 3;

    if (currentTarget === 'BULL') {
      if (hitType === 'S' || hitType === 'D') {
        label = 'BULL';
        valueAdvance = 1;
      } else if (hitType === 'MISS') {
        label = 'MISS';
        valueAdvance = 0;
      } else {
        return;
      }
    } else {
      if (hitType === 'S') {
        label = `S${currentTarget}`;
        valueAdvance = 1;
      } else if (hitType === 'D') {
        label = `D${currentTarget}`;
        valueAdvance = 2;
      } else if (hitType === 'T') {
        label = `T${currentTarget}`;
        valueAdvance = 3;
      } else {
        label = 'MISS';
        valueAdvance = 0;
      }
    }

    setPlayerStates(prev => {
      const updated = { ...prev };
      const player = { ...updated[currentTurn] };

      player.history.push({
        targetIndex: player.targetIndex,
        dartsThisVisit: [...player.dartsThisVisit],
        visits: player.visits,
        dartsThrown: player.dartsThrown,
      });

      const newDart: DartHit = { label, valueAdvance };
      player.dartsThisVisit = [...player.dartsThisVisit, newDart];
      player.dartsThrown += 1;

      const nextIndex = Math.min(
        player.targetIndex + valueAdvance,
        TARGETS.length - 1
      );
      player.targetIndex = nextIndex;

      if (nextIndex === TARGETS.length - 1 && valueAdvance > 0) {
        setWinner(currentTurn);
        setShowMatchComplete(true);
        if (onEndMatch) {
          onEndMatch(players[currentTurn === 'p1' ? 0 : 1].id);
        }
      }

      if (player.dartsThisVisit.length === 3) {
        player.visits += 1;
        player.dartsThisVisit = [];
        setCurrentTurn(currentTurn === 'p1' ? 'p2' : 'p1');
      }

      updated[currentTurn] = player;
      return updated;
    });
  };

  const handleUndo = () => {
    if (winner || botThinking) return;

    setPlayerStates(prev => {
      const updated = { ...prev };
      const player = { ...updated[currentTurn] };

      if (player.history.length === 0) return prev;

      const lastState = player.history.pop()!;
      player.targetIndex = lastState.targetIndex;
      player.dartsThisVisit = lastState.dartsThisVisit;
      player.visits = lastState.visits;
      player.dartsThrown = lastState.dartsThrown;

      updated[currentTurn] = player;
      return updated;
    });
  };

  const clearBotTimers = useCallback(() => {
    if (botTimerRef.current) window.clearTimeout(botTimerRef.current);
    if (botFailSafeRef.current) window.clearTimeout(botFailSafeRef.current);
    botTimerRef.current = null;
    botFailSafeRef.current = null;
  }, []);

  const sleep = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      botTimerRef.current = window.setTimeout(() => resolve(), ms);
    });
  }, []);

  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));

  const getBotOutcomeChances = useCallback((level: number) => {
    const t = clamp((level - 25) / (85 - 25), 0, 1);

    const miss = 0.38 - (0.28 * t);
    const treble = 0.05 + (0.18 * t);
    const dbl = 0.12 + (0.20 * t);
    const single = Math.max(0, 1 - (miss + dbl + treble));

    return { miss, single, dbl, treble };
  }, []);

  const pickBotHitForTarget = useCallback((targetLabel: string | number, level: number) => {
    const { miss, single, dbl, treble } = getBotOutcomeChances(level);
    const r = Math.random();

    if (r < miss) {
      return { label: 'MISS', advance: 0 as const };
    }

    if (targetLabel === 'BULL') {
      if (r < miss + single + dbl + treble) {
        return { label: 'BULL', advance: 1 as const };
      }
      return { label: 'MISS', advance: 0 as const };
    }

    if (r < miss + treble) {
      return { label: `T${targetLabel}`, advance: 3 as const };
    }

    if (r < miss + treble + dbl) {
      return { label: `D${targetLabel}`, advance: 2 as const };
    }

    return { label: `S${targetLabel}`, advance: 1 as const };
  }, [getBotOutcomeChances]);

  const runBotTurn = useCallback(async () => {
    const stillBotTurn = (): boolean => {
      let ok = false;
      setCurrentTurn(prev => {
        ok = prev === 'p2';
        return prev;
      });
      setWinner(prev => {
        if (prev) ok = false;
        return prev;
      });
      return ok;
    };

    if (!dartBot?.enabled) return;

    if (!stillBotTurn()) return;

    clearBotTimers();

    try {
      let botHasWon = false;

      for (let dart = 0; dart < 3; dart++) {
        if (isUnmountedRef.current) return;
        if (botHasWon) break;

        if (!stillBotTurn()) return;

        const delay = 450 + Math.floor(Math.random() * 450);
        await sleep(delay);

        if (isUnmountedRef.current) return;
        if (!stillBotTurn()) return;

        setPlayerStates(prev => {
          const updated = { ...prev };
          const player = { ...updated.p2 };

          const currentTarget = getTargetLabel(player.targetIndex);
          const hit = pickBotHitForTarget(currentTarget, dartBot.levelAvg);

          player.history.push({
            targetIndex: player.targetIndex,
            dartsThisVisit: [...player.dartsThisVisit],
            visits: player.visits,
            dartsThrown: player.dartsThrown,
          });

          const newDart: DartHit = { label: hit.label, valueAdvance: hit.advance };
          player.dartsThisVisit = [...player.dartsThisVisit, newDart];
          player.dartsThrown += 1;

          const nextIndex = Math.min(
            player.targetIndex + hit.advance,
            TARGETS.length - 1
          );
          player.targetIndex = nextIndex;

          if (nextIndex === TARGETS.length - 1 && hit.advance > 0) {
            setWinner('p2');
            setShowMatchComplete(true);
            botHasWon = true;
            if (onEndMatch) {
              onEndMatch(players[1].id);
            }
          }

          updated.p2 = player;
          return updated;
        });
      }

      if (!botHasWon && stillBotTurn()) {
        setPlayerStates(prev => {
          if (winner) return prev;
          if (currentTurn !== 'p2') return prev;

          const updated = { ...prev };
          const player = { ...updated.p2 };

          if (player.dartsThisVisit.length > 0) {
            player.visits += 1;
            player.dartsThisVisit = [];
          }

          updated.p2 = player;
          return updated;
        });
        setCurrentTurn('p1');
      }
    } finally {
      if (!isUnmountedRef.current) {
        clearBotTimers();
      }
    }
  }, [dartBot?.enabled, dartBot?.levelAvg, currentTurn, winner, clearBotTimers, sleep, pickBotHitForTarget, onEndMatch, players]);

  useEffect(() => {
    const isBotTurn = currentTurn === 'p2';

    if (!dartBot?.enabled) return;
    if (winner) return;

    if (!isBotTurn) {
      botTurnRunningRef.current = false;
      if (botWatchdogRef.current) window.clearTimeout(botWatchdogRef.current);
      return;
    }

    if (botTurnRunningRef.current) return;

    botTurnRunningRef.current = true;
    setBotThinking(true);

    if (botWatchdogRef.current) window.clearTimeout(botWatchdogRef.current);
    botWatchdogRef.current = window.setTimeout(() => {
      if (isUnmountedRef.current) return;
      console.warn('[ATC] Bot watchdog fired – unsticking bot.');
      setBotThinking(false);
      botTurnRunningRef.current = false;
    }, 3500);

    (async () => {
      try {
        await runBotTurn();
      } catch (e) {
        console.error('[ATC] runBotTurn crashed:', e);
      } finally {
        if (!isUnmountedRef.current) {
          setBotThinking(false);
          botTurnRunningRef.current = false;
          if (botWatchdogRef.current) window.clearTimeout(botWatchdogRef.current);
        }
      }
    })();
  }, [currentTurn, dartBot?.enabled, winner, runBotTurn]);

  const handleRematch = () => {
    botRunIdRef.current++;
    clearBotTimers();
    if (botWatchdogRef.current) window.clearTimeout(botWatchdogRef.current);
    botTurnRunningRef.current = false;
    setBotThinking(false);
    setPlayerStates({
      p1: {
        name: players[0].name,
        targetIndex: 0,
        dartsThisVisit: [],
        visits: 0,
        dartsThrown: 0,
        history: [],
      },
      p2: {
        name: dartBot?.enabled && dartBot.name ? dartBot.name : players[1].name,
        targetIndex: 0,
        dartsThisVisit: [],
        visits: 0,
        dartsThrown: 0,
        history: [],
      },
    });
    setCurrentTurn('p1');
    setWinner(null);
    setShowMatchComplete(false);
  };

  const handleEndMatch = () => {
    botRunIdRef.current++;
    clearBotTimers();
    if (botWatchdogRef.current) window.clearTimeout(botWatchdogRef.current);
    botTurnRunningRef.current = false;
    setShowEndMatchDialog(false);
    router.push('/app/play');
  };

  const currentPlayer = playerStates[currentTurn];
  const currentTarget = getTargetLabel(currentPlayer.targetIndex);

  // Build visit history for display
  const buildVisitHistory = (player: PlayerState) => {
    const history = [];
    let visitIndex = 0;
    for (let i = 0; i < player.history.length; i++) {
      const state = player.history[i];
      if (state.dartsThisVisit.length === 3 || (i === player.history.length - 1 && player.dartsThisVisit.length < 3)) {
        const darts = state.dartsThisVisit;
        const totalAdvance = darts.reduce((sum, d) => sum + d.valueAdvance, 0);
        history.push({
          visitNumber: visitIndex + 1,
          darts,
          totalAdvance,
          target: TARGETS[state.targetIndex],
        });
        visitIndex++;
      }
    }
    // Add current incomplete visit
    if (player.dartsThisVisit.length > 0 && player.dartsThisVisit.length < 3) {
      const totalAdvance = player.dartsThisVisit.reduce((sum, d) => sum + d.valueAdvance, 0);
      history.push({
        visitNumber: visitIndex + 1,
        darts: player.dartsThisVisit,
        totalAdvance,
        target: TARGETS[player.targetIndex - player.dartsThisVisit.reduce((sum, d) => sum + d.valueAdvance, 0)],
        current: true,
      });
    }
    return history.slice(-10).reverse(); // Show last 10 visits
  };

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex-none px-4 py-3 bg-slate-900/80 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Target className="w-6 h-6 text-emerald-400" />
            <span className="text-lg font-bold text-white">
              AROUND<span className="text-emerald-400">THE CLOCK</span>
            </span>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
              {context}
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEndMatchDialog(true)}
            className="border-white/10 text-white hover:bg-white/5"
          >
            <Home className="w-4 h-4 mr-2" />
            End Match
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Left Side - Game Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Player Cards */}
          <div className="flex-none grid grid-cols-2 gap-2 p-3">
            {(['p1', 'p2'] as const).map((playerId, idx) => {
              const player = playerStates[playerId];
              const isCurrentPlayer = currentTurn === playerId;
              const progress = (player.targetIndex / (TARGETS.length - 1)) * 100;

              return (
                <Card
                  key={playerId}
                  className={`bg-slate-900/50 backdrop-blur-sm border-2 transition-all ${
                    isCurrentPlayer
                      ? 'border-emerald-500 shadow-lg shadow-emerald-500/20'
                      : 'border-white/10'
                  }`}
                >
                  <div className="p-3">
                    <div className="flex items-center space-x-2 mb-2">
                      <Avatar className="w-10 h-10 border-2 border-emerald-500/30">
                        <AvatarFallback className="bg-gradient-to-br from-emerald-500 to-teal-500 text-white font-bold text-sm">
                          {player.name.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <h3 className="text-sm font-bold text-white truncate">{player.name}</h3>
                          {isCurrentPlayer && (
                            <Badge className="bg-emerald-500 text-white text-xs px-1.5 py-0">
                              Turn
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          {player.visits} visits • {player.dartsThrown} darts
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">Target</span>
                        <span className="text-xl font-bold text-emerald-400">
                          {getTargetLabel(player.targetIndex)}
                        </span>
                      </div>
                      <Progress value={progress} className="h-1.5" />

                      <div className="flex items-center space-x-1">
                        {[0, 1, 2].map(i => (
                          <div
                            key={i}
                            className={`flex-1 h-8 rounded border-2 flex items-center justify-center text-xs font-bold ${
                              player.dartsThisVisit[i]
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                : 'border-dashed border-white/10 text-gray-600'
                            }`}
                          >
                            {player.dartsThisVisit[i]?.label || '—'}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Score Buttons Area */}
          <div className="flex-1 flex flex-col justify-center px-4 pb-4 min-h-0">
            {botThinking && (
              <Card className="flex-none bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-500/30 p-3 mb-4">
                <div className="flex items-center justify-center space-x-2">
                  <Bot className="w-5 h-5 text-blue-400 animate-pulse" />
                  <span className="text-blue-400 font-semibold text-sm">
                    {dartBot?.name || 'DartBot'} is thinking...
                  </span>
                </div>
              </Card>
            )}

            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold text-white mb-1">
                Target: <span className="text-emerald-400">{currentTarget}</span>
              </h2>
              <p className="text-sm text-gray-400">
                {botThinking
                  ? 'Bot is throwing...'
                  : currentPlayer.dartsThisVisit.length === 0
                  ? 'Select your dart'
                  : `${3 - currentPlayer.dartsThisVisit.length} dart${
                      3 - currentPlayer.dartsThisVisit.length !== 1 ? 's' : ''
                    } remaining`}
              </p>
            </div>

            {currentTarget === 'BULL' ? (
              <div className="flex gap-2 justify-center">
                <Button
                  size="lg"
                  onClick={() => handleDart('S')}
                  disabled={currentPlayer.dartsThisVisit.length >= 3 || !!winner || botThinking}
                  className="h-24 w-40 text-2xl font-bold bg-gradient-to-br from-emerald-500 to-teal-500 hover:opacity-90 text-white disabled:opacity-50 rounded-xl"
                >
                  BULL
                </Button>
                <Button
                  size="lg"
                  onClick={() => handleDart('MISS')}
                  disabled={currentPlayer.dartsThisVisit.length >= 3 || !!winner || botThinking}
                  className="h-24 w-40 text-2xl font-bold bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50 rounded-xl"
                >
                  MISS
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 justify-center flex-wrap">
                <Button
                  size="lg"
                  onClick={() => handleDart('S')}
                  disabled={currentPlayer.dartsThisVisit.length >= 3 || !!winner || botThinking}
                  className="h-24 w-28 text-2xl font-bold bg-gradient-to-br from-emerald-500 to-teal-500 hover:opacity-90 text-white disabled:opacity-50 rounded-xl"
                >
                  S{currentTarget}
                </Button>
                <Button
                  size="lg"
                  onClick={() => handleDart('D')}
                  disabled={currentPlayer.dartsThisVisit.length >= 3 || !!winner || botThinking}
                  className="h-24 w-28 text-2xl font-bold bg-gradient-to-br from-blue-500 to-cyan-500 hover:opacity-90 text-white disabled:opacity-50 rounded-xl"
                >
                  D{currentTarget}
                </Button>
                <Button
                  size="lg"
                  onClick={() => handleDart('T')}
                  disabled={currentPlayer.dartsThisVisit.length >= 3 || !!winner || botThinking}
                  className="h-24 w-28 text-2xl font-bold bg-gradient-to-br from-purple-500 to-pink-500 hover:opacity-90 text-white disabled:opacity-50 rounded-xl"
                >
                  T{currentTarget}
                </Button>
                <Button
                  size="lg"
                  onClick={() => handleDart('MISS')}
                  disabled={currentPlayer.dartsThisVisit.length >= 3 || !!winner || botThinking}
                  className="h-24 w-28 text-2xl font-bold bg-slate-700 hover:bg-slate-600 text-white disabled:opacity-50 rounded-xl"
                >
                  MISS
                </Button>
              </div>
            )}

            <div className="flex justify-center mt-4">
              <Button
                variant="outline"
                onClick={handleUndo}
                disabled={currentPlayer.history.length === 0 || !!winner || botThinking}
                className="border-white/10 text-white hover:bg-white/5"
              >
                <Undo2 className="w-4 h-4 mr-2" />
                Undo
              </Button>
            </div>
          </div>
        </div>

        {/* Right Side - Visit History */}
        <div className="w-72 flex-none bg-slate-900/50 border-l border-white/10 flex flex-col">
          <div className="flex-none p-3 border-b border-white/10">
            <div className="flex items-center space-x-2">
              <History className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold text-white">Visit History</span>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {/* P1 History */}
            <div className="space-y-1">
              <p className="text-xs text-emerald-400 font-semibold px-1">{playerStates.p1.name}</p>
              {buildVisitHistory(playerStates.p1).map((visit, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded text-xs ${
                    visit.current
                      ? 'bg-emerald-500/20 border border-emerald-500/30'
                      : 'bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-400">#{visit.visitNumber}</span>
                    <span className="text-emerald-400 font-bold">+{visit.totalAdvance}</span>
                  </div>
                  <div className="flex gap-1">
                    {visit.darts.map((dart: any, i: number) => (
                      <span
                        key={i}
                        className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                          dart.valueAdvance > 0
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-slate-700 text-gray-500'
                        }`}
                      >
                        {dart.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {buildVisitHistory(playerStates.p1).length === 0 && (
                <p className="text-xs text-gray-500 px-1 italic">No visits yet</p>
              )}
            </div>

            <div className="border-t border-white/10 my-2" />

            {/* P2 History */}
            <div className="space-y-1">
              <p className="text-xs text-blue-400 font-semibold px-1">{playerStates.p2.name}</p>
              {buildVisitHistory(playerStates.p2).map((visit, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded text-xs ${
                    visit.current
                      ? 'bg-blue-500/20 border border-blue-500/30'
                      : 'bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-400">#{visit.visitNumber}</span>
                    <span className="text-blue-400 font-bold">+{visit.totalAdvance}</span>
                  </div>
                  <div className="flex gap-1">
                    {visit.darts.map((dart: any, i: number) => (
                      <span
                        key={i}
                        className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                          dart.valueAdvance > 0
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-slate-700 text-gray-500'
                        }`}
                      >
                        {dart.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {buildVisitHistory(playerStates.p2).length === 0 && (
                <p className="text-xs text-gray-500 px-1 italic">No visits yet</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Match Complete Dialog */}
      <Dialog open={showMatchComplete} onOpenChange={setShowMatchComplete}>
        <DialogContent className="bg-slate-900 border-emerald-500/30">
          <DialogHeader>
            <DialogTitle className="text-center">
              <div className="flex flex-col items-center space-y-4 py-4">
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-full flex items-center justify-center">
                  <Trophy className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-white">
                  {context === 'TRAINING' ? 'Training Complete!' : 'Match Complete!'}
                </h2>
                <p className="text-xl text-emerald-400">
                  {winner ? playerStates[winner].name : ''} completed the clock!
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Card className="bg-slate-800/50 border-white/10 p-4">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-gray-400 text-sm mb-1">Visits</p>
                  <p className="text-2xl font-bold text-white">
                    {winner ? playerStates[winner].visits : 0}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-sm mb-1">Total Darts</p>
                  <p className="text-2xl font-bold text-white">
                    {winner ? playerStates[winner].dartsThrown : 0}
                  </p>
                </div>
              </div>
            </Card>

            <div className="flex space-x-3">
              <Button
                onClick={handleRematch}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white"
              >
                <Trophy className="w-4 h-4 mr-2" />
                Play Again
              </Button>
              <Button
                onClick={() => router.push('/app/play')}
                variant="outline"
                className="flex-1 border-white/10 text-white hover:bg-white/5"
              >
                <Home className="w-4 h-4 mr-2" />
                Back to Play
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* End Match Dialog */}
      <AlertDialog open={showEndMatchDialog} onOpenChange={setShowEndMatchDialog}>
        <AlertDialogContent className="bg-slate-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">End Match?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Your progress will not be saved. Are you sure you want to end this match?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-white/10 text-white hover:bg-slate-700">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEndMatch}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              End Match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertContent>
      </AlertDialog>
    </div>
  );
}
