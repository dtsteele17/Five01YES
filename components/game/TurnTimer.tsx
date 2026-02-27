'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, AlertTriangle } from 'lucide-react';

interface TurnTimerProps {
  isMyTurn: boolean;
  isActive: boolean; // room.status === 'active' and game in progress
  turnPlayerId: string | null; // current_turn from room
  onTimerExpired: () => void; // called when first 60s expires
  className?: string;
}

export function TurnTimer({ isMyTurn, isActive, turnPlayerId, onTimerExpired, className = '' }: TurnTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(60);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasExpiredRef = useRef(false);
  const prevTurnPlayerRef = useRef<string | null>(null);

  // Reset timer when turn changes
  useEffect(() => {
    if (turnPlayerId !== prevTurnPlayerRef.current) {
      prevTurnPlayerRef.current = turnPlayerId;
      setSecondsLeft(60);
      hasExpiredRef.current = false;
    }
  }, [turnPlayerId]);

  // Reset externally (e.g., after "Still Here" click)
  const resetTimer = useCallback(() => {
    setSecondsLeft(60);
    hasExpiredRef.current = false;
  }, []);

  // Countdown
  useEffect(() => {
    if (!isActive || !turnPlayerId) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          if (!hasExpiredRef.current) {
            hasExpiredRef.current = true;
            onTimerExpired();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, turnPlayerId, onTimerExpired]);

  if (!isActive || !turnPlayerId) return null;

  const isLow = secondsLeft <= 15;
  const isCritical = secondsLeft <= 5;
  const color = isMyTurn
    ? isCritical ? 'text-red-400 bg-red-500/20 border-red-500/40' 
      : isLow ? 'text-amber-400 bg-amber-500/15 border-amber-500/30' 
      : 'text-amber-300 bg-amber-500/10 border-amber-500/20'
    : isCritical ? 'text-red-400 bg-red-500/20 border-red-500/40'
      : isLow ? 'text-blue-300 bg-blue-500/15 border-blue-500/30'
      : 'text-blue-300 bg-blue-500/10 border-blue-500/20';

  return (
    <AnimatePresence>
      <motion.div
        key="turn-timer"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ 
          opacity: 1, 
          scale: isCritical ? [1, 1.05, 1] : 1,
        }}
        transition={{ 
          duration: 0.2,
          scale: isCritical ? { repeat: Infinity, duration: 0.5 } : undefined
        }}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-mono font-bold ${color} ${className}`}
      >
        {isCritical ? (
          <AlertTriangle className="w-3 h-3" />
        ) : (
          <Clock className="w-3 h-3" />
        )}
        <span>{secondsLeft}s</span>
      </motion.div>
    </AnimatePresence>
  );
}

// Export reset function via ref pattern
export type TurnTimerHandle = {
  reset: () => void;
};
