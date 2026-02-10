'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CoinTossModalProps {
  isOpen: boolean;
  player1Name: string;
  player2Name: string;
  player1Id: string;
  player2Id: string;
  onComplete: (winnerId: string) => void;
}

export function CoinTossModal({
  isOpen,
  player1Name,
  player2Name,
  player1Id,
  player2Id,
  onComplete,
}: CoinTossModalProps) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<'heads' | 'tails' | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (isOpen && !isSpinning && !showResult) {
      startCoinToss();
    }
  }, [isOpen]);

  const startCoinToss = () => {
    setIsSpinning(true);
    setShowResult(false);
    setResult(null);
    setWinnerId(null);
    setRotation(0);

    // Determine winner immediately (but don't show yet)
    const isPlayer1Winner = Math.random() < 0.5;
    const selectedWinnerId = isPlayer1Winner ? player1Id : player2Id;
    const selectedResult: 'heads' | 'tails' = isPlayer1Winner ? 'heads' : 'tails';
    
    setResult(selectedResult);
    setWinnerId(selectedWinnerId);

    // Start the spin animation
    // One big spin that starts fast and slows down
    const targetRotation = 360 * 5 + (isPlayer1Winner ? 0 : 180); // 5 full spins + land on correct side
    
    // Animate the rotation
    const duration = 4000; // 4 seconds
    const startTime = Date.now();
    const startRotation = 0;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function: starts fast, slows down at the end (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      const currentRotation = startRotation + (targetRotation * easeOut);
      setRotation(currentRotation);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation complete
        setIsSpinning(false);
        setShowResult(true);
        
        // Auto-complete after showing result
        setTimeout(() => {
          onComplete(selectedWinnerId);
        }, 3000);
      }
    };
    
    requestAnimationFrame(animate);
  };

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
              className="text-center flex-1"
              animate={{ opacity: result === 'heads' ? 1 : 0.5, scale: result === 'heads' ? 1.1 : 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-lg font-bold text-emerald-400">{player1Name}</div>
              <div className="text-sm text-gray-500">Heads</div>
            </motion.div>
            
            <div className="text-gray-600 font-bold px-4">VS</div>
            
            <motion.div 
              className="text-center flex-1"
              animate={{ opacity: result === 'tails' ? 1 : 0.5, scale: result === 'tails' ? 1.1 : 1 }}
              transition={{ duration: 0.5 }}
            >
              <div className="text-lg font-bold text-emerald-400">{player2Name}</div>
              <div className="text-sm text-gray-500">Tails</div>
            </motion.div>
          </div>

          {/* Coin with single big spin */}
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
            {isSpinning ? (
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
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  Tossing...
                </motion.p>
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
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
                >
                  {result?.toUpperCase()}!
                </motion.div>
                <motion.p 
                  className="text-white text-xl"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <span className="font-bold text-emerald-300">{winnerName}</span> throws first
                </motion.p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
