'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Trophy, ArrowLeft, Medal, Play } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

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

const TARGETS = [
  { round: 1, target: '10', description: '10s', type: 'single' },
  { round: 2, target: '11', description: '11s', type: 'single' },
  { round: 3, target: '12', description: '12s', type: 'single' },
  { round: 4, target: '13', description: '13s', type: 'single' },
  { round: 5, target: '14', description: '14s', type: 'single' },
  { round: 6, target: '15', description: '15s', type: 'single' },
  { round: 7, target: 'T10', description: 'T10s', type: 'triple' },
  { round: 8, target: 'T11', description: 'T11s', type: 'triple' },
  { round: 9, target: 'T12', description: 'T12s', type: 'triple' },
  { round: 10, target: 'T13', description: 'T13s', type: 'triple' },
  { round: 11, target: 'T14', description: 'T14s', type: 'triple' },
  { round: 12, target: 'T15', description: 'T15s', type: 'triple' },
  { round: 13, target: 'D', description: 'Doubles (any)', type: 'double' },
  { round: 14, target: 'DB', description: 'Double Bull', type: 'bull' },
];

export default function JDCChallengePage() {
  const router = useRouter();
  const [gameState, setGameState] = useState<'playing' | 'completed'>('playing');
  const [currentRound, setCurrentRound] = useState(1);
  const [currentDarts, setCurrentDarts] = useState<DartThrow[]>([]);
  const [completedRounds, setCompletedRounds] = useState<RoundResult[]>([]);
  const [saving, setSaving] = useState(false);

  const currentTarget = TARGETS[currentRound - 1];

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

  const isTargetHit = (dart: DartThrow, target: string): boolean => {
    switch (target) {
      case 'D':
        return dart.multiplier === 2;
      case 'DB':
        return dart.segment === 'BULL';
      default:
        if (target.startsWith('T')) {
          const num = parseInt(target.replace('T', ''));
          return dart.score === num && dart.multiplier === 3;
        }
        return dart.score === parseInt(target);
    }
  };

  const submitRound = (darts: DartThrow[]) => {
    let score = 0;
    let bonus = 0;

    darts.forEach(dart => {
      const isHit = isTargetHit(dart, currentTarget.target);
      
      if (isHit) {
        score += dart.score * dart.multiplier;
        
        // Bonus for doubles
        if (currentTarget.target !== 'DB' && dart.multiplier === 2) {
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
    const isComplete = nextRound > TARGETS.length;

    setCompletedRounds(newCompletedRounds);
    setCurrentRound(nextRound);
    setCurrentDarts([]);

    if (isComplete) {
      setGameState('completed');
      saveGameResult(newCompletedRounds);
    }
  };

  const saveGameResult = async (rounds: RoundResult[]) => {
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
        session_data: {
          rounds,
          totalBonus,
          grade: grade.grade,
          date: new Date().toISOString(),
        },
      });

      toast.success(`JDC Challenge Complete! Grade: ${grade.grade}`);
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

  if (gameState === 'completed') {
    const totalScore = getTotalScore();
    const grade = getGrade(totalScore);

    return (
      <div className="min-h-screen bg-slate-950">
        <div className="max-w-md mx-auto px-4 py-8">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-full flex items-center justify-center">
              <Medal className="w-10 h-10 text-white" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2">JDC Challenge Complete!</h2>
            
            <p className={`text-xl font-bold mb-6 ${grade.color}`}>
              {grade.grade}
            </p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-sm text-slate-400">Total Score</p>
                <p className="text-3xl font-bold text-blue-400">{totalScore}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-sm text-slate-400">Double Bonus</p>
                <p className="text-2xl font-bold text-green-400">{getTotalBonus()}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-sm text-slate-400">Rounds</p>
                <p className="text-2xl font-bold text-purple-400">14</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-sm text-slate-400">Grade</p>
                <p className={`text-xl font-bold ${grade.color}`}>{grade.grade}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={resetGame}
                disabled={saving}
                className="flex-1 py-3 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors disabled:opacity-50"
              >
                Play Again
              </button>
              <button
                onClick={() => router.push('/app/play')}
                disabled={saving}
                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
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
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/app/play')}
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
                  <p className="text-sm text-slate-400">14 rounds of progressive difficulty</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-slate-400">Total Score</p>
                <p className="text-lg font-bold text-blue-400">{getTotalScore()}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Round</p>
                <p className="text-lg font-bold text-green-400">{currentRound}/14</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel - Round Info */}
          <div className="space-y-6">
            {/* Round Card */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 text-center">
              <p className="text-sm text-slate-400 mb-2">Round {currentRound} of 14</p>
              <div className="text-5xl font-bold text-white mb-2">{currentTarget.target}</div>
              <p className="text-blue-400">{currentTarget.description}</p>

              {/* Progress */}
              <div className="mt-4">
                <Progress value={(currentRound / 14) * 100} className="h-2" />
              </div>
            </div>

            {/* Current Throw */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">Current Throw</h3>
                {currentDarts.length > 0 && (
                  <button
                    onClick={() => setCurrentDarts([])}
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Dart Inputs */}
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => {
                  const dart = currentDarts[i];
                  return (
                    <div
                      key={i}
                      className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center ${
                        dart
                          ? 'bg-blue-500/10 border-blue-500'
                          : 'border-slate-700 border-dashed'
                      }`}
                    >
                      {dart ? (
                        <>
                          <span className="text-xl font-bold text-white">
                            {dart.segment}
                          </span>
                          <span className="text-sm text-slate-400">
                            {dart.score * dart.multiplier}
                          </span>
                        </>
                      ) : (
                        <span className="text-2xl text-slate-600">{i + 1}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Submit */}
              {currentDarts.length === 3 && (
                <button
                  onClick={() => submitRound(currentDarts)}
                  className="w-full mt-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-500 transition-colors"
                >
                  Submit Round
                </button>
              )}
            </div>
          </div>

          {/* Right Panel - Scoring */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <h3 className="font-semibold text-white mb-4 text-center">
              Click to Score
            </h3>
            
            <div className="grid grid-cols-5 gap-2">
              {/* Numbers 10-15 */}
              {[10, 11, 12, 13, 14, 15].map((num) => (
                <button
                  key={num}
                  onClick={() => handleDartInput(num, 1, `S${num}`)}
                  disabled={currentDarts.length >= 3}
                  className="h-14 rounded-lg bg-slate-800 text-white hover:bg-slate-700 font-bold disabled:opacity-50"
                >
                  S{num}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-2 mt-2">
              {/* Doubles */}
              {[...Array(20)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => handleDartInput(i + 1, 2, `D${i + 1}`)}
                  disabled={currentDarts.length >= 3}
                  className="h-14 rounded-lg bg-emerald-900/30 text-emerald-400 hover:bg-emerald-900/50 font-bold disabled:opacity-50"
                >
                  D{i + 1}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-2 mt-2">
              {/* Trebles */}
              {[...Array(20)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => handleDartInput(i + 1, 3, `T${i + 1}`)}
                  disabled={currentDarts.length >= 3}
                  className="h-14 rounded-lg bg-amber-900/30 text-amber-400 hover:bg-amber-900/50 font-bold disabled:opacity-50"
                >
                  T{i + 1}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-2">
              <button
                onClick={() => handleDartInput(25, 1, '25')}
                disabled={currentDarts.length >= 3}
                className="h-14 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 font-bold disabled:opacity-50"
              >
                25
              </button>
              <button
                onClick={() => handleDartInput(50, 1, 'BULL')}
                disabled={currentDarts.length >= 3}
                className="h-14 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 font-bold disabled:opacity-50"
              >
                BULL
              </button>
              <button
                onClick={() => handleDartInput(0, 1, 'Miss')}
                disabled={currentDarts.length >= 3}
                className="h-14 rounded-lg bg-slate-800 text-slate-500 hover:bg-slate-700 font-bold disabled:opacity-50"
              >
                Miss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
