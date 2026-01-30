'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Target,
  Trophy,
  TrendingUp,
  Clock,
  Zap,
  Award,
  BarChart3,
  Home,
  RotateCcw,
} from 'lucide-react';
import { calculateStats } from '@/lib/match-logic';

interface Visit {
  player: 'player1' | 'player2';
  score: number;
  remainingScore: number;
  isBust: boolean;
  isCheckout: boolean;
  timestamp: number;
}

interface LegData {
  legNumber: number;
  winner: 'player1' | 'player2' | null;
  visits: Visit[];
  player1DartsThrown: number;
  player2DartsThrown: number;
}

interface MatchData {
  matchId: string;
  matchConfig: any;
  winner: 'player1' | 'player2';
  player1LegsWon: number;
  player2LegsWon: number;
  legs: LegData[];
  startTime: number;
  endTime: number;
}

export default function MatchSummaryPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params?.matchId as string;

  const [matchData, setMatchData] = useState<MatchData | null>(null);

  useEffect(() => {
    const data = localStorage.getItem(`match-result-${matchId}`);
    if (data) {
      setMatchData(JSON.parse(data));
    } else {
      router.push('/app/play');
    }
  }, [matchId, router]);

  if (!matchData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <p className="text-white">Loading...</p>
      </div>
    );
  }

  const getAllVisitsForPlayer = (player: 'player1' | 'player2') => {
    return matchData.legs.flatMap(leg =>
      leg.visits.filter(v => v.player === player)
    );
  };

  const player1Visits = getAllVisitsForPlayer('player1');
  const player2Visits = getAllVisitsForPlayer('player2');

  const player1Stats = calculateStats(player1Visits.map(v => ({
    score: v.score,
    is_bust: v.isBust,
    is_checkout: v.isCheckout,
  })));

  const player2Stats = calculateStats(player2Visits.map(v => ({
    score: v.score,
    is_bust: v.isBust,
    is_checkout: v.isCheckout,
  })));

  const matchDuration = Math.floor((matchData.endTime - matchData.startTime) / 1000 / 60);
  const winnerName = matchData.winner === 'player1' ? 'You' : matchData.matchConfig.opponentName;

  const handlePlayAgain = () => {
    router.push('/app/play');
    setTimeout(() => {
      const privateMatchBtn = document.querySelector('[data-private-match]');
      if (privateMatchBtn) {
        (privateMatchBtn as HTMLButtonElement).click();
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <Card className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500/30 p-8 mb-8">
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full mb-4">
              <Trophy className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">
              {winnerName} Won!
            </h1>
            <div className="flex items-center justify-center space-x-4 text-2xl font-bold">
              <span className="text-white">{matchData.player1LegsWon}</span>
              <span className="text-gray-400">-</span>
              <span className="text-white">{matchData.player2LegsWon}</span>
            </div>
            <div className="flex items-center justify-center space-x-4 text-sm text-gray-400">
              <span>{matchData.matchConfig.gameMode}</span>
              <span>•</span>
              <span>{matchData.matchConfig.matchFormat.replace('best-of-', 'Best of ')}</span>
              <span>•</span>
              <div className="flex items-center">
                <Clock className="w-3 h-3 mr-1" />
                <span>{matchDuration} min</span>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card className="bg-slate-900/50 border-white/10 p-6">
            <div className="flex items-center space-x-3 mb-6">
              <Avatar className="w-12 h-12">
                <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-teal-500 text-white">
                  {matchData.matchConfig.opponentName?.substring(0, 2).toUpperCase() || 'P1'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-xl font-bold text-white">You</h3>
                <p className="text-sm text-gray-400">
                  {matchData.winner === 'player1' ? 'Winner' : 'Runner-up'}
                </p>
              </div>
              {matchData.winner === 'player1' && (
                <Trophy className="w-6 h-6 text-amber-400 ml-auto" />
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-gray-300">3-Dart Average</span>
                </div>
                <span className="text-white font-bold text-lg">{player1Stats.threeDartAverage}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-blue-400" />
                  <span className="text-gray-300">Highest Score</span>
                </div>
                <span className="text-white font-bold text-lg">{player1Stats.highestScore}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Target className="w-4 h-4 text-amber-400" />
                  <span className="text-gray-300">Checkout %</span>
                </div>
                <span className="text-white font-bold text-lg">{player1Stats.checkoutPercentage}%</span>
              </div>

              <Separator className="bg-white/10" />

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{player1Stats.count100Plus}</p>
                  <p className="text-xs text-gray-400">100+</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{player1Stats.count140Plus}</p>
                  <p className="text-xs text-gray-400">140+</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{player1Stats.count180}</p>
                  <p className="text-xs text-gray-400">180s</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-gray-300">Total Darts</span>
                <span className="text-white font-bold">{player1Stats.totalDartsThrown}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-gray-300">Legs Won</span>
                <span className="text-white font-bold">{matchData.player1LegsWon}</span>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-900/50 border-white/10 p-6">
            <div className="flex items-center space-x-3 mb-6">
              <Avatar className="w-12 h-12">
                <AvatarFallback className="bg-gradient-to-br from-blue-400 to-cyan-500 text-white">
                  {matchData.matchConfig.opponentName?.substring(0, 2).toUpperCase() || 'P2'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-xl font-bold text-white">{matchData.matchConfig.opponentName}</h3>
                <p className="text-sm text-gray-400">
                  {matchData.winner === 'player2' ? 'Winner' : 'Runner-up'}
                </p>
              </div>
              {matchData.winner === 'player2' && (
                <Trophy className="w-6 h-6 text-amber-400 ml-auto" />
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-gray-300">3-Dart Average</span>
                </div>
                <span className="text-white font-bold text-lg">{player2Stats.threeDartAverage}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-blue-400" />
                  <span className="text-gray-300">Highest Score</span>
                </div>
                <span className="text-white font-bold text-lg">{player2Stats.highestScore}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Target className="w-4 h-4 text-amber-400" />
                  <span className="text-gray-300">Checkout %</span>
                </div>
                <span className="text-white font-bold text-lg">{player2Stats.checkoutPercentage}%</span>
              </div>

              <Separator className="bg-white/10" />

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{player2Stats.count100Plus}</p>
                  <p className="text-xs text-gray-400">100+</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{player2Stats.count140Plus}</p>
                  <p className="text-xs text-gray-400">140+</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-2xl font-bold text-white">{player2Stats.count180}</p>
                  <p className="text-xs text-gray-400">180s</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-gray-300">Total Darts</span>
                <span className="text-white font-bold">{player2Stats.totalDartsThrown}</span>
              </div>

              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-gray-300">Legs Won</span>
                <span className="text-white font-bold">{matchData.player2LegsWon}</span>
              </div>
            </div>
          </Card>
        </div>

        <Card className="bg-slate-900/50 border-white/10 p-6 mb-8">
          <div className="flex items-center space-x-2 mb-4">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h3 className="text-xl font-bold text-white">Match Timeline</h3>
          </div>

          <div className="space-y-3">
            {matchData.legs.map((leg) => (
              <div
                key={leg.legNumber}
                className="flex items-center justify-between p-4 bg-white/5 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    Leg {leg.legNumber}
                  </Badge>
                  <span className="text-white font-semibold">
                    {leg.winner === 'player1' ? 'You' : matchData.matchConfig.opponentName} won
                  </span>
                </div>
                <div className="flex items-center space-x-4 text-sm text-gray-400">
                  <div className="flex items-center space-x-1">
                    <Target className="w-3 h-3" />
                    <span>{leg.player1DartsThrown} darts</span>
                  </div>
                  <span>vs</span>
                  <div className="flex items-center space-x-1">
                    <Target className="w-3 h-3" />
                    <span>{leg.player2DartsThrown} darts</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="flex justify-center space-x-4">
          <Link href="/app/play">
            <Button
              size="lg"
              variant="outline"
              className="border-white/10 text-white hover:bg-white/5"
            >
              <Home className="w-5 h-5 mr-2" />
              Back to App
            </Button>
          </Link>
          <Button
            size="lg"
            onClick={handlePlayAgain}
            className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white"
          >
            <RotateCcw className="w-5 h-5 mr-2" />
            Play Again
          </Button>
        </div>
      </div>
    </div>
  );
}
