'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  RotateCcw,
  Trophy,
  Target,
  User,
  X,
  Check,
  ChevronRight,
  History,
  TrendingUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  createMatch,
  submitScore,
  recordMiss,
  recordBust,
  getCheckoutSuggestion,
  calculateMatchStats,
  startRematch,
  type LocalMatchState,
  type Visit,
} from '@/lib/local-match/engine';

// Loading component
function MatchLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400">Loading match...</p>
      </div>
    </div>
  );
}

// Main match component
function LocalMatchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [matchState, setMatchState] = useState<LocalMatchState | null>(null);
  const [scoreInput, setScoreInput] = useState('');
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [lastLegWinner, setLastLegWinner] = useState<string | null>(null);
  const [showLegNotification, setShowLegNotification] = useState(false);

  // Initialize match from URL params
  useEffect(() => {
    const p1 = searchParams.get('p1') || 'Player 1';
    const p2 = searchParams.get('p2') || 'Player 2';
    const mode = parseInt(searchParams.get('mode') || '501') as 301 | 501;
    const format = parseInt(searchParams.get('format') || '3') as 1 | 3 | 5 | 7;
    const doubleOut = searchParams.get('doubleOut') !== 'false';

    const newMatch = createMatch({
      player1Name: p1,
      player2Name: p2,
      gameMode: mode,
      matchFormat: format,
      doubleOut,
    });

    setMatchState(newMatch);
  }, [searchParams]);

  // Handle score submission
  const handleSubmitScore = () => {
    if (!matchState || !scoreInput) return;

    const score = parseInt(scoreInput);
    if (isNaN(score) || score < 0 || score > 180) {
      return; // Invalid score
    }

    const currentPlayer = matchState.currentTurn === 'player1' ? matchState.player1 : matchState.player2;
    
    // Check if score would exceed remaining
    if (score > currentPlayer.remaining) {
      alert('Score exceeds remaining! Use Bust button if you busted.');
      return;
    }

    const result = submitScore(matchState, score);
    setMatchState(result.state);
    setScoreInput('');

    if (result.legWon && !result.matchWon) {
      const winnerName = result.state.currentTurn === 'player1' 
        ? result.state.player1.name 
        : result.state.player2.name;
      setLastLegWinner(winnerName);
      setShowLegNotification(true);
      setTimeout(() => setShowLegNotification(false), 3000);
    }

    if (result.matchWon) {
      setShowWinnerModal(true);
    }
  };

  // Handle bust
  const handleBust = () => {
    if (!matchState) return;
    const newState = recordBust(matchState);
    setMatchState(newState);
    setScoreInput('');
  };

  // Handle miss
  const handleMiss = () => {
    if (!matchState) return;
    const newState = recordMiss(matchState);
    setMatchState(newState);
    setScoreInput('');
  };

  // Handle rematch
  const handleRematch = () => {
    if (!matchState) return;
    const rematch = startRematch(matchState);
    setMatchState(rematch);
    setShowWinnerModal(false);
    setLastLegWinner(null);
  };

  // Handle new game
  const handleNewGame = () => {
    router.push('/app/play/local');
  };

  if (!matchState) {
    return <MatchLoading />;
  }

  const currentPlayer = matchState.currentTurn === 'player1' ? matchState.player1 : matchState.player2;
  const otherPlayer = matchState.currentTurn === 'player1' ? matchState.player2 : matchState.player1;
  const checkoutSuggestion = getCheckoutSuggestion(currentPlayer.remaining);
  const stats = calculateMatchStats(matchState);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/app/play">
            <Button variant="outline" size="icon" className="border-slate-700 hover:bg-slate-800">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Local Match</h1>
            <p className="text-slate-400 text-sm">
              Leg {matchState.currentLeg} • First to {matchState.legsToWin} legs
              {matchState.doubleOut && ' • Double Out'}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={handleNewGame}
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          New Game
        </Button>
      </div>

      {/* Leg Notification */}
      <AnimatePresence>
        {showLegNotification && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-emerald-500 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3">
              <Trophy className="w-5 h-5" />
              <span className="font-bold">{lastLegWinner} wins the leg!</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player Cards */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Player 1 Card */}
        <PlayerCard
          name={matchState.player1.name}
          remaining={matchState.player1.remaining}
          legs={matchState.player1.legs}
          legsToWin={matchState.legsToWin}
          isCurrentTurn={matchState.currentTurn === 'player1'}
          visits={matchState.player1.visits}
          isPlayer1
        />

        {/* Player 2 Card */}
        <PlayerCard
          name={matchState.player2.name}
          remaining={matchState.player2.remaining}
          legs={matchState.player2.legs}
          legsToWin={matchState.legsToWin}
          isCurrentTurn={matchState.currentTurn === 'player2'}
          visits={matchState.player2.visits}
          isPlayer1={false}
        />
      </div>

      {/* Score Input Section */}
      <Card className="bg-slate-800/60 border-slate-700/50 p-6 mb-6">
        <div className="text-center mb-6">
          <p className="text-slate-400 mb-2">Current Turn</p>
          <h2 className="text-3xl font-bold text-white">{currentPlayer.name}</h2>
          <Badge 
            className={`mt-2 ${matchState.currentTurn === 'player1' 
              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
              : 'bg-rose-500/20 text-rose-400 border-rose-500/30'}`}
          >
            {matchState.currentTurn === 'player1' ? 'Player 1' : 'Player 2'}
          </Badge>
        </div>

        {/* Checkout Suggestion */}
        {checkoutSuggestion && checkoutSuggestion.label !== 'No checkout' && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">
                Checkout Suggestion ({currentPlayer.remaining} remaining)
              </span>
            </div>
            <p className="text-2xl font-bold text-white">{checkoutSuggestion.route}</p>
          </div>
        )}

        {/* Score Input */}
        <div className="flex gap-3 mb-4">
          <Input
            type="number"
            min="0"
            max="180"
            value={scoreInput}
            onChange={(e) => setScoreInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmitScore()}
            placeholder="Enter score (0-180)"
            className="flex-1 bg-slate-900/50 border-slate-700 text-white text-center text-2xl font-bold h-16 placeholder:text-slate-600"
            autoFocus
          />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-3 gap-3">
          <Button
            onClick={handleSubmitScore}
            disabled={!scoreInput}
            className="h-14 text-lg font-bold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50"
          >
            <Check className="w-5 h-5 mr-2" />
            Submit
          </Button>
          <Button
            onClick={handleBust}
            variant="outline"
            className="h-14 text-lg font-bold border-red-500/50 text-red-400 hover:bg-red-500/20"
          >
            <X className="w-5 h-5 mr-2" />
            Bust
          </Button>
          <Button
            onClick={handleMiss}
            variant="outline"
            className="h-14 text-lg font-bold border-slate-600 text-slate-400 hover:bg-slate-700"
          >
            Miss
          </Button>
        </div>

        {/* Quick Score Buttons */}
        <div className="mt-4 grid grid-cols-6 gap-2">
          {[60, 57, 54, 51, 48, 45, 42, 40, 38, 36, 34, 32, 26, 24, 20, 18, 16, 12].map((score) => (
            <Button
              key={score}
              variant="outline"
              size="sm"
              onClick={() => setScoreInput(score.toString())}
              className="border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              {score}
            </Button>
          ))}
        </div>
      </Card>

      {/* Visit History */}
      <div className="grid md:grid-cols-2 gap-6">
        <VisitHistory 
          title={matchState.player1.name}
          visits={matchState.player1.visits}
          isActive={matchState.currentTurn === 'player1'}
        />
        <VisitHistory 
          title={matchState.player2.name}
          visits={matchState.player2.visits}
          isActive={matchState.currentTurn === 'player2'}
        />
      </div>

      {/* Winner Modal */}
      <AnimatePresence>
        {showWinnerModal && (
          <WinnerModal
            winner={matchState.winner || ''}
            stats={stats}
            onRematch={handleRematch}
            onNewGame={handleNewGame}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Player Card Component
interface PlayerCardProps {
  name: string;
  remaining: number;
  legs: number;
  legsToWin: number;
  isCurrentTurn: boolean;
  visits: Visit[];
  isPlayer1: boolean;
}

function PlayerCard({ name, remaining, legs, legsToWin, isCurrentTurn, visits, isPlayer1 }: PlayerCardProps) {
  const validVisits = visits.filter(v => !v.isBust && v.score > 0);
  const totalScore = validVisits.reduce((sum, v) => sum + v.score, 0);
  const totalDarts = visits.reduce((sum, v) => sum + v.darts.length, 0);
  const average = totalDarts > 0 ? (totalScore / totalDarts) * 3 : 0;

  return (
    <Card className={`relative overflow-hidden p-6 transition-all duration-300 ${
      isCurrentTurn 
        ? 'bg-slate-800 border-emerald-500/50 shadow-lg shadow-emerald-500/10' 
        : 'bg-slate-800/40 border-slate-700/50'
    }`}>
      {/* Active Indicator */}
      {isCurrentTurn && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
      )}

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            isPlayer1 
              ? 'bg-gradient-to-br from-blue-500 to-blue-600' 
              : 'bg-gradient-to-br from-rose-500 to-rose-600'
          }`}>
            <User className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{name}</h3>
            {isCurrentTurn && (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                Throwing
              </Badge>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1">
            {Array.from({ length: legsToWin }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  i < legs ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              />
            ))}
          </div>
          <p className="text-slate-400 text-sm mt-1">{legs} / {legsToWin} legs</p>
        </div>
      </div>

      {/* Remaining Score */}
      <div className="text-center py-4">
        <p className="text-slate-400 text-sm mb-1">Remaining</p>
        <p className={`text-6xl font-black ${
          remaining <= 50 ? 'text-emerald-400' : 'text-white'
        }`}>
          {remaining}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-700/50">
        <div className="text-center">
          <p className="text-xs text-slate-500">Avg</p>
          <p className="text-lg font-bold text-white">{average.toFixed(1)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500">Darts</p>
          <p className="text-lg font-bold text-white">{totalDarts}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-slate-500">Visits</p>
          <p className="text-lg font-bold text-white">{visits.length}</p>
        </div>
      </div>
    </Card>
  );
}

// Visit History Component
interface VisitHistoryProps {
  title: string;
  visits: Visit[];
  isActive: boolean;
}

function VisitHistory({ title, visits, isActive }: VisitHistoryProps) {
  return (
    <Card className={`bg-slate-800/40 border-slate-700/50 p-4 ${isActive ? 'ring-1 ring-emerald-500/30' : ''}`}>
      <div className="flex items-center gap-2 mb-4">
        <History className="w-4 h-4 text-slate-400" />
        <h4 className="font-semibold text-white">{title}&apos;s Visits</h4>
        {isActive && <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">Current</Badge>}
      </div>
      
      {visits.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-4">No visits yet</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {visits.map((visit, index) => (
            <div
              key={index}
              className={`flex items-center justify-between p-2 rounded-lg ${
                visit.isBust 
                  ? 'bg-red-500/10 border border-red-500/20' 
                  : visit.score === 0
                    ? 'bg-slate-800/50'
                    : 'bg-slate-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-6">#{index + 1}</span>
                {visit.isBust ? (
                  <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">
                    BUST
                  </Badge>
                ) : visit.score === 0 ? (
                  <span className="text-slate-400 text-sm">Miss</span>
                ) : (
                  <span className="text-white font-medium">{visit.score}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  {visit.remainingAfter === 0 ? 'WON!' : visit.remainingAfter}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Winner Modal Component
interface WinnerModalProps {
  winner: string;
  stats: ReturnType<typeof calculateMatchStats>;
  onRematch: () => void;
  onNewGame: () => void;
}

function WinnerModal({ winner, stats, onRematch, onNewGame }: WinnerModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-md"
      >
        <Card className="bg-slate-900 border-slate-700 p-8 text-center overflow-hidden relative">
          {/* Background Decoration */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-blue-500/10" />
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-yellow-500 to-emerald-500" />
          
          <div className="relative z-10">
            {/* Trophy Icon */}
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-yellow-500/30">
              <Trophy className="w-12 h-12 text-white" />
            </div>

            <h2 className="text-3xl font-black text-white mb-2">Winner!</h2>
            <p className="text-2xl font-bold text-emerald-400 mb-6">{winner}</p>

            {/* Match Stats */}
            <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-300">Match Statistics</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-slate-800/50 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">{stats.player1.name}</p>
                  <p className="text-xl font-bold text-white">{stats.player1.average.toFixed(1)}</p>
                  <p className="text-xs text-slate-400">avg</p>
                </div>
                <div className="text-center p-3 bg-slate-800/50 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">{stats.player2.name}</p>
                  <p className="text-xl font-bold text-white">{stats.player2.average.toFixed(1)}</p>
                  <p className="text-xs text-slate-400">avg</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={onRematch}
                className="w-full py-6 text-lg font-bold bg-emerald-500 hover:bg-emerald-600"
              >
                <RotateCcw className="w-5 h-5 mr-2" />
                Rematch
              </Button>
              <Button
                onClick={onNewGame}
                variant="outline"
                className="w-full py-6 text-lg font-bold border-slate-600 text-slate-300 hover:bg-slate-800"
              >
                New Game
              </Button>
            </div>
          </div>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// Main export with Suspense
export default function LocalMatchPage() {
  return (
    <Suspense fallback={<MatchLoading />}>
      <LocalMatchContent />
    </Suspense>
  );
}
