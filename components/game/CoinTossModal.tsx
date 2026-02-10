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

      // Auto-complete after showing result
      setTimeout(() => {
        onComplete(selectedWinnerId);
      }, 2000);
    }, 2000);
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
                rotateY: [0, 360, 720, 1080, 1440, 1800, 2160, 2520],
              } : {
                rotateY: result === 'heads' ? 0 : 180,
              }}
              transition={isSpinning ? {
                duration: 2,
                ease: "easeInOut",
                times: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1],
              } : {
                duration: 0.3,
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
              <motion.p
                key="spinning"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-gray-400 text-center"
              >
                Tossing coin...
              </motion.p>
            ) : showResult && winnerName ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <p className="text-emerald-400 text-lg font-bold mb-1">
                  {result?.toUpperCase()}!
                </p>
                <p className="text-white">
                  <span className="font-semibold">{winnerName}</span> throws first
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
