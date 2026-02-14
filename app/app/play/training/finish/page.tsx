'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Target, ArrowLeft, RefreshCw, Trophy, X, TrendingUp, Zap, Crosshair, CheckCircle2, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface DartHit {
  segment: 'S' | 'D' | 'T' | 'SB' | 'DB' | 'MISS';
  value: number;
  label: string;
}

interface AttemptHistory {
  target: number;
  attemptNo: number;
  darts: string;
  visitTotal: number;
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
  const [finishesHit, setFinishesHit] = useState<number[]>([]);

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
    const successfulTargets: number[] = [];

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
        successfulTargets.push(target);
      } else if (lastDart.result?.bust) {
        result = 'Bust';
      }

      // Format darts string and calculate visit total
      let dartsStr = '';
      let visitTotal = 0;
      if (firstDart.input?.mode === 'typed_total') {
        visitTotal = firstDart.input.typed_total || 0;
        dartsStr = attemptDarts
          .map((d: any) => d.input?.hit?.label || 'Miss')
          .join(', ');
      } else {
        dartsStr = attemptDarts
          .map((d: any) => d.input?.hit?.label || 'Miss')
          .join(', ');
        visitTotal = attemptDarts.reduce((sum: number, d: any) => {
          return sum + (d.input?.hit?.value || 0);
        }, 0);
      }

      historyItems.push({
        target,
        attemptNo,
        darts: dartsStr,
        visitTotal,
        result,
      });
    });

    setHistory(historyItems);
    setTotalDarts(dartsCount);
    setTotalAttempts(attemptsCount);
    setSuccessfulCheckouts(successCount);
    setFinishesHit(successfulTargets);
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
        // Invalid finish - not a double, mark as BUST
        bust = true;
        toast.error('Checkout must end on a double');
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

  const handleBustClick = async () => {
    if (!currentTarget || !sessionId) return;

    // Bust button always counts as 3 darts thrown
    const dartsThrown = 3;

    // Update stats - count 3 darts for bust button
    setTotalDarts(totalDarts + dartsThrown);
    setTotalAttempts(totalAttempts + 1);

    // Calculate visit total from current darts
    const visitTotal = currentDarts.reduce((sum, dart) => sum + dart.value, 0);

    // Record all 3 darts for bust in database
    const supabase = createClient();
    
    // Record each dart (including misses for remaining darts)
    for (let dartNo = 1; dartNo <= 3; dartNo++) {
      const dart = currentDarts[dartNo - 1];
      await supabase.rpc('rpc_finish_training_record_dart', {
        p_session_id: sessionId,
        p_attempt_no: attemptNo,
        p_dart_no: dartNo,
        p_input: {
          mode: 'bust_button',
          target: currentTarget,
          attempt_no: attemptNo,
          dart_no: dartNo,
          hit: dart || { segment: 'MISS', value: 0, label: 'Miss' },
        },
        p_result: {
          remaining_before: remaining,
          remaining_after: remaining,
          bust: true,
          success: false,
        },
      });
    }

    // Add to history - show all 3 darts
    const dartsStr = currentDarts.length > 0
      ? [...currentDarts, ...Array(3 - currentDarts.length).fill({ label: 'Miss' })].map((d) => d.label).join(', ')
      : 'Miss, Miss, Miss';

    setHistory([
      {
        target: currentTarget,
        attemptNo,
        darts: dartsStr,
        visitTotal,
        result: 'Bust',
      },
      ...history,
    ]);

    toast.error('Bust!');
    setCurrentDarts([]);
    setRemaining(currentTarget);
    await incrementAttempt();
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

    // Add to history (newest first)
    const result = success ? 'Success' : bust ? 'Bust' : 'Fail';
    setHistory([
      {
        target: currentTarget,
        attemptNo,
        darts: `Visit (typed)`,
        visitTotal: total,
        result: result as 'Success' | 'Fail' | 'Bust',
      },
      ...history,
    ]);

    // Track successful finishes
    if (success) {
      setFinishesHit([...finishesHit, currentTarget]);
    }

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

    // Calculate visit total
    const visitTotal = darts.reduce((sum, dart) => sum + dart.value, 0);

    // Add to history (newest first)
    setHistory([
      {
        target: currentTarget!,
        attemptNo,
        darts: darts.map((d) => d.label).join(', '),
        visitTotal,
        result,
      },
      ...history,
    ]);

    // Track successful finishes
    if (result === 'Success') {
      setFinishesHit([...finishesHit, currentTarget!]);
    }

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
    <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-2 overflow-hidden">
      <div className="h-full w-full flex flex-col gap-2">
          {/* Animated Header */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between shrink-0"
          >
            <Button
              variant="ghost"
              onClick={handleReturn}
              className="text-slate-400 hover:text-white hover:bg-white/10"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div className="text-center">
              <h1 className="text-2xl font-black text-white tracking-tight">
                <span className="bg-gradient-to-r from-emerald-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                  Finish Training
                </span>
              </h1>
              <p className="text-slate-400 text-xs mt-0.5">Practice your checkouts</p>
            </div>
            <Button
              variant="outline"
              onClick={handleNewNumber}
              className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              New Number
            </Button>
          </motion.div>

          {/* Main Stats Display */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="shrink-0"
          >
            <Card className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 border-slate-700/50 p-4 backdrop-blur-sm">
              <div className="grid grid-cols-3 gap-4">
                {/* Target */}
                <div className="text-center space-y-1">
                  <div className="flex items-center justify-center gap-2 text-emerald-400">
                    <Target className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Target</span>
                  </div>
                  <motion.div 
                    key={currentTarget}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-5xl font-black text-white"
                  >
                    {currentTarget}
                  </motion.div>
                </div>
                
                {/* Remaining */}
                <div className="text-center space-y-1">
                  <div className="flex items-center justify-center gap-2 text-blue-400">
                    <Crosshair className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Remaining</span>
                  </div>
                  <motion.div 
                    key={remaining}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`text-5xl font-black ${remaining === 0 ? 'text-emerald-400' : 'text-white'}`}
                  >
                    {remaining}
                  </motion.div>
                </div>
                
                {/* Attempt */}
                <div className="text-center space-y-1">
                  <div className="flex items-center justify-center gap-2 text-amber-400">
                    <Zap className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Attempt</span>
                  </div>
                  <div className="text-5xl font-black text-white">
                    {attemptNo}<span className="text-2xl text-slate-500">/3</span>
                  </div>
                </div>
              </div>
              
              {/* Progress bar for attempts */}
              <div className="mt-4">
                <Progress value={(attemptNo / 3) * 100} className="h-2 bg-slate-700" />
              </div>
            </Card>
          </motion.div>

          <AnimatePresence>
            {currentDarts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="shrink-0"
              >
                <Card className="bg-slate-800/50 border-slate-700/50 p-3 backdrop-blur-sm">
                  <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Current Darts</div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-2">
                      {currentDarts.map((dart, idx) => (
                        <motion.div 
                          key={idx}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className={`px-3 py-1.5 rounded-lg font-bold text-white text-sm ${
                            dart.segment === 'D' ? 'bg-gradient-to-br from-red-500 to-red-600' :
                            dart.segment === 'T' ? 'bg-gradient-to-br from-teal-500 to-teal-600' :
                            dart.segment === 'DB' ? 'bg-gradient-to-br from-red-600 to-red-700' :
                            dart.segment === 'SB' ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' :
                            dart.segment === 'MISS' ? 'bg-slate-600' :
                            'bg-gradient-to-br from-blue-500 to-blue-600'
                          }`}
                        >
                          {dart.label}
                        </motion.div>
                      ))}
                      {[...Array(3 - currentDarts.length)].map((_, idx) => (
                        <div key={`empty-${idx}`} className="px-3 py-1.5 rounded-lg bg-slate-700/30 text-slate-600 font-bold text-sm">
                          -
                        </div>
                      ))}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <span className="text-slate-400 text-sm">Remaining:</span>
                      <span className={`text-xl font-black ${remaining === 0 ? 'text-emerald-400' : 'text-white'}`}>
                        {remaining}
                      </span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex-1 min-h-0"
          >
            <Card className="bg-slate-800/50 border-slate-700/50 p-4 backdrop-blur-sm h-full flex flex-col">
              <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'dart_pad' | 'typed')} className="flex flex-col h-full">
                <TabsList className="bg-slate-700/50 w-full grid grid-cols-2 mb-3 shrink-0">
                  <TabsTrigger value="dart_pad" className="data-[state=active]:bg-emerald-500">
                    Dart by Dart
                  </TabsTrigger>
                  <TabsTrigger value="typed" className="data-[state=active]:bg-emerald-500">
                    Typed Visit
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="dart_pad" className="flex-1 flex flex-col min-h-0 mt-0">
                  <div className="space-y-3 flex flex-col h-full">
                    <Tabs value={scoringTab} onValueChange={(v) => setScoringTab(v as any)} className="flex flex-col flex-1">
                      <TabsList className="bg-slate-700/50 w-full grid grid-cols-4 mb-3 shrink-0">
                        <TabsTrigger value="singles" className="data-[state=active]:bg-blue-500">
                          Singles
                        </TabsTrigger>
                        <TabsTrigger value="doubles" className="data-[state=active]:bg-green-500">
                          Doubles
                        </TabsTrigger>
                        <TabsTrigger value="trebles" className="data-[state=active]:bg-teal-500">
                          Trebles
                        </TabsTrigger>
                        <TabsTrigger value="bulls" className="data-[state=active]:bg-red-500">
                          Bulls
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="singles" className="flex-1 mt-0">
                        <div className="grid grid-cols-10 gap-3 h-full content-start">
                          {Array.from({ length: 20 }, (_, i) => i + 1).map((num, idx) => (
                            <motion.div
                              key={`S${num}`}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: idx * 0.01 }}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Button
                                onClick={() =>
                                  handleDartClick({
                                    segment: 'S',
                                    value: num,
                                    label: `S${num}`,
                                  })
                                }
                                disabled={currentDarts.length >= 3}
                                className="h-16 w-full bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white font-bold text-xl shadow-lg shadow-cyan-500/20 disabled:opacity-30 border-2 border-cyan-400/50"
                              >
                                {num}
                              </Button>
                            </motion.div>
                          ))}
                        </div>
                      </TabsContent>

                      <TabsContent value="doubles" className="flex-1 mt-0">
                        <div className="grid grid-cols-10 gap-3 h-full content-start">
                          {Array.from({ length: 20 }, (_, i) => i + 1).map((num, idx) => (
                            <motion.div
                              key={`D${num}`}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: idx * 0.01 }}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Button
                                onClick={() =>
                                  handleDartClick({
                                    segment: 'D',
                                    value: num * 2,
                                    label: `D${num}`,
                                  })
                                }
                                disabled={currentDarts.length >= 3}
                                className="h-16 w-full bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-xl shadow-lg shadow-emerald-500/20 disabled:opacity-30 border-2 border-emerald-400/50"
                              >
                                {num}
                              </Button>
                            </motion.div>
                          ))}
                        </div>
                      </TabsContent>

                      <TabsContent value="trebles" className="flex-1 mt-0">
                        <div className="grid grid-cols-10 gap-3 h-full content-start">
                          {Array.from({ length: 20 }, (_, i) => i + 1).map((num, idx) => (
                            <motion.div
                              key={`T${num}`}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{ delay: idx * 0.01 }}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                            >
                              <Button
                                onClick={() =>
                                  handleDartClick({
                                    segment: 'T',
                                    value: num * 3,
                                    label: `T${num}`,
                                  })
                                }
                                disabled={currentDarts.length >= 3}
                                className="h-16 w-full bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 text-white font-bold text-xl shadow-lg shadow-teal-500/20 disabled:opacity-30 border-2 border-teal-400/50"
                              >
                                {num}
                              </Button>
                            </motion.div>
                          ))}
                        </div>
                      </TabsContent>

                      <TabsContent value="bulls" className="flex-1 mt-0">
                        <div className="grid grid-cols-2 gap-6 h-full content-center">
                          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button
                              onClick={() =>
                                handleDartClick({
                                  segment: 'SB',
                                  value: 25,
                                  label: 'SBull',
                                })
                              }
                              disabled={currentDarts.length >= 3}
                              className="h-20 w-full bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white text-xl font-bold disabled:opacity-30 shadow-lg shadow-emerald-500/20 border-2 border-emerald-400/50"
                            >
                              Single Bull (25)
                            </Button>
                          </motion.div>
                          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button
                              onClick={() =>
                                handleDartClick({
                                  segment: 'DB',
                                  value: 50,
                                  label: 'DBull',
                                })
                              }
                              disabled={currentDarts.length >= 3}
                              className="h-20 w-full bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white text-xl font-bold disabled:opacity-30 shadow-lg shadow-red-500/20 border-2 border-red-400/50"
                            >
                              Double Bull (50)
                            </Button>
                          </motion.div>
                        </div>
                      </TabsContent>
                    </Tabs>

                    <div className="grid grid-cols-2 gap-4 pt-2 shrink-0">
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full">
                        <Button
                          onClick={() =>
                            handleDartClick({
                              segment: 'MISS',
                              value: 0,
                              label: 'Miss',
                            })
                          }
                          disabled={currentDarts.length >= 3}
                          className="h-16 w-full bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white text-lg font-bold disabled:opacity-30 border-2 border-slate-500/50"
                        >
                          MISS (0)
                        </Button>
                      </motion.div>
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-full">
                        <Button
                          onClick={handleBustClick}
                          className="h-16 w-full bg-gradient-to-br from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-lg font-bold shadow-lg shadow-red-500/20 border-2 border-red-500/50"
                        >
                          BUST
                        </Button>
                      </motion.div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="typed" className="flex-1 flex flex-col justify-center mt-0">
                  <div className="max-w-md mx-auto space-y-4 w-full">
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
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        onClick={handleTypedVisitSubmit}
                        disabled={!typedVisitValue}
                        className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                      >
                        Submit Visit
                      </Button>
                      <Button
                        onClick={handleBustClick}
                        className="h-12 bg-red-600 hover:bg-red-700 text-white"
                      >
                        BUST
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </Card>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex justify-center shrink-0 pb-2"
          >
            <Button
              onClick={() => setShowStatsModal(true)}
              className="h-14 px-12 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white text-lg font-bold shadow-lg shadow-emerald-500/25"
            >
              <TrendingUp className="mr-2 h-5 w-5" />
              End Session
            </Button>
          </motion.div>
      </div>

      <Dialog open={showStatsModal} onOpenChange={setShowStatsModal}>
        <DialogContent className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-3 text-2xl font-bold text-center">
              <Trophy className="h-8 w-8 text-yellow-400" />
              Session Complete!
            </DialogTitle>
          </DialogHeader>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4 py-4"
          >
            {/* Total Darts */}
            <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center">
              <div className="text-emerald-300 text-sm font-bold uppercase tracking-wider mb-2">
                Total Darts Thrown
              </div>
              <div className="text-5xl font-black text-white">{totalDarts}</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-700/30 rounded-xl p-4 text-center border border-slate-600/30">
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                  Attempts
                </div>
                <div className="text-3xl font-black text-white">{totalAttempts}</div>
              </div>

              <div className="bg-slate-700/30 rounded-xl p-4 text-center border border-slate-600/30">
                <div className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
                  Success
                </div>
                <div className="text-3xl font-black text-emerald-400">
                  {successfulCheckouts}
                </div>
              </div>
            </div>

            {totalAttempts > 0 && (
              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-4 text-center">
                <div className="text-blue-300 text-sm font-medium mb-1">Checkout Success Rate</div>
                <div className="text-3xl font-black text-white">
                  {((successfulCheckouts / totalAttempts) * 100).toFixed(1)}%
                </div>
              </div>
            )}

            {finishesHit.length > 0 && (
              <>
                <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-xl p-4">
                  <div className="text-amber-300 text-sm font-bold uppercase tracking-wider mb-2 text-center">
                    Highest Finish
                  </div>
                  <div className="text-4xl font-black text-white text-center">
                    {Math.max(...finishesHit)}
                  </div>
                </div>

                <div className="bg-slate-700/30 rounded-xl p-4 border border-slate-600/30">
                  <div className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-3">
                    Finishes Hit ({Array.from(new Set(finishesHit)).length} unique)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(finishesHit))
                      .sort((a, b) => b - a)
                      .map((finish, idx) => (
                        <Badge
                          key={idx}
                          className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-0 text-sm px-3 py-1"
                        >
                          {finish}
                        </Badge>
                      ))}
                  </div>
                </div>
              </>
            )}
          </motion.div>

          <DialogFooter className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowStatsModal(false)}
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white font-bold"
            >
              Continue
            </Button>
            <Button
              onClick={() => router.push('/app/play')}
              className="flex-1 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold"
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
