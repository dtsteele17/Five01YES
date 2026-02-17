'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trophy, RotateCcw, Loader2, Check, History, User, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { CoinTossModal } from './CoinTossModal';

interface MatchHistory {
  totalMatches: number;
  player1Wins: number;
  player2Wins: number;
  lastWinner: string | null;
  recentMatches: Array<{
    id: string;
    winner: string;
    played_at: string;
    game_mode: string;
  }>;
}

interface RematchPopupProps {
  isOpen: boolean;
  onClose: () => void;
  player1: { id: string; name: string };
  player2: { id: string; name: string };
  currentUserId: string;
  readyCount: number;
  iAmReady: boolean;
  opponentReady: boolean;
  onRequestRematch: () => void;
  onCancelRematch: () => void;
  isLoading: boolean;
}

export function RematchPopup({
  isOpen,
  onClose,
  player1,
  player2,
  currentUserId,
  readyCount,
  iAmReady,
  opponentReady,
  onRequestRematch,
  onCancelRematch,
  isLoading,
}: RematchPopupProps) {
  const [matchHistory, setMatchHistory] = useState<MatchHistory | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showCoinToss, setShowCoinToss] = useState(false);
  const supabase = createClient();

  const isPlayer1 = currentUserId === player1.id;
  const opponentName = isPlayer1 ? player2.name : player1.name;

  // Fetch match history between these two players
  useEffect(() => {
    if (!isOpen || !player1.id || !player2.id) return;

    const fetchHistory = async () => {
      setLoadingHistory(true);
      try {
        // Get all matches between these two players from match_history
        const { data: matches, error } = await supabase
          .from('match_history')
          .select('*')
          .or(`and(user_id.eq.${player1.id},opponent_id.eq.${player2.id}),and(user_id.eq.${player2.id},opponent_id.eq.${player1.id})`)
          .order('played_at', { ascending: false })
          .limit(10);

        if (error) throw error;

        if (matches) {
          const player1Wins = matches.filter(m => m.user_id === player1.id && m.result === 'win').length;
          const player2Wins = matches.filter(m => m.user_id === player2.id && m.result === 'win').length;
          const lastMatch = matches[0];

          setMatchHistory({
            totalMatches: Math.ceil(matches.length / 2), // Each match has 2 records (one per player)
            player1Wins,
            player2Wins,
            lastWinner: lastMatch?.result === 'win' ? lastMatch.user_id : null,
            recentMatches: matches.slice(0, 5).map(m => ({
              id: m.id,
              winner: m.result === 'win' ? m.user_id : 'draw',
              played_at: m.played_at,
              game_mode: m.game_mode?.toString() || '501',
            })),
          });
        }
      } catch (err) {
        console.error('Error fetching match history:', err);
      } finally {
        setLoadingHistory(false);
      }
    };

    fetchHistory();
  }, [isOpen, player1.id, player2.id, supabase]);

  // Show coin toss when both ready
  useEffect(() => {
    if (readyCount === 2 && !showCoinToss) {
      setShowCoinToss(true);
    }
  }, [readyCount, showCoinToss]);

  const getRematchButtonText = () => {
    if (isLoading) return 'Processing...';
    if (readyCount === 2) return 'Starting...';
    if (iAmReady) return `Rematch ${readyCount}/2 - Waiting...`;
    if (opponentReady) return `Join Rematch (${readyCount}/2)`;
    return `Rematch (0/2)`;
  };

  const getRematchButtonIcon = () => {
    if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" />;
    if (readyCount === 2) return <Check className="w-4 h-4" />;
    if (iAmReady) return <Loader2 className="w-4 h-4 animate-spin" />;
    return <RotateCcw className="w-4 h-4" />;
  };

  return (
    <>
      <Dialog open={isOpen && !showCoinToss} onOpenChange={onClose}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white w-full max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <RotateCcw className="w-5 h-5 text-emerald-400" />
              Rematch
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Players */}
            <div className="flex items-center justify-center gap-4">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold mx-auto mb-1">
                  {player1.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-slate-300">{player1.name}</span>
              </div>

              <div className="text-slate-500 font-bold">VS</div>

              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-bold mx-auto mb-1">
                  {player2.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-slate-300">{player2.name}</span>
              </div>
            </div>

            {/* Match History */}
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-300">Match History</h3>
              </div>

              {loadingHistory ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                </div>
              ) : matchHistory ? (
                <div className="space-y-3">
                  {/* Stats */}
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Total Matches:</span>
                    <span className="text-white font-medium">{matchHistory.totalMatches}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-blue-400">{player1.name} Wins:</span>
                    <span className="text-white font-medium">{matchHistory.player1Wins}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span className="text-orange-400">{player2.name} Wins:</span>
                    <span className="text-white font-medium">{matchHistory.player2Wins}</span>
                  </div>

                  {matchHistory.lastWinner && (
                    <div className="pt-2 border-t border-slate-700">
                      <span className="text-sm text-slate-400">Last Winner: </span>
                      <span className="text-sm font-medium text-emerald-400">
                        {matchHistory.lastWinner === player1.id ? player1.name : player2.name}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 text-sm text-center py-2">
                  No previous matches found
                </p>
              )}
            </div>

            {/* Ready Status */}
            <div className="flex justify-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                player1.id === currentUserId 
                  ? (iAmReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400')
                  : (opponentReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400')
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  player1.id === currentUserId 
                    ? (iAmReady ? 'bg-emerald-400' : 'bg-slate-600')
                    : (opponentReady ? 'bg-emerald-400' : 'bg-slate-600')
                }`} />
                <span className="text-sm">{player1.name}</span>
              </div>

              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                player2.id === currentUserId 
                  ? (iAmReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400')
                  : (opponentReady ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400')
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  player2.id === currentUserId 
                    ? (iAmReady ? 'bg-emerald-400' : 'bg-slate-600')
                    : (opponentReady ? 'bg-emerald-400' : 'bg-slate-600')
                }`} />
                <span className="text-sm">{player2.name}</span>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-emerald-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${(readyCount / 2) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <span className="text-sm font-medium text-slate-300">{readyCount}/2</span>
            </div>

            {/* Buttons */}
            <div className="flex gap-3">
              {iAmReady ? (
                <Button
                  variant="outline"
                  onClick={onCancelRematch}
                  disabled={isLoading || readyCount === 2}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={isLoading}
                  className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800"
                >
                  Close
                </Button>
              )}

              <Button
                onClick={onRequestRematch}
                disabled={isLoading || iAmReady || readyCount === 2}
                className={`flex-1 ${
                  iAmReady 
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : opponentReady
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {getRematchButtonIcon()}
                <span className="ml-2">{getRematchButtonText()}</span>
              </Button>
            </div>

            {opponentReady && !iAmReady && (
              <p className="text-center text-sm text-emerald-400">
                {opponentName} wants a rematch!
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Coin Toss Modal - shown when both ready */}
      <CoinTossModal
        isOpen={showCoinToss}
        player1Name={player1.name}
        player2Name={player2.name}
        player1Id={player1.id}
        player2Id={player2.id}
        currentUserId={currentUserId}
        onComplete={(winner) => {
          setShowCoinToss(false);
          onClose();
        }}
      />
    </>
  );
}
