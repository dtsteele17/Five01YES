'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Target, Undo2, Trophy, TrendingUp, Zap, RotateCcw, Chrome as Home, X, Check, Bot, Pencil } from 'lucide-react';
import { getCheckoutOptions, isBust, isValidCheckout, calculateStats, getLegsToWin, resolveTurn, calculateFirst9Average, LegFirst9Data, validateEditedVisit, getMinDartsToCheckout, isOneDartFinish } from '@/lib/match-logic';
import { useTraining, BOT_DIFFICULTY_CONFIG } from '@/lib/context/TrainingContext';
import { generateBotDarts, getBotThinkingDelay, BotMatchState, resetBotLegState } from '@/lib/dartbot';
import { getStartScore } from '@/lib/game-modes';
import { checkScoreAchievements } from '@/lib/utils/achievements';
import EditVisitModal from '@/components/app/EditVisitModal';
import { DartsAtDoubleModal } from '@/components/app/DartsAtDoubleModal';
import { toast } from 'sonner';
import { useMatchPersistence } from '@/lib/hooks/useMatchPersistence';
import { MatchErrorBoundary } from '@/components/match/MatchErrorBoundary';
import { MatchSaveDebugStrip } from '@/components/app/MatchSaveDebugStrip';
import { playGameOnSfx, hasPlayedGameOnForSession, markGameOnPlayedForSession } from '@/lib/sfx';
import { DartboardSVG, DartHit } from '@/components/app/DartboardSVG';
import { simulateVisit, DartResult } from '@/lib/botThrowEngine';
import { isDartbotVisualizationEnabled } from '@/lib/dartbotSettings';

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

export default function Training501Page() {
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
  const [scoringMode, setScoringMode] = useState<'quick' | 'input'>('quick');
  const [showEndMatchDialog, setShowEndMatchDialog] = useState(false);
  const [showMatchCompleteModal, setShowMatchCompleteModal] = useState(false);
  const [matchWinner, setMatchWinner] = useState<'player1' | 'player2' | null>(null);

  const [currentVisit, setCurrentVisit] = useState<Dart[]>([]);
  const [dartboardGroup, setDartboardGroup] = useState<'singles' | 'doubles' | 'triples' | 'bulls'>('singles');

  const [player1MatchTotalScored, setPlayer1MatchTotalScored] = useState(0);
  const [player2MatchTotalScored, setPlayer2MatchTotalScored] = useState(0);
  const [player1MatchDartsThrown, setPlayer1MatchDartsThrown] = useState(0);
  const [player2MatchDartsThrown, setPlayer2MatchDartsThrown] = useState(0);
  const [inputModeError, setInputModeError] = useState<string>('');
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [isLegTransitioning, setIsLegTransitioning] = useState(false);
  const [botMatchState, setBotMatchState] = useState<BotMatchState>({
    checkoutAttemptsThisLeg: 0,
    totalScoredThisMatch: 0,
    totalDartsThisMatch: 0,
    stallCount: 0,
  });

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

  const [dartboardHits, setDartboardHits] = useState<DartHit[]>([]);
  const [botLastVisitTotal, setBotLastVisitTotal] = useState<number | null>(null);
  const [showVisualization, setShowVisualization] = useState(true);
  const [botFormMultiplier] = useState(() => 0.85 + Math.random() * 0.3);
  const dartboardAnimationTimerRef = useRef<number | null>(null);

  const { saveStatus, savedMatchId, saveError } = useMatchPersistence({
    matchWinner,
    showMatchCompleteModal,
    matchConfig: config ? {
      mode: config.mode as '301' | '501',
      bestOf: config.bestOf,
      doubleOut: config.doubleOut,
      straightIn: false,
      botAverage: config.botAverage,
    } : { mode: '501', bestOf: 'best-of-1', doubleOut: true, straightIn: false },
    matchType: 'training',
    opponentType: 'dartbot',
    opponentName: config ? `DartBot (${config.botAverage})` : 'DartBot',
    dartbotLevel: config ? parseInt(config.botAverage.toString()) : 65,
    player1LegsWon,
    player2LegsWon,
    allLegs,
    currentLeg,
    player1Name: 'You',
    matchStartTime,
    player1TotalDartsAtDouble,
    player1CheckoutsMade,
    player2TotalDartsAtDouble,
    player2CheckoutsMade,
  });

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
  }, []);

  useEffect(() => {
    matchOverRef.current = !!matchWinner || showMatchCompleteModal;
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

  const animateBotThrows = useCallback(async (darts: DartResult[]): Promise<void> => {
    clearDartboardAnimationTimer();
    setDartboardHits([]);

    for (let i = 0; i < darts.length; i++) {
      await new Promise<void>((resolve) => {
        dartboardAnimationTimerRef.current = window.setTimeout(() => {
          const dart = darts[i];
          setDartboardHits(prev => [
            ...prev,
            {
              x: dart.x,
              y: dart.y,
              label: dart.label,
              offboard: dart.offboard,
            },
          ]);
          resolve();
        }, 500);
      });
    }

    await new Promise<void>((resolve) => {
      dartboardAnimationTimerRef.current = window.setTimeout(() => {
        setDartboardHits([]);
        resolve();
      }, 1500);
    });
  }, [clearDartboardAnimationTimer]);

  const executeBotTurnWithFallback = useCallback((currentScore: number, isRecovery: boolean = false) => {
    try {
      if (!config) return null;

      const botDarts = generateBotDarts(config.botAverage, currentScore, config.doubleOut, botMatchState);
      const turnResult = resolveTurn(currentScore, botDarts, config.doubleOut);
      return turnResult;
    } catch (error) {
      console.error('BOT_TURN_ERROR', error);

      const fallbackDarts = [
        { miss: true },
        { miss: true },
        { miss: true }
      ] as any[];

      try {
        return resolveTurn(currentScore, fallbackDarts, config?.doubleOut || false);
      } catch (fallbackError) {
        console.error('BOT_FALLBACK_ERROR', fallbackError);
        return {
          visitTotal: 0,
          isBust: false,
          isCheckout: false,
          newRemaining: currentScore,
          dartsThrown: 3,
        };
      }
    }
  }, [config, botMatchState]);

  const botTakeTurn = useCallback(async () => {
    if (matchOverRef.current || isLegTransitioning) {
      return;
    }

    const currentScore = player2Score;

    if (currentScore <= 0) {
      console.warn('BOT_VISIT_BLOCKED_FROM_SCORE', currentScore);
      setCurrentPlayer('player1');
      return;
    }

    if (showVisualization && config) {
      const visualVisit = simulateVisit({
        level: config.botAverage,
        remaining: currentScore,
        doubleOut: config.doubleOut,
        formMultiplier: botFormMultiplier,
      });

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

      const wasCheckoutAttempt = currentScore <= 170;

      setBotMatchState(prev => ({
        totalScoredThisMatch: prev.totalScoredThisMatch + (visualVisit.bust ? 0 : visualVisit.visitTotal),
        totalDartsThisMatch: prev.totalDartsThisMatch + dartsThrown,
        checkoutAttemptsThisLeg: visualVisit.finished ? 0 : prev.checkoutAttemptsThisLeg + (wasCheckoutAttempt ? 1 : 0),
        lastRemaining: visualVisit.newRemaining,
        stallCount: prev.lastRemaining === visualVisit.newRemaining ? prev.stallCount + 1 : 0,
      }));

      setPlayer2Score(visualVisit.newRemaining);

      if (visualVisit.finished) {
        setTimeout(() => {
          if (matchOverRef.current) return;
          handleLegComplete('player2');
        }, 500);
        return;
      }

      setCurrentPlayer('player1');
    } else {
      const turnResult = executeBotTurnWithFallback(currentScore, false);
      if (!turnResult) {
        setCurrentPlayer('player1');
        return;
      }

      console.log('BOT_TAKE_TURN_COMPLETE', { currentScore, turnResult });

      const visit: Visit = {
        player: 'player2',
        score: turnResult.isBust ? 0 : turnResult.visitTotal,
        remainingScore: turnResult.newRemaining,
        isBust: turnResult.isBust,
        isCheckout: turnResult.isCheckout,
        timestamp: Date.now(),
      };

      setCurrentLeg(prev => {
        const dartsUsedInFirst9 = Math.min(turnResult.dartsThrown, Math.max(0, 9 - prev.player2First9DartsThrown));
        const pointsForFirst9 = dartsUsedInFirst9 > 0 ? (turnResult.isBust ? 0 : (turnResult.visitTotal * dartsUsedInFirst9) / turnResult.dartsThrown) : 0;

        return {
          ...prev,
          visits: [...prev.visits, visit],
          player2DartsThrown: prev.player2DartsThrown + turnResult.dartsThrown,
          player2First9DartsThrown: prev.player2First9DartsThrown + dartsUsedInFirst9,
          player2First9PointsScored: prev.player2First9PointsScored + pointsForFirst9,
        };
      });

      if (!turnResult.isBust) {
        setPlayer2MatchTotalScored(prev => prev + turnResult.visitTotal);
      }
      setPlayer2MatchDartsThrown(prev => prev + turnResult.dartsThrown);

      const wasCheckoutAttempt = currentScore <= 170;

      setBotMatchState(prev => ({
        totalScoredThisMatch: prev.totalScoredThisMatch + (turnResult.isBust ? 0 : turnResult.visitTotal),
        totalDartsThisMatch: prev.totalDartsThisMatch + turnResult.dartsThrown,
        checkoutAttemptsThisLeg: turnResult.isCheckout ? 0 : prev.checkoutAttemptsThisLeg + (wasCheckoutAttempt ? 1 : 0),
        lastRemaining: turnResult.newRemaining,
        stallCount: prev.lastRemaining === turnResult.newRemaining ? prev.stallCount + 1 : 0,
      }));

      setPlayer2Score(turnResult.newRemaining);

      if (turnResult.isCheckout) {
        setTimeout(() => {
          if (matchOverRef.current) return;
          handleLegComplete('player2');
        }, 500);
        return;
      }

      setCurrentPlayer('player1');
    }
  }, [isLegTransitioning, player2Score, executeBotTurnWithFallback, showVisualization, config, botFormMultiplier, animateBotThrows]);

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
    console.log("BOT_SCHEDULED", { myTurnId, reason });

    const BOT_THINK_DELAY_MS = getBotThinkingDelay();

    botTimerRef.current = window.setTimeout(async () => {
      if (myTurnId !== botTurnIdRef.current) {
        console.log("BOT_SCHEDULE_IGNORED", { myTurnId });
        return;
      }

      try {
        console.log("BOT_START", { myTurnId });

        await Promise.race([
          botTakeTurn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("BOT_TIMEOUT")), 2000)),
        ]);

        console.log("BOT_DONE", { myTurnId });
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

    const currentScore = player1Score;
    const doubleOut = config.doubleOut;
    const minDarts = getMinDartsToCheckout(currentScore, doubleOut);
    const newScore = currentScore - score;
    const isCheckout = newScore === 0;

    if (minDarts !== null && doubleOut) {
      setPendingVisitData({ score, minDarts, isCheckout });
      setShowDartsAtDoubleModal(true);
    } else {
      handleScoreSubmit(score, 3, undefined, true, 0);
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
        const pointsForFirst9 = dartsUsedInFirst9 > 0 ? 0 : 0;

        return {
          ...prev,
          visits: [...prev.visits, visit],
          player1DartsThrown: prev.player1DartsThrown + dartsThrown,
          player1First9DartsThrown: prev.player1First9DartsThrown + dartsUsedInFirst9,
          player1First9PointsScored: prev.player1First9PointsScored + pointsForFirst9,
        };
      });

      setPlayer1MatchDartsThrown(prev => prev + dartsThrown);
      setCurrentPlayer('player2');
      setScoreInput('');
      setCurrentVisit([]);
      setInputModeError('');
      return;
    }

    if (newScore === 0 && doubleOut && !isTypedInput && lastDartType && lastDartType !== 'D' && lastDartType !== 'BULL') {
      const visit: Visit = {
        player: 'player1',
        score: 0,
        remainingScore: currentScore,
        isBust: true,
        isCheckout: false,
        timestamp: Date.now(),
        bustReason: 'No double-out',
      };

      setCurrentLeg(prev => {
        const dartsUsedInFirst9 = Math.min(dartsThrown, Math.max(0, 9 - prev.player1First9DartsThrown));
        const pointsForFirst9 = dartsUsedInFirst9 > 0 ? 0 : 0;

        return {
          ...prev,
          visits: [...prev.visits, visit],
          player1DartsThrown: prev.player1DartsThrown + dartsThrown,
          player1First9DartsThrown: prev.player1First9DartsThrown + dartsUsedInFirst9,
          player1First9PointsScored: prev.player1First9PointsScored + pointsForFirst9,
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

    console.log('LEG_WON_BY', winner, { player1Score, player2Score });

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
        console.log('LEG_WIN', 'player1', 'next legs:', newLegs, 'legsToWin:', legsToWin);

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
        console.log('LEG_WIN', 'player2', 'next legs:', newLegs, 'legsToWin:', legsToWin);

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

    console.log("START_NEXT_LEG", { nextStarting: legStartingPlayer === 'player1' ? 'player2' : 'player1' });

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

    setBotMatchState(prev => resetBotLegState(prev));

    setTimeout(() => {
      setIsLegTransitioning(false);

      if (nextStartingPlayer === 'player2') {
        setCurrentPlayer('player2');
        scheduleBotTurn("leg_reset_bot_starts");
      } else {
        setCurrentPlayer('player1');
      }
    }, 0);
  }, [matchWinner, showMatchCompleteModal, legStartingPlayer, currentLeg.legNumber, clearBotTimer, scheduleBotTurn]);

  const handleRematch = () => {
    matchOverRef.current = false;
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
    setBotMatchState(resetBotLegState());
    setPlayer1TotalDartsAtDouble(0);
    setPlayer1CheckoutsMade(0);
    setPlayer2TotalDartsAtDouble(0);
    setPlayer2CheckoutsMade(0);
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
    } else if (newRemaining > 0) {
      shouldPadWithMisses = true;
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
      if (doubleOut && isOneDartFinish(remainingBeforeDart)) {
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

  const handleValidateEditedVisit = (newScore: number) => {
    if (editingVisitIndex === null || !config) {
      return { valid: false, error: 'Invalid state' };
    }

    const visit = currentLeg.visits[editingVisitIndex];
    const originalScore = visit.score;
    const currentRemaining = player1Score;

    const validation = validateEditedVisit(
      currentRemaining,
      originalScore,
      newScore
    );

    return validation;
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

    setPlayer1MatchTotalScored(prev => prev + delta);
    setPlayer1Score(newRemaining);

    const isWin = newRemaining === 0;

    if (isWin) {
      setShowEditVisitModal(false);
      toast.success('Leg won!');
      setTimeout(() => {
        handleLegComplete('player1');
      }, 500);
    } else {
      setShowEditVisitModal(false);
      toast.success('Visit updated');
    }
  };

  const visitTotal = currentVisit.reduce((sum, dart) => sum + dart.value, 0);

  const getDartLabel = (dart: Dart) => {
    if (dart.number === 0 && dart.value === 0) {
      return 'MISS';
    }
    if (dart.type === 'bull') {
      return dart.number === 25 ? 'SB' : 'DB';
    }
    const prefix = dart.type === 'single' ? 'S' : dart.type === 'double' ? 'D' : 'T';
    return `${prefix}${dart.number}`;
  };

  if (!config) {
    return <div className="text-white">Loading...</div>;
  }

  const currentScore = currentPlayer === 'player1' ? player1Score : player2Score;
  const checkoutOptions = getCheckoutOptions(currentScore, config.doubleOut);

  const getPlayerVisits = (player: 'player1' | 'player2') => {
    return currentLeg.visits.filter(v => v.player === player);
  };

  const player1Stats = calculateStats(getPlayerVisits('player1').map(v => ({
    score: v.score,
    is_bust: v.isBust,
    is_checkout: v.isCheckout,
  })));

  const player2Stats = calculateStats(getPlayerVisits('player2').map(v => ({
    score: v.score,
    is_bust: v.isBust,
    is_checkout: v.isCheckout,
  })));

  const getAllVisitsForPlayer = (player: 'player1' | 'player2') => {
    return allLegs.flatMap(leg =>
      leg.visits.filter(v => v.player === player)
    ).concat(currentLeg.visits.filter(v => v.player === player));
  };

  const player1AllVisits = getAllVisitsForPlayer('player1');
  const player2AllVisits = getAllVisitsForPlayer('player2');

  const player1AllStats = calculateStats(player1AllVisits.map(v => ({
    score: v.score,
    is_bust: v.isBust,
    is_checkout: v.isCheckout,
  })));

  const player2AllStats = calculateStats(player2AllVisits.map(v => ({
    score: v.score,
    is_bust: v.isBust,
    is_checkout: v.isCheckout,
  })));

  const getAllLegsFirst9Data = (player: 'player1' | 'player2'): LegFirst9Data[] => {
    const allLegsData = [...allLegs, currentLeg];
    return allLegsData.map(leg => ({
      dartsThrown: player === 'player1' ? leg.player1First9DartsThrown : leg.player2First9DartsThrown,
      pointsScored: player === 'player1' ? leg.player1First9PointsScored : leg.player2First9PointsScored,
    }));
  };

  const player1First9Average = calculateFirst9Average(getAllLegsFirst9Data('player1'));
  const player2First9Average = calculateFirst9Average(getAllLegsFirst9Data('player2'));

  const getMatchAverage = (totalScored: number, dartsThrown: number) => {
    if (dartsThrown === 0) return 0;
    return Math.round((totalScored / dartsThrown) * 3 * 100) / 100;
  };

  const player1MatchAverage = getMatchAverage(player1MatchTotalScored, player1MatchDartsThrown);
  const player2MatchAverage = getMatchAverage(player2MatchTotalScored, player2MatchDartsThrown);

  const isOnCheckout = currentScore <= 170 && currentScore > 1;

  const botName = `DartBot (${config.botAverage})`;

  return (
    <MatchErrorBoundary>
      <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      <div className="border-b border-white/10 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-[1800px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Target className="w-6 h-6 text-emerald-400" />
                <span className="text-xl font-bold text-white">FIVE<span className="text-emerald-400">01</span></span>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">TRAINING</Badge>
            </div>

            <div className="flex items-center space-x-4 text-sm text-gray-400">
              <span>{config.mode === 'around-the-clock' ? 'Around the Clock' : config.mode}</span>
              <span>•</span>
              <span>{config.bestOf.replace('best-of-', 'Best of ')}</span>
              {config.doubleOut && (
                <>
                  <span>•</span>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs">
                    Double Out
                  </Badge>
                </>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEndMatchDialog(true)}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              End Training
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="max-w-[1800px] mx-auto px-4 py-2 h-full flex flex-col">
          <div className="grid grid-cols-3 gap-3 mb-2 flex-shrink-0">
            <Card className="bg-slate-900/50 border-white/10 p-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Current Leg</h3>
                  <Badge variant="outline" className="text-xs">Leg {currentLeg.legNumber}</Badge>
                </div>
                <div className="flex items-center justify-center space-x-3">
                  <div className="text-center">
                    <p className="text-xl font-bold text-white">{player1LegsWon}</p>
                    <p className="text-xs text-gray-400">You</p>
                  </div>
                  <div className="text-2xl font-bold text-gray-600">-</div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-white">{player2LegsWon}</p>
                    <p className="text-xs text-gray-400">Bot</p>
                  </div>
                </div>
                <div className="text-center py-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <p className="text-emerald-400 text-sm font-semibold">
                    {currentPlayer === 'player1' ? 'Your' : 'Bot\'s'} Turn
                  </p>
                </div>
              </div>
            </Card>

            <Card className={`p-3 transition-all ${currentPlayer === 'player1' ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-slate-900/50 border-white/10'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-sm">
                      YOU
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-white">You</p>
                    <p className="text-xs text-gray-400">Legs: {player1LegsWon}</p>
                  </div>
                </div>
              </div>
              <div className="text-center py-2">
                <p className="text-4xl font-bold text-white">{player1Score}</p>
                <p className="text-xs text-gray-400 mt-1">Remaining</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-center bg-white/5 rounded p-1">
                  <p className="text-gray-400">Avg</p>
                  <p className="text-white font-semibold">{player1MatchAverage}</p>
                </div>
                <div className="text-center bg-white/5 rounded p-1">
                  <p className="text-gray-400">High</p>
                  <p className="text-white font-semibold">{player1Stats.highestScore}</p>
                </div>
              </div>
            </Card>

            <Card className={`p-3 transition-all ${currentPlayer === 'player2' ? 'bg-emerald-500/20 border-emerald-500/50' : 'bg-slate-900/50 border-white/10'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-gradient-to-br from-blue-400 to-cyan-500 text-white text-sm">
                      <Bot className="w-5 h-5" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-white">{botName}</p>
                    <p className="text-xs text-gray-400">Legs: {player2LegsWon}</p>
                  </div>
                </div>
              </div>
              <div className="text-center py-2">
                <p className="text-4xl font-bold text-white">{player2Score}</p>
                <p className="text-xs text-gray-400 mt-1">Remaining</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-center bg-white/5 rounded p-1">
                  <p className="text-gray-400">Avg</p>
                  <p className="text-white font-semibold">{player2MatchAverage}</p>
                </div>
                <div className="text-center bg-white/5 rounded p-1">
                  <p className="text-gray-400">High</p>
                  <p className="text-white font-semibold">{player2Stats.highestScore}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid gap-3 flex-1 min-h-0" style={{ gridTemplateColumns: showVisualization ? '0.65fr 0.65fr 1.25fr' : '0.75fr 1.25fr' }}>
            {showVisualization && (
              <Card className="bg-slate-900/50 border-white/10 p-3 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-2 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-white">Dartbot Board</h3>
                  {isBotThinking && (
                    <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                      Throwing...
                    </Badge>
                  )}
                </div>
                <div className="flex-1 flex flex-col items-center justify-center">
                  <DartboardSVG hits={dartboardHits} className="max-w-full" />
                  {botLastVisitTotal !== null && (
                    <div className="mt-2 text-center">
                      <p className="text-sm text-gray-400">Last Visit</p>
                      <p className="text-2xl font-bold text-white">{botLastVisitTotal}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            <Card className="bg-slate-900/50 border-white/10 p-3 flex flex-col overflow-hidden">
              <h3 className="text-sm font-semibold text-white mb-2 flex-shrink-0">Visit History</h3>
              <div className="flex-1 overflow-y-auto pr-2" style={{ minHeight: 0 }}>
                <div className="space-y-2 pr-2">
                  {currentLeg.visits.slice().reverse().map((visit, idx) => {
                    const actualIndex = currentLeg.visits.length - idx - 1;
                    return (
                      <div
                        key={actualIndex}
                        className={`flex items-center justify-between text-sm p-2 rounded group ${
                          visit.player === 'player1'
                            ? 'bg-teal-500/5 border-l-2 border-l-teal-400/60'
                            : 'bg-slate-700/20 border-l-2 border-l-slate-500/60'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1 py-0 ${
                              visit.player === 'player1'
                                ? 'border-teal-400/40 text-teal-300'
                                : 'border-slate-500/50 text-slate-300'
                            }`}
                          >
                            {visit.player === 'player1' ? 'YOU' : 'BOT'}
                          </Badge>
                          <span className="text-gray-500 text-xs">
                            #{currentLeg.visits.length - idx}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {visit.isBust && (
                            <Badge variant="outline" className="border-red-500/30 text-red-400 text-xs">
                              {visit.bustReason ? 'NO DOUBLE' : 'BUST'}
                            </Badge>
                          )}
                          {visit.isCheckout && (
                            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs">
                              CHECKOUT
                            </Badge>
                          )}
                          <span className="text-white font-semibold">{visit.score}</span>
                          <span className="text-gray-500">→</span>
                          <span className="text-gray-400">{visit.remainingScore}</span>
                          {visit.player === 'player1' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditVisit(actualIndex)}
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-teal-500/20"
                            >
                              <Pencil className="w-3 h-3 text-teal-400" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {currentLeg.visits.length === 0 && (
                    <p className="text-gray-500 text-center py-8 text-sm">No visits yet</p>
                  )}
                </div>
              </div>
            </Card>

            <Card className="bg-slate-900/50 border-white/10 p-2 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-1 flex-shrink-0">
                <h3 className="text-base font-semibold text-white">Scoring</h3>
                <Tabs value={scoringMode} onValueChange={(v) => setScoringMode(v as 'quick' | 'input')}>
                  <TabsList className="bg-slate-800/50 h-8">
                    <TabsTrigger value="quick" className="data-[state=active]:bg-emerald-500 text-xs">Quick</TabsTrigger>
                    <TabsTrigger value="input" className="data-[state=active]:bg-emerald-500 text-xs">Input</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {isBotThinking && (
                <Card className="bg-blue-500/20 border-blue-500/30 p-1.5 mb-1 flex-shrink-0">
                  <div className="flex items-center justify-center space-x-2">
                    <Bot className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                    <p className="text-xs text-blue-400 font-semibold">Bot thinking...</p>
                  </div>
                </Card>
              )}

              {isOnCheckout && currentPlayer === 'player1' && (
                checkoutOptions.length > 0 ? (
                  <Card className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500/30 p-1.5 mb-1 flex-shrink-0">
                    <div className="flex items-center space-x-2 mb-0.5">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      <h4 className="text-xs font-semibold text-white">CHECKOUT AVAILABLE</h4>
                      <span className="text-amber-400 font-bold text-base ml-auto">{currentScore}</span>
                    </div>
                    <div className="text-amber-300 text-xs font-semibold">
                      {checkoutOptions[0].description}
                    </div>
                  </Card>
                ) : (
                  <Card className="bg-gradient-to-br from-gray-500/20 to-slate-500/20 border-gray-500/30 p-1.5 mb-1 flex-shrink-0">
                    <div className="flex items-center space-x-2">
                      <Zap className="w-3.5 h-3.5 text-gray-400" />
                      <h4 className="text-xs font-semibold text-white">CHECKOUT NOT POSSIBLE</h4>
                      <span className="text-gray-400 font-bold text-base ml-auto">{currentScore}</span>
                    </div>
                  </Card>
                )
              )}

              {scoringMode === 'quick' ? (
                <div className="flex-1 flex flex-col min-h-0">
                  <Card className="bg-emerald-500/10 border-emerald-500/30 p-1.5 mb-1 flex-shrink-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-emerald-400">Current Visit</h4>
                      <span className="text-emerald-400 font-bold text-sm">Total: {visitTotal}</span>
                    </div>
                    <div className="flex items-center space-x-1.5 mt-1">
                      {currentVisit.map((dart, idx) => (
                        <Badge key={idx} className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50 text-xs py-0.5">
                          {getDartLabel(dart)} ({dart.value})
                        </Badge>
                      ))}
                      {[...Array(3 - currentVisit.length)].map((_, idx) => (
                        <div key={idx} className="w-14 h-5 border-2 border-dashed border-gray-600 rounded"></div>
                      ))}
                    </div>
                  </Card>

                  <div className="flex flex-col">
                    <div className="flex space-x-1.5 mb-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant={dartboardGroup === 'singles' ? 'default' : 'outline'}
                        onClick={() => setDartboardGroup('singles')}
                        className={`${dartboardGroup === 'singles' ? 'bg-emerald-500' : 'border-white/10 text-white'} h-7 text-xs`}
                        disabled={currentPlayer !== 'player1'}
                      >
                        Singles
                      </Button>
                      <Button
                        size="sm"
                        variant={dartboardGroup === 'doubles' ? 'default' : 'outline'}
                        onClick={() => setDartboardGroup('doubles')}
                        className={`${dartboardGroup === 'doubles' ? 'bg-emerald-500' : 'border-white/10 text-white'} h-7 text-xs`}
                        disabled={currentPlayer !== 'player1'}
                      >
                        Doubles
                      </Button>
                      <Button
                        size="sm"
                        variant={dartboardGroup === 'triples' ? 'default' : 'outline'}
                        onClick={() => setDartboardGroup('triples')}
                        className={`${dartboardGroup === 'triples' ? 'bg-emerald-500' : 'border-white/10 text-white'} h-7 text-xs`}
                        disabled={currentPlayer !== 'player1'}
                      >
                        Triples
                      </Button>
                      <Button
                        size="sm"
                        variant={dartboardGroup === 'bulls' ? 'default' : 'outline'}
                        onClick={() => setDartboardGroup('bulls')}
                        className={`${dartboardGroup === 'bulls' ? 'bg-emerald-500' : 'border-white/10 text-white'} h-7 text-xs`}
                        disabled={currentPlayer !== 'player1'}
                      >
                        Bulls
                      </Button>
                    </div>

                    {dartboardGroup !== 'bulls' ? (
                      <div className="grid grid-cols-5 gap-1 mb-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((num) => (
                          <Button
                            key={num}
                            onClick={() => handleDartClick(dartboardGroup, num)}
                            disabled={currentVisit.length >= 3 || currentPlayer !== 'player1'}
                            className="h-10 text-xs font-semibold bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/30 text-white disabled:opacity-50"
                          >
                            {dartboardGroup === 'singles' ? `S${num}` : dartboardGroup === 'doubles' ? `D${num}` : `T${num}`}
                            <span className="text-[10px] text-gray-400 ml-0.5">
                              ({dartboardGroup === 'singles' ? num : dartboardGroup === 'doubles' ? num * 2 : num * 3})
                            </span>
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 mb-1">
                        <Button
                          onClick={() => handleDartClick('bulls', 25)}
                          disabled={currentVisit.length >= 3 || currentPlayer !== 'player1'}
                          className="h-12 text-sm font-semibold bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/30 text-white disabled:opacity-50"
                        >
                          Single Bull
                          <span className="block text-xs text-gray-400">(25)</span>
                        </Button>
                        <Button
                          onClick={() => handleDartClick('bulls', 50)}
                          disabled={currentVisit.length >= 3 || currentPlayer !== 'player1'}
                          className="h-12 text-sm font-semibold bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/30 text-white disabled:opacity-50"
                        >
                          Double Bull
                          <span className="block text-xs text-gray-400">(50)</span>
                        </Button>
                      </div>
                    )}

                    <Button
                      onClick={() => handleDartClick('singles', 0)}
                      variant="outline"
                      className="w-full h-8 mb-1 border-white/10 text-white hover:bg-white/5 font-semibold text-sm flex-shrink-0"
                      disabled={currentPlayer !== 'player1'}
                    >
                      Miss (0)
                    </Button>

                    <div className="grid grid-cols-3 gap-2 flex-shrink-0">
                      <Button
                        onClick={handleClearVisit}
                        disabled={currentVisit.length === 0 || currentPlayer !== 'player1'}
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-white hover:bg-white/5"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Clear
                      </Button>
                      <Button
                        onClick={handleSubmitVisit}
                        disabled={currentVisit.length === 0 || currentPlayer !== 'player1'}
                        size="sm"
                        className="bg-emerald-500 hover:bg-emerald-600 text-white"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Submit Visit
                      </Button>
                      <Button
                        onClick={handleBust}
                        variant="outline"
                        size="sm"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                        disabled={currentPlayer !== 'player1'}
                      >
                        Bust
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col space-y-0.5 min-h-0">
                  <Card className="bg-emerald-500/10 border-emerald-500/30 p-1.5 flex-shrink-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="text-xs font-semibold text-emerald-400">Current Visit</h4>
                      <span className="text-emerald-400 font-bold">Total: {scoreInput && !isNaN(parseInt(scoreInput)) ? parseInt(scoreInput) : 0}</span>
                    </div>
                    <div className="text-center text-white text-sm">
                      {scoreInput && !isNaN(parseInt(scoreInput)) ? `Visit total: ${scoreInput}` : 'Enter visit total (0-180)'}
                    </div>
                  </Card>

                  {inputModeError && (
                    <Card className="bg-red-500/20 border-red-500/30 p-2 flex-shrink-0">
                      <p className="text-red-400 text-xs text-center">{inputModeError}</p>
                    </Card>
                  )}

                  <div className="flex space-x-2 flex-shrink-0">
                    <Input
                      type="number"
                      min="0"
                      max="180"
                      value={scoreInput}
                      onChange={(e) => {
                        setScoreInput(e.target.value);
                        setInputModeError('');
                      }}
                      placeholder="Enter score (0-180)"
                      className="flex-1 bg-white/5 border-white/10 text-white text-lg"
                      disabled={currentPlayer !== 'player1'}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && scoreInput) {
                          const score = parseInt(scoreInput);
                          if (score >= 0 && score <= 180) {
                            handleInputScoreSubmit(score);
                          }
                        }
                      }}
                    />
                    <Button
                      onClick={() => {
                        if (scoreInput) {
                          const score = parseInt(scoreInput);
                          if (score >= 0 && score <= 180) {
                            handleInputScoreSubmit(score);
                          }
                        }
                      }}
                      disabled={!scoreInput || parseInt(scoreInput) < 0 || parseInt(scoreInput) > 180 || currentPlayer !== 'player1'}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white px-8"
                    >
                      Submit
                    </Button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 flex-shrink-0">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
                      <Button
                        key={num}
                        onClick={() => setScoreInput(prev => prev + num.toString())}
                        className="h-12 text-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                        disabled={currentPlayer !== 'player1'}
                      >
                        {num}
                      </Button>
                    ))}
                    <Button
                      onClick={() => setScoreInput('')}
                      className="h-12 text-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400"
                      disabled={currentPlayer !== 'player1'}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>

      <AlertDialog open={showEndMatchDialog} onOpenChange={setShowEndMatchDialog}>
        <AlertDialogContent className="bg-slate-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">End Training?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to end this training session? All progress will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReturnToPlay}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              End Training
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showMatchCompleteModal} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="text-center space-y-4 py-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full mb-4">
                <Trophy className="w-10 h-10 text-white" />
              </div>
              <DialogTitle className="text-4xl font-bold text-white">
                Training Complete!
              </DialogTitle>
              <p className="text-2xl text-gray-300">
                {matchWinner === 'player1' ? 'You' : 'Bot'} win{matchWinner === 'player1' ? '' : 's'} {matchWinner === 'player1' ? player1LegsWon : player2LegsWon}-{matchWinner === 'player1' ? player2LegsWon : player1LegsWon}
              </p>
            </div>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-6 my-6">
            <Card className="bg-slate-800/50 border-white/10 p-6">
              <div className="flex items-center space-x-3 mb-6">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white">
                    YOU
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">You</h3>
                  <p className="text-sm text-gray-400">
                    {matchWinner === 'player1' ? 'Winner' : 'Runner-up'}
                  </p>
                </div>
                {matchWinner === 'player1' && (
                  <Trophy className="w-6 h-6 text-amber-400" />
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-gray-300 text-sm">3-Dart Average</span>
                  </div>
                  <span className="text-white font-bold">{player1AllStats.threeDartAverage}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                    <span className="text-gray-300 text-sm">First 9 Dart Avg</span>
                  </div>
                  <span className="text-white font-bold">{player1First9Average}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-300 text-sm">Highest Score</span>
                  </div>
                  <span className="text-white font-bold">{player1AllStats.highestScore}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Target className="w-4 h-4 text-amber-400" />
                    <span className="text-gray-300 text-sm">Checkout %</span>
                  </div>
                  <span className="text-white font-bold">
                    {player1TotalDartsAtDouble > 0
                      ? Math.round((player1CheckoutsMade / player1TotalDartsAtDouble) * 100 * 100) / 100
                      : 0}%
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Doubles</span>
                  <span className="text-white font-bold">{player1CheckoutsMade} / {player1TotalDartsAtDouble}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center pt-2">
                  <div className="p-2 bg-white/5 rounded-lg">
                    <p className="text-xl font-bold text-white">{player1AllStats.count100Plus}</p>
                    <p className="text-xs text-gray-400">100+</p>
                  </div>
                  <div className="p-2 bg-white/5 rounded-lg">
                    <p className="text-xl font-bold text-white">{player1AllStats.count140Plus}</p>
                    <p className="text-xs text-gray-400">140+</p>
                  </div>
                  <div className="p-2 bg-white/5 rounded-lg">
                    <p className="text-xl font-bold text-white">{player1AllStats.count180}</p>
                    <p className="text-xs text-gray-400">180s</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Legs Won</span>
                  <span className="text-white font-bold">{player1LegsWon}</span>
                </div>
              </div>
            </Card>

            <Card className="bg-slate-800/50 border-white/10 p-6">
              <div className="flex items-center space-x-3 mb-6">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="bg-gradient-to-br from-blue-400 to-cyan-500 text-white">
                    <Bot className="w-6 h-6" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">{botName}</h3>
                  <p className="text-sm text-gray-400">
                    {matchWinner === 'player2' ? 'Winner' : 'Runner-up'}
                  </p>
                </div>
                {matchWinner === 'player2' && (
                  <Trophy className="w-6 h-6 text-amber-400" />
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-gray-300 text-sm">3-Dart Average</span>
                  </div>
                  <span className="text-white font-bold">{player2AllStats.threeDartAverage}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                    <span className="text-gray-300 text-sm">First 9 Dart Avg</span>
                  </div>
                  <span className="text-white font-bold">{player2First9Average}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-300 text-sm">Highest Score</span>
                  </div>
                  <span className="text-white font-bold">{player2AllStats.highestScore}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Target className="w-4 h-4 text-amber-400" />
                    <span className="text-gray-300 text-sm">Checkout %</span>
                  </div>
                  <span className="text-white font-bold">
                    {player2TotalDartsAtDouble > 0
                      ? Math.round((player2CheckoutsMade / player2TotalDartsAtDouble) * 100 * 100) / 100
                      : 0}%
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Doubles</span>
                  <span className="text-white font-bold">{player2CheckoutsMade} / {player2TotalDartsAtDouble}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center pt-2">
                  <div className="p-2 bg-white/5 rounded-lg">
                    <p className="text-xl font-bold text-white">{player2AllStats.count100Plus}</p>
                    <p className="text-xs text-gray-400">100+</p>
                  </div>
                  <div className="p-2 bg-white/5 rounded-lg">
                    <p className="text-xl font-bold text-white">{player2AllStats.count140Plus}</p>
                    <p className="text-xs text-gray-400">140+</p>
                  </div>
                  <div className="p-2 bg-white/5 rounded-lg">
                    <p className="text-xl font-bold text-white">{player2AllStats.count180}</p>
                    <p className="text-xs text-gray-400">180s</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Legs Won</span>
                  <span className="text-white font-bold">{player2LegsWon}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex justify-center space-x-4 pt-4">
            <Button
              size="lg"
              onClick={handleRematch}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white px-8"
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              Try Again
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleReturnToPlay}
              className="border-white/10 text-white hover:bg-white/5 px-8"
            >
              <Home className="w-5 h-5 mr-2" />
              Back to Play
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <EditVisitModal
        open={showEditVisitModal}
        onOpenChange={setShowEditVisitModal}
        visitNumber={editingVisitIndex !== null ? editingVisitIndex + 1 : 0}
        originalScore={editingVisitScore}
        onSave={handleSaveEditedVisit}
        onValidate={handleValidateEditedVisit}
      />

      {pendingVisitData && (
        <DartsAtDoubleModal
          isOpen={showDartsAtDoubleModal}
          minDarts={pendingVisitData.minDarts}
          isCheckout={pendingVisitData.isCheckout}
          onConfirm={handleDartsAtDoubleConfirm}
          onCancel={() => {
            setShowDartsAtDoubleModal(false);
            setPendingVisitData(null);
            setScoreInput('');
          }}
        />
      )}

      <MatchSaveDebugStrip
        saveStatus={saveStatus}
        savedMatchId={savedMatchId}
        saveError={saveError}
      />
    </div>
    </MatchErrorBoundary>
  );
}
