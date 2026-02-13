'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Target, TrendingUp, X, ChevronRight, Darts } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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

// Number grid layout like a dartboard
const NUMBER_GRID = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

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
  const [showDartDetails, setShowDartDetails] = useState(false);

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
    setShowDartDetails(false);
  };

  const handleRemoveLastDart = () => {
    setCurrentDarts(currentDarts.slice(0, -1));
  };

  const handleSubmitVisit = () => {
    if (currentDarts.length === 0) return;
    onVisitComplete(currentDarts);
    setCurrentDarts([]);
    setSelectedNumber('');
    setSelectedType('');
    setShowDartDetails(false);
  };

  const handleNumberSelect = (num: number) => {
    setSelectedNumber(num.toString());
    setShowDartDetails(true);
  };

  const handleTypeSelect = (type: string) => {
    setSelectedType(type);
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

  const getTargetNumber = (target: number | 'bull') => {
    if (target === 'bull') return 'BULL';
    return target.toString();
  };

  const isNumberSelectable = (num: number) => {
    // In ATC, you can only hit the current target or miss
    // But we'll allow any number to be selected for flexibility
    return true;
  };

  const getDartColor = (dart: ATCDart, index: number) => {
    if (dart.hit) {
      return 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/30';
    }
    return 'bg-red-500/80 border-red-400 text-white shadow-lg shadow-red-500/20';
  };

  return (
    <div className="space-y-4">
      {/* Player Cards - Compact Top Bar */}
      <div className="grid grid-cols-2 gap-3">
        {/* Player 1 */}
        <motion.div
          initial={false}
          animate={{
            scale: currentPlayer === 1 ? 1.02 : 1,
            opacity: currentPlayer === 1 ? 1 : 0.7,
          }}
          className={`relative overflow-hidden rounded-2xl p-4 ${
            currentPlayer === 1
              ? 'bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-slate-900/50 border-2 border-emerald-500/50'
              : 'bg-slate-900/50 border border-white/10'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                currentPlayer === 1 ? 'bg-emerald-500 text-white' : 'bg-white/10 text-gray-400'
              }`}>
                {player1.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-white">{player1.name}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>{player1.visits.length} visits</span>
                  <span>•</span>
                  <span>{player1.visits.reduce((sum, v) => sum + v.darts.length, 0)} darts</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-black ${currentPlayer === 1 ? 'text-emerald-400' : 'text-gray-400'}`}>
                {getTargetNumber(player1.currentTarget)}
              </div>
              {currentPlayer === 1 && (
                <Badge className="bg-emerald-500 text-white text-xs">
                  Your Turn
                </Badge>
              )}
            </div>
          </div>
          {/* Progress Bar */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full bg-emerald-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${calculateProgress(player1.currentTarget)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </motion.div>

        {/* Player 2 */}
        <motion.div
          initial={false}
          animate={{
            scale: currentPlayer === 2 ? 1.02 : 1,
            opacity: currentPlayer === 2 ? 1 : 0.7,
          }}
          className={`relative overflow-hidden rounded-2xl p-4 ${
            currentPlayer === 2
              ? 'bg-gradient-to-br from-blue-500/20 via-blue-500/10 to-slate-900/50 border-2 border-blue-500/50'
              : 'bg-slate-900/50 border border-white/10'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                currentPlayer === 2 ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400'
              }`}>
                {player2.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-white">{player2.name}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span>{player2.visits.length} visits</span>
                  <span>•</span>
                  <span>{player2.visits.reduce((sum, v) => sum + v.darts.length, 0)} darts</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-3xl font-black ${currentPlayer === 2 ? 'text-blue-400' : 'text-gray-400'}`}>
                {getTargetNumber(player2.currentTarget)}
              </div>
              {currentPlayer === 2 && (
                <Badge className="bg-blue-500 text-white text-xs">
                  Their Turn
                </Badge>
              )}
            </div>
          </div>
          {/* Progress Bar */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full bg-blue-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${calculateProgress(player2.currentTarget)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </motion.div>
      </div>

      {/* Main Game Area */}
      <div className="grid lg:grid-cols-12 gap-4">
        {/* Left: Dart Selection */}
        <div className="lg:col-span-7 space-y-3">
          {/* Current Target Display */}
          <Card className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 backdrop-blur-sm border border-white/10 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Current Target</p>
                <motion.div
                  key={currentTarget.toString()}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-5xl font-black text-white"
                >
                  {currentTarget === 'bull' ? (
                    <span className="text-amber-400">BULL</span>
                  ) : (
                    <span className="text-emerald-400">{currentTarget}</span>
                  )}
                </motion.div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 mb-1">Progress</p>
                <div className="text-sm text-gray-400">
                  {initialTarget} → {finalTarget === 'bull' ? 'Bull' : finalTarget}
                </div>
              </div>
            </div>
          </Card>

          {/* Number Pad */}
          <Card className="bg-slate-900/50 backdrop-blur-sm border border-white/10 p-4">
            <div className="grid grid-cols-5 gap-2">
              {NUMBER_GRID.map((num) => {
                const isTarget = currentTarget === num;
                const isSelected = selectedNumber === num.toString();
                const isHit = currentDarts.some(d => d.number === num && d.hit);

                return (
                  <motion.button
                    key={num}
                    onClick={() => handleNumberSelect(num)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`
                      relative aspect-square rounded-xl font-bold text-lg transition-all
                      ${isTarget
                        ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900'
                        : isSelected
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                        : isHit
                        ? 'bg-emerald-500/30 text-emerald-400 border border-emerald-500/50'
                        : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                      }
                    `}
                  >
                    {num}
                    {isTarget && (
                      <motion.div
                        layoutId="target-indicator"
                        className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full"
                      />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Bull Option (if applicable) */}
            {currentTarget === 'bull' && (
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={() => {
                    setSelectedType('single-bull');
                    setShowDartDetails(true);
                  }}
                  className="flex-1 bg-amber-500/20 border-amber-500/50 text-amber-400 hover:bg-amber-500/30"
                >
                  Single Bull
                </Button>
                <Button
                  onClick={() => {
                    setSelectedType('double-bull');
                    setShowDartDetails(true);
                  }}
                  className="flex-1 bg-amber-500/20 border-amber-500/50 text-amber-400 hover:bg-amber-500/30"
                >
                  Double Bull
                </Button>
              </div>
            )}
          </Card>

          {/* Type Selection (shown after number selected) */}
          <AnimatePresence>
            {showDartDetails && selectedNumber && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <Card className="bg-slate-900/50 backdrop-blur-sm border border-white/10 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-400">Dart {currentDarts.length + 1}:</span>
                    <span className="text-xl font-bold text-white">{selectedNumber}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { type: 'single', label: 'Single', color: 'bg-blue-500' },
                      { type: 'double', label: 'Double', color: 'bg-red-500' },
                      { type: 'treble', label: 'Treble', color: 'bg-amber-500' },
                      { type: 'miss', label: 'Miss', color: 'bg-gray-500' },
                    ].map(({ type, label, color }) => (
                      <Button
                        key={type}
                        onClick={() => handleTypeSelect(type)}
                        className={`${color} hover:opacity-90 text-white font-bold py-4`}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Current Darts & Actions */}
        <div className="lg:col-span-5 space-y-3">
          {/* Current Darts Display */}
          <Card className="bg-gradient-to-br from-slate-900/80 to-slate-900/40 backdrop-blur-sm border border-white/10 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Darts className="w-5 h-5 text-emerald-400" />
                Current Visit
              </h3>
              <span className="text-sm text-gray-400">{currentDarts.length}/3</span>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              {[0, 1, 2].map((index) => {
                const dart = currentDarts[index];
                return (
                  <motion.div
                    key={index}
                    initial={dart ? { scale: 0.8, opacity: 0 } : {}}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`
                      aspect-square rounded-2xl flex flex-col items-center justify-center
                      border-2 transition-all
                      ${dart
                        ? getDartColor(dart, index) + ' border-current'
                        : 'bg-white/5 border-dashed border-white/20'
                      }
                    `}
                  >
                    {dart ? (
                      <>
                        <span className="text-2xl font-black">
                          {dart.type === 'miss'
                            ? '✗'
                            : dart.number || (dart.type === 'single-bull' ? '25' : '50')}
                        </span>
                        <span className="text-xs font-medium opacity-80 uppercase">
                          {dart.type === 'miss'
                            ? 'Miss'
                            : dart.type === 'single-bull'
                            ? 'SB'
                            : dart.type === 'double-bull'
                            ? 'DB'
                            : dart.type.charAt(0).toUpperCase()}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-500 text-sm">{index + 1}</span>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              {selectedNumber && selectedType && (
                <Button
                  onClick={handleAddDart}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white font-bold py-5 text-lg"
                >
                  <ChevronRight className="w-5 h-5 mr-2" />
                  Add Dart {currentDarts.length + 1}
                </Button>
              )}

              {currentDarts.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    onClick={handleRemoveLastDart}
                    variant="outline"
                    className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 py-4"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Remove Last
                  </Button>
                  <Button
                    onClick={handleSubmitVisit}
                    className="flex-[2] bg-gradient-to-r from-blue-500 to-indigo-500 hover:opacity-90 text-white font-bold py-4"
                  >
                    Submit Visit
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Quick Stats */}
          <Card className="bg-slate-900/30 backdrop-blur-sm border border-white/5 p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-white/5 rounded-xl">
                <p className="text-xs text-gray-500 mb-1">Hit Rate</p>
                <p className="text-xl font-bold text-emerald-400">
                  {((activePlayer.visits.flatMap(v => v.darts).filter(d => d.hit).length / 
                    Math.max(1, activePlayer.visits.flatMap(v => v.darts).length)) * 100).toFixed(0)}%
                </p>
              </div>
              <div className="text-center p-3 bg-white/5 rounded-xl">
                <p className="text-xs text-gray-500 mb-1">Avg/Visit</p>
                <p className="text-xl font-bold text-blue-400">
                  {(activePlayer.visits.reduce((sum, v) => sum + v.progressMade, 0) / 
                    Math.max(1, activePlayer.visits.length)).toFixed(1)}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
