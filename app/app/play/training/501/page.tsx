'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trophy, RotateCcw, Home, X, Check, Bot, BarChart3, Wifi, WifiOff, Edit2, Trash2 } from 'lucide-react';
import { isBust, getLegsToWin } from '@/lib/match-logic';
import { useTraining, BOT_DIFFICULTY_CONFIG } from '@/lib/context/TrainingContext';
import { getStartScore } from '@/lib/game-modes';
import { checkScoreAchievements } from '@/lib/utils/achievements';
import { DartsAtDoubleModal } from '@/components/app/DartsAtDoubleModal';
import { toast } from 'sonner';
import { playGameOnSfx, hasPlayedGameOnForSession, markGameOnPlayedForSession } from '@/lib/sfx';
import { DartboardOverlay, DartHit } from '@/components/app/DartboardOverlay';
import { simulateVisit, DartResult, BotPerformanceTracker, updatePerformanceTracker } from '@/lib/botThrowEngine';
import { isDartbotVisualizationEnabled, isDartbotDebugModeEnabled } from '@/lib/dartbotSettings';
import { recordMatchCompletion, type PlayerStats } from '@/lib/match/recordMatchCompletion';
import { normalizeMatchConfig } from '@/lib/match/defaultMatchConfig';
import { computeMatchStats } from '@/lib/stats/computeMatchStats';
import Link from 'next/link';
import { WinnerPopup } from '@/components/game/WinnerPopup';
import { QuickMatchPlayerCard } from '@/components/match/QuickMatchPlayerCard';

interface Visit {
  player: 'player1' | 'player2';
  score: number;
  remainingScore: number;
  isBust: boolean;
  isCheckout: boolean;
  timestamp: number;
  lastDartType?: 'S' | 'D' | 'T' | 'BULL' | 'SBULL';
  bustReason?: string;
  darts?: { type: string; number: number; value: number; multiplier: number; label: string; score: number; is_double: boolean }[];
  dartsThrown?: number;
  remainingBefore?: number;
  remainingAfter?: number;
}

interface LegData {
  legNumber: number;
  winner: 'player1' | 'player2' | null;
  visits: Visit[];
  player1DartsThrown: number;
  player2DartsThrown: number;
  player1First9DartsThrown: number;
  player1First9PointsScored: number;
  player2First9DartsThrown: number;
  player2First9PointsScored: number;
}

interface Dart {
  type: 'single' | 'double' | 'triple' | 'bull';
  number: number;
  value: number;
  multiplier: number;
  label: string;
  score: number;
  is_double: boolean;
}

// Checkout routes for common scores
const CHECKOUT_ROUTES: Record<number, string[]> = {
  170: ['T20', 'T20', 'DB'], 167: ['T20', 'T19', 'DB'], 164: ['T20', 'T18', 'DB'], 161: ['T20', 'T17', 'DB'],
  160: ['T20', 'T20', 'D20'], 158: ['T20', 'T20', 'D19'], 157: ['T20', 'T19', 'D20'], 156: ['T20', 'T20', 'D18'],
  155: ['T20', 'T19', 'D19'], 154: ['T20', 'T18', 'D20'], 153: ['T20', 'T19', 'D18'], 152: ['T20', 'T20', 'D16'],
  151: ['T20', 'T17', 'D20'], 150: ['T20', 'T18', 'D18'], 149: ['T20', 'T19', 'D16'], 148: ['T20', 'T20', 'D14'],
  147: ['T20', 'T17', 'D18'], 146: ['T20', 'T18', 'D16'], 145: ['T20', 'T19', 'D14'], 144: ['T20', 'T20', 'D12'],
  143: ['T20', 'T17', 'D16'], 142: ['T20', 'T14', 'D20'], 141: ['T20', 'T19', 'D12'], 140: ['T20', 'T20', 'D10'],
  139: ['T20', 'T13', 'D20'], 138: ['T20', 'T18', 'D12'], 137: ['T20', 'T19', 'D10'], 136: ['T20', 'T20', 'D8'],
  135: ['T20', 'T17', 'D12'], 134: ['T20', 'T14', 'D16'], 133: ['T20', 'T19', 'D8'], 132: ['T20', 'T16', 'D12'],
  131: ['T20', 'T13', 'D16'], 130: ['T20', 'T20', 'D5'], 129: ['T20', 'T19', 'D6'], 128: ['T20', 'T18', 'D7'],
  127: ['T20', 'T17', 'D8'], 126: ['T20', 'T16', 'D9'], 125: ['T20', 'T19', 'D4'], 124: ['T20', 'T16', 'D8'],
  123: ['T20', 'T13', 'D12'], 122: ['T20', 'T18', 'D4'], 121: ['T20', 'T15', 'D8'], 120: ['T20', 'T20', 'D10'],
  119: ['T19', 'T20', 'D10'], 118: ['T20', 'T18', 'D8'], 117: ['T20', 'T17', 'D8'], 116: ['T20', 'T16', 'D8'],
  115: ['T20', 'T15', 'D10'], 114: ['T20', 'T14', 'D12'], 113: ['T20', 'T13', 'D12'], 112: ['T20', 'T20', 'D6'],
  111: ['T20', 'T17', 'D10'], 110: ['T20', 'T18', 'D8'], 109: ['T20', 'T19', 'D6'], 108: ['T20', 'T16', 'D10'],
  107: ['T20', 'T15', 'D8'], 106: ['T20', 'T14', 'D10'], 105: ['T20', 'T13', 'D12'], 104: ['T20', 'T12', 'D10'],
  103: ['T20', 'T11', 'D10'], 102: ['T20', 'T10', 'D11'], 101: ['T20', 'T17', 'D4'], 100: ['T20', 'T20', 'D10'],
  99: ['T20', 'T19', 'D1'], 98: ['T20', 'T18', 'D1'], 97: ['T20', 'T17', 'D2'], 96: ['T20', 'T20', 'D3'],
  95: ['T20', 'T15', 'D5'], 94: ['T20', 'T14', 'D4'], 93: ['T20', 'T19', 'D1'], 92: ['T20', 'T20', 'D1'],
  91: ['T20', 'T17', 'D1'], 90: ['T20', 'T10', 'D10'], 89: ['T19', 'T20', 'D1'], 88: ['T20', 'T16', 'D2'],
  87: ['T20', 'T17', 'D2'], 86: ['T20', 'T18', 'D1'], 85: ['T20', 'T15', 'D5'], 84: ['T20', 'T14', 'D4'],
  83: ['T20', 'T13', 'D5'], 82: ['T20', 'T14', 'D5'], 81: ['T20', 'T15', 'D3'], 80: ['T20', 'D20'],
  79: ['T19', 'D20'], 78: ['T18', 'D20'], 77: ['T19', 'D19'], 76: ['T20', 'D18'], 75: ['T17', 'D20'],
  74: ['T14', 'D20'], 73: ['T19', 'D18'], 72: ['T20', 'D16'], 71: ['T13', 'D20'], 70: ['T20', 'D5'],
  69: ['T19', 'D6'], 68: ['T20', 'D4'], 67: ['T17', 'D8'], 66: ['T10', 'D18'], 65: ['T19', 'D4'],
  64: ['T16', 'D8'], 63: ['T13', 'D12'], 62: ['T10', 'D16'], 61: ['T15', 'D8'], 60: ['20', 'D20'],
  59: ['19', 'D20'], 58: ['18', 'D20'], 57: ['17', 'D20'], 56: ['16', 'D20'], 55: ['15', 'D20'],
  54: ['14', 'D20'], 53: ['13', 'D20'], 52: ['12', 'D20'], 51: ['11', 'D20'], 50: ['10', 'D20'],
  49: ['9', 'D20'], 48: ['8', 'D20'], 47: ['15', 'D16'], 46: ['6', 'D20'], 45: ['13', 'D16'],
  44: ['12', 'D16'], 43: ['11', 'D16'], 42: ['10', 'D16'], 41: ['9', 'D16'], 40: ['D20'],
  39: ['7', 'D16'], 38: ['D19'], 37: ['5', 'D16'], 36: ['D18'], 35: ['3', 'D16'], 34: ['D17'],
  33: ['1', 'D16'], 32: ['D16'], 31: ['7', 'D12'], 30: ['D15'], 29: ['13', 'D8'], 28: ['D14'],
  27: ['11', 'D8'], 26: ['D13'], 25: ['9', 'D8'], 24: ['D12'], 23: ['7', 'D8'], 22: ['D11'],
  21: ['5', 'D8'], 20: ['D10'], 19: ['3', 'D8'], 18: ['D9'], 17: ['1', 'D8'], 16: ['D8'],
  15: ['7', 'D4'], 14: ['D7'], 13: ['5', 'D4'], 12: ['D6'], 11: ['3', 'D4'], 10: ['D5'],
  9: ['1', 'D4'], 8: ['D4'], 7: ['3', 'D2'], 6: ['D3'], 5: ['1', 'D2'], 4: ['D2'], 3: ['1', 'D1'], 2: ['D1'],
};

// Scoring Panel Component (same as QuickMatch)
function ScoringPanel({
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
  doubleOut,
}: {
  scoreInput: string;
  onScoreInputChange: (value: string) => void;
  onTypeScoreSubmit: () => void;
  onSubmitVisit: () => void;
  onMiss: () => void;
  onBust: () => void;
  currentDarts: Dart[];
  onDartClick: (type: 'single' | 'double' | 'triple' | 'bull', number: number) => void;
  onUndoDart: () => void;
  onClearVisit: () => void;
  submitting: boolean;
  currentRemaining: number;
  doubleOut: boolean;
}) {
  const [activeTab, setActiveTab] = useState<'singles' | 'doubles' | 'triples' | 'bulls'>('singles');

  const visitTotal = currentDarts.reduce((sum, d) => sum + d.value, 0);
  const previewRemaining = currentRemaining - visitTotal;
  const dartsThrown = currentDarts.length;
  const dartsRemaining = 3 - dartsThrown;

  const getCheckoutSuggestion = () => {
    if (previewRemaining <= 0 || previewRemaining > 170) return null;
    return CHECKOUT_ROUTES[previewRemaining] || null;
  };

  const checkoutSuggestion = getCheckoutSuggestion();

  return (
    <div className="h-full flex flex-col">
      {previewRemaining > 0 && previewRemaining <= 170 && (
        <div className="mb-3 p-3 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-amber-400 uppercase tracking-wider mb-1">Checkout {previewRemaining}</p>
            {checkoutSuggestion ? (
              <div className="flex items-center justify-center gap-2 text-lg font-bold">
                {checkoutSuggestion.map((dart, idx) => (
                  <span key={idx} className={`px-2 py-1 rounded-lg text-sm ${
                    dart.startsWith('D') ? 'bg-red-500/30 text-red-300' : 
                    dart.startsWith('T') ? 'bg-amber-500/30 text-amber-300' :
                    dart === 'DB' ? 'bg-red-500/40 text-red-200 border border-red-400' :
                    'bg-slate-700 text-white'
                  }`}>{dart}</span>
                ))}
              </div>
            ) : (<p className="text-amber-400 font-bold text-sm">No checkout</p>)}
          </div>
        </div>
      )}

      <div className="mb-3">
        <div className="flex gap-2">
          <Input type="number" placeholder="Type score (0-180)" value={scoreInput}
            onChange={(e) => onScoreInputChange(e.target.value)}
            className="flex-1 bg-slate-800 border-white/10 text-white"
            onKeyDown={(e) => e.key === 'Enter' && onTypeScoreSubmit()} />
          <Button onClick={onTypeScoreSubmit} disabled={!scoreInput || submitting}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50">
            {submitting ? '...' : 'Submit'}
          </Button>
        </div>
      </div>

      <div className="text-center mb-2">
        <span className="text-sm text-gray-400">Current Visit: </span>
        <span className="text-xl font-bold text-white">{visitTotal}</span>
        <span className="text-sm text-gray-400 ml-2">→ {previewRemaining}</span>
      </div>

      <div className="flex justify-center gap-2 mb-3">
        {currentDarts.map((dart, idx) => (
          <div key={idx} className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold ${
            dart.is_double ? 'bg-red-500/20 text-red-400 border border-red-500/50' :
            dart.type === 'triple' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' :
            'bg-slate-700 text-white border border-white/20'
          }`}>{dart.label}</div>
        ))}
        {Array.from({ length: 3 - currentDarts.length }).map((_, idx) => (
          <div key={`empty-${idx}`} className="w-10 h-10 rounded-lg border-2 border-dashed border-white/20" />
        ))}
      </div>

      <div className="flex gap-1 mb-2">
        {(['singles', 'doubles', 'triples', 'bulls'] as const).map((tab) => (
          <Button key={tab} size="sm" variant={activeTab === tab ? 'default' : 'outline'}
            onClick={() => setActiveTab(tab)} className={`flex-1 text-xs ${
              tab === 'doubles' ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' :
              tab === 'triples' ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' :
              tab === 'bulls' ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : ''
            }`}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </Button>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-5 gap-1 mb-3">
        {activeTab === 'bulls' ? (
          <>
            <Button onClick={() => onDartClick('bull', 25)} className="h-full bg-green-500/20 text-green-400 hover:bg-green-500/30 text-lg">25</Button>
            <Button onClick={() => onDartClick('bull', 50)} className="h-full bg-red-500/20 text-red-400 hover:bg-red-500/30 text-lg font-bold">50</Button>
          </>
        ) : (
          Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
            <Button key={num}
              onClick={() => onDartClick(activeTab === 'singles' ? 'single' : activeTab === 'doubles' ? 'double' : 'triple', num)}
              disabled={currentDarts.length >= 3}
              className={`h-full text-sm font-bold ${
                activeTab === 'doubles' ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' :
                activeTab === 'triples' ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' :
                'bg-slate-700 text-white hover:bg-slate-600'
              }`}>
              {activeTab === 'doubles' ? 'D' : activeTab === 'triples' ? 'T' : ''}{num}
            </Button>
          ))
        )}
      </div>

      <div className="flex gap-1">
        <Button variant="outline" onClick={onUndoDart} disabled={currentDarts.length === 0}
          className="flex-1 border-white/10 text-white hover:bg-white/5 text-xs">Undo</Button>
        <Button variant="outline" onClick={onClearVisit} disabled={currentDarts.length === 0}
          className="flex-1 border-white/10 text-white hover:bg-white/5 text-xs">Clear</Button>
        <Button onClick={onMiss} disabled={currentDarts.length >= 3}
          className="flex-1 bg-slate-700 hover:bg-slate-600 text-xs">Miss</Button>
        <Button onClick={onBust} disabled={submitting}
          className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50 text-xs">Bust</Button>
        <Button onClick={onSubmitVisit} disabled={currentDarts.length === 0 || submitting}
          className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-xs">
          {submitting ? '...' : 'Submit'}
        </Button>
      </div>
    </div>
  );
}

// Visit History Panel
function VisitHistoryPanel({ visits, myName, botName, currentLeg }: { visits: Visit[]; myName: string; botName: string; currentLeg: number }) {
  const currentLegVisits = useMemo(() => visits.filter(v => {
    const visitLeg = (v as any).legNumber || (v as any).leg || 1;
    return visitLeg === currentLeg;
  }), [visits, currentLeg]);

  const myVisits = currentLegVisits.filter(v => v.player === 'player1').sort((a, b) => b.timestamp - a.timestamp);
  const botVisits = currentLegVisits.filter(v => v.player === 'player2').sort((a, b) => b.timestamp - a.timestamp);
  const maxVisits = Math.max(myVisits.length, botVisits.length);

  const formatDartLabel = (dart: any) => {
    if (!dart) return '-';
    if (dart.label === 'MISS' || dart.label === 'DBull' || dart.label === 'SBull') return dart.label;
    return dart.label;
  };

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-sm font-semibold text-white mb-2">Visit History - Leg {currentLeg}</h3>
      <div className="flex-1 overflow-auto space-y-1">
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400 border-b border-white/10 pb-1">
          <div className="text-center font-bold text-emerald-400">{myName}</div>
          <div className="text-center font-bold text-purple-400">{botName}</div>
        </div>
        {maxVisits === 0 ? (<div className="text-center text-gray-500 py-4 text-sm">No visits yet</div>) : (
          Array.from({ length: maxVisits }, (_, i) => {
            const myVisit = myVisits[i];
            const botVisit = botVisits[i];
            return (
              <div key={i} className="grid grid-cols-2 gap-2 py-1 border-b border-white/5 text-sm">
                <div>{myVisit ? (
                  <div className="bg-slate-800/50 rounded p-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">#{myVisits.length - i}</span>
                      <span className={`font-bold text-emerald-400 text-lg`}>{myVisit.score}</span>
                    </div>
                    {/* Show individual darts */}
                    {myVisit.darts && myVisit.darts.length > 0 && (
                      <div className="flex gap-1 mt-1 mb-1">
                        {myVisit.darts.map((dart, idx) => (
                          <span key={idx} className={`text-xs px-1.5 py-0.5 rounded ${
                            dart.is_double ? 'bg-red-500/30 text-red-300' :
                            dart.multiplier === 3 ? 'bg-amber-500/30 text-amber-300' :
                            'bg-slate-700 text-gray-300'
                          }`}>
                            {formatDartLabel(dart)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-gray-500">→ {myVisit.remainingScore}</div>
                    {myVisit.isBust && (
                      <span className="text-xs text-red-400 font-bold" title={myVisit.bustReason}>BUST</span>
                    )}
                    {myVisit.isCheckout && <span className="text-xs text-emerald-400 font-bold">CHECKOUT!</span>}
                  </div>
                ) : (<div className="h-20 bg-slate-800/20 rounded flex items-center justify-center text-gray-600">-</div>)}</div>
                <div>{botVisit ? (
                  <div className="bg-slate-800/50 rounded p-1.5">
                    <div className="flex justify-between items-center">
                      <span className={`font-bold text-purple-400 text-lg`}>{botVisit.score}</span>
                      <span className="text-xs text-gray-500">#{botVisits.length - i}</span>
                    </div>
                    {/* Show individual darts for bot */}
                    {botVisit.darts && botVisit.darts.length > 0 && (
                      <div className="flex gap-1 mt-1 mb-1 justify-end">
                        {botVisit.darts.map((dart, idx) => (
                          <span key={idx} className={`text-xs px-1.5 py-0.5 rounded ${
                            dart.is_double ? 'bg-red-500/30 text-red-300' :
                            dart.multiplier === 3 ? 'bg-amber-500/30 text-amber-300' :
                            'bg-slate-700 text-gray-300'
                          }`}>
                            {formatDartLabel(dart)}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 text-right">{botVisit.remainingScore} ←</div>
                    {botVisit.isBust && (
                      <span className="text-xs text-red-400 font-bold" title={botVisit.bustReason}>BUST</span>
                    )}
                    {botVisit.isCheckout && <span className="text-xs text-emerald-400 font-bold">CHECKOUT!</span>}
                  </div>
                ) : (<div className="h-20 bg-slate-800/20 rounded flex items-center justify-center text-gray-600">-</div>)}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function DartbotMatchPage() {
  const router = useRouter();
  const { config } = useTraining();

  const [currentPlayer, setCurrentPlayer] = useState<'player1' | 'player2'>('player1');
  const [legStartingPlayer, setLegStartingPlayer] = useState<'player1' | 'player2'>('player1');
  const [player1Score, setPlayer1Score] = useState(501);
  const [player2Score, setPlayer2Score] = useState(501);
  const [player1LegsWon, setPlayer1LegsWon] = useState(0);
  const [player2LegsWon, setPlayer2LegsWon] = useState(0);
  const [currentLeg, setCurrentLeg] = useState<LegData>({ legNumber: 1, winner: null, visits: [], player1DartsThrown: 0, player2DartsThrown: 0, player1First9DartsThrown: 0, player1First9PointsScored: 0, player2First9DartsThrown: 0, player2First9PointsScored: 0 });
  const [allLegs, setAllLegs] = useState<LegData[]>([]);
  const [scoreInput, setScoreInput] = useState('');
  const [showEndMatchDialog, setShowEndMatchDialog] = useState(false);
  const [matchWinner, setMatchWinner] = useState<'player1' | 'player2' | null>(null);
  const [currentVisit, setCurrentVisit] = useState<Dart[]>([]);
  const [player1MatchTotalScored, setPlayer1MatchTotalScored] = useState(0);
  const [player2MatchTotalScored, setPlayer2MatchTotalScored] = useState(0);
  const [player1MatchDartsThrown, setPlayer1MatchDartsThrown] = useState(0);
  const [player2MatchDartsThrown, setPlayer2MatchDartsThrown] = useState(0);
  const [inputModeError, setInputModeError] = useState('');
  const [isBotThinking, setIsBotThinking] = useState(false);
  const [isLegTransitioning, setIsLegTransitioning] = useState(false);
  const [player1TotalDartsAtDouble, setPlayer1TotalDartsAtDouble] = useState(0);
  const [player1CheckoutsMade, setPlayer1CheckoutsMade] = useState(0);
  const [player2TotalDartsAtDouble, setPlayer2TotalDartsAtDouble] = useState(0);
  const [player2CheckoutsMade, setPlayer2CheckoutsMade] = useState(0);
  const [showDartsAtDoubleModal, setShowDartsAtDoubleModal] = useState(false);
  const [pendingVisitData, setPendingVisitData] = useState<{ score: number; minDarts: 1 | 2 | 3; isCheckout: boolean } | null>(null);
  const botTimerRef = useRef<number | null>(null);
  const botTurnIdRef = useRef(0);
  const matchOverRef = useRef(false);
  const [matchStartTime] = useState(Date.now());
  const hasSavedStats = useRef(false);
  const [dartboardHits, setDartboardHits] = useState<DartHit[]>([]);
  const [botLastVisitTotal, setBotLastVisitTotal] = useState<number | null>(null);
  const [showVisualization, setShowVisualization] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [lastThreeDarts, setLastThreeDarts] = useState<DartResult[]>([]);
  const [botFormMultiplier] = useState(() => 0.85 + Math.random() * 0.3);
  const [botPerformanceTracker, setBotPerformanceTracker] = useState<BotPerformanceTracker | null>(null);
  const dartboardAnimationTimerRef = useRef<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Match end stats for WinnerPopup
  const [matchEndStats, setMatchEndStats] = useState<{
    player1: { id: string; name: string; legs: number };
    player2: { id: string; name: string; legs: number };
    player1FullStats: any;
    player2FullStats: any;
    winnerId: string;
  } | null>(null);

  const botName = config?.botAverage ? `DartBot (${config.botAverage})` : 'DartBot';
  const legsToWin = config ? getLegsToWin(config.bestOf) : 1;
  const startingScore = config ? getStartScore(config.mode) : 501;

  useEffect(() => {
    if (!config || (config.mode !== '301' && config.mode !== '501')) {
      router.push('/app/play');
    }
    if (config) {
      const s = getStartScore(config.mode);
      setPlayer1Score(s);
      setPlayer2Score(s);
    }
  }, [config, router]);

  useEffect(() => {
    setShowVisualization(isDartbotVisualizationEnabled());
    setDebugMode(isDartbotDebugModeEnabled());
  }, []);

  useEffect(() => {
    matchOverRef.current = !!matchWinner;
    if (matchWinner && !hasSavedStats.current) {
      hasSavedStats.current = true;
      saveMatchStats();
    }
  }, [matchWinner]);

  useEffect(() => {
    if (config && !hasPlayedGameOnForSession(matchStartTime.toString())) {
      playGameOnSfx();
      markGameOnPlayedForSession(matchStartTime.toString());
    }
  }, [config, matchStartTime]);

  const clearBotTimer = useCallback(() => {
    if (botTimerRef.current !== null) {
      window.clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }
  }, []);

  const clearDartboardAnimationTimer = useCallback(() => {
    if (dartboardAnimationTimerRef.current !== null) {
      window.clearTimeout(dartboardAnimationTimerRef.current);
      dartboardAnimationTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => { clearBotTimer(); clearDartboardAnimationTimer(); };
  }, [clearBotTimer, clearDartboardAnimationTimer]);

  // Calculate match stats for display
  const calculateMatchStats = useCallback((isPlayer1: boolean) => {
    const allVisits = [...allLegs.flatMap(l => l.visits), ...currentLeg.visits];
    const playerVisits = allVisits.filter(v => v.player === (isPlayer1 ? 'player1' : 'player2') && !v.isBust);
    const totalDarts = playerVisits.reduce((sum, v) => sum + (v.dartsThrown || 3), 0);
    const totalScored = playerVisits.reduce((sum, v) => sum + v.score, 0);
    const threeDartAverage = totalDarts > 0 ? (totalScored / totalDarts) * 3 : 0;
    const currentLegVisits = currentLeg.visits.filter(v => v.player === (isPlayer1 ? 'player1' : 'player2') && !v.isBust);
    const dartsThisLeg = currentLegVisits.reduce((sum, v) => sum + (v.dartsThrown || 3), 0);
    return { average: threeDartAverage, lastScore: currentLegVisits.length > 0 ? currentLegVisits[currentLegVisits.length - 1].score : 0, dartsThrown: dartsThisLeg, totalDartsThrown: totalDarts, totalScore: totalScored };
  }, [allLegs, currentLeg]);

  const calculatePlayerStatsFromVisits = (visitData: Visit[], isPlayer1: boolean, playerName: string, legsWon: number) => {
    const playerVisits = visitData.filter(v => v.player === (isPlayer1 ? 'player1' : 'player2') && !v.isBust);
    const totalDarts = playerVisits.reduce((sum, v) => sum + (v.dartsThrown || 3), 0);
    const totalScored = playerVisits.reduce((sum, v) => sum + v.score, 0);
    const threeDartAverage = totalDarts > 0 ? (totalScored / totalDarts) * 3 : 0;
    let first9Score = 0, first9Darts = 0;
    for (const visit of playerVisits.slice(0, 3)) {
      first9Score += visit.score;
      first9Darts += (visit.dartsThrown || 3);
      if (first9Darts >= 9) break;
    }
    const first9Average = first9Darts > 0 ? (first9Score / first9Darts) * 3 : 0;
    const checkouts = playerVisits.filter(v => v.isCheckout);
    const highestCheckout = checkouts.length > 0 ? Math.max(...checkouts.map(v => v.score)) : 0;
    const checkoutAttempts = playerVisits.filter(v => (v.remainingBefore || 0) <= 170 && (v.remainingBefore || 0) > 0).length;
    const successfulCheckouts = checkouts.length;
    const checkoutPercentage = checkoutAttempts > 0 ? (successfulCheckouts / checkoutAttempts) * 100 : 0;
    const visitsByLeg = new Map<number, typeof playerVisits>();
    for (const visit of playerVisits) {
      const legNum = (visit as any).legNumber || (visit as any).leg || 1;
      if (!visitsByLeg.has(legNum)) visitsByLeg.set(legNum, []);
      visitsByLeg.get(legNum)!.push(visit);
    }
    let bestLegDarts = Infinity, bestLegNum = 0;
    for (const [legNum, legVisits] of visitsByLeg) {
      if (legVisits.some((v: Visit) => v.isCheckout)) {
        const legDarts = legVisits.reduce((sum: number, v: Visit) => sum + (v.dartsThrown || 3), 0);
        if (legDarts < bestLegDarts) { bestLegDarts = legDarts; bestLegNum = legNum; }
      }
    }
    const count100Plus = playerVisits.filter(v => v.score >= 100 && v.score < 140).length;
    const count140Plus = playerVisits.filter(v => v.score >= 140 && v.score < 180).length;
    const oneEighties = playerVisits.filter(v => v.score === 180).length;
    return { id: isPlayer1 ? 'player1' : 'player2', name: playerName, legsWon, threeDartAverage, first9Average, highestCheckout, checkoutPercentage, totalDartsThrown: totalDarts, bestLegDarts: bestLegDarts === Infinity ? 0 : bestLegDarts, bestLegNum, totalScore: totalScored, checkouts: successfulCheckouts, checkoutAttempts, count100Plus, count140Plus, oneEighties };
  };

  const saveMatchStats = async () => {
    if (!config || !matchWinner) return;
    try {
      const normalizedConfig = normalizeMatchConfig({ mode: config.mode as '301' | '501', bestOf: config.bestOf, doubleOut: config.doubleOut });
      const allLegsData = [...allLegs, currentLeg].filter(leg => leg.winner);
      const allVisitsFormatted: any[] = [];
      for (const leg of allLegsData) {
        const p1Visits = leg.visits.filter(v => v.player === 'player1');
        const p2Visits = leg.visits.filter(v => v.player === 'player2');
        p1Visits.forEach((visit, idx) => allVisitsFormatted.push({ player: 'user', legNumber: leg.legNumber, visitNumber: idx + 1, score: visit.score, remainingScore: visit.remainingScore, isBust: visit.isBust, isCheckout: visit.isCheckout, wasCheckoutAttempt: visit.remainingScore <= 170 && !visit.isBust }));
        p2Visits.forEach((visit, idx) => allVisitsFormatted.push({ player: 'opponent', legNumber: leg.legNumber, visitNumber: idx + 1, score: visit.score, remainingScore: visit.remainingScore, isBust: visit.isBust, isCheckout: visit.isCheckout, wasCheckoutAttempt: visit.remainingScore <= 170 && !visit.isBust }));
      }
      const userStats = computeMatchStats(allVisitsFormatted.filter(v => v.player === 'user'), 'user', normalizedConfig.mode, player1TotalDartsAtDouble, player1CheckoutsMade);
      const opponentStats = computeMatchStats(allVisitsFormatted.filter(v => v.player === 'opponent'), 'opponent', normalizedConfig.mode, player2TotalDartsAtDouble, player2CheckoutsMade);
      
      const userPlayerStats: PlayerStats = {
        threeDartAvg: userStats.threeDartAverage, first9Avg: userStats.first9Average, checkoutDartsAttempted: userStats.checkoutDartsAttempted,
        checkoutsMade: userStats.checkoutsMade, checkoutPercent: userStats.checkoutPercent, highestCheckout: userStats.highestCheckout,
        count100Plus: userStats.count100Plus, count140Plus: userStats.count140Plus, count180: userStats.oneEighties,
        highestScore: userStats.highestVisit, legsWon: player1LegsWon, legsLost: player2LegsWon, dartsThrown: userStats.totalDartsThrown, pointsScored: userStats.totalPointsScored,
      };
      const opponentPlayerStats: PlayerStats = {
        threeDartAvg: opponentStats.threeDartAverage, first9Avg: opponentStats.first9Average, checkoutDartsAttempted: opponentStats.checkoutDartsAttempted,
        checkoutsMade: opponentStats.checkoutsMade, checkoutPercent: opponentStats.checkoutPercent, highestCheckout: opponentStats.highestCheckout,
        count100Plus: opponentStats.count100Plus, count140Plus: opponentStats.count140Plus, count180: opponentStats.oneEighties,
        highestScore: opponentStats.highestVisit, legsWon: player2LegsWon, legsLost: player1LegsWon, dartsThrown: opponentStats.totalDartsThrown, pointsScored: opponentStats.totalPointsScored,
      };

      // Set match end stats for WinnerPopup
      const p1FullStats = calculatePlayerStatsFromVisits(allVisitsFormatted.map(v => ({ ...v, player: v.player === 'user' ? 'player1' : 'player2' })), true, 'You', player1LegsWon);
      const p2FullStats = calculatePlayerStatsFromVisits(allVisitsFormatted.map(v => ({ ...v, player: v.player === 'user' ? 'player1' : 'player2' })), false, botName, player2LegsWon);
      
      setMatchEndStats({
        player1: { id: 'player1', name: 'You', legs: player1LegsWon },
        player2: { id: 'player2', name: botName, legs: player2LegsWon },
        player1FullStats: p1FullStats,
        player2FullStats: p2FullStats,
        winnerId: matchWinner === 'player1' ? 'player1' : 'player2',
      });

      const result = await recordMatchCompletion({
        matchType: 'dartbot', game: normalizedConfig.mode, startedAt: new Date(matchStartTime).toISOString(), endedAt: new Date().toISOString(),
        opponent: { name: botName, isBot: true },
        winner: matchWinner === 'player1' ? 'user' : 'opponent',
        userStats: userPlayerStats, opponentStats: opponentPlayerStats, matchFormat: config.bestOf,
      });
      console.log('📊 DARTBOT MATCH SAVED:', result);
      if (result.ok) toast.success('Match stats saved!');
    } catch (error) { console.error('Error saving match stats:', error); }
  };

  // Track if a bot turn is currently in progress to prevent overlapping animations
  const botTurnInProgressRef = useRef(false);

  const animateBotThrows = useCallback(async (darts: DartResult[]): Promise<void> => {
    // Prevent overlapping animations
    if (botTurnInProgressRef.current) {
      console.log('[DartBot] Turn already in progress, skipping');
      return;
    }
    botTurnInProgressRef.current = true;
    
    clearDartboardAnimationTimer();
    setDartboardHits([]);
    setBotLastVisitTotal(null);
    setLastThreeDarts([]);
    
    // Show "DartBot is throwing..." message with dart preview
    const visitTotal = darts.reduce((sum, dart) => sum + dart.score, 0);
    
    for (let i = 0; i < darts.length; i++) {
      const dart = darts[i];
      // Delay before dart appears (thinking/aiming time)
      await new Promise<void>((resolve) => { 
        dartboardAnimationTimerRef.current = window.setTimeout(() => resolve(), i === 0 ? 600 : 1200); 
      });
      
      // Add dart to board
      setDartboardHits(prev => [...prev, { x: dart.x, y: dart.y, label: dart.label, offboard: dart.offboard }]);
      
      // Show dart score immediately
      setLastThreeDarts(prev => [...prev, dart]);
      
      // Short pause to show the hit before next dart
      if (i < darts.length - 1) {
        await new Promise<void>((resolve) => { 
          dartboardAnimationTimerRef.current = window.setTimeout(() => resolve(), 400); 
        });
      }
    }
    
    // Show total after all darts thrown
    setBotLastVisitTotal(visitTotal);
    
    // Keep darts visible for a moment, then clear
    await new Promise<void>((resolve) => { 
      dartboardAnimationTimerRef.current = window.setTimeout(() => { 
        setDartboardHits([]); 
        resolve(); 
      }, 1500); 
    });
    
    botTurnInProgressRef.current = false;
  }, [clearDartboardAnimationTimer]);

  const botTakeTurn = useCallback(async () => {
    if (matchOverRef.current || isLegTransitioning) return;
    const currentScore = player2Score;
    if (currentScore <= 0) { setCurrentPlayer('player1'); return; }
    if (showVisualization && config) {
      // Generate exactly 3 darts (or fewer if checkout achieved)
      const visualVisit = simulateVisit({ 
        level: config.botAverage, 
        remaining: currentScore, 
        doubleOut: config.doubleOut, 
        formMultiplier: botFormMultiplier, 
        tracker: botPerformanceTracker, 
        debug: debugMode 
      });
      
      // Update performance tracker for calibration
      setBotPerformanceTracker(prev => updatePerformanceTracker(prev, visualVisit.visitTotal, config.botAverage));
      
      // Animate the throws (shows exactly 3 darts or fewer if checkout)
      await animateBotThrows(visualVisit.darts);
      
      // Record the visit
      const dartsThrown = visualVisit.darts.length;
      const visit: Visit = { 
        player: 'player2', 
        score: visualVisit.bust ? 0 : visualVisit.visitTotal, 
        remainingScore: visualVisit.newRemaining, 
        isBust: visualVisit.bust, 
        isCheckout: visualVisit.finished, 
        timestamp: Date.now(), 
        dartsThrown, 
        darts: visualVisit.darts.map(d => ({
          type: d.isDouble ? 'double' : d.isTreble ? 'triple' : d.offboard ? 'single' : 'single',
          number: d.offboard ? 0 : parseInt(d.label.replace(/[^0-9]/g, '')) || (d.label.includes('Bull') ? 25 : 0),
          value: d.score,
          multiplier: d.isDouble ? 2 : d.isTreble ? 3 : 1,
          label: d.label,
          score: d.score,
          is_double: d.isDouble,
        })),
        remainingBefore: currentScore,
        remainingAfter: visualVisit.newRemaining,
        bustReason: visualVisit.bustReason,
      };
      
      setCurrentLeg(prev => {
        const dartsUsedInFirst9 = Math.min(dartsThrown, Math.max(0, 9 - prev.player2First9DartsThrown));
        const pointsForFirst9 = dartsUsedInFirst9 > 0 ? (visualVisit.bust ? 0 : (visualVisit.visitTotal * dartsUsedInFirst9) / dartsThrown) : 0;
        return { 
          ...prev, 
          visits: [...prev.visits, visit], 
          player2DartsThrown: prev.player2DartsThrown + dartsThrown, 
          player2First9DartsThrown: prev.player2First9DartsThrown + dartsUsedInFirst9, 
          player2First9PointsScored: prev.player2First9PointsScored + pointsForFirst9 
        };
      });
      
      if (!visualVisit.bust) {
        setPlayer2MatchTotalScored(prev => prev + visualVisit.visitTotal);
      }
      setPlayer2MatchDartsThrown(prev => prev + dartsThrown);
      setPlayer2Score(visualVisit.newRemaining);
      
      if (visualVisit.finished) {
        setTimeout(() => { 
          if (!matchOverRef.current) handleLegComplete('player2'); 
        }, 500);
        return;
      }
      setCurrentPlayer('player1');
    }
  }, [isLegTransitioning, player2Score, showVisualization, config, botFormMultiplier, debugMode, botPerformanceTracker, animateBotThrows]);

  const scheduleBotTurn = useCallback((reason: string) => {
    if (currentPlayer !== 'player2') return;
    if (isLegTransitioning) { clearBotTimer(); botTimerRef.current = window.setTimeout(() => scheduleBotTurn("retry"), 50); return; }
    clearBotTimer();
    setIsBotThinking(true);
    const myTurnId = ++botTurnIdRef.current;
    botTimerRef.current = window.setTimeout(async () => {
      if (myTurnId !== botTurnIdRef.current) return;
      try {
        await Promise.race([
          botTakeTurn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("BOT_TIMEOUT")), 5000))
        ]);
      } catch (err) {
        console.error("BOT_ERROR", err);
        setIsBotThinking(false);
        clearBotTimer();
        botTimerRef.current = window.setTimeout(() => {
          if (currentPlayer === 'player2') scheduleBotTurn("recover");
        }, 150);
        return;
      } finally {
        setIsBotThinking(false);
        clearBotTimer();
      }
    }, 1500);
  }, [currentPlayer, isLegTransitioning, clearBotTimer, botTakeTurn]);

  useEffect(() => {
    if (currentPlayer === 'player2') scheduleBotTurn("turn");
    else { setIsBotThinking(false); clearBotTimer(); }
    return () => clearBotTimer();
  }, [currentPlayer, isLegTransitioning, scheduleBotTurn, clearBotTimer]);

  const handleInputScoreSubmit = (score: number) => {
    if (!config) return;
    if (!Number.isInteger(score)) { setInputModeError('Score must be a whole number'); return; }
    if (score < 0 || score > 180) { setInputModeError('Score must be between 0 and 180'); return; }
    const currentScore = player1Score;
    const doubleOut = config.doubleOut;
    const newScore = currentScore - score;
    const isCheckout = newScore === 0;
    const isCheckoutAttempt = currentScore <= 170 && currentScore > 0;
    if (isCheckoutAttempt && doubleOut) { setPendingVisitData({ score, minDarts: 3, isCheckout }); setShowDartsAtDoubleModal(true); }
    else { handleScoreSubmit(score, 3, undefined, true, 0); setScoreInput(''); }
  };

  const handleDartsAtDoubleConfirm = (dartsAtDouble: number) => {
    if (!pendingVisitData) return;
    setPlayer1TotalDartsAtDouble(prev => prev + dartsAtDouble);
    if (pendingVisitData.isCheckout) setPlayer1CheckoutsMade(prev => prev + 1);
    handleScoreSubmit(pendingVisitData.score, 3, undefined, true, dartsAtDouble);
    setShowDartsAtDoubleModal(false);
    setPendingVisitData(null);
    setScoreInput('');
  };

  const handleScoreSubmit = (score: number, dartsThrown: number = 3, lastDartType?: 'S' | 'D' | 'T' | 'BULL' | 'SBULL', isTypedInput: boolean = false, dartsAtDoubleForInput: number = 0) => {
    if (!config || currentPlayer !== 'player1') return;
    const currentScore = player1Score;
    const doubleOut = config.doubleOut;
    const newScore = currentScore - score;
    if (isBust(currentScore, score, doubleOut)) {
      const visit: Visit = { player: 'player1', score: 0, remainingScore: currentScore, isBust: true, isCheckout: false, timestamp: Date.now(), dartsThrown, remainingBefore: currentScore, remainingAfter: currentScore };
      setCurrentLeg(prev => { const dartsUsedInFirst9 = Math.min(dartsThrown, Math.max(0, 9 - prev.player1First9DartsThrown)); return { ...prev, visits: [...prev.visits, visit], player1DartsThrown: prev.player1DartsThrown + dartsThrown, player1First9DartsThrown: prev.player1First9DartsThrown + dartsUsedInFirst9 }; });
      setPlayer1MatchDartsThrown(prev => prev + dartsThrown);
      setCurrentPlayer('player2');
      setScoreInput('');
      setCurrentVisit([]);
      setInputModeError('');
      return;
    }
    const isCheckout = newScore === 0;
    const visit: Visit = { player: 'player1', score, remainingScore: newScore, isBust: false, isCheckout, timestamp: Date.now(), lastDartType, dartsThrown, remainingBefore: currentScore, remainingAfter: newScore };
    setCurrentLeg(prev => { const dartsUsedInFirst9 = Math.min(dartsThrown, Math.max(0, 9 - prev.player1First9DartsThrown)); const pointsForFirst9 = dartsUsedInFirst9 > 0 ? (score * dartsUsedInFirst9) / dartsThrown : 0; return { ...prev, visits: [...prev.visits, visit], player1DartsThrown: prev.player1DartsThrown + dartsThrown, player1First9DartsThrown: prev.player1First9DartsThrown + dartsUsedInFirst9, player1First9PointsScored: prev.player1First9PointsScored + pointsForFirst9 }; });
    setPlayer1MatchTotalScored(prev => prev + score);
    setPlayer1MatchDartsThrown(prev => prev + dartsThrown);
    setPlayer1Score(newScore);
    checkScoreAchievements(score);
    if (isCheckout) handleLegComplete('player1');
    else setCurrentPlayer('player2');
    setScoreInput('');
    setCurrentVisit([]);
    setInputModeError('');
  };

  const handleLegComplete = (winner: 'player1' | 'player2') => {
    if (matchWinner) return;
    clearBotTimer();
    setIsBotThinking(false);
    setIsLegTransitioning(false);
    const completedLeg = { ...currentLeg, winner };
    const updatedLegs = [...allLegs, completedLeg];
    setAllLegs(updatedLegs);
    if (winner === 'player1') {
      setPlayer1LegsWon(prev => { const newLegs = prev + 1; if (newLegs >= legsToWin) { matchOverRef.current = true; setMatchWinner('player1'); return newLegs; } queueMicrotask(() => startNewLeg()); return newLegs; });
    } else {
      setPlayer2LegsWon(prev => { const newLegs = prev + 1; if (newLegs >= legsToWin) { matchOverRef.current = true; setMatchWinner('player2'); return newLegs; } queueMicrotask(() => startNewLeg()); return newLegs; });
    }
  };

  const startNewLeg = useCallback(() => {
    if (matchOverRef.current || matchWinner) return;
    clearBotTimer();
    setIsBotThinking(false);
    setIsLegTransitioning(true);
    const nextStartingPlayer = legStartingPlayer === 'player1' ? 'player2' : 'player1';
    const s = config ? getStartScore(config.mode) : 501;
    setPlayer1Score(s);
    setPlayer2Score(s);
    setLegStartingPlayer(nextStartingPlayer);
    setCurrentLeg({ legNumber: currentLeg.legNumber + 1, winner: null, visits: [], player1DartsThrown: 0, player2DartsThrown: 0, player1First9DartsThrown: 0, player1First9PointsScored: 0, player2First9DartsThrown: 0, player2First9PointsScored: 0 });
    setCurrentVisit([]);
    setScoreInput('');
    setInputModeError('');
    setBotPerformanceTracker(null);
    setTimeout(() => { setIsLegTransitioning(false); setCurrentPlayer(nextStartingPlayer); }, 500);
  }, [matchWinner, legStartingPlayer, currentLeg.legNumber, clearBotTimer, config]);

  const handleRematch = () => {
    matchOverRef.current = false;
    hasSavedStats.current = false;
    clearBotTimer();
    setMatchEndStats(null);
    const s = config ? getStartScore(config.mode) : 501;
    setPlayer1Score(s);
    setPlayer2Score(s);
    setPlayer1LegsWon(0);
    setPlayer2LegsWon(0);
    setCurrentPlayer('player1');
    setLegStartingPlayer('player1');
    setCurrentLeg({ legNumber: 1, winner: null, visits: [], player1DartsThrown: 0, player2DartsThrown: 0, player1First9DartsThrown: 0, player1First9PointsScored: 0, player2First9DartsThrown: 0, player2First9PointsScored: 0 });
    setAllLegs([]);
    setMatchWinner(null);
    setPlayer1MatchTotalScored(0);
    setPlayer2MatchTotalScored(0);
    setPlayer1MatchDartsThrown(0);
    setPlayer2MatchDartsThrown(0);
    setCurrentVisit([]);
    setScoreInput('');
    setInputModeError('');
    setIsBotThinking(false);
    botTurnIdRef.current = 0;
    setPlayer1TotalDartsAtDouble(0);
    setPlayer1CheckoutsMade(0);
    setPlayer2TotalDartsAtDouble(0);
    setPlayer2CheckoutsMade(0);
    setBotPerformanceTracker(null);
  };

  const handleReturnToPlay = () => { router.push('/app/play'); };

  const handleDartClick = (type: 'single' | 'double' | 'triple' | 'bull', number: number) => {
    if (currentVisit.length >= 3 || currentPlayer !== 'player1') return;
    let value = 0;
    let dartType: 'single' | 'double' | 'triple' | 'bull';
    let multiplier = 1;
    let label = '';
    let isDouble = false;
    if (type === 'bull') {
      value = number;
      multiplier = number === 50 ? 2 : 1;
      label = number === 50 ? 'DB' : 'SB';
      isDouble = number === 50;
      number = 25;
      dartType = 'bull';
    } else if (type === 'single') { value = number; dartType = 'single'; multiplier = 1; label = number.toString(); }
    else if (type === 'double') { value = number * 2; dartType = 'double'; multiplier = 2; label = `D${number}`; isDouble = true; }
    else { value = number * 3; dartType = 'triple'; multiplier = 3; label = `T${number}`; }
    const dart: Dart = { type: dartType, number, value, multiplier, label, score: value, is_double: isDouble };
    setCurrentVisit([...currentVisit, dart]);
  };

  const handleClearVisit = () => setCurrentVisit([]);
  const handleUndoDart = () => setCurrentVisit((prev) => prev.slice(0, -1));
  const handleMiss = () => {
    if (currentVisit.length >= 3 || currentPlayer !== 'player1') return;
    setCurrentVisit([...currentVisit, { type: 'single', number: 0, value: 0, multiplier: 1, label: 'Miss', score: 0, is_double: false }]);
  };

  const validateCheckout = (score: number, darts: Dart[]): { valid: boolean; isCheckout: boolean; isBust: boolean } => {
    if (!config) return { valid: false, isCheckout: false, isBust: false };
    const currentRemaining = player1Score;
    const newRemaining = currentRemaining - score;
    if (newRemaining < 0) return { valid: true, isCheckout: false, isBust: true };
    if (newRemaining === 1) return { valid: true, isCheckout: false, isBust: true };
    if (newRemaining === 0) {
      const requireDouble = config.doubleOut !== false;
      if (requireDouble) { const lastDart = darts[darts.length - 1]; if (!lastDart?.is_double) return { valid: true, isCheckout: false, isBust: true }; }
      return { valid: true, isCheckout: true, isBust: false };
    }
    return { valid: true, isCheckout: false, isBust: false };
  };

  const handleBust = async () => {
    if (currentPlayer !== 'player1') return;
    let bustDarts = [...currentVisit];
    while (bustDarts.length < 3) bustDarts.push({ type: 'single', number: 0, value: 0, multiplier: 1, label: 'Miss', score: 0, is_double: false });
    await submitScore(0, true, bustDarts);
  };

  const handleSubmitVisit = async () => {
    if (!config || currentPlayer !== 'player1') return;
    if (currentVisit.length === 0) { toast.error('Please enter darts'); return; }
    const visitTotal = currentVisit.reduce((sum, dart) => sum + dart.value, 0);
    const validation = validateCheckout(visitTotal, currentVisit);
    if (validation.isBust) { await submitScore(0, true, currentVisit, false); return; }
    await submitScore(visitTotal, false, currentVisit, validation.isCheckout);
  };

  const handleTypeScoreSubmit = async () => {
    if (!scoreInput) { toast.error('Please enter a score'); return; }
    const score = parseInt(scoreInput.trim());
    if (isNaN(score) || score < 0 || score > 180) { toast.error('Invalid score (0-180)'); return; }
    if (!config) { toast.error('Game not ready'); return; }
    if (currentPlayer !== 'player1') { toast.error('Not your turn'); return; }
    const genericDarts: Dart[] = [{ type: 'single', number: score, value: score, multiplier: 1, label: score.toString(), score, is_double: false }];
    const currentRemaining = player1Score;
    const newRemaining = currentRemaining - score;
    if (newRemaining < 0) { await submitScore(0, true, genericDarts, false); return; }
    if (newRemaining === 1) { await submitScore(0, true, genericDarts, false); return; }
    const isCheckout = newRemaining === 0;
    await submitScore(score, false, genericDarts, isCheckout);
  };

  async function submitScore(score: number, isBust: boolean, darts: Dart[], isCheckout: boolean = false) {
    if (!config || currentPlayer !== 'player1') return;
    setSubmitting(true);
    try {
      let dartsToSubmit = [...darts];
      if (isBust) { while (dartsToSubmit.length < 3) dartsToSubmit.push({ type: 'single', number: 0, value: 0, multiplier: 1, label: 'Miss', score: 0, is_double: false }); }
      else if (!isCheckout && dartsToSubmit.length > 0 && dartsToSubmit.length < 3) { while (dartsToSubmit.length < 3) dartsToSubmit.push({ type: 'single', number: 0, value: 0, multiplier: 1, label: 'Miss', score: 0, is_double: false }); }
      const dartsThrown = dartsToSubmit.length;
      let dartsAtDoubleCount = 0;
      let remainingBeforeDart = player1Score;
      for (const dart of dartsToSubmit) { if (config.doubleOut && remainingBeforeDart <= 170 && remainingBeforeDart > 0) dartsAtDoubleCount++; remainingBeforeDart -= dart.value; }
      if (dartsAtDoubleCount > 0) { setPlayer1TotalDartsAtDouble(prev => prev + dartsAtDoubleCount); if (isCheckout) setPlayer1CheckoutsMade(prev => prev + 1); }
      let lastDartType: 'S' | 'D' | 'T' | 'BULL' | 'SBULL' | undefined = undefined;
      if (dartsToSubmit.length > 0) { const lastDart = dartsToSubmit[dartsToSubmit.length - 1]; if (lastDart.type === 'single') lastDartType = 'S'; else if (lastDart.type === 'double') lastDartType = 'D'; else if (lastDart.type === 'triple') lastDartType = 'T'; else if (lastDart.type === 'bull') lastDartType = lastDart.number === 50 ? 'BULL' : 'SBULL'; }
      handleScoreSubmit(score, dartsThrown, lastDartType);
    } finally { setSubmitting(false); }
  }

  if (!config) {
    return (<div className="flex items-center justify-center min-h-screen"><div className="text-white">Loading...</div></div>);
  }

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowEndMatchDialog(true)} className="border-red-500/30 text-red-400 hover:bg-red-500/10">
            <X className="w-4 h-4 mr-2" />End
          </Button>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
            <Wifi className="w-3 h-3 mr-1" />
            {config.bestOf.replace('best-of-', 'Best of ')}
          </Badge>
        </div>
        <h2 className="text-lg font-bold text-white">Leg {currentLeg.legNumber} of {legsToWin * 2 - 1}</h2>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-purple-500/30 text-purple-400"><Bot className="w-3 h-3 mr-1" />{botName}</Badge>
        </div>
      </div>

      {/* Main Content - QuickMatch Style */}
      <div className="flex-1 grid grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* LEFT: Dartboard */}
        <Card className="bg-slate-800/50 border-white/10 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-2 border-b border-white/5">
            <span className="text-xs text-gray-400">Dartboard</span>
            <div className="text-xs text-purple-400">{botName}</div>
          </div>
          <div className="flex-1 relative flex items-center justify-center p-4">
            <div className="relative w-full max-w-sm aspect-square">
              <DartboardOverlay hits={dartboardHits} showDebugRings={debugMode} />
            </div>
          </div>
          {isBotThinking && (
            <div className="pb-2 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-lg text-sm">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                <span className="text-slate-300">{botName} is throwing...</span>
              </div>
            </div>
          )}
          {/* Show DartBot's last throw - visible after bot completes turn */}
          {lastThreeDarts.length > 0 && currentPlayer === 'player1' && !isBotThinking && (
            <div className="p-2 bg-slate-800/50 mx-2 mb-2 rounded border border-purple-500/20">
              <div className="text-xs text-purple-400 mb-1 font-medium">{botName}&apos;s Last Throw:</div>
              <div className="flex items-center gap-2">
                {lastThreeDarts.map((dart, i) => (
                  <span key={i} className={`text-sm font-bold px-2 py-1 rounded ${
                    dart.isDouble ? 'bg-red-500/30 text-red-300' : 
                    dart.isTreble ? 'bg-amber-500/30 text-amber-300' :
                    dart.offboard ? 'bg-gray-500/30 text-gray-400' :
                    'bg-slate-700 text-white'
                  }`}>
                    {dart.label}
                  </span>
                ))}
                <span className="text-emerald-400 font-bold ml-auto text-lg">
                  = {lastThreeDarts.reduce((sum, d) => sum + d.score, 0)}
                  {lastThreeDarts.some(d => d.isDouble) && lastThreeDarts.reduce((sum, d) => sum + d.score, 0) > 0 && player2Score === 0 && (
                    <span className="text-xs text-emerald-300 ml-2">CHECKOUT!</span>
                  )}
                </span>
              </div>
            </div>
          )}
          
          {/* Live dart display during bot's turn */}
          {isBotThinking && lastThreeDarts.length > 0 && (
            <div className="p-2 bg-slate-800/50 mx-2 mb-2 rounded border border-purple-500/30">
              <div className="text-xs text-purple-400 mb-1 font-medium">{botName} throwing...</div>
              <div className="flex items-center gap-2">
                {lastThreeDarts.map((dart, i) => (
                  <span key={i} className={`text-sm font-bold px-2 py-1 rounded ${
                    dart.isDouble ? 'bg-red-500/30 text-red-300' : 
                    dart.isTreble ? 'bg-amber-500/30 text-amber-300' :
                    dart.offboard ? 'bg-gray-500/30 text-gray-400' :
                    'bg-slate-700 text-white'
                  }`}>
                    {dart.label}
                  </span>
                ))}
                {lastThreeDarts.length < 3 && (
                  <span className="w-8 h-8 rounded bg-slate-700/50 border-2 border-dashed border-purple-400/30 animate-pulse" />
                )}
              </div>
            </div>
          )}
        </Card>

        {/* RIGHT: Player Cards + Scoring Panel OR Visit History */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {/* Player Cards */}
          <div className="grid grid-cols-2 gap-3">
            <QuickMatchPlayerCard
              name="You"
              remaining={player1Score}
              legs={player1LegsWon}
              legsToWin={legsToWin}
              isActive={currentPlayer === 'player1' && !matchWinner}
              color="text-emerald-400"
              position="left"
              stats={calculateMatchStats(true)}
            />
            <QuickMatchPlayerCard
              name={botName}
              remaining={player2Score}
              legs={player2LegsWon}
              legsToWin={legsToWin}
              isActive={currentPlayer === 'player2' && !matchWinner}
              color="text-purple-400"
              position="right"
              stats={calculateMatchStats(false)}
            />
          </div>

          {/* CONDITIONAL: Show Scoring Panel when my turn, Visit History when bot turn */}
          <Card className="flex-1 bg-slate-800/50 border-white/10 p-3 overflow-hidden">
            {currentPlayer === 'player1' && !matchWinner ? (
              <ScoringPanel
                scoreInput={scoreInput}
                onScoreInputChange={setScoreInput}
                onTypeScoreSubmit={handleTypeScoreSubmit}
                onSubmitVisit={handleSubmitVisit}
                onMiss={handleMiss}
                onBust={handleBust}
                currentDarts={currentVisit}
                onDartClick={handleDartClick}
                onUndoDart={handleUndoDart}
                onClearVisit={handleClearVisit}
                submitting={submitting}
                currentRemaining={player1Score}
                doubleOut={config.doubleOut}
              />
            ) : (
              <VisitHistoryPanel visits={[...allLegs.flatMap(l => l.visits), ...currentLeg.visits]} myName="You" botName={botName} currentLeg={currentLeg.legNumber} />
            )}
          </Card>
        </div>
      </div>

      {/* End Match Dialog */}
      <AlertDialog open={showEndMatchDialog} onOpenChange={setShowEndMatchDialog}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">End Match?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">Are you sure? Your progress will not be saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-600">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReturnToPlay} className="bg-red-500 hover:bg-red-600">End Match</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Winner Popup - Same as QuickMatch */}
      {matchEndStats && matchWinner && (
        <WinnerPopup
          player1={matchEndStats.player1}
          player2={matchEndStats.player2}
          player1Stats={matchEndStats.player1FullStats}
          player2Stats={matchEndStats.player2FullStats}
          winnerId={matchEndStats.winnerId}
          gameMode={config.mode}
          bestOf={legsToWin * 2 - 1}
          onRematch={handleRematch}
          onReturn={handleReturnToPlay}
          rematchStatus='none'
          opponentRematchReady={false}
          youReady={false}
          currentUserId="player1"
        />
      )}

      {/* Darts At Double Modal */}
      {pendingVisitData && (
        <DartsAtDoubleModal
          isOpen={showDartsAtDoubleModal}
          minDarts={pendingVisitData.minDarts}
          isCheckout={pendingVisitData.isCheckout}
          onConfirm={handleDartsAtDoubleConfirm}
          onCancel={() => setShowDartsAtDoubleModal(false)}
        />
      )}
    </div>
  );
}
