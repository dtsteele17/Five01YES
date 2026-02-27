'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface AfkWarningModalProps {
  open: boolean;
  onStillHere: () => void;
  onAutoForfeit: () => void;
}

export function AfkWarningModal({ open, onStillHere, onAutoForfeit }: AfkWarningModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(60);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasForfeitedRef = useRef(false);

  // Reset when modal opens
  useEffect(() => {
    if (open) {
      setSecondsLeft(60);
      hasForfeitedRef.current = false;
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, [open]);

  // Countdown
  useEffect(() => {
    if (!open) return;

    intervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          if (!hasForfeitedRef.current) {
            hasForfeitedRef.current = true;
            onAutoForfeit();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [open, onAutoForfeit]);

  const isLow = secondsLeft <= 15;
  const isCritical = secondsLeft <= 5;

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="bg-slate-900 border-amber-500/30 max-w-sm">
        <AlertDialogHeader className="text-center">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="mx-auto mb-3 w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center"
          >
            <AlertTriangle className="w-8 h-8 text-amber-400" />
          </motion.div>
          <AlertDialogTitle className="text-xl text-white text-center">
            Are You Still Here?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-slate-300 text-center">
            You haven&apos;t made a move. The match will be forfeited if you don&apos;t respond.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Countdown */}
        <div className="flex justify-center my-4">
          <motion.div
            animate={isCritical ? { scale: [1, 1.08, 1] } : {}}
            transition={isCritical ? { repeat: Infinity, duration: 0.5 } : {}}
            className={`text-4xl font-mono font-bold ${
              isCritical ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-white'
            }`}
          >
            {secondsLeft}s
          </motion.div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-slate-800 rounded-full h-1.5 mb-4">
          <motion.div
            className={`h-1.5 rounded-full ${
              isCritical ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
            }`}
            initial={{ width: '100%' }}
            animate={{ width: `${(secondsLeft / 60) * 100}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>

        <AlertDialogFooter className="sm:justify-center">
          <Button
            onClick={onStillHere}
            size="lg"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg py-6"
          >
            I&apos;m Still Here!
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
