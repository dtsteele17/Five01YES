'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Target, ArrowLeft, Trophy, RotateCcw, Zap, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { calculateXP, XPResult } from '@/lib/training/xpSystem';
import { XPRewardDisplay } from '@/components/training/XPRewardDisplay';
import { awardXP } from '@/lib/training/xpTracker';
import { trackStat } from '@/lib/achievementTracker';
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
  hits: number;
}

// PDC Challenge targets - 18 rounds
const PDC_TARGETS = [
  { round: 1, target: 'D1', description: 'Double 1', type: 'double' },
  { round: 2, target: 'D5', description: 'Double 5', type: 'double' },
  { round: 3, target: 'D20', description: 'Double 20', type: 'double' },
  { round: 4, target: 'D10', description: 'Double 10', type: 'double' },
  { round: 5, target: 'D15', description: 'Double 15', type: 'double' },
  { round: 6, target: 'T20', description: 'Treble 20', type: 'treble' },
  { round: 7, target: 'T19', description: 'Treble 19', type: 'treble' },
  { round: 8, target: 'T18', description: 'Treble 18', type: 'treble' },
  { round: 9, target: 'T17', description: 'Treble 17', type: 'treble' },
  { round: 10, target: '25', description: 'Bull/Outer', type: 'bull' },
  { round: 11, target: '50', description: 'Bullseye', type: 'bull' },
  { round: 12, target: 'T14', description: 'Treble 14', type: 'treble' },
  { round: 13, target: 'T13', description: 'Treble 13', type: 'treble' },
  { round: 14, target: 'T12', description: 'Treble 12', type: 'treble' },
  { round: 15, target: 'D16', description: 'Double 16', type: 'double' },
  { round: 16, target: 'D8', description: 'Double 8', type: 'double' },
  { round: 17, target: 'D4', description: 'Double 4', type: 'double' },
  { round: 18, target: 'D2', description: 'Double 2 (Finish)', type: 'double' },
];

export default function PDCChallengePage() {
  const router = useRouter();
  const [gameState, setGameState] = useState<'playing' | 'completed'>('playing');
  const [currentRound, setCurrentRound] = useState(1);
  const [currentDarts, setCurrentDarts] = useState<DartThrow[]>([]);
  const [completedRounds, setCompletedRounds] = useState<RoundResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [xpResult, setXpResult] = useState<XPResult | null>(null);
  const { triggerLevelUp, LevelUpToastComponent } = useLevelUpToast();

  const currentTarget = PDC_TARGETS[currentRound - 1];

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

  const calculateScore = (darts: DartThrow[], targetType: string): { score: number; hits: number } => {
    let score = 0;
    let hits = 0;

    darts.forEach(dart => {
      switch (targetType) {
        case 'double':
          if (dart.multiplier === 2) {
            score += dart.score * dart.multiplier;
            hits++;
          }
          break;
        case 'treble':
          if (dart.multiplier === 3) {
            score += dart.score * dart.multiplier;
            hits++;
          }
          break;
        case 'bull':
          if (dart.score === 25 || dart.score === 50) {
            score += dart.score;
            hits++;
          }
          break;
      }
    });

    return { score, hits };
  };

  const submitRound = async (darts: DartThrow[]) => {
    const { score, hits } = calculateScore(darts, currentTarget.type);

    const roundResult: RoundResult = {
      round: currentRound,
      target: currentTarget.target,
      darts,
      score,
      hits,
    };

    const newCompletedRounds = [...completedRounds, roundResult];
    const nextRound = currentRound + 1;
    const isComplete = nextRound > PDC_TARGETS.length;

    setCompletedRounds(newCompletedRounds);
    setCurrentRound(nextRound);
    setCurrentDarts([]);

    // Save final score if complete
    if (isComplete) {
      setGameState('completed');
      await saveGameResult(newCompletedRounds);
    }
  };

  const saveGameResult = async (rounds: RoundResult[]) => {
    setSaving(true);
    const totalScore = rounds.reduce((sum, r) => sum + r.score, 0);
    const totalHits = rounds.reduce((sum, r) => sum + r.hits, 0);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Not authenticated');
        return;
      }

      // Calculate XP based on total score
      const xp = calculateXP('pdc-challenge', totalScore, { completed: true });
      setXpResult(xp);

      await supabase
        .from('training_stats')
        .insert({
          player_id: user.id,
          game_type: 'pdc_challenge',
          score: totalScore,
          completed: true,
          xp_earned: xp.totalXP,
          session_data: {
            rounds,
            totalHits,
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
      const xpAwarded = await awardXP('pdc-challenge', totalScore, {
        completed: true,
        won: totalScore >= 500,
        sessionData: {
          totalScore,
          totalHits,
          rounds: rounds.length,
        },
      });
      if (xpAwarded.levelUp) {
        triggerLevelUp(xpAwarded.levelUp.oldLevel, xpAwarded.levelUp.newLevel);
      }

      toast.success(`PDC Challenge completed! +${xp.totalXP} XP earned!`);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) await trackStat(user.id, 'training_matches', 1);
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
    setXpResult(null);
  };

  const getTotalScore = () => completedRounds.reduce((sum, r) => sum + r.score, 0);
  const getTotalHits = () => completedRounds.reduce((sum, r) => sum + r.hits, 0);
  const getTotalDarts = () => completedRounds.length * 3;
  const getAccuracy = () => {
    const darts = getTotalDarts();
    return darts > 0 ? ((getTotalHits() / darts) * 100).toFixed(1) : '0.0';
  };

  const getGrade = (score: number): { label: string; color: string } => {
    if (score >= 800) return { label: 'Professional', color: 'text-purple-400' };
    if (score >= 600) return { label: 'Advanced', color: 'text-blue-400' };
    if (score >= 400) return { label: 'Intermediate', color: 'text-green-400' };
    if (score >= 200) return { label: 'Beginner', color: 'text-yellow-400' };
    return { label: 'Novice', color: 'text-gray-400' };
  };

  if (gameState === 'completed') {
    const totalScore = getTotalScore();
    const grade = getGrade(totalScore);

    return (
      <div className="min-h-screen bg-slate-950">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-yellow-500/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Trophy className="w-10 h-10 text-yellow-400" />
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">PDC Challenge Complete!</h1>
              <p className={`text-xl ${grade.color} font-semibold`}>{grade.label}</p>
            </div>

            {/* XP Reward Display */}
            {xpResult && <XPRewardDisplay xpResult={xpResult} />}

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-sm mb-1">Total Score</p>
                <p className="text-2xl sm:text-4xl font-bold text-white">{totalScore}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-sm mb-1">Accuracy</p>
                <p className="text-2xl sm:text-4xl font-bold text-emerald-400">{getAccuracy()}%</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-sm mb-1">Total Hits</p>
                <p className="text-2xl sm:text-4xl font-bold text-blue-400">{getTotalHits()}/54</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <p className="text-gray-400 text-sm mb-1">Rounds</p>
                <p className="text-2xl sm:text-4xl font-bold text-purple-400">18</p>
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
                      <span className={`font-bold ${round.hits > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                        {round.score}
                      </span>
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
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium disabled:opacity-50"
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
                <div className="p-2 bg-gradient-to-br from-red-500 to-pink-500 rounded-lg">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">PDC Challenge</h1>
                  <p className="text-sm text-slate-400">Round {currentRound} of {PDC_TARGETS.length}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-gray-400">Score</p>
                <p className="text-2xl font-bold text-emerald-400">{getTotalScore()}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Current Target Card */}
        <div className="bg-gradient-to-br from-red-900/20 to-pink-900/20 border border-red-500/30 rounded-2xl p-4 sm:p-8 mb-4 sm:mb-6">
          <div className="text-center">
            <p className="text-gray-400 mb-2">Current Target</p>
            <h2 className="text-3xl sm:text-5xl font-bold text-white mb-2">{currentTarget.description}</h2>
            <p className="text-red-400">Target: {currentTarget.target}</p>
          </div>
        </div>

        {/* Progress */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-3 sm:p-4 mb-4 sm:mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Progress</span>
            <span className="text-sm text-emerald-400">{currentRound} / {PDC_TARGETS.length}</span>
          </div>
          <Progress value={(currentRound / PDC_TARGETS.length) * 100} className="h-2" />
        </div>

        {/* Darts Display */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
          {[0, 1, 2].map((i) => {
            const dart = currentDarts[i];
            return (
              <div
                key={i}
                className={`h-16 sm:h-24 rounded-xl flex flex-col items-center justify-center border-2 ${
                  dart
                    ? 'bg-slate-800 border-emerald-500'
                    : 'bg-slate-900 border-slate-700 border-dashed'
                }`}
              >
                {dart ? (
                  <>
                    <span className="text-[10px] sm:text-xs text-gray-500">Dart {i + 1}</span>
                    <span className="text-sm sm:text-2xl font-bold text-white">
                      {dart.segment}
                    </span>
                    <span className="text-[10px] sm:text-xs text-emerald-400">
                      {dart.score * dart.multiplier} pts
                    </span>
                  </>
                ) : (
                  <span className="text-sm sm:text-base text-gray-600">{i + 1}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Scoring Interface */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-3 sm:p-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4">
            {/* Single */}
            <button
              onClick={() => {
                const num = parseInt(currentTarget.target.replace(/[^0-9]/g, '')) || 0;
                handleDartInput(num, 1, `S${num}`);
              }}
              disabled={currentDarts.length >= 3}
              className="h-10 sm:h-20 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 font-bold text-sm sm:text-lg text-white"
            >
              Single
              <span className="hidden sm:block text-sm text-gray-500">
                {parseInt(currentTarget.target.replace(/[^0-9]/g, '')) || 0}
              </span>
            </button>
            {/* Double */}
            <button
              onClick={() => {
                const num = parseInt(currentTarget.target.replace(/[^0-9]/g, '')) || 0;
                handleDartInput(num, 2, `D${num}`);
              }}
              disabled={currentDarts.length >= 3}
              className="h-10 sm:h-20 rounded-xl bg-emerald-900/30 border border-emerald-500/50 hover:bg-emerald-900/50 disabled:opacity-50 font-bold text-sm sm:text-lg text-white"
            >
              Double
              <span className="hidden sm:block text-sm text-emerald-400">
                {(parseInt(currentTarget.target.replace(/[^0-9]/g, '')) || 0) * 2}
              </span>
            </button>
            {/* Treble */}
            <button
              onClick={() => {
                const num = parseInt(currentTarget.target.replace(/[^0-9]/g, '')) || 0;
                if (num > 0 && num <= 20) {
                  handleDartInput(num, 3, `T${num}`);
                }
              }}
              disabled={currentDarts.length >= 3 || (parseInt(currentTarget.target.replace(/[^0-9]/g, '')) || 0) > 20}
              className="h-10 sm:h-20 rounded-xl bg-amber-900/30 border border-amber-500/50 hover:bg-amber-900/50 disabled:opacity-50 font-bold text-sm sm:text-lg text-white"
            >
              Treble
              <span className="hidden sm:block text-sm text-amber-400">
                {(parseInt(currentTarget.target.replace(/[^0-9]/g, '')) || 0) * 3}
              </span>
            </button>
            {/* Miss */}
            <button
              onClick={() => handleDartInput(0, 1, 'Miss')}
              disabled={currentDarts.length >= 3}
              className="h-10 sm:h-20 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 font-bold text-sm sm:text-lg text-gray-500"
            >
              Miss
              <span className="hidden sm:block text-sm text-gray-600">0</span>
            </button>
          </div>

          {/* Bull buttons for bull rounds */}
          {currentTarget.type === 'bull' && (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
              <button
                onClick={() => handleDartInput(25, 1, '25')}
                disabled={currentDarts.length >= 3}
                className="h-10 sm:h-16 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 font-bold text-xs sm:text-base text-white"
              >
                Outer Bull (25)
              </button>
              <button
                onClick={() => handleDartInput(50, 1, 'BULL')}
                disabled={currentDarts.length >= 3}
                className="h-10 sm:h-16 rounded-xl bg-red-900/30 border border-red-500/50 hover:bg-red-900/50 disabled:opacity-50 font-bold text-xs sm:text-base text-white"
              >
                Bullseye (50)
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={() => setCurrentDarts([])}
              disabled={currentDarts.length === 0}
              className="flex-1 h-10 sm:h-auto sm:py-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl font-bold text-sm sm:text-base text-white"
            >
              Clear
            </button>
            <button
              onClick={() => submitRound(currentDarts)}
              disabled={currentDarts.length === 0}
              className="flex-1 h-10 sm:h-auto sm:py-3 bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-400 hover:to-pink-400 disabled:opacity-50 rounded-xl font-bold text-sm sm:text-base text-white"
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
            Score points by hitting the target type shown. Doubles and Trebles only count 
            when you hit the specified multiplier. Complete all 18 rounds to get your final score!
          </p>
        </div>
      </div>
    </div>
  );
}




