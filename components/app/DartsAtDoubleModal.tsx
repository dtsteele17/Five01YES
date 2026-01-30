'use client';

import { useState, useEffect } from 'react';
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
  minDarts: 1 | 2 | 3;
  isCheckout: boolean;
  onConfirm: (dartsAtDouble: number) => void;
  onCancel: () => void;
}

export function DartsAtDoubleModal({
  isOpen,
  minDarts,
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

  const getMaxOptions = () => {
    if (minDarts === 3) return [0, 1];
    if (minDarts === 2) return [0, 1, 2];
    if (minDarts === 1) return [0, 1, 2, 3];
    return [0];
  };

  const handleConfirm = () => {
    if (isCheckout && selectedDarts === 0) {
      setError('If you checked out, you must have had at least 1 dart at a double.');
      return;
    }

    if (isCheckout && minDarts === 3 && selectedDarts !== 1) {
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

  const options = getMaxOptions();
  const validOptions = isCheckout ? options.filter(opt => opt >= 1) : options;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Darts at double?</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-4">
            How many darts did you have at a double (or bull) this visit?
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
