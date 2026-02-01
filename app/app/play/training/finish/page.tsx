'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Target, ArrowLeft, RefreshCw, Trophy, X, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface DartHit {
  segment: 'S' | 'D' | 'T' | 'SB' | 'DB' | 'MISS';
  value: number;
  label: string;
}

interface AttemptHistory {
  target: number;
  attemptNo: number;
  darts: string;
  result: 'Success' | 'Fail' | 'Bust';
}

function FinishTrainingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [loading, setLoading] = useState(true);
  const [currentTarget, setCurrentTarget] = useState<number | null>(null);
  const [attemptNo, setAttemptNo] = useState<number>(1);
  const [minRange, setMinRange] = useState<number>(2);
  const [maxRange, setMaxRange] = useState<number>(40);

  const [currentDarts, setCurrentDarts] = useState<DartHit[]>([]);
  const [remaining, setRemaining] = useState<number>(0);
  const [history, setHistory] = useState<AttemptHistory[]>([]);

  const [typedVisitValue, setTypedVisitValue] = useState<string>('');
  const [inputMode, setInputMode] = useState<'dart_pad' | 'typed'>('dart_pad');
  const [scoringTab, setScoringTab] = useState<'singles' | 'doubles' | 'trebles' | 'bulls'>('singles');

  const [showStatsModal, setShowStatsModal] = useState(false);
  const [totalDarts, setTotalDarts] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [successfulCheckouts, setSuccessfulCheckouts] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      toast.error('No session ID found');
      router.push('/app/play');
      return;
    }

    loadSession();
  }, [sessionId, router]);

  const loadSession = async () => {
    if (!sessionId) return;

    const supabase = createClient();

    try {
      const { data, error } = await supabase.rpc('rpc_finish_training_get_session', {
        p_session_id: sessionId,
      });

      if (error || !data?.ok) {
        console.error('[Finish Training] Failed to load session:', error);
        toast.error('Failed to load session');
        router.push('/app/play');
        return;
      }

      const session = data.session;
      const settings = session.settings;

      setMinRange(settings.min || 2);
      setMaxRange(settings.max || 40);

      // If no current target, generate one
      if (!settings.current_target) {
        await getNewTarget();
      } else {
        setCurrentTarget(settings.current_target);
        setRemaining(settings.current_target);
        setAttemptNo(settings.attempt_no || 1);
      }

      // Load history from darts
      const darts = data.darts || [];
      buildHistoryFromDarts(darts);

      setLoading(false);
    } catch (err) {
      console.error('[Finish Training] Exception loading session:', err);
      toast.error('Failed to load session');
      router.push('/app/play');
    }
  };

  const buildHistoryFromDarts = (darts: any[]) => {
    const attemptMap: { [key: string]: any[] } = {};

    darts.forEach((dart: any) => {
      const key = `${dart.target}_${dart.attempt_no}`;
      if (!attemptMap[key]) {
        attemptMap[key] = [];
      }
      attemptMap[key].push(dart);
    });

    const historyItems: AttemptHistory[] = [];
    let dartsCount = 0;
    let attemptsCount = 0;
    let successCount = 0;

    Object.keys(attemptMap).forEach((key) => {
      const attemptDarts = attemptMap[key];
      const firstDart = attemptDarts[0];
      const target = firstDart.target;
      const attemptNo = firstDart.attempt_no;

      // Count darts
      if (firstDart.input?.mode !== 'typed_total') {
        dartsCount += attemptDarts.length;
      } else {
        dartsCount += 3;
      }
      attemptsCount += 1;

      // Determine result
      let result: 'Success' | 'Fail' | 'Bust' = 'Fail';
      const lastDart = attemptDarts[attemptDarts.length - 1];
      if (lastDart.result?.success) {
        result = 'Success';
        successCount += 1;
      } else if (lastDart.result?.bust) {
        result = 'Bust';
      }

      // Format darts string
      let dartsStr = '';
      if (firstDart.input?.mode === 'typed_total') {
        dartsStr = `Total: ${firstDart.input.typed_total}`;
      } else {
        dartsStr = attemptDarts
          .map((d: any) => d.input?.hit?.label || 'Miss')
          .join(', ');
      }

      historyItems.push({
        target,
        attemptNo,
        darts: dartsStr,
        result,
      });
    });

    setHistory(historyItems);
    setTotalDarts(dartsCount);
    setTotalAttempts(attemptsCount);
    setSuccessfulCheckouts(successCount);
  };

  const getNewTarget = async () => {
    const supabase = createClient();

    try {
      const { data, error } = await supabase.rpc('rpc_finish_training_random_checkout', {
        p_min: minRange,
        p_max: maxRange,
      });

      if (error || !data?.ok) {
        console.error('[Finish Training] Failed to get new target:', error);
        toast.error('Failed to get new checkout');
        return;
      }

      const newTarget = data.checkout;
      setCurrentTarget(newTarget);
      setRemaining(newTarget);
      setAttemptNo(1);
      setCurrentDarts([]);

      // Update session state
      await supabase.rpc('rpc_finish_training_set_state', {
        p_session_id: sessionId,
        p_state: { current_target: newTarget, attempt_no: 1 },
      });
    } catch (err) {
      console.error('[Finish Training] Exception getting new target:', err);
      toast.error('Failed to get new checkout');
    }
  };

  const handleDartClick = async (hit: DartHit) => {
    if (!currentTarget || !sessionId) return;

    const dartNo = currentDarts.length + 1;
    const remainingBefore = remaining;
    const remainingAfter = remaining - hit.value;

    let bust = false;
    let success = false;

    if (remainingAfter < 0) {
      bust = true;
    } else if (remainingAfter === 0) {
      // Double-out rule: must finish on a double
      if (hit.segment === 'D' || hit.segment === 'DB') {
        success = true;
      } else {
        // Invalid finish - not a double
        toast.error('Checkout must end on a double');
        return;
      }
    }

    const newDarts = [...currentDarts, hit];
    setCurrentDarts(newDarts);
    setRemaining(bust ? currentTarget : remainingAfter);

    // Update stats
    setTotalDarts(totalDarts + 1);

    // Record dart
    const supabase = createClient();
    await supabase.rpc('rpc_finish_training_record_dart', {
      p_session_id: sessionId,
      p_attempt_no: attemptNo,
      p_dart_no: dartNo,
      p_input: {
        mode: 'dart_pad',
        target: currentTarget,
        attempt_no: attemptNo,
        dart_no: dartNo,
        hit: hit,
      },
      p_result: {
        remaining_before: remainingBefore,
        remaining_after: remainingAfter,
        bust,
        success,
      },
    });

    // Handle end of attempt
    if (bust) {
      await endAttempt('Bust', newDarts);
    } else if (success) {
      await endAttempt('Success', newDarts);
    } else if (dartNo === 3) {
      await endAttempt('Fail', newDarts);
    }
  };

  const handleTypedVisitSubmit = async () => {
    if (!currentTarget || !sessionId) return;

    const total = parseInt(typedVisitValue) || 0;
    if (total < 0 || total > 180) {
      toast.error('Invalid total (must be 0-180)');
      return;
    }

    const remainingAfter = currentTarget - total;
    let bust = false;
    let success = false;

    if (remainingAfter < 0) {
      bust = true;
    } else if (remainingAfter === 0) {
      success = true;
    }

    // Update stats
    setTotalDarts(totalDarts + 3);
    setTotalAttempts(totalAttempts + 1);
    if (success) {
      setSuccessfulCheckouts(successfulCheckouts + 1);
    }

    // Record 3 darts with typed_total mode
    const supabase = createClient();
    for (let dartNo = 1; dartNo <= 3; dartNo++) {
      await supabase.rpc('rpc_finish_training_record_dart', {
        p_session_id: sessionId,
        p_attempt_no: attemptNo,
        p_dart_no: dartNo,
        p_input: {
          mode: 'typed_total',
          target: currentTarget,
          attempt_no: attemptNo,
          dart_no: dartNo,
          typed_total: total,
        },
        p_result: {
          remaining_before: currentTarget,
          remaining_after: remainingAfter,
          bust,
          success,
        },
      });
    }

    // Add to history
    const result = success ? 'Success' : bust ? 'Bust' : 'Fail';
    setHistory([
      ...history,
      {
        target: currentTarget,
        attemptNo,
        darts: `Total: ${total}`,
        result: result as 'Success' | 'Fail' | 'Bust',
      },
    ]);

    setTypedVisitValue('');

    // Handle result
    if (success) {
      toast.success('Checkout complete!');
      await getNewTarget();
    } else if (bust) {
      toast.error('Bust!');
      await incrementAttempt();
    } else {
      toast.info('Attempt complete');
      await incrementAttempt();
    }
  };

  const endAttempt = async (result: 'Success' | 'Fail' | 'Bust', darts: DartHit[]) => {
    // Update stats
    setTotalAttempts(totalAttempts + 1);
    if (result === 'Success') {
      setSuccessfulCheckouts(successfulCheckouts + 1);
    }

    // Add to history
    setHistory([
      ...history,
      {
        target: currentTarget!,
        attemptNo,
        darts: darts.map((d) => d.label).join(', '),
        result,
      },
    ]);

    if (result === 'Success') {
      toast.success('Checkout complete!');
      await getNewTarget();
    } else if (result === 'Bust') {
      toast.error('Bust!');
      setCurrentDarts([]);
      setRemaining(currentTarget!);
      await incrementAttempt();
    } else {
      toast.info('Attempt complete');
      setCurrentDarts([]);
      setRemaining(currentTarget!);
      await incrementAttempt();
    }
  };

  const incrementAttempt = async () => {
    if (attemptNo >= 3) {
      // After 3 attempts, get new target
      await getNewTarget();
    } else {
      const newAttemptNo = attemptNo + 1;
      setAttemptNo(newAttemptNo);

      // Update session state
      const supabase = createClient();
      await supabase.rpc('rpc_finish_training_set_state', {
        p_session_id: sessionId,
        p_state: { current_target: currentTarget, attempt_no: newAttemptNo },
      });
    }
  };

  const handleNewNumber = async () => {
    setCurrentDarts([]);
    await getNewTarget();
  };

  const handleReturn = () => {
    router.push('/app/play');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 flex items-center justify-center">
        <div className="text-white text-lg">Loading training session...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleReturn}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold text-white">Finish Training</h1>
          <Button
            variant="outline"
            onClick={handleNewNumber}
            className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            New Number
          </Button>
        </div>

        <Card className="bg-slate-800/50 border-slate-700 p-6">
          <div className="grid grid-cols-2 gap-8 mb-4">
            <div className="text-center space-y-2">
              <div className="text-sm text-slate-400 uppercase tracking-wider">Checkout</div>
              <div className="text-6xl font-bold text-emerald-400">{currentTarget}</div>
            </div>
            <div className="text-center space-y-2">
              <div className="text-sm text-slate-400 uppercase tracking-wider">Remaining</div>
              <div className="text-6xl font-bold text-white">{remaining}</div>
            </div>
          </div>
          <div className="text-center text-sm text-slate-400">Attempt {attemptNo}/3</div>
        </Card>

        {currentDarts.length > 0 && (
          <Card className="bg-slate-800/50 border-slate-700 p-4">
            <div className="text-sm font-semibold text-white mb-2">Current Darts</div>
            <div className="flex gap-4">
              {currentDarts.map((dart, idx) => (
                <div key={idx} className="text-slate-300">
                  <span className="text-slate-500">Dart {idx + 1}:</span> {dart.label}
                </div>
              ))}
              <div className="text-emerald-400 font-semibold ml-auto">
                Remaining: {remaining}
              </div>
            </div>
          </Card>
        )}

        <Card className="bg-slate-800/50 border-slate-700 p-6">
          <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'dart_pad' | 'typed')}>
            <TabsList className="bg-slate-700/50 w-full grid grid-cols-2 mb-4">
              <TabsTrigger value="dart_pad" className="data-[state=active]:bg-emerald-500">
                Dart by Dart
              </TabsTrigger>
              <TabsTrigger value="typed" className="data-[state=active]:bg-emerald-500">
                Typed Visit
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dart_pad">
              <div className="space-y-4">
                <Tabs value={scoringTab} onValueChange={(v) => setScoringTab(v as any)}>
                  <TabsList className="bg-slate-700/50 w-full grid grid-cols-4 mb-4">
                    <TabsTrigger value="singles" className="data-[state=active]:bg-blue-500">
                      Singles
                    </TabsTrigger>
                    <TabsTrigger value="doubles" className="data-[state=active]:bg-green-500">
                      Doubles
                    </TabsTrigger>
                    <TabsTrigger value="trebles" className="data-[state=active]:bg-orange-500">
                      Trebles
                    </TabsTrigger>
                    <TabsTrigger value="bulls" className="data-[state=active]:bg-red-500">
                      Bulls
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="singles">
                    <div className="grid grid-cols-10 gap-2">
                      {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                        <Button
                          key={`S${num}`}
                          onClick={() =>
                            handleDartClick({
                              segment: 'S',
                              value: num,
                              label: `S${num}`,
                            })
                          }
                          disabled={currentDarts.length >= 3}
                          className="h-14 bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-30"
                        >
                          {num}
                        </Button>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="doubles">
                    <div className="grid grid-cols-10 gap-2">
                      {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                        <Button
                          key={`D${num}`}
                          onClick={() =>
                            handleDartClick({
                              segment: 'D',
                              value: num * 2,
                              label: `D${num}`,
                            })
                          }
                          disabled={currentDarts.length >= 3}
                          className="h-14 bg-green-600 hover:bg-green-700 text-white font-semibold disabled:opacity-30"
                        >
                          {num}
                        </Button>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="trebles">
                    <div className="grid grid-cols-10 gap-2">
                      {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                        <Button
                          key={`T${num}`}
                          onClick={() =>
                            handleDartClick({
                              segment: 'T',
                              value: num * 3,
                              label: `T${num}`,
                            })
                          }
                          disabled={currentDarts.length >= 3}
                          className="h-14 bg-orange-600 hover:bg-orange-700 text-white font-semibold disabled:opacity-30"
                        >
                          {num}
                        </Button>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="bulls">
                    <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                      <Button
                        onClick={() =>
                          handleDartClick({
                            segment: 'SB',
                            value: 25,
                            label: 'SBull',
                          })
                        }
                        disabled={currentDarts.length >= 3}
                        className="h-20 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold disabled:opacity-30"
                      >
                        Single Bull (25)
                      </Button>
                      <Button
                        onClick={() =>
                          handleDartClick({
                            segment: 'DB',
                            value: 50,
                            label: 'DBull',
                          })
                        }
                        disabled={currentDarts.length >= 3}
                        className="h-20 bg-red-600 hover:bg-red-700 text-white text-lg font-semibold disabled:opacity-30"
                      >
                        Double Bull (50)
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex justify-center pt-2">
                  <Button
                    onClick={() =>
                      handleDartClick({
                        segment: 'MISS',
                        value: 0,
                        label: 'Miss',
                      })
                    }
                    disabled={currentDarts.length >= 3}
                    className="h-16 w-full max-w-md bg-slate-600 hover:bg-slate-700 text-white text-lg font-bold disabled:opacity-30"
                  >
                    MISS (0)
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="typed">
              <div className="max-w-md mx-auto space-y-4">
                <div>
                  <label className="text-sm text-slate-400 mb-2 block">
                    Enter visit total (0-180)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="180"
                    value={typedVisitValue}
                    onChange={(e) => setTypedVisitValue(e.target.value)}
                    placeholder="Enter score..."
                    className="bg-slate-700/50 border-slate-600 text-white text-lg h-14"
                  />
                </div>
                <Button
                  onClick={handleTypedVisitSubmit}
                  disabled={!typedVisitValue}
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                >
                  Submit Visit
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </Card>

        {history.length > 0 && (
          <Card className="bg-slate-800/50 border-slate-700 p-4">
            <div className="text-sm font-semibold text-white mb-3">History</div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {history.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-white font-semibold">
                      <Target className="inline w-4 h-4 mr-1" />
                      {item.target}
                    </div>
                    <div className="text-slate-400 text-sm">
                      Attempt {item.attemptNo}/3
                    </div>
                    <div className="text-slate-300 text-sm">{item.darts}</div>
                  </div>
                  <Badge
                    variant={
                      item.result === 'Success'
                        ? 'default'
                        : item.result === 'Bust'
                        ? 'destructive'
                        : 'secondary'
                    }
                    className={
                      item.result === 'Success'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                        : item.result === 'Bust'
                        ? 'bg-red-500/20 border-red-500 text-red-400'
                        : 'bg-slate-500/20 border-slate-500 text-slate-400'
                    }
                  >
                    {item.result}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="flex justify-center pb-8">
          <Button
            onClick={() => setShowStatsModal(true)}
            className="h-14 px-12 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold"
          >
            <TrendingUp className="mr-2 h-5 w-5" />
            End Session
          </Button>
        </div>
      </div>

      <Dialog open={showStatsModal} onOpenChange={setShowStatsModal}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center mb-4">
              Session Stats
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="bg-slate-700/30 rounded-lg p-6 text-center">
              <div className="text-slate-400 text-sm uppercase tracking-wider mb-2">
                Total Darts Thrown
              </div>
              <div className="text-5xl font-bold text-emerald-400">{totalDarts}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">
                  Total Attempts
                </div>
                <div className="text-3xl font-bold text-white">{totalAttempts}</div>
              </div>

              <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">
                  Successful Checkouts
                </div>
                <div className="text-3xl font-bold text-emerald-400">
                  {successfulCheckouts}
                </div>
              </div>
            </div>

            {totalAttempts > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-center">
                <div className="text-blue-300 text-sm mb-1">Checkout Success Rate</div>
                <div className="text-2xl font-bold text-blue-400">
                  {((successfulCheckouts / totalAttempts) * 100).toFixed(1)}%
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowStatsModal(false)}
              className="flex-1 border-slate-600 text-white hover:bg-slate-700"
            >
              Close
            </Button>
            <Button
              onClick={() => router.push('/app/play')}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Back to Play
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function FinishTrainingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 flex items-center justify-center">
          <div className="text-white text-lg">Loading...</div>
        </div>
      }
    >
      <FinishTrainingContent />
    </Suspense>
  );
}
