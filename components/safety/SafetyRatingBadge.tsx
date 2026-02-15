'use client';

import { SafetyGrade, GRADE_COLORS, GRADE_TEXT_COLORS, GRADE_LABELS } from '@/lib/safety/safetyService';

interface SafetyRatingBadgeProps {
  grade: SafetyGrade | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  totalRatings?: number;
}

export function SafetyRatingBadge({ 
  grade, 
  size = 'md', 
  showLabel = false,
  totalRatings
}: SafetyRatingBadgeProps) {
  if (!grade) {
    return (
      <span className="text-slate-500 text-xs italic">
        No Trust Rating yet
      </span>
    );
  }

  const sizeClasses = {
    xs: 'w-5 h-5 text-[10px]',
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base'
  };

  return (
    <div className="flex items-center gap-2">
      <div 
        className={`
          ${GRADE_COLORS[grade]} 
          ${sizeClasses[size]} 
          rounded-full flex items-center justify-center font-bold
          shadow-lg
        `}
        title={`Safety Rating: ${GRADE_LABELS[grade]}`}
      >
        {grade}
      </div>
      
      {showLabel && (
        <div className="flex flex-col">
          <span className={`font-medium ${GRADE_TEXT_COLORS[grade]} text-sm`}>
            {GRADE_LABELS[grade]}
          </span>
          {totalRatings !== undefined && (
            <span className="text-slate-500 text-xs">
              {totalRatings} rating{totalRatings !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Mini badge for compact lists (leaderboards, etc.)
 */
export function SafetyRatingMini({ grade }: { grade: SafetyGrade | null | undefined }) {
  if (!grade) return null;

  return (
    <span 
      className={`
        ${GRADE_COLORS[grade]} 
        inline-flex items-center justify-center 
        w-5 h-5 rounded text-[10px] font-bold
      `}
    >
      {grade}
    </span>
  );
}

/**
 * Detailed badge with breakdown for profile pages
 */
interface SafetyRatingDetailedProps {
  grade: SafetyGrade | null;
  average: number | null;
  totalRatings: number;
  breakdown?: Record<SafetyGrade, number>;
}

export function SafetyRatingDetailed({ 
  grade, 
  average, 
  totalRatings,
  breakdown 
}: SafetyRatingDetailedProps) {
  if (!grade || !average) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center">
            <span className="text-slate-500 text-lg">-</span>
          </div>
          <div>
            <h3 className="font-bold text-slate-400">Safety Rating</h3>
            <p className="text-slate-500 text-sm">No Trust Rating yet</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
      <div className="flex items-center gap-3 mb-3">
        <div className={`
          ${GRADE_COLORS[grade]} 
          w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg
          shadow-lg
        `}>
          {grade}
        </div>
        <div>
          <h3 className="font-bold text-white">{GRADE_LABELS[grade]}</h3>
          <p className="text-slate-400 text-sm">
            {average.toFixed(1)}/5.0 • {totalRatings} rating{totalRatings !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {breakdown && totalRatings > 0 && (
        <div className="space-y-1.5">
          {(['A', 'B', 'C', 'D', 'E'] as SafetyGrade[]).map((g) => {
            const count = breakdown[g] || 0;
            const percentage = (count / totalRatings) * 100;
            
            return (
              <div key={g} className="flex items-center gap-2">
                <span className={`text-xs font-medium w-4 ${GRADE_TEXT_COLORS[g]}`}>{g}</span>
                <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${GRADE_COLORS[g].split(' ')[0]} transition-all duration-300`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500 w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
