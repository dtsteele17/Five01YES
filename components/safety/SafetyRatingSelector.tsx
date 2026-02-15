'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SafetyRatingSelectorProps {
  opponentName: string;
  onRate: (rating: 'A' | 'B' | 'C' | 'D' | 'E') => void;
  hasRated?: boolean;
  currentRating?: string;
  className?: string;
}

const RATINGS = [
  {
    letter: 'A',
    label: 'Excellent',
    description: 'Very trustworthy player',
    color: 'bg-emerald-500',
    textColor: 'text-emerald-500',
    borderColor: 'border-emerald-500',
    gradient: 'from-emerald-500 to-emerald-600',
    hoverBg: 'hover:bg-emerald-500/20',
  },
  {
    letter: 'B',
    label: 'Good',
    description: 'Trustworthy player',
    color: 'bg-emerald-400',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-400',
    gradient: 'from-emerald-400 to-emerald-500',
    hoverBg: 'hover:bg-emerald-400/20',
  },
  {
    letter: 'C',
    label: 'Average',
    description: 'Neutral experience',
    color: 'bg-yellow-400',
    textColor: 'text-yellow-400',
    borderColor: 'border-yellow-400',
    gradient: 'from-yellow-400 to-yellow-500',
    hoverBg: 'hover:bg-yellow-400/20',
  },
  {
    letter: 'D',
    label: 'Poor',
    description: 'Some concerns',
    color: 'bg-orange-400',
    textColor: 'text-orange-400',
    borderColor: 'border-orange-400',
    gradient: 'from-orange-400 to-orange-500',
    hoverBg: 'hover:bg-orange-400/20',
  },
  {
    letter: 'E',
    label: 'Unsafe',
    description: 'Avoid this player',
    color: 'bg-red-500',
    textColor: 'text-red-500',
    borderColor: 'border-red-500',
    gradient: 'from-red-500 to-red-600',
    hoverBg: 'hover:bg-red-500/20',
  },
];

export function SafetyRatingSelector({
  opponentName,
  onRate,
  hasRated = false,
  currentRating,
  className,
}: SafetyRatingSelectorProps) {
  const [selected, setSelected] = useState<string | null>(currentRating || null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRate = async (rating: 'A' | 'B' | 'C' | 'D' | 'E') => {
    if (isSubmitting || hasRated) return;
    
    setIsSubmitting(true);
    setSelected(rating);
    
    try {
      await onRate(rating);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (hasRated) {
    const rating = RATINGS.find(r => r.letter === currentRating);
    if (!rating) return null;

    return (
      <div className={cn('p-4 bg-slate-800/50 rounded-xl border border-slate-700', className)}>
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold',
            'bg-gradient-to-br',
            rating.gradient
          )}>
            <Check className="w-5 h-5" />
          </div>
          <div>
            <p className="text-white font-semibold">Rating Submitted</p>
            <p className="text-sm text-slate-400">
              You rated {opponentName} <span className={cn('font-bold', rating.textColor)}>{rating.letter}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2 mb-2">
        <Shield className="w-5 h-5 text-amber-400" />
        <h4 className="text-white font-bold">Rate Player Safety</h4>
      </div>
      
      <p className="text-sm text-slate-400 mb-3">
        How would you rate your experience with {opponentName}?
      </p>

      <div className="flex gap-2">
        {RATINGS.map((rating) => (
          <motion.button
            key={rating.letter}
            onClick={() => handleRate(rating.letter as 'A' | 'B' | 'C' | 'D' | 'E')}
            disabled={isSubmitting}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={cn(
              'relative flex-1 flex flex-col items-center gap-1 p-2 rounded-xl',
              'border-2 transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              selected === rating.letter
                ? cn(rating.borderColor, 'bg-slate-700')
                : 'border-slate-600 hover:border-slate-500',
              rating.hoverBg
            )}
          >
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center text-white font-black text-lg',
                'bg-gradient-to-br shadow-lg',
                rating.gradient,
                selected === rating.letter && 'ring-2 ring-white ring-offset-2 ring-offset-slate-800'
              )}
            >
              {rating.letter}
            </div>
            <span className={cn('text-xs font-semibold', rating.textColor)}>
              {rating.label}
            </span>
          </motion.button>
        ))}
      </div>

      {selected && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-center text-slate-400"
        >
          {RATINGS.find(r => r.letter === selected)?.description}
        </motion.p>
      )}
    </div>
  );
}
