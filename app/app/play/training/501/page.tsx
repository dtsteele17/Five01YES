'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Target, Undo2, Trophy, TrendingUp, Zap, RotateCcw, Home, X, Check, Bot, Pencil, BarChart3 } from 'lucide-react';
import { getCheckoutOptions, isBust, isValidCheckout, getLegsToWin, resetBotLegState } from '@/lib/match-logic';
import { useTraining, BOT_DIFFICULTY_CONFIG } from '@/lib/context/TrainingContext';
import { getStartScore } from '@/lib/game-modes';
import { checkScoreAchievements } from '@/lib/utils/achievements';
import EditVisitModal from '@/components/app/EditVisitModal';
import { DartsAtDoubleModal } from '@/components/app/DartsAtDoubleModal';
import { toast } from 'sonner';
import { playGameOnSfx, hasPlayedGameOnForSession, markGameOnPlayedForSession } from '@/lib/sfx';
import { DartboardOverlay, DartHit } from '@/components/app/DartboardOverlay';
import { simulateVisit, DartResult, BotPerformanceTracker, updatePerformanceTracker } from '@/lib/botThrowEngine';
import { isDartbotVisualizationEnabled, isDartbotDebugModeEnabled } from '@/lib/dartbotSettings';
import { WinnerPopup } from '@/components/game/WinnerPopup';
import { recordMatchCompletion, type PlayerStats } from '@/lib/match/recordMatchCompletion';
import { normalizeMatchConfig } from '@/lib/match/defaultMatchConfig';
import { computeMatchStats } from '@/lib/stats/computeMatchStats';
import Link from 'next/link';

interface Visit {
  player: 'player1' | 'player2';
  score: number;
  remainingScore: number;
  isBust: boolean;
  isCheckout: boolean;
  timestamp: number;
  lastDartType?: 'S' | 'D' | 'T' | 'BULL' | 'SBULL';
  bustReason?: string;
}

interface LegData {
  legNumber: number;
  winner: 'player1' | 'player2' | null;
  visits: Visit[];
  player1DartsThrown: number;
  player2DartsThrown: number;
  player1First9DartsThrown: number;
  player1First9PointsScored: number;
  player2First9DartsThrown: number;
  player2First9PointsScored: number;
}

interface Dart {
  type: 'single' | 'double' | 'triple' | 'bull';
  number: number;
  value: number;
}

// Bot throw simulation result
interface BotTurnResult {
  visitTotal: number;
  newRemaining: number;
  isBust: boolean;
  isCheckout: boolean;
  dartsThrown: number;
  darts: DartResult[];
}

export default function DartbotMatchPage() {
  const router = useRouter();
  const { config } = useTraining();

  const [currentPlayer, setCurrentPlayer] = useState<'player1' | 'player2'>('player1');
  const [legStartingPlayer, setLegStartingPlayer] = useState<'player1' | 'player2'>('player1');
  const [player1Score, setPlayer1Score] = useState(501);
  const [player2Score, setPlayer2Score] = useState(501);
  const [player1LegsWon, setPlayer1LegsWon] = useState(0);
  const [player2LegsWon, setPlayer2LegsWon] = useState(0);
  const [currentLeg, setCurrentLeg] = useState<LegData>({
    legNumber: 1,
    winner: null,
    visits: [],
    player1DartsThrown: 0,
    player2DartsThrown: 0,
    player1First9DartsThrown: 0,
    player1First9PointsScored: 0,
    player2First9DartsThrown: 0,
    player2First9PointsScored: 0,
  });
  const [allLegs, setAllLegs] = useState<LegData[]>([]);
  const [scoreInput, setScoreInput] = useState('');
  const [showEndMatchDialog, setShowEndMatchDialog] = useState(false);
  const [showMatchCompleteModal, setShowMatchCompleteModal] = useState(false);
  const [matchWinner, setMatchWinner] = useState<'player1' | 'player2' | null>(null);

  const [currentVisit, setCurrentVisit] = useState<Dart[]>([]);

  const [player1MatchTotalScored, setPlayer1MatchTotalScored] = useState(0);
  const [player2MatchTotalScored, setPlayer2MatchTotalScored] = useState(0);
  const [player1MatchDartsThrown, setPlayer1MatchDartsThrown] = useState(0);
  const [player2MatchDartsThrown, setPlayer2MatchDartsThrown] = useState(0);
  const [inputModeError, setInputModeError] = useState<string>('');
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [isLegTransitioning, setIsLegTransitioning] = useState(false);

  const [showEditVisitModal, setShowEditVisitModal] = useState(false);
  const [editingVisitIndex, setEditingVisitIndex] = useState<number | null>(null);
  const [editingVisitScore, setEditingVisitScore] = useState(0);

  const [player1TotalDartsAtDouble, setPlayer1TotalDartsAtDouble] = useState(0);
  const [player1CheckoutsMade, setPlayer1CheckoutsMade] = useState(0);
  const [player2TotalDartsAtDouble, setPlayer2TotalDartsAtDouble] = useState(0);
  const [player2CheckoutsMade, setPlayer2CheckoutsMade] = useState(0);

  const [showDartsAtDoubleModal, setShowDartsAtDoubleModal] = useState(false);
  const [pendingVisitData, setPendingVisitData] = useState<{
    score: number;
    minDarts: 1 | 2 | 3;
    isCheckout: boolean;
  } | null>(null);

  const botTimerRef = useRef<number | null>(null);
  const botTurnIdRef = useRef(0);
  const matchOverRef = useRef(false);
  const [matchStartTime] = useState(Date.now());
  const hasSavedStats = useRef(false);

  // Dartboard visualization state
  const [dartboardHits, setDartboardHits] = useState<DartHit[]>([]);
  const [botLastVisitTotal, setBotLastVisitTotal] = useState<number | null>(null);
  const [showVisualization, setShowVisualization] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [lastThreeDarts, setLastThreeDarts] = useState<DartResult[]>([]);
  const [botFormMultiplier] = useState(() => 0.85 + Math.random() * 0.3);
  const [botPerformanceTracker, setBotPerformanceTracker] = useState<BotPerformanceTracker | null>(null);
  const dartboardAnimationTimerRef = useRef<number | null>(null);

  // Stats display (like QuickMatch)
  const [showStatsPanel, setShowStatsPanel] = useState(true);

  useEffect(() => {
    if (!config || (config.mode !== '301' && config.mode !== '501')) {
      router.push('/app/play');
    }
    if (config) {
      const startingScore = getStartScore(config.mode);
      setPlayer1Score(startingScore);
      setPlayer2Score(startingScore);
    }
  }, [config, router]);

  useEffect(() => {
    setShowVisualization(isDartbotVisualizationEnabled());
    setDebugMode(isDartbotDebugModeEnabled());
  }, []);

  useEffect(() => {
    matchOverRef.current = !!matchWinner || showMatchCompleteModal;
    
    // Save stats when match completes
    if (matchWinner && showMatchCompleteModal && !hasSavedStats.current) {
      hasSavedStats.current = true;
      saveMatchStats();
    }
  }, [matchWinner, showMatchCompleteModal]);

  // Play Game On sound when training session starts
  useEffect(() => {
    if (config && !hasPlayedGameOnForSession(matchStartTime.toString())) {
      playGameOnSfx();
      markGameOnPlayedForSession(matchStartTime.toString());
    }
  }, [config, matchStartTime]);

  const clearBotTimer = useCallback(() => {
    if (botTimerRef.current !== null) {
      window.clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }
  }, []);

  const clearDartboardAnimationTimer = useCallback(() => {
    if (dartboardAnimationTimerRef.current !== null) {
      window.clearTimeout(dartboardAnimationTimerRef.current);
      dartboardAnimationTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearBotTimer();
      clearDartboardAnimationTimer();
    };
  }, [clearBotTimer, clearDartboardAnimationTimer]);

  // Save match stats to database
  const saveMatchStats = async () => {
    if (!config) return;

    try {
      const normalizedConfig = normalizeMatchConfig({
        mode: config.mode as '301' | '501',
        bestOf: config.bestOf,
        doubleOut: config.doubleOut,
      });

      const allLegsData = [...allLegs, currentLeg].filter(leg => leg.winner);

      // Format visits for stats computation
      const allVisitsFormatted: Array<{
        player: 'user' | 'opponent';
        legNumber: number;
        visitNumber: number;
        score: number;
        remainingScore: number;
        isBust: boolean;
        isCheckout: boolean;
        wasCheckoutAttempt: boolean;
      }> = [];

      for (const leg of allLegsData) {
        const player1VisitsInLeg = leg.visits.filter(v => v.player === 'player1');
        const player2VisitsInLeg = leg.visits.filter(v => v.player === 'player2');

        player1VisitsInLeg.forEach((visit, idx) => {
          allVisitsFormatted.push({
            player: 'user',
            legNumber: leg.legNumber,
            visitNumber: idx + 1,
            score: visit.score,
            remainingScore: visit.remainingScore,
            isBust: visit.isBust,
            isCheckout: visit.isCheckout,
            wasCheckoutAttempt: visit.remainingScore <= 170 && !visit.isBust,
          });
        });

        player2VisitsInLeg.forEach((visit, idx) => {
          allVisitsFormatted.push({
            player: 'opponent',
            legNumber: leg.legNumber,
            visitNumber: idx + 1,
            score: visit.score,
            remainingScore: visit.remainingScore,
            isBust: visit.isBust,
            isCheckout: visit.isCheckout,
            wasCheckoutAttempt: visit.remainingScore <= 170 && !visit.isBust,
          });
        });
      }

      const userStats = computeMatchStats(
        allVisitsFormatted.filter(v => v.player === 'user'),
        'user',
        normalizedConfig.mode,
        player1TotalDartsAtDouble,
        player1CheckoutsMade
      );

      const opponentStats = computeMatchStats(
        allVisitsFormatted.filter(v => v.player === 'opponent'),
        'opponent',
        normalizedConfig.mode,
        player2TotalDartsAtDouble,
        player2CheckoutsMade
      );

      const userPlayerStats: PlayerStats = {
        threeDartAvg: userStats.threeDartAverage,
        first9Avg: userStats.first9Average,
        checkoutDartsAttempted: userStats.checkoutDartsAttempted,
        checkoutsMade: userStats.checkoutsMade,
        checkoutPercent: userStats.checkoutPercent,
        highestCheckout: userStats.highestCheckout,
        count100Plus: userStats.count100Plus,
        count140Plus: userStats.count140Plus,
        count180: userStats.oneEighties,
        highestScore: userStats.highestVisit,
        legsWon: player1LegsWon,
        legsLost: player2LegsWon,
        dartsThrown: userStats.totalDartsThrown,
        pointsScored: userStats.totalPointsScored,
      };

      const opponentPlayerStats: PlayerStats = {
        threeDartAvg: opponentStats.threeDartAverage,
        first9Avg: opponentStats.first9Average,
        checkoutDartsAttempted: opponentStats.checkoutDartsAttempted,
        checkoutsMade: opponentStats.checkoutsMade,
        checkoutPercent: opponentStats.checkoutPercent,
        highestCheckout: opponentStats.highestCheckout,
        count100Plus: opponentStats.count100Plus,
        count140Plus: opponentStats.count140Plus,
        count180: opponentStats.oneEighties,
        highestScore: opponentStats.highestVisit,
        legsWon: player2LegsWon,
        legsLost: player1LegsWon,
        dartsThrown: opponentStats.totalDartsThrown,
        pointsScored: opponentStats.totalPointsScored,
      };

      const result = await recordMatchCompletion({
        matchType: 'dartbot',
        game: normalizedConfig.mode,
        startedAt: new Date(matchStartTime).toISOString(),
        endedAt: new Date().toISOString(),
        opponent: {
          name: `DartBot (${config.botAverage})`,
          isBot: true,
        },
        winner: matchWinner === 'player1' ? 'user' : 'opponent',
        userStats: userPlayerStats,
        opponentStats: opponentPlayerStats,
        matchFormat: config.bestOf,
      });

      console.log('📊 DARTBOT MATCH SAVED:', result);

      if (result.ok) {
        toast.success('Match stats saved!');
      } else {
        console.error('Failed to save match stats:', result.error);
      }
    } catch (error) {
      console.error('Error saving match stats:', error);
    }
  };

  const animateBotThrows = useCallback(async (darts: DartResult[]): Promise<void> => {
    clearDartboardAnimationTimer();
    setDartboardHits([]);
    setBotLastVisitTotal(null);
    setLastThreeDarts([]);

    // Sequential throw animation: throw → dot appears → score updates
    for (let i = 0; i < darts.length; i++) {
      const dart = darts[i];

      // 1. Dart "throws" (thinking time)
      await new Promise<void>((resolve) => {
        dartboardAnimationTimerRef.current = window.setTimeout(() => {
          resolve();
        }, i === 0 ? 300 : 1000);
      });

      // 2. Dot appears on board
      setDartboardHits(prev => [
        ...prev,
        {
          x: dart.x,
          y: dart.y,
          label: dart.label,
          offboard: dart.offboard,
        },
      ]);

      // 3. Small delay before showing score text
      await new Promise<void>((resolve) => {
        dartboardAnimationTimerRef.current = window.setTimeout(() => {
          resolve();
        }, 400);
      });

      // 4. Update "Last Visit" text to show this dart
      setLastThreeDarts(prev => [...prev, dart]);

      // Short pause before next dart
      if (i < darts.length - 1) {
        await new Promise<void>((resolve) => {
          dartboardAnimationTimerRef.current = window.setTimeout(() => {
            resolve();
          }, 300);
        });
      }
    }

    // Show total after all darts
    const visitTotal = darts.reduce((sum, dart) => sum + dart.score, 0);
    setBotLastVisitTotal(visitTotal);

    // Keep dots visible for a moment, then clear
    await new Promise<void>((resolve) => {
      dartboardAnimationTimerRef.current = window.setTimeout(() => {
        setDartboardHits([]);
        resolve();
      }, 1800);
    });
  }, [clearDartboardAnimationTimer]);

  const botTakeTurn = useCallback(async () => {
    if (matchOverRef.current || isLegTransitioning) {
      return;
    }

    const currentScore = player2Score;

    if (currentScore <= 0) {
      setCurrentPlayer('player1');
      return;
    }

    if (showVisualization && config) {
      const visualVisit = simulateVisit({
        level: config.botAverage,
        remaining: currentScore,
        doubleOut: config.doubleOut,
        formMultiplier: botFormMultiplier,
        tracker: botPerformanceTracker,
        debug: debugMode,
      });

      setBotPerformanceTracker(prev => updatePerformanceTracker(prev, visualVisit.visitTotal, config.botAverage));
      setBotLastVisitTotal(visualVisit.visitTotal);
      await animateBotThrows(visualVisit.darts);

      const visit: Visit = {
        player: 'player2',
        score: visualVisit.bust ? 0 : visualVisit.visitTotal,
        remainingScore: visualVisit.newRemaining,
        isBust: visualVisit.bust,
        isCheckout: visualVisit.finished,
        timestamp: Date.now(),
      };

      const dartsThrown = visualVisit.darts.length;

      setCurrentLeg(prev => {
        const dartsUsedInFirst9 = Math.min(dartsThrown, Math.max(0, 9 - prev.player2First9DartsThrown));
        const pointsForFirst9 = dartsUsedInFirst9 > 0 ? (visualVisit.bust ? 0 : (visualVisit.visitTotal * dartsUsedInFirst9) / dartsThrown) : 0;

        return {
          ...prev,
          visits: [...prev.visits, visit],
          player2DartsThrown: prev.player2DartsThrown + dartsThrown,
          player2First9DartsThrown: prev.player2First9DartsThrown + dartsUsedInFirst9,
          player2First9PointsScored: prev.player2First9PointsScored + pointsForFirst9,
        };
      });

      if (!visualVisit.bust) {
        setPlayer2MatchTotalScored(prev => prev + visualVisit.visitTotal);
      }
      setPlayer2MatchDartsThrown(prev => prev + dartsThrown);
      setPlayer2Score(visualVisit.newRemaining);

      if (visualVisit.finished) {
        setTimeout(() => {
          if (matchOverRef.current) return;
          handleLegComplete('player2');
        }, 500);
        return;
      }

      setCurrentPlayer('player1');
    }
  }, [isLegTransitioning, player2Score, showVisualization, config, botFormMultiplier, debugMode, botPerformanceTracker, animateBotThrows]);

  const scheduleBotTurn = useCallback((reason: string) => {
    if (currentPlayer !== 'player2') return;

    if (isLegTransitioning) {
      clearBotTimer();
      botTimerRef.current = window.setTimeout(() => {
        scheduleBotTurn("retry_after_transition");
      }, 50);
      return;
    }

    clearBotTimer();
    setIsBotThinking(true);

    const myTurnId = ++botTurnIdRef.current;

    const BOT_THINK_DELAY_MS = 1500;

    botTimerRef.current = window.setTimeout(async () => {
      if (myTurnId !== botTurnIdRef.current) {
        return;
      }

      try {
        await Promise.race([
          botTakeTurn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("BOT_TIMEOUT")), 5000)),
        ]);
      } catch (err) {
        console.error("BOT_ERROR", err);
        setIsBotThinking(false);
        clearBotTimer();
        botTimerRef.current = window.setTimeout(() => {
          if (currentPlayer === 'player2') scheduleBotTurn("recover_after_error");
        }, 150);
        return;
      } finally {
        setIsBotThinking(false);
        clearBotTimer();
      }
    }, BOT_THINK_DELAY_MS);
  }, [currentPlayer, isLegTransitioning, clearBotTimer, botTakeTurn]);

  useEffect(() => {
    if (currentPlayer === 'player2') {
      scheduleBotTurn("turn_changed_to_bot");
    } else {
      setIsBotThinking(false);
      clearBotTimer();
    }

    return () => {
      clearBotTimer();
    };
  }, [currentPlayer, isLegTransitioning, scheduleBotTurn, clearBotTimer]);

  const handleInputScoreSubmit = (score: number) => {
    if (!config) return;

    if (!Number.isInteger(score)) {
      setInputModeError('Score must be a whole number');
      return;
    }

    if (score < 0 || score > 180) {
      setInputModeError('Score must be between 0 and 180');
      return;
    }

    const currentScore = player1Score;
    const doubleOut = config.doubleOut;
    const newScore = currentScore - score;
    const isCheckout = newScore === 0;

    // Check if we need to ask for darts at double
    const isCheckoutAttempt = currentScore <= 170 && currentScore > 0;
    
    if (isCheckoutAttempt && doubleOut) {
      setPendingVisitData({ score, minDarts: 3, isCheckout });
      setShowDartsAtDoubleModal(true);
    } else {
      handleScoreSubmit(score, 3, undefined, true, 0);
      setScoreInput('');
    }
  };

  const handleDartsAtDoubleConfirm = (dartsAtDouble: number) => {
    if (!pendingVisitData) return;

    setPlayer1TotalDartsAtDouble(prev => prev + dartsAtDouble);
    if (pendingVisitData.isCheckout) {
      setPlayer1CheckoutsMade(prev => prev + 1);
    }

    handleScoreSubmit(pendingVisitData.score, 3, undefined, true, dartsAtDouble);
    setShowDartsAtDoubleModal(false);
    setPendingVisitData(null);
    setScoreInput('');
  };

  const handleScoreSubmit = (
    score: number,
    dartsThrown: number = 3,
    lastDartType?: 'S' | 'D' | 'T' | 'BULL' | 'SBULL',
    isTypedInput: boolean = false,
    dartsAtDoubleForInput: number = 0
  ) => {
    if (!config || currentPlayer !== 'player1') return;

    const currentScore = player1Score;
    const doubleOut = config.doubleOut;
    const newScore = currentScore - score;

    if (isBust(currentScore, score, doubleOut)) {
      const visit: Visit = {
        player: 'player1',
        score: 0,
        remainingScore: currentScore,
        isBust: true,
        isCheckout: false,
        timestamp: Date.now(),
      };

      setCurrentLeg(prev => {
        const dartsUsedInFirst9 = Math.min(dartsThrown, Math.max(0, 9 - prev.player1First9DartsThrown));
        return {
          ...prev,
          visits: [...prev.visits, visit],
          player1DartsThrown: prev.player1DartsThrown + dartsThrown,
          player1First9DartsThrown: prev.player1First9DartsThrown + dartsUsedInFirst9,
        };
      });

      setPlayer1MatchDartsThrown(prev => prev + dartsThrown);
      setCurrentPlayer('player2');
      setScoreInput('');
      setCurrentVisit([]);
      setInputModeError('');
      return;
    }

    const isCheckout = newScore === 0;

    const visit: Visit = {
      player: 'player1',
      score,
      remainingScore: newScore,
      isBust: false,
      isCheckout,
      timestamp: Date.now(),
      lastDartType,
    };

    setCurrentLeg(prev => {
      const dartsUsedInFirst9 = Math.min(dartsThrown, Math.max(0, 9 - prev.player1First9DartsThrown));
      const pointsForFirst9 = dartsUsedInFirst9 > 0 ? (score * dartsUsedInFirst9) / dartsThrown : 0;

      return {
        ...prev,
        visits: [...prev.visits, visit],
        player1DartsThrown: prev.player1DartsThrown + dartsThrown,
        player1First9DartsThrown: prev.player1First9DartsThrown + dartsUsedInFirst9,
        player1First9PointsScored: prev.player1First9PointsScored + pointsForFirst9,
      };
    });

    setPlayer1MatchTotalScored(prev => prev + score);
    setPlayer1MatchDartsThrown(prev => prev + dartsThrown);
    setPlayer1Score(newScore);

    checkScoreAchievements(score);

    if (isCheckout) {
      handleLegComplete('player1');
    } else {
      setCurrentPlayer('player2');
    }

    setScoreInput('');
    setCurrentVisit([]);
    setInputModeError('');
  };

  const handleLegComplete = (winner: 'player1' | 'player2') => {
    if (matchWinner || showMatchCompleteModal) {
      return;
    }

    clearBotTimer();
    setIsBotThinking(false);
    setIsLegTransitioning(false);

    const completedLeg = {
      ...currentLeg,
      winner,
    };

    const updatedLegs = [...allLegs, completedLeg];
    setAllLegs(updatedLegs);

    const legsToWin = getLegsToWin(config!.bestOf);

    if (winner === 'player1') {
      setPlayer1LegsWon(prev => {
        const newLegs = prev + 1;
        if (newLegs >= legsToWin) {
          matchOverRef.current = true;
          setMatchWinner('player1');
          setShowMatchCompleteModal(true);
          return newLegs;
        }
        queueMicrotask(() => startNewLeg());
        return newLegs;
      });
    } else {
      setPlayer2LegsWon(prev => {
        const newLegs = prev + 1;
        if (newLegs >= legsToWin) {
          matchOverRef.current = true;
          setMatchWinner('player2');
          setShowMatchCompleteModal(true);
          return newLegs;
        }
        queueMicrotask(() => startNewLeg());
        return newLegs;
      });
    }
  };

  const startNewLeg = useCallback(() => {
    if (matchOverRef.current || matchWinner || showMatchCompleteModal) {
      return;
    }

    clearBotTimer();
    setIsBotThinking(false);
    setIsLegTransitioning(true);

    const nextStartingPlayer = legStartingPlayer === 'player1' ? 'player2' : 'player1';
    const startingScore = config ? getStartScore(config.mode) : 501;

    setPlayer1Score(startingScore);
    setPlayer2Score(startingScore);
    setLegStartingPlayer(nextStartingPlayer);
    setCurrentLeg({
      legNumber: currentLeg.legNumber + 1,
      winner: null,
      visits: [],
      player1DartsThrown: 0,
      player2DartsThrown: 0,
      player1First9DartsThrown: 0,
      player1First9PointsScored: 0,
      player2First9DartsThrown: 0,
      player2First9PointsScored: 0,
    });

    setCurrentVisit([]);
    setScoreInput('');
    setInputModeError('');
    setBotPerformanceTracker(null);

    setTimeout(() => {
      setIsLegTransitioning(false);
      if (nextStartingPlayer === 'player2') {
        setCurrentPlayer('player2');
      } else {
        setCurrentPlayer('player1');
      }
    }, 500);
  }, [matchWinner, showMatchCompleteModal, legStartingPlayer, currentLeg.legNumber, clearBotTimer]);

  const handleRematch = () => {
    matchOverRef.current = false;
    hasSavedStats.current = false;
    clearBotTimer();
    setShowMatchCompleteModal(false);
    setIsLegTransitioning(false);
    const startingScore = config ? getStartScore(config.mode) : 501;
    setPlayer1Score(startingScore);
    setPlayer2Score(startingScore);
    setPlayer1LegsWon(0);
    setPlayer2LegsWon(0);
    setCurrentPlayer('player1');
    setLegStartingPlayer('player1');
    setCurrentLeg({
      legNumber: 1,
      winner: null,
      visits: [],
      player1DartsThrown: 0,
      player2DartsThrown: 0,
      player1First9DartsThrown: 0,
      player1First9PointsScored: 0,
      player2First9DartsThrown: 0,
      player2First9PointsScored: 0,
    });
    setAllLegs([]);
    setMatchWinner(null);
    setPlayer1MatchTotalScored(0);
    setPlayer2MatchTotalScored(0);
    setPlayer1MatchDartsThrown(0);
    setPlayer2MatchDartsThrown(0);
    setCurrentVisit([]);
    setScoreInput('');
    setInputModeError('');
    setIsBotThinking(false);
    botTurnIdRef.current = 0;
    setPlayer1TotalDartsAtDouble(0);
    setPlayer1CheckoutsMade(0);
    setPlayer2TotalDartsAtDouble(0);
    setPlayer2CheckoutsMade(0);
    setBotPerformanceTracker(null);
  };

  const handleReturnToPlay = () => {
    router.push('/app/play');
  };

  const handleDartClick = (type: 'singles' | 'doubles' | 'triples' | 'bulls', number: number) => {
    if (currentVisit.length >= 3 || currentPlayer !== 'player1') return;

    let value = 0;
    let dartType: 'single' | 'double' | 'triple' | 'bull';

    if (type === 'singles') {
      value = number;
      dartType = 'single';
    } else if (type === 'doubles') {
      value = number * 2;
      dartType = 'double';
    } else if (type === 'triples') {
      value = number * 3;
      dartType = 'triple';
    } else {
      value = number;
      dartType = 'bull';
    }

    const dart: Dart = { type: dartType, number, value };
    setCurrentVisit([...currentVisit, dart]);
  };

  const handleClearVisit = () => {
    setCurrentVisit([]);
  };

  const handleSubmitVisit = () => {
    if (!config) return;

    const enteredDarts = [...currentVisit];
    const currentRemaining = player1Score;
    const visitTotal = enteredDarts.reduce((sum, dart) => sum + dart.value, 0);
    const newRemaining = currentRemaining - visitTotal;
    const doubleOut = config.doubleOut;

    let darts = [...enteredDarts];
    let shouldPadWithMisses = true;

    if (newRemaining === 0) {
      const lastDart = enteredDarts[enteredDarts.length - 1];
      const isLastDartDouble = lastDart && (lastDart.type === 'double' || (lastDart.type === 'bull' && lastDart.number === 50));

      if (!doubleOut || isLastDartDouble) {
        shouldPadWithMisses = false;
      }
    }

    if (shouldPadWithMisses) {
      while (darts.length < 3) {
        darts.push({ type: 'single', number: 0, value: 0 });
      }
    }

    setCurrentVisit(darts);

    const dartsThrown = darts.length;
    let dartsAtDoubleCount = 0;
    let remainingBeforeDart = currentRemaining;
    let checkoutMade = false;

    for (const dart of darts) {
      if (doubleOut && remainingBeforeDart <= 170 && remainingBeforeDart > 0) {
        dartsAtDoubleCount++;
      }

      remainingBeforeDart -= dart.value;

      if (remainingBeforeDart === 0) {
        checkoutMade = true;
      }
    }

    if (dartsAtDoubleCount > 0) {
      setPlayer1TotalDartsAtDouble(prev => prev + dartsAtDoubleCount);
      if (checkoutMade) {
        setPlayer1CheckoutsMade(prev => prev + 1);
      }
    }

    let lastDartType: 'S' | 'D' | 'T' | 'BULL' | 'SBULL' | undefined = undefined;
    if (darts.length > 0) {
      const lastDart = darts[darts.length - 1];
      if (lastDart.type === 'single') {
        lastDartType = 'S';
      } else if (lastDart.type === 'double') {
        lastDartType = 'D';
      } else if (lastDart.type === 'triple') {
        lastDartType = 'T';
      } else if (lastDart.type === 'bull') {
        lastDartType = lastDart.number === 50 ? 'BULL' : 'SBULL';
      }
    }

    handleScoreSubmit(visitTotal, dartsThrown, lastDartType);
  };

  const handleBust = () => {
    handleScoreSubmit(0);
  };

  const handleEditVisit = (visitIndex: number) => {
    const visit = currentLeg.visits[visitIndex];
    if (visit.player !== 'player1') return;

    setEditingVisitIndex(visitIndex);
    setEditingVisitScore(visit.score);
    setShowEditVisitModal(true);
  };

  const handleSaveEditedVisit = (newScore: number) => {
    if (editingVisitIndex === null || !config) return;

    const visit = currentLeg.visits[editingVisitIndex];
    if (visit.player !== 'player1') return;

    const originalScore = visit.score;
    const delta = newScore - originalScore;
    const newRemaining = player1Score - delta;

    let updatedVisits = [...currentLeg.visits];
    updatedVisits[editingVisitIndex] = {
      ...updatedVisits[editingVisitIndex],
      score: newScore,
      remainingScore: newRemaining,
      isBust: false,
      isCheckout: newRemaining === 0,
    };

    setCurrentLeg(prev => ({
      ...prev,
      visits: updatedVisits,
    }));

    setPlayer1Score(newRemaining);
    setShowEditVisitModal(false);
    setEditingVisitIndex(null);
  };

  // Calculate stats for display (like QuickMatch)
  const calculatePlayerStats = () => {
    const player1Visits = currentLeg.visits.filter(v => v.player === 'player1');
    const player2Visits = currentLeg.visits.filter(v => v.player === 'player2');
    
    const player1ValidVisits = player1Visits.filter(v => !v.isBust);
    const player2ValidVisits = player2Visits.filter(v => !v.isBust);
    
    const player1Avg = player1ValidVisits.length > 0 
      ? (player1ValidVisits.reduce((sum, v) => sum + v.score, 0) / player1ValidVisits.length).toFixed(1)
      : '0.0';
    
    const player2Avg = player2ValidVisits.length > 0 
      ? (player2ValidVisits.reduce((sum, v) => sum + v.score, 0) / player2ValidVisits.length).toFixed(1)
      : '0.0';

    // Calculate first 9 average
    const player1First9Score = currentLeg.player1First9PointsScored;
    const player1First9Darts = currentLeg.player1First9DartsThrown;
    const player1First9Avg = player1First9Darts > 0 
      ? ((player1First9Score / player1First9Darts) * 3).toFixed(1)
      : '0.0';

    return {
      player1Avg,
      player2Avg,
      player1First9Avg,
    };
  };

  const stats = calculatePlayerStats();

  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const startingScore = getStartScore(config.mode);
  const botName = BOT_DIFFICULTY_CONFIG[config.botDifficulty]?.name || 'DartBot';
  const legsToWin = getLegsToWin(config.bestOf);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/app/play">
              <Button variant="outline" size="icon" className="border-slate-600">
                <Home className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Bot className="w-6 h-6 text-emerald-400" />
                Training vs {botName}
              </h1>
              <p className="text-slate-400 text-sm">
                {config.mode} • {config.bestOf.replace('best-of-', 'Best of ')} • Double Out: {config.doubleOut ? 'ON' : 'OFF'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowStatsPanel(!showStatsPanel)}
              className="border-slate-600"
            >
              <BarChart3 className="w-4 h-4 mr-1" />
              Stats
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEndMatchDialog(true)}
              className="border-red-500/30 text-red-400"
            >
              <X className="w-4 h-4 mr-1" />
              End
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Player Card (You) */}
          <Card className="bg-slate-900/50 border-slate-700 p-6">
            <div className="flex items-center gap-4 mb-4">
              <Avatar className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500">
                <AvatarFallback className="text-white text-xl">You</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-bold text-white">You</h2>
                <Badge className={currentPlayer === 'player1' ? 'bg-emerald-500' : 'bg-slate-600'}>
                  {currentPlayer === 'player1' ? 'Your Turn' : 'Waiting'}
                </Badge>
              </div>
            </div>

            <div className="text-center mb-4">
              <div className="text-6xl font-bold text-white mb-2">{player1Score}</div>
              <div className="text-slate-400">Remaining</div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-emerald-400">{player1LegsWon}</div>
                <div className="text-xs text-slate-400">Legs Won</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-400">{stats.player1Avg}</div>
                <div className="text-xs text-slate-400">Avg</div>
              </div>
            </div>

            {showStatsPanel && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">First 9 Avg:</span>
                  <span className="text-white font-medium">{stats.player1First9Avg}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Darts Thrown:</span>
                  <span className="text-white font-medium">{player1MatchDartsThrown}</span>
                </div>
                {player1CheckoutsMade > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Checkouts:</span>
                    <span className="text-emerald-400 font-medium">{player1CheckoutsMade}</span>
                  </div>
                )}
              </div>
            )}

            {/* Checkout suggestions */}
            {player1Score <= 170 && player1Score > 0 && (
              <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                <div className="text-xs text-emerald-400 mb-1">Checkout:</div>
                <div className="text-sm text-white font-medium">
                  {getCheckoutOptions(player1Score, config.doubleOut).slice(0, 2).join(' or ')}
                </div>
              </div>
            )}
          </Card>

          {/* Dartboard Center */}
          <Card className="bg-slate-900/50 border-slate-700 p-6">
            <div className="relative aspect-square max-w-md mx-auto">
              <DartboardOverlay
                hits={dartboardHits}
                onSegmentClick={handleDartClick}
                lastVisitTotal={botLastVisitTotal}
                showDebug={debugMode}
              />
            </div>

            {/* Bot Last Throw Display */}
            {isBotThinking && (
              <div className="mt-4 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-lg">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="text-slate-300">{botName} is throwing...</span>
                </div>
              </div>
            )}

            {lastThreeDarts.length > 0 && currentPlayer === 'player1' && (
              <div className="mt-4 p-3 bg-slate-800/50 rounded-lg">
                <div className="text-xs text-slate-400 mb-2">{botName}&apos;s Last Throw:</div>
                <div className="flex items-center gap-2">
                  {lastThreeDarts.map((dart, i) => (
                    <span key={i} className="text-white font-medium">
                      {dart.label}
                    </span>
                  ))}
                  <span className="text-emerald-400 font-bold ml-auto">
                    = {lastThreeDarts.reduce((sum, d) => sum + d.score, 0)}
                  </span>
                </div>
              </div>
            )}

            {/* Score Input */}
            {currentPlayer === 'player1' && (
              <div className="mt-6 space-y-3">
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={scoreInput}
                    onChange={(e) => setScoreInput(e.target.value)}
                    placeholder="Enter score"
                    className="bg-slate-800/50 border-slate-600 text-white text-center text-2xl h-14"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const score = parseInt(scoreInput);
                        if (!isNaN(score)) {
                          handleInputScoreSubmit(score);
                        }
                      }
                    }}
                    disabled={isBotThinking}
                  />
                  <Button
                    onClick={() => {
                      const score = parseInt(scoreInput);
                      if (!isNaN(score)) {
                        handleInputScoreSubmit(score);
                      }
                    }}
                    className="bg-emerald-500 hover:bg-emerald-600 h-14 px-6"
                    disabled={isBotThinking}
                  >
                    <Check className="w-5 h-5" />
                  </Button>
                </div>
                {inputModeError && (
                  <p className="text-red-400 text-sm text-center">{inputModeError}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleBust}
                    className="flex-1 border-red-500/30 text-red-400"
                    disabled={isBotThinking}
                  >
                    Bust
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setScoreInput('')}
                    className="flex-1 border-slate-600"
                    disabled={isBotThinking}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Bot Card */}
          <Card className="bg-slate-900/50 border-slate-700 p-6">
            <div className="flex items-center gap-4 mb-4">
              <Avatar className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500">
                <AvatarFallback className="text-white text-xl">
                  <Bot className="w-8 h-8" />
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-bold text-white">{botName}</h2>
                <Badge className={currentPlayer === 'player2' ? 'bg-purple-500' : 'bg-slate-600'}>
                  {currentPlayer === 'player2' ? 'Throwing...' : 'Waiting'}
                </Badge>
              </div>
            </div>

            <div className="text-center mb-4">
              <div className="text-6xl font-bold text-white mb-2">{player2Score}</div>
              <div className="text-slate-400">Remaining</div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-purple-400">{player2LegsWon}</div>
                <div className="text-xs text-slate-400">Legs Won</div>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-400">{stats.player2Avg}</div>
                <div className="text-xs text-slate-400">Avg</div>
              </div>
            </div>

            {showStatsPanel && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Target Avg:</span>
                  <span className="text-white font-medium">{config.botAverage}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Darts Thrown:</span>
                  <span className="text-white font-medium">{player2MatchDartsThrown}</span>
                </div>
                {player2CheckoutsMade > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Checkouts:</span>
                    <span className="text-purple-400 font-medium">{player2CheckoutsMade}</span>
                  </div>
                )}
              </div>
            )}

            {/* Leg progress */}
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">First to {legsToWin} legs</span>
                <span className="text-white">{player1LegsWon} - {player2LegsWon}</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 to-purple-500 transition-all"
                  style={{ width: `${((player1LegsWon + player2LegsWon) / (legsToWin * 2 - 1)) * 100}%` }}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Recent Visits */}
        <Card className="bg-slate-900/50 border-slate-700 p-4 mt-6">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Current Leg - Visit History
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-slate-400 text-sm border-b border-slate-700">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Player</th>
                  <th className="pb-2">Score</th>
                  <th className="pb-2">Remaining</th>
                  <th className="pb-2">Type</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {currentLeg.visits.slice(-10).map((visit, idx) => (
                  <tr key={idx} className="border-b border-slate-800/50">
                    <td className="py-2 text-slate-500">{idx + 1}</td>
                    <td className="py-2">
                      <span className={visit.player === 'player1' ? 'text-emerald-400' : 'text-purple-400'}>
                        {visit.player === 'player1' ? 'You' : botName}
                      </span>
                    </td>
                    <td className="py-2 text-white font-medium">
                      {visit.isBust ? (
                        <span className="text-red-400">Bust ({visit.score})</span>
                      ) : (
                        visit.score
                      )}
                    </td>
                    <td className="py-2 text-slate-300">{visit.remainingScore}</td>
                    <td className="py-2">
                      {visit.isCheckout && (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                          Checkout
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
                {currentLeg.visits.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-500">
                      No visits yet. Start throwing!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* End Match Dialog */}
      <AlertDialog open={showEndMatchDialog} onOpenChange={setShowEndMatchDialog}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">End Match?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to end this match? Your progress will not be saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-600">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReturnToPlay}
              className="bg-red-500 hover:bg-red-600"
            >
              End Match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Match Complete Modal */}
      <WinnerPopup
        isOpen={showMatchCompleteModal}
        onClose={() => {}}
        winner={matchWinner === 'player1' ? 'You' : botName}
        isUserWinner={matchWinner === 'player1'}
        playerLegs={player1LegsWon}
        opponentLegs={player2LegsWon}
        onRematch={handleRematch}
        onReturn={handleReturnToPlay}
      />

      {/* Edit Visit Modal */}
      {showEditVisitModal && (
        <EditVisitModal
          isOpen={showEditVisitModal}
          onClose={() => setShowEditVisitModal(false)}
          currentScore={editingVisitScore}
          onSave={handleSaveEditedVisit}
        />
      )}

      {/* Darts At Double Modal */}
      <DartsAtDoubleModal
        isOpen={showDartsAtDoubleModal}
        onClose={() => setShowDartsAtDoubleModal(false)}
        onConfirm={handleDartsAtDoubleConfirm}
        remainingScore={player1Score}
      />
    </div>
  );
}

// Helper function for checkout options
function getCheckoutOptions(score: number, doubleOut: boolean): string[] {
  if (!doubleOut) return [`${score}`];
  
  // Simple checkout routes
  const routes: Record<number, string[]> = {
    170: ['T20 T20 DB'],
    167: ['T20 T19 DB'],
    164: ['T20 T18 DB'],
    161: ['T20 T17 DB'],
    160: ['T20 T20 D20'],
    136: ['T20 T20 D8'],
    120: ['T20 20 D20'],
    100: ['T20 D20'],
    80: ['T20 D10'],
    60: ['20 D20'],
    40: ['D20'],
    32: ['D16'],
    24: ['D12'],
    16: ['D8'],
    8: ['D4'],
    4: ['D2'],
    2: ['D1'],
  };
  
  return routes[score] || [`Finish ${score}`];
}
