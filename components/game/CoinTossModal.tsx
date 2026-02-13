'use client';

import { useState, useEffect } from 'react';
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
  winnerId?: string | null; // If provided, we're just showing the result (joiner view)
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
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<'heads' | 'tails' | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);

  // Start spinning immediately when modal opens and both players are connected
  useEffect(() => {
    if (!isOpen || hasStarted) return;
    
    if (bothPlayersConnected) {
      console.log('[COIN TOSS] Both connected, starting spin animation');
      setHasStarted(true);
      startSpinAnimation();
    }
  }, [isOpen, bothPlayersConnected, hasStarted]);

  // Handle winner determination (Player 1 decides, both show result from DB)
  useEffect(() => {
    if (!hasStarted || !predeterminedWinner) return;
    
    // Winner determined - show result
    const isPlayer1Winner = predeterminedWinner === player1Id;
    const selectedResult: 'heads' | 'tails' = isPlayer1Winner ? 'heads' : 'tails';
    
    console.log('[COIN TOSS] Winner received:', predeterminedWinner, 'Result:', selectedResult);
    
    // Complete the animation to the correct side
    setResult(selectedResult);
    setWinnerId(predeterminedWinner);
    
    // Animate to final position
    const finalRotation = 360 * 5 + (isPlayer1Winner ? 0 : 180);
    setRotation(finalRotation);
    
    // Show result after a brief moment
    setTimeout(() => {
      setIsSpinning(false);
      setShowResult(true);
      
      // Auto-complete
      setTimeout(() => {
        onComplete(predeterminedWinner);
      }, 3000);
    }, 500);
  }, [hasStarted, predeterminedWinner, player1Id, onComplete]);

  const startSpinAnimation = () => {
    setIsSpinning(true);
    setShowResult(false);
    setResult(null);
    setWinnerId(null);

    // SPIN 5 times (1800 degrees) - continuous spinning until result comes
    const spinDuration = 4000; // 4 seconds of spinning
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / spinDuration, 1);
      
      // Continuous rotation during spin phase
      const currentRotation = (elapsed / 16) * 10; // Spin continuously
      setRotation(currentRotation);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Spin phase complete - keep spinning slowly until result arrives
        console.log('[COIN TOSS] Initial spin complete, waiting for result...');
        slowSpinUntilResult();
      }
    };
    
    requestAnimationFrame(animate);
  };

  // Slow spin while waiting for result from DB
  const slowSpinUntilResult = () => {
    if (!predeterminedWinner) {
      // Keep rotating slowly
      setRotation(prev => prev + 5);
      requestAnimationFrame(slowSpinUntilResult);
    }
    // When predeterminedWinner arrives, the useEffect above will handle it
  };

  // Player 1 determines the winner and saves to DB
  useEffect(() => {
    if (!isPlayer1 || !hasStarted || predeterminedWinner) return;
    
    // Wait a bit then determine winner
    const timeout = setTimeout(() => {
      const isPlayer1Winner = Math.random() < 0.5;
      const selectedWinnerId = isPlayer1Winner ? player1Id : player2Id;
      
      console.log('[COIN TOSS] Player 1 determining winner:', selectedWinnerId);
      onComplete(selectedWinnerId);
    }, 2000); // Determine winner after 2 seconds of spinning
    
    return () => clearTimeout(timeout);
  }, [isPlayer1, hasStarted, predeterminedWinner, player1Id, player2Id, onComplete]);

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
                showResult && result === 'heads' 
                  ? 'bg-emerald-500/20 border-2 border-emerald-400 shadow-lg shadow-emerald-500/20' 
                  : 'opacity-70'
              }`}
              animate={{ 
                scale: showResult && result === 'heads' ? 1.05 : 1,
                opacity: showResult && result === 'heads' ? 1 : 0.7
              }}
              transition={{ duration: 0.5 }}
            >
              <motion.div 
                className="text-xl font-black text-white"
                animate={{ 
                  scale: showResult && result === 'heads' ? [1, 1.2, 1] : 1,
                  color: showResult && result === 'heads' ? '#34d399' : '#ffffff'
                }}
                transition={{ duration: 0.5, repeat: showResult && result === 'heads' ? 2 : 0 }}
              >
                {player1Name}
              </motion.div>
              <div className="text-sm font-bold text-slate-400 mt-1">HEADS</div>
              {showResult && result === 'heads' && (
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
                showResult && result === 'tails' 
                  ? 'bg-emerald-500/20 border-2 border-emerald-400 shadow-lg shadow-emerald-500/20' 
                  : 'opacity-70'
              }`}
              animate={{ 
                scale: showResult && result === 'tails' ? 1.05 : 1,
                opacity: showResult && result === 'tails' ? 1 : 0.7
              }}
              transition={{ duration: 0.5 }}
            >
              <motion.div 
                className="text-xl font-black text-white"
                animate={{ 
                  scale: showResult && result === 'tails' ? [1, 1.2, 1] : 1,
                  color: showResult && result === 'tails' ? '#34d399' : '#ffffff'
                }}
                transition={{ duration: 0.5, repeat: showResult && result === 'tails' ? 2 : 0 }}
              >
                {player2Name}
              </motion.div>
              <div className="text-sm font-bold text-slate-400 mt-1">TAILS</div>
              {showResult && result === 'tails' && (
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

          {/* Coin with spinning animation */}
          <div className="relative w-40 h-40 mb-8" style={{ perspective: '1000px' }}>
            <motion.div
              className="w-full h-full relative"
              animate={{ 
                rotateY: rotation 
              }}
              transition={{ 
                type: "tween",
                ease: "linear",
                duration: 0
              }}
              style={{ 
                transformStyle: 'preserve-3d',
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
            {isSpinning && !showResult ? (
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
            ) : !bothPlayersConnected ? (
              <motion.div
                key="waiting-connection"
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
            ) : showResult && winnerName ? (
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
            ) : null}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
