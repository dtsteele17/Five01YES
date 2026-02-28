'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AroundTheClockMatch } from '@/components/match/AroundTheClockMatch';
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
import { Target, Undo2, Trophy, TrendingUp, Zap, RotateCcw, Home, X, Check, Pencil } from 'lucide-react';
import { getCheckoutOptions, isBust, isValidCheckout, calculateStats, getLegsToWin, validateEditedVisit, getMinDartsToCheckout, isOneDartFinish } from '@/lib/match-logic';
import { getStartScore } from '@/lib/game-modes';
import { checkScoreAchievements } from '@/lib/utils/achievements';
import EditVisitModal from '@/components/app/EditVisitModal';
import { DartsAtDoubleModal } from '@/components/app/DartsAtDoubleModal';
import { toast } from 'sonner';
import { useMatchPersistence } from '@/lib/hooks/useMatchPersistence';
import { normalizeMatchConfig } from '@/lib/match/defaultMatchConfig';
import { MatchErrorBoundary } from '@/components/match/MatchErrorBoundary';
import { computeFinalMatchStats, type FinalMatchStats } from '@/lib/stats/finalMatchStats';

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
}

interface Dart {
  type: 'single' | 'double' | 'triple' | 'bull';
  number: number;
  value: number;
}

export default function LocalMatchPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params?.matchId as string;

  const [matchConfig, setMatchConfig] = useState<any>(null);
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
  });
  const [allLegs, setAllLegs] = useState<LegData[]>([]);
  const [scoreInput, setScoreInput] = useState('');
  const [scoringMode, setScoringMode] = useState<'quick' | 'input'>('quick');
  const [showEndMatchDialog, setShowEndMatchDialog] = useState(false);
  const [showMatchCompleteModal, setShowMatchCompleteModal] = useState(false);
  const [matchWinner, setMatchWinner] = useState<'player1' | 'player2' | null>(null);
  const [matchStartTime] = useState(Date.now());
  const [player1Name, setPlayer1Name] = useState('Player 1');
  const [player2Name, setPlayer2Name] = useState('Player 2');

  const [currentVisit, setCurrentVisit] = useState<Dart[]>([]);
  const [dartboardGroup, setDartboardGroup] = useState<'singles' | 'doubles' | 'triples' | 'bulls'>('singles');

  const [player1MatchTotalScored, setPlayer1MatchTotalScored] = useState(0);
  const [player2MatchTotalScored, setPlayer2MatchTotalScored] = useState(0);
  const [player1MatchDartsThrown, setPlayer1MatchDartsThrown] = useState(0);
  const [player2MatchDartsThrown, setPlayer2MatchDartsThrown] = useState(0);
  const [inputModeError, setInputModeError] = useState<string>('');

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

  const [finalMatchStats, setFinalMatchStats] = useState<FinalMatchStats | null>(null);

  useEffect(() => {
    try {
      const config = localStorage.getItem(`match-${matchId}`);
      if (config) {
        const parsed = JSON.parse(config);
        const normalized = normalizeMatchConfig({
          bestOf: parsed.bestOf || parsed.matchFormat,
          mode: parsed.gameMode || parsed.mode,
          gameMode: parsed.gameMode || parsed.mode,
          doubleOut: parsed.doubleOut,
          straightIn: parsed.straightIn,
        });

        const finalConfig = {
          ...parsed,
          gameMode: normalized.mode,
          bestOf: normalized.bestOf,
          doubleOut: normalized.doubleOut,
          straightIn: normalized.straightIn,
        };

        setMatchConfig(finalConfig);
        const startingScore = getStartScore(normalized.mode);
        setPlayer1Score(startingScore);
        setPlayer2Score(startingScore);
        if (parsed.player1Name) setPlayer1Name(parsed.player1Name);
        if (parsed.player2Name) setPlayer2Name(parsed.player2Name);
      } else {
        router.push('/app/play');
      }
    } catch (error) {
      console.error('Error loading match config:', error);
      toast.error('Failed to load match configuration');
      router.push('/app/play');
    }
  }, [matchId, router]);

  useMatchPersistence({
    matchWinner,
    showMatchCompleteModal,
    matchConfig: matchConfig ? {
      mode: matchConfig.gameMode as '301' | '501',
      bestOf: matchConfig.bestOf,
      doubleOut: matchConfig.doubleOut,
      straightIn: matchConfig.straightIn || false,
    } : { mode: '501', bestOf: 'best-of-1', doubleOut: true, straightIn: false },
    matchType: (matchConfig?.matchType as any) || 'local',
    opponentType: 'local',
    opponentName: player2Name || 'Player 2',
    player1LegsWon,
    player2LegsWon,
    allLegs,
    currentLeg,
    player1Name: player1Name || 'Player 1',
    matchStartTime,
    finalMatchStats,
    player1TotalDartsAtDouble,
    player1CheckoutsMade,
    player2TotalDartsAtDouble,
    player2CheckoutsMade,
  });

  const handleInputScoreSubmit = (score: number) => {
    if (!matchConfig) return;

    try {
      const currentScore = currentPlayer === 'player1' ? player1Score : player2Score;
      const doubleOut = matchConfig?.doubleOut ?? true;
      const minDarts = getMinDartsToCheckout(currentScore, doubleOut);
      const newScore = currentScore - score;
      const isCheckout = newScore === 0;

      if (minDarts !== null && doubleOut) {
        setPendingVisitData({ score, minDarts, isCheckout });
        setShowDartsAtDoubleModal(true);
      } else {
        handleScoreSubmit(score, 3, undefined, true, 0);
      }
    } catch (error) {
      console.error('Error submitting score:', error);
      toast.error('Failed to submit score');
    }
  };

  const handleDartsAtDoubleConfirm = (dartsAtDouble: number) => {
    if (!pendingVisitData) return;

    if (currentPlayer === 'player1') {
      setPlayer1TotalDartsAtDouble(prev => prev + dartsAtDouble);
      if (pendingVisitData.isCheckout) {
        setPlayer1CheckoutsMade(prev => prev + 1);
      }
    } else {
      setPlayer2TotalDartsAtDouble(prev => prev + dartsAtDouble);
      if (pendingVisitData.isCheckout) {
        setPlayer2CheckoutsMade(prev => prev + 1);
      }
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
    if (!matchConfig) return;

    const currentScore = currentPlayer === 'player1' ? player1Score : player2Score;
    const doubleOut = matchConfig.doubleOut;
    const newScore = currentScore - score;

    if (isBust(currentScore, score, doubleOut)) {
      const visit: Visit = {
        player: currentPlayer,
        score: 0,
        remainingScore: currentScore,
        isBust: true,
        isCheckout: false,
        timestamp: Date.now(),
      };

      setCurrentLeg(prev => ({
        ...prev,
        visits: [...prev.visits, visit],
        [currentPlayer === 'player1' ? 'player1DartsThrown' : 'player2DartsThrown']:
          prev[currentPlayer === 'player1' ? 'player1DartsThrown' : 'player2DartsThrown'] + dartsThrown,
      }));

      if (currentPlayer === 'player1') {
        setPlayer1MatchDartsThrown(prev => prev + dartsThrown);
      } else {
        setPlayer2MatchDartsThrown(prev => prev + dartsThrown);
      }

      setCurrentPlayer(currentPlayer === 'player1' ? 'player2' : 'player1');
      setScoreInput('');
      setCurrentVisit([]);
      setInputModeError('');
      return;
    }

    if (newScore === 0 && doubleOut && !isTypedInput && lastDartType && lastDartType !== 'D' && lastDartType !== 'BULL') {
      const visit: Visit = {
        player: currentPlayer,
        score: 0,
        remainingScore: currentScore,
        isBust: true,
        isCheckout: false,
        timestamp: Date.now(),
        bustReason: 'No double-out',
      };

      setCurrentLeg(prev => ({
        ...prev,
        visits: [...prev.visits, visit],
        [currentPlayer === 'player1' ? 'player1DartsThrown' : 'player2DartsThrown']:
          prev[currentPlayer === 'player1' ? 'player1DartsThrown' : 'player2DartsThrown'] + dartsThrown,
      }));

      if (currentPlayer === 'player1') {
        setPlayer1MatchDartsThrown(prev => prev + dartsThrown);
      } else {
        setPlayer2MatchDartsThrown(prev => prev + dartsThrown);
      }

      setCurrentPlayer(currentPlayer === 'player1' ? 'player2' : 'player1');
      setScoreInput('');
      setCurrentVisit([]);
      setInputModeError('');
      return;
    }

    const isCheckout = newScore === 0;

    const visit: Visit = {
      player: currentPlayer,
      score,
      remainingScore: newScore,
      isBust: false,
      isCheckout,
      timestamp: Date.now(),
      lastDartType,
    };

    setCurrentLeg(prev => ({
      ...prev,
      visits: [...prev.visits, visit],
      [currentPlayer === 'player1' ? 'player1DartsThrown' : 'player2DartsThrown']:
        prev[currentPlayer === 'player1' ? 'player1DartsThrown' : 'player2DartsThrown'] + dartsThrown,
    }));

    if (currentPlayer === 'player1') {
      setPlayer1MatchTotalScored(prev => prev + score);
      setPlayer1MatchDartsThrown(prev => prev + dartsThrown);
      setPlayer1Score(newScore);
    } else {
      setPlayer2MatchTotalScored(prev => prev + score);
      setPlayer2MatchDartsThrown(prev => prev + dartsThrown);
      setPlayer2Score(newScore);
    }

    checkScoreAchievements(score);

    if (isCheckout) {
      handleLegComplete(currentPlayer);
    } else {
      setCurrentPlayer(currentPlayer === 'player1' ? 'player2' : 'player1');
    }

    setScoreInput('');
    setCurrentVisit([]);
    setInputModeError('');
  };

  const handleLegComplete = (winner: 'player1' | 'player2') => {
    const completedLeg = {
      ...currentLeg,
      winner,
    };

    const updatedLegs = [...allLegs, completedLeg];
    setAllLegs(updatedLegs);

    const newPlayer1Legs = winner === 'player1' ? player1LegsWon + 1 : player1LegsWon;
    const newPlayer2Legs = winner === 'player2' ? player2LegsWon + 1 : player2LegsWon;

    setPlayer1LegsWon(newPlayer1Legs);
    setPlayer2LegsWon(newPlayer2Legs);

    const legsToWin = getLegsToWin(matchConfig.matchFormat);

    if (newPlayer1Legs >= legsToWin || newPlayer2Legs >= legsToWin) {
      setMatchWinner(winner);

      const stats = computeFinalMatchStats(
        updatedLegs,
        { ...completedLeg, winner },
        player1TotalDartsAtDouble,
        player1CheckoutsMade,
        player2TotalDartsAtDouble,
        player2CheckoutsMade,
        matchConfig.gameMode as '301' | '501'
      );
      setFinalMatchStats(stats);

      setShowMatchCompleteModal(true);
    } else {
      startNewLeg();
    }
  };

  const startNewLeg = () => {
    const startingScore = getStartScore(matchConfig.gameMode);
    const nextStartingPlayer = legStartingPlayer === 'player1' ? 'player2' : 'player1';

    setPlayer1Score(startingScore);
    setPlayer2Score(startingScore);
    setCurrentPlayer(nextStartingPlayer);
    setLegStartingPlayer(nextStartingPlayer);
    setCurrentLeg({
      legNumber: currentLeg.legNumber + 1,
      winner: null,
      visits: [],
      player1DartsThrown: 0,
      player2DartsThrown: 0,
    });
  };

  const handleRematch = () => {
    const startingScore = getStartScore(matchConfig.gameMode);
    setShowMatchCompleteModal(false);
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
    });
    setAllLegs([]);
    setMatchWinner(null);
    setPlayer1MatchTotalScored(0);
    setPlayer2MatchTotalScored(0);
    setPlayer1MatchDartsThrown(0);
    setPlayer2MatchDartsThrown(0);
    setPlayer1TotalDartsAtDouble(0);
    setPlayer1CheckoutsMade(0);
    setPlayer2TotalDartsAtDouble(0);
    setPlayer2CheckoutsMade(0);
  };

  const handleReturnToApp = () => {
    router.push('/app/play');
  };

  const handleUndo = () => {
    if (currentLeg.visits.length > 0) {
      const lastVisit = currentLeg.visits[currentLeg.visits.length - 1];
      const newVisits = currentLeg.visits.slice(0, -1);

      setCurrentLeg(prev => ({
        ...prev,
        visits: newVisits,
        [lastVisit.player === 'player1' ? 'player1DartsThrown' : 'player2DartsThrown']:
          Math.max(0, prev[lastVisit.player === 'player1' ? 'player1DartsThrown' : 'player2DartsThrown'] - 3),
      }));

      if (lastVisit.player === 'player1') {
        const previousScore = lastVisit.isBust ? lastVisit.remainingScore : lastVisit.remainingScore + lastVisit.score;
        setPlayer1Score(previousScore);
      } else {
        const previousScore = lastVisit.isBust ? lastVisit.remainingScore : lastVisit.remainingScore + lastVisit.score;
        setPlayer2Score(previousScore);
      }

      setCurrentPlayer(lastVisit.player);
    } else if (allLegs.length > 0 && currentLeg.legNumber > 1) {
      const lastCompletedLeg = allLegs[allLegs.length - 1];

      if (lastCompletedLeg.winner === 'player1') {
        setPlayer1LegsWon(prev => Math.max(0, prev - 1));
      } else {
        setPlayer2LegsWon(prev => Math.max(0, prev - 1));
      }

      const newAllLegs = allLegs.slice(0, -1);
      setAllLegs(newAllLegs);

      const lastVisitOfLeg = lastCompletedLeg.visits[lastCompletedLeg.visits.length - 1];
      const visitsWithoutLastCheckout = lastCompletedLeg.visits.slice(0, -1);

      setCurrentLeg({
        legNumber: lastCompletedLeg.legNumber,
        winner: null,
        visits: visitsWithoutLastCheckout,
        player1DartsThrown: Math.max(0, lastCompletedLeg.player1DartsThrown - (lastVisitOfLeg.player === 'player1' ? 3 : 0)),
        player2DartsThrown: Math.max(0, lastCompletedLeg.player2DartsThrown - (lastVisitOfLeg.player === 'player2' ? 3 : 0)),
      });

      if (lastVisitOfLeg.player === 'player1') {
        const previousScore = lastVisitOfLeg.remainingScore + lastVisitOfLeg.score;
        setPlayer1Score(previousScore);

        let player2Score = getStartScore(matchConfig.gameMode);
        for (const visit of visitsWithoutLastCheckout.filter(v => v.player === 'player2' && !v.isBust)) {
          player2Score -= visit.score;
        }
        setPlayer2Score(player2Score);
      } else {
        const previousScore = lastVisitOfLeg.remainingScore + lastVisitOfLeg.score;
        setPlayer2Score(previousScore);

        let player1Score = getStartScore(matchConfig.gameMode);
        for (const visit of visitsWithoutLastCheckout.filter(v => v.player === 'player1' && !v.isBust)) {
          player1Score -= visit.score;
        }
        setPlayer1Score(player1Score);
      }

      setCurrentPlayer(lastVisitOfLeg.player);

      const prevStartingPlayer = currentLeg.legNumber % 2 === 0 ? 'player2' : 'player1';
      setLegStartingPlayer(prevStartingPlayer);
    }
  };

  const handleEndMatch = () => {
    router.push('/app/play');
  };

  const getPlayerVisits = (player: 'player1' | 'player2') => {
    return currentLeg.visits.filter(v => v.player === player);
  };

  const getPlayerStats = (player: 'player1' | 'player2') => {
    const visits = getPlayerVisits(player);
    return calculateStats(visits.map(v => ({
      score: v.score,
      is_bust: v.isBust,
      is_checkout: v.isCheckout,
    })));
  };

  const handleDartClick = (type: 'singles' | 'doubles' | 'triples' | 'bulls', number: number) => {
    if (currentVisit.length >= 3) return;

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
    if (!matchConfig) return;

    const enteredDarts = [...currentVisit];
    const currentRemaining = currentPlayer === 'player1' ? player1Score : player2Score;
    const visitTotal = enteredDarts.reduce((sum, dart) => sum + dart.value, 0);
    const newRemaining = currentRemaining - visitTotal;
    const doubleOut = matchConfig.doubleOut;

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
      if (currentPlayer === 'player1') {
        setPlayer1TotalDartsAtDouble(prev => prev + dartsAtDoubleCount);
        if (checkoutMade) {
          setPlayer1CheckoutsMade(prev => prev + 1);
        }
      } else {
        setPlayer2TotalDartsAtDouble(prev => prev + dartsAtDoubleCount);
        if (checkoutMade) {
          setPlayer2CheckoutsMade(prev => prev + 1);
        }
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
    if (editingVisitIndex === null || !matchConfig) {
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
    if (editingVisitIndex === null || !matchConfig) return;

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

  if (!matchConfig) {
    return <div className="text-white">Loading...</div>;
  }

  if (matchConfig.gameMode === 'Around the Clock') {
    return (
      <AroundTheClockMatch
        players={[
          { id: 'player1', name: 'You' },
          { id: 'player2', name: matchConfig.opponentName || 'Opponent' },
        ]}
        context="LOCAL"
      />
    );
  }

  const currentScore = currentPlayer === 'player1' ? player1Score : player2Score;
  const checkoutOptions = getCheckoutOptions(currentScore, matchConfig?.doubleOut ?? true);
  const isOnCheckout = currentScore > 1 && currentScore <= 170;
  const player1Stats = getPlayerStats('player1');
  const player2Stats = getPlayerStats('player2');

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

  const getMatchAverage = (totalScored: number, dartsThrown: number) => {
    if (dartsThrown === 0) return 0;
    return Math.round((totalScored / dartsThrown) * 3 * 100) / 100;
  };

  const player1MatchAverage = getMatchAverage(player1MatchTotalScored, player1MatchDartsThrown);
  const player2MatchAverage = getMatchAverage(player2MatchTotalScored, player2MatchDartsThrown);

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
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">LOCAL</Badge>
            </div>

            <div className="flex items-center space-x-4 text-sm text-gray-400">
              <span>{matchConfig.gameMode}</span>
              <span>•</span>
              <span>{matchConfig.matchFormat.replace('best-of-', 'Best of ')}</span>
              {matchConfig.doubleOut && (
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
              End Match
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="max-w-[1800px] mx-auto px-4 py-2 h-full flex flex-col">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2 flex-shrink-0">
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
                    <p className="text-xs text-gray-400">{matchConfig.opponentName}</p>
                  </div>
                </div>
                <div className="text-center py-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <p className="text-emerald-400 text-sm font-semibold">
                    {currentPlayer === 'player1' ? 'Your' : `${matchConfig.opponentName}'s`} Turn
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
                <p className="text-2xl sm:text-4xl font-bold text-white">{player1Score}</p>
                <p className="text-xs text-gray-400 mt-1">Remaining</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
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
                      {matchConfig.opponentName?.substring(0, 2).toUpperCase() || 'P2'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold text-white">{matchConfig.opponentName}</p>
                    <p className="text-xs text-gray-400">Legs: {player2LegsWon}</p>
                  </div>
                </div>
              </div>
              <div className="text-center py-2">
                <p className="text-2xl sm:text-4xl font-bold text-white">{player2Score}</p>
                <p className="text-xs text-gray-400 mt-1">Remaining</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
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

          <div className="grid gap-3 flex-1 min-h-0" style={{ gridTemplateColumns: '0.75fr 1.25fr' }}>
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
                            {visit.player === 'player1' ? 'YOU' : matchConfig.opponentName.toUpperCase()}
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
              <div className="mb-2 flex-shrink-0">
                <h3 className="text-base font-semibold text-white mb-2">Scoring</h3>

                <div className="mb-2">
                  <label className="text-xs text-gray-400 mb-1 block">Type score</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      max="180"
                      value={scoreInput}
                      onChange={(e) => setScoreInput(e.target.value)}
                      placeholder="0-180"
                      className="flex-1 h-9 bg-white/5 border-white/10 text-white text-sm"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && scoreInput) {
                          const score = parseInt(scoreInput);
                          if (score >= 0 && score <= 180) {
                            handleInputScoreSubmit(score);
                            setScoreInput('');
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
                            setScoreInput('');
                          }
                        }
                      }}
                      disabled={!scoreInput || parseInt(scoreInput) < 0 || parseInt(scoreInput) > 180}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white h-9 px-4 text-xs"
                    >
                      Enter
                    </Button>
                  </div>
                </div>
              </div>

              {isOnCheckout && (
                checkoutOptions && checkoutOptions.length > 0 && checkoutOptions[0]?.description ? (
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
                      >
                        Singles
                      </Button>
                      <Button
                        size="sm"
                        variant={dartboardGroup === 'doubles' ? 'default' : 'outline'}
                        onClick={() => setDartboardGroup('doubles')}
                        className={`${dartboardGroup === 'doubles' ? 'bg-emerald-500' : 'border-white/10 text-white'} h-7 text-xs`}
                      >
                        Doubles
                      </Button>
                      <Button
                        size="sm"
                        variant={dartboardGroup === 'triples' ? 'default' : 'outline'}
                        onClick={() => setDartboardGroup('triples')}
                        className={`${dartboardGroup === 'triples' ? 'bg-emerald-500' : 'border-white/10 text-white'} h-7 text-xs`}
                      >
                        Triples
                      </Button>
                      <Button
                        size="sm"
                        variant={dartboardGroup === 'bulls' ? 'default' : 'outline'}
                        onClick={() => setDartboardGroup('bulls')}
                        className={`${dartboardGroup === 'bulls' ? 'bg-emerald-500' : 'border-white/10 text-white'} h-7 text-xs`}
                      >
                        Bulls
                      </Button>
                    </div>

                    {dartboardGroup !== 'bulls' ? (
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 mb-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((num) => (
                          <Button
                            key={num}
                            onClick={() => handleDartClick(dartboardGroup, num)}
                            disabled={currentVisit.length >= 3}
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-1">
                        <Button
                          onClick={() => handleDartClick('bulls', 25)}
                          disabled={currentVisit.length >= 3}
                          className="h-12 text-sm font-semibold bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/30 text-white disabled:opacity-50"
                        >
                          Single Bull
                          <span className="block text-xs text-gray-400">(25)</span>
                        </Button>
                        <Button
                          onClick={() => handleDartClick('bulls', 50)}
                          disabled={currentVisit.length >= 3}
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
                    >
                      Miss (0)
                    </Button>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-shrink-0">
                      <Button
                        onClick={handleClearVisit}
                        disabled={currentVisit.length === 0}
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-white hover:bg-white/5"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Clear
                      </Button>
                      <Button
                        onClick={handleSubmitVisit}
                        disabled={currentVisit.length === 0}
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
                      disabled={!scoreInput || parseInt(scoreInput) < 0 || parseInt(scoreInput) > 180}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 sm:px-8"
                    >
                      Submit
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-shrink-0">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((num) => (
                      <Button
                        key={num}
                        onClick={() => setScoreInput(prev => prev + num.toString())}
                        className="h-12 text-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white"
                      >
                        {num}
                      </Button>
                    ))}
                    <Button
                      onClick={() => setScoreInput('')}
                      className="h-12 text-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center mt-0.5 pt-0.5 border-t border-white/10 flex-shrink-0">
                <Button
                  onClick={handleUndo}
                  disabled={currentLeg.visits.length === 0}
                  variant="outline"
                  size="sm"
                  className="border-white/10 text-white hover:bg-white/5"
                >
                  <Undo2 className="w-4 h-4 mr-1" />
                  Undo Last
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <AlertDialog open={showEndMatchDialog} onOpenChange={setShowEndMatchDialog}>
        <AlertDialogContent className="bg-slate-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">End Match?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400">
              Are you sure you want to end this match? All progress will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEndMatch}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              End Match
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showMatchCompleteModal} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="text-center space-y-4 py-4 sm:py-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full mb-4">
                <Trophy className="w-10 h-10 text-white" />
              </div>
              <DialogTitle className="text-2xl sm:text-4xl font-bold text-white">
                Good game!
              </DialogTitle>
              <p className="text-2xl text-gray-300">
                {matchWinner === 'player1' ? 'You' : matchConfig?.opponentName} win{matchWinner === 'player1' ? '' : 's'} {matchWinner === 'player1' ? player1LegsWon : player2LegsWon}-{matchWinner === 'player1' ? player2LegsWon : player1LegsWon}
              </p>
            </div>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-6 my-6">
            <Card className="bg-slate-800/50 border-white/10 p-4 sm:p-6">
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
                  <span className="text-white font-bold">{finalMatchStats?.player1.threeDartAverage || 0}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-300 text-sm">Highest Score</span>
                  </div>
                  <span className="text-white font-bold">{finalMatchStats?.player1.highestScore || 0}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Target className="w-4 h-4 text-amber-400" />
                    <span className="text-gray-300 text-sm">Checkout %</span>
                  </div>
                  <span className="text-white font-bold">{finalMatchStats?.player1.checkoutPercent || 0}%</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Trophy className="w-4 h-4 text-emerald-400" />
                    <span className="text-gray-300 text-sm">Highest Checkout</span>
                  </div>
                  <span className="text-white font-bold">{finalMatchStats?.player1.highestCheckout || 0}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Doubles</span>
                  <span className="text-white font-bold">{finalMatchStats?.player1.checkoutsMade || 0} / {finalMatchStats?.player1.checkoutDartsAttempted || 0}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center pt-2">
                  <div className="p-2 bg-white/5 rounded-lg">
                    <p className="text-xl font-bold text-white">{finalMatchStats?.player1.count100Plus || 0}</p>
                    <p className="text-xs text-gray-400">100+</p>
                  </div>
                  <div className="p-2 bg-white/5 rounded-lg">
                    <p className="text-xl font-bold text-white">{finalMatchStats?.player1.count140Plus || 0}</p>
                    <p className="text-xs text-gray-400">140+</p>
                  </div>
                  <div className="p-2 bg-white/5 rounded-lg">
                    <p className="text-xl font-bold text-white">{finalMatchStats?.player1.count180 || 0}</p>
                    <p className="text-xs text-gray-400">180s</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Legs Won</span>
                  <span className="text-white font-bold">{finalMatchStats?.player1.legsWon || 0}</span>
                </div>
              </div>
            </Card>

            <Card className="bg-slate-800/50 border-white/10 p-4 sm:p-6">
              <div className="flex items-center space-x-3 mb-6">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="bg-gradient-to-br from-blue-400 to-cyan-500 text-white">
                    {matchConfig?.opponentName?.substring(0, 2).toUpperCase() || 'P2'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">{matchConfig?.opponentName}</h3>
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
                  <span className="text-white font-bold">{finalMatchStats?.player2.threeDartAverage || 0}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-300 text-sm">Highest Score</span>
                  </div>
                  <span className="text-white font-bold">{finalMatchStats?.player2.highestScore || 0}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Target className="w-4 h-4 text-amber-400" />
                    <span className="text-gray-300 text-sm">Checkout %</span>
                  </div>
                  <span className="text-white font-bold">{finalMatchStats?.player2.checkoutPercent || 0}%</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Trophy className="w-4 h-4 text-emerald-400" />
                    <span className="text-gray-300 text-sm">Highest Checkout</span>
                  </div>
                  <span className="text-white font-bold">{finalMatchStats?.player2.highestCheckout || 0}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Doubles</span>
                  <span className="text-white font-bold">{finalMatchStats?.player2.checkoutsMade || 0} / {finalMatchStats?.player2.checkoutDartsAttempted || 0}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center pt-2">
                  <div className="p-2 bg-white/5 rounded-lg">
                    <p className="text-xl font-bold text-white">{finalMatchStats?.player2.count100Plus || 0}</p>
                    <p className="text-xs text-gray-400">100+</p>
                  </div>
                  <div className="p-2 bg-white/5 rounded-lg">
                    <p className="text-xl font-bold text-white">{finalMatchStats?.player2.count140Plus || 0}</p>
                    <p className="text-xs text-gray-400">140+</p>
                  </div>
                  <div className="p-2 bg-white/5 rounded-lg">
                    <p className="text-xl font-bold text-white">{finalMatchStats?.player2.count180 || 0}</p>
                    <p className="text-xs text-gray-400">180s</p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Legs Won</span>
                  <span className="text-white font-bold">{finalMatchStats?.player2.legsWon || 0}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex justify-center space-x-4 pt-4">
            <Button
              size="lg"
              onClick={handleRematch}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white px-4 sm:px-8"
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              Rematch
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleReturnToApp}
              className="border-white/10 text-white hover:bg-white/5 px-4 sm:px-8"
            >
              <Home className="w-5 h-5 mr-2" />
              Return
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
    </div>
    </MatchErrorBoundary>
  );
}
