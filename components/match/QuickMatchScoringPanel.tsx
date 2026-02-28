'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Undo2, Trash2, Target } from 'lucide-react';
import { SegmentKeypad } from './SegmentKeypad';
import { getCheckoutSuggestion } from '@/lib/checkout-helper';

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
  onMiss: () => void;
  onBust: () => void;
  currentDarts: any[];
  onDartClick: (type: 'single' | 'double' | 'triple' | 'bull', number: number) => void;
  onUndoDart: () => void;
  onClearVisit: () => void;
  submitting: boolean;
  currentRemaining?: number;
}

export function QuickMatchScoringPanel({
  scoreInput,
  onScoreInputChange,
  onTypeScoreSubmit,
  onSubmitVisit,
  onMiss,
  onBust,
  currentDarts,
  onDartClick,
  onUndoDart,
  onClearVisit,
  submitting,
  currentRemaining,
}: QuickMatchScoringPanelProps) {
  const [mode, setMode] = useState<'single' | 'double' | 'triple' | 'bull'>('single');

  const visitTotal = currentDarts.reduce((sum, dart) => sum + dart.value, 0);

  // Get checkout suggestion if remaining <= 170
  const checkout = currentRemaining && currentRemaining <= 170 ? getCheckoutSuggestion(currentRemaining) : null;

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

  const getModeButtonClass = (currentMode: typeof mode, isActive: boolean) => {
    const base = 'transition-all';
    if (currentMode === 'single') {
      return `${base} ${isActive ? 'bg-blue-700/60 font-bold text-white' : 'bg-blue-900/20 font-medium text-gray-300'}`;
    } else if (currentMode === 'double') {
      return `${base} ${isActive ? 'bg-emerald-700/60 font-bold text-white' : 'bg-emerald-900/20 font-medium text-gray-300'}`;
    } else if (currentMode === 'triple') {
      return `${base} ${isActive ? 'bg-red-700/60 font-bold text-white' : 'bg-red-900/20 font-medium text-gray-300'}`;
    } else {
      return `${base} ${isActive ? 'bg-purple-700/60 font-bold text-white' : 'bg-purple-900/20 font-medium text-gray-300'}`;
    }
  };

  return (
    <div className="flex flex-col h-full space-y-2">
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
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 sm:px-6 h-12"
          >
            Submit
          </Button>
        </div>
      </div>

      {/* Current Visit and Checkout Helper */}
      <div className="space-y-2">
        <div className="bg-slate-800/50 border border-white/10 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Current Visit</span>
            <span className="text-xl font-bold text-emerald-400">{visitTotal}</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex-1 flex space-x-1.5">
              {currentDarts.map((dart, idx) => (
                <div
                  key={idx}
                  className="flex-1 bg-slate-700/50 border border-white/10 rounded px-2 py-1.5 text-center"
                >
                  <span className="text-base font-bold text-white">{getDartLabel(dart)}</span>
                </div>
              ))}
              {[...Array(3 - currentDarts.length)].map((_, idx) => (
                <div
                  key={`empty-${idx}`}
                  className="flex-1 bg-slate-900/50 border border-white/5 rounded px-2 py-1.5 text-center"
                >
                  <span className="text-base text-gray-600">-</span>
                </div>
              ))}
            </div>
            <Button
              onClick={onUndoDart}
              disabled={currentDarts.length === 0}
              variant="outline"
              size="sm"
              className="border-white/10 text-white hover:bg-white/5 h-9 px-2.5"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </Button>
            <Button
              onClick={onClearVisit}
              disabled={currentDarts.length === 0}
              variant="outline"
              size="sm"
              className="border-white/10 text-white hover:bg-white/5 h-9 px-2.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Checkout Helper */}
        {checkout && (
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-2">
            <div className="flex items-center space-x-2">
              <Target className="w-4 h-4 text-blue-400" />
              <div className="flex-1">
                <span className="text-xs font-semibold text-blue-300 uppercase tracking-wide">Checkout</span>
                <p className={`text-sm font-bold mt-0.5 ${checkout.label === 'No checkout' ? 'text-gray-400' : 'text-blue-200'}`}>
                  {checkout.label}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mode Tabs */}
      <Tabs value={mode} onValueChange={(val) => setMode(val as typeof mode)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 bg-slate-900/50 border border-white/10 h-10 p-1 gap-1">
          <TabsTrigger
            value="single"
            className={`${getModeButtonClass('single', mode === 'single')} text-sm rounded`}
          >
            Singles
          </TabsTrigger>
          <TabsTrigger
            value="double"
            className={`${getModeButtonClass('double', mode === 'double')} text-sm rounded`}
          >
            Doubles
          </TabsTrigger>
          <TabsTrigger
            value="triple"
            className={`${getModeButtonClass('triple', mode === 'triple')} text-sm rounded`}
          >
            Trebles
          </TabsTrigger>
          <TabsTrigger
            value="bull"
            className={`${getModeButtonClass('bull', mode === 'bull')} text-sm rounded`}
          >
            Bulls
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Segment Keypad */}
      <div className="flex-1 overflow-hidden min-h-0 bg-slate-800/30 border border-white/10 rounded-lg">
        <SegmentKeypad
          mode={mode}
          onSegmentClick={handleSegmentClick}
          disabled={submitting || currentDarts.length >= 3}
        />
      </div>

      {/* Action Buttons: Miss, Bust, Submit Visit */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Button
          onClick={onMiss}
          disabled={submitting || currentDarts.length >= 3}
          variant="outline"
          className="border-white/10 text-white hover:bg-white/5 font-bold h-10 text-base"
        >
          Miss
        </Button>
        <Button
          onClick={onBust}
          disabled={submitting}
          className="bg-red-600 hover:bg-red-700 text-white font-bold h-10 text-base"
        >
          Bust
        </Button>
        <Button
          onClick={onSubmitVisit}
          disabled={submitting || currentDarts.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-10 text-base"
        >
          {submitting ? 'Submitting...' : 'Submit Visit'}
        </Button>
      </div>
    </div>
  );
}
