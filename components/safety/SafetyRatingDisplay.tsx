'use client';

import { useEffect, useState, useCallback } from 'react';
import { SafetyGrade, getUserSafetyRating, GRADE_COLORS, GRADE_TEXT_COLORS, GRADE_LABELS } from '@/lib/safety/safetyService';
import { onSafetyRatingUpdated } from '@/lib/safety/safetyEvents';
import { onSafetyRatingUpdated } from '@/lib/safety/safetyEvents';
import { Shield } from 'lucide-react';

interface SafetyRatingDisplayProps {
  userId: string;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
}

export function SafetyRatingDisplay({ 
  userId, 
  size = 'md',
  showTooltip = true 
}: SafetyRatingDisplayProps) {
  const [rating, setRating] = useState<{
    grade: SafetyGrade | null;
    average: number | null;
    totalRatings: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRating = useCallback(async () => {
    setLoading(true);
    const data = await getUserSafetyRating(userId);
    setRating(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchRating();

    // Subscribe to safety rating updates
    const unsubscribe = onSafetyRatingUpdated((updatedUserId) => {
      if (updatedUserId === userId || updatedUserId === 'all') {
        fetchRating();
      }
    });

    return () => unsubscribe();
  }, [userId, fetchRating]);

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-slate-500">
        <Shield className="w-4 h-4" />
        <span className="text-xs">...</span>
      </div>
    );
  }

  if (!rating || !rating.grade) {
    return (
      <div className="flex items-center gap-1.5 text-slate-600">
        <Shield className="w-4 h-4" />
        <span className="text-xs">Unrated</span>
      </div>
    );
  }

  const sizeClasses = {
    sm: 'w-5 h-5 text-[10px]',
    md: 'w-7 h-7 text-xs',
    lg: 'w-9 h-9 text-sm'
  };

  return (
    <div 
      className="flex items-center gap-1.5"
      title={showTooltip ? `Safety Rating: ${GRADE_LABELS[rating.grade]} (${rating.totalRatings} ratings)` : undefined}
    >
      <Shield className={`w-4 h-4 ${GRADE_TEXT_COLORS[rating.grade]}`} />
      <div className={`
        ${GRADE_COLORS[rating.grade]} 
        ${sizeClasses[size]}
        rounded-full flex items-center justify-center font-bold
      `}>
        {rating.grade}
      </div>
    </div>
  );
}

/**
 * Compact display for lists and tables
 */
export function SafetyRatingCompact({ userId }: { userId: string }) {
  const [grade, setGrade] = useState<SafetyGrade | null>(null);

  useEffect(() => {
    const fetchRating = async () => {
      const data = await getUserSafetyRating(userId);
      if (data?.grade) setGrade(data.grade);
    };

    fetchRating();

    // Subscribe to safety rating updates
    const unsubscribe = onSafetyRatingUpdated((updatedUserId) => {
      if (updatedUserId === userId || updatedUserId === 'all') {
        fetchRating();
      }
    });

    return () => unsubscribe();
  }, [userId]);

  if (!grade) return null;

  return (
    <span className={`
      ${GRADE_COLORS[grade]} 
      inline-flex items-center justify-center 
      px-2 py-0.5 rounded text-[10px] font-bold
    `}>
      {grade}
    </span>
  );
}

/**
 * Safety rating with verification badge for lobby join requests
 */
interface SafetyRatingVerifiedProps {
  userId: string;
  showScore?: boolean;
}

export function SafetyRatingVerified({ userId, showScore = true }: SafetyRatingVerifiedProps) {
  const [rating, setRating] = useState<{
    grade: SafetyGrade | null;
    totalRatings: number;
  } | null>(null);

  useEffect(() => {
    const fetchRating = async () => {
      const data = await getUserSafetyRating(userId);
      if (data) {
        setRating({ grade: data.grade, totalRatings: data.totalRatings });
      }
    };

    fetchRating();

    // Subscribe to safety rating updates
    const unsubscribe = onSafetyRatingUpdated((updatedUserId) => {
      if (updatedUserId === userId || updatedUserId === 'all') {
        fetchRating();
      }
    });

    return () => unsubscribe();
  }, [userId]);

  if (!rating || !rating.grade) {
    return (
      <div className="flex items-center gap-1 text-slate-500 text-xs">
        <Shield className="w-3.5 h-3.5" />
        <span>New Player</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Shield className={`w-4 h-4 ${GRADE_TEXT_COLORS[rating.grade]}`} />
      {showScore ? (
        <span className={`
          ${GRADE_COLORS[rating.grade]} 
          px-1.5 py-0.5 rounded text-[10px] font-bold
        `}>
          {rating.grade}
        </span>
      ) : (
        <span className={`text-xs ${GRADE_TEXT_COLORS[rating.grade]}`}>
          {GRADE_LABELS[rating.grade]}
        </span>
      )}
    </div>
  );
}
