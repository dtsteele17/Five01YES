'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Target, Trophy, TrendingUp, Clock, RotateCcw, Home, Undo2, Activity, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ATCScoring } from '@/components/app/ATCScoring';
import {
  ATCSettings,
  ATCPlayerState,
  ATCDart,
  ATCVisit,
  processVisit,
  calculateATCStats,
  getInitialTarget,
} from '@/lib/atc-logic';

interface ATCMatchPageProps {
  matchConfig: any;
  matchId: string;
}

export function ATCMatchPage({ matchConfig, matchId }: ATCMatchPageProps) {
  const router = useRouter();
  const [matchStartTime] = useState(Date.now());
  const [currentPlayer, setCurrentPlayer] = useState<1 | 2>(1);
  const [showEndMatchDialog, setShowEndMatchDialog] = useState(false);
  const [showMatchCompleteModal, setShowMatchCompleteModal] = useState(false);
  const [matchWinner, setMatchWinner] = useState<1 | 2 | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Update timer every second
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - matchStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [matchStartTime]);

  const settings: ATCSettings = matchConfig.atcSettings || {
    startNumber: 1,
    endNumber: 20,
    includeBull: false,
    increaseBySegment: true,
    overshootHandling: 'cap',
  };

  const [player1, setPlayer1] = useState<ATCPlayerState>({
    name: 'You',
    currentTarget: getInitialTarget(settings),
    visits: [],
    completed: false,
  });

  const [player2, setPlayer2] = useState<ATCPlayerState>({
    name: matchConfig.opponentName || 'Opponent',
    currentTarget: getInitialTarget(settings),
    visits: [],
    completed: false,
  });

  const handleVisitComplete = (darts: ATCDart[]) => {
    const activePlayer = currentPlayer === 1 ? player1 : player2;
    const result = processVisit(darts, activePlayer.currentTarget, settings);

    const visit: ATCVisit = {
      darts,
      targetBefore: activePlayer.currentTarget,
      targetAfter: result.targetAfter,
      progressMade: result.totalProgress,
    };

    if (currentPlayer === 1) {
      const updatedPlayer = {
        ...player1,
        currentTarget: result.targetAfter,
        visits: [...player1.visits, visit],
        completed: result.completed,
      };
      setPlayer1(updatedPlayer);

      if (result.completed) {
        setMatchWinner(1);
        setShowMatchCompleteModal(true);
      } else {
        setCurrentPlayer(2);
      }
    } else {
      const updatedPlayer = {
        ...player2,
        currentTarget: result.targetAfter,
        visits: [...player2.visits, visit],
        completed: result.completed,
      };
      setPlayer2(updatedPlayer);

      if (result.completed) {
        setMatchWinner(2);
        setShowMatchCompleteModal(true);
      } else {
        setCurrentPlayer(1);
      }
    }
  };

  const handleUndo = () => {
    const activePlayer = currentPlayer === 1 ? player1 : player2;

    if (activePlayer.visits.length > 0) {
      const lastVisit = activePlayer.visits[activePlayer.visits.length - 1];
      const updatedVisits = activePlayer.visits.slice(0, -1);

      if (currentPlayer === 1) {
        setPlayer1({
          ...player1,
          currentTarget: lastVisit.targetBefore,
          visits: updatedVisits,
          completed: false,
        });
      } else {
        setPlayer2({
          ...player2,
          currentTarget: lastVisit.targetBefore,
          visits: updatedVisits,
          completed: false,
        });
      }
    } else {
      const otherPlayer = currentPlayer === 1 ? player2 : player1;
      if (otherPlayer.visits.length > 0) {
        const lastVisit = otherPlayer.visits[otherPlayer.visits.length - 1];
        const updatedVisits = otherPlayer.visits.slice(0, -1);

        if (currentPlayer === 1) {
          setPlayer2({
            ...player2,
            currentTarget: lastVisit.targetBefore,
            visits: updatedVisits,
            completed: false,
          });
          setCurrentPlayer(2);
        } else {
          setPlayer1({
            ...player1,
            currentTarget: lastVisit.targetBefore,
            visits: updatedVisits,
            completed: false,
          });
          setCurrentPlayer(1);
        }
      }
    }
  };

  const handleRematch = () => {
    setShowMatchCompleteModal(false);
    setPlayer1({
      name: 'You',
      currentTarget: getInitialTarget(settings),
      visits: [],
      completed: false,
    });
    setPlayer2({
      name: matchConfig.opponentName || 'Opponent',
      currentTarget: getInitialTarget(settings),
      visits: [],
      completed: false,
    });
    setCurrentPlayer(1);
    setMatchWinner(null);
  };

  const handleReturnToApp = () => {
    router.push('/app/play');
  };

  const handleEndMatch = () => {
    router.push('/app/play');
  };

  const player1Stats = calculateATCStats(player1);
  const player2Stats = calculateATCStats(player2);
  const minutes = Math.floor(elapsedTime / 60);
  const seconds = elapsedTime % 60;

  const getTargetDisplay = (target: number | 'bull') => {
    if (target === 'bull') return 'BULL';
    return target.toString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/10 bg-slate-900/50 backdrop-blur-xl sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <Target className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-black text-white">
                    Around the Clock
                  </h1>
                  <p className="text-xs text-gray-400">
                    {settings.startNumber}-{settings.endNumber}{settings.includeBull && ' + Bull'} • {settings.increaseBySegment ? 'Sequential' : 'Any Order'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Timer */}
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-mono text-white">
                  {minutes}:{seconds.toString().padStart(2, '0')}
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEndMatchDialog(true)}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                End
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Turn Indicator */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPlayer}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mb-4"
          >
            <div className={`
              flex items-center justify-center gap-3 py-2 px-6 rounded-full mx-auto w-fit
              ${currentPlayer === 1 
                ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30' 
                : 'bg-gradient-to-r from-blue-500/20 to-blue-600/10 border border-blue-500/30'
              }
            `}>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className={`w-2 h-2 rounded-full ${currentPlayer === 1 ? 'bg-emerald-400' : 'bg-blue-400'}`}
              />
              <span className={`font-bold ${currentPlayer === 1 ? 'text-emerald-400' : 'text-blue-400'}`}>
                {currentPlayer === 1 ? 'Your Turn' : `${player2.name}'s Turn`}
              </span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-400 text-sm">
                Target: <span className="text-white font-bold">{getTargetDisplay(currentPlayer === 1 ? player1.currentTarget : player2.currentTarget)}</span>
              </span>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Scoring Interface */}
        <ATCScoring
          player1={player1}
          player2={player2}
          currentPlayer={currentPlayer}
          settings={settings}
          onVisitComplete={handleVisitComplete}
          onUndo={handleUndo}
        />

        {/* Undo Button */}
        <motion.div 
          className="mt-4 flex justify-center"
          whileHover={{ scale: 1.02 }}
        >
          <Button
            onClick={handleUndo}
            disabled={player1.visits.length === 0 && player2.visits.length === 0}
            variant="outline"
            className="border-white/10 text-white hover:bg-white/5 px-6"
          >
            <Undo2 className="w-4 h-4 mr-2" />
            Undo Last Visit
          </Button>
        </motion.div>
      </main>

      {/* End Match Dialog */}
      <AlertDialog open={showEndMatchDialog} onOpenChange={setShowEndMatchDialog}>
        <AlertDialogContent className="bg-slate-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                <Target className="w-4 h-4 text-red-400" />
              </div>
              End Match?
            </AlertDialogTitle>
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

      {/* Match Complete Modal */}
      <Dialog open={showMatchCompleteModal} onOpenChange={() => {}}>
        <DialogContent className="bg-slate-900 border-white/10 text-white max-w-4xl max-h-[90vh] overflow-y-auto">
          {/* Winner Header */}
          <div className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-500/20" />
            <DialogHeader className="relative text-center py-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full mb-4 shadow-2xl shadow-amber-500/30"
              >
                <Trophy className="w-12 h-12 text-white" />
              </motion.div>
              <DialogTitle className="text-4xl font-black text-white mb-2">
                Good Game!
              </DialogTitle>
              <p className="text-2xl text-amber-400 font-bold">
                {matchWinner === 1 ? 'You Win!' : `${player2.name} Wins!`}
              </p>
              <p className="text-gray-400 mt-2">
                Completed in {minutes}:{seconds.toString().padStart(2, '0')}
              </p>
            </DialogHeader>
          </div>

          {/* Stats Comparison */}
          <div className="grid md:grid-cols-2 gap-4 my-6">
            {/* Player 1 Stats */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className={`p-6 border-2 ${matchWinner === 1 ? 'border-amber-500/50 bg-amber-500/5' : 'border-white/10 bg-slate-800/50'}`}>
                <div className="flex items-center gap-3 mb-6">
                  <Avatar className="w-14 h-14">
                    <AvatarFallback className={`text-lg font-bold ${matchWinner === 1 ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-emerald-400 to-teal-500'} text-white`}>
                      {player1.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white">{player1.name}</h3>
                    <p className={`text-sm ${matchWinner === 1 ? 'text-amber-400' : 'text-gray-400'}`}>
                      {matchWinner === 1 ? '🏆 Winner' : 'Runner-up'}
                    </p>
                  </div>
                  {matchWinner === 1 && (
                    <motion.div
                      animate={{ rotate: [0, -10, 10, 0] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <Trophy className="w-8 h-8 text-amber-400" />
                    </motion.div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <StatBox label="Visits" value={player1Stats.totalVisits} icon={Activity} color="text-blue-400" />
                  <StatBox label="Total Darts" value={player1Stats.totalDarts} icon={Target} color="text-emerald-400" />
                  <StatBox label="Hit Rate" value={`${player1Stats.hitRate.toFixed(1)}%`} icon={Target} color="text-amber-400" />
                  <StatBox label="Avg Progress" value={player1Stats.avgProgressPerVisit.toFixed(1)} icon={TrendingUp} color="text-purple-400" />
                  <StatBox label="Best Visit" value={`+${player1Stats.maxProgressInVisit}`} icon={Zap} color="text-pink-400" />
                  <StatBox 
                    label="Time" 
                    value={matchWinner === 1 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : '-'} 
                    icon={Clock} 
                    color="text-cyan-400" 
                  />
                </div>
              </Card>
            </motion.div>

            {/* Player 2 Stats */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className={`p-6 border-2 ${matchWinner === 2 ? 'border-amber-500/50 bg-amber-500/5' : 'border-white/10 bg-slate-800/50'}`}>
                <div className="flex items-center gap-3 mb-6">
                  <Avatar className="w-14 h-14">
                    <AvatarFallback className={`text-lg font-bold ${matchWinner === 2 ? 'bg-gradient-to-br from-amber-400 to-orange-500' : 'bg-gradient-to-br from-blue-400 to-cyan-500'} text-white`}>
                      {player2.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-white">{player2.name}</h3>
                    <p className={`text-sm ${matchWinner === 2 ? 'text-amber-400' : 'text-gray-400'}`}>
                      {matchWinner === 2 ? '🏆 Winner' : 'Runner-up'}
                    </p>
                  </div>
                  {matchWinner === 2 && (
                    <motion.div
                      animate={{ rotate: [0, -10, 10, 0] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <Trophy className="w-8 h-8 text-amber-400" />
                    </motion.div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <StatBox label="Visits" value={player2Stats.totalVisits} icon={Activity} color="text-blue-400" />
                  <StatBox label="Total Darts" value={player2Stats.totalDarts} icon={Target} color="text-emerald-400" />
                  <StatBox label="Hit Rate" value={`${player2Stats.hitRate.toFixed(1)}%`} icon={Target} color="text-amber-400" />
                  <StatBox label="Avg Progress" value={player2Stats.avgProgressPerVisit.toFixed(1)} icon={TrendingUp} color="text-purple-400" />
                  <StatBox label="Best Visit" value={`+${player2Stats.maxProgressInVisit}`} icon={Zap} color="text-pink-400" />
                  <StatBox 
                    label="Time" 
                    value={matchWinner === 2 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : '-'} 
                    icon={Clock} 
                    color="text-cyan-400" 
                  />
                </div>
              </Card>
            </motion.div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-4 pt-4 pb-2">
            <Button
              size="lg"
              onClick={handleRematch}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white px-8 py-6 text-lg font-bold shadow-lg shadow-emerald-500/20"
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              Rematch
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleReturnToApp}
              className="border-white/10 text-white hover:bg-white/5 px-8 py-6 text-lg"
            >
              <Home className="w-5 h-5 mr-2" />
              Return
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper component for stat boxes
function StatBox({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="p-3 bg-white/5 rounded-xl flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-bold text-white">{value}</p>
      </div>
    </div>
  );
}
