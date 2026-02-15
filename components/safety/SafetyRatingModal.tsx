'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SafetyGrade, GRADE_COLORS, GRADE_LABELS, GRADE_TEXT_COLORS } from '@/lib/safety/safetyService';
import { Shield, ThumbsUp, User } from 'lucide-react';

interface SafetyRatingModalProps {
  isOpen: boolean;
  opponentName: string;
  opponentId: string;
  matchId: string;
  onSubmit: (grade: SafetyGrade) => void;
  onSkip: () => void;
}

export function SafetyRatingModal({
  isOpen,
  opponentName,
  onSubmit,
  onSkip
}: SafetyRatingModalProps) {
  const [selectedGrade, setSelectedGrade] = useState<SafetyGrade | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const grades: SafetyGrade[] = ['A', 'B', 'C', 'D', 'E'];

  const handleSubmit = () => {
    if (selectedGrade) {
      onSubmit(selectedGrade);
      setSubmitted(true);
    }
  };

  const handleSkip = () => {
    onSkip();
  };

  if (submitted) {
    return (
      <Dialog open={isOpen}>
        <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center text-emerald-400 flex items-center justify-center gap-2">
              <ThumbsUp className="w-5 h-5" />
              Thank You!
            </DialogTitle>
          </DialogHeader>
          <p className="text-slate-400 text-center text-sm">
            Your rating helps keep the FIVE01 community safe and enjoyable for everyone.
          </p>
          <Button onClick={onSkip} className="w-full bg-blue-600 hover:bg-blue-700">
            Continue
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-2">
            <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center">
              <Shield className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            Rate Your Opponent
          </DialogTitle>
          <DialogDescription className="text-center text-slate-400">
            How was your experience with <span className="text-white font-medium">{opponentName}</span>?
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="flex gap-2 justify-center mb-4">
            {grades.map((grade) => (
              <button
                key={grade}
                onClick={() => setSelectedGrade(grade)}
                className={`
                  w-12 h-12 rounded-lg font-bold text-lg transition-all duration-200
                  ${selectedGrade === grade 
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-110 ' + GRADE_COLORS[grade]
                    : GRADE_COLORS[grade] + ' hover:opacity-80 hover:scale-105'
                  }
                `}
              >
                {grade}
              </button>
            ))}
          </div>

          {selectedGrade && (
            <div className="text-center mb-4">
              <span className={`font-medium ${GRADE_TEXT_COLORS[selectedGrade]}`}>
                {GRADE_LABELS[selectedGrade]}
              </span>
            </div>
          )}

          <div className="flex gap-3">
            <Button
              onClick={handleSubmit}
              disabled={!selectedGrade}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              <ThumbsUp className="w-4 h-4 mr-2" />
              Submit Rating
            </Button>
            <Button
              onClick={handleSkip}
              variant="outline"
              className="border-slate-600 text-slate-400 hover:bg-slate-800"
            >
              Skip
            </Button>
          </div>
        </div>

        <p className="text-xs text-slate-500 text-center">
          Your feedback helps us maintain a safe and friendly gaming environment.
        </p>
      </DialogContent>
    </Dialog>
  );
}
