'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Zap, Edit } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dispatch, SetStateAction } from 'react';

interface Dart {
  type: 'single' | 'double' | 'triple' | 'bull';
  number: number;
  value: number;
}

interface Visit {
  id: string;
  score: number;
  by: string;
  label: string;
  turnNumberInLeg: number;
  remainingAfter: number;
  isBust?: boolean;
  isCheckout?: boolean;
}

interface MatchTurnPanelProps {
  isMyTurn: boolean;
  scoreInput: string;
  setScoreInput: (value: string) => void;
  inputModeError: string;
  setInputModeError: (value: string) => void;
  handleInputScoreSubmit: (score: number) => void;
  submitting: boolean;
  isOnCheckout: boolean;
  myRemaining: number;
  checkoutOptions: any[];
  currentVisit: Dart[];
  getDartLabel: (dart: Dart) => string;
  visitTotal: number;
  dartboardGroup: string;
  setDartboardGroup: Dispatch<SetStateAction<'singles' | 'doubles' | 'triples' | 'bulls'>>;
  handleDartClick: (type: 'singles' | 'doubles' | 'triples' | 'bulls', number: number) => void;
  handleClearVisit: () => void;
  handleSubmitVisit: () => void;
  handleBust: () => void;
  visitHistory: Visit[];
  handleEditVisit?: (visit: Visit) => void;
}

export function MatchTurnPanel({
  isMyTurn,
  scoreInput,
  setScoreInput,
  inputModeError,
  setInputModeError,
  handleInputScoreSubmit,
  submitting,
  isOnCheckout,
  myRemaining,
  checkoutOptions,
  currentVisit,
  getDartLabel,
  visitTotal,
  dartboardGroup,
  setDartboardGroup,
  handleDartClick,
  handleClearVisit,
  handleSubmitVisit,
  handleBust,
  visitHistory,
  handleEditVisit,
}: MatchTurnPanelProps) {
  if (isMyTurn) {
    return (
      <Card className="bg-slate-900/50 border-white/10 p-4 h-full flex flex-col overflow-hidden">
        <div className="space-y-3 flex-1 flex flex-col min-h-0">
          {/* Type Score Input */}
          <div>
            <label className="text-sm text-gray-300 mb-2 block font-medium">TYPE SCORE</label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min="0"
                max="180"
                value={scoreInput}
                onChange={(e) => {
                  setScoreInput(e.target.value);
                  setInputModeError('');
                }}
                placeholder="0–180"
                className="flex-1 h-12 bg-white/5 border-white/10 text-white text-lg"
                disabled={!isMyTurn || submitting}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && scoreInput) {
                    const score = parseInt(scoreInput);
                    if (score >= 0 && score <= 180) {
                      handleInputScoreSubmit(score);
                      setScoreInput('');
                    }
                  }
                }}
              />
              <Button
                onClick={() => {
                  if (scoreInput) {
                    const score = parseInt(scoreInput);
                    if (score >= 0 && score <= 180) {
                      handleInputScoreSubmit(score);
                      setScoreInput('');
                    }
                  }
                }}
                disabled={!scoreInput || parseInt(scoreInput) < 0 || parseInt(scoreInput) > 180 || !isMyTurn || submitting}
                className="bg-emerald-500 hover:bg-emerald-600 text-white h-12 px-6 text-sm font-semibold"
              >
                Submit
              </Button>
            </div>
            {inputModeError && (
              <p className="text-red-400 text-xs mt-2">{inputModeError}</p>
            )}
          </div>

          {/* Checkout Indicator */}
          {isOnCheckout && (
            checkoutOptions && checkoutOptions.length > 0 && checkoutOptions[0]?.description ? (
              <Card className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500/30 p-2">
                <div className="flex items-center space-x-2 mb-1">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-semibold text-white">CHECKOUT AVAILABLE</h4>
                  <span className="text-amber-400 font-bold text-base ml-auto">{myRemaining}</span>
                </div>
                <div className="text-amber-300 text-xs font-semibold">
                  {checkoutOptions[0].description}
                </div>
              </Card>
            ) : (
              <Card className="bg-gradient-to-br from-gray-500/20 to-slate-500/20 border-gray-500/30 p-2">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-gray-400" />
                  <h4 className="text-xs font-semibold text-white">CHECKOUT NOT POSSIBLE</h4>
                  <span className="text-gray-400 font-bold text-base ml-auto">{myRemaining}</span>
                </div>
              </Card>
            )
          )}

          {/* Current Visit */}
          <Card className="bg-emerald-500/10 border-emerald-500/30 p-2">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-xs font-semibold text-emerald-400">Current Visit</h4>
              <span className="text-emerald-400 font-bold text-sm">Total: {visitTotal}</span>
            </div>
            <div className="flex items-center space-x-1.5">
              {currentVisit.map((dart, idx) => (
                <Badge key={idx} className="bg-emerald-500/20 text-emerald-300 border-emerald-500/50 text-xs py-0.5">
                  {getDartLabel(dart)} ({dart.value})
                </Badge>
              ))}
              {[...Array(3 - currentVisit.length)].map((_, idx) => (
                <div key={idx} className="w-14 h-5 border-2 border-dashed border-gray-600 rounded"></div>
              ))}
            </div>
          </Card>

          {/* Scoring Buttons */}
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <Tabs value={dartboardGroup} onValueChange={(value) => setDartboardGroup(value as any)} className="mb-2">
              <TabsList className="grid w-full grid-cols-4 bg-slate-800/50">
                <TabsTrigger value="singles" className="text-xs" disabled={!isMyTurn || submitting}>Singles</TabsTrigger>
                <TabsTrigger value="doubles" className="text-xs" disabled={!isMyTurn || submitting}>Doubles</TabsTrigger>
                <TabsTrigger value="triples" className="text-xs" disabled={!isMyTurn || submitting}>Trebles</TabsTrigger>
                <TabsTrigger value="bulls" className="text-xs" disabled={!isMyTurn || submitting}>Bulls</TabsTrigger>
              </TabsList>
            </Tabs>

            {dartboardGroup !== 'bulls' && (
              <div className="grid grid-cols-5 gap-2 mb-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((num) => (
                  <Button
                    key={num}
                    onClick={() => handleDartClick(dartboardGroup as any, num)}
                    disabled={!isMyTurn || submitting || currentVisit.length >= 3}
                    variant="outline"
                    className="aspect-square text-lg font-extrabold border-white/10 text-white hover:bg-emerald-500/20 disabled:opacity-50 rounded"
                  >
                    {num}
                  </Button>
                ))}
              </div>
            )}

            {dartboardGroup === 'bulls' && (
              <div className="grid grid-cols-2 gap-3 mb-3">
                <Button
                  onClick={() => handleDartClick('bulls', 25)}
                  disabled={!isMyTurn || submitting || currentVisit.length >= 3}
                  variant="outline"
                  className="h-16 text-lg font-extrabold border-white/10 text-white hover:bg-emerald-500/20 rounded"
                >
                  Single Bull (25)
                </Button>
                <Button
                  onClick={() => handleDartClick('bulls', 50)}
                  disabled={!isMyTurn || submitting || currentVisit.length >= 3}
                  variant="outline"
                  className="h-16 text-lg font-extrabold border-white/10 text-white hover:bg-emerald-500/20 rounded"
                >
                  Double Bull (50)
                </Button>
              </div>
            )}

            <div className="flex items-center space-x-2 mt-auto pt-2">
              <Button
                onClick={handleClearVisit}
                disabled={!isMyTurn || submitting || currentVisit.length === 0}
                variant="outline"
                size="sm"
                className="border-white/10 text-white hover:bg-white/5 flex-1"
              >
                Clear
              </Button>
              <Button
                onClick={handleSubmitVisit}
                disabled={!isMyTurn || submitting || currentVisit.length === 0}
                className="bg-emerald-500 hover:bg-emerald-600 text-white flex-1"
                size="sm"
              >
                Submit Visit
              </Button>
              <Button
                onClick={handleBust}
                disabled={!isMyTurn || submitting}
                variant="outline"
                size="sm"
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 flex-1"
              >
                Bust
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-white/10 p-4 h-full flex flex-col overflow-hidden">
      <h3 className="text-lg font-semibold text-white mb-3">Visit History</h3>
      <div className="flex-1 overflow-y-auto pr-2 min-h-0">
        <div className="space-y-2">
          {visitHistory.slice().reverse().map((visit) => {
            const isMyVisit = visit.by === 'you';
            return (
              <div
                key={visit.id}
                className={`flex items-center justify-between text-sm p-2 rounded ${
                  isMyVisit
                    ? 'bg-teal-500/5 border-l-2 border-l-teal-400/60'
                    : 'bg-slate-700/20 border-l-2 border-l-slate-500/60'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1 py-0 ${
                      isMyVisit
                        ? 'border-teal-400/40 text-teal-300'
                        : 'border-slate-500/50 text-slate-300'
                    }`}
                  >
                    {visit.label}
                  </Badge>
                  <span className="text-gray-500 text-xs">
                    #{visit.turnNumberInLeg}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  {visit.isBust && (
                    <Badge variant="outline" className="border-red-500/30 text-red-400 text-xs">
                      BUST
                    </Badge>
                  )}
                  {visit.isCheckout && (
                    <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 text-xs">
                      CHECKOUT
                    </Badge>
                  )}
                  <span className="text-white font-semibold">{visit.score}</span>
                  <span className="text-gray-500">→</span>
                  <span className="text-gray-400">{visit.remainingAfter}</span>
                  {isMyVisit && !visit.isCheckout && handleEditVisit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditVisit(visit)}
                      className="h-6 w-6 p-0 hover:bg-teal-500/10 text-teal-400 hover:text-teal-300"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {visitHistory.length === 0 && (
            <p className="text-gray-500 text-center py-8 text-sm">No visits yet</p>
          )}
        </div>
      </div>
    </Card>
  );
}
