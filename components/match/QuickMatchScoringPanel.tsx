'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Undo2, Trash2 } from 'lucide-react';
import { SegmentKeypad } from './SegmentKeypad';

interface Dart {
  segment: number;
  multiplier: number;
  value: number;
}

interface QuickMatchScoringPanelProps {
  scoreInput: string;
  onScoreInputChange: (value: string) => void;
  onTypeScoreSubmit: () => void;
  onSubmitVisit: () => void;
  currentDarts: any[];
  onDartClick: (type: 'single' | 'double' | 'triple' | 'bull', number: number) => void;
  onUndoDart: () => void;
  onClearVisit: () => void;
  submitting: boolean;
}

export function QuickMatchScoringPanel({
  scoreInput,
  onScoreInputChange,
  onTypeScoreSubmit,
  onSubmitVisit,
  currentDarts,
  onDartClick,
  onUndoDart,
  onClearVisit,
  submitting,
}: QuickMatchScoringPanelProps) {
  const [mode, setMode] = useState<'single' | 'double' | 'triple' | 'bull'>('single');

  const visitTotal = currentDarts.reduce((sum, dart) => sum + dart.value, 0);

  const handleSegmentClick = (segment: number, multiplier: number) => {
    const value = segment * multiplier;

    let dartType: 'single' | 'double' | 'triple' | 'bull' = 'single';
    if (segment === 25) {
      dartType = 'bull';
    } else if (multiplier === 2) {
      dartType = 'double';
    } else if (multiplier === 3) {
      dartType = 'triple';
    }

    onDartClick(dartType, segment);
  };

  const getDartLabel = (dart: any) => {
    if (dart.number === 0 && dart.value === 0) {
      return 'MISS';
    }
    if (dart.type === 'bull') {
      return dart.number === 25 ? 'SB' : 'DB';
    }
    const prefix = dart.type === 'single' ? 'S' : dart.type === 'double' ? 'D' : 'T';
    return `${prefix}${dart.number}`;
  };

  const getModeButtonClass = (currentMode: typeof mode) => {
    const base = 'data-[state=active]:bg-white/10 transition-all font-bold';
    if (currentMode === 'single') {
      return `${base} data-[state=active]:bg-slate-600/50`;
    } else if (currentMode === 'double') {
      return `${base} data-[state=active]:bg-red-800/50`;
    } else if (currentMode === 'triple') {
      return `${base} data-[state=active]:bg-emerald-800/50`;
    } else {
      return `${base} data-[state=active]:bg-amber-800/50`;
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Type Score Input */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Type Score (0-180)</label>
        <div className="flex space-x-2">
          <Input
            type="number"
            value={scoreInput}
            onChange={(e) => onScoreInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && scoreInput) {
                onTypeScoreSubmit();
              }
            }}
            placeholder="0-180"
            min="0"
            max="180"
            disabled={submitting}
            className="flex-1 bg-slate-800 border-white/10 text-white text-xl font-bold placeholder:text-gray-600 h-12"
          />
          <Button
            onClick={onTypeScoreSubmit}
            disabled={submitting || !scoreInput}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 h-12"
          >
            Submit
          </Button>
        </div>
      </div>

      {/* Current Visit */}
      <div className="bg-slate-800/50 border border-white/10 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-300 uppercase tracking-wide">Current Visit</span>
          <span className="text-2xl font-bold text-emerald-400">{visitTotal}</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex-1 flex space-x-2">
            {currentDarts.map((dart, idx) => (
              <div
                key={idx}
                className="flex-1 bg-slate-700/50 border border-white/10 rounded px-3 py-2 text-center"
              >
                <span className="text-lg font-bold text-white">{getDartLabel(dart)}</span>
              </div>
            ))}
            {[...Array(3 - currentDarts.length)].map((_, idx) => (
              <div
                key={`empty-${idx}`}
                className="flex-1 bg-slate-900/50 border border-white/5 rounded px-3 py-2 text-center"
              >
                <span className="text-lg text-gray-600">-</span>
              </div>
            ))}
          </div>
          <Button
            onClick={onUndoDart}
            disabled={currentDarts.length === 0}
            variant="outline"
            size="sm"
            className="border-white/10 text-white hover:bg-white/5 h-10 px-3"
          >
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button
            onClick={onClearVisit}
            disabled={currentDarts.length === 0}
            variant="outline"
            size="sm"
            className="border-white/10 text-white hover:bg-white/5 h-10 px-3"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Mode Tabs */}
      <Tabs value={mode} onValueChange={(val) => setMode(val as typeof mode)} className="w-full">
        <TabsList className="grid w-full grid-cols-4 bg-slate-800/50 border border-white/10 h-12">
          <TabsTrigger
            value="single"
            className={`${getModeButtonClass('single')} text-base`}
          >
            Singles
          </TabsTrigger>
          <TabsTrigger
            value="double"
            className={`${getModeButtonClass('double')} text-base`}
          >
            Doubles
          </TabsTrigger>
          <TabsTrigger
            value="triple"
            className={`${getModeButtonClass('triple')} text-base`}
          >
            Trebles
          </TabsTrigger>
          <TabsTrigger
            value="bull"
            className={`${getModeButtonClass('bull')} text-base`}
          >
            Bulls
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Segment Keypad */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-slate-800/30 border border-white/10 rounded-lg">
        <SegmentKeypad
          mode={mode}
          onSegmentClick={handleSegmentClick}
          disabled={submitting || currentDarts.length >= 3}
        />
      </div>

      {/* Submit Visit Button */}
      <Button
        onClick={onSubmitVisit}
        disabled={submitting || currentDarts.length === 0}
        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-12 text-lg"
      >
        {submitting ? 'Submitting...' : 'Submit Visit'}
      </Button>
    </div>
  );
}
