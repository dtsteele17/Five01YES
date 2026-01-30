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
import { Target, Trophy, TrendingUp, Clock, RotateCcw, Chrome as Home, Undo2 } from 'lucide-react';
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
  const matchDuration = Math.floor((Date.now() - matchStartTime) / 1000);
  const minutes = Math.floor(matchDuration / 60);
  const seconds = matchDuration % 60;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="border-b border-white/10 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Target className="w-8 h-8 text-emerald-400" />
                <span className="text-2xl font-bold text-white">
                  FIVE<span className="text-emerald-400">01</span>
                </span>
              </div>
              <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                LOCAL
              </Badge>
            </div>

            <div className="flex items-center space-x-4 text-sm text-gray-400">
              <span>Around the Clock</span>
              <span>•</span>
              <span>
                {settings.startNumber} to {settings.endNumber}
                {settings.includeBull && ' + Bull'}
              </span>
              <span>•</span>
              <div className="flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                {minutes}:{seconds.toString().padStart(2, '0')}
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => setShowEndMatchDialog(true)}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10"
            >
              End Match
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ATCScoring
          player1={player1}
          player2={player2}
          currentPlayer={currentPlayer}
          settings={settings}
          onVisitComplete={handleVisitComplete}
          onUndo={handleUndo}
        />

        <div className="mt-6 flex justify-center">
          <Button
            onClick={handleUndo}
            disabled={player1.visits.length === 0 && player2.visits.length === 0}
            variant="outline"
            className="border-white/10 text-white hover:bg-white/5"
          >
            <Undo2 className="w-4 h-4 mr-2" />
            Undo Last Visit
          </Button>
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
            <div className="text-center space-y-4 py-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full mb-4">
                <Trophy className="w-10 h-10 text-white" />
              </div>
              <DialogTitle className="text-4xl font-bold text-white">Good game!</DialogTitle>
              <p className="text-2xl text-gray-300">
                {matchWinner === 1 ? 'You' : matchConfig?.opponentName} win
                {matchWinner === 1 ? '' : 's'}!
              </p>
            </div>
          </DialogHeader>

          <div className="grid md:grid-cols-2 gap-6 my-6">
            <Card className="bg-slate-800/50 border-white/10 p-6">
              <div className="flex items-center space-x-3 mb-6">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white">
                    YO
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">You</h3>
                  <p className="text-sm text-gray-400">
                    {matchWinner === 1 ? 'Winner' : 'Runner-up'}
                  </p>
                </div>
                {matchWinner === 1 && <Trophy className="w-6 h-6 text-amber-400" />}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Total Visits</span>
                  <span className="text-white font-bold">{player1Stats.totalVisits}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Total Darts</span>
                  <span className="text-white font-bold">{player1Stats.totalDarts}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Target className="w-4 h-4 text-emerald-400" />
                    <span className="text-gray-300 text-sm">Hit Rate</span>
                  </div>
                  <span className="text-white font-bold">{player1Stats.hitRate.toFixed(1)}%</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-300 text-sm">Avg Progress/Visit</span>
                  </div>
                  <span className="text-white font-bold">
                    {player1Stats.avgProgressPerVisit.toFixed(1)}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Best Visit</span>
                  <span className="text-white font-bold">
                    +{player1Stats.maxProgressInVisit} targets
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span className="text-gray-300 text-sm">Completion Time</span>
                  </div>
                  <span className="text-white font-bold">
                    {matchWinner === 1
                      ? `${minutes}:${seconds.toString().padStart(2, '0')}`
                      : '-'}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="bg-slate-800/50 border-white/10 p-6">
              <div className="flex items-center space-x-3 mb-6">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="bg-gradient-to-br from-blue-400 to-cyan-500 text-white">
                    {matchConfig?.opponentName?.substring(0, 2).toUpperCase() || 'OP'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white">
                    {matchConfig?.opponentName}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {matchWinner === 2 ? 'Winner' : 'Runner-up'}
                  </p>
                </div>
                {matchWinner === 2 && <Trophy className="w-6 h-6 text-amber-400" />}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Total Visits</span>
                  <span className="text-white font-bold">{player2Stats.totalVisits}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Total Darts</span>
                  <span className="text-white font-bold">{player2Stats.totalDarts}</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Target className="w-4 h-4 text-emerald-400" />
                    <span className="text-gray-300 text-sm">Hit Rate</span>
                  </div>
                  <span className="text-white font-bold">{player2Stats.hitRate.toFixed(1)}%</span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <TrendingUp className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-300 text-sm">Avg Progress/Visit</span>
                  </div>
                  <span className="text-white font-bold">
                    {player2Stats.avgProgressPerVisit.toFixed(1)}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-300 text-sm">Best Visit</span>
                  <span className="text-white font-bold">
                    +{player2Stats.maxProgressInVisit} targets
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span className="text-gray-300 text-sm">Completion Time</span>
                  </div>
                  <span className="text-white font-bold">
                    {matchWinner === 2
                      ? `${minutes}:${seconds.toString().padStart(2, '0')}`
                      : '-'}
                  </span>
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
              Rematch
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleReturnToApp}
              className="border-white/10 text-white hover:bg-white/5 px-8"
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
