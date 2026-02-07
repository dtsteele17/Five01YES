'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Zap, ArrowLeft, Trophy, Heart, HeartCrack, Target } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface DartThrow {
  score: number;
  multiplier: 1 | 2 | 3;
  segment: string;
}

interface RoundResult {
  target: number;
  hits: number;
  pointsScored: number;
  pointsLost: number;
  netResult: number;
}

export default function Bobs27Page() {
  const router = useRouter();
  const [gameState, setGameState] = useState<'playing' | 'completed'>('playing');
  const [currentNumber, setCurrentNumber] = useState(1);
  const [score, setScore] = useState(27);
  const [lives, setLives] = useState(3);
  const [currentDarts, setCurrentDarts] = useState<DartThrow[]>([]);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [saving, setSaving] = useState(false);

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

  const submitRound = (darts: DartThrow[]) => {
    const target = currentNumber;
    let hits = 0;

    darts.forEach(dart => {
      if (dart.score === target) {
        hits += dart.multiplier;
      }
    });

    const pointsScored = hits * target;
    const pointsLost = (3 - hits) * target;
    const netResult = pointsScored - pointsLost;

    const newScore = score + netResult;
    let newLives = lives;
    let newCurrentNumber = currentNumber + 1;
    let completed = false;
    let gameOver = false;

    // Check for life loss
    if (newScore <= 0) {
      newLives--;
      if (newLives <= 0) {
        gameOver = true;
        completed = true;
      }
    }

    // Check for completion
    if (newCurrentNumber > 20) {
      completed = true;
    }

    const roundResult: RoundResult = {
      target,
      hits,
      pointsScored,
      pointsLost,
      netResult,
    };

    setRoundResults([...roundResults, roundResult]);
    setScore(newScore > 0 ? newScore : (newLives > 0 ? 27 : 0));
    setLives(newLives);
    setCurrentNumber(newCurrentNumber);
    setCurrentDarts([]);

    if (completed) {
      setGameState('completed');
      saveGameResult(newScore > 0 ? newScore : 0, !gameOver);
    }
  };

  const saveGameResult = async (finalScore: number, survived: boolean) => {
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Not authenticated');
        return;
      }

      const totalHits = roundResults.reduce((sum, r) => sum + r.hits, 0);
      const totalDarts = roundResults.length * 3;
      const accuracy = totalDarts > 0 ? ((totalHits / totalDarts) * 100).toFixed(1) : '0';

      await supabase.from('training_stats').insert({
        player_id: user.id,
        game_type: 'bobs27',
        score: finalScore,
        completed: survived,
        session_data: {
          rounds_completed: roundResults.length,
          total_hits: totalHits,
          accuracy,
          lives_remaining: lives,
          date: new Date().toISOString(),
        },
      });

      if (survived) {
        toast.success(`Bob's 27 Complete! Final Score: ${finalScore}`);
      } else {
        toast.error('Game Over! No lives remaining.');
      }
    } catch (error) {
      console.error('Failed to save game:', error);
      toast.error('Failed to save score');
    } finally {
      setSaving(false);
    }
  };

  const resetGame = () => {
    setGameState('playing');
    setCurrentNumber(1);
    setScore(27);
    setLives(3);
    setCurrentDarts([]);
    setRoundResults([]);
  };

  const getScoreColor = () => {
    if (score >= 500) return 'text-purple-400';
    if (score >= 300) return 'text-blue-400';
    if (score >= 100) return 'text-green-400';
    if (score > 0) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getGrade = (score: number): { grade: string; color: string } => {
    if (score >= 1000) return { grade: 'Expert', color: 'text-purple-400' };
    if (score >= 700) return { grade: 'Advanced', color: 'text-blue-400' };
    if (score >= 500) return { grade: 'Intermediate', color: 'text-green-400' };
    if (score >= 300) return { grade: 'Beginner', color: 'text-yellow-400' };
    return { grade: 'Novice', color: 'text-gray-400' };
  };

  const totalHits = roundResults.reduce((sum, r) => sum + r.hits, 0);
  const totalDarts = roundResults.length * 3;
  const accuracy = totalDarts > 0 ? ((totalHits / totalDarts) * 100).toFixed(1) : '0';

  if (gameState === 'completed') {
    const grade = getGrade(score);

    return (
      <div className="min-h-screen bg-slate-950">
        <div className="max-w-md mx-auto px-4 py-8">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full flex items-center justify-center">
              {lives > 0 ? (
                <Trophy className="w-10 h-10 text-white" />
              ) : (
                <HeartCrack className="w-10 h-10 text-white" />
              )}
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-2">
              {lives > 0 ? "Bob's 27 Complete!" : "Game Over!"}
            </h2>
            
            {lives > 0 && (
              <p className={`text-xl font-bold mb-6 ${grade.color}`}>
                {grade.grade}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-sm text-slate-400">Final Score</p>
                <p className={`text-3xl font-bold ${getScoreColor()}`}>{score}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-sm text-slate-400">Accuracy</p>
                <p className="text-3xl font-bold text-blue-400">{accuracy}%</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-sm text-slate-400">Total Hits</p>
                <p className="text-xl font-bold text-green-400">{totalHits}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-sm text-slate-400">Lives Left</p>
                <p className="text-xl font-bold text-red-400">{lives}</p>
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
                className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-500 transition-colors disabled:opacity-50"
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
                <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Bob's 27</h1>
                  <p className="text-sm text-slate-400">Start with 27, hit 1-20 in order</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  i < lives ? (
                    <Heart key={i} className="w-6 h-6 text-red-500 fill-red-500" />
                  ) : (
                    <HeartCrack key={i} className="w-6 h-6 text-slate-600" />
                  )
                ))}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Score</p>
                <p className={`text-2xl font-bold ${getScoreColor()}`}>{score}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Panel */}
          <div className="space-y-6">
            {/* Target Card */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 text-center">
              <p className="text-sm text-slate-400 mb-2">Current Target</p>
              <div className="text-7xl font-bold text-white mb-4">{currentNumber}</div>
              <div className="flex items-center justify-center gap-4 text-sm">
                <span className="text-slate-400">Progress: {currentNumber}/20</span>
                <Progress value={(currentNumber / 20) * 100} className="w-20 h-2" />
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
                  const isTargetHit = dart && dart.score === currentNumber;
                  return (
                    <div
                      key={i}
                      className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center ${
                        dart
                          ? isTargetHit
                            ? 'border-green-500 bg-green-500/10'
                            : 'border-slate-600 bg-slate-800/50'
                          : 'border-slate-700 border-dashed'
                      }`}
                    >
                      {dart ? (
                        <>
                          <span className={`text-xl font-bold ${
                            isTargetHit ? 'text-green-400' : 'text-slate-400'
                          }`}>
                            {dart.segment}
                          </span>
                          <span className="text-sm text-slate-500">
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
                  className="w-full mt-4 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-500 transition-colors"
                >
                  Submit Round
                </button>
              )}
            </div>
          </div>

          {/* Right Panel - Scoring */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <h3 className="font-semibold text-white mb-4 text-center">
              Click to hit {currentNumber}
            </h3>
            
            <div className="grid grid-cols-4 gap-2">
              {/* Singles */}
              {[...Array(20)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => handleDartInput(i + 1, 1, `S${i + 1}`)}
                  disabled={currentDarts.length >= 3}
                  className={`h-12 rounded-lg font-bold text-sm transition-colors ${
                    i + 1 === currentNumber
                      ? 'bg-purple-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  } disabled:opacity-50`}
                >
                  S{i + 1}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2 mt-2">
              {/* Doubles */}
              {[...Array(20)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => handleDartInput(i + 1, 2, `D${i + 1}`)}
                  disabled={currentDarts.length >= 3}
                  className={`h-12 rounded-lg font-bold text-sm transition-colors ${
                    i + 1 === currentNumber
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
                  } disabled:opacity-50`}
                >
                  D{i + 1}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2 mt-2">
              {/* Trebles */}
              {[...Array(20)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => handleDartInput(i + 1, 3, `T${i + 1}`)}
                  disabled={currentDarts.length >= 3}
                  className={`h-12 rounded-lg font-bold text-sm transition-colors ${
                    i + 1 === currentNumber
                      ? 'bg-amber-500 text-white'
                      : 'bg-slate-800 text-amber-400 hover:bg-slate-700'
                  } disabled:opacity-50`}
                >
                  T{i + 1}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-2">
              <button
                onClick={() => handleDartInput(25, 1, '25')}
                disabled={currentDarts.length >= 3}
                className="h-12 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 font-bold disabled:opacity-50"
              >
                25
              </button>
              <button
                onClick={() => handleDartInput(50, 1, 'BULL')}
                disabled={currentDarts.length >= 3}
                className="h-12 rounded-lg bg-red-900/30 text-red-400 hover:bg-red-900/50 font-bold disabled:opacity-50"
              >
                BULL
              </button>
              <button
                onClick={() => handleDartInput(0, 1, 'Miss')}
                disabled={currentDarts.length >= 3}
                className="h-12 rounded-lg bg-slate-800 text-slate-500 hover:bg-slate-700 font-bold disabled:opacity-50"
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
