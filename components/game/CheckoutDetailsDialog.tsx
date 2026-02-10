'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Target, Trophy } from 'lucide-react';

interface CheckoutDetailsDialogProps {
  isOpen: boolean;
  score: number;
  remainingBefore: number;
  onSubmit: (dartsThrown: number, dartsAtDouble: number) => void;
}

export function CheckoutDetailsDialog({
  isOpen,
  score,
  remainingBefore,
  onSubmit,
}: CheckoutDetailsDialogProps) {
  const [step, setStep] = useState<'darts' | 'double'>('darts');
  const [dartsThrown, setDartsThrown] = useState<number>(3);
  const [dartsAtDouble, setDartsAtDouble] = useState<number>(1);

  // Calculate reasonable options based on score
  // 141+ can only be done with 3 darts (max 60+60+21=141, or T20 T19 D12 = 141)
  // 110-140 can be done with 2 or 3 darts
  // Under 110 can be done with 1, 2, or 3 darts
  const getDartsOptions = () => {
    if (score >= 141) return [3]; // Must use 3 darts
    if (score >= 110) return [2, 3]; // 2 or 3 darts possible
    if (score >= 50) return [2, 3]; // 2 or 3 darts (can't be done with 1)
    return [1, 2, 3]; // Lower scores can be any
  };

  const getDoubleOptions = () => {
    // If checkout is above 110, they only used 1 dart at the double
    // (The first two darts were trebles to get to a finish)
    if (score > 110) {
      return [1];
    }
    // For 100-110, could be 1 or 2 darts at double (e.g., T20 D20 = 100 uses 1, T19 D21.5... no, still 1)
    // Actually for most checkouts, only 1 dart is at double (the last one)
    // But for lower checkouts like 40, could be S20 D10 (2 at double) or D20 (1 at double)
    if (score <= 40) {
      return [1, 2];
    }
    return [1];
  };

  const handleDartsSelected = (darts: number) => {
    setDartsThrown(darts);
    setStep('double');
  };

  const handleDoubleSelected = (doubleDarts: number) => {
    setDartsAtDouble(doubleDarts);
    onSubmit(dartsThrown, doubleDarts);
    // Reset for next time
    setStep('darts');
    setDartsThrown(3);
    setDartsAtDouble(1);
  };

  const handleClose = () => {
    // Don't allow closing without selection - default to 3 darts, 1 at double
    onSubmit(3, 1);
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="bg-slate-900 border-emerald-500/30 text-white max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-center text-xl flex items-center justify-center gap-2">
            <Trophy className="w-6 h-6 text-emerald-400" />
            Checkout Details
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {step === 'darts' ? (
            <motion.div
              key="darts"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="py-6"
            >
              <div className="text-center mb-6">
                <div className="text-4xl font-black text-emerald-400 mb-2">{score}</div>
                <p className="text-slate-400 text-sm">How many darts did you throw?</p>
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
                  <p className="text-slate-400 text-sm">How many darts at the double?</p>
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

              <p className="text-center text-xs text-slate-500 mt-4">
                This helps calculate your checkout percentage
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
