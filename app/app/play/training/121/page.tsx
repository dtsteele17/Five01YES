'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeft, Trophy, TrendingUp, Target, Flame, RotateCcw, Star, X, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { calculateCheckoutXP } from '@/lib/training/xpSystem';
import { createClient } from '@/lib/supabase/client';
import { FAILED_ATTEMPT_XP, calculate121CheckoutXP, awardXP } from '@/lib/training/xpTracker';

interface DartHit {
  segment: 'S' | 'D' | 'T' | 'SB' | 'DB' | 'MISS';
  value: number;
  label: string;
}

interface Visit {
  darts: DartHit[];
  score: number;
}

interface RoundResult {
  target: number;
  visits: Visit[];
  totalDartsUsed: number;
  success: boolean;
  isSafehouse: boolean;
  xpEarned: number;
}

export default function OneTwentyOnePage() {
  const router = useRouter();

  // Game State
  const [currentTarget, setCurrentTarget] = useState(121);
  const [highestTargetReached, setHighestTargetReached] = useState(121);
  const [remaining, setRemaining] = useState(121);
  const [currentVisitNumber, setCurrentVisitNumber] = useState(1); // 1-3 visits per round
  const [visits, setVisits] = useState<Visit[]>([]);
  const [currentDartIndex, setCurrentDartIndex] = useState(0); // 0-8 (3 visits x 3 darts)
  const [visitHistory, setVisitHistory] = useState<Visit[]>([]); // Completed visits in current round
  const [roundHistory, setRoundHistory] = useState<RoundResult[]>([]);
  const [gameActive, setGameActive] = useState(true);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [safehouseActive, setSafehouseActive] = useState(false);
  
  // Stats
  const [totalDartsThrown, setTotalDartsThrown] = useState(0);
  const [successfulCheckouts, setSuccessfulCheckouts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [sessionXP, setSessionXP] = useState(0);
  const [awardingXP, setAwardingXP] = useState(false);

  // Current visit darts (temporary storage until visit is complete)
  const [currentVisitDarts, setCurrentVisitDarts] = useState<DartHit[]>([]);

  // Input mode
  const [inputMode, setInputMode] = useState<'dart_pad' | 'typed'>('dart_pad');
  const [scoringTab, setScoringTab] = useState<'singles' | 'doubles' | 'trebles' | 'bulls'>('singles');
  const [typedScore, setTypedScore] = useState('');

  const resetRound = (newTarget: number, keepSafehouse: boolean = false) => {
    setCurrentTarget(newTarget);
    setRemaining(newTarget);
    setVisits([
      { darts: [], score: 0 },
      { darts: [], score: 0 },
      { darts: [], score: 0 },
    ]);
    setCurrentVisitNumber(1);
    setCurrentDartIndex(0);
    setVisitHistory([]); // Clear visit history on new round
    setCurrentVisitDarts([]); // Reset current visit display
    setGameActive(true);
    if (!keepSafehouse) {
      setSafehouseActive(false);
    }
  };

  const startNewGame = () => {
    setCurrentTarget(121);
    setHighestTargetReached(121);
    setRemaining(121);
    setVisits([
      { darts: [], score: 0 },
      { darts: [], score: 0 },
      { darts: [], score: 0 },
    ]);
    setCurrentVisitNumber(1);
    setCurrentDartIndex(0);
    setVisitHistory([]);
    setCurrentVisitDarts([]);
    setRoundHistory([]);
    setGameActive(true);
    setTotalDartsThrown(0);
    setSuccessfulCheckouts(0);
    setStreak(0);
    setSafehouseActive(false);
    setSessionXP(0);
    toast.success('New game started! Good luck!');
  };

  const handleDartClick = (hit: DartHit) => {
    if (!gameActive) return;

    const visitIdx = Math.floor(currentDartIndex / 3);
    const dartInVisit = currentDartIndex % 3;

    // Update visits (for round history)
    const newVisits = [...visits];
    newVisits[visitIdx] = {
      darts: [...newVisits[visitIdx].darts, hit],
      score: newVisits[visitIdx].score + hit.value,
    };

    // Update current visit darts (for display)
    setCurrentVisitDarts(prev => [...prev, hit]);

    const newRemaining = remaining - hit.value;
    const newTotalDarts = totalDartsThrown + 1;

    // Update state immediately so UI reflects the change
    setVisits(newVisits);
    setTotalDartsThrown(newTotalDarts);
    setCurrentDartIndex(currentDartIndex + 1);
    setRemaining(newRemaining);

    // Check for win (checkout on double - MUST end on a double)
    if (newRemaining === 0 && (hit.segment === 'D' || hit.segment === 'DB')) {
      // SUCCESSFUL CHECKOUT
      const dartsUsed = newTotalDarts;
      const isSafehouse = dartsUsed <= 3 && currentTarget >= 121;
      
      // Calculate XP for this checkout
      const checkoutXP = calculate121CheckoutXP(currentTarget);
      const newSessionXP = sessionXP + checkoutXP;
      
      const roundResult: RoundResult = {
        target: currentTarget,
        visits: newVisits,
        totalDartsUsed: dartsUsed,
        success: true,
        isSafehouse,
        xpEarned: checkoutXP,
      };

      setRoundHistory(prev => [...prev, roundResult]);
      setSuccessfulCheckouts(prev => prev + 1);
      setStreak(prev => {
        const newStreak = prev + 1;
        if (newStreak > bestStreak) setBestStreak(newStreak);
        return newStreak;
      });
      setSessionXP(newSessionXP);

      toast.success(
        <div className="space-y-1">
          <div className="font-bold">CHECKOUT! {currentTarget} completed in {dartsUsed} darts!</div>
          <div className="text-amber-300 text-sm">+{checkoutXP} XP Earned!</div>
        </div>
      );

      // Move up to next target
      const nextTarget = currentTarget + 1;
      if (nextTarget > highestTargetReached) {
        setHighestTargetReached(nextTarget);
      }
      
      setGameActive(false);
      setTimeout(() => {
        resetRound(nextTarget, isSafehouse);
        if (isSafehouse) {
          toast.info('Safehouse! You cannot fall below this target next round.');
        }
      }, 1500);
      return;
    }

    // Check for bust (remaining < 0 OR remaining === 1 OR reached 0 without a double)
    if (newRemaining < 0 || newRemaining === 1 || newRemaining === 0) {
      // If remaining is 0 but not a double, it's a bust
      if (newRemaining === 0) {
        toast.error('Bust! Must finish on a double!');
      } else {
        toast.error('Bust!');
      }
      handleRoundFail(newVisits, true, newTotalDarts);
      return;
    }

    // Check if this is the end of a visit (3 darts)
    if (dartInVisit === 2) {
      // End of visit, save to history and reset current visit
      const completedVisit = newVisits[visitIdx];
      setVisitHistory(prev => [...prev, completedVisit]);
      setCurrentVisitDarts([]); // Reset current visit display
      
      // Check if we have more visits
      if (visitIdx >= 2) {
        // Used all 9 darts, failed
        handleRoundFail(newVisits, false, newTotalDarts);
      } else {
        // Move to next visit
        setCurrentVisitNumber(prev => prev + 1);
        toast.info(`Visit ${visitIdx + 1} complete. ${newRemaining} remaining.`);
      }
    }
  };

  const handleRoundFail = (finalVisits: Visit[], bust: boolean, dartsUsed: number) => {
    // Award small XP for failed attempt
    const failXP = FAILED_ATTEMPT_XP;
    const newSessionXP = sessionXP + failXP;
    
    const roundResult: RoundResult = {
      target: currentTarget,
      visits: finalVisits,
      totalDartsUsed: dartsUsed,
      success: false,
      isSafehouse: false,
      xpEarned: failXP,
    };

    setRoundHistory(prev => [...prev, roundResult]);
    setStreak(0);
    setSessionXP(newSessionXP);

    // Determine next target
    let nextTarget: number;
    if (safehouseActive) {
      nextTarget = currentTarget;
      toast.error(
        <div className="space-y-1">
          <div>{bust ? 'Bust!' : 'Failed!'} Safehouse protects you at {currentTarget}!</div>
          <div className="text-amber-300 text-xs">+{failXP} XP</div>
        </div>
      );
    } else {
      nextTarget = Math.max(121, currentTarget - 1);
      toast.error(
        <div className="space-y-1">
          <div>{bust ? 'Bust!' : 'Failed to checkout!'} Dropping to {nextTarget}</div>
          <div className="text-amber-300 text-xs">+{failXP} XP</div>
        </div>
      );
    }

    setGameActive(false);
    setTimeout(() => {
      resetRound(nextTarget, safehouseActive);
    }, 2000);
  };

  const handleTypedSubmit = () => {
    const score = parseInt(typedScore);
    if (isNaN(score) || score < 0 || score > 180) {
      toast.error('Please enter a valid score (0-180)');
      return;
    }

    const newRemaining = remaining - score;
    
    // Determine how many darts were used (estimate based on score)
    // If it's a checkout, assume it took the minimum darts needed
    let dartsNeeded = 3;
    if (score === 0) dartsNeeded = 3;
    else if (score >= 100) dartsNeeded = 3; // Likely took 3 darts for high scores
    else if (score >= 60) dartsNeeded = Math.min(3, Math.ceil(score / 40)); // Estimate
    else dartsNeeded = Math.min(3, Math.max(1, Math.ceil(score / 20)));
    
    // Create generic darts for the visit
    const genericDarts: DartHit[] = Array(dartsNeeded).fill({
      segment: 'S' as const,
      value: Math.floor(score / dartsNeeded),
      label: 'Vis',
    });

    const visitIdx = Math.floor(currentDartIndex / 3);
    const newVisits = [...visits];
    newVisits[visitIdx] = {
      darts: genericDarts,
      score: score,
    };

    // Update state immediately for UI feedback
    setVisits(newVisits);
    setRemaining(newRemaining);
    // Show darts in current visit
    setCurrentVisitDarts(genericDarts);

    // Check for checkout success (typed mode allows checkout at 0 without double requirement)
    if (newRemaining === 0) {
      const dartsUsed = totalDartsThrown + dartsNeeded;
      const isSafehouse = dartsUsed <= 3 && currentTarget >= 121;
      
      // Calculate XP for this checkout
      const checkoutXP = calculate121CheckoutXP(currentTarget);
      const newSessionXP = sessionXP + checkoutXP;
      
      const roundResult: RoundResult = {
        target: currentTarget,
        visits: newVisits,
        totalDartsUsed: dartsUsed,
        success: true,
        isSafehouse,
        xpEarned: checkoutXP,
      };

      setRoundHistory(prev => [...prev, roundResult]);
      setSuccessfulCheckouts(prev => prev + 1);
      setStreak(prev => {
        const newStreak = prev + 1;
        if (newStreak > bestStreak) setBestStreak(newStreak);
        return newStreak;
      });
      setTotalDartsThrown(dartsUsed);
      setSessionXP(newSessionXP);

      toast.success(
        <div className="space-y-1">
          <div className="font-bold">CHECKOUT! {currentTarget} completed!</div>
          <div className="text-amber-300 text-sm">+{checkoutXP} XP Earned!</div>
        </div>
      );

      const nextTarget = currentTarget + 1;
      if (nextTarget > highestTargetReached) {
        setHighestTargetReached(nextTarget);
      }

      setGameActive(false);
      setTimeout(() => {
        resetRound(nextTarget, isSafehouse);
        if (isSafehouse) {
          toast.info('Safehouse activated!');
        }
      }, 1500);
    } else if (newRemaining < 0 || newRemaining === 1) {
      toast.error('Bust!');
      const dartsUsed = totalDartsThrown + dartsNeeded;
      handleRoundFail(newVisits, true, dartsUsed);
    } else {
      // Continue to next visit - add to visit history and reset current visit
      const completedVisit = newVisits[visitIdx];
      setVisitHistory(prev => [...prev, completedVisit]);
      setCurrentVisitDarts([]); // Reset current visit display
      
      setTotalDartsThrown(prev => prev + dartsNeeded);
      
      const newDartIndex = currentDartIndex + dartsNeeded;
      setCurrentDartIndex(newDartIndex);
      
      const newVisitNumber = Math.floor(newDartIndex / 3) + 1;
      
      if (newVisitNumber > 3) {
        handleRoundFail(newVisits, false, totalDartsThrown + dartsNeeded);
      } else {
        setCurrentVisitNumber(newVisitNumber);
        toast.info(`Visit complete. ${newRemaining} remaining.`);
      }
    }

    setTypedScore('');
  };

  const handleMiss = () => {
    handleDartClick({ segment: 'MISS', value: 0, label: 'Miss' });
  };

  const getProgressColor = () => {
    if (currentTarget <= 130) return 'from-blue-500 to-blue-600';
    if (currentTarget <= 150) return 'from-emerald-500 to-emerald-600';
    if (currentTarget <= 170) return 'from-amber-500 to-orange-500';
    return 'from-red-500 to-red-600';
  };

  const getDifficultyLabel = () => {
    if (currentTarget <= 130) return 'Beginner';
    if (currentTarget <= 150) return 'Intermediate';
    if (currentTarget <= 170) return 'Advanced';
    return 'Expert';
  };

  // Award all session XP to the user
  const handleBackToTrainingHub = async () => {
    if (sessionXP > 0 && !awardingXP) {
      setAwardingXP(true);
      try {
        const result = await awardXP('121', 0, {
          completed: true,
          xpOverride: sessionXP, // Use accumulated session XP
          sessionData: {
            highestTarget: highestTargetReached,
            successfulCheckouts,
            totalRounds: roundHistory.length,
          },
        });
        
        if (result.success) {
          toast.success(`+${sessionXP} XP added to your profile!`, { duration: 4000 });
        }
      } catch (err) {
        console.error('Error awarding XP:', err);
      } finally {
        setAwardingXP(false);
      }
    }
    router.push('/app/play/training');
  };

  // Get current dart slot position
  const getCurrentSlot = () => {
    const visit = Math.floor(currentDartIndex / 3);
    const dart = currentDartIndex % 3;
    return { visit, dart };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => router.push('/app/play/training')}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
              <Flame className="w-6 h-6 text-orange-500" />
              121
            </h1>
            <p className="text-xs text-slate-400">Checkout in 9 darts or less</p>
          </div>
          <Button
            variant="outline"
            onClick={startNewGame}
            className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restart
          </Button>
        </div>

        {/* Main Stats Card */}
        <Card className="bg-gradient-to-r from-slate-800/80 to-slate-900/80 border-slate-700 p-6">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="space-y-1">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Current Target</div>
              <div className={`text-4xl font-bold bg-gradient-to-r ${getProgressColor()} bg-clip-text text-transparent`}>
                {currentTarget}
              </div>
              <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">
                {getDifficultyLabel()}
              </Badge>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Remaining</div>
              <div className="text-4xl font-bold text-white">{remaining}</div>
              <div className="text-xs text-slate-500">Visit {currentVisitNumber}/3</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Best Target</div>
              <div className="text-4xl font-bold text-emerald-400">{highestTargetReached}</div>
              <div className="text-xs text-emerald-500">Personal Best</div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-slate-400 uppercase tracking-wider">Streak</div>
              <div className="text-4xl font-bold text-orange-400">{streak}</div>
              <div className="text-xs text-orange-500">Best: {bestStreak}</div>
            </div>
          </div>
        </Card>

        {/* Safehouse Indicator */}
        {safehouseActive && (
          <Card className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/50 p-4">
            <div className="flex items-center justify-center gap-2 text-amber-400">
              <Trophy className="w-5 h-5" />
              <span className="font-semibold">Safehouse Active!</span>
              <span className="text-sm text-amber-300">You cannot fall below {currentTarget}</span>
            </div>
          </Card>
        )}

        {/* Current Visit Display with Compact History */}
        <Card className="bg-slate-800/50 border-slate-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-semibold text-white">Current Visit</div>
            <div className="text-emerald-400 font-semibold">
              Target: {currentTarget} | Remaining: {remaining}
            </div>
          </div>
          
          <div className="flex gap-4">
            {/* Current Visit - 3 Dart Slots */}
            <div className="flex-1">
              <div className="p-4 rounded-lg border bg-orange-500/10 border-orange-500/30">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-orange-400">
                    Current Visit
                  </span>
                  {currentVisitDarts.length > 0 && (
                    <span className="text-sm text-emerald-400">
                      Score: {currentVisitDarts.reduce((sum, d) => sum + d.value, 0)}
                    </span>
                  )}
                </div>
                
                {/* 3 Dart Slots - Shows current visit darts */}
                <div className="flex gap-3 justify-center">
                  {[0, 1, 2].map((dartIdx) => {
                    const dart = currentVisitDarts[dartIdx];
                    // Current dart position within the visit (0, 1, or 2)
                    const currentDartInVisit = currentVisitDarts.length;
                    const isCurrentDart = dartIdx === currentDartInVisit && gameActive;
                    
                    if (dart) {
                      return (
                        <Badge
                          key={dartIdx}
                          className={`text-xl px-6 py-3 ${
                            dart.segment === 'D' || dart.segment === 'DB'
                              ? 'bg-red-500/20 border-red-500 text-red-400'
                              : dart.segment === 'T'
                              ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                              : dart.segment === 'MISS'
                              ? 'bg-slate-600/30 border-slate-500 text-slate-500'
                              : 'bg-slate-600/30 border-slate-500 text-slate-300'
                          }`}
                        >
                          {dart.label}
                        </Badge>
                      );
                    }
                    
                    // Empty slot
                    return (
                      <div
                        key={dartIdx}
                        className={`w-20 h-14 rounded-lg border-2 border-dashed flex items-center justify-center text-lg font-bold ${
                          isCurrentDart
                            ? 'border-orange-400 bg-orange-500/10 text-orange-400 animate-pulse'
                            : 'border-slate-600 text-slate-600'
                        }`}
                      >
                        {isCurrentDart ? '?' : '-'}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            {/* Compact Visit History */}
            <div className="w-48">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-2 text-center">
                Visit History
              </div>
              <div className="space-y-2">
                {visitHistory.length === 0 ? (
                  <div className="text-center text-slate-600 text-sm py-4">
                    No visits yet
                  </div>
                ) : (
                  visitHistory.map((visit, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-lg bg-slate-700/30 border border-slate-600/50"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-400">Visit {idx + 1}</span>
                        <span className="text-emerald-400 font-semibold">{visit.score}</span>
                      </div>
                      <div className="flex gap-1">
                        {visit.darts.map((dart, dartIdx) => (
                          <div
                            key={dartIdx}
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              dart.segment === 'D' || dart.segment === 'DB'
                                ? 'bg-red-500/20 text-red-400'
                                : dart.segment === 'T'
                                ? 'bg-amber-500/20 text-amber-400'
                                : dart.segment === 'MISS'
                                ? 'bg-slate-600/30 text-slate-500'
                                : 'bg-slate-600/30 text-slate-400'
                            }`}
                          >
                            {dart.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
                {/* Placeholder for future visits */}
                {[...Array(2 - visitHistory.length)].map((_, idx) => (
                  <div
                    key={`empty-${idx}`}
                    className="p-2 rounded-lg border border-dashed border-slate-700/50 text-center text-slate-700 text-xs"
                  >
                    Visit {visitHistory.length + idx + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Scoring Panel */}
        <Card className="bg-slate-800/50 border-slate-700 p-6">
          <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'dart_pad' | 'typed')}>
            <TabsList className="bg-slate-700/50 w-full grid grid-cols-2 mb-4">
              <TabsTrigger value="dart_pad" className="data-[state=active]:bg-orange-500">
                Dart by Dart
              </TabsTrigger>
              <TabsTrigger value="typed" className="data-[state=active]:bg-orange-500">
                Typed Visit
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dart_pad">
              <Tabs value={scoringTab} onValueChange={(v) => setScoringTab(v as any)}>
                <TabsList className="bg-slate-700/50 w-full grid grid-cols-4 mb-4">
                  <TabsTrigger value="singles" className="data-[state=active]:bg-blue-500">
                    Singles
                  </TabsTrigger>
                  <TabsTrigger value="doubles" className="data-[state=active]:bg-red-500">
                    Doubles
                  </TabsTrigger>
                  <TabsTrigger value="trebles" className="data-[state=active]:bg-amber-500">
                    Trebles
                  </TabsTrigger>
                  <TabsTrigger value="bulls" className="data-[state=active]:bg-emerald-500">
                    Bulls
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="singles">
                  <div className="grid grid-cols-10 gap-2">
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                      <Button
                        key={`S${num}`}
                        onClick={() => handleDartClick({ segment: 'S', value: num, label: `S${num}` })}
                        disabled={!gameActive}
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
                        onClick={() => handleDartClick({ segment: 'D', value: num * 2, label: `D${num}` })}
                        disabled={!gameActive}
                        className="h-14 bg-red-600 hover:bg-red-700 text-white font-semibold disabled:opacity-30"
                      >
                        D{num}
                      </Button>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="trebles">
                  <div className="grid grid-cols-10 gap-2">
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                      <Button
                        key={`T${num}`}
                        onClick={() => handleDartClick({ segment: 'T', value: num * 3, label: `T${num}` })}
                        disabled={!gameActive}
                        className="h-14 bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-30"
                      >
                        T{num}
                      </Button>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="bulls">
                  <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                    <Button
                      onClick={() => handleDartClick({ segment: 'SB', value: 25, label: 'SB' })}
                      disabled={!gameActive}
                      className="h-20 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold disabled:opacity-30"
                    >
                      Single Bull (25)
                    </Button>
                    <Button
                      onClick={() => handleDartClick({ segment: 'DB', value: 50, label: 'DB' })}
                      disabled={!gameActive}
                      className="h-20 bg-red-600 hover:bg-red-700 text-white text-lg font-semibold disabled:opacity-30"
                    >
                      Double Bull (50)
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>

              <div className="grid grid-cols-2 gap-4 mt-4 max-w-2xl mx-auto">
                <Button
                  onClick={handleMiss}
                  disabled={!gameActive}
                  className="h-16 bg-slate-600 hover:bg-slate-700 text-white text-lg font-bold disabled:opacity-30"
                >
                  MISS (0)
                </Button>
                <Button
                  onClick={() => handleRoundFail(visits, true, totalDartsThrown)}
                  disabled={!gameActive}
                  className="h-16 bg-red-600 hover:bg-red-700 text-white text-lg font-bold disabled:opacity-30"
                >
                  BUST / GIVE UP
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="typed">
              <div className="max-w-md mx-auto space-y-4">
                <div className="text-center text-slate-400 text-sm mb-2">
                  Enter the total score for this visit (0-180)
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max="180"
                    value={typedScore}
                    onChange={(e) => setTypedScore(e.target.value)}
                    placeholder="Enter score..."
                    className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-3 text-white text-center text-xl focus:outline-none focus:border-orange-500"
                  />
                  <Button
                    onClick={handleTypedSubmit}
                    disabled={!typedScore || !gameActive}
                    className="bg-orange-600 hover:bg-orange-700 text-white px-8 disabled:opacity-50"
                  >
                    Submit
                  </Button>
                </div>
                <Button
                  onClick={() => handleRoundFail(visits, true, totalDartsThrown)}
                  disabled={!gameActive}
                  variant="destructive"
                  className="w-full"
                >
                  Bust / Give Up This Round
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </Card>

        {/* History */}
        {roundHistory.length > 0 && (
          <Card className="bg-slate-800/50 border-slate-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-white flex items-center gap-2">
                <Target className="w-4 h-4" />
                Round History
              </div>
              <div className="text-xs text-slate-400">
                {successfulCheckouts}/{roundHistory.length} successful
              </div>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {[...roundHistory].reverse().slice(0, 10).map((round, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    round.success
                      ? 'bg-emerald-500/10 border border-emerald-500/30'
                      : 'bg-red-500/10 border border-red-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`text-lg font-bold ${round.success ? 'text-emerald-400' : 'text-red-400'}`}>
                      {round.target}
                    </div>
                    <div className="text-xs text-slate-400">
                      {round.success ? (
                        <span className="flex items-center gap-1">
                          <Trophy className="w-3 h-3" />
                          {round.totalDartsUsed} darts
                          {round.isSafehouse && ' (Safehouse)'}
                        </span>
                      ) : (
                        'Failed'
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {round.xpEarned > 0 && (
                      <span className="text-xs text-amber-400 font-semibold">
                        +{round.xpEarned} XP
                      </span>
                    )}
                    <Badge
                      className={
                        round.success
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/20 text-red-400'
                      }
                    >
                      {round.success ? 'Success' : 'Failed'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* End Session Button */}
        <div className="flex justify-center pb-8">
          <Button
            onClick={() => setShowStatsModal(true)}
            className="h-14 px-12 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white text-lg font-semibold"
          >
            <TrendingUp className="mr-2 h-5 w-5" />
            End Session & View Stats
          </Button>
        </div>

        {/* Stats Modal */}
        <Dialog open={showStatsModal} onOpenChange={setShowStatsModal}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-center mb-4">
                121 Training Session Stats
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* XP Earned */}
              <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-lg p-6 text-center border border-amber-500/30">
                <div className="text-amber-300 text-sm uppercase tracking-wider mb-2">
                  XP Earned This Session
                </div>
                <div className="text-5xl font-bold text-white flex items-center justify-center gap-2">
                  <Star className="w-8 h-8 text-amber-400" />
                  {sessionXP}
                </div>
                <div className="text-xs text-amber-400 mt-2">
                  Will be added to your profile when you return to Training Hub
                </div>
              </div>

              {/* Main Stats */}
              <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-lg p-6 text-center border border-orange-500/30">
                <div className="text-orange-300 text-sm uppercase tracking-wider mb-2">
                  Highest Target Reached
                </div>
                <div className="text-6xl font-bold text-orange-400">{highestTargetReached}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">
                    Total Darts
                  </div>
                  <div className="text-3xl font-bold text-white">{totalDartsThrown}</div>
                </div>

                <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">
                    Checkouts
                  </div>
                  <div className="text-3xl font-bold text-emerald-400">
                    {successfulCheckouts}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">
                    Best Streak
                  </div>
                  <div className="text-3xl font-bold text-orange-400">{bestStreak}</div>
                </div>

                <div className="bg-slate-700/30 rounded-lg p-4 text-center">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-2">
                    Success Rate
                  </div>
                  <div className="text-3xl font-bold text-blue-400">
                    {roundHistory.length > 0
                      ? ((successfulCheckouts / roundHistory.length) * 100).toFixed(1)
                      : '0.0'}%
                  </div>
                </div>
              </div>

              {/* Safehouses Earned */}
              {roundHistory.filter(r => r.isSafehouse).length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 text-center">
                  <div className="text-amber-300 text-sm uppercase tracking-wider mb-2">
                    Safehouses Earned
                  </div>
                  <div className="text-3xl font-bold text-amber-400">
                    {roundHistory.filter(r => r.isSafehouse).length}
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
                Continue Playing
              </Button>
              <Button
                onClick={handleBackToTrainingHub}
                disabled={awardingXP}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
              >
                {awardingXP ? (
                  <span className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Back to Training Hub
                    <ChevronRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Floating XP Indicator */}
        <div className="fixed bottom-4 right-4 bg-gradient-to-r from-amber-500/90 to-orange-500/90 text-white px-4 py-3 rounded-lg shadow-lg border border-amber-400/30">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-200" />
            <div>
              <div className="text-xs text-amber-100">Session XP</div>
              <div className="text-xl font-bold">{sessionXP}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
