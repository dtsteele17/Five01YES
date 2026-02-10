'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

interface CoinTossProps {
  isOpen: boolean;
  player1Name: string;
  player2Name: string;
  onComplete: (firstPlayer: 1 | 2) => void;
}

export function CoinToss({ isOpen, player1Name, player2Name, onComplete }: CoinTossProps) {
  const [isFlipping, setIsFlipping] = useState(false);
  const [result, setResult] = useState<1 | 2 | null>(null);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (isOpen && !isFlipping && !result) {
      const timer = setTimeout(() => {
        setIsFlipping(true);
        
        setTimeout(() => {
          const winner = Math.random() < 0.5 ? 1 : 2;
          setResult(winner);
          setIsFlipping(false);
          setShowResult(true);
          
          setTimeout(() => {
            onComplete(winner);
          }, 2000);
        }, 2000);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [isOpen, isFlipping, result, onComplete]);

  return (
    <Dialog open={isOpen} modal>
      <DialogContent 
        className="bg-slate-900 border-slate-700 text-white w-full max-w-md overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex flex-col items-center py-8">
          <h2 className="text-2xl font-bold text-white mb-8">Coin Toss</h2>
          
          {/* Player names on either side */}
          <div className="flex items-center justify-between w-full px-6 mb-8">
            <div 
              className={`text-center transition-all duration-500 ${
                result === 1 
                  ? 'text-emerald-400 scale-110' 
                  : 'text-slate-400'
              }`}
            >
              <div className="text-xl font-bold">{player1Name}</div>
              {result === 1 && showResult && (
                <div className="text-sm text-emerald-400 mt-1 animate-fade-in">
                  Goes First!
                </div>
              )}
            </div>
            
            <div className="text-slate-500 text-sm font-bold">VS</div>
            
            <div 
              className={`text-center transition-all duration-500 ${
                result === 2 
                  ? 'text-emerald-400 scale-110' 
                  : 'text-slate-400'
              }`}
            >
              <div className="text-xl font-bold">{player2Name}</div>
              {result === 2 && showResult && (
                <div className="text-sm text-emerald-400 mt-1 animate-fade-in">
                  Goes First!
                </div>
              )}
            </div>
          </div>
          
          {/* Coin */}
          <div className="relative w-32 h-32 mb-8 perspective-1000">
            <div
              className={`w-full h-full relative transition-transform duration-1000 ${
                isFlipping ? 'animate-coin-flip' : ''
              }`}
              style={{
                transformStyle: 'preserve-3d',
              }}
            >
              {/* Coin Front */}
              <div 
                className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 flex items-center justify-center shadow-2xl border-4 border-yellow-300"
                style={{ backfaceVisibility: 'hidden' }}
              >
                <span className="text-4xl font-bold text-yellow-100">1</span>
              </div>
              
              {/* Coin Back */}
              <div 
                className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-500 via-yellow-600 to-yellow-700 flex items-center justify-center shadow-2xl border-4 border-yellow-400"
                style={{ 
                  backfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                }}
              >
                <span className="text-4xl font-bold text-yellow-100">2</span>
              </div>
            </div>
            
            {/* Glow effect on result */}
            {showResult && (
              <div className="absolute inset-0 rounded-full bg-emerald-500/30 blur-xl animate-pulse" />
            )}
          </div>
          
          {/* Status text */}
          <div className="text-center h-8">
            {isFlipping && (
              <p className="text-slate-400 animate-pulse">
                Flipping...
              </p>
            )}
            {showResult && (
              <div className="text-xl font-bold text-emerald-400 animate-fade-in">
                {result === 1 ? player1Name : player2Name} goes first!
              </div>
            )}
          </div>
        </div>
        
        <style jsx>{`
          @keyframes coin-flip {
            0% { transform: rotateY(0deg); }
            25% { transform: rotateY(450deg); }
            50% { transform: rotateY(900deg); }
            75% { transform: rotateY(1350deg); }
            100% { transform: rotateY(1800deg); }
          }
          
          .animate-coin-flip {
            animation: coin-flip 2s ease-in-out;
          }
          
          .animate-fade-in {
            animation: fade-in 0.5s ease-out;
          }
          
          @keyframes fade-in {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          
          .perspective-1000 {
            perspective: 1000px;
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}
