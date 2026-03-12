'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Target, Trophy, AlertCircle } from 'lucide-react';

interface CheckoutDetailsDialogProps {
  isOpen: boolean;
  score: number;
  remainingBefore: number;
  isBust: boolean;
  onSubmit: (dartsThrown: number, dartsAtDouble: number) => void;
}

export function CheckoutDetailsDialog({
  isOpen,
  score,
  remainingBefore,
  isBust,
  onSubmit,
}: CheckoutDetailsDialogProps) {
  const [step, setStep] = useState<'darts' | 'double'>('darts');
  const [dartsThrown, setDartsThrown] = useState<number>(3);
  const [dartsAtDouble, setDartsAtDouble] = useState<number>(1);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStep('darts');
      setDartsThrown(3);
      setDartsAtDouble(1);
    }
  }, [isOpen]);

  // Calculate darts options based on score
  const getDartsOptions = () => {
    // For busts, any number of darts 1-3 is possible
    if (isBust) return [1, 2, 3];
    
    // For checkouts:
    // 141+ can only be done with 3 darts (max 60+60+21=141, or T20 T19 D12 = 141)
    if (score >= 141) return [3];
    // 110-140 can be done with 2 or 3 darts
    if (score >= 110) return [2, 3];
    // 50-109 can be done with 2 or 3 darts (can't be done with 1 dart that isn't a double, and if it's a checkout, the last dart must be a double)
    // Actually for checkouts, the minimum darts is at least 2 (unless it's a bullseye/double bull checkout which is 50)
    if (score > 50) return [2, 3];
    // 1-dart checkout only possible if score is even (D1-D20) or 50 (bull)
    const canOnedart = (score <= 40 && score % 2 === 0) || score === 50;
    if (canOnedart) return [1, 2, 3];
    return [2, 3];
  };

  const getDoubleOptions = () => {
    // Not applicable for busts
    if (isBust) return [];
    
    // For checkouts above 110, they only used 1 dart at the double
    if (score > 110) return [1];
    
    // For checkouts between 50-110, typically 1 dart at double
    if (score >= 50) return [1, 2];
    
    // For lower checkouts like 40, could be S20 D10 (2 darts total, 1 at double) or D20 (1 dart at double)
    // Actually S20 D10 means 2 darts thrown total, with 1 at double
    // For 32: D16 (1 dart, 1 at double) or S16 D8 (2 darts, 1 at double)
    // The question is "how many darts at the double" not "which dart hit the double"
    // So for any checkout, it's always at least 1 dart at double (the last one)
    // But you might have had multiple attempts at the double before hitting it
    
    // Let's keep it simple: 1 or 2 darts at double for lower scores
    return [1, 2];
  };

  const handleDartsSelected = (darts: number) => {
    setDartsThrown(darts);
    
    if (isBust) {
      // For busts, submit immediately (no darts at double to track)
      onSubmit(darts, 0);
    } else {
      // For checkouts, go to double selection
      setStep('double');
    }
  };

  const handleDoubleSelected = (doubleDarts: number) => {
    setDartsAtDouble(doubleDarts);
    onSubmit(dartsThrown, doubleDarts);
  };

  const handleClose = () => {
    // Default values if they somehow close
    onSubmit(3, isBust ? 0 : 1);
  };

  // Calculate remaining after (for display)
  const remainingAfter = remainingBefore - score;

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className={`text-white max-w-sm ${
          isBust 
            ? 'bg-slate-900 border-red-500/30' 
            : 'bg-slate-900 border-emerald-500/30'
        }`}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-center text-xl flex items-center justify-center gap-2">
            {isBust ? (
              <>
                <AlertCircle className="w-6 h-6 text-red-400" />
                <span className="text-red-400">Bust!</span>
              </>
            ) : (
              <>
                <Trophy className="w-6 h-6 text-emerald-400" />
                Checkout!
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {isBust ? (
            // Bust: Only ask for darts thrown
            <motion.div
              key="bust"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="py-6"
            >
              <div className="text-center mb-6">
                <div className="text-4xl font-black text-red-400 mb-2">
                  {remainingBefore} → {remainingAfter < 0 ? 'Bust!' : remainingAfter === 1 ? 'Left on 1!' : 'Bust!'}
                </div>
                <p className="text-slate-400 text-sm">How many darts did you throw?</p>
              </div>

              <div className="flex justify-center gap-3">
                {[1, 2, 3].map((darts) => (
                  <motion.button
                    key={darts}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleDartsSelected(darts)}
                    className="w-16 h-16 rounded-xl bg-slate-800 border-2 border-red-500/30 hover:border-red-500 hover:bg-red-500/10 transition-all flex flex-col items-center justify-center"
                  >
                    <span className="text-2xl font-bold text-red-400">{darts}</span>
                    <span className="text-xs text-slate-400">dart{darts > 1 ? 's' : ''}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : step === 'darts' ? (
            // Checkout: Step 1 - How many darts thrown
            <motion.div
              key="darts"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="py-6"
            >
              <div className="text-center mb-6">
                <div className="text-4xl font-black text-emerald-400 mb-2">{score}</div>
                <div className="text-slate-400 text-sm mb-1">From {remainingBefore}</div>
                <p className="text-slate-300 text-sm">How many darts did you throw?</p>
              </div>

              <div className="flex justify-center gap-3">
                {getDartsOptions().map((darts) => (
                  <motion.button
                    key={darts}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleDartsSelected(darts)}
                    className="w-16 h-16 rounded-xl bg-slate-800 border-2 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/10 transition-all flex flex-col items-center justify-center"
                  >
                    <span className="text-2xl font-bold text-emerald-400">{darts}</span>
                    <span className="text-xs text-slate-400">dart{darts > 1 ? 's' : ''}</span>
                  </motion.button>
                ))}
              </div>

              {score >= 100 && (
                <p className="text-center text-xs text-slate-500 mt-4">
                  High checkout! Usually takes 2-3 darts
                </p>
              )}
            </motion.div>
          ) : (
            // Checkout: Step 2 - How many darts at double
            <motion.div
              key="double"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="py-6"
            >
              <div className="text-center mb-6">
                <div className="text-4xl font-black text-emerald-400 mb-2">{dartsThrown}</div>
                <p className="text-slate-400 text-sm">darts thrown</p>
                <div className="mt-4">
                  <Target className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-slate-300 text-sm">How many darts at the double?</p>
                </div>
              </div>

              <div className="flex justify-center gap-3">
                {getDoubleOptions().map((darts) => (
                  <motion.button
                    key={darts}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleDoubleSelected(darts)}
                    className="w-16 h-16 rounded-xl bg-slate-800 border-2 border-emerald-500/30 hover:border-emerald-500 hover:bg-emerald-500/10 transition-all flex flex-col items-center justify-center"
                  >
                    <span className="text-2xl font-bold text-emerald-400">{darts}</span>
                    <span className="text-xs text-slate-400">dart{darts > 1 ? 's' : ''}</span>
                  </motion.button>
                ))}
              </div>

              <button
                onClick={() => setStep('darts')}
                className="mt-4 text-xs text-slate-500 hover:text-slate-300 mx-auto block"
              >
                ← Back
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
