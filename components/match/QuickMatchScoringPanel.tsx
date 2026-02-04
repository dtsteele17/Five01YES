'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Target } from 'lucide-react';

interface QuickMatchScoringPanelProps {
  scoreInput: string;
  onScoreInputChange: (value: string) => void;
  onSubmit: () => void;
  currentDarts: any[];
  onDartClick: (type: 'single' | 'double' | 'triple' | 'bull', number: number) => void;
  onUndoDart: () => void;
  onClearVisit: () => void;
  submitting?: boolean;
}

export function QuickMatchScoringPanel({
  scoreInput,
  onScoreInputChange,
  onSubmit,
  currentDarts,
  onDartClick,
  onUndoDart,
  onClearVisit,
  submitting = false,
}: QuickMatchScoringPanelProps) {
  const [dartType, setDartType] = useState<'single' | 'double' | 'triple' | 'bull'>('single');

  const currentVisitScore = currentDarts.reduce((sum, d) => sum + d.value, 0);

  const handleNumberClick = (number: number) => {
    onDartClick(dartType, number);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="space-y-3 flex-1 flex flex-col min-h-0">
        <div className="flex items-center space-x-2">
          <Input
            type="number"
            placeholder="Type score (0-180)"
            value={scoreInput}
            onChange={(e) => onScoreInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && scoreInput) {
                onSubmit();
              }
            }}
            className="flex-1 bg-slate-800/50 border-white/10 text-white text-lg h-12"
            min="0"
            max="180"
          />
          <Button
            onClick={onSubmit}
            disabled={!scoreInput || submitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-12 px-6"
          >
            Submit
          </Button>
        </div>

        <div className="bg-slate-800/30 rounded-lg p-3 border border-white/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">Current Visit</span>
            <span className="text-xl font-bold text-emerald-400">{currentVisitScore}</span>
          </div>
          <div className="flex items-center space-x-2">
            {currentDarts.map((dart, idx) => (
              <div
                key={idx}
                className="flex-1 text-center py-2 rounded bg-slate-700/50 border border-white/10"
              >
                <span className="text-sm font-semibold text-white">
                  {dart.type === 'bull' && dart.number === 25 ? 'Bull' : ''}
                  {dart.type === 'bull' && dart.number === 50 ? 'DBull' : ''}
                  {dart.type === 'single' && dart.number !== 25 && dart.number !== 50 ? dart.number : ''}
                  {dart.type === 'double' && dart.number !== 25 ? `D${dart.number}` : ''}
                  {dart.type === 'triple' ? `T${dart.number}` : ''}
                </span>
              </div>
            ))}
            {[...Array(3 - currentDarts.length)].map((_, idx) => (
              <div
                key={`empty-${idx}`}
                className="flex-1 text-center py-2 rounded bg-slate-800/30 border border-white/5"
              >
                <span className="text-sm text-gray-600">-</span>
              </div>
            ))}
          </div>
        </div>

        <Tabs value={dartType} onValueChange={(v) => setDartType(v as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-slate-800/50">
            <TabsTrigger value="single" className="text-sm font-medium">Singles</TabsTrigger>
            <TabsTrigger value="double" className="text-sm font-medium">Doubles</TabsTrigger>
            <TabsTrigger value="triple" className="text-sm font-medium">Trebles</TabsTrigger>
            <TabsTrigger value="bull" className="text-sm font-medium">Bulls</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-5 gap-2">
            {dartType === 'bull' ? (
              <>
                <Button
                  onClick={() => handleNumberClick(25)}
                  className="h-16 bg-slate-700/50 hover:bg-slate-600/50 text-white border border-white/10 text-xl font-bold"
                >
                  Bull
                </Button>
                <Button
                  onClick={() => handleNumberClick(50)}
                  className="h-16 bg-slate-700/50 hover:bg-slate-600/50 text-white border border-white/10 text-xl font-bold"
                >
                  DBull
                </Button>
              </>
            ) : (
              [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5].map((num) => (
                <Button
                  key={num}
                  onClick={() => handleNumberClick(num)}
                  disabled={currentDarts.length >= 3}
                  className="h-16 bg-slate-700/50 hover:bg-slate-600/50 text-white border border-white/10 text-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {num}
                </Button>
              ))
            )}
          </div>

          {dartType === 'bull' && (
            <Button
              onClick={() => handleNumberClick(0)}
              disabled={currentDarts.length >= 3}
              className="w-full h-16 mt-2 bg-slate-700/50 hover:bg-slate-600/50 text-white border border-white/10 text-xl font-bold"
            >
              Miss
            </Button>
          )}
        </div>

        <div className="flex space-x-2 pt-2 border-t border-white/5">
          <Button
            onClick={onUndoDart}
            disabled={currentDarts.length === 0}
            variant="outline"
            className="flex-1 border-white/10 text-white hover:bg-white/5 h-11"
          >
            Undo Dart
          </Button>
          <Button
            onClick={onClearVisit}
            disabled={currentDarts.length === 0}
            variant="outline"
            className="flex-1 border-white/10 text-white hover:bg-white/5 h-11"
          >
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}
