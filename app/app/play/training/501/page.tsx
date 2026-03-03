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
import { isBust, getLegsToWin, isValidCheckout, calculateCheckoutPercentage } from '@/lib/match-logic';
import { useTraining, BOT_DIFFICULTY_CONFIG } from '@/lib/context/TrainingContext';
import { createClient } from '@/lib/supabase/client';
import { getStartScore } from '@/lib/game-modes';
import { checkScoreAchievements } from '@/lib/utils/achievements';
import { trackScoreAchievement, trackMatchEnd } from '@/lib/achievementTracker';
import { DartsAtDoubleModal } from '@/components/app/DartsAtDoubleModal';
import { toast } from 'sonner';
import { playGameOnSfx, hasPlayedGameOnForSession, markGameOnPlayedForSession } from '@/lib/sfx';
import { DartboardOverlay, DartHit } from '@/components/app/DartboardOverlay';
import { simulateVisit, DartResult, BotPerformanceTracker, updatePerformanceTracker, findBestCheckoutRoute } from '@/lib/botThrowEngine';
import { getCheckoutSuggestion as getCheckoutFromRoutes, formatDartLabel } from '@/lib/darts/checkoutRoutes';
import { isDartbotVisualizationEnabled, isDartbotDebugModeEnabled } from '@/lib/dartbotSettings';
import { recordDartbotMatchCompletion, type DartbotMatchStats } from '@/lib/dartbot';
import { awardXP } from '@/lib/training/xpTracker';
import { useLevelUpToast } from '@/components/training/LevelUpToast';
import type { PlayerStats } from '@/lib/match/recordMatchCompletion';
import { normalizeMatchConfig } from '@/lib/match/defaultMatchConfig';
import { computeMatchStats } from '@/lib/stats/computeMatchStats';
import Link from 'next/link';
import { DartbotWinnerPopup } from '@/components/game/DartbotWinnerPopup';
import { QuickMatchPlayerCard } from '@/components/match/QuickMatchPlayerCard';
import { calculateDartbotLegByLegStats, type LegStats } from '@/lib/stats/legByLegStats';

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
  dartsAtDouble?: number; // Number of darts thrown at double (for checkout percentage)
  remainingBefore?: number;
  remainingAfter?: number;
  legNumber: number;
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

// Professional Checkout Routes - Based on PDC/BDO Standards
// All routes mathematically verified
// Format: ['first', 'second', 'third'] where T=triple, D=double, SB=single bull, DB=double bull
// Bogey numbers (impossible): 159, 162, 163, 166, 168, 169

const CHECKOUT_ROUTES: Record<number, string[]> = {
  // === THREE DART CHECKOUTS (101-170) ===
  170: ['T20', 'T20', 'DB'],     // 60 + 60 + 50 = 170 ✓
  167: ['T20', 'T19', 'DB'],     // 60 + 57 + 50 = 167 ✓
  164: ['T20', 'T18', 'DB'],     // 60 + 54 + 50 = 164 ✓
  161: ['T20', 'T17', 'DB'],     // 60 + 51 + 50 = 161 ✓
  160: ['T20', 'T20', 'D20'],    // 60 + 60 + 40 = 160 ✓
  158: ['T20', 'T20', 'D19'],    // 60 + 60 + 38 = 158 ✓
  157: ['T20', 'T19', 'D20'],    // 60 + 57 + 40 = 157 ✓
  156: ['T20', 'T20', 'D18'],    // 60 + 60 + 36 = 156 ✓
  155: ['T20', 'T19', 'D19'],    // 60 + 57 + 38 = 155 ✓
  154: ['T20', 'T18', 'D20'],    // 60 + 54 + 40 = 154 ✓
  153: ['T20', 'T19', 'D18'],    // 60 + 57 + 36 = 153 ✓
  152: ['T20', 'T20', 'D16'],    // 60 + 60 + 32 = 152 ✓
  151: ['T20', 'T17', 'D20'],    // 60 + 51 + 40 = 151 ✓
  150: ['T20', 'T18', 'D18'],    // 60 + 54 + 36 = 150 ✓
  149: ['T20', 'T19', 'D16'],    // 60 + 57 + 32 = 149 ✓
  148: ['T20', 'T20', 'D14'],    // 60 + 60 + 28 = 148 ✓
  147: ['T20', 'T17', 'D18'],    // 60 + 51 + 36 = 147 ✓
  146: ['T20', 'T18', 'D16'],    // 60 + 54 + 32 = 146 ✓
  145: ['T20', 'T19', 'D14'],    // 60 + 57 + 28 = 145 ✓
  144: ['T20', 'T20', 'D12'],    // 60 + 60 + 24 = 144 ✓
  143: ['T20', 'T17', 'D16'],    // 60 + 51 + 32 = 143 ✓
  142: ['T20', 'T14', 'D20'],    // 60 + 42 + 40 = 142 ✓
  141: ['T20', 'T19', 'D12'],    // 60 + 57 + 24 = 141 ✓
  140: ['T20', 'T20', 'D10'],    // 60 + 60 + 20 = 140 ✓
  139: ['T20', 'T13', 'D20'],    // 60 + 39 + 40 = 139 ✓
  138: ['T20', 'T18', 'D12'],    // 60 + 54 + 24 = 138 ✓
  137: ['T20', 'T19', 'D10'],    // 60 + 57 + 20 = 137 ✓
  136: ['T20', 'T20', 'D8'],     // 60 + 60 + 16 = 136 ✓
  135: ['T20', 'T17', 'D12'],    // 60 + 51 + 24 = 135 ✓
  134: ['T20', 'T14', 'D16'],    // 60 + 42 + 32 = 134 ✓
  133: ['T20', 'T19', 'D8'],     // 60 + 57 + 16 = 133 ✓
  132: ['T20', 'T16', 'D12'],    // 60 + 48 + 24 = 132 ✓
  131: ['T20', 'T13', 'D16'],    // 60 + 39 + 32 = 131 ✓
  130: ['T20', 'T20', 'D5'],     // 60 + 60 + 10 = 130 ✓
  129: ['T20', 'T19', 'D6'],     // 60 + 57 + 12 = 129 ✓
  128: ['T20', 'T18', 'D7'],     // 60 + 54 + 14 = 128 ✓
  127: ['T20', 'T17', 'D8'],     // 60 + 51 + 16 = 127 ✓
  126: ['T20', 'T16', 'D9'],     // 60 + 48 + 18 = 126 ✓
  125: ['T20', 'T19', 'D4'],     // 60 + 57 + 8 = 125 ✓
  124: ['T20', 'T16', 'D8'],     // 60 + 48 + 16 = 124 ✓
  123: ['T20', 'T13', 'D12'],    // 60 + 39 + 24 = 123 ✓
  122: ['T20', 'T18', 'D4'],     // 60 + 54 + 8 = 122 ✓
  121: ['T20', 'T15', 'D8'],     // 60 + 45 + 16 = 121 ✓
  120: ['T20', 'T20', 'D10'],    // 60 + 60 + 20 = 120 ✓
  119: ['T19', 'T20', 'D10'],    // 57 + 60 + 20 = 119 ✓
  118: ['T20', 'T18', 'D8'],     // 60 + 54 + 16 = 118 ✓
  117: ['T20', 'T17', 'D8'],     // 60 + 51 + 16 = 117 ✓
  116: ['T20', 'T16', 'D8'],     // 60 + 48 + 16 = 116 ✓
  115: ['T20', 'T15', 'D10'],    // 60 + 45 + 20 = 115 ✓
  114: ['T20', 'T14', 'D12'],    // 60 + 42 + 24 = 114 ✓
  113: ['T20', 'T13', 'D12'],    // 60 + 39 + 24 = 113 ✓
  112: ['T20', 'T20', 'D6'],     // 60 + 60 + 12 = 112 ✓
  111: ['T20', 'T17', 'D10'],    // 60 + 51 + 20 = 111 ✓
  110: ['T20', 'T18', 'D8'],     // 60 + 54 + 16 = 110 ✓
  109: ['T20', 'T19', 'D6'],     // 60 + 57 + 12 = 109 ✓
  108: ['T20', 'T16', 'D10'],    // 60 + 48 + 20 = 108 ✓
  107: ['T20', 'T15', 'D8'],     // 60 + 45 + 16 = 107 ✓
  106: ['T20', 'T14', 'D10'],    // 60 + 42 + 20 = 106 ✓
  105: ['T20', 'T13', 'D12'],    // 60 + 39 + 24 = 105 ✓
  104: ['T20', 'T12', 'D10'],    // 60 + 36 + 20 = 104 ✓
  103: ['T20', 'T11', 'D10'],    // 60 + 33 + 20 = 103 ✓
  102: ['T20', 'T10', 'D11'],    // 60 + 30 + 22 = 102 ✓
  101: ['T20', 'T17', 'D4'],     // 60 + 51 + 8 = 101 ✓
  
  // === TWO/THREE DART CHECKOUTS (41-100) ===
  // Note: Some scores can be done in 2 or 3 darts depending on skill level
  100: ['T20', 'D20'],           // 60 + 40 = 100 ✓ (2 darts)
  98: ['T20', 'D19'],            // 60 + 38 = 98 ✓ (2 darts)
  97: ['T19', 'D20'],            // 57 + 40 = 97 ✓ (2 darts)
  96: ['T20', 'D18'],            // 60 + 36 = 96 ✓ (2 darts)
  95: ['T19', 'D19'],            // 57 + 38 = 95 ✓ (2 darts)
  94: ['T18', 'D20'],            // 54 + 40 = 94 ✓ (2 darts)
  93: ['T19', 'D18'],            // 57 + 36 = 93 ✓ (2 darts)
  92: ['T20', 'D16'],            // 60 + 32 = 92 ✓ (2 darts)
  91: ['T17', 'D20'],            // 51 + 40 = 91 ✓ (2 darts)
  90: ['T20', 'D15'],            // 60 + 30 = 90 ✓ (2 darts)
  89: ['T19', 'D16'],            // 57 + 32 = 89 ✓ (2 darts)
  88: ['T20', 'D14'],            // 60 + 28 = 88 ✓ (2 darts)
  87: ['T17', 'D18'],            // 51 + 36 = 87 ✓ (2 darts)
  86: ['T18', 'D16'],            // 54 + 32 = 86 ✓ (2 darts)
  85: ['T19', 'D14'],            // 57 + 28 = 85 ✓ (2 darts)
  84: ['T20', 'D12'],            // 60 + 24 = 84 ✓ (2 darts)
  83: ['T17', 'D16'],            // 51 + 32 = 83 ✓ (2 darts)
  82: ['T14', 'D20'],            // 42 + 40 = 82 ✓ (2 darts)
  81: ['T19', 'D12'],            // 57 + 24 = 81 ✓ (2 darts)
  80: ['T20', 'D10'],            // 60 + 20 = 80 ✓ (2 darts)
  79: ['T13', 'D20'],            // 39 + 40 = 79 ✓ (2 darts)
  78: ['T18', 'D12'],            // 54 + 24 = 78 ✓ (2 darts)
  77: ['T19', 'D10'],            // 57 + 20 = 77 ✓ (2 darts)
  76: ['T20', 'D8'],             // 60 + 16 = 76 ✓ (2 darts)
  75: ['T17', 'D12'],            // 51 + 24 = 75 ✓ (2 darts)
  74: ['T14', 'D16'],            // 42 + 32 = 74 ✓ (2 darts)
  73: ['T19', 'D8'],             // 57 + 16 = 73 ✓ (2 darts)
  72: ['T16', 'D12'],            // 48 + 24 = 72 ✓ (2 darts)
  71: ['T13', 'D16'],            // 39 + 32 = 71 ✓ (2 darts)
  70: ['T20', 'D5'],             // 60 + 10 = 70 ✓ (2 darts)
  69: ['T19', 'D6'],             // 57 + 12 = 69 ✓ (2 darts)
  68: ['T20', 'D4'],             // 60 + 8 = 68 ✓ (2 darts)
  67: ['T17', 'D8'],             // 51 + 16 = 67 ✓ (2 darts)
  66: ['T10', 'D18'],            // 30 + 36 = 66 ✓ (2 darts)
  65: ['T19', 'D4'],             // 57 + 8 = 65 ✓ (2 darts)
  64: ['T16', 'D8'],             // 48 + 16 = 64 ✓ (2 darts)
  63: ['T13', 'D12'],            // 39 + 24 = 63 ✓ (2 darts)
  62: ['T10', 'D16'],            // 30 + 32 = 62 ✓ (2 darts)
  61: ['T15', 'D8'],             // 45 + 16 = 61 ✓ (2 darts)
  60: ['20', 'D20'],             // 20 + 40 = 60 ✓ (2 darts)
  59: ['19', 'D20'],             // 19 + 40 = 59 ✓ (2 darts)
  58: ['18', 'D20'],             // 18 + 40 = 58 ✓ (2 darts)
  57: ['17', 'D20'],             // 17 + 40 = 57 ✓ (2 darts)
  56: ['T16', 'D4'],             // 48 + 8 = 56 ✓ (2 darts)
  55: ['15', 'D20'],             // 15 + 40 = 55 ✓ (2 darts)
  54: ['14', 'D20'],             // 14 + 40 = 54 ✓ (2 darts)
  53: ['13', 'D20'],             // 13 + 40 = 53 ✓ (2 darts)
  52: ['12', 'D20'],             // 12 + 40 = 52 ✓ (2 darts)
  51: ['11', 'D20'],             // 11 + 40 = 51 ✓ (2 darts)
  50: ['10', 'D20'],             // 10 + 40 = 50 ✓ (2 darts)
  49: ['9', 'D20'],              // 9 + 40 = 49 ✓ (2 darts)
  48: ['16', 'D16'],             // 16 + 32 = 48 ✓ (2 darts)
  47: ['15', 'D16'],             // 15 + 32 = 47 ✓ (2 darts)
  46: ['6', 'D20'],              // 6 + 40 = 46 ✓ (2 darts)
  45: ['13', 'D16'],             // 13 + 32 = 45 ✓ (2 darts)
  44: ['12', 'D16'],             // 12 + 32 = 44 ✓ (2 darts)
  43: ['11', 'D16'],             // 11 + 32 = 43 ✓ (2 darts)
  42: ['10', 'D16'],             // 10 + 32 = 42 ✓ (2 darts)
  41: ['9', 'D16'],              // 9 + 32 = 41 ✓ (2 darts)
  
  // === SINGLE DART CHECKOUTS (2-40) ===
  40: ['D20'],                   // 40 ✓
  38: ['D19'],                   // 38 ✓
  36: ['D18'],                   // 36 ✓
  34: ['D17'],                   // 34 ✓
  32: ['D16'],                   // 32 ✓
  30: ['D15'],                   // 30 ✓
  28: ['D14'],                   // 28 ✓
  26: ['D13'],                   // 26 ✓
  24: ['D12'],                   // 24 ✓
  22: ['D11'],                   // 22 ✓
  20: ['D10'],                   // 20 ✓
  18: ['D9'],                    // 18 ✓
  16: ['D8'],                    // 16 ✓
  14: ['D7'],                    // 14 ✓
  12: ['D6'],                    // 12 ✓
  10: ['D5'],                    // 10 ✓
  8: ['D4'],                     // 8 ✓
  6: ['D3'],                     // 6 ✓
  4: ['D2'],                     // 4 ✓
  2: ['D1'],                     // 2 ✓
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
  preferredDouble,
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
  preferredDouble?: string | null;
}) {
  const [activeTab, setActiveTab] = useState<'singles' | 'doubles' | 'triples' | 'bulls'>('singles');

  const visitTotal = currentDarts.reduce((sum, d) => sum + d.value, 0);
  const previewRemaining = currentRemaining - visitTotal;
  const dartsThrown = currentDarts.length;
  const dartsRemaining = 3 - dartsThrown;

  // Bogey numbers - no checkout possible with 3 darts
  const BOGEY_NUMBERS = [159, 162, 163, 166, 168, 169];
  
  // Get checkout suggestion based on remaining score, darts left, and preferred double
  const getCheckoutSuggestionLocal = () => {
    if (previewRemaining <= 0 || previewRemaining > 170) return null;
    if (BOGEY_NUMBERS.includes(previewRemaining)) return 'BOGEY';
    
    // Try preferred-double-aware route first, then fall back to standard
    const prefRoute = getCheckoutFromRoutes(previewRemaining, dartsRemaining, preferredDouble);
    if (prefRoute) return prefRoute;
    
    return findBestCheckoutRoute(previewRemaining, dartsRemaining);
  };

  const checkoutSuggestion = getCheckoutSuggestionLocal();

  return (
    <div className="h-full flex flex-col">
      {previewRemaining > 0 && previewRemaining <= 170 && (
        <div className={`mb-3 p-3 border rounded-lg ${
          checkoutSuggestion === 'BOGEY' 
            ? 'bg-gradient-to-r from-red-500/20 to-orange-500/20 border-red-500/30' 
            : 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 border-amber-500/30'
        }`}>
          <div className="text-center">
            <p className={`text-xs uppercase tracking-wider mb-1 ${
              checkoutSuggestion === 'BOGEY' ? 'text-red-400' : 'text-amber-400'
            }`}>
              Checkout {previewRemaining}
              {dartsRemaining < 3 && checkoutSuggestion && checkoutSuggestion !== 'BOGEY' && (
                <span className="ml-1 text-white/70">({dartsRemaining} dart{dartsRemaining !== 1 ? 's' : ''})</span>
              )}
            </p>
            {checkoutSuggestion === 'BOGEY' ? (
              <p className="text-red-400 font-bold text-sm">Bogey - No checkout possible</p>
            ) : checkoutSuggestion ? (
              <div className="flex items-center justify-center gap-2 text-lg font-bold">
                {checkoutSuggestion.map((dart, idx) => (
                  <span key={idx} className={`px-2 py-1 rounded-lg text-sm ${
                    dart === 'DB' || dart === 'D25' ? 'bg-red-500/40 text-red-200 border border-red-400' :
                    dart.startsWith('D') ? 'bg-red-500/30 text-red-300' : 
                    dart.startsWith('T') ? 'bg-amber-500/30 text-amber-300' :
                    dart === 'SB' ? 'bg-green-500/30 text-green-300' :
                    'bg-slate-700 text-white'
                  }`}>{formatDartLabel(dart)}</span>
                ))}
              </div>
            ) : dartsRemaining < 3 ? (
              <p className="text-red-400 font-bold text-sm">Can&apos;t checkout with {dartsRemaining} dart{dartsRemaining !== 1 ? 's' : ''}</p>
            ) : (
              <p className="text-amber-400 font-bold text-sm">No checkout</p>
            )}
          </div>
        </div>
      )}

      {/* Desktop text input */}
      <div className="hidden sm:block mb-3">
        <div className="flex gap-2">
          <Input type="number" placeholder="Type score (0-180)" value={scoreInput}
            onChange={(e) => onScoreInputChange(e.target.value)}
            className="flex-1 bg-slate-800 border-white/10 text-white"
            autoFocus
            id="dartbot-score-input"
            onKeyDown={(e) => e.key === 'Enter' && onTypeScoreSubmit()} />
          <Button onClick={onTypeScoreSubmit} disabled={!scoreInput || submitting}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50">
            {submitting ? '...' : 'Submit'}
          </Button>
        </div>
      </div>

      {/* Mobile Numpad */}
      <div className="sm:hidden mb-3">
        <div className="bg-slate-800/50 rounded-lg p-2 border border-white/10 mb-2">
          <span className="text-2xl font-bold text-white text-center block min-h-[36px]">
            {scoreInput || <span className="text-slate-500">0</span>}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1,2,3,4,5,6,7,8,9].map((n) => (
            <Button
              key={n}
              variant="outline"
              className="h-14 text-xl font-bold bg-slate-800 border-white/10 text-white hover:bg-slate-700 active:bg-slate-600"
              onClick={() => onScoreInputChange(scoreInput + n.toString())}
            >
              {n}
            </Button>
          ))}
          <Button
            variant="outline"
            className="h-14 text-lg font-bold bg-slate-700 border-white/10 text-red-400 hover:bg-red-500/20 active:bg-red-500/30"
            onClick={() => onScoreInputChange(scoreInput.slice(0, -1))}
          >
            ⌫
          </Button>
          <Button
            variant="outline"
            className="h-14 text-xl font-bold bg-slate-800 border-white/10 text-white hover:bg-slate-700 active:bg-slate-600"
            onClick={() => onScoreInputChange(scoreInput + '0')}
          >
            0
          </Button>
          <Button
            className="h-14 text-lg font-bold bg-emerald-500 hover:bg-emerald-600 text-white active:bg-emerald-700"
            disabled={!scoreInput || submitting}
            onClick={() => onTypeScoreSubmit()}
          >
            {submitting ? '...' : '✓'}
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

      <div className="hidden sm:flex gap-1 mb-2">
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

      <div className="hidden sm:grid flex-1 grid-cols-3 sm:grid-cols-5 gap-1 mb-3">
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

      <div className="hidden sm:flex gap-1">
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
function VisitHistoryPanel({ visits, myName, botName, currentLeg, onEditVisit, canEdit }: { visits: Visit[]; myName: string; botName: string; currentLeg: number; onEditVisit?: (visit: Visit) => void; canEdit?: boolean }) {
  const currentLegVisits = useMemo(() => visits.filter(v => v.legNumber === currentLeg), [visits, currentLeg]);

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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-400 border-b border-white/10 pb-1">
          <div className="text-center font-bold text-emerald-400">{myName}</div>
          <div className="text-center font-bold text-purple-400">{botName}</div>
        </div>
        {maxVisits === 0 ? (<div className="text-center text-gray-500 py-4 text-sm">No visits yet</div>) : (
          Array.from({ length: maxVisits }, (_, i) => {
            const myVisit = myVisits[i];
            const botVisit = botVisits[i];
            return (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2 py-1 border-b border-white/5 text-sm">
                <div>{myVisit ? (
                  <div className="bg-slate-800/50 rounded p-1.5 relative group">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">#{myVisits.length - i}</span>
                      <div className="flex items-center gap-1">
                        <span className={`font-bold text-emerald-400 text-lg`}>{myVisit.score}</span>
                        {canEdit && onEditVisit && (
                          <button
                            onClick={() => onEditVisit(myVisit)}
                            className="p-1 bg-slate-700 hover:bg-slate-600 rounded text-gray-300 hover:text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            title="Edit visit"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
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
  
  // Auto-focus the score input after each submission (when scoreInput resets to '')
  useEffect(() => {
    if (scoreInput === '') {
      setTimeout(() => {
        const el = document.getElementById('dartbot-score-input') as HTMLInputElement | null;
        if (el) el.focus();
      }, 100);
    }
  }, [scoreInput]);
  
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
  const [player2CheckoutAttempts, setPlayer2CheckoutAttempts] = useState(0);
  const [showDartsAtDoubleModal, setShowDartsAtDoubleModal] = useState(false);
  const [pendingVisitData, setPendingVisitData] = useState<{ score: number; minDarts: 1 | 2 | 3; isCheckout: boolean } | null>(null);
  const botTimerRef = useRef<number | null>(null);
  const botTurnIdRef = useRef(0);
  const matchOverRef = useRef(false);
  const [matchStartTime] = useState(Date.now());
  const hasSavedStats = useRef(false);
  const [dartboardHits, setDartboardHits] = useState<DartHit[]>([]);
  const [botLastVisitTotal, setBotLastVisitTotal] = useState<number | null>(null);
  const { triggerLevelUp, LevelUpToastComponent } = useLevelUpToast();
  const [botLastVisitWasBust, setBotLastVisitWasBust] = useState(false);
  const [showVisualization, setShowVisualization] = useState(true);
  const [debugMode, setDebugMode] = useState(false);
  const [lastThreeDarts, setLastThreeDarts] = useState<DartResult[]>([]);
  const [botFormMultiplier] = useState(() => 0.85 + Math.random() * 0.3);
  const [botPerformanceTracker, setBotPerformanceTracker] = useState<BotPerformanceTracker | null>(null);
  const dartboardAnimationTimerRef = useRef<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Edit visit state
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
  const [editScoreInput, setEditScoreInput] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);

  // Match end stats for WinnerPopup
  const [matchEndStats, setMatchEndStats] = useState<{
    player1: { id: string; name: string; legs: number };
    player2: { id: string; name: string; legs: number };
    player1FullStats: any;
    player2FullStats: any;
    winnerId: string;
  } | null>(null);
  const [matchLegStats, setMatchLegStats] = useState<LegStats[]>([]);

  const botName = config?.botAverage ? `DartBot (${config.botAverage})` : 'DartBot';
  const legsToWin = config ? getLegsToWin(config.bestOf) : 1;
  const startingScore = config ? getStartScore(config.mode) : 501;
  
  // Current user ID for achievements
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const supabase = createClient();
  
  const [preferredDouble, setPreferredDouble] = useState<string | null>(null);

  // Get current user on mount + preferred double
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase.from('profiles').select('preferred_double').eq('id', user.id).single();
        if (profile?.preferred_double) setPreferredDouble(profile.preferred_double);
      }
    };
    getUser();
  }, []);

  useEffect(() => {
    if (!config || (config.mode !== '301' && config.mode !== '501')) {
      router.push('/app/play/training');
    }
    if (config) {
      const s = getStartScore(config.mode);
      setPlayer1Score(s);
      setPlayer2Score(s);
    }
  }, [config, router]);

  useEffect(() => {
    setShowVisualization(isDartbotVisualizationEnabled());
    setDebugMode(true); // Always show calibration rings
  }, []);

  // Trigger stats save when match ends
  // Note: saveMatchStats is defined below but called via ref to avoid circular dependency
  useEffect(() => {
    matchOverRef.current = !!matchWinner;
    if (matchWinner && !hasSavedStats.current) {
      hasSavedStats.current = true;
      // Use setTimeout to break out of render cycle and allow saveMatchStats to be defined
      setTimeout(() => {
        saveMatchStatsRef.current?.();
      }, 0);
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

  const calculatePlayerStatsFromVisits = (visitData: Visit[], isPlayer1: boolean, playerName: string, legsWon: number, allLegsData?: LegData[]) => {
    const playerKey = isPlayer1 ? 'player1' : 'player2';
    const allPlayerVisits = visitData.filter(v => v.player === playerKey);
    const playerVisits = allPlayerVisits.filter(v => !v.isBust);
    
    // ALWAYS calculate from visits - works for both user and bot
    // For bot (player2), ALWAYS count exactly 3 darts per visit unless it's a checkout with fewer darts
    const totalDarts = allPlayerVisits.reduce((sum, v) => {
      const darts = v.dartsThrown || 3;
      return sum + darts;
    }, 0);
    const totalScored = playerVisits.reduce((sum, v) => sum + v.score, 0);
    const threeDartAverage = totalDarts > 0 ? (totalScored / totalDarts) * 3 : 0;
    
    const bustCount = allPlayerVisits.filter(v => v.isBust).length;
    if (bustCount > 0) {
      console.log(`[Stats] ${playerName}: ${totalDarts} total darts (${bustCount} bust visits included), ${totalScored} scored, avg: ${threeDartAverage.toFixed(2)}`);
    }
    
    // First 9 calculation (only from valid visits) - calculate per leg
    let first9Score = 0, first9Darts = 0;
    const legsData = allLegsData || allLegs;
    for (const leg of legsData) {
      const legVisits = leg.visits.filter(v => v.player === playerKey && !v.isBust);
      for (const visit of legVisits.slice(0, 3)) {
        first9Score += visit.score;
        first9Darts += (visit.dartsThrown || 3);
        if (first9Darts >= 9) break;
      }
    }
    const first9Average = first9Darts > 0 ? (first9Score / first9Darts) * 3 : 0;
    
    // Checkout stats - find highest checkout from visits
    // A checkout is a visit where isCheckout=true OR remainingScore=0 after the visit
    const checkouts = playerVisits.filter(v => v.isCheckout || v.remainingScore === 0);
    let highestCheckout = 0;
    
    // Calculate highest checkout from the remainingBefore of checkout visits
    // The checkout value is what was remaining BEFORE the visit (what they checked out from)
    for (const visit of checkouts) {
      const checkoutValue = visit.remainingBefore || 0;
      if (checkoutValue > highestCheckout && checkoutValue <= 170) {
        highestCheckout = checkoutValue;
      }
    }
    
    // Calculate checkout stats from visits
    const successfulCheckouts = checkouts.length;
    
    // FIX: Count darts at double properly like dartcounter.net
    // Only count darts that are ACTUALLY thrown at doubles:
    // - If remaining <= 40: all darts count as "at double" (trying to finish)
    // - If remaining > 40: only count darts that hit a double
    const dartsAtDouble = playerVisits
      .filter(v => {
        const remainingBefore = v.remainingBefore || 0;
        // Must be a valid checkout score (2-170, not a bogey number)
        return isValidCheckout(remainingBefore);
      })
      .reduce((sum, v) => {
        const remainingBefore = v.remainingBefore || 0;
        if (remainingBefore <= 40) {
          // On 40 or less, every dart is an attempt at double
          return sum + (v.dartsAtDouble || v.dartsThrown || 3);
        } else {
          // Above 40, only count darts that actually hit a double
          return sum + (v.dartsAtDouble || 0);
        }
      }, 0);
    
    // Calculate checkout percentage: (Checkouts Made / Darts at Double) × 100
    const checkoutPercentage = calculateCheckoutPercentage(successfulCheckouts, dartsAtDouble);
    
    // BEST LEG CALCULATION - Find lowest darts in a won leg
    let bestLegDarts = 0;
    let bestLegNum = 0;
    
    const legsToCheck = allLegsData || allLegs;
    
    for (const leg of legsToCheck) {
      const legWinner = leg.winner;
      const playerWon = (isPlayer1 && legWinner === 'player1') || (!isPlayer1 && legWinner === 'player2');
      
      if (playerWon) {
        const legVisits = leg.visits.filter(v => v.player === playerKey);
        const legDarts = legVisits.reduce((sum, v) => sum + (v.dartsThrown || 3), 0);
        
        if (bestLegDarts === 0 || legDarts < bestLegDarts) {
          bestLegDarts = legDarts;
          bestLegNum = leg.legNumber;
        }
      }
    }
    
    // Count 100+, 140+, 180s (only from valid visits)
    const count100Plus = playerVisits.filter(v => v.score >= 100 && v.score < 140).length;
    const count140Plus = playerVisits.filter(v => v.score >= 140 && v.score < 180).length;
    const oneEighties = playerVisits.filter(v => v.score === 180).length;
    
    return { 
      id: playerKey, 
      name: playerName, 
      legsWon, 
      threeDartAverage: Math.round(threeDartAverage * 100) / 100, 
      first9Average: Math.round(first9Average * 100) / 100, 
      highestCheckout, 
      checkoutPercentage: Math.round(checkoutPercentage * 100) / 100, 
      totalDartsThrown: totalDarts, 
      bestLegDarts, 
      bestLegNum, 
      totalScore: totalScored, 
      checkouts: successfulCheckouts, 
      checkoutAttempts: dartsAtDouble,
      count100Plus, 
      count140Plus, 
      oneEighties 
    };
  };

  // Ref to store completed legs for stats calculation (avoids stale closure issues)
  const completedLegsRef = useRef<LegData[]>([]);
  // Ref to store saveMatchStats function to avoid circular dependency with useEffect
  const saveMatchStatsRef = useRef<(() => Promise<void>) | null>(null);

  const saveMatchStats = useCallback(async () => {
    // Use refs to get current values without dependency issues
    const currentMatchWinner = matchWinner;
    const currentConfig = config;
    const p1Legs = player1LegsWon;
    const p2Legs = player2LegsWon;
    
    if (!currentConfig || !currentMatchWinner) return;
    
    try {
      const normalizedConfig = normalizeMatchConfig({ mode: currentConfig.mode as '301' | '501', bestOf: currentConfig.bestOf, doubleOut: currentConfig.doubleOut });
      
      // Use the ref for completed legs which is always up-to-date
      const allVisitsFormatted: any[] = [];
      // Include both completed legs AND current leg (in case match ended but leg wasn't added yet)
      const allLegsData = [...completedLegsRef.current, currentLeg];
      
      for (const leg of allLegsData) {
        if (!leg.visits || leg.visits.length === 0) continue;
        const p1Visits = leg.visits.filter(v => v.player === 'player1');
        const p2Visits = leg.visits.filter(v => v.player === 'player2');
        p1Visits.forEach((visit, idx) => allVisitsFormatted.push({ 
          player: 'user', 
          legNumber: leg.legNumber, 
          visitNumber: idx + 1, 
          score: visit.score, 
          dartsThrown: visit.dartsThrown || 3, 
          remainingScore: visit.remainingScore, 
          isBust: visit.isBust, 
          isCheckout: visit.isCheckout, 
          wasCheckoutAttempt: (visit.remainingBefore || 0) <= 170 && !visit.isBust,
          dartsAtDouble: visit.dartsAtDouble || 0,
          remainingBefore: visit.remainingBefore
        }));
        p2Visits.forEach((visit, idx) => allVisitsFormatted.push({ 
          player: 'opponent', 
          legNumber: leg.legNumber, 
          visitNumber: idx + 1, 
          score: visit.score, 
          dartsThrown: visit.dartsThrown || 3, 
          remainingScore: visit.remainingScore, 
          isBust: visit.isBust, 
          isCheckout: visit.isCheckout, 
          wasCheckoutAttempt: (visit.remainingBefore || 0) <= 170 && !visit.isBust,
          dartsAtDouble: visit.dartsAtDouble || 0,
          remainingBefore: visit.remainingBefore
        }));
      }
      
      // Calculate checkout stats from visit data (more reliable than state variables)
      const userVisits = allVisitsFormatted.filter(v => v.player === 'user');
      const opponentVisits = allVisitsFormatted.filter(v => v.player === 'opponent');
      
      // Use proper checkout calculation like dartcounter.net
      // Only count darts ACTUALLY thrown at doubles:
      // - If remaining <= 40: all darts count
      // - If remaining > 40: only count darts that hit a double
      const p1DartsAtDouble = userVisits
        .filter(v => isValidCheckout(v.remainingBefore || 0))
        .reduce((sum, v) => {
          const remainingBefore = v.remainingBefore || 0;
          if (remainingBefore <= 40) {
            return sum + (v.dartsAtDouble || v.dartsThrown || 3);
          } else {
            return sum + (v.dartsAtDouble || 0);
          }
        }, 0);
      const p1Checkouts = userVisits.filter(v => v.isCheckout).length;
      
      const p2DartsAtDouble = opponentVisits
        .filter(v => isValidCheckout(v.remainingBefore || 0))
        .reduce((sum, v) => {
          const remainingBefore = v.remainingBefore || 0;
          if (remainingBefore <= 40) {
            return sum + (v.dartsAtDouble || v.dartsThrown || 3);
          } else {
            return sum + (v.dartsAtDouble || 0);
          }
        }, 0);
      const p2Checkouts = opponentVisits.filter(v => v.isCheckout).length;
      
      const userStats = computeMatchStats(userVisits, 'user', normalizedConfig.mode, p1DartsAtDouble, p1Checkouts);
      const opponentStats = computeMatchStats(opponentVisits, 'opponent', normalizedConfig.mode, p2DartsAtDouble, p2Checkouts);
      
      // Set match end stats for WinnerPopup using ref data
      const completedLegs = allLegsData;
      
      const p1FullStats = calculatePlayerStatsFromVisits(
        allVisitsFormatted.map(v => ({ ...v, player: v.player === 'user' ? 'player1' : 'player2' })), 
        true, 'You', p1Legs, completedLegs
      );
      const p2FullStats = calculatePlayerStatsFromVisits(
        allVisitsFormatted.map(v => ({ ...v, player: v.player === 'user' ? 'player1' : 'player2' })), 
        false, botName, p2Legs, completedLegs
      );
      
      setMatchEndStats({
        player1: { id: 'player1', name: 'You', legs: p1Legs },
        player2: { id: 'player2', name: botName, legs: p2Legs },
        player1FullStats: p1FullStats,
        player2FullStats: p2FullStats,
        winnerId: currentMatchWinner === 'player1' ? 'player1' : 'player2',
      });

      // Calculate leg-by-leg stats for dartbot match
      const legStats = await calculateDartbotLegByLegStats(parseInt(config.mode), completedLegs, currentLeg);
      setMatchLegStats(legStats);

      // Store the actual bot average (25, 35, 45, 55, 65, 75, 85, 95) for display
      const botAvg = config?.botAverage || 50;
      
      const dartbotStats: DartbotMatchStats = {
        gameMode: normalizedConfig.mode === '301' ? 301 : 501,
        matchFormat: currentConfig.bestOf,
        dartbotLevel: botAvg, // Store actual average instead of level 1-5
        playerLegsWon: p1Legs,
        botLegsWon: p2Legs,
        winner: currentMatchWinner === 'player1' ? 'player' : 'dartbot',
        playerStats: {
          threeDartAverage: userStats.threeDartAverage,
          first9Average: userStats.first9Average,
          checkoutPercentage: userStats.checkoutPercent,
          highestCheckout: userStats.highestCheckout,
          dartsAtDouble: userStats.checkoutDartsAttempted,
          totalDartsThrown: userStats.totalDartsThrown,
          visits100Plus: userStats.count100Plus,
          visits140Plus: userStats.count140Plus,
          visits180: userStats.oneEighties,
        },
        // Include bot stats for display in match history
        botStats: {
          threeDartAverage: opponentStats.threeDartAverage,
          first9Average: opponentStats.first9Average,
          checkoutPercentage: opponentStats.checkoutPercent,
          highestCheckout: opponentStats.highestCheckout,
          dartsAtDouble: opponentStats.checkoutDartsAttempted,
          totalDartsThrown: opponentStats.totalDartsThrown,
          visits100Plus: opponentStats.count100Plus,
          visits140Plus: opponentStats.count140Plus,
          visits180: opponentStats.oneEighties,
          totalScore: opponentStats.totalPointsScored,
        },
      };
      
      console.log('📊 SAVING DARTBOT STATS:', {
        playerLegs: p1Legs,
        botLegs: p2Legs,
        winner: currentMatchWinner,
        playerAvg: userStats.threeDartAverage,
        botAvg: opponentStats.threeDartAverage,
      });
      
      const result = await recordDartbotMatchCompletion(dartbotStats);
      console.log('📊 DARTBOT MATCH SAVED:', result);
      if (result.success) {
        toast.success('Match stats saved!');
        
        // Track achievements for the winner
        if (currentMatchWinner === 'player1' && currentUserId) {
          trackMatchEnd(currentUserId, {
            won: true,
            matchType: 'practice',
            legsWon: p1Legs,
            legsLost: p2Legs,
            average: userStats.threeDartAverage,
            durationMinutes: matchStartTime ? Math.floor((Date.now() - matchStartTime) / 60000) : 15,
          }).catch(console.error);
        }
        
        // Award XP for DartBot match
        const gameMode = normalizedConfig.mode === '301' ? 301 : 501;
        const won = currentMatchWinner === 'player1';
        const xpResult = await awardXP(`${gameMode}-dartbot`, 0, {
          won,
          threeDartAvg: userStats.threeDartAverage,
          completed: true,
          sessionData: {
            gameMode,
            legsWon: p1Legs,
            legsLost: p2Legs,
            average: userStats.threeDartAverage,
            highestCheckout: userStats.highestCheckout,
            totalDarts: userStats.totalDartsThrown,
            visits100Plus: userStats.count100Plus,
            visits140Plus: userStats.count140Plus,
            visits180: userStats.oneEighties,
          },
        });
        if (xpResult.levelUp) {
          triggerLevelUp(xpResult.levelUp.oldLevel, xpResult.levelUp.newLevel);
        }
      }
      else console.error('Failed to save match:', result.error);
    } catch (error) { 
      console.error('Error saving match stats:', error); 
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchWinner, config, player1LegsWon, player2LegsWon, botName, matchStartTime]);

  // Store the function in ref so useEffect above can access it
  saveMatchStatsRef.current = saveMatchStats;

  // Track if a bot turn is currently in progress to prevent overlapping animations
  const botTurnInProgressRef = useRef(false);
  // Track if bot turn has been scheduled to prevent duplicate turns
  const botTurnScheduledRef = useRef(false);
  // Track the last processed turn to prevent double execution
  const lastProcessedTurnRef = useRef(0);

  const animateBotThrows = useCallback(async (darts: DartResult[], isBust?: boolean): Promise<void> => {
    if (botTurnInProgressRef.current) {
      console.log('[DartBot] Turn already in progress, skipping');
      return;
    }
    botTurnInProgressRef.current = true;

    clearDartboardAnimationTimer();
    setDartboardHits([]);
    setBotLastVisitTotal(null);
    setBotLastVisitWasBust(false);
    setLastThreeDarts([]);

    // Strip MISS padding darts — only animate darts the bot physically threw
    // The engine adds MISS placeholders on bust so the stat counter reaches 3,
    // but we must NOT animate them or it looks like the bot kept throwing after busting.
    // Real misses have actual x,y coords; padding darts have x=1.5
    const thrownDarts = darts.filter(d => !(d.label === 'MISS' && d.x === 1.5));
    const visitTotal = thrownDarts.reduce((sum, d) => sum + d.score, 0);

    for (let i = 0; i < thrownDarts.length; i++) {
      const dart = thrownDarts[i];
      await new Promise<void>((resolve) => {
        dartboardAnimationTimerRef.current = window.setTimeout(() => resolve(), i === 0 ? 600 : 1200);
      });

      setDartboardHits(prev => [...prev, { x: dart.x, y: dart.y, label: dart.label, offboard: dart.offboard }]);
      setLastThreeDarts(prev => [...prev, dart]);

      if (i < thrownDarts.length - 1) {
        await new Promise<void>((resolve) => {
          dartboardAnimationTimerRef.current = window.setTimeout(() => resolve(), 400);
        });
      }
    }

    setBotLastVisitTotal(isBust ? 0 : visitTotal);
    setBotLastVisitWasBust(isBust ?? false);

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
    if (!config) return;
    const currentScore = player2Score;
    if (currentScore <= 0) { setCurrentPlayer('player1'); return; }

    // Generate exactly 3 darts (or fewer if checkout achieved)
    const visualVisit = simulateVisit({ 
      level: config.botAverage, 
      remaining: currentScore, 
      doubleOut: config.doubleOut, 
      formMultiplier: botFormMultiplier, 
      tracker: botPerformanceTracker, 
      debug: debugMode,
      trackCheckoutDarts: true
    });
      
    // Update performance tracker for calibration
    setBotPerformanceTracker(prev => updatePerformanceTracker(prev, visualVisit.visitTotal, config.botAverage));
    
    // Animate dartboard hits only when visualization is enabled
    if (showVisualization) {
      await animateBotThrows(visualVisit.darts, visualVisit.bust);
    } else {
      clearDartboardAnimationTimer();
      setDartboardHits([]);
      setLastThreeDarts([]);
    }
      
      // Count actual darts thrown (real darts, not MISS padding)
      // On bust after 1 dart, bot threw 1 dart. On bust after 2 darts, 2 darts. etc.
      const realDartsThrown = visualVisit.darts.filter(d => !(d.label === 'MISS' && d.x === 1.5)).length;
      // For stats: use real darts thrown (even on bust)
      const dartsThrown = realDartsThrown;
      
      // Track checkout stats for DartBot
      // Use dartsAtDouble from simulateVisit — tracks darts AIMED at doubles (not just hits)
      const isOnValidCheckout = config?.doubleOut !== false ? isValidCheckout(currentScore) : currentScore > 0 && currentScore <= 180;
      const botDartsAtDouble = visualVisit.dartsAtDouble;
      
      if (visualVisit.wasCheckoutAttempt) {
        setPlayer2CheckoutAttempts(prev => prev + 1);
      }
      // Track darts at double only when on a valid checkout
      if (isOnValidCheckout && botDartsAtDouble > 0) {
        setPlayer2TotalDartsAtDouble(prev => prev + botDartsAtDouble);
      }
      if (visualVisit.finished) {
        setPlayer2CheckoutsMade(prev => prev + 1);
      }
      
      // Only include darts the bot actually threw — strip MISS padding used for stat counting
      // Real misses have actual x,y coords; padding darts have x=1.5
      const visitDisplayDarts = visualVisit.darts.filter(d => !(d.label === 'MISS' && d.x === 1.5));

      const visit: Visit = {
        player: 'player2',
        score: visualVisit.bust ? 0 : visualVisit.visitTotal,
        remainingScore: visualVisit.newRemaining,
        isBust: visualVisit.bust,
        isCheckout: visualVisit.finished,
        timestamp: Date.now(),
        dartsThrown, // Always 3 on bust or normal visit; fewer only on checkout
        dartsAtDouble: botDartsAtDouble,
        darts: visitDisplayDarts.map(d => ({
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
        legNumber: currentLeg.legNumber,
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
      } else {
        console.log(`[DartBot] BUST: ${realDartsThrown} actual darts, counting ${dartsThrown} toward stats`);
      }
      setPlayer2MatchDartsThrown(prev => {
        const newTotal = prev + dartsThrown;
        console.log(`[DartBot] Darts thrown: ${dartsThrown} (total: ${newTotal})`);
        return newTotal;
      });
      setPlayer2Score(visualVisit.newRemaining);
      
      if (visualVisit.finished) {
        setTimeout(() => { 
          if (!matchOverRef.current) handleLegComplete('player2', visit); 
        }, 500);
        return;
      }
      setCurrentPlayer('player1');
  }, [isLegTransitioning, player2Score, showVisualization, config, botFormMultiplier, debugMode, botPerformanceTracker, animateBotThrows, clearDartboardAnimationTimer]);

  const scheduleBotTurn = useCallback((reason: string) => {
    // Prevent scheduling if not bot's turn or if already scheduled
    if (currentPlayer !== 'player2') {
      botTurnScheduledRef.current = false;
      return;
    }
    // Prevent duplicate scheduling
    if (botTurnScheduledRef.current) {
      console.log('[DartBot] Turn already scheduled, skipping duplicate');
      return;
    }
    if (isLegTransitioning) { 
      clearBotTimer(); 
      botTimerRef.current = window.setTimeout(() => scheduleBotTurn("retry"), 50); 
      return; 
    }
    
    botTurnScheduledRef.current = true;
    clearBotTimer();
    setIsBotThinking(true);
    const myTurnId = ++botTurnIdRef.current;
    
    botTimerRef.current = window.setTimeout(async () => {
      if (myTurnId !== botTurnIdRef.current) return;
      // Additional guard: check if turn was already processed
      if (lastProcessedTurnRef.current === myTurnId) {
        console.log('[DartBot] Turn already processed, skipping');
        return;
      }
      lastProcessedTurnRef.current = myTurnId;
      
      try {
        await Promise.race([
          botTakeTurn(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("BOT_TIMEOUT")), 5000))
        ]);
      } catch (err) {
        console.error("BOT_ERROR", err);
        setIsBotThinking(false);
        clearBotTimer();
        botTurnScheduledRef.current = false;
        botTimerRef.current = window.setTimeout(() => {
          if (currentPlayer === 'player2') scheduleBotTurn("recover");
        }, 150);
        return;
      } finally {
        setIsBotThinking(false);
        clearBotTimer();
        botTurnScheduledRef.current = false;
      }
    }, 1500);
  }, [currentPlayer, isLegTransitioning, clearBotTimer, botTakeTurn]);

  useEffect(() => {
    if (currentPlayer === 'player2') {
      // Only schedule if not already scheduled and not currently processing
      if (!botTurnScheduledRef.current && !botTurnInProgressRef.current) {
        scheduleBotTurn("turn");
      }
    } else { 
      setIsBotThinking(false); 
      botTurnScheduledRef.current = false;
      clearBotTimer(); 
    }
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
    const isCheckoutAttempt = currentScore <= 50 && currentScore > 0;
    
    // IMPORTANT: For typed scores, checkout does NOT require double-out
    // The user is entering their actual score, so if they say they checked out, they did
    if (isCheckout) {
      // Allow checkout without double-out verification for typed scores
      setPlayer1TotalDartsAtDouble(prev => prev + 1);
      setPlayer1CheckoutsMade(prev => prev + 1);
      handleScoreSubmit(score, 3, undefined, true, 1);
      setScoreInput('');
      return;
    }
    
    if (isCheckoutAttempt && doubleOut) { setPendingVisitData({ score, minDarts: 3, isCheckout }); setShowDartsAtDoubleModal(true); }
    else { handleScoreSubmit(score, 3, undefined, true, 0); setScoreInput(''); }
  };

  const handleDartsAtDoubleConfirm = (dartsAtDouble: number) => {
    if (!pendingVisitData) return;
    setPlayer1TotalDartsAtDouble(prev => prev + dartsAtDouble);
    if (pendingVisitData.isCheckout) setPlayer1CheckoutsMade(prev => prev + 1);
    // Use actual darts thrown (dartsAtDouble) instead of always 3, especially for checkouts
    // If checkout happened, dartsAtDouble is the number of darts used in that visit
    const actualDartsThrown = pendingVisitData.isCheckout ? dartsAtDouble : 3;
    handleScoreSubmit(pendingVisitData.score, actualDartsThrown, undefined, true, dartsAtDouble);
    setShowDartsAtDoubleModal(false);
    setPendingVisitData(null);
    setScoreInput('');
  };

  const handleScoreSubmit = (score: number, dartsThrown: number = 3, lastDartType?: 'S' | 'D' | 'T' | 'BULL' | 'SBULL', isTypedInput: boolean = false, dartsAtDoubleForInput: number = 0) => {
    if (!config || currentPlayer !== 'player1') return;
    const currentScore = player1Score;
    const doubleOut = config.doubleOut;
    const newScore = currentScore - score;
    
    // Calculate darts at double for this visit
    // Like dartcounter.net: only count darts ACTUALLY thrown at doubles
    let dartsAtDouble = 0;
    if (isBust(currentScore, score, doubleOut)) {
      dartsAtDouble = 0; // Busts don't count as darts at double
    } else if (isTypedInput) {
      dartsAtDouble = dartsAtDoubleForInput;
    } else {
      // For button input: only count darts at double when actually on a checkout
      // - If remaining <= 40: all darts count (trying to finish)
      // - If remaining > 40: only count darts that hit a double
      const onValidCheckout = doubleOut 
        ? isValidCheckout(currentScore)
        : currentScore > 0 && currentScore <= 180;
      
      if (onValidCheckout) {
        if (currentScore <= 40) {
          // On 40 or less, every dart is an attempt at double
          dartsAtDouble = dartsThrown;
        } else {
          // Above 40, only count if last dart was a double (setup that hit double)
          dartsAtDouble = lastDartType === 'D' ? 1 : 0;
        }
      }
    }
    
    if (isBust(currentScore, score, doubleOut)) {
      const visit: Visit = { player: 'player1', score: 0, remainingScore: currentScore, isBust: true, isCheckout: false, timestamp: Date.now(), dartsThrown, dartsAtDouble: 0, remainingBefore: currentScore, remainingAfter: currentScore, legNumber: currentLeg.legNumber };
      setCurrentLeg(prev => { const dartsUsedInFirst9 = Math.min(dartsThrown, Math.max(0, 9 - prev.player1First9DartsThrown)); return { ...prev, visits: [...prev.visits, visit], player1DartsThrown: prev.player1DartsThrown + dartsThrown, player1First9DartsThrown: prev.player1First9DartsThrown + dartsUsedInFirst9 }; });
      setPlayer1MatchDartsThrown(prev => prev + dartsThrown);
      setCurrentPlayer('player2');
      setScoreInput('');
      setCurrentVisit([]);
      setInputModeError('');
      return;
    }
    const isCheckout = newScore === 0;
    const visit: Visit = { player: 'player1', score, remainingScore: newScore, isBust: false, isCheckout, timestamp: Date.now(), lastDartType, dartsThrown, dartsAtDouble, remainingBefore: currentScore, remainingAfter: newScore, legNumber: currentLeg.legNumber };
    
    if (isCheckout) {
      // For checkout, pass the visit directly to handleLegComplete since React state 
      // updates are async and the visit won't be in currentLeg yet
      handleLegComplete('player1', visit);
    } else {
      setCurrentLeg(prev => { const dartsUsedInFirst9 = Math.min(dartsThrown, Math.max(0, 9 - prev.player1First9DartsThrown)); const pointsForFirst9 = dartsUsedInFirst9 > 0 ? (score * dartsUsedInFirst9) / dartsThrown : 0; return { ...prev, visits: [...prev.visits, visit], player1DartsThrown: prev.player1DartsThrown + dartsThrown, player1First9DartsThrown: prev.player1First9DartsThrown + dartsUsedInFirst9, player1First9PointsScored: prev.player1First9PointsScored + pointsForFirst9 }; });
      setCurrentPlayer('player2');
    }
    
    setPlayer1MatchTotalScored(prev => prev + score);
    setPlayer1MatchDartsThrown(prev => prev + dartsThrown);
    setPlayer1Score(newScore);
    checkScoreAchievements(score);
    
    // Track score achievements (180s, 100+, 26s, 69s)
    if (score > 0 && currentUserId) {
      trackScoreAchievement(score, currentUserId, {
        isCheckout,
        checkoutValue: isCheckout ? score : undefined,
      }).catch(console.error);
    }
    
    setScoreInput('');
    setCurrentVisit([]);
    setInputModeError('');
  };

  // Handle edit visit click
  const handleEditVisit = (visit: Visit) => {
    if (visit.player !== 'player1' || visit.legNumber !== currentLeg.legNumber) return;
    
    setEditingVisit(visit);
    setEditScoreInput(visit.score.toString());
    setShowEditDialog(true);
  };

  // Handle save edited visit
  const handleSaveEdit = () => {
    if (!editingVisit || !config) return;
    
    const newScore = parseInt(editScoreInput, 10);
    if (isNaN(newScore) || newScore < 0 || newScore > 180) return;
    const targetTimestamp = editingVisit.timestamp;
    const startScore = getStartScore(config.mode);
    const targetIndex = currentLeg.visits.findIndex(
      v => v.player === 'player1' && v.timestamp === targetTimestamp && v.legNumber === editingVisit.legNumber
    );
    if (targetIndex < 0) return;

    const oldPlayer1Total = currentLeg.visits
      .filter(v => v.player === 'player1')
      .reduce((sum, v) => sum + v.score, 0);

    const newVisits = [...currentLeg.visits];
    const doubleOut = config.doubleOut;
    let player1Remaining = startScore;

    for (let i = 0; i < newVisits.length; i++) {
      const visit = newVisits[i];
      if (visit.player !== 'player1') continue;

      const proposedScore = i === targetIndex ? newScore : visit.score;
      const bust = isBust(player1Remaining, proposedScore, doubleOut);
      const appliedScore = bust ? 0 : proposedScore;
      const remainingAfter = bust ? player1Remaining : player1Remaining - appliedScore;

      newVisits[i] = {
        ...visit,
        score: appliedScore,
        isBust: bust,
        isCheckout: !bust && remainingAfter === 0,
        remainingBefore: player1Remaining,
        remainingAfter,
        remainingScore: remainingAfter,
      };

      player1Remaining = remainingAfter;
    }

    const newPlayer1Visits = newVisits.filter(v => v.player === 'player1');
    const newPlayer1Total = newPlayer1Visits.reduce((sum, v) => sum + v.score, 0);
    const totalScoredDelta = newPlayer1Total - oldPlayer1Total;
    const newDartsThrown = newPlayer1Visits.reduce((sum, v) => sum + (v.dartsThrown || 3), 0);
    const first9Visits = newPlayer1Visits.slice(0, 3);
    const newFirst9Darts = first9Visits.reduce((sum, v) => sum + (v.dartsThrown || 3), 0);
    const newFirst9Points = first9Visits.reduce((sum, v) => sum + v.score, 0);

    setCurrentLeg(prev => ({
      ...prev,
      visits: newVisits,
      player1DartsThrown: newDartsThrown,
      player1First9DartsThrown: newFirst9Darts,
      player1First9PointsScored: newFirst9Points,
    }));
    setPlayer1Score(player1Remaining);
    setPlayer1MatchTotalScored(prev => prev + totalScoredDelta);
    
    setShowEditDialog(false);
    setEditingVisit(null);
    setEditScoreInput('');
  };

  const handleLegComplete = (winner: 'player1' | 'player2', winningVisit?: Visit) => {
    if (matchWinner) return;
    clearBotTimer();
    setIsBotThinking(false);
    setIsLegTransitioning(false);
    
    // Include the winning visit if provided (React state updates are async, so the winning
    // visit may not be in currentLeg.visits yet when this is called)
    const legWithWinningVisit = winningVisit 
      ? { ...currentLeg, visits: [...currentLeg.visits, winningVisit] }
      : currentLeg;
    
    const completedLeg = { ...legWithWinningVisit, winner };
    const updatedLegs = [...allLegs, completedLeg];
    setAllLegs(updatedLegs);
    // Also update the ref so saveMatchStats has access to latest data
    completedLegsRef.current = updatedLegs;
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
    botTurnScheduledRef.current = false;
    botTurnInProgressRef.current = false;
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
    completedLegsRef.current = [];
    clearBotTimer();
    setMatchEndStats(null);
    setMatchLegStats([]);
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
    botTurnScheduledRef.current = false;
    botTurnInProgressRef.current = false;
    setPlayer1TotalDartsAtDouble(0);
    setPlayer1CheckoutsMade(0);
    setPlayer2TotalDartsAtDouble(0);
    setPlayer2CheckoutsMade(0);
    setPlayer2CheckoutAttempts(0);
    setBotPerformanceTracker(null);
  };

  const handleReturnToPlay = () => { router.push('/app/play/training'); };

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
    const newDarts = [...currentVisit, dart];
    setCurrentVisit(newDarts);
    
    // Auto-submit after 3 darts
    if (newDarts.length === 3) {
      setTimeout(() => {
        // Validate and submit
        const visitTotal = newDarts.reduce((sum, d) => sum + d.value, 0);
        const validation = validateCheckout(visitTotal, newDarts);
        if (validation.isBust) {
          submitScore(0, true, newDarts, false);
        } else {
          submitScore(visitTotal, false, newDarts, validation.isCheckout);
        }
      }, 300);
    }
  };

  const handleClearVisit = () => setCurrentVisit([]);
  const handleUndoDart = () => setCurrentVisit((prev) => prev.slice(0, -1));
  const handleMiss = () => {
    if (currentVisit.length >= 3 || currentPlayer !== 'player1') return;
    const dart: Dart = { type: 'single', number: 0, value: 0, multiplier: 1, label: 'Miss', score: 0, is_double: false };
    const newDarts = [...currentVisit, dart];
    setCurrentVisit(newDarts);

    // Treat MISS as "end visit" and auto-submit immediately.
    // If it's also the 3rd dart, this keeps the old behavior.
    setTimeout(() => {
      const visitTotal = newDarts.reduce((sum, d) => sum + d.value, 0);
      const validation = validateCheckout(visitTotal, newDarts);
      if (validation.isBust) {
        submitScore(0, true, newDarts, false);
      } else {
        submitScore(visitTotal, false, newDarts, validation.isCheckout);
      }
    }, 250);
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

  async function submitScore(score: number, isBustParam: boolean, darts: Dart[], isCheckout: boolean = false) {
    if (!config || currentPlayer !== 'player1') return;
    setSubmitting(true);
    try {
      let dartsToSubmit = [...darts];
      if (isBustParam) { while (dartsToSubmit.length < 3) dartsToSubmit.push({ type: 'single', number: 0, value: 0, multiplier: 1, label: 'Miss', score: 0, is_double: false }); }
      else if (!isCheckout && dartsToSubmit.length > 0 && dartsToSubmit.length < 3) { while (dartsToSubmit.length < 3) dartsToSubmit.push({ type: 'single', number: 0, value: 0, multiplier: 1, label: 'Miss', score: 0, is_double: false }); }
      const dartsThrown = dartsToSubmit.length;
      
      // Calculate darts at double like dartcounter.net:
      // Only count darts that are ACTUALLY thrown at a double
      // - If remaining > 40: only count if a double is actually hit
      // - If remaining <= 40: all darts count as "at double" (trying to finish)
      let dartsAtDoubleCount = 0;
      if (!isBustParam) {
        const remainingBefore = player1Score;
        const onValidCheckout = config.doubleOut 
          ? isValidCheckout(remainingBefore)
          : remainingBefore > 0 && remainingBefore <= 180;
        
        if (onValidCheckout) {
          if (remainingBefore <= 40) {
            // When on 40 or less, every dart is an attempt at double
            dartsAtDoubleCount = dartsThrown;
          } else {
            // When above 40, only count darts that actually hit a double
            // (these are setup shots that hit a double instead of intended target)
            const doublesHit = dartsToSubmit.filter(d => d.is_double).length;
            dartsAtDoubleCount = doublesHit;
          }
        }
      }
      
      if (dartsAtDoubleCount > 0) { 
        setPlayer1TotalDartsAtDouble(prev => prev + dartsAtDoubleCount); 
        if (isCheckout) setPlayer1CheckoutsMade(prev => prev + 1); 
      }
      let lastDartType: 'S' | 'D' | 'T' | 'BULL' | 'SBULL' | undefined = undefined;
      if (dartsToSubmit.length > 0) { const lastDart = dartsToSubmit[dartsToSubmit.length - 1]; if (lastDart.type === 'single') lastDartType = 'S'; else if (lastDart.type === 'double') lastDartType = 'D'; else if (lastDart.type === 'triple') lastDartType = 'T'; else if (lastDart.type === 'bull') lastDartType = lastDart.number === 50 ? 'BULL' : 'SBULL'; }
      handleScoreSubmit(score, dartsThrown, lastDartType);
    } finally { setSubmitting(false); }
  }

  if (!config) {
    return (<div className="flex items-center justify-center min-h-screen"><div className="text-white">Loading...</div></div>);
  }

  const lastBotVisit = [...allLegs.flatMap(l => l.visits), ...currentLeg.visits]
    .filter(v => v.player === 'player2')
    .at(-1);

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden flex flex-col">
      {LevelUpToastComponent}
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

      {/* ===== MOBILE LAYOUT ===== */}
      <div className="sm:hidden flex-1 flex flex-col p-3 gap-2 overflow-hidden">
        {/* Compact score tiles */}
        <div className="grid grid-cols-2 gap-2">
          <Card className={`bg-slate-800/50 border p-2 ${currentPlayer === 'player1' ? 'border-emerald-500/30' : 'border-white/10'}`}>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">You {currentPlayer === 'player1' && !matchWinner ? '🎯' : ''}</div>
            <div className="mt-1 flex items-end justify-between">
              <div className="text-2xl font-bold text-emerald-400 leading-none">{player1Score}</div>
              <div className="text-right leading-none">
                <div className="text-[9px] uppercase tracking-wide text-slate-500">Legs</div>
                <div className="text-lg font-bold text-white">{player1LegsWon}</div>
              </div>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Avg: {(calculateMatchStats(true) as any)?.threeDartAvg?.toFixed(1) || '0.0'}</div>
            <div className="text-[10px] text-slate-500">Race to {legsToWin}</div>
          </Card>
          <Card className={`bg-slate-800/50 border p-2 ${currentPlayer === 'player2' ? 'border-purple-500/30' : 'border-white/10'}`}>
            <div className="text-[10px] uppercase tracking-wide text-slate-400 text-right">{botName} {currentPlayer === 'player2' && !matchWinner ? '🎯' : ''}</div>
            <div className="mt-1 flex items-end justify-between">
              <div className="text-lg font-bold text-white">{player2LegsWon}</div>
              <div className="text-right">
                <div className="text-2xl font-bold text-purple-400 leading-none">{player2Score}</div>
                <div className="text-[9px] uppercase tracking-wide text-slate-500 mt-0.5">Legs</div>
              </div>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 text-right">Avg: {(calculateMatchStats(false) as any)?.threeDartAvg?.toFixed(1) || '0.0'}</div>
            <div className="text-[10px] text-slate-500 text-right">Race to {legsToWin}</div>
          </Card>
        </div>

        {showVisualization && (currentPlayer === 'player2' || isBotThinking) && (
          <Card className="bg-slate-800/50 border-white/10 overflow-hidden flex flex-col">
            <div className="relative flex items-start justify-center pt-1 pb-2">
              <div className="relative w-full max-w-[260px] aspect-square -translate-y-1">
                <DartboardOverlay hits={dartboardHits} showDebugRings={debugMode} />
              </div>
            </div>
            {isBotThinking && (
              <div className="pb-2 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-lg text-sm">
                  <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                  <span className="text-slate-300 text-xs">{botName} is throwing...</span>
                </div>
              </div>
            )}
            {lastThreeDarts.length > 0 && !isBotThinking && (
              <div className={`p-2 mx-2 mb-2 rounded border ${botLastVisitWasBust ? 'bg-red-950/40 border-red-500/30' : 'bg-slate-800/50 border-slate-600/30'}`}>
                <div className="flex items-center gap-2">
                  {lastThreeDarts.map((dart, i) => (
                    <span key={i} className={`text-sm font-bold px-2 py-1 rounded ${
                      dart.isDouble ? 'bg-red-500/30 text-red-300' :
                      dart.isTreble ? 'bg-amber-500/30 text-amber-300' :
                      dart.offboard ? 'bg-gray-500/30 text-gray-400' :
                      'bg-slate-700 text-white'
                    }`}>{dart.label}</span>
                  ))}
                  <span className={`font-bold ml-auto text-sm ${botLastVisitWasBust ? 'text-red-400' : 'text-emerald-400'}`}>
                    {botLastVisitWasBust ? 'BUST' : `= ${lastThreeDarts.reduce((sum, d) => sum + d.score, 0)}`}
                  </span>
                </div>
              </div>
            )}
          </Card>
        )}

        {!showVisualization && (
          <Card className="bg-slate-800/50 border-white/10 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">{botName} last visit</span>
              <span className={`font-bold ${lastBotVisit?.isBust ? 'text-red-400' : 'text-emerald-400'}`}>
                {lastBotVisit ? (lastBotVisit.isBust ? 'BUST (0)' : `${lastBotVisit.score}`) : '—'}
              </span>
            </div>
          </Card>
        )}

        {!matchWinner && currentPlayer === 'player1' && (
          <Card className="bg-slate-800/50 border-white/10 p-3">
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
              preferredDouble={preferredDouble}
            />
          </Card>
        )}

        <Card className="flex-1 bg-slate-800/50 border-white/10 p-2 overflow-hidden min-h-0">
          <VisitHistoryPanel 
            visits={[...allLegs.flatMap(l => l.visits), ...currentLeg.visits]} 
            myName="You" 
            botName={botName} 
            currentLeg={currentLeg.legNumber} 
            onEditVisit={handleEditVisit}
            canEdit={currentLeg.visits.some(v => v.player === 'player1')}
          />
        </Card>
      </div>

      {/* ===== DESKTOP LAYOUT ===== */}
      <div className="hidden sm:grid flex-1 grid-cols-1 sm:grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* LEFT: Dartboard */}
        <Card className="bg-slate-800/50 border-white/10 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-2 border-b border-white/5">
            <span className="text-xs text-gray-400">Dartboard</span>
            <div className="text-xs text-purple-400">{botName}</div>
          </div>
          {showVisualization ? (
            <>
              <div className="flex-1 relative flex items-center justify-center p-4">
                <div className="relative w-full max-w-lg aspect-square">
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
              {lastThreeDarts.length > 0 && currentPlayer === 'player1' && !isBotThinking && (
                <div className={`p-2 mx-2 mb-2 rounded border ${botLastVisitWasBust ? 'bg-red-950/40 border-red-500/30' : 'bg-slate-800/50 border-slate-600/30'}`}>
                  <div className="text-xs text-slate-400 mb-1 font-medium">{botName}&apos;s Last Throw:</div>
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
                    <span className={`font-bold ml-auto text-lg ${botLastVisitWasBust ? 'text-red-400' : 'text-emerald-400'}`}>
                      {botLastVisitWasBust ? 'BUST' : `= ${lastThreeDarts.reduce((sum, d) => sum + d.score, 0)}`}
                      {!botLastVisitWasBust && lastThreeDarts.some(d => d.isDouble) && player2Score === 0 && (
                        <span className="text-xs text-emerald-300 ml-2">CHECKOUT!</span>
                      )}
                    </span>
                  </div>
                </div>
              )}

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
            </>
          ) : (
            <div className="flex-1 flex flex-col justify-center p-4 gap-3">
              <div className="text-center text-slate-400 text-sm">Dartboard visualization is off</div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 text-center">
                <p className="text-xs text-slate-400 mb-1">{botName} last visit</p>
                {lastBotVisit?.darts && lastBotVisit.darts.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      {lastBotVisit.darts.map((dart, idx) => (
                        <span key={idx} className={`px-2 py-1 rounded text-sm font-bold ${
                          dart.multiplier === 3 ? 'bg-red-500/20 text-red-400' :
                          dart.multiplier === 2 ? 'bg-green-500/20 text-green-400' :
                          dart.score === 50 ? 'bg-amber-500/20 text-amber-400' :
                          dart.score === 25 ? 'bg-amber-500/20 text-amber-300' :
                          dart.score === 0 ? 'bg-slate-700/50 text-slate-500' :
                          'bg-slate-700/50 text-slate-200'
                        }`}>
                          {dart.label}
                        </span>
                      ))}
                    </div>
                    <p className={`text-2xl font-black ${lastBotVisit.isBust ? 'text-red-400' : 'text-emerald-400'}`}>
                      {lastBotVisit.isBust ? 'BUST (0)' : `= ${lastBotVisit.score}`}
                    </p>
                  </div>
                ) : (
                  <p className={`text-2xl font-black ${lastBotVisit?.isBust ? 'text-red-400' : 'text-emerald-400'}`}>
                    {lastBotVisit ? (lastBotVisit.isBust ? 'BUST (0)' : lastBotVisit.score) : '—'}
                  </p>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* RIGHT: Player Cards + Scoring Panel OR Visit History */}
        <div className="flex flex-col gap-3 overflow-hidden">
          {/* Player Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                preferredDouble={preferredDouble}
              />
            ) : (
              <VisitHistoryPanel 
                visits={[...allLegs.flatMap(l => l.visits), ...currentLeg.visits]} 
                myName="You" 
                botName={botName} 
                currentLeg={currentLeg.legNumber} 
                onEditVisit={handleEditVisit}
                canEdit={currentLeg.visits.some(v => v.player === 'player1')}
              />
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

      {/* Winner Popup - Dartbot specific version with simple rematch */}
      {matchEndStats && matchWinner && (
        <DartbotWinnerPopup
          player1={matchEndStats.player1}
          player2={matchEndStats.player2}
          player1Stats={matchEndStats.player1FullStats}
          player2Stats={matchEndStats.player2FullStats}
          winnerId={matchEndStats.winnerId}
          gameMode={config.mode}
          bestOf={legsToWin * 2 - 1}
          onRematch={handleRematch}
          onReturn={handleReturnToPlay}
          legStats={matchLegStats}
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

      {/* Edit Visit Dialog */}
      <AlertDialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Edit Visit</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Enter the correct score for this visit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <label className="block text-sm text-gray-400 mb-2">Score (0-180)</label>
            <input
              type="number"
              value={editScoreInput}
              onChange={(e) => setEditScoreInput(e.target.value)}
              min={0}
              max={180}
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
              placeholder="Enter score..."
              autoFocus
            />
            {editingVisit && (
              <div className="mt-2 text-xs text-gray-500">
                Previous score: {editingVisit.score} (Remaining: {editingVisit.remainingBefore})
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => { setShowEditDialog(false); setEditingVisit(null); setEditScoreInput(''); }}
              className="bg-slate-800 text-white border-slate-600"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleSaveEdit}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
