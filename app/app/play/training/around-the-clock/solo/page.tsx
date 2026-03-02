'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Target, Trophy, ArrowLeft, RotateCcw } from 'lucide-react';
import { awardXP } from '@/lib/training/xpTracker';
import { toast } from 'sonner';

type DartHit = 'S' | 'D' | 'T' | 'MISS';

type SoloATCState = {
  startedAt: number;
  finishedAt?: number;
  currentTarget: number;
  visitIndex: number;
  dartIndex: 0 | 1 | 2;
  dartsThisVisit: (string | null)[];
  totalDarts: number;
  totalVisits: number;
  singles: number;
  doubles: number;
  trebles: number;
  misses: number;
  history: { visit: number; darts: string[]; targetAfter: number }[];
  isComplete: boolean;
};

const advanceTarget = (target: number, jump: number): number => {
  const maxBeforeBull = 20;

  if (target === 25) return 25;

  let next = target + jump;

  if (next > maxBeforeBull) {
    return 25;
  }
  return next;
};

const formatHit = (hit: DartHit, target: number): string => {
  if (hit === 'MISS') return 'MISS';
  if (target === 25) {
    if (hit === 'S') return 'Bull';
    if (hit === 'D') return 'Bullseye';
    return 'MISS';
  }
  return `${hit}${target}`;
};

function applyDart(prev: SoloATCState, hit: DartHit): SoloATCState {
  if (prev.isComplete) return prev;

  const t = prev.currentTarget;
  const label = formatHit(hit, t);

  const jump =
    hit === 'S' ? 1 :
    hit === 'D' ? 2 :
    hit === 'T' ? 3 :
    0;

  const nextTarget = advanceTarget(t, jump);

  const singles = prev.singles + (hit === 'S' ? 1 : 0);
  const doubles = prev.doubles + (hit === 'D' ? 1 : 0);
  const trebles = prev.trebles + (hit === 'T' ? 1 : 0);
  const misses = prev.misses + (hit === 'MISS' ? 1 : 0);

  const dartsThisVisit = [...prev.dartsThisVisit];
  dartsThisVisit[prev.dartIndex] = label;

  const nextDartIndex = ((prev.dartIndex + 1) % 3) as 0 | 1 | 2;

  const completes = (t === 25 && hit !== 'MISS');

  const isEndOfVisit = prev.dartIndex === 2;

  const newHistory = isEndOfVisit
    ? [
        ...prev.history,
        {
          visit: prev.visitIndex + 1,
          darts: dartsThisVisit.map(x => x ?? ''),
          targetAfter: nextTarget,
        },
      ]
    : prev.history;

  const totalDarts = prev.totalDarts + 1;
  const totalVisits = isEndOfVisit ? prev.totalVisits + 1 : prev.totalVisits;

  const isComplete = completes;

  return {
    ...prev,
    currentTarget: isComplete ? 25 : nextTarget,
    dartIndex: isEndOfVisit ? 0 : nextDartIndex,
    visitIndex: isEndOfVisit ? prev.visitIndex + 1 : prev.visitIndex,
    dartsThisVisit: isEndOfVisit ? [null, null, null] : dartsThisVisit,
    totalDarts,
    totalVisits,
    singles,
    doubles,
    trebles,
    misses,
    history: newHistory,
    isComplete,
    finishedAt: isComplete ? Date.now() : prev.finishedAt,
  };
}

const makeInitialSoloATCState = (): SoloATCState => ({
  startedAt: Date.now(),
  currentTarget: 1,
  visitIndex: 0,
  dartIndex: 0,
  dartsThisVisit: [null, null, null],
  totalDarts: 0,
  totalVisits: 0,
  singles: 0,
  doubles: 0,
  trebles: 0,
  misses: 0,
  history: [],
  isComplete: false,
});

const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export default function SoloAroundTheClockPage() {
  const router = useRouter();
  const [state, setState] = useState<SoloATCState>(makeInitialSoloATCState());
  const savedRef = useRef(false);

  const saveStats = async (finalState: SoloATCState) => {
    if (savedRef.current) return;
    savedRef.current = true;
    try {
      const accuracy = finalState.totalDarts > 0
        ? ((finalState.totalDarts - finalState.misses) / finalState.totalDarts) * 100
        : 0;
      const elapsed = finalState.finishedAt
        ? finalState.finishedAt - finalState.startedAt
        : Date.now() - finalState.startedAt;

      const result = await awardXP('around-the-clock-singles', finalState.totalDarts, {
        completed: true,
        won: true,
        sessionData: {
          total_darts: finalState.totalDarts,
          totalDarts: finalState.totalDarts,
          total_visits: finalState.totalVisits,
          total_hits: finalState.totalDarts - finalState.misses,
          accuracy: accuracy.toFixed(1),
          singles: finalState.singles,
          doubles: finalState.doubles,
          trebles: finalState.trebles,
          misses: finalState.misses,
          elapsed_ms: elapsed,
        },
      });

      if (result.success) {
        toast.success(`✅ +${result.xpBreakdown.total || 0} XP saved!`);
      }
      if (result.levelUp) {
        toast.success(`🎉 Level Up! ${result.levelUp.oldLevel} → ${result.levelUp.newLevel}`);
      }
    } catch (err) {
      console.error('Error saving ATC stats:', err);
    }
  };

  const handleDart = (hit: DartHit) => {
    setState(prev => {
      const next = applyDart(prev, hit);
      if (next.isComplete && !prev.isComplete) {
        // Save stats when game just completed
        saveStats(next);
      }
      return next;
    });
  };

  const handleRetry = () => {
    savedRef.current = false;
    setState(makeInitialSoloATCState());
  };

  const handleReturn = async () => {
    if (state.isComplete) await saveStats(state);
    router.push('/app/play/training');
  };

  const getTargetLabel = (): string => {
    if (state.currentTarget === 25) return 'BULL';
    return state.currentTarget.toString();
  };

  const accuracy = state.totalDarts > 0
    ? Math.round(((state.totalDarts - state.misses) / state.totalDarts) * 100)
    : 0;

  const elapsedTime = state.finishedAt
    ? state.finishedAt - state.startedAt
    : Date.now() - state.startedAt;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleReturn}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-white">Solo Around The Clock</h1>
          <div className="w-20" />
        </div>

        <Card className="bg-slate-800/50 border-slate-700 p-4 sm:p-6">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Target className="h-8 w-8 text-blue-400" />
                <div>
                  <div className="text-sm text-slate-400">Current Target</div>
                  <div className="text-2xl sm:text-4xl font-bold text-white">{getTargetLabel()}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-400">Visit</div>
                <div className="text-2xl font-bold text-white">{state.visitIndex + 1}</div>
              </div>
            </div>

            <div className="flex gap-2 justify-center">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={`w-24 h-24 rounded-lg border-2 flex items-center justify-center text-lg font-bold ${
                    state.dartsThisVisit[i]
                      ? 'bg-blue-500/20 border-blue-500 text-white'
                      : i === state.dartIndex
                      ? 'bg-slate-700/50 border-slate-600 text-slate-400 animate-pulse'
                      : 'bg-slate-700/30 border-slate-600 text-slate-500'
                  }`}
                >
                  {state.dartsThisVisit[i] || `Dart ${i + 1}`}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-700/30 p-3 rounded-lg text-center">
                <div className="text-xs text-slate-400">Darts</div>
                <div className="text-xl font-bold text-white">{state.totalDarts}</div>
              </div>
              <div className="bg-slate-700/30 p-3 rounded-lg text-center">
                <div className="text-xs text-slate-400">Visits</div>
                <div className="text-xl font-bold text-white">{state.totalVisits}</div>
              </div>
              <div className="bg-slate-700/30 p-3 rounded-lg text-center">
                <div className="text-xs text-slate-400">Accuracy</div>
                <div className="text-xl font-bold text-white">{accuracy}%</div>
              </div>
              <div className="bg-slate-700/30 p-3 rounded-lg text-center">
                <div className="text-xs text-slate-400">Time</div>
                <div className="text-xl font-bold text-white">{formatTime(elapsedTime)}</div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Throw Dart</h3>
          {state.currentTarget === 25 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Button
                onClick={() => handleDart('S')}
                disabled={state.isComplete}
                className="h-20 text-lg font-bold bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white shadow-lg shadow-cyan-500/25 border-2 border-cyan-400/50"
              >
                Single Bull
              </Button>
              <Button
                onClick={() => handleDart('D')}
                disabled={state.isComplete}
                className="h-20 text-lg font-bold bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-lg shadow-red-500/25 border-2 border-red-400/50"
              >
                Bullseye
              </Button>
              <Button
                onClick={() => handleDart('MISS')}
                disabled={state.isComplete}
                className="h-20 text-lg font-bold bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white border-2 border-slate-500/50"
              >
                Miss
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Button
                onClick={() => handleDart('S')}
                disabled={state.isComplete}
                className="h-20 text-xl font-black bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white shadow-lg shadow-cyan-500/25 border-2 border-cyan-400/50"
              >
                Single {getTargetLabel()}
              </Button>
              <Button
                onClick={() => handleDart('D')}
                disabled={state.isComplete}
                className="h-20 text-xl font-black bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25 border-2 border-emerald-400/50"
              >
                Double {getTargetLabel()}
              </Button>
              <Button
                onClick={() => handleDart('T')}
                disabled={state.isComplete}
                className="h-20 text-xl font-black bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 text-white shadow-lg shadow-teal-500/25 border-2 border-teal-400/50"
              >
                Treble {getTargetLabel()}
              </Button>
              <Button
                onClick={() => handleDart('MISS')}
                disabled={state.isComplete}
                className="h-20 text-xl font-bold bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white border-2 border-slate-500/50"
              >
                Miss
              </Button>
            </div>
          )}
        </Card>

        {state.history.length > 0 && (
          <Card className="bg-slate-800/50 border-slate-700 p-4 sm:p-6">
            <h3 className="text-lg font-semibold text-white mb-4">History</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {state.history.slice().reverse().map((entry, idx) => (
                <div
                  key={state.history.length - idx}
                  className="flex items-center justify-between bg-slate-700/30 p-3 rounded-lg"
                >
                  <div className="text-sm text-slate-400">Visit {entry.visit}</div>
                  <div className="flex gap-2">
                    {entry.darts.map((dart, i) => (
                      <Badge key={i} variant="outline" className="text-white border-slate-600">
                        {dart || '-'}
                      </Badge>
                    ))}
                  </div>
                  <div className="text-sm text-slate-400">
                    → {entry.targetAfter === 25 ? 'BULL' : entry.targetAfter}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Dialog open={state.isComplete} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl text-white">
              <Trophy className="h-6 w-6 text-yellow-500" />
              Well Done!
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="text-2xl sm:text-4xl font-bold text-yellow-500 mb-2">
                {formatTime(state.finishedAt ? state.finishedAt - state.startedAt : 0)}
              </div>
              <div className="text-slate-400">Completion Time</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-700/30 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-white">{state.totalDarts}</div>
                <div className="text-sm text-slate-400">Total Darts</div>
              </div>
              <div className="bg-slate-700/30 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-white">{state.totalVisits}</div>
                <div className="text-sm text-slate-400">Total Visits</div>
              </div>
              <div className="bg-slate-700/30 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-white">{accuracy}%</div>
                <div className="text-sm text-slate-400">Accuracy</div>
              </div>
              <div className="bg-slate-700/30 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-white">{state.misses}</div>
                <div className="text-sm text-slate-400">Misses</div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-blue-500/20 border border-blue-500/50 p-3 rounded-lg text-center">
                <div className="text-xl font-bold text-white">{state.singles}</div>
                <div className="text-xs text-slate-400">Singles</div>
              </div>
              <div className="bg-green-500/20 border border-green-500/50 p-3 rounded-lg text-center">
                <div className="text-xl font-bold text-white">{state.doubles}</div>
                <div className="text-xs text-slate-400">Doubles</div>
              </div>
              <div className="bg-purple-500/20 border border-purple-500/50 p-3 rounded-lg text-center">
                <div className="text-xl font-bold text-white">{state.trebles}</div>
                <div className="text-xs text-slate-400">Trebles</div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              onClick={handleRetry}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            <Button
              onClick={handleReturn}
              variant="outline"
              className="flex-1 border-slate-600 text-white hover:bg-slate-700"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}