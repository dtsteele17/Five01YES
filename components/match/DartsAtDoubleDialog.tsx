'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DartsAtDoubleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (darts: number) => void;
  maxDarts: number;
}

export function DartsAtDoubleDialog({
  isOpen,
  onClose,
  onSelect,
  maxDarts,
}: DartsAtDoubleDialogProps) {
  const options = Array.from({ length: maxDarts + 1 }, (_, i) => i);

  const handleSelect = (darts: number) => {
    onSelect(darts);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl">Darts at Double</DialogTitle>
          <DialogDescription className="text-gray-400">
            How many darts did you throw at a double during this visit?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-3 py-4">
          {options.map((num) => (
            <Button
              key={num}
              onClick={() => handleSelect(num)}
              className="h-16 text-2xl font-bold bg-slate-800 hover:bg-slate-700 border border-white/10"
            >
              {num}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
