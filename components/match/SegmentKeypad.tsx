'use client';

import { Button } from '@/components/ui/button';

// Constants
export const SEGMENTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

interface SegmentKeypadProps {
  mode: 'single' | 'double' | 'triple' | 'bull';
  onSegmentClick: (segment: number, multiplier: number) => void;
  disabled?: boolean;
}

export function SegmentKeypad({ mode, onSegmentClick, disabled }: SegmentKeypadProps) {
  const getButtonLabel = (segment: number) => {
    const value = segment * (mode === 'single' ? 1 : mode === 'double' ? 2 : 3);

    if (mode === 'single') {
      return (
        <div className="flex flex-col items-center">
          <span className="text-base font-bold">{segment}</span>
        </div>
      );
    } else if (mode === 'double') {
      return (
        <div className="flex flex-col items-center">
          <span className="text-sm font-bold">D{segment}</span>
          <span className="text-[10px] text-gray-400">({value})</span>
        </div>
      );
    } else if (mode === 'triple') {
      return (
        <div className="flex flex-col items-center">
          <span className="text-sm font-bold">T{segment}</span>
          <span className="text-[10px] text-gray-400">({value})</span>
        </div>
      );
    }
  };

  const getModeButtonClass = () => {
    const base = 'hover:bg-white/10 transition-all font-bold text-white border-2';
    if (mode === 'single') {
      return `${base} bg-slate-700/50 border-slate-600/50`;
    } else if (mode === 'double') {
      return `${base} bg-red-900/30 border-red-700/50`;
    } else if (mode === 'triple') {
      return `${base} bg-emerald-900/30 border-emerald-700/50`;
    }
    return base;
  };

  if (mode === 'bull') {
    return (
      <div className="grid grid-cols-2 gap-2 p-3">
        <Button
          onClick={() => onSegmentClick(25, 1)}
          disabled={disabled}
          className="h-16 bg-amber-900/30 border-2 border-amber-700/50 hover:bg-amber-800/40 transition-all"
        >
          <div className="flex flex-col items-center">
            <span className="text-base font-bold text-white">Outer Bull</span>
            <span className="text-xs text-gray-300">(25)</span>
          </div>
        </Button>
        <Button
          onClick={() => onSegmentClick(25, 2)}
          disabled={disabled}
          className="h-16 bg-amber-900/30 border-2 border-amber-700/50 hover:bg-amber-800/40 transition-all"
        >
          <div className="flex flex-col items-center">
            <span className="text-base font-bold text-white">Bull</span>
            <span className="text-xs text-gray-300">(50)</span>
          </div>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-1.5 p-3">
      {SEGMENTS.map((segment) => (
        <Button
          key={segment}
          onClick={() => onSegmentClick(segment, mode === 'single' ? 1 : mode === 'double' ? 2 : 3)}
          disabled={disabled}
          className={`h-11 ${getModeButtonClass()}`}
        >
          {getButtonLabel(segment)}
        </Button>
      ))}
    </div>
  );
}
