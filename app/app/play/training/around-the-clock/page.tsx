'use client';

import { useState, useEffect } from 'react';
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
import { useTraining } from '@/lib/context/TrainingContext';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  initSession,
  applyThrow,
  getTargetLabel,
  getTotalTargetsCount,
  getCompletedCount,
  getAccuracy,
  type ATCSessionState,
  type ATCThrowInput,
  type ATCSegment,
  type AroundClockSegmentRule,
} from '@/lib/training/aroundTheClock';

interface DartThrow {
  segment: ATCSegment;
  number?: number;
  label: string;
}

interface Visit {
  darts: DartThrow[];
}

export default function AroundTheClockPage() {
  const router = useRouter();
  const { config } = useTraining();
  const [state, setState] = useState<ATCSessionState | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [startTime, setStartTime] = useState<number>(Date.now());

  // Visit tracking
  const [currentVisit, setCurrentVisit] = useState<DartThrow[]>([]);
  const [visitHistory, setVisitHistory] = useState<Visit[]>([]);
  const [dartNumberInVisit, setDartNumberInVisit] = useState<number>(1);

  useEffect(() => {
    if (!config || config.mode !== 'around-the-clock' || !config.atcSettings) {
      console.error('[ATC] No valid training config found, redirecting to Play');
      router.push('/app/play');
      return;
    }

    const initialState = initSession(config.atcSettings);
    setState(initialState);
    setStartTime(Date.now());
    createTrainingSession(config.atcSettings);
    setIsInitializing(false);
  }, [config, router]);

  const createTrainingSession = async (settings: any) => {
    const supabase = createClient();

    try {
      const { data, error } = await supabase.rpc('rpc_create_training_session', {
        payload: {
          game: 'around_the_clock',
          settings: settings,
        },
      });

      if (error) {
        console.error('[ATC] Failed to create session:', error);
        toast.error('Failed to create training session');
        return;
      }

      if (data && data.ok && data.session_id) {
        console.log('[ATC] Session created:', data.session_id);
        setState(prev => prev ? { ...prev, sessionId: data.session_id } : null);
      }
    } catch (err) {
      console.error('[ATC] Exception creating session:', err);
    }
  };

  const recordThrow = async (dartNumber: number, input: ATCThrowInput, result: any) => {
    if (!state?.sessionId) return;

    const supabase = createClient();

    try {
      const { error } = await supabase.rpc('rpc_record_training_throw', {
        p_session_id: state.sessionId,
        payload: {
          dart_number: dartNumber,
          input: input,
          result: result,
        },
      });

      if (error) {
        console.error('[ATC] Failed to record throw:', error);
      }
    } catch (err) {
      console.error('[ATC] Exception recording throw:', err);
    }
  };

  const formatThrowLabel = (dart: DartThrow): string => {
    return dart.label;
  };

  const handleDart = (segment: ATCSegment, number?: number) => {
    if (!state || state.isComplete) return;

    const throwInput: ATCThrowInput = { segment, number };
    const { newState, result } = applyThrow(state, throwInput);

    setState(newState);

    // Create label for display
    let label = '';
    if (segment === 'MISS') {
      label = 'Miss';
    } else if (segment === 'SB') {
      label = 'SBull';
    } else if (segment === 'DB') {
      label = 'DBull';
    } else if (segment === 'S') {
      label = `S${number}`;
    } else if (segment === 'D') {
      label = `D${number}`;
    } else if (segment === 'T') {
      label = `T${number}`;
    }

    const dartThrow: DartThrow = { segment, number, label };

    // Add to current visit
    const newCurrentVisit = [...currentVisit, dartThrow];
    setCurrentVisit(newCurrentVisit);

    // Record throw in database with cycling dart_number 1-3
    recordThrow(dartNumberInVisit, throwInput, result);

    // Check if visit is complete (3 darts)
    if (newCurrentVisit.length === 3) {
      // Move current visit to history
      setVisitHistory(prev => [...prev, { darts: newCurrentVisit }]);
      // Reset current visit
      setCurrentVisit([]);
      // Reset dart number
      setDartNumberInVisit(1);
    } else {
      // Increment dart number for next throw
      setDartNumberInVisit(dartNumberInVisit + 1);
    }

    // Check if session completed
    if (newState.isComplete && state.sessionId) {
      completeSession(state.sessionId);
    }
  };

  const completeSession = async (sessionId: string) => {
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('training_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      if (error) {
        console.error('[ATC] Failed to complete session:', error);
      }
    } catch (err) {
      console.error('[ATC] Exception completing session:', err);
    }
  };

  const handleRetry = () => {
    if (!config?.atcSettings) return;

    const initialState = initSession(config.atcSettings);
    setState(initialState);
    setStartTime(Date.now());
    setCurrentVisit([]);
    setVisitHistory([]);
    setDartNumberInVisit(1);
    createTrainingSession(config.atcSettings);
  };

  const handleReturn = () => {
    router.push('/app/play');
  };

  const renderThrowButtons = () => {
    if (!state || !config?.atcSettings) return null;

    const { currentTarget } = state;
    const { segmentRule } = config.atcSettings;

    if (state.isComplete) {
      return (
        <div className="text-center py-8 text-slate-400">
          Session completed! View your stats in the summary.
        </div>
      );
    }

    // Mode-specific buttons
    if (currentTarget === 'bull') {
      // Bull target
      if (segmentRule === 'singles_only') {
        return (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleDart('SB')}
              className="h-16 text-lg bg-blue-600 hover:bg-blue-700 text-white"
            >
              SBull
            </Button>
            <Button
              onClick={() => handleDart('MISS')}
              className="h-16 text-lg bg-slate-600 hover:bg-slate-700 text-white"
            >
              Miss
            </Button>
          </div>
        );
      } else if (segmentRule === 'doubles_only') {
        return (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleDart('DB')}
              className="h-16 text-lg bg-green-600 hover:bg-green-700 text-white"
            >
              DBull
            </Button>
            <Button
              onClick={() => handleDart('MISS')}
              className="h-16 text-lg bg-slate-600 hover:bg-slate-700 text-white"
            >
              Miss
            </Button>
          </div>
        );
      } else if (segmentRule === 'trebles_only') {
        // Treble bull doesn't exist, show SBull and DBull
        return (
          <div className="grid grid-cols-3 gap-3">
            <Button
              onClick={() => handleDart('SB')}
              className="h-16 text-lg bg-blue-600 hover:bg-blue-700 text-white"
            >
              SBull
            </Button>
            <Button
              onClick={() => handleDart('DB')}
              className="h-16 text-lg bg-green-600 hover:bg-green-700 text-white"
            >
              DBull
            </Button>
            <Button
              onClick={() => handleDart('MISS')}
              className="h-16 text-lg bg-slate-600 hover:bg-slate-700 text-white"
            >
              Miss
            </Button>
          </div>
        );
      } else {
        // increase_by_segment
        return (
          <div className="grid grid-cols-3 gap-3">
            <Button
              onClick={() => handleDart('SB')}
              className="h-16 text-lg bg-blue-600 hover:bg-blue-700 text-white"
            >
              SBull
            </Button>
            <Button
              onClick={() => handleDart('DB')}
              className="h-16 text-lg bg-green-600 hover:bg-green-700 text-white"
            >
              DBull
            </Button>
            <Button
              onClick={() => handleDart('MISS')}
              className="h-16 text-lg bg-slate-600 hover:bg-slate-700 text-white"
            >
              Miss
            </Button>
          </div>
        );
      }
    } else {
      // Number target (1-20)
      const targetNumber = currentTarget as number;

      if (segmentRule === 'singles_only') {
        return (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleDart('S', targetNumber)}
              className="h-16 text-lg bg-blue-600 hover:bg-blue-700 text-white"
            >
              S{targetNumber}
            </Button>
            <Button
              onClick={() => handleDart('MISS')}
              className="h-16 text-lg bg-slate-600 hover:bg-slate-700 text-white"
            >
              Miss
            </Button>
          </div>
        );
      } else if (segmentRule === 'doubles_only') {
        return (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleDart('D', targetNumber)}
              className="h-16 text-lg bg-green-600 hover:bg-green-700 text-white"
            >
              D{targetNumber}
            </Button>
            <Button
              onClick={() => handleDart('MISS')}
              className="h-16 text-lg bg-slate-600 hover:bg-slate-700 text-white"
            >
              Miss
            </Button>
          </div>
        );
      } else if (segmentRule === 'trebles_only') {
        return (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleDart('T', targetNumber)}
              className="h-16 text-lg bg-purple-600 hover:bg-purple-700 text-white"
            >
              T{targetNumber}
            </Button>
            <Button
              onClick={() => handleDart('MISS')}
              className="h-16 text-lg bg-slate-600 hover:bg-slate-700 text-white"
            >
              Miss
            </Button>
          </div>
        );
      } else {
        // increase_by_segment
        return (
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleDart('S', targetNumber)}
              className="h-16 text-lg bg-blue-600 hover:bg-blue-700 text-white"
            >
              S{targetNumber}
            </Button>
            <Button
              onClick={() => handleDart('D', targetNumber)}
              className="h-16 text-lg bg-green-600 hover:bg-green-700 text-white"
            >
              D{targetNumber}
            </Button>
            <Button
              onClick={() => handleDart('T', targetNumber)}
              className="h-16 text-lg bg-purple-600 hover:bg-purple-700 text-white"
            >
              T{targetNumber}
            </Button>
            <Button
              onClick={() => handleDart('MISS')}
              className="h-16 text-lg bg-slate-600 hover:bg-slate-700 text-white"
            >
              Miss
            </Button>
          </div>
        );
      }
    }
  };

  if (isInitializing || !state) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 flex items-center justify-center">
        <div className="text-white text-lg">Loading training session...</div>
      </div>
    );
  }

  const currentTargetLabel = getTargetLabel(state.currentTarget);
  const completedCount = getCompletedCount(state);
  const totalCount = getTotalTargetsCount();
  const accuracy = getAccuracy(state);
  const elapsedTime = Date.now() - startTime;

  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

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
          <h1 className="text-2xl font-bold text-white">Around The Clock</h1>
          <div className="w-20" />
        </div>

        <Card className="bg-slate-800/50 border-slate-700 p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Target className="h-8 w-8 text-blue-400" />
                <div>
                  <div className="text-sm text-slate-400">Current Target</div>
                  <div className="text-4xl font-bold text-white">{currentTargetLabel}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-400">Progress</div>
                <div className="text-2xl font-bold text-white">{completedCount} / {totalCount}</div>
              </div>
            </div>

            {state.completedTargets.length > 0 && (
              <div>
                <div className="text-sm text-slate-400 mb-2">Completed</div>
                <div className="flex flex-wrap gap-2">
                  {state.completedTargets.map((target, idx) => (
                    <Badge key={idx} variant="outline" className="bg-emerald-500/20 border-emerald-500 text-white">
                      {getTargetLabel(target)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-3">
              <div className="bg-slate-700/30 p-3 rounded-lg text-center">
                <div className="text-xs text-slate-400">Throws</div>
                <div className="text-xl font-bold text-white">{state.totalThrows}</div>
              </div>
              <div className="bg-slate-700/30 p-3 rounded-lg text-center">
                <div className="text-xs text-slate-400">Hits</div>
                <div className="text-xl font-bold text-white">{state.hits}</div>
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

        <Card className="bg-slate-800/50 border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Throw Dart</h3>
          {renderThrowButtons()}
        </Card>

        {/* Current Visit */}
        {currentVisit.length > 0 && (
          <Card className="bg-slate-800/50 border-slate-700 p-4">
            <div className="text-sm font-semibold text-white mb-2">Current Visit</div>
            <div className="flex gap-4">
              {currentVisit.map((dart, idx) => (
                <div key={idx} className="text-slate-300">
                  <span className="text-slate-500">Dart {idx + 1}:</span> {formatThrowLabel(dart)}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Visit History */}
        {visitHistory.length > 0 && (
          <Card className="bg-slate-800/50 border-slate-700 p-4">
            <div className="text-sm font-semibold text-white mb-3">Visit History</div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {visitHistory.map((visit, visitIdx) => (
                <div key={visitIdx} className="text-slate-300 text-sm">
                  <span className="text-slate-500">Visit {visitIdx + 1}:</span>{' '}
                  {visit.darts.map((dart, dartIdx) => (
                    <span key={dartIdx}>
                      {formatThrowLabel(dart)}
                      {dartIdx < visit.darts.length - 1 ? ', ' : ''}
                    </span>
                  ))}
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
              <div className="text-4xl font-bold text-yellow-500 mb-2">
                {formatTime(elapsedTime)}
              </div>
              <div className="text-slate-400">Completion Time</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-700/30 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-white">{state.totalThrows}</div>
                <div className="text-sm text-slate-400">Total Throws</div>
              </div>
              <div className="bg-slate-700/30 p-4 rounded-lg text-center">
                <div className="text-2xl font-bold text-white">{state.hits}</div>
                <div className="text-sm text-slate-400">Hits</div>
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
