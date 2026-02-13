'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface CoinTossModalProps {
  isOpen: boolean;
  player1Name: string;
  player2Name: string;
  player1Id: string;
  player2Id: string;
  currentUserId: string;
  winnerId?: string | null;
  bothPlayersConnected?: boolean;
  syncStart?: boolean;
  onComplete: (winnerId: string) => void;
  onStart?: () => void;
}

export function CoinTossModal({
  isOpen,
  player1Name,
  player2Name,
  player1Id,
  player2Id,
  currentUserId,
  winnerId: predeterminedWinner,
  bothPlayersConnected = true,
  onComplete,
}: CoinTossModalProps) {
  const isPlayer1 = currentUserId === player1Id;
  const [phase, setPhase] = useState<'waiting' | 'spinning' | 'result'>('waiting');
  const [result, setResult] = useState<'heads' | 'tails' | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>(0);

  // Start the coin toss when both players are connected
  useEffect(() => {
    if (!isOpen || phase !== 'waiting') return;
    
    if (bothPlayersConnected) {
      console.log('[COIN TOSS] Both connected, starting spin');
      setPhase('spinning');
      startTimeRef.current = Date.now();
      
      // Player 1 determines winner after spinning for 3 seconds
      if (isPlayer1) {
        setTimeout(() => {
          const isP1Winner = Math.random() < 0.5;
          const winner = isP1Winner ? player1Id : player2Id;
          console.log('[COIN TOSS] Player 1 determined winner:', winner);
          onComplete(winner);
        }, 3000);
      }
    }
  }, [isOpen, bothPlayersConnected, phase, isPlayer1, player1Id, player2Id, onComplete]);

  // Handle winner being set (from DB for Player 2, or local for Player 1)
  useEffect(() => {
    if (predeterminedWinner && phase === 'spinning') {
      console.log('[COIN TOSS] Winner received:', predeterminedWinner);
      const isP1Winner = predeterminedWinner === player1Id;
      setResult(isP1Winner ? 'heads' : 'tails');
      setWinnerId(predeterminedWinner);
      setPhase('result');
      
      // Animate to final position
      const finalRotation = 360 * 5 + (isP1Winner ? 0 : 180);
      setRotation(finalRotation);
      
      // Auto close after showing result
      setTimeout(() => {
        onComplete(predeterminedWinner);
      }, 3500);
    }
  }, [predeterminedWinner, phase, player1Id, onComplete]);

  // Spinning animation
  useEffect(() => {
    if (phase !== 'spinning') {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      // Spin for 4 seconds total, then slow down
      const spinDuration = 4000;
      
      if (elapsed < spinDuration) {
        // Fast spinning
        const progress = elapsed / spinDuration;
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentRotation = (elapsed / 16) * 15 * (1 - easeOut * 0.3); // Slow down slightly
        setRotation(currentRotation);
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Slow spin while waiting for result
        setRotation(prev => prev + 2);
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [phase]);

  const winnerName = winnerId === player1Id ? player1Name : player2Name;

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold text-emerald-400">
            Coin Toss
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center py-8">
          {/* Player names on either side */}
          <div className="flex items-center justify-between w-full mb-8 px-2">
            <motion.div 
              className={`text-center flex-1 p-4 rounded-xl transition-all duration-500 ${
                phase === 'result' && result === 'heads' 
                  ? 'bg-emerald-500/20 border-2 border-emerald-400 shadow-lg shadow-emerald-500/20' 
                  : 'opacity-70'
              }`}
              animate={{ 
                scale: phase === 'result' && result === 'heads' ? 1.05 : 1,
              }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-xl font-black text-white">
                {player1Name}
              </div>
              <div className="text-sm font-bold text-slate-400 mt-1">HEADS</div>
              {phase === 'result' && result === 'heads' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-emerald-400 mt-2 font-bold"
                >
                  ✓ WINS TOSS
                </motion.div>
              )}
            </motion.div>
            
            <div className="text-gray-600 font-bold px-4 text-2xl">VS</div>
            
            <motion.div 
              className={`text-center flex-1 p-4 rounded-xl transition-all duration-500 ${
                phase === 'result' && result === 'tails' 
                  ? 'bg-emerald-500/20 border-2 border-emerald-400 shadow-lg shadow-emerald-500/20' 
                  : 'opacity-70'
              }`}
              animate={{ 
                scale: phase === 'result' && result === 'tails' ? 1.05 : 1,
              }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-xl font-black text-white">
                {player2Name}
              </div>
              <div className="text-sm font-bold text-slate-400 mt-1">TAILS</div>
              {phase === 'result' && result === 'tails' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs text-emerald-400 mt-2 font-bold"
                >
                  ✓ WINS TOSS
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* Coin */}
          <div className="relative w-40 h-40 mb-8" style={{ perspective: '1000px' }}>
            <motion.div
              className="w-full h-full relative"
              style={{ 
                transformStyle: 'preserve-3d',
                transform: `rotateY(${rotation}deg)`
              }}
            >
              {/* Heads side - Player 1 */}
              <div 
                className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 flex flex-col items-center justify-center border-4 border-yellow-200 shadow-2xl"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <span className="text-5xl font-black text-amber-900">H</span>
                <span className="text-xs font-bold text-amber-800 mt-1">HEADS</span>
              </div>
              
              {/* Tails side - Player 2 */}
              <div 
                className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-500 via-yellow-500 to-yellow-300 flex flex-col items-center justify-center border-4 border-yellow-200 shadow-2xl"
                style={{ 
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                }}
              >
                <span className="text-5xl font-black text-amber-900">T</span>
                <span className="text-xs font-bold text-amber-800 mt-1">TAILS</span>
              </div>
            </motion.div>
            
            {/* Glow effect under coin */}
            <div className="absolute inset-0 rounded-full bg-yellow-400 blur-2xl opacity-30 -z-10" />
          </div>

          {/* Status text */}
          <AnimatePresence mode="wait">
            {phase === 'waiting' && !bothPlayersConnected && (
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                <Loader2 className="w-8 h-8 text-amber-400 mx-auto mb-3 animate-spin" />
                <p className="text-amber-400 text-xl font-bold">
                  Waiting for opponent...
                </p>
              </motion.div>
            )}
            
            {phase === 'spinning' && (
              <motion.div
                key="spinning"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                <motion.p 
                  className="text-emerald-400 text-xl font-bold"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                >
                  Tossing...
                </motion.p>
              </motion.div>
            )}
            
            {phase === 'result' && winnerName && (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="text-center"
              >
                <motion.div 
                  className="text-5xl font-black text-emerald-400 mb-2"
                  initial={{ scale: 0.5 }}
                  animate={{ scale: [0.5, 1.2, 1] }}
                  transition={{ duration: 0.5 }}
                >
                  {winnerName}
                </motion.div>
                <motion.p 
                  className="text-emerald-300 text-xl font-bold"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  WINS THE TOSS!
                </motion.p>
                <motion.p 
                  className="text-slate-400 text-sm mt-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  Starting match...
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
