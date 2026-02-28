'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, UserX } from 'lucide-react';

interface OpponentAfkNoticeProps {
  open: boolean;
  opponentName: string;
  onDismiss: () => void;
  onOpponentAfkTimeout?: () => void; // Called when the 60s countdown hits 0
}

export function OpponentAfkNotice({ open, opponentName, onDismiss, onOpponentAfkTimeout }: OpponentAfkNoticeProps) {
  const [secondsLeft, setSecondsLeft] = useState(60);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasTimedOutRef = useRef(false);

  useEffect(() => {
    if (open) {
      setSecondsLeft(60);
      hasTimedOutRef.current = false;
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          // Timer hit 0 — trigger auto-forfeit for opponent
          if (!hasTimedOutRef.current && onOpponentAfkTimeout) {
            hasTimedOutRef.current = true;
            onOpponentAfkTimeout();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open, onOpponentAfkTimeout]);

  const progress = secondsLeft / 60;
  const isLow = secondsLeft <= 15;
  const isCritical = secondsLeft <= 5;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="mx-4 w-full max-w-sm rounded-2xl border border-amber-500/40 bg-slate-900/95 p-6 shadow-2xl shadow-amber-500/10"
          >
            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className={`rounded-full p-4 ${isCritical ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
                <UserX className={`w-10 h-10 ${isCritical ? 'text-red-400' : 'text-amber-400'}`} />
              </div>
            </div>

            {/* Title */}
            <h3 className="text-center text-xl font-bold text-white mb-1">
              <span className="text-amber-400">{opponentName}</span> may be away...
            </h3>
            <p className="text-center text-sm text-slate-400 mb-5">
              {secondsLeft > 0
                ? 'Waiting for them to come back. If they don\'t return, you\'ll win by forfeit.'
                : 'Opponent didn\'t return in time!'}
            </p>

            {/* Countdown circle */}
            <div className="flex justify-center mb-5">
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    className="text-slate-700"
                  />
                  <circle
                    cx="50" cy="50" r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 42}`}
                    strokeDashoffset={`${2 * Math.PI * 42 * (1 - progress)}`}
                    className={`transition-all duration-1000 ${isCritical ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-amber-400'}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-2xl font-black font-mono ${isCritical ? 'text-red-400' : 'text-amber-300'}`}>
                    {secondsLeft}
                  </span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">seconds</span>
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-slate-700 overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${isCritical ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-amber-400'}`}
                initial={{ width: '100%' }}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
