'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronUp } from 'lucide-react';

interface LevelUpToastProps {
  oldLevel: number;
  newLevel: number;
  onDismiss?: () => void;
}

/**
 * Level-up celebration toast — appears in the bottom-right corner
 * Auto-dismisses after 5 seconds
 */
export function LevelUpToast({ oldLevel, newLevel, onDismiss }: LevelUpToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="fixed bottom-3 right-3 sm:bottom-6 sm:right-6 z-[9999] cursor-pointer"
          onClick={() => {
            setVisible(false);
            onDismiss?.();
          }}
        >
          <div className="relative overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 sm:p-5 shadow-2xl shadow-amber-500/20 min-w-[240px] sm:min-w-[280px] max-w-[calc(100vw-1.5rem)]">
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 animate-pulse" />

            <div className="relative flex items-center gap-4">
              {/* Icon */}
              <motion.div
                initial={{ rotate: -30, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 400 }}
                className="flex-shrink-0 flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30"
              >
                <ChevronUp className="w-8 h-8 text-white" />
              </motion.div>

              {/* Content */}
              <div>
                <motion.p
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-1"
                >
                  Level Up!
                </motion.p>
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-slate-400 text-lg font-bold">{oldLevel}</span>
                  <span className="text-slate-500">→</span>
                  <span className="text-white text-2xl font-black">{newLevel}</span>
                  <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                </motion.div>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-slate-400 text-xs mt-1"
                >
                  Keep training to reach the next level!
                </motion.p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook to manage level-up toast state
 * Call `triggerLevelUp(oldLevel, newLevel)` to show the toast
 */
export function useLevelUpToast() {
  const [levelUp, setLevelUp] = useState<{ oldLevel: number; newLevel: number } | null>(null);

  const triggerLevelUp = (oldLevel: number, newLevel: number) => {
    setLevelUp({ oldLevel, newLevel });
  };

  const dismiss = () => setLevelUp(null);

  const LevelUpToastComponent = levelUp ? (
    <LevelUpToast
      oldLevel={levelUp.oldLevel}
      newLevel={levelUp.newLevel}
      onDismiss={dismiss}
    />
  ) : null;

  return { triggerLevelUp, LevelUpToastComponent };
}
