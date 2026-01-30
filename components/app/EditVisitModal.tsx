"use client";

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface EditVisitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitNumber: number;
  originalScore: number;
  onSave: (newScore: number) => void | Promise<void>;
  onValidate?: (newScore: number) => { valid: boolean; error?: string };
}

export default function EditVisitModal({
  open,
  onOpenChange,
  visitNumber,
  originalScore,
  onSave,
  onValidate,
}: EditVisitModalProps) {
  const [score, setScore] = useState(originalScore.toString());
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setScore(originalScore.toString());
      setError('');
      setIsSaving(false);
    }
  }, [open, originalScore]);

  const handleSave = async () => {
    const numericScore = parseInt(score);

    if (isNaN(numericScore)) {
      setError('Please enter a valid number');
      return;
    }

    if (numericScore < 0 || numericScore > 180) {
      setError('Score must be between 0 and 180');
      return;
    }

    if (onValidate) {
      const validation = onValidate(numericScore);
      if (!validation.valid) {
        setError(validation.error || 'Invalid score');
        return;
      }
    }

    setIsSaving(true);
    try {
      await onSave(numericScore);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !error) {
      handleSave();
    }
  };

  const numericScore = parseInt(score);
  const isInvalidInput = isNaN(numericScore) || numericScore < 0 || numericScore > 180;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">Edit Visit</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <p className="text-sm text-slate-400">
              Visit <span className="font-semibold text-white">#{visitNumber}</span>
            </p>
            <p className="text-xs text-slate-500">
              Original score: <span className="text-slate-400 font-medium">{originalScore}</span>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="visit-score" className="text-white">
              Visit Score
            </Label>
            <Input
              id="visit-score"
              type="number"
              min="0"
              max="180"
              value={score}
              onChange={(e) => {
                setScore(e.target.value);
                setError('');
              }}
              onKeyDown={handleKeyDown}
              placeholder="0-180"
              className={`bg-slate-800/50 text-white ${
                error ? 'border-red-500 focus:border-red-500' : 'border-slate-700'
              }`}
              autoFocus
            />
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isInvalidInput || isSaving}
            className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
