'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Target, TrendingUp, X } from 'lucide-react';
import {
  ATCSettings,
  ATCPlayerState,
  ATCDart,
  processDart,
  getFinalTarget,
  getInitialTarget,
} from '@/lib/atc-logic';

interface ATCScoringProps {
  player1: ATCPlayerState;
  player2: ATCPlayerState;
  currentPlayer: 1 | 2;
  settings: ATCSettings;
  onVisitComplete: (darts: ATCDart[]) => void;
  onUndo?: () => void;
}

export function ATCScoring({
  player1,
  player2,
  currentPlayer,
  settings,
  onVisitComplete,
  onUndo,
}: ATCScoringProps) {
  const [currentDarts, setCurrentDarts] = useState<ATCDart[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');

  const activePlayer = currentPlayer === 1 ? player1 : player2;
  const inactivePlayer = currentPlayer === 1 ? player2 : player1;

  const handleAddDart = () => {
    if (currentDarts.length >= 3) return;

    let dart: ATCDart;

    if (selectedType === 'miss') {
      dart = { type: 'miss', hit: false };
    } else if (selectedType === 'single-bull' || selectedType === 'double-bull') {
      dart = { type: selectedType, hit: false };
    } else {
      const num = parseInt(selectedNumber);
      if (!num) return;

      dart = {
        type: selectedType as 'single' | 'double' | 'treble',
        number: num,
        hit: false,
      };
    }

    const result = processDart(dart, activePlayer.currentTarget, settings);
    dart.hit = result.hit;

    setCurrentDarts([...currentDarts, dart]);
    setSelectedNumber('');
    setSelectedType('');
  };

  const handleRemoveLastDart = () => {
    setCurrentDarts(currentDarts.slice(0, -1));
  };

  const handleSubmitVisit = () => {
    if (currentDarts.length === 0) return;
    onVisitComplete(currentDarts);
    setCurrentDarts([]);
  };

  const previewTarget = () => {
    let target = activePlayer.currentTarget;
    for (const dart of currentDarts) {
      const result = processDart(dart, target, settings);
      if (result.hit) {
        target = result.newTarget;
      }
    }
    return target;
  };

  const currentTarget = previewTarget();
  const finalTarget = getFinalTarget(settings);
  const initialTarget = getInitialTarget(settings);

  const calculateProgress = (target: number | 'bull') => {
    if (target === 'bull') return 100;
    const total = settings.endNumber - settings.startNumber + (settings.includeBull ? 1 : 0);
    const current = target - settings.startNumber;
    return (current / total) * 100;
  };

  const numbers = Array.from({ length: 20 }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <Card
          className={`p-6 ${
            currentPlayer === 1
              ? 'bg-emerald-500/20 border-emerald-500/50'
              : 'bg-white/5 border-white/10'
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{player1.name}</h3>
              {currentPlayer === 1 && (
                <Badge className="bg-emerald-500 text-white">Your Turn</Badge>
              )}
            </div>
            <div className="text-3xl font-bold text-white">
              Target: {player1.currentTarget === 'bull' ? 'Bull' : player1.currentTarget}
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${calculateProgress(player1.currentTarget)}%` }}
              />
            </div>
            <div className="text-sm text-gray-400">
              {player1.visits.length} visits • {player1.visits.reduce((sum, v) => sum + v.darts.length, 0)} darts
            </div>
          </div>
        </Card>

        <Card
          className={`p-6 ${
            currentPlayer === 2
              ? 'bg-blue-500/20 border-blue-500/50'
              : 'bg-white/5 border-white/10'
          }`}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{player2.name}</h3>
              {currentPlayer === 2 && (
                <Badge className="bg-blue-500 text-white">Their Turn</Badge>
              )}
            </div>
            <div className="text-3xl font-bold text-white">
              Target: {player2.currentTarget === 'bull' ? 'Bull' : player2.currentTarget}
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${calculateProgress(player2.currentTarget)}%` }}
              />
            </div>
            <div className="text-sm text-gray-400">
              {player2.visits.length} visits • {player2.visits.reduce((sum, v) => sum + v.darts.length, 0)} darts
            </div>
          </div>
        </Card>
      </div>

      <Card className="bg-slate-900/50 backdrop-blur-sm border-white/10 p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-white">
              Current Target: {currentTarget === 'bull' ? 'Bull' : currentTarget}
            </h3>
            <div className="flex items-center space-x-2 text-sm text-gray-400">
              <Target className="w-4 h-4" />
              <span>
                Final: {finalTarget === 'bull' ? 'Bull' : finalTarget}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {currentDarts.map((dart, index) => (
              <Badge
                key={index}
                variant={dart.hit ? 'default' : 'outline'}
                className={`${
                  dart.hit
                    ? 'bg-emerald-500 text-white'
                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                } text-sm px-3 py-1`}
              >
                {dart.type === 'miss'
                  ? 'Miss'
                  : dart.type === 'single-bull'
                  ? 'SB'
                  : dart.type === 'double-bull'
                  ? 'DB'
                  : `${dart.type.charAt(0).toUpperCase()}${dart.number}`}
              </Badge>
            ))}
            {currentDarts.length < 3 &&
              Array.from({ length: 3 - currentDarts.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="w-16 h-8 border-2 border-dashed border-white/20 rounded"
                />
              ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-gray-300">Number</label>
              <Select value={selectedNumber} onValueChange={setSelectedNumber}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select number" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10 max-h-60">
                  {numbers.map((num) => (
                    <SelectItem key={num} value={num.toString()}>
                      {num}
                    </SelectItem>
                  ))}
                  {currentTarget === 'bull' && (
                    <>
                      <SelectItem value="single-bull">Single Bull</SelectItem>
                      <SelectItem value="double-bull">Double Bull</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-gray-300">Type</label>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-white/10">
                  <SelectItem value="miss">Miss</SelectItem>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="double">Double</SelectItem>
                  <SelectItem value="treble">Treble</SelectItem>
                  {currentTarget === 'bull' && (
                    <>
                      <SelectItem value="single-bull">Single Bull</SelectItem>
                      <SelectItem value="double-bull">Double Bull</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex space-x-3">
            <Button
              onClick={handleAddDart}
              disabled={
                currentDarts.length >= 3 ||
                (!selectedType && selectedType !== 'miss') ||
                (selectedType !== 'miss' &&
                  selectedType !== 'single-bull' &&
                  selectedType !== 'double-bull' &&
                  !selectedNumber)
              }
              className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              Add Dart ({currentDarts.length}/3)
            </Button>
            {currentDarts.length > 0 && (
              <Button
                onClick={handleRemoveLastDart}
                variant="outline"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {currentDarts.length > 0 && (
            <Button
              onClick={handleSubmitVisit}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white"
              size="lg"
            >
              Submit Visit
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
