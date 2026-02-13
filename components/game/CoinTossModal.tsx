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
  bothPlayersConnected?: boolean; // New prop to track if both players are connected
  syncStart?: boolean; // When true, both players should start spinning (triggered by signal)
  onComplete: (winnerId: string) => void;
  onStart?: () => void; // Called when Player 1 starts the toss (to send signal to Player 2)
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
  syncStart = false,
  onComplete,
  onStart,
}: CoinTossModalProps) {
  const isPlayer1 = currentUserId === player1Id;
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<'heads' | 'tails' | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);

  // If winner is predetermined (from DB), show result after spin
  const isShowingResultOnly = !!predeterminedWinner;

  useEffect(() => {
    if (!isOpen) return;
    
    // Player 1 starts the toss when both connected
    if (isPlayer1 && !isSpinning && !showResult && !hasStarted) {
      if (bothPlayersConnected) {
        console.log('[COIN TOSS] Both players connected, starting toss');
        setHasStarted(true);
        onStart?.(); // Send signal to Player 2 to start their animation
        startCoinToss();
      } else {
        console.log('[COIN TOSS] Waiting for opponent to connect...');
      }
    }
    
    // Player 2 starts when receiving sync signal (but result comes from DB)
    if (!isPlayer1 && syncStart && !isSpinning && !showResult && !hasStarted) {
      console.log('[COIN TOSS] Received sync signal, starting toss animation');
      setHasStarted(true);
      startCoinTossForJoiner();
    }
  }, [isOpen, isPlayer1, bothPlayersConnected, syncStart, hasStarted, isSpinning, showResult, onStart]);

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
    
    // Store result but DON'T set it in state yet - keep it hidden!
    const targetResult = selectedResult;
    const targetWinnerId = selectedWinnerId;

    // Start the spin animation
    const targetRotation = 360 * 5 + (isPlayer1Winner ? 0 : 180);
    
    const duration = 4000;
    const startTime = Date.now();
    const startRotation = 0;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentRotation = startRotation + (targetRotation * easeOut);
      setRotation(currentRotation);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation complete - NOW reveal the result!
        setIsSpinning(false);
        setResult(targetResult);
        setWinnerId(targetWinnerId);
        setShowResult(true);
        
        // Auto-complete after showing result
        setTimeout(() => {
          onComplete(targetWinnerId);
        }, 3000);
      }
    };
    
    requestAnimationFrame(animate);
  };

  // For Player 2 (joiner) - spin animation but wait for DB result
  const startCoinTossForJoiner = () => {
    setIsSpinning(true);
    setShowResult(false);
    setResult(null);
    setWinnerId(null);
    setRotation(0);

    // Don't determine winner - just animate and wait for DB result
    const targetRotation = 360 * 5; // Spin 5 times
    
    const duration = 4000;
    const startTime = Date.now();
    const startRotation = 0;
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentRotation = startRotation + (targetRotation * easeOut);
      setRotation(currentRotation);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Animation complete - check if we have result from DB
        if (predeterminedWinner) {
          const isPlayer1Winner = predeterminedWinner === player1Id;
          const selectedResult: 'heads' | 'tails' = isPlayer1Winner ? 'heads' : 'tails';
          setIsSpinning(false);
          setResult(selectedResult);
          setWinnerId(predeterminedWinner);
          setShowResult(true);
          
          setTimeout(() => {
            onComplete(predeterminedWinner);
          }, 3000);
        } else {
          // Keep spinning lightly while waiting for result
          setIsSpinning(false);
          setRotation(360 * 5);
        }
      }
    };
    
    requestAnimationFrame(animate);
  };

  // Effect to show result when DB updates with winner (for joiner)
  useEffect(() => {
    if (!isPlayer1 && predeterminedWinner && hasStarted && !showResult) {
      console.log('[COIN TOSS] Joiner received winner from DB:', predeterminedWinner);
      const isPlayer1Winner = predeterminedWinner === player1Id;
      const selectedResult: 'heads' | 'tails' = isPlayer1Winner ? 'heads' : 'tails';
      setResult(selectedResult);
      setWinnerId(predeterminedWinner);
      setShowResult(true);
      setRotation(360 * 5 + (isPlayer1Winner ? 0 : 180));
      
      setTimeout(() => {
        onComplete(predeterminedWinner);
      }, 4000);
    }
  }, [predeterminedWinner, isPlayer1, hasStarted, showResult, player1Id, onComplete]);

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
          {/* Player names on either side - Winner is HIGHLIGHTED only after spin stops! */}
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

          {/* Status text - only shows winner AFTER spin stops */}
          <AnimatePresence mode="wait">
            {isSpinning ? (
              // Spinning animation active
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
            ) : isPlayer1 && !bothPlayersConnected ? (
              // Player 1 waiting for opponent to connect
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
                <p className="text-slate-400 text-sm mt-2">
                  {player2Name} is connecting
                </p>
              </motion.div>
            ) : !isPlayer1 && !hasStarted ? (
              // Joiner waiting for Player 1 to start toss
              <motion.div
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                <Loader2 className="w-8 h-8 text-emerald-400 mx-auto mb-3 animate-spin" />
                <p className="text-emerald-400 text-xl font-bold">
                  Waiting for {player1Name}...
                </p>
                <p className="text-slate-400 text-sm mt-2">
                  They are tossing the coin
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
