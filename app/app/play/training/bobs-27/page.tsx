'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Zap, ArrowLeft, Trophy, Skull, Target, Check, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { awardXP } from '@/lib/training/xpTracker';
import { trackStat } from '@/lib/achievementTracker';
import { calculateXP, XPResult } from '@/lib/training/xpSystem';
import { XPRewardDisplay } from '@/components/training/XPRewardDisplay';
import { useLevelUpToast } from '@/components/training/LevelUpToast';

// 21 targets: D1-D20 then Bull
const TARGETS = [
  ...Array.from({ length: 20 }, (_, i) => ({ label: `D${i + 1}`, value: (i + 1) * 2, number: i + 1 })),
  { label: 'Bull', value: 50, number: 25 },
];

interface RoundResult {
  target: string;
  targetValue: number;
  hits: number;
  scoreChange: number;
  runningTotal: number;
}

export default function Bobs27Page() {
  const router = useRouter();
  const [gameState, setGameState] = useState<'playing' | 'eliminated' | 'completed'>('playing');
  const [xpResult, setXpResult] = useState<XPResult | null>(null);
  const [currentRound, setCurrentRound] = useState(0); // 0-20
  const [score, setScore] = useState(27);
  const [dartsThrown, setDartsThrown] = useState(0); // 0-2 within current round
  const [hitsThisRound, setHitsThisRound] = useState(0);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [saving, setSaving] = useState(false);
  const { triggerLevelUp, LevelUpToastComponent } = useLevelUpToast();

  const target = TARGETS[currentRound];

  const handleDart = (hit: boolean) => {
    if (gameState !== 'playing') return;
    
    const newHits = hit ? hitsThisRound + 1 : hitsThisRound;
    const newDartsThrown = dartsThrown + 1;

    setHitsThisRound(newHits);
    setDartsThrown(newDartsThrown);

    // Auto-submit after 3 darts
    if (newDartsThrown === 3) {
      setTimeout(() => submitRound(newHits), 400);
    }
  };

  const submitRound = (hits: number) => {
    const targetValue = target.value;
    
    // Scoring: hits > 0 → add (hits × targetValue), hits === 0 → subtract targetValue once
    const scoreChange = hits > 0 ? hits * targetValue : -targetValue;
    const newScore = score + scoreChange;

    const result: RoundResult = {
      target: target.label,
      targetValue,
      hits,
      scoreChange,
      runningTotal: newScore,
    };

    const newResults = [...roundResults, result];
    setRoundResults(newResults);
    setScore(newScore);
    setDartsThrown(0);
    setHitsThisRound(0);

    // Eliminated?
    if (newScore <= 0) {
      setGameState('eliminated');
      saveGameResult(newScore, newResults, false);
      return;
    }

    // All 21 rounds done?
    if (currentRound >= 20) {
      setGameState('completed');
      saveGameResult(newScore, newResults, true);
      return;
    }

    setCurrentRound(currentRound + 1);
  };

  const saveGameResult = async (finalScore: number, results: RoundResult[], completed: boolean) => {
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Not authenticated'); return; }

      const totalHits = results.reduce((sum, r) => sum + r.hits, 0);
      const totalDarts = results.length * 3;
      const accuracy = totalDarts > 0 ? (totalHits / totalDarts) * 100 : 0;

      await supabase.from('training_stats').insert({
        player_id: user.id,
        game_type: 'bobs27',
        score: Math.max(0, finalScore),
        completed,
        session_data: {
          rounds_completed: results.length,
          total_hits: totalHits,
          total_darts: totalDarts,
          accuracy: accuracy.toFixed(1),
          eliminated: !completed,
          round_results: results,
          date: new Date().toISOString(),
        },
      });

      // Capture level BEFORE awarding XP for this specific training game
      const { data: preLevelData } = await supabase.rpc('get_player_training_level', {
        p_user_id: user.id,
      });
      const preGameLevel = preLevelData?.level;

      // Calculate XP for display
      const xp = calculateXP('bobs-27', Math.max(0, finalScore), { completed });
      setXpResult(xp);

      const awardResult = await awardXP('bobs-27', Math.max(0, finalScore), {
        completed,
        won: completed,
        xpOverride: xp.totalXP,
        sessionData: { score: finalScore, roundsCompleted: results.length, totalHits, accuracy },
      });
      if (awardResult.levelUp) {
        triggerLevelUp(preGameLevel ?? awardResult.levelUp.oldLevel, awardResult.levelUp.newLevel);
      }

      // Track training matches achievement
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
    setCurrentRound(0);
    setScore(27);
    setDartsThrown(0);
    setHitsThisRound(0);
    setRoundResults([]);
    setXpResult(null);
  };

  const getScoreColor = (s: number) => {
    if (s >= 500) return 'text-purple-400';
    if (s >= 200) return 'text-blue-400';
    if (s >= 100) return 'text-emerald-400';
    if (s > 27) return 'text-amber-400';
    return 'text-white';
  };

  const getGrade = (s: number) => {
    if (s >= 1000) return { grade: 'World Class', color: 'text-purple-400' };
    if (s >= 700) return { grade: 'Expert', color: 'text-blue-400' };
    if (s >= 400) return { grade: 'Advanced', color: 'text-emerald-400' };
    if (s >= 200) return { grade: 'Intermediate', color: 'text-amber-400' };
    if (s >= 100) return { grade: 'Beginner', color: 'text-yellow-400' };
    return { grade: 'Novice', color: 'text-slate-400' };
  };

  const totalHits = roundResults.reduce((sum, r) => sum + r.hits, 0);
  const totalDarts = roundResults.length * 3;
  const accuracy = totalDarts > 0 ? ((totalHits / totalDarts) * 100).toFixed(1) : '0';

  // ── End Screen ──
  if (gameState !== 'playing') {
    const grade = getGrade(score);
    const isEliminated = gameState === 'eliminated';

    return (
      <div className="min-h-screen bg-slate-950">
        {LevelUpToastComponent}
        <div className="max-w-lg mx-auto px-4 py-8">
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center">
            <div className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center ${
              isEliminated ? 'bg-gradient-to-br from-red-500 to-orange-500' : 'bg-gradient-to-br from-purple-400 to-pink-500'
            }`}>
              {isEliminated ? <Skull className="w-10 h-10 text-white" /> : <Trophy className="w-10 h-10 text-white" />}
            </div>

            <h2 className="text-2xl font-bold text-white mb-1">
              {isEliminated ? 'Eliminated!' : "Bob's 27 Complete!"}
            </h2>
            {!isEliminated && <p className={`text-lg font-bold mb-4 ${grade.color}`}>{grade.grade}</p>}
            {isEliminated && (
              <p className="text-slate-400 text-sm mb-4">
                Knocked out on {roundResults[roundResults.length - 1]?.target || '?'}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-400">Final Score</p>
                <p className={`text-3xl font-bold ${getScoreColor(Math.max(0, score))}`}>{Math.max(0, score)}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-400">Accuracy</p>
                <p className="text-3xl font-bold text-blue-400">{accuracy}%</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-400">Doubles Hit</p>
                <p className="text-2xl font-bold text-emerald-400">{totalHits}/{totalDarts}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4">
                <p className="text-xs text-slate-400">Rounds</p>
                <p className="text-2xl font-bold text-amber-400">{roundResults.length}/21</p>
              </div>
            </div>

            {/* XP Reward */}
            {xpResult && <XPRewardDisplay xpResult={xpResult} />}

            {/* Round-by-round breakdown */}
            <div className="bg-slate-800/50 rounded-xl p-4 mb-6 max-h-48 overflow-y-auto text-left">
              <p className="text-xs text-slate-400 font-bold mb-2 uppercase tracking-wider">Round Breakdown</p>
              {roundResults.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-1 border-b border-slate-700/50 last:border-0 text-sm">
                  <span className="text-slate-300 font-mono w-12">{r.target}</span>
                  <span className="text-slate-400">
                    {r.hits === 0 ? '✗✗✗' : r.hits === 1 ? '✓✗✗' : r.hits === 2 ? '✓✓✗' : '✓✓✓'}
                  </span>
                  <span className={`font-bold w-16 text-right ${r.scoreChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {r.scoreChange > 0 ? '+' : ''}{r.scoreChange}
                  </span>
                  <span className="text-slate-500 w-14 text-right font-mono">{r.runningTotal}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button onClick={resetGame} disabled={saving} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white">
                Play Again
              </Button>
              <Button onClick={() => router.push('/app/play/training')} disabled={saving} className="flex-1 bg-purple-600 hover:bg-purple-500 text-white">
                Back to Training
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Playing Screen ──
  return (
    <div className="min-h-screen bg-slate-950">
      {LevelUpToastComponent}

      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.push('/app/play/training')} className="p-2 hover:bg-slate-800 rounded-lg">
                <ArrowLeft className="w-5 h-5 text-slate-400" />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Bob&apos;s 27</h1>
                  <p className="text-sm text-slate-400">D1→D20→Bull · Hit doubles to score</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Round</p>
                <p className="text-lg font-bold text-white">{currentRound + 1}/21</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Score</p>
                <p className={`text-2xl font-bold ${getScoreColor(score)}`}>{score}</p>
              </div>
            </div>
          </div>
          <Progress value={((currentRound) / 21) * 100} className="mt-3 h-1.5" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

          {/* Left — Target & Darts */}
          <div className="space-y-4 sm:space-y-6">
            {/* Target */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-3 sm:p-6 text-center">
              <p className="text-sm text-slate-400 mb-1">Throw 3 darts at</p>
              <div className="text-2xl sm:text-4xl sm:text-6xl font-black text-white mb-2">{target.label}</div>
              <p className="text-slate-400 text-sm">
                Hit = <span className="text-emerald-400 font-bold">+{target.value}</span> per dart
                {' · '}
                Miss all = <span className="text-red-400 font-bold">-{target.value}</span>
              </p>
            </div>

            {/* Darts thrown this round */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-3 sm:p-6">
              <h3 className="font-semibold text-white mb-3 text-center text-sm sm:text-base">Darts This Round</h3>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {[0, 1, 2].map((i) => {
                  const thrown = i < dartsThrown;
                  // Determine if this dart was a hit: first N hits are hits, rest are misses
                  // But we track total hits, not per-dart. We need per-dart tracking.
                  // Simple approach: darts 0..dartsThrown-1 are thrown. 
                  // We know total hits so far. Can't know which specific dart hit.
                  // Just show generic thrown/not-thrown state
                  return (
                    <div
                      key={i}
                      className={`h-16 sm:aspect-square rounded-xl border-2 flex items-center justify-center ${
                        !thrown ? 'border-slate-700 border-dashed' : 'border-slate-600 bg-slate-800/50'
                      }`}
                    >
                      {thrown ? (
                        <Target className="w-5 h-5 sm:w-8 sm:h-8 text-slate-400" />
                      ) : (
                        <span className="text-lg sm:text-2xl text-slate-600 font-bold">{i + 1}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-center">
                <span className="text-emerald-400 font-bold text-sm sm:text-base">{hitsThisRound}</span>
                <span className="text-slate-500 text-sm"> hit{hitsThisRound !== 1 ? 's' : ''} so far</span>
              </div>
            </div>

            {/* Recent rounds */}
            {roundResults.length > 0 && (
              <div className="hidden sm:block bg-slate-900 rounded-2xl border border-slate-800 p-4 max-h-48 overflow-y-auto">
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">History</p>
                {[...roundResults].reverse().slice(0, 5).map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 text-sm border-b border-slate-800 last:border-0">
                    <span className="text-slate-300 font-mono">{r.target}</span>
                    <span className="text-slate-500">{r.hits}/3</span>
                    <span className={`font-bold ${r.scoreChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {r.scoreChange > 0 ? '+' : ''}{r.scoreChange}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right — Scoring Buttons */}
          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-3 sm:p-6">
            <h3 className="font-semibold text-white mb-2 text-center">Did you hit {target.label}?</h3>
            <p className="text-slate-500 text-xs text-center mb-3 sm:mb-6">Dart {dartsThrown + 1} of 3</p>

            <div className="space-y-2 sm:space-y-4">
              <button
                onClick={() => handleDart(true)}
                disabled={dartsThrown >= 3}
                className="w-full h-12 sm:h-20 rounded-xl font-bold text-sm sm:text-xl transition-all bg-emerald-600/20 border-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30 hover:border-emerald-500/60 active:scale-[0.98] disabled:opacity-30"
              >
                <div className="flex items-center justify-center gap-3">
                  <Check className="w-4 h-4 sm:w-7 sm:h-7" />
                  <span>HIT {target.label}</span>
                </div>
                <p className="hidden sm:block text-emerald-400/60 text-sm font-normal mt-1">+{target.value} points</p>
              </button>

              <button
                onClick={() => handleDart(false)}
                disabled={dartsThrown >= 3}
                className="w-full h-12 sm:h-20 rounded-xl font-bold text-sm sm:text-xl transition-all bg-red-600/10 border-2 border-red-500/30 text-red-400 hover:bg-red-600/20 hover:border-red-500/50 active:scale-[0.98] disabled:opacity-30"
              >
                <div className="flex items-center justify-center gap-3">
                  <X className="w-4 h-4 sm:w-7 sm:h-7" />
                  <span>MISS</span>
                </div>
              </button>
            </div>

            {/* Danger zone warning */}
            {score <= target.value && (
              <div className="mt-6 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-center">
                <p className="text-red-400 text-sm font-bold">⚠️ Danger Zone</p>
                <p className="text-red-400/70 text-xs">Missing all 3 will eliminate you!</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
