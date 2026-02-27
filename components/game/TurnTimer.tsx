'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, AlertTriangle } from 'lucide-react';

const TURN_DURATION = 60; // seconds

interface TurnTimerProps {
  isMyTurn: boolean;
  isActive: boolean;
  turnStartedAt: string | null; // ISO timestamp — both clients use same reference
  onTimerExpired: () => void;
  className?: string;
}

export function TurnTimer({ isMyTurn, isActive, turnStartedAt, onTimerExpired, className = '' }: TurnTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(TURN_DURATION);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasExpiredRef = useRef(false);
  const prevStartRef = useRef<string | null>(null);

  // Compute seconds remaining from shared timestamp
  const computeSecondsLeft = (startedAt: string): number => {
    const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
    return Math.max(0, Math.ceil(TURN_DURATION - elapsed));
  };

  // Reset when turn start timestamp changes
  useEffect(() => {
    if (turnStartedAt !== prevStartRef.current) {
      prevStartRef.current = turnStartedAt;
      hasExpiredRef.current = false;
      if (turnStartedAt) {
        setSecondsLeft(computeSecondsLeft(turnStartedAt));
      } else {
        setSecondsLeft(TURN_DURATION);
      }
    }
  }, [turnStartedAt]);

  // Countdown — recalculates from the shared timestamp each tick to stay in sync
  useEffect(() => {
    if (!isActive || !turnStartedAt) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      const remaining = computeSecondsLeft(turnStartedAt);
      setSecondsLeft(remaining);

      if (remaining <= 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        onTimerExpired();
      }
    }, 500); // tick every 500ms for smoother sync

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isActive, turnStartedAt, onTimerExpired]);

  if (!isActive || !turnStartedAt) return null;

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
          scale: isCritical ? { repeat: Infinity, duration: 0.5 } : undefined,
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
