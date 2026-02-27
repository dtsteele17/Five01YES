'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, UserX } from 'lucide-react';

interface OpponentAfkNoticeProps {
  open: boolean;
  opponentName: string;
  onDismiss: () => void;
}

export function OpponentAfkNotice({ open, opponentName, onDismiss }: OpponentAfkNoticeProps) {
  const [secondsLeft, setSecondsLeft] = useState(60);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (open) {
      setSecondsLeft(60);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-slate-800/95 border border-amber-500/30 backdrop-blur-sm shadow-lg">
            <UserX className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-sm text-slate-200">
              <span className="font-semibold text-amber-400">{opponentName}</span> may be away...
            </span>
            <div className="flex items-center gap-1 text-xs font-mono text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full">
              <Clock className="w-3 h-3" />
              {secondsLeft}s
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
