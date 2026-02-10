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

    // Randomly select winner after animation
    setTimeout(() => {
      const isPlayer1Winner = Math.random() < 0.5;
      const selectedWinnerId = isPlayer1Winner ? player1Id : player2Id;
      const selectedResult: 'heads' | 'tails' = isPlayer1Winner ? 'heads' : 'tails';
      
      setResult(selectedResult);
      setWinnerId(selectedWinnerId);
      setIsSpinning(false);
      setShowResult(true);

      // Auto-complete after showing result (longer to read the result)
      setTimeout(() => {
        onComplete(selectedWinnerId);
      }, 3000);
    }, 4500);
  };

  const winnerName = winnerId === player1Id ? player1Name : player2Name;

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            Coin Toss
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center py-8">
          {/* Player names */}
          <div className="flex justify-between w-full mb-8 px-4">
            <div className={`text-center transition-opacity ${result === 'heads' ? 'opacity-100 text-emerald-400 font-bold' : 'opacity-60'}`}>
              <div className="text-sm">{player1Name}</div>
              <div className="text-xs text-gray-500">Heads</div>
            </div>
            <div className="text-gray-600 self-center">VS</div>
            <div className={`text-center transition-opacity ${result === 'tails' ? 'opacity-100 text-emerald-400 font-bold' : 'opacity-60'}`}>
              <div className="text-sm">{player2Name}</div>
              <div className="text-xs text-gray-500">Tails</div>
            </div>
          </div>

          {/* Coin */}
          <div className="relative w-32 h-32 mb-8" style={{ perspective: '1000px' }}>
            <motion.div
              className="w-full h-full relative"
              style={{ transformStyle: 'preserve-3d' }}
              animate={isSpinning ? {
                rotateY: [0, 720, 1440, 2160, 2880, 3600, 4320, 5040],
                y: [0, -30, 0, -20, 0, -10, 0, 0],
              } : {
                rotateY: result === 'heads' ? 0 : 180,
                y: 0,
              }}
              transition={isSpinning ? {
                duration: 4.5,
                ease: [0.25, 0.1, 0.25, 1],
                times: [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.8, 1],
              } : {
                duration: 0.5,
                ease: "easeOut",
              }}
            >
              {/* Heads side */}
              <div 
                className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center border-4 border-yellow-300 shadow-lg"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <span className="text-4xl font-bold text-yellow-900">H</span>
              </div>
              
              {/* Tails side */}
              <div 
                className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-500 to-yellow-700 flex items-center justify-center border-4 border-yellow-300 shadow-lg"
                style={{ 
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                }}
              >
                <span className="text-4xl font-bold text-yellow-900">T</span>
              </div>
            </motion.div>
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
                  className="text-emerald-400 text-lg font-semibold"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  Tossing coin...
                </motion.p>
                <p className="text-gray-500 text-sm mt-1">Heads or Tails?</p>
              </motion.div>
            ) : showResult && winnerName ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="text-center"
              >
                <motion.p 
                  className="text-emerald-400 text-2xl font-bold mb-2"
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
                >
                  {result?.toUpperCase()}!
                </motion.p>
                <motion.p 
                  className="text-white text-lg"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <span className="font-semibold text-emerald-300">{winnerName}</span> throws first
                </motion.p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
