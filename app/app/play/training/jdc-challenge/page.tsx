'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Target, ArrowLeft, Trophy, RotateCcw, Zap, Medal, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { calculateXP, XPResult } from '@/lib/training/xpSystem';
import { XPRewardDisplay } from '@/components/training/XPRewardDisplay';
import { awardXP } from '@/lib/training/xpTracker';
import { useLevelUpToast } from '@/components/training/LevelUpToast';

interface DartThrow {
  score: number;
  multiplier: 1 | 2 | 3;
  segment: string;
}

interface RoundResult {
  round: number;
  target: string;
  darts: DartThrow[];
  score: number;
  bonus: number;
  total: number;
}

// JDC Challenge targets - 14 rounds
const JDC_TARGETS = [
  { round: 1, target: '10', description: '10s', type: 'single', number: 10 },
  { round: 2, target: '11', description: '11s', type: 'single', number: 11 },
  { round: 3, target: '12', description: '12s', type: 'single', number: 12 },
  { round: 4, target: '13', description: '13s', type: 'single', number: 13 },
  { round: 5, target: '14', description: '14s', type: 'single', number: 14 },
  { round: 6, target: '15', description: '15s', type: 'single', number: 15 },
  { round: 7, target: 'T10', description: 'T10s', type: 'triple', number: 10 },
  { round: 8, target: 'T11', description: 'T11s', type: 'triple', number: 11 },
  { round: 9, target: 'T12', description: 'T12s', type: 'triple', number: 12 },
  { round: 10, target: 'T13', description: 'T13s', type: 'triple', number: 13 },
  { round: 11, target: 'T14', description: 'T14s', type: 'triple', number: 14 },
  { round: 12, target: 'T15', description: 'T15s', type: 'triple', number: 15 },
  { round: 13, target: 'D', description: 'Any Double', type: 'double', number: null },
  { round: 14, target: 'DB', description: 'Double Bull', type: 'bull', number: null },
];

export default function JDCChallengePage() {
  const router = useRouter();
  const [gameState, setGameState] = useState<'playing' | 'completed'>('playing');
  const [currentRound, setCurrentRound] = useState(1);
  const [currentDarts, setCurrentDarts] = useState<DartThrow[]>([]);
  const [completedRounds, setCompletedRounds] = useState<RoundResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [xpResult, setXpResult] = useState<XPResult | null>(null);
  const { triggerLevelUp, LevelUpToastComponent } = useLevelUpToast();

  const currentTarget = JDC_TARGETS[currentRound - 1];

  const handleDartInput = (score: number, multiplier: 1 | 2 | 3, segment: string) => {
    if (currentDarts.length >= 3 || gameState === 'completed') return;

    const newDart: DartThrow = { score, multiplier, segment };
    const newDarts = [...currentDarts, newDart];
    setCurrentDarts(newDarts);

    // Auto-submit after 3 darts
    if (newDarts.length === 3) {
      setTimeout(() => submitRound(newDarts), 500);
    }
  };

  const isTargetHit = (dart: DartThrow, targetType: string, targetNumber: number | null): boolean => {
    switch (targetType) {
      case 'double':
        return dart.multiplier === 2;
      case 'bull':
        return dart.segment === 'BULL' || dart.segment === '25' || dart.score === 50 || dart.score === 25;
      case 'triple':
        return dart.score === targetNumber && dart.multiplier === 3;
      case 'single':
        return dart.score === targetNumber;
      default:
        return false;
    }
  };

  const submitRound = (darts: DartThrow[]) => {
    let score = 0;
    let bonus = 0;

    darts.forEach(dart => {
      const isHit = isTargetHit(dart, currentTarget.type, currentTarget.number);
      
      if (isHit) {
        score += dart.score * dart.multiplier;
        
        // Bonus for doubles (except double bull round)
        if (currentTarget.type !== 'bull' && dart.multiplier === 2) {
          bonus += 1;
        }
      }
    });

    const total = score + bonus;

    const roundResult: RoundResult = {
      round: currentRound,
      target: currentTarget.target,
      darts,
      score,
      bonus,
      total,
    };

    const newCompletedRounds = [...completedRounds, roundResult];
    const nextRound = currentRound + 1;
    const isComplete = nextRound > JDC_TARGETS.length;

    setCompletedRounds(newCompletedRounds);
    setCurrentRound(nextRound);
    setCurrentDarts([]);

    if (isComplete) {
      setGameState('completed');
      const totalScore = newCompletedRounds.reduce((sum, r) => sum + r.total, 0);
      
      // Calculate XP based on score
      const xp = calculateXP('jdc-challenge', totalScore, { completed: true });
      setXpResult(xp);
      
      saveGameResult(newCompletedRounds, xp);
    }
  };

  const saveGameResult = async (rounds: RoundResult[], xp: XPResult) => {
    setSaving(true);
    const totalScore = rounds.reduce((sum, r) => sum + r.total, 0);
    const totalBonus = rounds.reduce((sum, r) => sum + r.bonus, 0);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Not authenticated');
        return;
      }

      const grade = getGrade(totalScore);

      await supabase.from('training_stats').insert({
        player_id: user.id,
        game_type: 'jdc_challenge',
        score: totalScore,
        completed: true,
        xp_earned: xp.totalXP,
        session_data: {
          rounds,
          totalBonus,
          grade: grade.grade,
          xp_breakdown: {
            base: xp.baseXP,
            performance: xp.performanceBonus,
            completion: xp.completionBonus,
            total: xp.totalXP,
          },
          date: new Date().toISOString(),
        },
      });

      // Award XP via unified tracker (records to match_history too)
      const xpAwarded = await awardXP('jdc-challenge', totalScore, {
        completed: true,
        won: totalScore >= 350,
        sessionData: {
          totalScore,
          totalBonus,
          grade: grade.grade,
          rounds: rounds.length,
        },
      });
      if (xpAwarded.levelUp) {
        triggerLevelUp(xpAwarded.levelUp.oldLevel, xpAwarded.levelUp.newLevel);
      }

      toast.success(`JDC Challenge Complete! +${xp.totalXP} XP earned!`);
    } catch (error) {
      console.error('Failed to save game:', error);
      toast.error('Failed to save score');
    } finally {
      setSaving(false);
    }
  };

  const resetGame = () => {
    setGameState('playing');
    setCurrentRound(1);
    setCurrentDarts([]);
    setCompletedRounds([]);
  };

  const getTotalScore = () => completedRounds.reduce((sum, r) => sum + r.total, 0);
  const getTotalBonus = () => completedRounds.reduce((sum, r) => sum + r.bonus, 0);

  const getGrade = (score: number): { grade: string; color: string } => {
    if (score >= 500) return { grade: 'Professional', color: 'text-purple-400' };
    if (score >= 400) return { grade: 'Advanced', color: 'text-blue-400' };
    if (score >= 300) return { grade: 'Intermediate', color: 'text-green-400' };
    if (score >= 200) return { grade: 'Beginner', color: 'text-yellow-400' };
    return { grade: 'Novice', color: 'text-gray-400' };
  };

  // Render scoring buttons based on current round type
  const renderScoringButtons = () => {
    const disabled = currentDarts.length >= 3;

    switch (currentTarget.type) {
      case 'single':
        // Show Single, Double, and Triple buttons for rounds 1-6 (10s-15s)
        return (
          <div className="space-y-3 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => handleDartInput(currentTarget.number!, 1, `S${currentTarget.number}`)}
                disabled={disabled}
                className="h-20 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 font-bold text-lg text-white border border-slate-600"
              >
                <span className="text-green-400">S{currentTarget.number}</span>
                <span className="block text-sm text-gray-500">{currentTarget.number} pts</span>
              </button>
              <button
                onClick={() => handleDartInput(currentTarget.number!, 2, `D${currentTarget.number}`)}
                disabled={disabled}
                className="h-20 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 font-bold text-lg text-white border border-emerald-500/50"
              >
                <span className="text-emerald-400">D{currentTarget.number}</span>
                <span className="block text-sm text-emerald-500">{currentTarget.number! * 2} pts</span>
              </button>
              <button
                onClick={() => handleDartInput(currentTarget.number!, 3, `T${currentTarget.number}`)}
                disabled={disabled}
                className="h-20 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 font-bold text-lg text-white border border-amber-500/50"
              >
                <span className="text-amber-400">T{currentTarget.number}</span>
                <span className="block text-sm text-amber-500">{currentTarget.number! * 3} pts</span>
              </button>
            </div>
            <button
              onClick={() => handleDartInput(0, 1, 'Miss')}
              disabled={disabled}
              className="w-full h-14 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 font-bold text-lg text-gray-500"
            >
              Miss
              <span className="block text-sm text-gray-600">0</span>
            </button>
          </div>
        );

      case 'triple':
        // Only show Treble button for the target number
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <button
              onClick={() => handleDartInput(currentTarget.number!, 3, `T${currentTarget.number}`)}
              disabled={disabled}
              className="h-20 rounded-xl bg-amber-900/30 border border-amber-500/50 hover:bg-amber-900/50 disabled:opacity-50 font-bold text-lg text-white"
            >
              Treble {currentTarget.number}
              <span className="block text-sm text-amber-400">{currentTarget.number! * 3}</span>
            </button>
            <button
              onClick={() => handleDartInput(0, 1, 'Miss')}
              disabled={disabled}
              className="h-20 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 font-bold text-lg text-gray-500"
            >
              Miss
              <span className="block text-sm text-gray-600">0</span>
            </button>
          </div>
        );

      case 'double':
        // Show all doubles D1-D20
        return (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
              {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
                <button
                  key={`D${num}`}
                  onClick={() => handleDartInput(num, 2, `D${num}`)}
                  disabled={disabled}
                  className="h-14 rounded-xl bg-emerald-900/30 border border-emerald-500/50 hover:bg-emerald-900/50 disabled:opacity-50 font-bold text-white"
                >
                  D{num}
                </button>
              ))}
            </div>
            <button
              onClick={() => handleDartInput(0, 1, 'Miss')}
              disabled={disabled}
              className="w-full h-16 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 font-bold text-lg text-gray-500"
            >
              Miss
              <span className="block text-sm text-gray-600">0</span>
            </button>
          </>
        );

      case 'bull':
        // Show Outer Bull and Bullseye
        return (
          <div className="space-y-3 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => handleDartInput(25, 1, '25')}
                disabled={disabled}
                className="h-20 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 font-bold text-lg text-white"
              >
                Outer Bull
                <span className="block text-sm text-gray-500">25</span>
              </button>
              <button
                onClick={() => handleDartInput(50, 1, 'BULL')}
                disabled={disabled}
                className="h-20 rounded-xl bg-red-900/30 border border-red-500/50 hover:bg-red-900/50 disabled:opacity-50 font-bold text-lg text-white"
              >
                Bullseye
                <span className="block text-sm text-red-400">50</span>
              </button>
            </div>
            <button
              onClick={() => handleDartInput(0, 1, 'Miss')}
              disabled={disabled}
              className="w-full h-14 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 font-bold text-lg text-gray-500"
            >
              Miss
              <span className="block text-sm text-gray-600">0</span>
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  if (gameState === 'completed') {
    const totalScore = getTotalScore();
    const grade = getGrade(totalScore);

    return (
      <div className="min-h-screen bg-slate-950">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Medal className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">JDC Challenge Complete!</h1>
              <p className={`text-xl ${grade.color} font-semibold`}>{grade.grade}</p>
            </div>

            {/* XP Reward Display */}
            {xpResult && <XPRewardDisplay xpResult={xpResult} />}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-sm mb-1">Total Score</p>
                <p className="text-2xl sm:text-4xl font-bold text-white">{totalScore}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-sm mb-1">Double Bonus</p>
                <p className="text-2xl sm:text-4xl font-bold text-emerald-400">{getTotalBonus()}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-sm mb-1">Rounds</p>
                <p className="text-2xl sm:text-4xl font-bold text-blue-400">14</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-sm mb-1">Grade</p>
                <p className={`text-2xl font-bold ${grade.color}`}>{grade.grade}</p>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4 mb-8 max-h-64 overflow-y-auto">
              <h3 className="text-lg font-semibold text-white mb-4">Round Breakdown</h3>
              <div className="space-y-2">
                {completedRounds.map((round) => (
                  <div key={round.round} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 w-8">R{round.round}</span>
                      <span className="text-white font-medium">{round.target}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-gray-400">
                        {round.darts.map(d => d.segment).join(', ')}
                      </span>
                      <div className="text-right">
                        <span className={`font-bold ${round.total > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                          {round.total}
                        </span>
                        {round.bonus > 0 && (
                          <span className="text-xs text-emerald-500 block">+{round.bonus} bonus</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={resetGame}
                disabled={saving}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <RotateCcw className="w-5 h-5" />
                Play Again
              </button>
              <button
                onClick={() => router.push('/app/play/training')}
                disabled={saving}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium disabled:opacity-50"
              >
                Back to Play
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      {LevelUpToastComponent}
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/app/play/training')}
                className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-slate-400" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
                  <Trophy className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">JDC Challenge</h1>
                  <p className="text-sm text-slate-400">Round {currentRound} of {JDC_TARGETS.length}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-gray-400">Score</p>
                <p className="text-2xl font-bold text-blue-400">{getTotalScore()}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Current Target Card */}
        <div className="bg-gradient-to-br from-blue-900/20 to-cyan-900/20 border border-blue-500/30 rounded-2xl p-8 mb-6">
          <div className="text-center">
            <p className="text-gray-400 mb-2">Current Target</p>
            <h2 className="text-3xl sm:text-5xl font-bold text-white mb-2">{currentTarget.description}</h2>
            <p className="text-blue-400">Target: {currentTarget.target}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Progress</span>
            <span className="text-sm text-blue-400">{currentRound} / {JDC_TARGETS.length}</span>
          </div>
          <Progress value={(currentRound / JDC_TARGETS.length) * 100} className="h-2" />
        </div>

        {/* Darts Display */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {[0, 1, 2].map((i) => {
            const dart = currentDarts[i];
            return (
              <div
                key={i}
                className={`h-24 rounded-xl flex flex-col items-center justify-center border-2 ${
                  dart
                    ? 'bg-slate-800 border-blue-500'
                    : 'bg-slate-900 border-slate-700 border-dashed'
                }`}
              >
                {dart ? (
                  <>
                    <span className="text-xs text-gray-500">Dart {i + 1}</span>
                    <span className="text-2xl font-bold text-white">
                      {dart.segment}
                    </span>
                    <span className="text-xs text-blue-400">
                      {dart.score * dart.multiplier} pts
                    </span>
                  </>
                ) : (
                  <span className="text-gray-600">{i + 1}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Scoring Interface */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4 sm:p-6">
          {renderScoringButtons()}

          {/* Action Buttons */}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setCurrentDarts([])}
              disabled={currentDarts.length === 0}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl font-bold text-white"
            >
              Clear
            </button>
            <button
              onClick={() => submitRound(currentDarts)}
              disabled={currentDarts.length === 0}
              className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 disabled:opacity-50 rounded-xl font-bold text-white"
            >
              Submit Round
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            <h3 className="font-semibold text-white">How to Play</h3>
          </div>
          <p className="text-gray-400 text-sm">
            Hit the target shown to score points. For rounds 1-6, hit singles 10-15. 
            For rounds 7-12, hit trebles 10-15. Round 13: any double. Round 14: Bull (single or double). 
            Double bonus points awarded for hitting doubles!
          </p>
        </div>
      </div>
    </div>
  );
}


