"use client";

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Dart {
  n: number;      // Number (0-25, where 25 = bull)
  mult: string;   // Multiplier: 'S', 'D', 'T', 'SB', 'DB'
}

interface EditVisitWithDartsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: string;
  visitNumber: number;
  originalDarts: Dart[];
  originalScore: number;
  remainingBefore: number;
  isCheckout: boolean;
  doubleOutRequired: boolean;
  onSave: (visitId: string, darts: Dart[], score: number, dartsThrown: number, dartsAtDouble: number) => void | Promise<void>;
  onDelete?: (visitId: string) => void | Promise<void>;
}

export default function EditVisitWithDartsModal({
  open,
  onOpenChange,
  visitId,
  visitNumber,
  originalDarts,
  originalScore,
  remainingBefore,
  isCheckout,
  doubleOutRequired,
  onSave,
  onDelete,
}: EditVisitWithDartsModalProps) {
  const [darts, setDarts] = useState<Dart[]>([]);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      // Initialize with original darts or empty array
      setDarts(originalDarts.length > 0 ? [...originalDarts] : []);
      setError('');
      setIsSaving(false);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [open, originalDarts]);

  const calculateScore = (dartArray: Dart[]): number => {
    return dartArray.reduce((sum, dart) => {
      let value = dart.n;
      if (dart.mult === 'D') value *= 2;
      else if (dart.mult === 'T') value *= 3;
      else if (dart.mult === 'SB') value = 25;
      else if (dart.mult === 'DB') value = 50;
      return sum + value;
    }, 0);
  };

  const currentScore = calculateScore(darts);
  const newRemaining = remainingBefore - currentScore;

  const updateDart = (index: number, field: 'n' | 'mult', value: string) => {
    const newDarts = [...darts];

    if (!newDarts[index]) {
      newDarts[index] = { n: 0, mult: 'S' };
    }

    if (field === 'n') {
      const num = parseInt(value);
      if (!isNaN(num) && num >= 0 && num <= 25) {
        newDarts[index].n = num;
      }
    } else {
      newDarts[index].mult = value;
    }

    setDarts(newDarts);
    setError('');
  };

  const addDart = () => {
    if (darts.length < 3) {
      setDarts([...darts, { n: 0, mult: 'S' }]);
    }
  };

  const removeDart = (index: number) => {
    const newDarts = darts.filter((_, i) => i !== index);
    setDarts(newDarts);
  };

  const validateVisit = (): { valid: boolean; error?: string } => {
    if (darts.length === 0) {
      return { valid: false, error: 'At least one dart is required' };
    }

    // Check score range
    const score = calculateScore(darts);
    if (score < 0 || score > 180) {
      return { valid: false, error: 'Score must be between 0 and 180' };
    }

    // Check if it would checkout (remaining becomes 0)
    const newRem = remainingBefore - score;
    if (newRem === 0) {
      // If double-out required and remaining_before <= 50, validate last dart
      if (doubleOutRequired && remainingBefore <= 50) {
        const lastDart = darts[darts.length - 1];
        if (lastDart.mult !== 'D' && lastDart.mult !== 'DB') {
          return {
            valid: false,
            error: 'Checkout must finish on a double (multiplier = 2)'
          };
        }
      }
    }

    // Check for impossible scores (like left on 1)
    if (newRem === 1) {
      return {
        valid: false,
        error: 'Cannot leave 1 remaining (invalid score)'
      };
    }

    return { valid: true };
  };

  const handleSave = async () => {
    const validation = validateVisit();
    if (!validation.valid) {
      setError(validation.error || 'Invalid visit');
      return;
    }

    // Count darts at double
    const dartsAtDouble = darts.filter(d => d.mult === 'D' || d.mult === 'DB').length;

    setIsSaving(true);
    try {
      await onSave(visitId, darts, currentScore, darts.length, dartsAtDouble);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save');
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(visitId);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Failed to delete');
      setIsDeleting(false);
    }
  };

  const formatDartDisplay = (dart: Dart): string => {
    let display = '';
    if (dart.mult === 'T') display = 'T';
    else if (dart.mult === 'D') display = 'D';
    else if (dart.mult === 'SB') return 'SB';
    else if (dart.mult === 'DB') return 'DB';

    return display + dart.n;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">Edit Visit #{visitNumber}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Original: {originalDarts.map(formatDartDisplay).join(', ') || 'No darts'} = {originalScore}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Score Display */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-400">Remaining Before</p>
                <p className="text-2xl font-bold text-white">{remainingBefore}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-400">Score</p>
                <p className="text-3xl font-bold text-emerald-400">{currentScore}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">New Remaining</p>
                <p className={`text-2xl font-bold ${newRemaining < 0 ? 'text-red-400' : newRemaining === 0 ? 'text-amber-400' : 'text-white'}`}>
                  {newRemaining}
                </p>
              </div>
            </div>
            {newRemaining === 0 && (
              <p className="text-xs text-amber-400 text-center mt-2">CHECKOUT!</p>
            )}
            {newRemaining < 0 && (
              <p className="text-xs text-red-400 text-center mt-2">BUST - Below Zero</p>
            )}
            {newRemaining === 1 && (
              <p className="text-xs text-red-400 text-center mt-2">BUST - Left on 1</p>
            )}
          </div>

          {/* Darts Input */}
          <div className="space-y-3">
            <Label className="text-white">Darts Thrown</Label>
            {darts.map((dart, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-sm text-slate-400 w-16">Dart {index + 1}:</span>

                {/* Number Input */}
                <Input
                  type="number"
                  min="0"
                  max="25"
                  value={dart.n}
                  onChange={(e) => updateDart(index, 'n', e.target.value)}
                  className="bg-slate-800/50 text-white border-slate-700 w-20"
                  placeholder="0-25"
                />

                {/* Multiplier Select */}
                <Select
                  value={dart.mult}
                  onValueChange={(value) => updateDart(index, 'mult', value)}
                >
                  <SelectTrigger className="bg-slate-800/50 text-white border-slate-700 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="S" className="text-white">Single</SelectItem>
                    <SelectItem value="D" className="text-white">Double</SelectItem>
                    <SelectItem value="T" className="text-white">Triple</SelectItem>
                    <SelectItem value="SB" className="text-white">Single Bull</SelectItem>
                    <SelectItem value="DB" className="text-white">Double Bull</SelectItem>
                  </SelectContent>
                </Select>

                {/* Display */}
                <span className="text-white font-mono w-12 text-center">
                  {formatDartDisplay(dart)}
                </span>

                {/* Remove Button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDart(index)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}

            {darts.length < 3 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addDart}
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                + Add Dart
              </Button>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive" className="bg-red-900/20 border-red-500/50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Double-out Warning */}
          {doubleOutRequired && newRemaining === 0 && remainingBefore <= 50 && (
            <Alert className="bg-amber-900/20 border-amber-500/50">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              <AlertDescription className="text-amber-400">
                Double-out required: Last dart must be a double
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {/* Delete Button */}
          {onDelete && !showDeleteConfirm && (
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isSaving || isDeleting}
              className="border-red-500/50 text-red-400 hover:bg-red-500/10 sm:mr-auto"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Visit
            </Button>
          )}

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <>
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="border-slate-700 text-slate-300"
              >
                Cancel Delete
              </Button>
              <Button
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </>
          )}

          {/* Normal Actions */}
          {!showDeleteConfirm && (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving || isDeleting}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={darts.length === 0 || isSaving || isDeleting}
                className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:opacity-90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
