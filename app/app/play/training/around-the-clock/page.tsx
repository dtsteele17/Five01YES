'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Target, Trophy, ArrowLeft, RotateCcw, Clock, Zap, Crosshair, CheckCircle2, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTraining } from '@/lib/context/TrainingContext';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { calculateXP, XPResult } from '@/lib/training/xpSystem';
import { awardXP } from '@/lib/training/xpTracker';
import { XPRewardDisplay } from '@/components/training/XPRewardDisplay';
import { useLevelUpToast } from '@/components/training/LevelUpToast';
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
  const [xpResult, setXpResult] = useState<XPResult | null>(null);
  const { triggerLevelUp, LevelUpToastComponent } = useLevelUpToast();

  // Visit tracking
  const [currentVisit, setCurrentVisit] = useState<DartThrow[]>([]);
  const [visitHistory, setVisitHistory] = useState<Visit[]>([]);
  const [dartNumberInVisit, setDartNumberInVisit] = useState<number>(1);

  useEffect(() => {
    if (!config || config.mode !== 'around-the-clock' || !config.atcSettings) {
      console.error('[ATC] No valid training config found, redirecting to Play');
      router.push('/app/play/training');
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
      completeSession(state.sessionId, newState.totalThrows);
    }
  };

  const completeSession = async (sessionId: string, totalThrows: number) => {
    const supabase = createClient();

    try {
      // Calculate XP based on darts thrown (fewer = more XP)
      const xp = calculateXP('around-the-clock-singles', 100 - totalThrows, { completed: true });
      setXpResult(xp);

      // Update training_sessions record
      const { error } = await supabase
        .from('training_sessions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          xp_earned: xp.totalXP,
          session_data: {
            total_throws: totalThrows,
            xp_breakdown: {
              base: xp.baseXP,
              performance: xp.performanceBonus,
              completion: xp.completionBonus,
              total: xp.totalXP,
            },
          },
        })
        .eq('id', sessionId);

      if (error) {
        console.error('[ATC] Failed to complete session:', error);
      }

      // Award XP to player total
      const result = await awardXP('around-the-clock-singles', 100 - totalThrows, {
        completed: true,
        xpOverride: xp.totalXP,
        sessionData: { totalThrows },
      });

      if (result.levelUp) {
        triggerLevelUp(result.levelUp.oldLevel, result.levelUp.newLevel);
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
    setXpResult(null);
    createTrainingSession(config.atcSettings);
  };

  const handleReturn = () => {
    router.push('/app/play/training');
  };

  const renderThrowButtons = () => {
    if (!state || !config?.atcSettings) return null;

    const { currentTarget } = state;
    const { segmentRule } = config.atcSettings;

    if (state.isComplete) {
      return (
        <div className="text-center py-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="inline-block p-4 sm:p-6 rounded-full bg-emerald-500/20 mb-4"
          >
            <CheckCircle2 className="h-12 w-12 text-emerald-400" />
          </motion.div>
          <p className="text-slate-400 text-lg">Session completed! Great job!</p>
        </div>
      );
    }

    const buttonVariants = {
      initial: { scale: 0.8, opacity: 0 },
      animate: { scale: 1, opacity: 1 },
      hover: { scale: 1.05 },
      tap: { scale: 0.95 }
    };

    // Mode-specific buttons
    if (currentTarget === 'bull') {
      // Bull target
      if (segmentRule === 'singles_only') {
        return (
          <div className="flex gap-4">
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="flex-1">
              <Button
                onClick={() => handleDart('SB')}
                className="h-24 w-full text-2xl font-bold bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white shadow-lg shadow-cyan-500/25 border-2 border-cyan-400/50"
              >
                Single Bull
              </Button>
            </motion.div>
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }} className="flex-1">
              <Button
                onClick={() => handleDart('MISS')}
                className="h-24 w-full text-2xl font-bold bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white border-2 border-slate-500/50"
              >
                Miss
              </Button>
            </motion.div>
          </div>
        );
      } else if (segmentRule === 'doubles_only') {
        return (
          <div className="flex gap-4">
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="flex-1">
              <Button
                onClick={() => handleDart('DB')}
                className="h-24 w-full text-2xl font-bold bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-lg shadow-red-500/25 border-2 border-red-400/50"
              >
                Double Bull
              </Button>
            </motion.div>
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }} className="flex-1">
              <Button
                onClick={() => handleDart('MISS')}
                className="h-24 w-full text-2xl font-bold bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white border-2 border-slate-500/50"
              >
                Miss
              </Button>
            </motion.div>
          </div>
        );
      } else {
        // increase_by_segment or trebles (bull doesn't have treble)
        return (
          <div className="grid grid-cols-3 gap-2 sm:flex sm:gap-4">
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="sm:flex-1">
              <Button
                onClick={() => handleDart('SB')}
                className="h-14 sm:h-24 w-full text-sm sm:text-2xl font-bold bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white shadow-lg shadow-cyan-500/25 border-2 border-cyan-400/50 px-2"
              >
                SB
              </Button>
            </motion.div>
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.05 }} className="sm:flex-1">
              <Button
                onClick={() => handleDart('DB')}
                className="h-14 sm:h-24 w-full text-sm sm:text-2xl font-bold bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-lg shadow-red-500/25 border-2 border-red-400/50 px-2"
              >
                DB
              </Button>
            </motion.div>
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }} className="col-span-3 sm:col-span-1 sm:flex-1">
              <Button
                onClick={() => handleDart('MISS')}
                className="h-12 sm:h-24 w-full text-sm sm:text-2xl font-bold bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white border-2 border-slate-500/50 px-2"
              >
                Miss
              </Button>
            </motion.div>
          </div>
        );
      }
    } else {
      // Number target (1-20)
      const targetNumber = currentTarget as number;

      if (segmentRule === 'singles_only') {
        return (
          <div className="flex gap-4">
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="flex-1">
              <Button
                onClick={() => handleDart('S', targetNumber)}
                className="h-24 w-full text-3xl font-black bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white shadow-lg shadow-cyan-500/25 border-2 border-cyan-400/50"
              >
                S{targetNumber}
              </Button>
            </motion.div>
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }} className="flex-1">
              <Button
                onClick={() => handleDart('MISS')}
                className="h-24 w-full text-2xl font-bold bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white border-2 border-slate-500/50"
              >
                Miss
              </Button>
            </motion.div>
          </div>
        );
      } else if (segmentRule === 'doubles_only') {
        return (
          <div className="flex gap-4">
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="flex-1">
              <Button
                onClick={() => handleDart('D', targetNumber)}
                className="h-24 w-full text-3xl font-black bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25 border-2 border-emerald-400/50"
              >
                D{targetNumber}
              </Button>
            </motion.div>
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }} className="flex-1">
              <Button
                onClick={() => handleDart('MISS')}
                className="h-24 w-full text-2xl font-bold bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white border-2 border-slate-500/50"
              >
                Miss
              </Button>
            </motion.div>
          </div>
        );
      } else if (segmentRule === 'trebles_only') {
        return (
          <div className="flex gap-4">
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" className="flex-1">
              <Button
                onClick={() => handleDart('T', targetNumber)}
                className="h-24 w-full text-3xl font-black bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 text-white shadow-lg shadow-teal-500/25 border-2 border-teal-400/50"
              >
                T{targetNumber}
              </Button>
            </motion.div>
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }} className="flex-1">
              <Button
                onClick={() => handleDart('MISS')}
                className="h-24 w-full text-2xl font-bold bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white border-2 border-slate-500/50"
              >
                Miss
              </Button>
            </motion.div>
          </div>
        );
      } else {
        // increase_by_segment - mobile row for S/D/T with Miss below
        return (
          <div className="grid grid-cols-3 sm:grid-cols-2 gap-2 sm:gap-4">
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap">
              <Button
                onClick={() => handleDart('S', targetNumber)}
                className="h-14 sm:h-24 w-full text-base sm:text-2xl font-bold bg-gradient-to-br from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-white shadow-lg shadow-cyan-500/25 border-2 border-cyan-400/50 px-2"
              >
                S{targetNumber}
              </Button>
            </motion.div>
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.05 }}>
              <Button
                onClick={() => handleDart('D', targetNumber)}
                className="h-14 sm:h-24 w-full text-base sm:text-2xl font-bold bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white shadow-lg shadow-emerald-500/25 border-2 border-emerald-400/50 px-2"
              >
                D{targetNumber}
              </Button>
            </motion.div>
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.1 }}>
              <Button
                onClick={() => handleDart('T', targetNumber)}
                className="h-14 sm:h-24 w-full text-base sm:text-2xl font-bold bg-gradient-to-br from-teal-500 to-teal-600 hover:from-teal-400 hover:to-teal-500 text-white shadow-lg shadow-teal-500/25 border-2 border-teal-400/50 px-2"
              >
                T{targetNumber}
              </Button>
            </motion.div>
            <motion.div variants={buttonVariants} initial="initial" animate="animate" whileHover="hover" whileTap="tap" transition={{ delay: 0.15 }} className="col-span-3 sm:col-span-1">
              <Button
                onClick={() => handleDart('MISS')}
                className="h-12 sm:h-24 w-full text-sm sm:text-2xl font-bold bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 text-white border-2 border-slate-500/50 px-2"
              >
                Miss
              </Button>
            </motion.div>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      {LevelUpToastComponent}
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Animated Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
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
            <h1 className="text-3xl font-black text-white tracking-tight">
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Around The Clock
              </span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">Hit every number in sequence</p>
          </div>
          <div className="w-20" />
        </motion.div>

        {/* Progress Bar */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="bg-gradient-to-r from-slate-800/80 to-slate-900/80 border-slate-700/50 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-400">Progress</span>
              <span className="text-sm font-bold text-emerald-400">{completedCount} / {totalCount}</span>
            </div>
            <Progress value={(completedCount / totalCount) * 100} className="h-3 bg-slate-700" />
          </Card>
        </motion.div>

        {/* Main Target Display */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20 border-blue-500/30 p-8 text-center backdrop-blur-sm relative overflow-hidden">
            {/* Animated background effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 animate-pulse" />
            
            <div className="relative z-10">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Crosshair className="h-6 w-6 text-blue-400" />
                <span className="text-lg font-medium text-blue-300">Current Target</span>
              </div>
              
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTargetLabel}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.5, opacity: 0 }}
                  className="text-7xl font-black text-white drop-shadow-lg"
                >
                  {currentTargetLabel}
                </motion.div>
              </AnimatePresence>
              
              {state.completedTargets.length > 0 && (
                <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-md mx-auto">
                  {state.completedTargets.slice(-8).map((target, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shadow-lg"
                    >
                      {getTargetLabel(target)}
                    </motion.div>
                  ))}
                  {state.completedTargets.length > 8 && (
                    <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400 text-xs">
                      +{state.completedTargets.length - 8}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Stats Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          <Card className="bg-slate-800/50 border-slate-700/50 p-4 text-center backdrop-blur-sm hover:bg-slate-800/70 transition-colors">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Zap className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="text-2xl font-black text-white">{state.totalThrows}</div>
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Throws</div>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700/50 p-4 text-center backdrop-blur-sm hover:bg-slate-800/70 transition-colors">
            <div className="flex items-center justify-center gap-2 mb-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-white">{state.hits}</div>
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Hits</div>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700/50 p-4 text-center backdrop-blur-sm hover:bg-slate-800/70 transition-colors">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Target className="h-5 w-5 text-blue-400" />
            </div>
            <div className="text-2xl font-black text-white">{accuracy}%</div>
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Accuracy</div>
          </Card>
          <Card className="bg-slate-800/50 border-slate-700/50 p-4 text-center backdrop-blur-sm hover:bg-slate-800/70 transition-colors">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Clock className="h-5 w-5 text-purple-400" />
            </div>
            <div className="text-2xl font-black text-white">{formatTime(elapsedTime)}</div>
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Time</div>
          </Card>
        </motion.div>

        {/* Throw Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="bg-slate-800/50 border-slate-700/50 p-4 sm:p-6 backdrop-blur-sm">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Crosshair className="h-5 w-5 text-blue-400" />
              Enter Your Throw
            </h3>
            {renderThrowButtons()}
          </Card>
        </motion.div>

        {/* Current Visit */}
        <AnimatePresence>
          {currentVisit.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card className="bg-slate-800/50 border-slate-700/50 p-4 backdrop-blur-sm">
                <div className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Current Visit</div>
                <div className="flex gap-3">
                  {currentVisit.map((dart, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={`px-4 py-2 rounded-lg font-bold text-white ${
                        dart.segment === 'D' ? 'bg-red-500/80' :
                        dart.segment === 'T' ? 'bg-amber-500/80' :
                        dart.segment === 'DB' ? 'bg-red-600/80' :
                        dart.segment === 'SB' ? 'bg-emerald-500/80' :
                        dart.segment === 'MISS' ? 'bg-slate-600/80' :
                        'bg-blue-500/80'
                      }`}
                    >
                      {formatThrowLabel(dart)}
                    </motion.div>
                  ))}
                  {[...Array(3 - currentVisit.length)].map((_, idx) => (
                    <div key={`empty-${idx}`} className="px-4 py-2 rounded-lg bg-slate-700/30 text-slate-600 font-bold">
                      -
                    </div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Visit History */}
        <AnimatePresence>
          {visitHistory.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card className="bg-slate-800/50 border-slate-700/50 p-4 backdrop-blur-sm">
                <div className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">Visit History</div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {visitHistory.slice(-5).map((visit, visitIdx) => (
                    <motion.div 
                      key={visitIdx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: visitIdx * 0.05 }}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="text-slate-500 font-mono w-16">Visit {visitIdx + 1}</span>
                      <div className="flex gap-2">
                        {visit.darts.map((dart, dartIdx) => (
                          <span 
                            key={dartIdx}
                            className={`px-2 py-1 rounded text-xs font-bold text-white ${
                              dart.segment === 'D' ? 'bg-red-500/60' :
                              dart.segment === 'T' ? 'bg-amber-500/60' :
                              dart.segment === 'DB' ? 'bg-red-600/60' :
                              dart.segment === 'SB' ? 'bg-emerald-500/60' :
                              dart.segment === 'MISS' ? 'bg-slate-600/60' :
                              'bg-blue-500/60'
                            }`}
                          >
                            {formatThrowLabel(dart)}
                          </span>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Dialog open={state.isComplete} onOpenChange={() => {}}>
        <DialogContent className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-3 text-3xl text-white">
              <motion.div
                initial={{ rotate: -180, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                <Trophy className="h-10 w-10 text-yellow-400" />
              </motion.div>
              <span className="bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-400 bg-clip-text text-transparent">
                Complete!
              </span>
            </DialogTitle>
          </DialogHeader>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            {/* XP Reward Display */}
            {xpResult && <XPRewardDisplay xpResult={xpResult} />}

            {/* Time Display */}
            <div className="text-center py-4 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 rounded-2xl border border-white/10">
              <div className="text-3xl sm:text-5xl font-black text-white mb-2">
                {formatTime(elapsedTime)}
              </div>
              <div className="text-slate-400 font-medium">Completion Time</div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-700/50 p-4 rounded-xl text-center border border-slate-600/50">
                <div className="text-3xl font-black text-blue-400">{state.totalThrows}</div>
                <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Throws</div>
              </div>
              <div className="bg-slate-700/50 p-4 rounded-xl text-center border border-slate-600/50">
                <div className="text-3xl font-black text-emerald-400">{state.hits}</div>
                <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Hits</div>
              </div>
              <div className="bg-slate-700/50 p-4 rounded-xl text-center border border-slate-600/50">
                <div className="text-3xl font-black text-purple-400">{accuracy}%</div>
                <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Accuracy</div>
              </div>
              <div className="bg-slate-700/50 p-4 rounded-xl text-center border border-slate-600/50">
                <div className="text-3xl font-black text-red-400">{state.misses}</div>
                <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Misses</div>
              </div>
            </div>
          </motion.div>
          
          <DialogFooter className="gap-3 mt-6">
            <Button
              onClick={handleRetry}
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold py-4 sm:py-6 text-lg shadow-lg shadow-blue-500/25"
            >
              <RotateCcw className="mr-2 h-5 w-5" />
              Play Again
            </Button>
            <Button
              onClick={handleReturn}
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white font-bold py-4 sm:py-6"
            >
              <ArrowLeft className="mr-2 h-5 w-5" />
              Exit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

