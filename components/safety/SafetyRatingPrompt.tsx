'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SafetyGrade, GRADE_COLORS, GRADE_LABELS, submitRating, hasRatedOpponent } from '@/lib/safety/safetyService';
import { toast } from 'sonner';
import { Shield, CheckCircle2 } from 'lucide-react';

interface SafetyRatingPromptProps {
  matchId: string;
  opponentId: string;
  opponentName: string;
  isOpen: boolean;
  onClose: () => void;
  onRated?: () => void;
}

export function SafetyRatingPrompt({
  matchId,
  opponentId,
  opponentName,
  isOpen,
  onClose,
  onRated
}: SafetyRatingPromptProps) {
  const [selectedGrade, setSelectedGrade] = useState<SafetyGrade | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hasAlreadyRated, setHasAlreadyRated] = useState(false);

  // Check if already rated when opening
  useState(() => {
    if (isOpen && matchId && opponentId) {
      hasRatedOpponent(matchId, opponentId).then(setHasAlreadyRated);
    }
  });

  const handleSubmit = async () => {
    if (!selectedGrade) return;

    setSubmitting(true);
    try {
      const result = await submitRating(matchId, opponentId, selectedGrade);
      if (result.success) {
        setSubmitted(true);
        toast.success(`Rated ${opponentName}: ${GRADE_LABELS[selectedGrade]}`, {
          icon: '🛡️'
        });
        onRated?.();
        // Close after a short delay so they can see the success state
        setTimeout(() => {
          onClose();
          setSubmitted(false);
          setSelectedGrade(null);
        }, 1500);
      } else {
        toast.error(result.error || 'Failed to submit rating');
      }
    } catch (error) {
      toast.error('Failed to submit rating');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    onClose();
    setSelectedGrade(null);
    setSubmitted(false);
  };

  if (hasAlreadyRated) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleSkip}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white text-center flex items-center justify-center gap-2">
            <Shield className="w-6 h-6 text-emerald-400" />
            Rate Your Opponent
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">Rating Submitted!</h3>
            <p className="text-slate-400">Thank you for helping keep the community safe.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-slate-300 text-center">
              How was your experience playing against <span className="font-bold text-white">{opponentName}</span>?
            </p>

            <div className="grid grid-cols-5 gap-2">
              {(['A', 'B', 'C', 'D', 'E'] as SafetyGrade[]).map((grade) => (
                <button
                  key={grade}
                  onClick={() => setSelectedGrade(grade)}
                  disabled={submitting}
                  className={`
                    ${GRADE_COLORS[grade]}
                    ${selectedGrade === grade ? 'ring-4 ring-white/30 scale-110' : 'opacity-70 hover:opacity-100'}
                    w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg
                    transition-all duration-200
                  `}
                  title={GRADE_LABELS[grade]}
                >
                  {grade}
                </button>
              ))}
            </div>

            {selectedGrade && (
              <div className="text-center">
                <p className={`font-bold ${GRADE_COLORS[selectedGrade].split(' ')[0].replace('bg-', 'text-')}`}>
                  {GRADE_LABELS[selectedGrade]}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  {gradeDescriptions[selectedGrade]}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleSkip}
                disabled={submitting}
                className="flex-1 border-slate-600 text-slate-400 hover:text-white hover:bg-slate-800"
              >
                Skip
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!selectedGrade || submitting}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Rating'}
              </Button>
            </div>

            <p className="text-xs text-slate-500 text-center">
              Your rating helps others know what to expect from this player.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const gradeDescriptions: Record<SafetyGrade, string> = {
  A: 'Excellent sportsmanship, would play again',
  B: 'Good experience, no issues',
  C: 'Average experience',
  D: 'Some issues with this player',
  E: 'Poor experience, avoid if possible'
};
