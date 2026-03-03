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
import { ArrowLeft, Trophy, TrendingUp, Target, Flame, RotateCcw, Star } from 'lucide-react';
import { toast } from 'sonner';
import { calculateCheckoutXP } from '@/lib/training/xpSystem';
import { createClient } from '@/lib/supabase/client';
import { FAILED_ATTEMPT_XP, calculate121CheckoutXP, awardXP } from '@/lib/training/xpTracker';
import { useLevelUpToast } from '@/components/training/LevelUpToast';

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
  darts: string[];
  visitTotals: number[];
  totalDartsUsed: number;
  success: boolean;
  isSafehouse: boolean;
}

export default function OneTwentyOnePage() {
  const router = useRouter();

  // Game State
  const [currentTarget, setCurrentTarget] = useState(121);
  const [highestTargetReached, setHighestTargetReached] = useState(121);
  const [currentDarts, setCurrentDarts] = useState<DartHit[]>([]);
  const [visitHistory, setVisitHistory] = useState<Visit[]>([]);
  const [remaining, setRemaining] = useState(121);
  const [visitNumber, setVisitNumber] = useState(1); // 1-3 visits per round
  const [currentVisitScore, setCurrentVisitScore] = useState(0);
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
  const { triggerLevelUp, LevelUpToastComponent } = useLevelUpToast();

  // Input mode
  const [inputMode, setInputMode] = useState<'dart_pad' | 'typed'>('dart_pad');
  const [scoringTab, setScoringTab] = useState<'singles' | 'doubles' | 'trebles' | 'bulls'>('singles');
  const [typedScore, setTypedScore] = useState('');

  const resetRound = (newTarget: number, keepSafehouse: boolean = false) => {
    setCurrentTarget(newTarget);
    setRemaining(newTarget);
    setCurrentDarts([]);
    setVisitHistory([]);
    setVisitNumber(1);
    setCurrentVisitScore(0);
    setGameActive(true);
    if (!keepSafehouse) {
      setSafehouseActive(false);
    }
  };

  const startNewGame = () => {
    setCurrentTarget(121);
    setHighestTargetReached(121);
    setRemaining(121);
    setCurrentDarts([]);
    setVisitNumber(1);
    setCurrentVisitScore(0);
    setVisitHistory([]);
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

    // Add dart to current visit
    const newCurrentDarts = [...currentDarts, hit];
    const newRemaining = remaining - hit.value;
    const newVisitScore = currentVisitScore + hit.value;

    setCurrentDarts(newCurrentDarts);
    setTotalDartsThrown(prev => prev + 1);

    // Calculate total darts in this round so far
    const totalDartsInRound = (visitNumber - 1) * 3 + newCurrentDarts.length;

    // Check for win (checkout on double)
    if (newRemaining === 0 && (hit.segment === 'D' || hit.segment === 'DB')) {
      // SUCCESSFUL CHECKOUT
      const dartsInThisVisit = newCurrentDarts.length;
      const isSafehouse = dartsInThisVisit <= 3 && currentTarget >= 121;
      
      // Save the completed visit to history
      const completedVisit: Visit = {
        darts: newCurrentDarts,
        score: newVisitScore,
      };
      setVisitHistory(prev => [...prev, completedVisit]);
      
      const roundResult: RoundResult = {
        target: currentTarget,
        darts: [...visitHistory.flatMap(v => v.darts.map(d => d.label)), ...newCurrentDarts.map(d => d.label)],
        visitTotals: [...visitHistory.map(v => v.score), newVisitScore],
        totalDartsUsed: totalDartsInRound,
        success: true,
        isSafehouse,
      };

      setRoundHistory(prev => [...prev, roundResult]);
      setSuccessfulCheckouts(prev => prev + 1);
      setStreak(prev => {
        const newStreak = prev + 1;
        if (newStreak > bestStreak) setBestStreak(newStreak);
        return newStreak;
      });

      // Award XP for checkout
      const checkoutXP = calculate121CheckoutXP(currentTarget);
      setSessionXP(prev => prev + checkoutXP);

      toast.success(
        <div className="space-y-1">
          <div>CHECKOUT! {currentTarget} in {totalDartsInRound} darts!</div>
          <div className="text-amber-300 text-sm">+{checkoutXP} XP</div>
        </div>
      );

      // Move up to next target
      const nextTarget = currentTarget + 1;
      if (nextTarget > highestTargetReached) {
        setHighestTargetReached(nextTarget);
      }
      
      // Small delay before next round
      setTimeout(() => {
        resetRound(nextTarget, isSafehouse);
        if (isSafehouse) {
          toast.info('Safehouse! You cannot fall below this target next round.');
        }
      }, 1500);
      return;
    }

    // Check for bust - remaining < 0, === 1, or === 0 without a double
    if (newRemaining < 0 || newRemaining === 1 || newRemaining === 0) {
      if (newRemaining === 0) {
        toast.error('Bust! Must finish on a double!');
      } else {
        toast.error('Bust!');
      }
      // Save current visit before failing
      const completedVisit: Visit = { darts: newCurrentDarts, score: newVisitScore };
      setVisitHistory(prev => [...prev, completedVisit]);
      handleRoundFail([...visitHistory.flatMap(v => v.darts), ...newCurrentDarts], true);
      return;
    }

    // Check if this is the end of a visit (3 darts in current visit)
    if (newCurrentDarts.length >= 3) {
      // Save completed visit to history
      const completedVisit: Visit = {
        darts: newCurrentDarts,
        score: newVisitScore,
      };
      
      // End of visit, check if we have more visits
      if (visitNumber >= 3) {
        // Used all 9 darts, failed
        setVisitHistory(prev => [...prev, completedVisit]);
        handleRoundFail([...visitHistory.flatMap(v => v.darts), ...newCurrentDarts], false);
      } else {
        // Move to next visit - clear current darts for new visit
        setTimeout(() => {
          setVisitHistory(prev => [...prev, completedVisit]);
          setCurrentDarts([]);
          setVisitNumber(prev => prev + 1);
          setCurrentVisitScore(0);
          setRemaining(newRemaining);
          toast.info(`Visit ${visitNumber} complete. ${newRemaining} remaining.`);
        }, 500);
      }
    } else {
      setRemaining(newRemaining);
      setCurrentVisitScore(newVisitScore);
    }
  };

  const handleRoundFail = (allDarts: DartHit[], bust: boolean) => {
    const roundResult: RoundResult = {
      target: currentTarget,
      darts: allDarts.map(d => d.label),
      visitTotals: visitHistory.map(v => v.score),
      totalDartsUsed: allDarts.length,
      success: false,
      isSafehouse: false,
    };

    setRoundHistory(prev => [...prev, roundResult]);
    setStreak(0);

    // Award XP for failed attempt
    const failXP = FAILED_ATTEMPT_XP;
    setSessionXP(prev => prev + failXP);

    // Determine next target
    let nextTarget: number;
    if (safehouseActive) {
      nextTarget = currentTarget;
      toast.error(
        <div className="space-y-1">
          <div>{bust ? 'Bust!' : 'Failed!'} Safehouse at {currentTarget}!</div>
          <div className="text-amber-300 text-xs">+{failXP} XP</div>
        </div>
      );
    } else {
      nextTarget = Math.max(121, currentTarget - 1);
      toast.error(
        <div className="space-y-1">
          <div>{bust ? 'Bust!' : 'Failed!'} Dropping to {nextTarget}</div>
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
    const dartsNeeded = 3;
    
    // Create generic darts for the visit
    const genericDarts: DartHit[] = Array(dartsNeeded).fill({
      segment: 'S' as const,
      value: Math.floor(score / dartsNeeded),
      label: 'Vis',
    });

    const newCurrentDarts = [...currentDarts, ...genericDarts];
    const totalDartsInRound = (visitNumber - 1) * 3 + newCurrentDarts.length;

    // Check for checkout success
    if (newRemaining === 0) {
      const isSafehouse = dartsNeeded === 3 && currentTarget >= 121;
      
      // Save completed visit
      const completedVisit: Visit = { darts: genericDarts, score };
      setVisitHistory(prev => [...prev, completedVisit]);
      
      const roundResult: RoundResult = {
        target: currentTarget,
        darts: [...visitHistory.flatMap(v => v.darts.map(d => d.label)), ...newCurrentDarts.map(d => d.label)],
        visitTotals: [...visitHistory.map(v => v.score), score],
        totalDartsUsed: totalDartsInRound,
        success: true,
        isSafehouse,
      };

      setRoundHistory(prev => [...prev, roundResult]);
      setSuccessfulCheckouts(prev => prev + 1);
      setStreak(prev => {
        const newStreak = prev + 1;
        if (newStreak > bestStreak) setBestStreak(newStreak);
        return newStreak;
      });
      setTotalDartsThrown(prev => prev + dartsNeeded);

      // Award XP for checkout (typed mode)
      const checkoutXP = calculate121CheckoutXP(currentTarget);
      setSessionXP(prev => prev + checkoutXP);

      toast.success(
        <div className="space-y-1">
          <div>CHECKOUT! {currentTarget} completed!</div>
          <div className="text-amber-300 text-sm">+{checkoutXP} XP</div>
        </div>
      );

      const nextTarget = currentTarget + 1;
      if (nextTarget > highestTargetReached) {
        setHighestTargetReached(nextTarget);
      }

      setTimeout(() => {
        resetRound(nextTarget, isSafehouse);
        if (isSafehouse) {
          toast.info('Safehouse activated!');
        }
      }, 1500);
    } else if (newRemaining < 0 || newRemaining === 1) {
      toast.error('Bust!');
      const completedVisit: Visit = { darts: genericDarts, score };
      setVisitHistory(prev => [...prev, completedVisit]);
      handleRoundFail([...visitHistory.flatMap(v => v.darts), ...newCurrentDarts], true);
    } else {
      // Continue to next visit
      setCurrentDarts(newCurrentDarts);
      setRemaining(newRemaining);
      setTotalDartsThrown(prev => prev + dartsNeeded);
      
      if (visitNumber >= 3) {
        const completedVisit: Visit = { darts: genericDarts, score };
        setVisitHistory(prev => [...prev, completedVisit]);
        handleRoundFail([...visitHistory.flatMap(v => v.darts), ...newCurrentDarts], false);
      } else {
        // Save visit and clear for new visit after delay
        const completedVisit: Visit = { darts: genericDarts, score };
        setTimeout(() => {
          setVisitHistory(prev => [...prev, completedVisit]);
          setCurrentDarts([]);
          setVisitNumber(prev => prev + 1);
          toast.info(`Visit complete. ${newRemaining} remaining.`);
        }, 500);
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

  // Save session XP when leaving
  const handleSaveAndExit = async () => {
    console.log('[121] handleSaveAndExit called, sessionXP:', sessionXP);
    const supabase = createClient();
    
    if (sessionXP > 0) {
      try {
        console.log('[121] Calling awardXP with:', { mode: '121', xpOverride: sessionXP });
        
        const result = await awardXP('121', 0, {
          completed: true,
          xpOverride: sessionXP,
          sessionData: {
            highestTarget: highestTargetReached,
            successfulCheckouts,
            totalRounds: roundHistory.length,
          },
        });
        
        console.log('[121] AwardXP result:', JSON.stringify(result, null, 2));
        
        if (result.levelUp) {
          triggerLevelUp(result.levelUp.oldLevel, result.levelUp.newLevel);
        }
        
        if (result.success) {
          // Verify the save by querying the database
          console.log('[121] Verifying save by querying training_stats...');
          const { data: verifyData, error: verifyError } = await supabase
            .from('training_stats')
            .select('*')
            .eq('player_id', (await supabase.auth.getUser()).data.user?.id)
            .order('created_at', { ascending: false })
            .limit(5);
            
          if (verifyError) {
            console.error('[121] Error verifying save:', verifyError);
          } else {
            console.log('[121] Recent training_stats records:', verifyData);
            const totalFromDb = verifyData?.reduce((sum, r) => sum + (r.xp_earned || 0), 0) || 0;
            console.log('[121] Total XP from last 5 records:', totalFromDb);
          }
          
          toast.success(`✅ +${sessionXP} XP saved!`, { duration: 5000 });
          
          if (result.levelUp) {
            toast.success(`🎉 Level Up! ${result.levelUp.oldLevel} → ${result.levelUp.newLevel}`, { duration: 5000 });
          }
          // Wait for database to commit before navigating
          console.log('[121] XP saved successfully, waiting before navigation...');
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          console.error('[121] Failed to save XP:', result.error);
          toast.error('Failed to save XP: ' + (result.error || 'Unknown error'), { duration: 3000 });
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err) {
        console.error('[121] Exception saving XP:', err);
        toast.error('Error saving XP: ' + (err instanceof Error ? err.message : String(err)), { duration: 3000 });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } else {
      console.log('[121] No XP to save (sessionXP is 0)');
    }
    
    console.log('[121] Navigating to training hub...');
    router.push('/app/play/training');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      {LevelUpToastComponent}
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleSaveAndExit}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Save & Exit
          </Button>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
              <Flame className="w-6 h-6 text-orange-500" />
              121 Training
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
        <Card className="bg-gradient-to-r from-slate-800/80 to-slate-900/80 border-slate-700 p-3 sm:p-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 text-center">
            <div className="space-y-0.5 sm:space-y-1">
              <div className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">Current Target</div>
              <div className={`text-xl sm:text-4xl font-bold bg-gradient-to-r ${getProgressColor()} bg-clip-text text-transparent`}>
                {currentTarget}
              </div>
              <Badge variant="outline" className="border-slate-600 text-slate-400 text-[10px] sm:text-xs px-1.5 py-0 sm:px-2 sm:py-0.5">
                {getDifficultyLabel()}
              </Badge>
            </div>
            <div className="space-y-0.5 sm:space-y-1">
              <div className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">Remaining</div>
              <div className="text-xl sm:text-4xl font-bold text-white">{remaining}</div>
              <div className="text-[10px] sm:text-xs text-slate-500">Visit {visitNumber}/3</div>
            </div>
            <div className="space-y-0.5 sm:space-y-1">
              <div className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">Best Target</div>
              <div className="text-xl sm:text-4xl font-bold text-emerald-400">{highestTargetReached}</div>
              <div className="text-[10px] sm:text-xs text-emerald-500">Personal Best</div>
            </div>
            <div className="space-y-0.5 sm:space-y-1">
              <div className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">Streak</div>
              <div className="text-xl sm:text-4xl font-bold text-orange-400">{streak}</div>
              <div className="text-[10px] sm:text-xs text-orange-500">Best: {bestStreak}</div>
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

        {/* Current Visit and History Display */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Current Visit */}
          <Card className="bg-slate-800/50 border-slate-700 p-4 col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">
                Current Visit {visitNumber}/3 (Dart {Math.min(currentDarts.length + 1, 3)}/3)
              </div>
              <div className="text-emerald-400 font-semibold">
                This visit: {currentDarts.reduce((sum, d) => sum + d.value, 0)} | Remaining: {remaining}
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              {currentDarts.map((dart, idx) => (
                <Badge
                  key={idx}
                  className={`text-lg px-4 py-2 ${
                    dart.segment === 'D' || dart.segment === 'DB'
                      ? 'bg-red-500/20 border-red-500 text-red-400'
                      : dart.segment === 'T'
                      ? 'bg-amber-500/20 border-amber-500 text-amber-400'
                      : 'bg-slate-600/30 border-slate-500 text-slate-300'
                  }`}
                >
                  {dart.label}
                </Badge>
              ))}
              {Array.from({ length: 3 - currentDarts.length }).map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="w-16 h-10 rounded-md border-2 border-dashed border-slate-600 flex items-center justify-center text-slate-600"
                >
                  {idx === 0 ? '?' : '-'}
                </div>
              ))}
            </div>
          </Card>

          {/* Visit History */}
          <Card className="bg-slate-800/50 border-slate-700 p-4">
            <div className="text-sm font-semibold text-white mb-2">
              Visit History
            </div>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {visitHistory.length === 0 ? (
                <div className="text-slate-500 text-sm">No visits yet</div>
              ) : (
                visitHistory.map((visit, idx) => (
                  <div key={idx} className="p-2 bg-slate-700/30 rounded text-xs">
                    <div className="flex justify-between text-slate-300 mb-1">
                      <span>Visit {idx + 1}</span>
                      <span className="text-emerald-400">{visit.score}</span>
                    </div>
                    <div className="flex gap-1">
                      {visit.darts.map((d, i) => (
                        <span key={i} className={`px-1 rounded ${
                          d.segment === 'D' || d.segment === 'DB' ? 'bg-red-500/20 text-red-400' :
                          d.segment === 'T' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-slate-600 text-slate-300'
                        }`}>
                          {d.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Scoring Panel */}
        <Card className="bg-slate-800/50 border-slate-700 p-4 sm:p-6">
          <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'dart_pad' | 'typed')}>
            <TabsList className="hidden sm:grid bg-slate-700/50 w-full sm:grid-cols-2 mb-4">
              <TabsTrigger value="dart_pad" className="data-[state=active]:bg-orange-500">
                Dart by Dart
              </TabsTrigger>
              <TabsTrigger value="typed" className="data-[state=active]:bg-orange-500">
                Typed Visit
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dart_pad" className="hidden sm:block">
              <Tabs value={scoringTab} onValueChange={(v) => setScoringTab(v as any)}>
                <TabsList className="bg-slate-700/50 w-full grid grid-cols-2 sm:grid-cols-4 mb-4">
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
                  onClick={() => handleRoundFail(currentDarts, true)}
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
                    className="bg-orange-600 hover:bg-orange-700 text-white px-4 sm:px-8 disabled:opacity-50"
                  >
                    Submit
                  </Button>
                </div>
                <Button
                  onClick={() => handleRoundFail(currentDarts, true)}
                  disabled={!gameActive}
                  variant="destructive"
                  className="w-full"
                >
                  Bust / Give Up This Round
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <div className="sm:hidden max-w-md mx-auto space-y-4">
            <div className="text-center text-slate-400 text-xs mb-2">
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
                className="flex-1 bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-center text-lg focus:outline-none focus:border-orange-500"
              />
              <Button
                onClick={handleTypedSubmit}
                disabled={!typedScore || !gameActive}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 text-sm disabled:opacity-50"
              >
                Submit
              </Button>
            </div>
            <Button
              onClick={() => handleRoundFail(currentDarts, true)}
              disabled={!gameActive}
              variant="destructive"
              className="w-full text-sm"
            >
              Bust / Give Up This Round
            </Button>
          </div>
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
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-center mb-4">
                121 Training Session Stats
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* XP Earned */}
              {sessionXP > 0 && (
                <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-lg p-4 sm:p-6 text-center border border-amber-500/30">
                  <div className="text-amber-300 text-sm uppercase tracking-wider mb-2">
                    XP Earned This Session
                  </div>
                  <div className="text-3xl sm:text-5xl font-bold text-white flex items-center justify-center gap-2">
                    <Star className="w-8 h-8 text-amber-400" />
                    {sessionXP}
                  </div>
                </div>
              )}

              {/* Main Stats */}
              <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-lg p-4 sm:p-6 text-center border border-orange-500/30">
                <div className="text-orange-300 text-sm uppercase tracking-wider mb-2">
                  Highest Target Reached
                </div>
                <div className="text-2xl sm:text-4xl sm:text-6xl font-bold text-orange-400">{highestTargetReached}</div>
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
                onClick={handleSaveAndExit}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white"
              >
                Save & Exit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Floating Session XP Indicator */}
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


