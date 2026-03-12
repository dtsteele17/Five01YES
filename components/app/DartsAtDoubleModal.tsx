'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DartsAtDoubleModalProps {
  isOpen: boolean;
  options: number[];
  isCheckout: boolean;
  onConfirm: (dartsAtDouble: number) => void;
  onCancel: () => void;
}

export function getDartsAtDoubleOptions(startingScore: number): number[] {
  if (startingScore <= 50 && startingScore % 2 === 0) return [0, 1, 2, 3];
  if (startingScore >= 51 && startingScore <= 110) return [0, 1, 2];
  if (startingScore >= 111 && startingScore <= 170) return [0, 1];
  return [0, 1];
}

export function shouldShowDartsAtDoublePopup(startingScore: number, visitScore: number): boolean {
  const remaining = startingScore - visitScore;
  return remaining > 0 && remaining <= 50;
}

export function DartsAtDoubleModal({
  isOpen,
  options,
  isCheckout,
  onConfirm,
  onCancel,
}: DartsAtDoubleModalProps) {
  const [selectedDarts, setSelectedDarts] = useState<number>(0);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setSelectedDarts(0);
      setError('');
    }
  }, [isOpen]);

  const validOptions = isCheckout ? options.filter(opt => opt >= 1) : options;
  const validOptionsRef = useRef(validOptions);
  validOptionsRef.current = validOptions;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const num = parseInt(e.key);
      if (!isNaN(num) && validOptionsRef.current.includes(num)) {
        e.preventDefault();
        onConfirm(num);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isCheckout, onConfirm]);

  const handleConfirm = () => {
    if (isCheckout && selectedDarts === 0) {
      setError('If you checked out, you must have had at least 1 dart at a double.');
      return;
    }
    onConfirm(selectedDarts);
    setSelectedDarts(0);
    setError('');
  };

  const handleCancel = () => {
    setSelectedDarts(0);
    setError('');
    onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Darts at double?</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-4">
            How many darts did you throw at a double this visit?
          </p>
          <div className="flex flex-wrap gap-2">
            {validOptions.map((num) => (
              <Button
                key={num}
                variant={selectedDarts === num ? 'default' : 'outline'}
                onClick={() => {
                  setSelectedDarts(num);
                  setError('');
                }}
                className="w-16 h-16 text-xl"
              >
                {num}
              </Button>
            ))}
          </div>
          {error && (
            <p className="text-sm text-destructive mt-2">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
