'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeft, Trophy, Skull, Heart, Target, RotateCcw, Zap, Undo2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { useTraining } from '@/lib/context/TrainingContext';
import { calculateXP, XPResult } from '@/lib/training/xpSystem';
import { XPRewardDisplay } from '@/components/training/XPRewardDisplay';
import { createClient } from '@/lib/supabase/client';

interface DartHit {
  segment: 'S' | 'D' | 'T' | 'SB' | 'DB' | 'MISS';
  number: number;
  value: number;
  label: string;
  isDouble: boolean;
  isTreble: boolean;
}

interface Player {
  id: 'user' | 'bot';
  name: string;
  number: number | null;
  lives: number;
  isKiller: boolean;
  eliminated: boolean;
}

type GamePhase = 'select-number' | 'playing' | 'round-over' | 'match-over';

interface RoundResult {
  round: number;
  winner: 'user' | 'bot';
  userKills: number;
  botKills: number;
  turns: number;
}

export default function KillerTrainingPage() {
  const router = useRouter();
  const { config } = useTraining();

  // Get total rounds from config, default to 3
  const totalRounds = config?.killerSettings?.rounds || 3;

  // Game State
  const [gamePhase, setGamePhase] = useState<GamePhase>('select-number');
  const [players, setPlayers] = useState<Player[]>([
    { id: 'user', name: 'You', number: null, lives: 3, isKiller: false, eliminated: false },
    { id: 'bot', name: 'DartBot', number: null, lives: 3, isKiller: false, eliminated: false },
  ]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [currentDarts, setCurrentDarts] = useState<DartHit[]>([]);
  const [message, setMessage] = useState('Throw a dart to select your number!');
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);
  const [botThrowing, setBotThrowing] = useState(false);
  const [userKills, setUserKills] = useState(0);
  const [botKills, setBotKills] = useState(0);
  const [turnCount, setTurnCount] = useState(0);

  // Round tracking
  const [currentRound, setCurrentRound] = useState(1);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [roundScore, setRoundScore] = useState({ user: 0, bot: 0 });

  // Input mode
  const [scoringTab, setScoringTab] = useState<'singles' | 'doubles' | 'trebles' | 'bulls'>('singles');

  // Use ref to track elimination status for immediate access
  const eliminationRef = useRef<{ userEliminated: boolean; botEliminated: boolean }>({ 
    userEliminated: false, 
    botEliminated: false 
  });

  // XP and Supabase
  const [xpResult, setXpResult] = useState<XPResult | null>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  const getAvailableNumbers = useCallback(() => {
    const takenNumbers = players
      .filter(p => p.number !== null)
      .map(p => p.number);
    return Array.from({ length: 20 }, (_, i) => i + 1).filter(n => !takenNumbers.includes(n));
  }, [players]);

  const getCurrentPlayer = () => players[currentPlayerIndex];

  const getOpponent = () => players[currentPlayerIndex === 0 ? 1 : 0];

  const switchTurn = () => {
    setCurrentDarts([]);
    setCurrentPlayerIndex(prev => (prev === 0 ? 1 : 0));
    setTurnCount(prev => prev + 1);
  };

  const assignNumber = (playerId: 'user' | 'bot', number: number) => {
    setPlayers(prev => prev.map(p => 
      p.id === playerId ? { ...p, number } : p
    ));
  };

  const updatePlayer = (playerId: 'user' | 'bot', updates: Partial<Player>) => {
    setPlayers(prev => {
      const newPlayers = prev.map(p => 
        p.id === playerId ? { ...p, ...updates } : p
      );
      // Update ref immediately for access in current execution
      const player = newPlayers.find(p => p.id === playerId);
      if (player) {
        if (playerId === 'user') {
          eliminationRef.current.userEliminated = player.eliminated;
        } else {
          eliminationRef.current.botEliminated = player.eliminated;
        }
      }
      return newPlayers;
    });
  };

  const handleDartClick = (hit: DartHit) => {
    if (gamePhase !== 'playing' && gamePhase !== 'select-number') return;
    if (getCurrentPlayer().id !== 'user') return;

    processDart('user', hit);
  };

  const processDart = (playerId: 'user' | 'bot', hit: DartHit) => {
    const currentPlayer = players.find(p => p.id === playerId)!;
    const opponent = players.find(p => p.id !== playerId)!;

    // Phase 1: Selecting numbers
    if (gamePhase === 'select-number') {
      if (hit.number === 25) {
        setMessage('Bull is not allowed! Hit a number 1-20.');
        toast.error('Cannot select bull! Pick a number 1-20.');
        return;
      }
      if (hit.number < 1 || hit.number > 20) {
        setMessage('Hit a number between 1-20!');
        return;
      }
      if (players.some(p => p.number === hit.number)) {
        setMessage(`Number ${hit.number} is taken! Try again.`);
        toast.error(`Number ${hit.number} is already taken!`);
        return;
      }

      assignNumber(playerId, hit.number);
      setMessage(`${currentPlayer.name} selected ${hit.number}!`);
      
      // Check if both players have numbers
      if (playerId === 'user') {
        // Bot selects a random available number
        const available = getAvailableNumbers().filter(n => n !== hit.number);
        const botNumber = available[Math.floor(Math.random() * available.length)];
        assignNumber('bot', botNumber);
        
        setTimeout(() => {
          setGamePhase('playing');
          setMessage('Game started! Hit your double to become a KILLER!');
          toast.success('Game started! Hit your double to become a KILLER!');
        }, 1000);
      }
      return;
    }

    // Phase 2: Playing the game
    if (gamePhase === 'playing') {
      // Check if hit own number
      if (hit.number === currentPlayer.number) {
        if (hit.isDouble && !currentPlayer.isKiller) {
          // Become killer!
          updatePlayer(playerId, { isKiller: true });
          setMessage(`${currentPlayer.name} became a KILLER! 💀`);
          toast.success(`${currentPlayer.name} is now a KILLER!`, { icon: '💀' });
          switchTurn();
        } else if (currentPlayer.isKiller) {
          // Hit own number as killer - lose a life
          const newLives = currentPlayer.lives - 1;
          if (newLives <= 0) {
            // Self elimination
            updatePlayer(playerId, { lives: 0, isKiller: false, eliminated: true });
            setMessage(`${currentPlayer.name} eliminated themselves!`);
            toast.error(`${currentPlayer.name} eliminated themselves!`);
            // Opponent wins the round
            const roundWinner = opponent;
            handleRoundEnd(roundWinner);
          } else {
            updatePlayer(playerId, { lives: newLives, isKiller: false });
            setMessage(`${currentPlayer.name} hit their own number! Lost killer status and a life!`);
            toast.error(`Oops! You hit your own number. Lost a life and killer status!`);
            switchTurn();
          }
        } else {
          setMessage(`${currentPlayer.name} hit their number but not a double.`);
          switchTurn();
        }
        return;
      }

      // Check if hit opponent's number
      if (hit.number === opponent.number) {
        if (currentPlayer.isKiller) {
          // Take lives from opponent
          let livesToTake = 0;
          if (hit.isTreble) livesToTake = 3;
          else if (hit.isDouble) livesToTake = 2;
          else livesToTake = 1;

          const newLives = opponent.lives - livesToTake;
          
          if (playerId === 'user') {
            setUserKills(prev => prev + livesToTake);
          } else {
            setBotKills(prev => prev + livesToTake);
          }

          if (newLives <= 0) {
            // Eliminate opponent
            updatePlayer(opponent.id, { lives: 0, eliminated: true });
            setMessage(`${currentPlayer.name} eliminated ${opponent.name}! 💀`);
            toast.success(`${currentPlayer.name} eliminated ${opponent.name}!`, { icon: '💀' });
            // Current player wins the round
            handleRoundEnd(currentPlayer);
          } else {
            updatePlayer(opponent.id, { lives: newLives });
            setMessage(`${currentPlayer.name} took ${livesToTake} life${livesToTake > 1 ? 's' : ''} from ${opponent.name}!`);
            toast(`${livesToTake} life${livesToTake > 1 ? 's' : ''} taken!`, { icon: '💀' });
            switchTurn();
          }
        } else {
          setMessage(`${currentPlayer.name} hit ${opponent.name}'s number but isn't a killer yet!`);
          switchTurn();
        }
        return;
      }

      // Hit any other number
      setMessage(`${currentPlayer.name} missed...`);
      switchTurn();
    }
  };

  const handleRoundEnd = (roundWinner: Player) => {
    setWinner(roundWinner);
    
    // Record round result
    const newResult: RoundResult = {
      round: currentRound,
      winner: roundWinner.id,
      userKills,
      botKills,
      turns: turnCount,
    };
    
    const updatedResults = [...roundResults, newResult];
    setRoundResults(updatedResults);
    
    // Update round score
    const newRoundScore = {
      user: roundScore.user + (roundWinner.id === 'user' ? 1 : 0),
      bot: roundScore.bot + (roundWinner.id === 'bot' ? 1 : 0),
    };
    setRoundScore(newRoundScore);
    
    // Check if match is over
    const roundsNeededToWin = Math.ceil(totalRounds / 2);
    const isMatchOver = newRoundScore.user >= roundsNeededToWin || 
                        newRoundScore.bot >= roundsNeededToWin || 
                        currentRound >= totalRounds ||
                        (currentRound >= totalRounds - 1 && newRoundScore.user !== newRoundScore.bot && 
                         (newRoundScore.user >= roundsNeededToWin || newRoundScore.bot >= roundsNeededToWin));
    
    if (isMatchOver) {
      setGamePhase('match-over');
      
      // Calculate XP based on rounds won (performance metric = user rounds won)
      const won = newRoundScore.user > newRoundScore.bot;
      const xp = calculateXP('killer', newRoundScore.user, { completed: true, won });
      setXpResult(xp);
      
      // Save stats to Supabase
      saveTrainingStats(newRoundScore, updatedResults, xp);
      
      setShowStatsModal(true); // Only show modal at match end
    } else {
      // Auto-start next round after a short delay
      setGamePhase('round-over');
      setTimeout(() => {
        startNextRound();
      }, 2000); // 2 second delay to show the winner message
    }
  };

  const startNextRound = () => {
    setCurrentRound(prev => prev + 1);
    setGamePhase('select-number');
    setPlayers([
      { id: 'user', name: 'You', number: null, lives: 3, isKiller: false, eliminated: false },
      { id: 'bot', name: 'DartBot', number: null, lives: 3, isKiller: false, eliminated: false },
    ]);
    eliminationRef.current = { userEliminated: false, botEliminated: false };
    setCurrentPlayerIndex(0);
    setCurrentDarts([]);
    setMessage('Throw a dart to select your number!');
    setWinner(null);
    setUserKills(0);
    setBotKills(0);
    setTurnCount(0);
    setShowStatsModal(false);
  };

  // Save training stats to Supabase
  const saveTrainingStats = async (
    finalScore: { user: number; bot: number },
    results: RoundResult[],
    xp: XPResult
  ) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const totalKills = results.reduce((sum, r) => sum + r.userKills, 0);
      const totalTurns = results.reduce((sum, r) => sum + r.turns, 0);
      const won = finalScore.user > finalScore.bot;

      await supabase.from('training_stats').insert({
        user_id: user.id,
        mode: 'killer',
        rounds_played: results.length,
        rounds_won: finalScore.user,
        rounds_lost: finalScore.bot,
        kills: totalKills,
        total_turns: totalTurns,
        won,
        xp_earned: xp.totalXP,
        performance_rating: xp.performanceRating,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error saving training stats:', error);
    } finally {
      setSaving(false);
    }
  };

  // Bot AI
  useEffect(() => {
    if (gamePhase !== 'playing' && gamePhase !== 'select-number') return;
    
    const currentPlayer = getCurrentPlayer();
    if (currentPlayer.id !== 'bot') return;

    setBotThrowing(true);
    const delay = Math.random() * 1000 + 500;

    const botTurn = setTimeout(() => {
      const opponent = getOpponent();
      let hit: DartHit;

      if (gamePhase === 'select-number') {
        // Random number 1-20
        const available = getAvailableNumbers();
        const number = available[Math.floor(Math.random() * available.length)];
        hit = { segment: 'S', number, value: number, label: `S${number}`, isDouble: false, isTreble: false };
      } else {
        // Playing phase - bot AI
        const botAccuracy = 0.4; // 40% accuracy
        
        if (!currentPlayer.isKiller) {
          // Try to become killer - aim for own double
          if (Math.random() < botAccuracy * 0.5) {
            // Hit own double!
            hit = { 
              segment: 'D', 
              number: currentPlayer.number!, 
              value: currentPlayer.number! * 2, 
              label: `D${currentPlayer.number}`, 
              isDouble: true, 
              isTreble: false 
            };
          } else if (Math.random() < 0.3) {
            // Miss - random number
            const number = Math.floor(Math.random() * 20) + 1;
            hit = { segment: 'S', number, value: number, label: `S${number}`, isDouble: false, isTreble: false };
          } else {
            // Hit single of own number
            hit = { 
              segment: 'S', 
              number: currentPlayer.number!, 
              value: currentPlayer.number!, 
              label: `S${currentPlayer.number}`, 
              isDouble: false, 
              isTreble: false 
            };
          }
        } else {
          // Is killer - aim for opponent
          if (Math.random() < botAccuracy) {
            // Hit opponent!
            const isDouble = Math.random() < 0.4;
            const isTreble = !isDouble && Math.random() < 0.3;
            if (isDouble) {
              hit = { 
                segment: 'D', 
                number: opponent.number!, 
                value: opponent.number! * 2, 
                label: `D${opponent.number}`, 
                isDouble: true, 
                isTreble: false 
              };
            } else if (isTreble) {
              hit = { 
                segment: 'T', 
                number: opponent.number!, 
                value: opponent.number! * 3, 
                label: `T${opponent.number}`, 
                isDouble: false, 
                isTreble: true 
              };
            } else {
              hit = { 
                segment: 'S', 
                number: opponent.number!, 
                value: opponent.number!, 
                label: `S${opponent.number}`, 
                isDouble: false, 
                isTreble: false 
              };
            }
          } else {
            // Miss
            const number = Math.floor(Math.random() * 20) + 1;
            hit = { segment: 'S', number, value: number, label: `S${number}`, isDouble: false, isTreble: false };
          }
        }
      }

      processDart('bot', hit);
      setBotThrowing(false);
    }, delay);

    return () => clearTimeout(botTurn);
  }, [currentPlayerIndex, gamePhase, players]);

  const startNewGame = () => {
    setGamePhase('select-number');
    setPlayers([
      { id: 'user', name: 'You', number: null, lives: 3, isKiller: false, eliminated: false },
      { id: 'bot', name: 'DartBot', number: null, lives: 3, isKiller: false, eliminated: false },
    ]);
    eliminationRef.current = { userEliminated: false, botEliminated: false };
    setCurrentPlayerIndex(0);
    setCurrentDarts([]);
    setMessage('Throw a dart to select your number!');
    setWinner(null);
    setUserKills(0);
    setBotKills(0);
    setTurnCount(0);
    setShowStatsModal(false);
    setCurrentRound(1);
    setRoundResults([]);
    setRoundScore({ user: 0, bot: 0 });
    setXpResult(null);
  };

  const handleReturn = () => {
    router.push('/app/play');
  };

  const handleMiss = () => {
    processDart('user', { segment: 'MISS', number: 0, value: 0, label: 'Miss', isDouble: false, isTreble: false });
  };

  const user = players.find(p => p.id === 'user')!;
  const bot = players.find(p => p.id === 'bot')!;
  const isUserTurn = getCurrentPlayer().id === 'user';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleReturn}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white flex items-center justify-center gap-2">
              <Skull className="w-6 h-6 text-red-500" />
              Killer
            </h1>
            <div className="flex items-center justify-center gap-4 mt-1">
              <span className="text-sm font-bold text-amber-400">
                Round {currentRound} of {totalRounds}
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-sm text-emerald-400">You: {roundScore.user}</span>
              <span className="text-sm text-blue-400">Bot: {roundScore.bot}</span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {gamePhase === 'select-number' ? 'Select your number (1-20)' : 'Hit your double to become a KILLER!'}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={startNewGame}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            New Game
          </Button>
        </div>

        {/* Player Cards */}
        <div className="grid grid-cols-2 gap-4">
          {/* User Card */}
          <Card className={`p-4 border-2 ${user.eliminated ? 'bg-slate-800/50 border-slate-700 opacity-50' : user.isKiller ? 'bg-red-500/10 border-red-500/50' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <span className="text-emerald-400 font-bold">You</span>
                </div>
                {user.isKiller && (
                  <Badge className="bg-red-500 text-white">
                    <Skull className="w-3 h-3 mr-1" />
                    KILLER
                  </Badge>
                )}
                {user.eliminated && (
                  <Badge variant="destructive">ELIMINATED</Badge>
                )}
              </div>
              {user.number && (
                <div className="text-3xl font-bold text-white">
                  #{user.number}
                </div>
              )}
            </div>
            
            {/* Lives */}
            <div className="flex items-center gap-1 justify-center">
              {[...Array(3)].map((_, i) => (
                <Heart
                  key={i}
                  className={`w-8 h-8 ${i < user.lives ? 'text-red-500 fill-red-500' : 'text-slate-600'}`}
                />
              ))}
            </div>
            
            {user.number === null && (
              <div className="mt-3 text-center text-sm text-amber-400">
                Select your number!
              </div>
            )}
          </Card>

          {/* Bot Card */}
          <Card className={`p-4 border-2 ${bot.eliminated ? 'bg-slate-800/50 border-slate-700 opacity-50' : bot.isKiller ? 'bg-purple-500/10 border-purple-500/50' : 'bg-blue-500/10 border-blue-500/30'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-blue-400 font-bold">Bot</span>
                </div>
                {bot.isKiller && (
                  <Badge className="bg-purple-500 text-white">
                    <Skull className="w-3 h-3 mr-1" />
                    KILLER
                  </Badge>
                )}
                {bot.eliminated && (
                  <Badge variant="destructive">ELIMINATED</Badge>
                )}
              </div>
              {bot.number && (
                <div className="text-3xl font-bold text-white">
                  #{bot.number}
                </div>
              )}
            </div>
            
            {/* Lives */}
            <div className="flex items-center gap-1 justify-center">
              {[...Array(3)].map((_, i) => (
                <Heart
                  key={i}
                  className={`w-8 h-8 ${i < bot.lives ? 'text-red-500 fill-red-500' : 'text-slate-600'}`}
                />
              ))}
            </div>
            
            {botThrowing && (
              <div className="mt-3 text-center text-sm text-purple-400 animate-pulse">
                Bot is throwing...
              </div>
            )}
          </Card>
        </div>

        {/* Game Message */}
        <Card className="bg-slate-800/50 border-slate-700 p-4">
          <div className="text-center">
            <p className={`text-lg font-semibold ${
              message.includes('KILLER') ? 'text-red-400' : 
              message.includes('eliminated') ? 'text-amber-400' :
              'text-white'
            }`}>
              {message}
            </p>
            {gamePhase === 'playing' && (
              <p className="text-sm text-slate-400 mt-1">
                {isUserTurn ? 'Your turn!' : 'Bot is thinking...'}
              </p>
            )}
          </div>
        </Card>

        {/* Scoring Panel */}
        {gamePhase !== 'round-over' && gamePhase !== 'match-over' && (
          <Card className="bg-slate-800/50 border-slate-700 p-6">
            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-slate-700/50 p-1 rounded-lg">
              {(['singles', 'doubles', 'trebles', 'bulls'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setScoringTab(tab)}
                  disabled={!isUserTurn || botThrowing}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    scoringTab === tab
                      ? tab === 'doubles'
                        ? 'bg-red-500 text-white'
                        : tab === 'trebles'
                        ? 'bg-amber-500 text-white'
                        : tab === 'bulls'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-blue-500 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-600'
                  } ${(!isUserTurn || botThrowing) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Number Grid */}
            {scoringTab !== 'bulls' ? (
              <div className="grid grid-cols-10 gap-2">
                {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => {
                  // Only block numbers during selection phase - in playing phase, all numbers are available
                  const isTaken = gamePhase === 'select-number' && players.some(p => p.number === num);
                  let value = num;
                  let label = `S${num}`;
                  let segment: 'S' | 'D' | 'T' = 'S';
                  
                  if (scoringTab === 'doubles') {
                    value = num * 2;
                    label = `D${num}`;
                    segment = 'D';
                  } else if (scoringTab === 'trebles') {
                    value = num * 3;
                    label = `T${num}`;
                    segment = 'T';
                  }

                  return (
                    <Button
                      key={label}
                      onClick={() => handleDartClick({ 
                        segment, 
                        number: num, 
                        value, 
                        label, 
                        isDouble: segment === 'D', 
                        isTreble: segment === 'T' 
                      })}
                      disabled={!isUserTurn || botThrowing || isTaken}
                      className={`h-14 font-semibold disabled:opacity-30 ${
                        scoringTab === 'doubles'
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : scoringTab === 'trebles'
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      {isTaken ? 'X' : label}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                <Button
                  onClick={() => handleDartClick({ 
                    segment: 'SB', 
                    number: 25, 
                    value: 25, 
                    label: 'SB', 
                    isDouble: false, 
                    isTreble: false 
                  })}
                  disabled={!isUserTurn || botThrowing}
                  className="h-20 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold disabled:opacity-30"
                >
                  Single Bull (25)
                </Button>
                <Button
                  onClick={() => handleDartClick({ 
                    segment: 'DB', 
                    number: 25, 
                    value: 50, 
                    label: 'DB', 
                    isDouble: true, 
                    isTreble: false 
                  })}
                  disabled={!isUserTurn || botThrowing}
                  className="h-20 bg-red-600 hover:bg-red-700 text-white text-lg font-semibold disabled:opacity-30"
                >
                  Double Bull (50)
                </Button>
              </div>
            )}

            {/* Miss Button */}
            <div className="mt-4 flex justify-center">
              <Button
                onClick={handleMiss}
                disabled={!isUserTurn || botThrowing}
                className="h-14 px-12 bg-slate-600 hover:bg-slate-700 text-white text-lg font-bold disabled:opacity-30"
              >
                MISS
              </Button>
            </div>
          </Card>
        )}

        {/* Instructions */}
        <Card className="bg-slate-800/30 border-slate-700/50 p-4">
          <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
            <Target className="w-4 h-4" />
            How to Play
          </h3>
          <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
            <li>Throw a dart to select your number (1-20, no bull)</li>
            <li>Hit your number&apos;s <strong className="text-red-400">DOUBLE</strong> to become a KILLER</li>
            <li>As a killer, hit opponent&apos;s number to steal their lives</li>
            <li>Double = 2 lives, Treble = 3 lives, Single = 1 life</li>
            <li>Don&apos;t hit your own number or you lose a life and killer status!</li>
            <li>Last player with lives wins the round!</li>
            <li>Win more rounds than the bot to win the match!</li>
          </ul>
        </Card>

        {/* Round Over / Match Over Modal */}
        <Dialog open={showStatsModal} onOpenChange={setShowStatsModal}>
          <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-center">
                {gamePhase === 'match-over' ? (
                  roundScore.user > roundScore.bot ? (
                    <span className="text-emerald-400 flex items-center justify-center gap-2">
                      <Trophy className="w-8 h-8" />
                      Match Champion!
                    </span>
                  ) : roundScore.bot > roundScore.user ? (
                    <span className="text-red-400 flex items-center justify-center gap-2">
                      <Skull className="w-8 h-8" />
                      Bot Wins Match!
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center justify-center gap-2">
                      <Trophy className="w-8 h-8" />
                      Match Tied!
                    </span>
                  )
                ) : winner?.id === 'user' ? (
                  <span className="text-emerald-400 flex items-center justify-center gap-2">
                    <Trophy className="w-8 h-8" />
                    Round Won!
                  </span>
                ) : (
                  <span className="text-red-400 flex items-center justify-center gap-2">
                    <Skull className="w-8 h-8" />
                    Round Lost!
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Match Score Display (when match is over) */}
              {gamePhase === 'match-over' && (
                <div className={`rounded-lg p-6 text-center border-2 ${
                  roundScore.user > roundScore.bot 
                    ? 'bg-emerald-500/20 border-emerald-500' 
                    : roundScore.bot > roundScore.user
                    ? 'bg-red-500/20 border-red-500'
                    : 'bg-amber-500/20 border-amber-500'
                }`}>
                  <div className="text-6xl mb-3">
                    {roundScore.user > roundScore.bot ? '🏆' : roundScore.bot > roundScore.user ? '🤖' : '🤝'}
                  </div>
                  <div className="text-5xl font-black text-white mb-2">
                    {roundScore.user} - {roundScore.bot}
                  </div>
                  <div className="text-sm text-slate-300">
                    Final Score ({totalRounds} rounds)
                  </div>
                  <div className="mt-3 text-lg font-semibold">
                    {roundScore.user > roundScore.bot ? (
                      <span className="text-emerald-400">You won the match!</span>
                    ) : roundScore.bot > roundScore.user ? (
                      <span className="text-red-400">Bot won the match!</span>
                    ) : (
                      <span className="text-amber-400">It&apos;s a tie!</span>
                    )}
                  </div>
                </div>
              )}

              {/* XP Reward Display */}
              {gamePhase === 'match-over' && xpResult && (
                <XPRewardDisplay xpResult={xpResult} />
              )}

              {/* Round Score Display (during match) */}
              {gamePhase === 'round-over' && (
                <div className={`rounded-lg p-6 text-center border-2 ${
                  winner?.id === 'user' 
                    ? 'bg-emerald-500/20 border-emerald-500' 
                    : 'bg-red-500/20 border-red-500'
                }`}>
                  <div className="text-6xl mb-2">{winner?.id === 'user' ? '🎯' : '💀'}</div>
                  <div className={`text-3xl font-bold ${winner?.id === 'user' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {winner?.name} wins Round {currentRound}!
                  </div>
                  <div className="text-sm text-slate-400 mt-2">
                    Match Score: You {roundScore.user} - {roundScore.bot} Bot
                  </div>
                </div>
              )}

              {/* Current Round Stats */}
              <div className="bg-slate-700/30 rounded-lg p-4">
                <div className="text-slate-400 text-xs uppercase tracking-wider mb-3 text-center">
                  Round {currentRound} Stats
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-slate-400 text-xs mb-1">Your Kills</div>
                    <div className="text-2xl font-bold text-emerald-400">{userKills}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400 text-xs mb-1">Bot Kills</div>
                    <div className="text-2xl font-bold text-red-400">{botKills}</div>
                  </div>
                </div>
                <div className="text-center mt-3 pt-3 border-t border-slate-600/30">
                  <div className="text-slate-400 text-xs">Total Turns</div>
                  <div className="text-xl font-bold text-white">{turnCount}</div>
                </div>
              </div>

              {/* Round History */}
              {roundResults.length > 0 && (
                <div className="bg-slate-700/30 rounded-lg p-4">
                  <div className="text-slate-400 text-xs uppercase tracking-wider mb-3 text-center">
                    Round History
                  </div>
                  <div className="space-y-2">
                    {roundResults.map((result) => (
                      <div 
                        key={result.round}
                        className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-slate-300">Round {result.round}</span>
                          <span className="text-xs text-slate-500">
                            {result.userKills}-{result.botKills} kills
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${
                            result.winner === 'user' ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            {result.winner === 'user' ? 'You Won' : 'Bot Won'}
                          </span>
                          {result.winner === 'user' ? (
                            <Trophy className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Skull className="w-4 h-4 text-red-400" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex gap-3">
              {gamePhase === 'round-over' ? (
                <>
                  <Button
                    onClick={handleReturn}
                    variant="outline"
                    className="flex-1 border-slate-600 text-white hover:bg-slate-700"
                  >
                    <Undo2 className="w-4 h-4 mr-2" />
                    Return
                  </Button>
                  <Button
                    onClick={startNextRound}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Next Round
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleReturn}
                    variant="outline"
                    className="flex-1 border-slate-600 text-white hover:bg-slate-700"
                  >
                    <Undo2 className="w-4 h-4 mr-2" />
                    Return
                  </Button>
                  <Button
                    onClick={startNewGame}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Rematch
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
