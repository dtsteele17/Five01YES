'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { LogOut, Wifi, WifiOff, UserPlus, Camera, CameraOff, Edit2, Trash2, RotateCcw, Check, Loader2, Trophy, Home } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { mapRoomToMatchState, type MappedMatchState } from '@/lib/match/mapRoomToMatchState';
import { trackScoreAchievement, trackCheckoutAchievement, processMatchEnd } from '@/lib/achievementTracker';
import { TrustRatingBadge } from '@/components/app/TrustRatingBadge';
import { useMatchWebRTC } from '@/lib/hooks/useMatchWebRTC';
import { clearMatchState } from '@/lib/utils/match-resume';
import { getTrustRatingDescription, getUnratedLabel } from '@/lib/utils/trust-rating';
import { QuickMatchPlayerCard } from '@/components/match/QuickMatchPlayerCard';
import { MatchChatDrawer } from '@/components/match/MatchChatDrawer';
import { Separator } from '@/components/ui/separator';
import { MessageCircle } from 'lucide-react';
import { WinnerPopup } from '@/components/game/WinnerPopup';
import { useQuickMatchRematch } from '@/lib/hooks/useQuickMatchRematch';
import { CoinTossModal } from '@/components/game/CoinTossModal';
import { CheckoutDetailsDialog } from '@/components/game/CheckoutDetailsDialog';
import { PreGameLobby } from '@/components/match/PreGameLobby';

interface Dart {
  type: 'single' | 'double' | 'triple' | 'bull';
  number: number;
  value: number;
  multiplier: number;
  label: string;
  score: number;
  is_double: boolean;
}

interface MatchRoom {
  id: string;
  player1_id: string;
  player2_id: string;
  game_mode: number;
  match_format: string;
  match_type: string;
  status: string;
  current_leg: number;
  legs_to_win: number;
  player1_remaining: number;
  player2_remaining: number;
  current_turn: string;
  winner_id: string | null;
  double_out: boolean;
  player1_legs: number;
  player2_legs: number;
  source: string;
  coin_toss_winner_id?: string | null;
  coin_toss_completed?: boolean;
  leg_starter_id?: string | null;
  player1_ready?: boolean;
  player2_ready?: boolean;
  pregame_status?: 'waiting' | 'ready' | 'timeout' | 'cancelled';
  player1_rematch?: boolean;
  player2_rematch?: boolean;
  rematch_room_id?: string | null;
}

interface Profile {
  user_id: string;
  username: string;
  trust_rating_letter?: string;
}

interface QuickMatchVisit {
  id: string;
  room_id: string;
  player_id: string;
  leg: number;
  turn_no: number;
  score: number;
  remaining_before: number;
  remaining_after: number;
  darts: any[];
  darts_thrown: number;
  darts_at_double: number;
  is_bust: boolean;
  bust_reason: string | null;
  is_checkout: boolean;
  created_at: string;
}

// Debug helper to trace visit data
function logVisitsDebug(context: string, visits: QuickMatchVisit[], p1Id: string, p2Id: string) {
  console.log(`[${context}] VISITS DEBUG:`, {
    totalVisits: visits.length,
    p1Visits: visits.filter(v => v.player_id === p1Id).length,
    p2Visits: visits.filter(v => v.player_id === p2Id).length,
    p1Checkouts: visits.filter(v => v.player_id === p1Id && v.is_checkout).length,
    p2Checkouts: visits.filter(v => v.player_id === p2Id && v.is_checkout).length,
  });
  
  // Log all visits with player info
  visits.forEach((v, i) => {
    const isP1 = v.player_id === p1Id;
    const isP2 = v.player_id === p2Id;
    console.log(`[${context}] Visit ${i}: player=${isP1 ? 'P1' : isP2 ? 'P2' : 'UNKNOWN'}, leg=${v.leg}, score=${v.score}, checkout=${v.is_checkout}`);
  });
}

// Checkout routes for common scores
const CHECKOUT_ROUTES: Record<number, string[]> = {
  170: ['T20', 'T20', 'DB'],
  167: ['T20', 'T19', 'DB'],
  164: ['T20', 'T18', 'DB'],
  161: ['T20', 'T17', 'DB'],
  160: ['T20', 'T20', 'D20'],
  158: ['T20', 'T20', 'D19'],
  157: ['T20', 'T19', 'D20'],
  156: ['T20', 'T20', 'D18'],
  155: ['T20', 'T19', 'D19'],
  154: ['T20', 'T18', 'D20'],
  153: ['T20', 'T19', 'D18'],
  152: ['T20', 'T20', 'D16'],
  151: ['T20', 'T17', 'D20'],
  150: ['T20', 'T18', 'D18'],
  149: ['T20', 'T19', 'D16'],
  148: ['T20', 'T20', 'D14'],
  147: ['T20', 'T17', 'D18'],
  146: ['T20', 'T18', 'D16'],
  145: ['T20', 'T19', 'D14'],
  144: ['T20', 'T20', 'D12'],
  143: ['T20', 'T17', 'D16'],
  142: ['T20', 'T14', 'D20'],
  141: ['T20', 'T19', 'D12'],
  140: ['T20', 'T20', 'D10'],
  139: ['T20', 'T13', 'D20'],
  138: ['T20', 'T18', 'D12'],
  137: ['T20', 'T19', 'D10'],
  136: ['T20', 'T20', 'D8'],
  135: ['T20', 'T17', 'D12'],
  134: ['T20', 'T14', 'D16'],
  133: ['T20', 'T19', 'D8'],
  132: ['T20', 'T16', 'D12'],
  131: ['T20', 'T13', 'D16'],
  130: ['T20', 'T20', 'D5'],
  129: ['T20', 'T19', 'D6'],
  128: ['T20', 'T18', 'D7'],
  127: ['T20', 'T17', 'D8'],
  126: ['T20', 'T16', 'D9'],
  125: ['T20', 'T19', 'D4'],
  124: ['T20', 'T16', 'D8'],
  123: ['T20', 'T13', 'D12'],
  122: ['T20', 'T18', 'D4'],
  121: ['T20', 'T15', 'D8'],
  120: ['T20', 'T20', 'D10'],
  119: ['T19', 'T20', 'D10'],
  118: ['T20', 'T18', 'D8'],
  117: ['T20', 'T17', 'D8'],
  116: ['T20', 'T16', 'D8'],
  115: ['T20', 'T15', 'D10'],
  114: ['T20', 'T14', 'D12'],
  113: ['T20', 'T13', 'D12'],
  112: ['T20', 'T20', 'D6'],
  111: ['T20', 'T17', 'D10'],
  110: ['T20', 'T18', 'D8'],
  109: ['T20', 'T19', 'D6'],
  108: ['T20', 'T16', 'D10'],
  107: ['T20', 'T15', 'D8'],
  106: ['T20', 'T14', 'D10'],
  105: ['T20', 'T13', 'D12'],
  104: ['T20', 'T12', 'D10'],
  103: ['T20', 'T11', 'D10'],
  102: ['T20', 'T10', 'D11'],
  101: ['T20', 'T17', 'D4'],
  100: ['T20', 'T20', 'D10'],
  99: ['T20', 'T19', 'D1'],
  98: ['T20', 'T18', 'D1'],
  97: ['T20', 'T17', 'D2'],
  96: ['T20', 'T20', 'D3'],
  95: ['T20', 'T15', 'D5'],
  94: ['T20', 'T14', 'D4'],
  93: ['T20', 'T19', 'D1'],
  92: ['T20', 'T20', 'D1'],
  91: ['T20', 'T17', 'D1'],
  90: ['T20', 'T10', 'D10'],
  89: ['T19', 'T20', 'D1'],
  88: ['T20', 'T16', 'D2'],
  87: ['T20', 'T17', 'D2'],
  86: ['T20', 'T18', 'D1'],
  85: ['T20', 'T15', 'D5'],
  84: ['T20', 'T14', 'D4'],
  83: ['T20', 'T13', 'D5'],
  82: ['T20', 'T14', 'D5'],
  81: ['T20', 'T15', 'D3'],
  80: ['T20', 'D20'],
  79: ['T19', 'D20'],
  78: ['T18', 'D20'],
  77: ['T19', 'D19'],
  76: ['T20', 'D18'],
  75: ['T17', 'D20'],
  74: ['T14', 'D20'],
  73: ['T19', 'D18'],
  72: ['T20', 'D16'],
  71: ['T13', 'D20'],
  70: ['T20', 'D5'],
  69: ['T19', 'D6'],
  68: ['T20', 'D4'],
  67: ['T17', 'D8'],
  66: ['T10', 'D18'],
  65: ['T19', 'D4'],
  64: ['T16', 'D8'],
  63: ['T13', 'D12'],
  62: ['T10', 'D16'],
  61: ['T15', 'D8'],
  60: ['20', 'D20'],
  59: ['19', 'D20'],
  58: ['18', 'D20'],
  57: ['17', 'D20'],
  56: ['16', 'D20'],
  55: ['15', 'D20'],
  54: ['14', 'D20'],
  53: ['13', 'D20'],
  52: ['12', 'D20'],
  51: ['11', 'D20'],
  50: ['10', 'D20'],
  49: ['9', 'D20'],
  48: ['8', 'D20'],
  47: ['15', 'D16'],
  46: ['6', 'D20'],
  45: ['13', 'D16'],
  44: ['12', 'D16'],
  43: ['11', 'D16'],
  42: ['10', 'D16'],
  41: ['9', 'D16'],
  40: ['D20'],
  39: ['7', 'D16'],
  38: ['D19'],
  37: ['5', 'D16'],
  36: ['D18'],
  35: ['3', 'D16'],
  34: ['D17'],
  33: ['1', 'D16'],
  32: ['D16'],
  31: ['7', 'D12'],
  30: ['D15'],
  29: ['13', 'D8'],
  28: ['D14'],
  27: ['11', 'D8'],
  26: ['D13'],
  25: ['9', 'D8'],
  24: ['D12'],
  23: ['7', 'D8'],
  22: ['D11'],
  21: ['5', 'D8'],
  20: ['D10'],
  19: ['3', 'D8'],
  18: ['D9'],
  17: ['1', 'D8'],
  16: ['D8'],
  15: ['7', 'D4'],
  14: ['D7'],
  13: ['5', 'D4'],
  12: ['D6'],
  11: ['3', 'D4'],
  10: ['D5'],
  9: ['1', 'D4'],
  8: ['D4'],
  7: ['3', 'D2'],
  6: ['D3'],
  5: ['1', 'D2'],
  4: ['D2'],
  3: ['1', 'D1'],
  2: ['D1'],
};

// 2-dart checkout routes (for when 1 dart already thrown)
const CHECKOUT_ROUTES_2_DARTS: Record<number, string[]> = {
  110: ['T20', 'DB'],
  107: ['T19', 'DB'],
  104: ['T18', 'DB'],
  101: ['T17', 'DB'],
  100: ['T20', 'D20'],
  98: ['T20', 'D19'],
  97: ['T19', 'D20'],
  96: ['T20', 'D18'],
  95: ['T19', 'D19'],
  94: ['T18', 'D20'],
  93: ['T19', 'D18'],
  92: ['T20', 'D16'],
  91: ['T17', 'D20'],
  90: ['T20', 'D15'],
  89: ['T19', 'D16'],
  88: ['T20', 'D14'],
  87: ['T17', 'D18'],
  86: ['T18', 'D16'],
  85: ['T19', 'D14'],
  84: ['T20', 'D12'],
  83: ['T17', 'D16'],
  82: ['T14', 'D20'],
  81: ['T19', 'D12'],
  80: ['T20', 'D10'],
  79: ['T13', 'D20'],
  78: ['T18', 'D12'],
  77: ['T19', 'D10'],
  76: ['T20', 'D8'],
  75: ['T17', 'D12'],
  74: ['T14', 'D16'],
  73: ['T19', 'D8'],
  72: ['T16', 'D12'],
  71: ['T13', 'D16'],
  70: ['T20', 'D5'],
  69: ['T19', 'D6'],
  68: ['T20', 'D4'],
  67: ['T17', 'D8'],
  66: ['T10', 'D18'],
  65: ['T19', 'D4'],
  64: ['T16', 'D8'],
  63: ['T13', 'D12'],
  62: ['T10', 'D16'],
  61: ['T15', 'D8'],
  60: ['20', 'D20'],
  59: ['19', 'D20'],
  58: ['18', 'D20'],
  57: ['17', 'D20'],
  56: ['16', 'D20'],
  55: ['15', 'D20'],
  54: ['14', 'D20'],
  53: ['13', 'D20'],
  52: ['12', 'D20'],
  51: ['11', 'D20'],
  50: ['10', 'D20'],
  49: ['9', 'D20'],
  48: ['8', 'D20'],
  47: ['15', 'D16'],
  46: ['6', 'D20'],
  45: ['13', 'D16'],
  44: ['12', 'D16'],
  43: ['11', 'D16'],
  42: ['10', 'D16'],
  41: ['9', 'D16'],
  40: ['D20'],
  39: ['7', 'D16'],
  38: ['D19'],
  37: ['5', 'D16'],
  36: ['D18'],
  35: ['3', 'D16'],
  34: ['D17'],
  33: ['1', 'D16'],
  32: ['D16'],
  31: ['7', 'D12'],
  30: ['D15'],
  29: ['13', 'D8'],
  28: ['D14'],
  27: ['11', 'D8'],
  26: ['D13'],
  25: ['9', 'D8'],
  24: ['D12'],
  23: ['7', 'D8'],
  22: ['D11'],
  21: ['5', 'D8'],
  20: ['D10'],
  19: ['3', 'D8'],
  18: ['D9'],
  17: ['1', 'D8'],
  16: ['D8'],
  15: ['7', 'D4'],
  14: ['D7'],
  13: ['5', 'D4'],
  12: ['D6'],
  11: ['3', 'D4'],
  10: ['D5'],
  9: ['1', 'D4'],
  8: ['D4'],
  7: ['3', 'D2'],
  6: ['D3'],
  5: ['1', 'D2'],
  4: ['D2'],
  3: ['1', 'D1'],
  2: ['D1'],
};

// 1-dart checkout routes (for when 2 darts already thrown)
const CHECKOUT_ROUTES_1_DART: Record<number, string[]> = {
  40: ['D20'],
  38: ['D19'],
  36: ['D18'],
  34: ['D17'],
  32: ['D16'],
  30: ['D15'],
  28: ['D14'],
  26: ['D13'],
  24: ['D12'],
  22: ['D11'],
  20: ['D10'],
  18: ['D9'],
  16: ['D8'],
  14: ['D7'],
  12: ['D6'],
  10: ['D5'],
  8: ['D4'],
  6: ['D3'],
  4: ['D2'],
  2: ['D1'],
  50: ['DB'],
};

// ============================================================
// VISIT HISTORY COMPONENT - SHOWN WHEN NOT YOUR TURN
// ============================================================
function VisitHistoryPanel({
  visits,
  myUserId,
  opponentUserId,
  myName,
  opponentName,
  myColor,
  opponentColor,
  currentLeg,
  onEditVisit,
  onDeleteVisit,
}: {
  visits: QuickMatchVisit[];
  myUserId: string;
  opponentUserId: string;
  myName: string;
  opponentName: string;
  myColor: string;
  opponentColor: string;
  currentLeg: number;
  onEditVisit: (visit: QuickMatchVisit) => void;
  onDeleteVisit: (visitId: string) => void;
}) {
  // Show visits from CURRENT LEG ONLY - resets when new leg starts
  const currentLegVisits = useMemo(() => {
    return visits.filter(v => v.leg === currentLeg);
  }, [visits, currentLeg]);
  
  // Derive opponent ID from visits data if not provided or mismatch
  // This is more reliable than passing opponentUserId from parent
  const actualOpponentId = useMemo(() => {
    // Find a visit that doesn't belong to me - that's the opponent
    const opponentVisit = currentLegVisits.find(v => v.player_id !== myUserId);
    return opponentVisit?.player_id || opponentUserId;
  }, [currentLegVisits, myUserId, opponentUserId]);
  
  // Sort visits with newest first (descending turn_no) so most recent is at top
  const myVisits = currentLegVisits.filter(v => v.player_id === myUserId).sort((a, b) => b.turn_no - a.turn_no);
  const opponentVisits = currentLegVisits.filter(v => v.player_id === actualOpponentId).sort((a, b) => b.turn_no - a.turn_no);
  
  const maxVisits = Math.max(myVisits.length, opponentVisits.length);

  const formatDart = (d: any) => {
    if (!d) return '';
    if (d.mult === 'DB') return 'DB';
    if (d.mult === 'SB') return 'SB';
    if (d.mult === 'D') return `D${d.n}`;
    if (d.mult === 'T') return `T${d.n}`;
    return d.n.toString();
  };

  const formatDarts = (darts: any[]) => {
    if (!darts || darts.length === 0) return '-';
    return darts.map(formatDart).join(' ');
  };

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-sm font-semibold text-white mb-3">Visit History - Leg {currentLeg}</h3>
      
      <div className="flex-1 overflow-auto space-y-2">
        {/* Headers */}
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-400 border-b border-white/10 pb-2">
          <div className={`text-center font-bold ${myColor}`}>{myName}</div>
          <div className={`text-center font-bold ${opponentColor}`}>{opponentName}</div>
        </div>

        {/* Visit Rows - Newest first */}
        {maxVisits === 0 ? (
          <div className="text-center text-gray-500 py-8">No visits yet</div>
        ) : (
          Array.from({ length: maxVisits }, (_, i) => {
            const myVisit = myVisits[i];
            const opponentVisit = opponentVisits[i];
            // Since we reversed the order, index 0 is the latest visit
            const isLatestMyVisit = myVisit && i === 0;
            
            return (
              <div key={i} className="grid grid-cols-2 gap-4 py-2 border-b border-white/5">
                {/* My Visit */}
                <div className="relative group">
                  {myVisit ? (
                    <div className="bg-slate-800/50 rounded-lg p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">L{myVisit.leg} #{myVisit.turn_no}</span>
                        {isLatestMyVisit && (
                          <button
                            onClick={() => onEditVisit(myVisit)}
                            className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 rounded text-emerald-400 text-xs font-medium transition-colors flex items-center gap-1"
                            title="Edit this visit"
                          >
                            <Edit2 className="w-3 h-3" />
                            Edit
                          </button>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className={`text-lg font-bold ${myColor}`}>{myVisit.score}</span>
                        <span className="text-xs text-gray-500">→ {myVisit.remaining_after}</span>
                      </div>
                      {myVisit.is_bust && <span className="text-xs text-red-400 font-bold">BUST</span>}
                      {myVisit.is_checkout && <span className="text-xs text-emerald-400 font-bold">CHECKOUT!</span>}
                    </div>
                  ) : (
                    <div className="h-20 bg-slate-800/20 rounded-lg flex items-center justify-center text-gray-600">-</div>
                  )}
                </div>

                {/* Opponent Visit */}
                <div>
                  {opponentVisit ? (
                    <div className="bg-slate-800/50 rounded-lg p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">L{opponentVisit.leg} #{opponentVisit.turn_no}</span>
                      </div>
                      <div className="flex items-center justify-between flex-row-reverse mt-1">
                        <span className={`text-lg font-bold ${opponentColor}`}>{opponentVisit.score}</span>
                        <span className="text-xs text-gray-500">{opponentVisit.remaining_after} ←</span>
                      </div>
                      {opponentVisit.is_bust && <span className="text-xs text-red-400 font-bold">BUST</span>}
                      {opponentVisit.is_checkout && <span className="text-xs text-emerald-400 font-bold">CHECKOUT!</span>}
                    </div>
                  ) : (
                    <div className="h-20 bg-slate-800/20 rounded-lg flex items-center justify-center text-gray-600">-</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ============================================================
// EDIT VISIT MODAL
// ============================================================
function EditVisitModal({ 
  open, 
  onOpenChange, 
  visit, 
  onSave, 
  onDelete,
  doubleOutEnabled,
  remainingBefore
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  visit: QuickMatchVisit | null;
  onSave: (visit: QuickMatchVisit, newScore: number, newDarts: any[]) => void;
  onDelete: (visitId: string) => void;
  doubleOutEnabled: boolean;
  remainingBefore: number;
}) {
  const [scoreInput, setScoreInput] = useState('');
  const [darts, setDarts] = useState<Dart[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visit) {
      setScoreInput(visit.score.toString());
      // Convert stored darts to Dart format
      const convertedDarts = visit.darts?.map((d: any) => {
        const mult = d.mult || 'S';
        const number = d.n || 0;
        let type: 'single' | 'double' | 'triple' | 'bull' = 'single';
        let multiplier = 1;
        let value = number;
        let is_double = false;
        let label = `${mult}${number}`;

        if (mult === 'DB') {
          type = 'bull';
          multiplier = 2;
          value = 50;
          is_double = true;
          label = 'DB';
        } else if (mult === 'SB') {
          type = 'bull';
          multiplier = 1;
          value = 25;
          label = 'SB';
        } else if (mult === 'D') {
          type = 'double';
          multiplier = 2;
          value = number * 2;
          is_double = true;
          label = `D${number}`;
        } else if (mult === 'T') {
          type = 'triple';
          multiplier = 3;
          value = number * 3;
          label = `T${number}`;
        }

        return { type, number, value, multiplier, label, score: value, is_double };
      }) || [];
      setDarts(convertedDarts);
    }
  }, [visit]);

  const handleScoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      const num = parseInt(value);
      if (value === '' || (num >= 0 && num <= 180)) {
        setScoreInput(value);
      }
    }
  };

  const validateCheckout = (score: number): { valid: boolean; error?: string } => {
    if (!doubleOutEnabled) return { valid: true };
    const newRemaining = remainingBefore - score;
    if (newRemaining === 0) {
      // For typed score, we can't validate double without darts, so warn but allow
      return { valid: true, error: 'Warning: Must finish on double (ensure last dart is D or DB)' };
    }
    return { valid: true };
  };

  const handleSave = async () => {
    const newScore = parseInt(scoreInput);
    if (isNaN(newScore) || newScore < 0 || newScore > 180) {
      toast.error('Invalid score (0-180)');
      return;
    }

    const validation = validateCheckout(newScore);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    // Convert darts back to storage format
    const newDarts = darts.map(d => {
      let mult = 'S';
      if (d.type === 'bull') mult = d.value === 50 ? 'DB' : 'SB';
      else if (d.type === 'double') mult = 'D';
      else if (d.type === 'triple') mult = 'T';
      return { n: d.number, mult };
    });

    setIsSubmitting(true);
    try {
      await onSave(visit!, newScore, newDarts);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!visit) return;
    if (!confirm('Are you sure you want to delete this visit?')) return;
    
    setIsSubmitting(true);
    try {
      await onDelete(visit.id);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visit) return null;

  const newRemaining = remainingBefore - (parseInt(scoreInput) || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Visit #{visit.turn_no}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Quick Score Input */}
          <div className="space-y-2">
            <Label className="text-gray-400">New Score (0-180)</Label>
            <Input
              type="number"
              value={scoreInput}
              onChange={handleScoreChange}
              className="bg-slate-800 border-white/10 text-white text-2xl text-center h-16"
              placeholder="0"
              min={0}
              max={180}
            />
            <div className="text-center text-sm text-gray-400">
              Remaining: {remainingBefore} → <span className={newRemaining < 0 ? 'text-red-400' : 'text-emerald-400'}>{newRemaining}</span>
            </div>
          </div>

          {/* Current Darts Display */}
          {darts.length > 0 && (
            <div className="flex justify-center gap-2">
              {darts.map((dart, idx) => (
                <div key={idx} className={`px-3 py-2 rounded-lg text-sm font-bold ${
                  dart.is_double ? 'bg-red-500/20 text-red-400' :
                  dart.type === 'triple' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-slate-700 text-gray-300'
                }`}>
                  {dart.label}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSubmitting || !scoreInput}
              className="flex-1 bg-emerald-500 hover:bg-emerald-600"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// SCORING PANEL WITH CHECKOUT HELP
// ============================================================
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when scoring panel mounts (when it becomes user's turn)
  useEffect(() => {
    // Small delay to ensure render is complete
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const visitTotal = currentDarts.reduce((sum, d) => sum + d.value, 0);
  const previewRemaining = currentRemaining - visitTotal;
  const dartsThrown = currentDarts.length;
  const dartsRemaining = 3 - dartsThrown;

  // Get checkout suggestion based on darts thrown
  const getCheckoutSuggestion = () => {
    if (previewRemaining <= 0 || previewRemaining > 170) return null;
    
    // Based on darts remaining, show appropriate checkout route
    if (dartsRemaining === 3) {
      // 3 darts available - show 3-dart checkout
      return CHECKOUT_ROUTES[previewRemaining] || null;
    } else if (dartsRemaining === 2) {
      // 2 darts available - show 2-dart checkout
      return CHECKOUT_ROUTES_2_DARTS[previewRemaining] || null;
    } else if (dartsRemaining === 1) {
      // 1 dart available - show 1-dart checkout (must be a double)
      return CHECKOUT_ROUTES_1_DART[previewRemaining] || null;
    }
    return null;
  };

  const checkoutSuggestion = getCheckoutSuggestion();

  return (
    <div className="h-full flex flex-col">
      {/* Checkout Help - DYNAMIC BASED ON DARTS THROWN */}
      {previewRemaining > 0 && previewRemaining <= 170 && (
        <div className="mb-4 p-4 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-lg">
          <div className="text-center">
            <p className="text-xs text-amber-400 uppercase tracking-wider mb-1">
              Checkout {previewRemaining} ({dartsRemaining} dart{dartsRemaining !== 1 ? 's' : ''} left)
            </p>
            {checkoutSuggestion ? (
              <div className="flex items-center justify-center gap-3 text-2xl font-bold">
                {checkoutSuggestion.map((dart, idx) => (
                  <span key={idx} className={`
                    px-3 py-1 rounded-lg
                    ${dart.startsWith('D') ? 'bg-red-500/30 text-red-300' : 
                      dart.startsWith('T') ? 'bg-amber-500/30 text-amber-300' :
                      dart === 'DB' ? 'bg-red-500/40 text-red-200 border border-red-400' :
                      'bg-slate-700 text-white'}
                  `}>
                    {dart}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-amber-400 font-bold">No checkout possible</p>
            )}
          </div>
        </div>
      )}

      {/* Type Score Input */}
      <div className="mb-4">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="number"
            placeholder="Type score (0-180)"
            value={scoreInput}
            onChange={(e) => onScoreInputChange(e.target.value)}
            className="flex-1 bg-slate-800 border-white/10 text-white"
            onKeyDown={(e) => e.key === 'Enter' && onTypeScoreSubmit()}
          />
          <Button 
            onClick={() => {
              console.log('[BUTTON] Typed score submit clicked');
              onTypeScoreSubmit();
            }}
            disabled={!scoreInput || submitting}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50"
          >
            {submitting ? '...' : 'Submit'}
          </Button>
        </div>
      </div>

      <div className="text-center mb-2">
        <span className="text-sm text-gray-400">Current Visit: </span>
        <span className="text-xl font-bold text-white">{visitTotal}</span>
        <span className="text-sm text-gray-400 ml-2">→ {previewRemaining}</span>
      </div>

      {/* Current Darts */}
      <div className="flex justify-center gap-2 mb-4">
        {currentDarts.map((dart, idx) => (
          <div key={idx} className={`w-12 h-12 rounded-lg flex items-center justify-center text-sm font-bold ${
            dart.is_double ? 'bg-red-500/20 text-red-400 border border-red-500/50' :
            dart.type === 'triple' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' :
            'bg-slate-700 text-white border border-white/20'
          }`}>
            {dart.label}
          </div>
        ))}
        {Array.from({ length: 3 - currentDarts.length }).map((_, idx) => (
          <div key={`empty-${idx}`} className="w-12 h-12 rounded-lg border-2 border-dashed border-white/20" />
        ))}
      </div>

      {/* Dart Controls */}
      <div className="flex gap-2 mb-2">
        <Button
          size="sm"
          variant={activeTab === 'singles' ? 'default' : 'outline'}
          onClick={() => setActiveTab('singles')}
          className="flex-1"
        >
          Singles
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'doubles' ? 'default' : 'outline'}
          onClick={() => setActiveTab('doubles')}
          className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30"
        >
          Doubles
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'triples' ? 'default' : 'outline'}
          onClick={() => setActiveTab('triples')}
          className="flex-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
        >
          Triples
        </Button>
        <Button
          size="sm"
          variant={activeTab === 'bulls' ? 'default' : 'outline'}
          onClick={() => setActiveTab('bulls')}
          className="flex-1 bg-green-500/20 text-green-400 hover:bg-green-500/30"
        >
          Bulls
        </Button>
      </div>

      {/* Number Pad */}
      <div className="flex-1 grid grid-cols-5 gap-1 mb-4">
        {activeTab === 'bulls' ? (
          <>
            <Button onClick={() => onDartClick('bull', 25)} className="h-full bg-green-500/20 text-green-400 hover:bg-green-500/30 text-lg">
              25
            </Button>
            <Button onClick={() => onDartClick('bull', 50)} className="h-full bg-red-500/20 text-red-400 hover:bg-red-500/30 text-lg font-bold">
              50
            </Button>
          </>
        ) : (
          Array.from({ length: 20 }, (_, i) => i + 1).map((num) => (
            <Button
              key={num}
              onClick={() => onDartClick(activeTab === 'singles' ? 'single' : activeTab === 'doubles' ? 'double' : 'triple', num)}
              disabled={currentDarts.length >= 3}
              className={`h-full text-lg font-bold ${
                activeTab === 'doubles' ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' :
                activeTab === 'triples' ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' :
                'bg-slate-700 text-white hover:bg-slate-600'
              }`}
            >
              {activeTab === 'doubles' ? 'D' : activeTab === 'triples' ? 'T' : ''}{num}
            </Button>
          ))
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={onUndoDart}
          disabled={currentDarts.length === 0}
          className="flex-1 border-white/10 text-white hover:bg-white/5"
        >
          Undo
        </Button>
        <Button
          variant="outline"
          onClick={onClearVisit}
          disabled={currentDarts.length === 0}
          className="flex-1 border-white/10 text-white hover:bg-white/5"
        >
          Clear
        </Button>
        <Button
          onClick={onMiss}
          disabled={currentDarts.length >= 3}
          className="flex-1 bg-slate-700 hover:bg-slate-600"
        >
          Miss
        </Button>
        <Button
          onClick={onBust}
          disabled={submitting}
          className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50"
        >
          Bust
        </Button>
        <Button
          onClick={onSubmitVisit}
          disabled={currentDarts.length === 0 || submitting}
          className="flex-1 bg-emerald-500 hover:bg-emerald-600"
        >
          {submitting ? '...' : 'Submit'}
        </Button>
      </div>
    </div>
  );
}

// Label component
function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={`text-sm font-medium ${className}`}>{children}</label>;
}

export default function QuickMatchRoomPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.matchId as string;
  const supabase = createClient();

  const [room, setRoom] = useState<MatchRoom | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [visits, setVisits] = useState<QuickMatchVisit[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [matchState, setMatchState] = useState<MappedMatchState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Scoring state
  const [scoreInput, setScoreInput] = useState('');
  const [currentVisit, setCurrentVisit] = useState<Dart[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Camera state
  const cameraInitAttempted = useRef(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // Modals
  const [showEndMatchDialog, setShowEndMatchDialog] = useState(false);
  const [showMatchCompleteModal, setShowMatchCompleteModal] = useState(false);
  const [showOpponentForfeitModal, setShowOpponentForfeitModal] = useState(false);
  const [didIForfeit, setDidIForfeit] = useState(false);
  const [forfeitLoading, setForfeitLoading] = useState(false);

  // Camera refresh state
  const [isRefreshingCamera, setIsRefreshingCamera] = useState(false);
  const [isRefreshingConnection, setIsRefreshingConnection] = useState(false);

  // Visit editing
  const [editingVisit, setEditingVisit] = useState<QuickMatchVisit | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // Trust rating
  const [opponentTrustRating, setOpponentTrustRating] = useState<any>(null);
  const [hasSubmittedRating, setHasSubmittedRating] = useState(false);
  const [selectedRating, setSelectedRating] = useState<string | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);

  // Chat
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);

  // Edit notification popup
  const [editNotification, setEditNotification] = useState<{
    show: boolean;
    playerName: string;
    oldScore: number;
    newScore: number;
  } | null>(null);

  // Match end stats state - stores player1 and player2 data with winner info
  const [matchEndStats, setMatchEndStats] = useState<{
    player1: { id: string; name: string; legs: number };
    player2: { id: string; name: string; legs: number };
    player1FullStats: any;
    player2FullStats: any;
    winnerId: string;
  } | null>(null);

  // New simplified rematch system
  const isPlayer1 = room ? room.player1_id === currentUserId : false;
  const matchFinished = room?.status === 'finished';
  const {
    status: rematchStatus,
    iAmReady: iAmReadyForRematch,
    opponentReady: opponentRematchReady,
    bothReady: bothReadyForRematch,
    readyCount,
    newRoomId: newRematchRoomId,
    isLoading: rematchLoading,
    requestRematch,
  } = useQuickMatchRematch({
    roomId: matchId,
    currentUserId: currentUserId || '',
    isPlayer1,
    matchFinished,
  });

  // Coin toss state
  const [showCoinToss, setShowCoinToss] = useState(false);
  const [coinTossCompleted, setCoinTossCompleted] = useState(false);
  const [playersConnected, setPlayersConnected] = useState<{p1: boolean, p2: boolean}>({p1: false, p2: false});
  const [coinTossSyncStart, setCoinTossSyncStart] = useState(false); // Triggered by signal from Player 1

  // Pre-game lobby state
  const [showPreGameLobby, setShowPreGameLobby] = useState(false);
  const [player1Ready, setPlayer1Ready] = useState(false);
  const [player2Ready, setPlayer2Ready] = useState(false);
  const [player1Stats, setPlayer1Stats] = useState<{username: string; avatar_url?: string; threeDartAvg?: number} | null>(null);
  const [player2Stats, setPlayer2Stats] = useState<{username: string; avatar_url?: string; threeDartAvg?: number} | null>(null);
  const pregameInitiatedRef = useRef(false);

  // Checkout dialog state for typed scores
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
  const [pendingCheckoutScore, setPendingCheckoutScore] = useState(0);
  const [pendingRemainingBefore, setPendingRemainingBefore] = useState(501);

  const cleanupMatchRef = useRef<() => void>();
  
  // Note: Rematch navigation is handled by useQuickMatchRematch hook

  // WebRTC - only connect after coin toss is complete
  const bothPlayersReady = player1Ready && player2Ready;
  const webrtc = useMatchWebRTC({
    roomId: matchId,
    myUserId: currentUserId,
    coinTossComplete: coinTossCompleted, // Wait for coin toss before connecting
  });
  const {
    localStream,
    remoteStream,
    isCameraOn,
    callStatus,
    cameraError,
    toggleCamera,
    stopCamera,
    refreshCamera,
    refreshConnection,
    forceTurnAndRestart,
  } = webrtc;
  
  // Expose streams to window for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__localStream = localStream;
      (window as any).__remoteStream = remoteStream;
      console.log('[CAMERA] localStream:', localStream ? 'YES' : 'NO', 'remoteStream:', remoteStream ? 'YES' : 'NO');
    }
  }, [localStream, remoteStream]);
  
  // Callback refs that attach stream immediately when element mounts
  const setLocalVideoRef = useCallback((el: HTMLVideoElement | null) => {
    if (el && localStream) {
      console.log('[CAMERA] Attaching local stream to video element');
      el.srcObject = localStream;
      el.play().catch(err => console.error('[CAMERA] Error playing local:', err));
    }
    localVideoRef.current = el;
  }, [localStream]);

  const setRemoteVideoRef = useCallback((el: HTMLVideoElement | null) => {
    if (el && remoteStream) {
      console.log('[CAMERA] Attaching remote stream to video element');
      el.srcObject = remoteStream;
      el.play().catch(err => console.error('[CAMERA] Error playing remote:', err));
    }
    remoteVideoRef.current = el;
  }, [remoteStream]);

  // Auto-start camera when both players are ready AND coin toss is complete
  useEffect(() => {
    const initCamera = async () => {
      if (bothPlayersReady && coinTossCompleted && room?.status === 'active' && room?.player2_id && !isCameraOn && !cameraInitAttempted.current) {
        console.log('[CAMERA] Auto-starting camera after coin toss complete');
        cameraInitAttempted.current = true;
        try {
          await toggleCamera();
          console.log('[CAMERA] Auto-start successful');
        } catch (err) {
          console.error('[CAMERA] Auto-start failed:', err);
          cameraInitAttempted.current = false;
        }
      }
    };
    initCamera();
  }, [bothPlayersReady, coinTossCompleted, room?.status, room?.player2_id, isCameraOn, toggleCamera]);

  // Initialize pre-game lobby when both players connect
  useEffect(() => {
    if (!room || !currentUserId || pregameInitiatedRef.current) return;
    if (!room.player2_id) return; // Wait for player 2 to join
    if (room.pregame_status === 'ready') return; // Already completed
    if (room.coin_toss_completed) return; // Match already started

    const bothConnected = playersConnected.p1 && playersConnected.p2;
    if (bothConnected && room.status === 'active') {
      console.log('[PREGAME] Both players connected, initializing pregame lobby');
      pregameInitiatedRef.current = true;
      
      // Fetch player stats for display
      const fetchPlayerStats = async () => {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, username, avatar_url')
          .in('user_id', [room.player1_id, room.player2_id]);
        
        const { data: statsData } = await supabase
          .from('player_stats')
          .select('user_id, overall_3dart_avg')
          .in('user_id', [room.player1_id, room.player2_id]);
        
        const statsMap = new Map(statsData?.map(s => [s.user_id, s.overall_3dart_avg]) || []);
        
        const p1Profile = profilesData?.find(p => p.user_id === room.player1_id);
        const p2Profile = profilesData?.find(p => p.user_id === room.player2_id);
        
        setPlayer1Stats({
          username: p1Profile?.username || 'Player 1',
          avatar_url: p1Profile?.avatar_url,
          threeDartAvg: statsMap.get(room.player1_id),
        });
        
        setPlayer2Stats({
          username: p2Profile?.username || 'Player 2',
          avatar_url: p2Profile?.avatar_url,
          threeDartAvg: statsMap.get(room.player2_id),
        });
        
        // Check if already ready from DB
        if (room.player1_ready) setPlayer1Ready(true);
        if (room.player2_ready) setPlayer2Ready(true);
        
        // Show pregame lobby
        setShowPreGameLobby(true);
      };
      
      fetchPlayerStats();
    }
  }, [room, currentUserId, playersConnected, supabase]);

  // Handle ready button click
  const handleReady = async () => {
    if (!room || !currentUserId) return;
    
    const isPlayer1 = currentUserId === room.player1_id;
    const readyField = isPlayer1 ? 'player1_ready' : 'player2_ready';
    
    console.log(`[PREGAME] Setting ${readyField} to true`);
    
    const { error } = await supabase
      .from('match_rooms')
      .update({ [readyField]: true })
      .eq('id', matchId);
    
    if (error) {
      console.error('[PREGAME] Error setting ready:', error);
      toast.error('Failed to set ready status');
      return;
    }
    
    // Update local state
    if (isPlayer1) {
      setPlayer1Ready(true);
    } else {
      setPlayer2Ready(true);
    }
    
    // Send signal to opponent
    const opponentId = isPlayer1 ? room.player2_id : room.player1_id;
    if (opponentId) {
      await supabase.rpc('rpc_send_match_signal', {
        p_room_id: matchId,
        p_to_user_id: opponentId,
        p_type: 'player_ready',
        p_payload: { player: isPlayer1 ? 'player1' : 'player2' }
      });
    }
  };

  // Handle pregame timeout
  const handlePregameTimeout = async (playerWhoDidntReady: string) => {
    console.log('[PREGAME] Timeout - cancelling match. Player who didnt ready:', playerWhoDidntReady);
    
    if (room) {
      await supabase
        .from('match_rooms')
        .update({ 
          pregame_status: 'timeout',
          status: 'cancelled'
        })
        .eq('id', matchId);
    }
    
    toast.error(`${playerWhoDidntReady} didn't ready up - lobby cancelled`);
    router.push('/app/play/quick-match');
  };

  // Handle pregame cancel
  const handlePregameCancel = async () => {
    console.log('[PREGAME] Player left lobby');
    
    if (room) {
      await supabase
        .from('match_rooms')
        .update({ 
          pregame_status: 'cancelled',
          status: 'cancelled'
        })
        .eq('id', matchId);
    }
    
    router.push('/app/play/quick-match');
  };

  // Handle both players ready
  const handleBothReady = async () => {
    console.log('[PREGAME] Both players ready! Starting coin toss...');
    setShowPreGameLobby(false);
    
    // Update DB to mark pregame complete
    await supabase
      .from('match_rooms')
      .update({ pregame_status: 'ready' })
      .eq('id', matchId);
  };

  // POLLING FALLBACK: Check for opponent presence directly from DB
  useEffect(() => {
    if (!room || !currentUserId) return;
    
    // Mark self as connected immediately
    setPlayersConnected(prev => ({
      p1: currentUserId === room.player1_id ? true : prev.p1,
      p2: currentUserId === room.player2_id ? true : prev.p2
    }));
    
    // Poll to check if opponent is in the match
    const checkOpponentInterval = setInterval(async () => {
      const { data: roomData } = await supabase
        .from('match_rooms')
        .select('player1_id, player2_id')
        .eq('id', matchId)
        .maybeSingle();
      
      if (roomData) {
        const opponentId = currentUserId === roomData.player1_id 
          ? roomData.player2_id 
          : roomData.player1_id;
        
        // If opponent exists in the room, mark them as connected
        if (opponentId) {
          setPlayersConnected(prev => {
            const isP1 = opponentId === roomData.player1_id;
            const newState = {
              p1: isP1 ? true : prev.p1,
              p2: isP1 ? prev.p2 : true
            };
            console.log('[POLL] Detected opponent presence:', newState);
            return newState;
          });
        }
      }
    }, 1000);
    
    return () => clearInterval(checkOpponentInterval);
  }, [room, currentUserId, matchId]);


  cleanupMatchRef.current = () => {
    stopCamera();
    cameraInitAttempted.current = false;
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(`match_context_${matchId}`);
      sessionStorage.removeItem(`lobby_id_${matchId}`);
    }
  };

  // Calculate leg wins from visits (fallback if DB columns don't exist)
  const calculateLegWinsFromVisits = () => {
    const p1Checkouts = visits.filter(v => v.player_id === room?.player1_id && v.is_checkout);
    const p2Checkouts = visits.filter(v => v.player_id === room?.player2_id && v.is_checkout);
    return {
      p1: p1Checkouts.length,
      p2: p2Checkouts.length
    };
  };

  // Calculate BEST LEG (fewest darts thrown in a winning leg)
  const calculateBestLeg = (playerId: string, visitData: QuickMatchVisit[]) => {
    const playerVisits = visitData.filter(v => v.player_id === playerId && !v.is_bust);
    
    console.log(`[BEST LEG] Calculating for player ${playerId.substring(0, 8)}, visits:`, playerVisits.length);
    
    // Group visits by leg
    const visitsByLeg = new Map<number, typeof playerVisits>();
    for (const visit of playerVisits) {
      if (!visitsByLeg.has(visit.leg)) {
        visitsByLeg.set(visit.leg, []);
      }
      visitsByLeg.get(visit.leg)!.push(visit);
    }
    
    console.log(`[BEST LEG] Visits grouped by leg:`, Array.from(visitsByLeg.entries()).map(([leg, visits]) => ({ 
      leg, 
      visitCount: visits.length,
      hasCheckout: visits.some(v => v.is_checkout),
      dartsThrown: visits.reduce((sum, v) => sum + (v.darts_thrown || 3), 0)
    })));
    
    // Find the leg with fewest darts (that had a checkout)
    let bestLegDarts = Infinity;
    let bestLegNum = 0;
    
    for (const [legNum, legVisits] of visitsByLeg) {
      const hasCheckout = legVisits.some(v => v.is_checkout);
      if (hasCheckout) {
        // Sum actual darts thrown, default to 3 if not recorded
        const legDarts = legVisits.reduce((sum, v) => sum + (v.darts_thrown || 3), 0);
        console.log(`[BEST LEG] Leg ${legNum} won with ${legDarts} darts`);
        if (legDarts < bestLegDarts) {
          bestLegDarts = legDarts;
          bestLegNum = legNum;
        }
      }
    }
    
    const result = {
      darts: bestLegDarts === Infinity ? 0 : bestLegDarts,
      legNum: bestLegNum
    };
    
    console.log(`[BEST LEG] Result:`, result);
    return result;
  };

  // Calculate player stats from provided visits array (for accurate calculation)
  const calculatePlayerStatsFromVisits = (visitData: QuickMatchVisit[], playerId: string, playerName: string, legsWon: number) => {
    console.log(`[STATS CALC] Calculating for ${playerName} (${playerId.substring(0, 8)})`, {
      totalVisits: visitData.length,
      playerVisits: visitData.filter(v => v.player_id === playerId).length
    });
    
    // FIX: Include ALL player visits (including busts) for darts thrown
    const allPlayerVisits = visitData.filter(v => v.player_id === playerId);
    // Non-bust visits for score calculations
    const playerVisits = allPlayerVisits.filter(v => !v.is_bust);
    
    console.log(`[STATS CALC] ${playerName}:`, {
      totalVisits: allPlayerVisits.length,
      nonBustVisits: playerVisits.length,
      visits: playerVisits.map(v => ({ leg: v.leg, score: v.score, is_checkout: v.is_checkout, darts: v.darts_thrown }))
    });
    
    // FIX: Count darts from ALL visits including busts
    const totalDarts = allPlayerVisits.reduce((sum, v) => sum + (v.darts_thrown || 3), 0);
    const totalScored = playerVisits.reduce((sum, v) => sum + v.score, 0);
    const threeDartAverage = totalDarts > 0 ? (totalScored / totalDarts) * 3 : 0;
    
    // Calculate FIRST 9 DART AVERAGE per leg, then average across legs
    // Group non-bust visits by leg
    const visitsByLeg = new Map<number, typeof playerVisits>();
    for (const visit of playerVisits) {
      if (!visitsByLeg.has(visit.leg)) {
        visitsByLeg.set(visit.leg, []);
      }
      visitsByLeg.get(visit.leg)!.push(visit);
    }
    
    // Calculate first 9 average for each leg
    const legFirst9Averages: number[] = [];
    for (const [legNum, legVisits] of visitsByLeg) {
      let legFirst9Score = 0;
      let legFirst9Darts = 0;
      // Take first 3 visits (max 9 darts) from this leg
      for (const visit of legVisits.slice(0, 3)) {
        legFirst9Score += visit.score;
        legFirst9Darts += (visit.darts_thrown || 3);
        if (legFirst9Darts >= 9) break;
      }
      if (legFirst9Darts > 0) {
        const legFirst9Avg = (legFirst9Score / legFirst9Darts) * 3;
        legFirst9Averages.push(legFirst9Avg);
      }
    }
    
    // Average the first 9 averages across all legs
    const first9Average = legFirst9Averages.length > 0
      ? legFirst9Averages.reduce((sum, avg) => sum + avg, 0) / legFirst9Averages.length
      : 0;
    
    // Find highest checkout (even for losing players - they might have won some legs)
    const checkouts = playerVisits.filter(v => v.is_checkout);
    console.log(`[STATS CALC] ${playerName} checkouts:`, checkouts.map(v => ({ leg: v.leg, score: v.score })));
    
    const highestCheckout = checkouts.length > 0 
      ? Math.max(...checkouts.map(v => v.score))
      : 0;
    
    // FIX: Calculate checkout percentage using darts_at_double
    // Sum up all darts_at_double for visits in checkout range (<= 170)
    const checkoutAttempts = playerVisits
      .filter(v => v.remaining_before <= 170 && v.remaining_before > 0)
      .reduce((sum, v) => sum + (v.darts_at_double || 1), 0);
    const successfulCheckouts = checkouts.length;
    
    // Checkout percentage = successful checkouts / total darts at double
    const checkoutPercentage = checkoutAttempts > 0 
      ? (successfulCheckouts / checkoutAttempts) * 100 
      : 0;
    
    console.log(`[STATS CALC] ${playerName} checkout calc:`, {
      checkoutAttempts,
      successfulCheckouts,
      checkoutPercentage: checkoutPercentage.toFixed(1)
    });
    
    // Calculate BEST LEG (fewest darts to win a leg)
    const bestLeg = calculateBestLeg(playerId, visitData);
    console.log(`[STATS CALC] ${playerName} bestLeg:`, bestLeg);
    
    // Count 100+, 140+, and 180s
    const count100Plus = playerVisits.filter(v => v.score >= 100 && v.score < 140).length;
    const count140Plus = playerVisits.filter(v => v.score >= 140 && v.score < 180).length;
    const oneEighties = playerVisits.filter(v => v.score === 180).length;
    
    const result = {
      id: playerId,
      name: playerName,
      legsWon,
      threeDartAverage,
      first9Average,
      highestCheckout,
      checkoutPercentage,
      totalDartsThrown: totalDarts,
      bestLegDarts: bestLeg.darts,
      bestLegNum: bestLeg.legNum,
      totalScore: totalScored,
      checkouts: successfulCheckouts,
      checkoutAttempts,
      count100Plus,
      count140Plus,
      oneEighties,
    };
    
    console.log(`[STATS CALC] ${playerName} FINAL:`, {
      highestCheckout,
      checkoutPercentage: checkoutPercentage.toFixed(1) + '%',
      bestLegDarts: bestLeg.darts,
      checkouts: successfulCheckouts,
      checkoutAttempts
    });
    
    return result;
  };

  // Calculate player stats from visits - for FINISHED match (all legs)
  const calculatePlayerStats = (playerId: string, playerName: string, legsWon: number, extraVisit?: any) => {
    // FIX: Include ALL visits (including busts) for darts calculation
    let allPlayerVisits = visits.filter(v => v.player_id === playerId);
    let playerVisits = allPlayerVisits.filter(v => !v.is_bust);
    
    // Add extra visit if provided (for when match just ended)
    if (extraVisit && extraVisit.player_id === playerId) {
      allPlayerVisits = [...allPlayerVisits, extraVisit];
      if (!extraVisit.is_bust) {
        playerVisits = [...playerVisits, extraVisit];
      }
    }
    
    // FIX: Count darts from ALL visits including busts
    const totalDarts = allPlayerVisits.reduce((sum, v) => sum + (v.darts_thrown || 3), 0);
    const totalScored = playerVisits.reduce((sum, v) => sum + v.score, 0);
    const threeDartAverage = totalDarts > 0 ? (totalScored / totalDarts) * 3 : 0;
    
    // Calculate FIRST 9 DART AVERAGE per leg, then average across legs
    // Group non-bust visits by leg
    const visitsByLeg = new Map<number, typeof playerVisits>();
    for (const visit of playerVisits) {
      if (!visitsByLeg.has(visit.leg)) {
        visitsByLeg.set(visit.leg, []);
      }
      visitsByLeg.get(visit.leg)!.push(visit);
    }
    
    // Calculate first 9 average for each leg
    const legFirst9Averages: number[] = [];
    for (const [legNum, legVisits] of visitsByLeg) {
      let legFirst9Score = 0;
      let legFirst9Darts = 0;
      // Take first 3 visits (max 9 darts) from this leg
      for (const visit of legVisits.slice(0, 3)) {
        legFirst9Score += visit.score;
        legFirst9Darts += (visit.darts_thrown || 3);
        if (legFirst9Darts >= 9) break;
      }
      if (legFirst9Darts > 0) {
        const legFirst9Avg = (legFirst9Score / legFirst9Darts) * 3;
        legFirst9Averages.push(legFirst9Avg);
      }
    }
    
    // Average the first 9 averages across all legs
    const first9Average = legFirst9Averages.length > 0
      ? legFirst9Averages.reduce((sum, avg) => sum + avg, 0) / legFirst9Averages.length
      : 0;
    
    // Find highest checkout (even for losing players - they might have won some legs)
    const checkouts = playerVisits.filter(v => v.is_checkout);
    const highestCheckout = checkouts.length > 0 
      ? Math.max(...checkouts.map(v => v.score))
      : 0;
    
    // FIX: Calculate checkout percentage using darts_at_double
    const checkoutAttempts = playerVisits
      .filter(v => v.remaining_before <= 170 && v.remaining_before > 0)
      .reduce((sum, v) => sum + (v.darts_at_double || 1), 0);
    const successfulCheckouts = checkouts.length;
    const checkoutPercentage = checkoutAttempts > 0 
      ? (successfulCheckouts / checkoutAttempts) * 100 
      : 0;
    
    // Calculate BEST LEG (fewest darts to win a leg)
    const bestLeg = calculateBestLeg(playerId, visits);
    // If this was the winning leg and extraVisit provided, check if it's the best
    if (extraVisit && extraVisit.player_id === playerId && extraVisit.is_checkout) {
      const currentLegDarts = playerVisits
        .filter(v => v.leg === extraVisit.leg)
        .reduce((sum, v) => sum + v.darts_thrown, 0);
      if (currentLegDarts < bestLeg.darts || bestLeg.darts === 0) {
        bestLeg.darts = currentLegDarts;
        bestLeg.legNum = extraVisit.leg;
      }
    }
    
    return {
      id: playerId,
      name: playerName,
      legsWon,
      threeDartAverage,
      first9Average,
      highestCheckout,
      checkoutPercentage,
      totalDartsThrown: totalDarts,
      bestLegDarts: bestLeg.darts,
      bestLegNum: bestLeg.legNum,
      totalScore: totalScored,
      checkouts: successfulCheckouts,
      checkoutAttempts,
    };
  };

  // Wrapper for winner that includes the final visit
  const calculatePlayerStatsWithVisit = (playerId: string, playerName: string, legsWon: number, extraVisit: any) => {
    return calculatePlayerStats(playerId, playerName, legsWon, extraVisit);
  };

  // Calculate WHOLE MATCH stats (across all legs) for the display
  // 3-dart average is calculated across ALL legs (entire game) as per dart rules
  const calculateMatchStats = useCallback((playerId: string) => {
    // FIX: Include ALL visits including busts for darts calculation
    const allPlayerVisits = visits.filter(v => v.player_id === playerId);
    const playerVisits = allPlayerVisits.filter(v => !v.is_bust);
    
    const totalDarts = allPlayerVisits.reduce((sum, v) => sum + (v.darts_thrown || 3), 0);
    const totalScored = playerVisits.reduce((sum, v) => sum + v.score, 0);
    // 3-dart average across the ENTIRE game (all legs)
    const threeDartAverage = totalDarts > 0 ? (totalScored / totalDarts) * 3 : 0;
    
    // CURRENT LEG visits for last score and darts thrown display (resets each leg)
    const currentLegAllVisits = allPlayerVisits.filter(v => v.leg === room?.current_leg);
    const currentLegVisits = currentLegAllVisits.filter(v => !v.is_bust);
    const dartsThisLeg = currentLegAllVisits.reduce((sum, v) => sum + (v.darts_thrown || 3), 0);
    
    return {
      average: threeDartAverage, // 3-dart average across WHOLE game
      lastScore: currentLegVisits.length > 0 ? currentLegVisits[currentLegVisits.length - 1].score : 0,
      dartsThrown: dartsThisLeg, // Darts thrown in CURRENT leg only
      totalDartsThrown: totalDarts, // Total darts across all legs
      totalScore: totalScored, // Total score across all legs
    };
  }, [visits, room?.current_leg]);

  useEffect(() => {
    let cleanupFn: (() => void) | undefined;

    initializeMatch().then((cleanup) => {
      if (cleanup && typeof cleanup === 'function') {
        cleanupFn = cleanup;
      }
    });

    return () => {
      if (cleanupMatchRef.current) cleanupMatchRef.current();
      if (cleanupFn) cleanupFn();
    };
  }, [matchId]);

  async function initializeMatch() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      setCurrentUserId(user.id);
      const matchLoaded = await loadMatchData();

      if (!matchLoaded) {
        toast.error('Match no longer available');
        await clearMatchState(matchId);
        router.push('/app/play/quick-match');
        return;
      }

      // Check if match is already finished (page refresh scenario)
      // Need to fetch room data again since loadMatchData sets it in state
      const { data: roomData } = await supabase
        .from('match_rooms')
        .select('*')
        .eq('id', matchId)
        .maybeSingle();
      
      if (roomData?.status === 'finished' && roomData?.winner_id && !matchEndStats) {
        console.log('[INIT] Match already finished, showing winner popup');
        await showMatchEndPopup(roomData);
      }

      return setupRealtimeSubscriptions();
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
      await clearMatchState(matchId);
      router.push('/app/play/quick-match');
    } finally {
      setLoading(false);
    }
  }

  // Show match end popup with stats - used both on init (page refresh) and when match ends
  async function showMatchEndPopup(roomData: MatchRoom) {
    if (!roomData.winner_id) return;
    
    console.log('[MATCH END] Showing popup for finished match');
    
    const winnerId = roomData.winner_id;
    const isPlayer1Winner = winnerId === roomData.player1_id;
    const loserId = isPlayer1Winner ? roomData.player2_id : roomData.player1_id;

    // Ensure we have profiles loaded - fetch if needed
    let currentProfiles = profiles;
    if (currentProfiles.length === 0 || !currentProfiles.find(p => p.user_id === winnerId)) {
      console.log('[MATCH END] Fetching profiles...');
      const { data: freshProfiles } = await supabase
        .from('profiles')
        .select('user_id, username, trust_rating_letter')
        .in('user_id', [roomData.player1_id, roomData.player2_id]);
      if (freshProfiles) {
        currentProfiles = freshProfiles as Profile[];
        setProfiles(currentProfiles);
      }
    }

    const winnerProfile = currentProfiles.find(p => p.user_id === winnerId);
    const loserProfile = currentProfiles.find(p => p.user_id === loserId);

    // Fetch ALL visits from database to ensure we have complete data for both players
    console.log('[MATCH END] Fetching all visits for room:', matchId);
    const { data: allVisits, error: visitsError } = await supabase
      .from('quick_match_visits')
      .select('*')
      .eq('room_id', matchId)
      .order('leg', { ascending: true })
      .order('turn_no', { ascending: true });
    
    if (visitsError) {
      console.error('[MATCH END] Error fetching visits:', visitsError);
    }
    
    console.log('[MATCH END] Fetched visits:', { 
      count: allVisits?.length || 0, 
      p1Visits: allVisits?.filter(v => v.player_id === roomData.player1_id).length || 0,
      p2Visits: allVisits?.filter(v => v.player_id === roomData.player2_id).length || 0
    });
    
    const completeVisits = (allVisits as QuickMatchVisit[]) || visits;
    
    // Use the room's leg counts as the source of truth
    const p1Legs = roomData.player1_legs || 0;
    const p2Legs = roomData.player2_legs || 0;
    
    // Debug: Log all visits before calculating stats
    logVisitsDebug('MATCH_END_STATS', completeVisits, roomData.player1_id, roomData.player2_id);
    
    // Calculate stats for BOTH players
    console.log('[MATCH_END] Calculating winner stats:', { winnerId, name: winnerProfile?.username });
    const wStats = calculatePlayerStatsFromVisits(
      completeVisits,
      winnerId,
      winnerProfile?.username || 'Winner',
      isPlayer1Winner ? p1Legs : p2Legs
    );
    
    console.log('[MATCH_END] Calculating loser stats:', { loserId, name: loserProfile?.username });
    const lStats = calculatePlayerStatsFromVisits(
      completeVisits,
      loserId,
      loserProfile?.username || 'Loser',
      isPlayer1Winner ? p2Legs : p1Legs
    );
    
    // Update visits state to match
    setVisits(completeVisits);
    
    // Determine player1 and player2 based on room data
    const p1Id = roomData.player1_id;
    const p2Id = roomData.player2_id;
    const p1Profile = currentProfiles.find(p => p.user_id === p1Id);
    const p2Profile = currentProfiles.find(p => p.user_id === p2Id);
    
    console.log('[MATCH END] Setting match end stats:', { p1Legs, p2Legs, winnerId, p1Name: p1Profile?.username, p2Name: p2Profile?.username });
    
    setMatchEndStats({
      player1: { id: p1Id, name: p1Profile?.username || roomData.player1_id?.substring(0, 8) || 'Player 1', legs: p1Legs },
      player2: { id: p2Id, name: p2Profile?.username || roomData.player2_id?.substring(0, 8) || 'Player 2', legs: p2Legs },
      player1FullStats: p1Id === winnerId ? wStats : lStats,
      player2FullStats: p2Id === winnerId ? wStats : lStats,
      winnerId: winnerId,
    });
    
    // Save stats to database
    await saveMatchStats(matchId, winnerId, loserId, isPlayer1Winner ? p1Legs : p2Legs, isPlayer1Winner ? p2Legs : p1Legs, roomData.game_mode);
    
    // Track achievements for the winner
    const winnerStats = isPlayer1Winner ? wStats : lStats;
    if (currentUserId === winnerId) {
      processMatchEnd({
        winnerId,
        loserId,
        winnerLegs: isPlayer1Winner ? p1Legs : p2Legs,
        loserLegs: isPlayer1Winner ? p2Legs : p1Legs,
        gameMode: roomData.game_mode,
        matchType: 'quick_match',
        playerStats: [{
          playerId: winnerId,
          average: winnerStats.threeDartAverage,
          oneEighties: winnerStats.oneEighties,
          tonPlus: winnerStats.count100Plus + winnerStats.count140Plus,
          highestCheckout: winnerStats.highestCheckout,
          checkouts: winnerStats.checkouts,
        }],
      }).catch(console.error);
    }
  }

  async function loadMatchData(): Promise<boolean> {
    const { data: roomData, error: roomError } = await supabase
      .from('match_rooms')
      .select('*')
      .eq('id', matchId)
      .maybeSingle();

    if (roomError || !roomData) {
      console.error('[LOAD] Room not found:', roomError);
      return false;
    }

    console.log('[LOAD] Room data loaded:', {
      id: roomData.id,
      status: roomData.status,
      p1_legs: roomData.player1_legs,
      p2_legs: roomData.player2_legs,
      legs_to_win: roomData.legs_to_win,
      winner_id: roomData.winner_id
    });
    
    setRoom(roomData as MatchRoom);

    // Load visits for ALL legs ordered by leg and turn_no
    const { data: visitsData, error: visitsError } = await supabase
      .from('quick_match_visits')
      .select('*')
      .eq('room_id', matchId)
      .order('leg', { ascending: true })
      .order('turn_no', { ascending: true });

    console.log('[LOAD] Visits loaded:', visitsData?.length || 0, 'Error:', visitsError);
    console.log('[LOAD] Room leg:', roomData.current_leg, 'Match ID:', matchId);
    console.log('[LOAD] Visits data:', visitsData);
    setVisits((visitsData as QuickMatchVisit[]) || []);

    const playerIds = [roomData.player1_id, roomData.player2_id].filter(Boolean);
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('user_id, username, trust_rating_letter')
      .in('user_id', playerIds);

    setProfiles((profilesData as Profile[]) || []);
    return true;
  }

  // Handle coin toss completion
  async function handleCoinTossComplete(winnerId: string) {
    console.log('[COIN TOSS] Winner determined:', winnerId);
    console.log('[COIN TOSS] Current user:', currentUserId);
    console.log('[COIN TOSS] I am Player 1:', currentUserId === room?.player1_id);
    
    // Only Player 1 saves to database (to avoid race conditions)
    if (currentUserId === room?.player1_id) {
      console.log('[COIN TOSS] Player 1 saving result to database...');
      const { data, error } = await supabase.rpc('rpc_complete_coin_toss', {
        p_room_id: matchId,
        p_winner_id: winnerId
      });

      if (error) {
        console.error('[COIN TOSS] Error completing coin toss:', error);
        toast.error('Failed to set starting player');
        return;
      }
      console.log('[COIN TOSS] Saved to database:', data);
    } else {
      console.log('[COIN TOSS] Player 2 - result received');
    }

    // Both players update local state
    setCoinTossCompleted(true);
    setShowCoinToss(false);
    
    // Reload room data to get updated state
    await loadMatchData();
    
    const winnerProfile = profiles.find(p => p.user_id === winnerId);
    toast.success(`${winnerProfile?.username || 'Player'} will throw first!`);
  }

  // Trigger coin toss when both players are READY (after pregame lobby) and it's the first leg
  useEffect(() => {
    const bothPlayersConnected = playersConnected.p1 && playersConnected.p2;
    const bothReady = player1Ready && player2Ready;
    const shouldShowCoinToss = room && 
      profiles.length === 2 && 
      bothPlayersConnected &&
      bothReady && // Only show after pregame lobby complete
      room.current_leg === 1 && 
      !coinTossCompleted &&
      room.status === 'active' &&
      !showPreGameLobby; // Don't show if pregame lobby is still open
    
    if (shouldShowCoinToss) {
      // Check if any visits have been made (if so, don't show coin toss)
      const hasVisits = visits.length > 0;
      if (!hasVisits) {
        console.log('[COIN TOSS] Both players ready, showing coin toss modal');
        setShowCoinToss(true);
      }
    }
  }, [room, profiles, visits, coinTossCompleted, playersConnected, player1Ready, player2Ready, showPreGameLobby]);

  useEffect(() => {
    if (room && profiles.length > 0) {
      const eventsFromVisits = visits.map(v => ({
        id: v.id,
        player_id: v.player_id,
        seq: v.turn_no,
        event_type: 'visit',
        payload: {
          score: v.score,
          remaining: v.remaining_after,
          is_bust: v.is_bust,
          is_checkout: v.is_checkout,
          leg: v.leg
        },
        created_at: v.created_at
      }));
      const mapped = mapRoomToMatchState(room, eventsFromVisits, profiles, currentUserId || '');
      setMatchState(mapped);
    }
  }, [room, visits, profiles, currentUserId]);

  function setupRealtimeSubscriptions() {
    const roomChannel = supabase
      .channel(`room_${matchId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'match_rooms', filter: `id=eq.${matchId}` },
        (payload) => {
          const updatedRoom = payload.new as MatchRoom;
          const oldRoom = payload.old as MatchRoom;
          
          // Update room state
          setRoom(updatedRoom);
          
          // Handle coin toss completion
          if (oldRoom && !oldRoom.coin_toss_completed && updatedRoom.coin_toss_completed) {
            console.log('[ROOM] Coin toss completed! Winner:', updatedRoom.coin_toss_winner_id);
          }
          
          // Handle player ready updates
          if (oldRoom && !oldRoom.player1_ready && updatedRoom.player1_ready) {
            console.log('[ROOM] Player 1 is ready');
            setPlayer1Ready(true);
          }
          if (oldRoom && !oldRoom.player2_ready && updatedRoom.player2_ready) {
            console.log('[ROOM] Player 2 is ready');
            setPlayer2Ready(true);
          }
          
          // Note: Rematch room navigation is handled by useQuickMatchRematch hook
          // Handle leg change - reload visits
          if (oldRoom && updatedRoom.current_leg !== oldRoom.current_leg) {
            console.log('[ROOM] Leg changed from', oldRoom.current_leg, 'to', updatedRoom.current_leg);
            loadMatchData();
          }
          
          // Handle forfeit
          if (updatedRoom.status === 'forfeited' && !didIForfeit) {
            // Stats are automatically recorded by rpc_forfeit_match when the forfeiter called it
            // Just show the modal to notify this player they won by forfeit
            setShowOpponentForfeitModal(true);
            toast.success('You won by forfeit!');
          }
          
          // Handle match finished - show winner popup
          if (updatedRoom.status === 'finished' && updatedRoom.winner_id && !matchEndStats) {
            showMatchEndPopup(updatedRoom);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quick_match_visits', filter: `room_id=eq.${matchId}` },
        (payload) => {
          const newVisit = payload.new as QuickMatchVisit;
          // Add all visits - the VisitHistoryPanel will filter by currentLeg
          setVisits((prev) => {
            const exists = prev.find(v => v.id === newVisit.id);
            if (exists) return prev;
            return [...prev, newVisit];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quick_match_visits', filter: `room_id=eq.${matchId}` },
        (payload) => {
          const updatedVisit = payload.new as QuickMatchVisit;
          
          // Get old visit from current state to compare scores
          setVisits((prev) => {
            const oldVisit = prev.find(v => v.id === updatedVisit.id);
            
            // Show notification if another player edited their visit and score changed
            if (oldVisit && updatedVisit.player_id !== currentUserId && oldVisit.score !== updatedVisit.score) {
              const player = profiles.find(p => p.user_id === updatedVisit.player_id);
              setEditNotification({
                show: true,
                playerName: player?.username || 'Opponent',
                oldScore: oldVisit.score,
                newScore: updatedVisit.score,
              });
              // Hide after 2 seconds
              setTimeout(() => setEditNotification(null), 2000);
            }
            
            return prev.map((v) => (v.id === updatedVisit.id ? updatedVisit : v));
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'quick_match_visits', filter: `room_id=eq.${matchId}` },
        (payload) => {
          const deletedId = (payload.old as any).id;
          setVisits((prev) => prev.filter((v) => v.id !== deletedId));
        }
      )
      .subscribe((status) => setIsConnected(status === 'SUBSCRIBED'));

    const signalsChannel = supabase
      .channel(`signals_${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_signals', filter: `room_id=eq.${matchId}` },
        (payload) => {
          const signal = payload.new as any;
          if (signal.type === 'forfeit' && signal.to_user_id === currentUserId) {
            // Use the same modal as DB detection - stats are already recorded by RPC
            setShowOpponentForfeitModal(true);
            toast.success('You won by forfeit!');
            setTimeout(() => cleanupMatchRef.current?.(), 100);
          }
          // Handle player connected signals
          if (signal.type === 'player_connected') {
            console.log('[CONNECTION] Player connected:', signal.from_user_id);
            setPlayersConnected(prev => {
              const isP1 = signal.from_user_id === room?.player1_id;
              return {
                p1: isP1 ? true : prev.p1,
                p2: isP1 ? prev.p2 : true
              };
            });
          }
          // Handle coin toss start signal (from Player 1 to Player 2)
          if (signal.type === 'coin_toss' && signal.from_user_id !== currentUserId) {
            console.log('[COIN TOSS] Received sync signal from Player 1');
            setCoinTossSyncStart(true);
          }
          // Note: Rematch is now handled via database subscription (quick_match_rematch_requests table)
          // Handle player ready signal
          if (signal.type === 'player_ready') {
            const readyPlayer = signal.payload?.player;
            console.log('[PREGAME] Received player_ready signal:', readyPlayer);
            if (readyPlayer === 'player1') {
              setPlayer1Ready(true);
            } else if (readyPlayer === 'player2') {
              setPlayer2Ready(true);
            }
          }
          // Note: Match won detection is done via room status change
        }
      )
      .subscribe();
    
    // Send player connected signal (with retry)
    const sendPlayerConnectedSignal = async () => {
      if (!currentUserId || !room) return;
      
      const opponentId = currentUserId === room.player1_id ? room.player2_id : room.player1_id;
      if (!opponentId) {
        console.log('[CONNECTION] No opponent yet, waiting...');
        return;
      }
      
      console.log('[CONNECTION] Sending player connected signal to:', opponentId);
      try {
        // Use RPC to bypass RLS
        const { data, error } = await supabase.rpc('rpc_send_player_connected', {
          p_room_id: matchId,
          p_to_user_id: opponentId
        });
        
        if (error) {
          console.error('[CONNECTION] RPC error:', error);
          return;
        }
        
        if (data?.ok) {
          // Mark self as connected
          setPlayersConnected(prev => ({
            p1: currentUserId === room.player1_id ? true : prev.p1,
            p2: currentUserId === room.player2_id ? true : prev.p2
          }));
          console.log('[CONNECTION] Player connected signal sent successfully');
        } else {
          console.error('[CONNECTION] RPC returned error:', data?.error);
        }
      } catch (error) {
        console.error('[CONNECTION] Error sending player connected signal:', error);
      }
    };
    
    // Send signal immediately
    sendPlayerConnectedSignal();
    
    // Retry every 2 seconds until both players are connected
    const retryInterval = setInterval(() => {
      setPlayersConnected(prev => {
        const bothConnected = prev.p1 && prev.p2;
        if (!bothConnected) {
          console.log('[CONNECTION] Retrying player connected signal...', prev);
          sendPlayerConnectedSignal();
        } else {
          console.log('[CONNECTION] Both players connected!');
          clearInterval(retryInterval);
        }
        return prev;
      });
    }, 2000);

    return () => {
      roomChannel.unsubscribe();
      signalsChannel.unsubscribe();
      clearInterval(retryInterval);
    };
  }

  const handleDartClick = (dartType: 'single' | 'double' | 'triple' | 'bull', number: number) => {
    if (currentVisit.length >= 3) return;

    let value = 0;
    let multiplier = 1;
    let label = '';
    let isDouble = false;

    if (dartType === 'bull') {
      value = number;
      multiplier = number === 50 ? 2 : 1;
      label = number === 50 ? 'DB' : 'SB';
      isDouble = number === 50;
      number = 25;
    } else if (dartType === 'single') {
      value = number;
      multiplier = 1;
      label = number.toString();
    } else if (dartType === 'double') {
      value = number * 2;
      multiplier = 2;
      label = `D${number}`;
      isDouble = true;
    } else if (dartType === 'triple') {
      value = number * 3;
      multiplier = 3;
      label = `T${number}`;
    }

    const newDarts = [...currentVisit, { type: dartType, number, value, multiplier, label, score: value, is_double: isDouble }];
    setCurrentVisit(newDarts);
    
    // Auto-submit after 3 darts
    if (newDarts.length === 3) {
      setTimeout(() => {
        // Check turn is still valid
        if (!matchState || matchState.currentTurnPlayer !== matchState.youArePlayer || submitting) return;
        
        const visitTotal = newDarts.reduce((sum, dart) => sum + dart.value, 0);
        const validation = validateCheckout(visitTotal, newDarts, false);
        
        if (validation.isBust) {
          submitScore(0, true, newDarts, false, false);
        } else {
          submitScore(visitTotal, false, newDarts, validation.isCheckout, false);
        }
      }, 300);
    }
  };

  const handleClearVisit = () => setCurrentVisit([]);
  const handleUndoDart = () => setCurrentVisit((prev) => prev.slice(0, -1));
  
  const handleMiss = () => {
    if (currentVisit.length >= 3) return;
    setCurrentVisit([...currentVisit, { type: 'single', number: 0, value: 0, multiplier: 1, label: 'Miss', score: 0, is_double: false }]);
  };

  const validateCheckout = (score: number, darts: Dart[], isTypedScore: boolean = false): { valid: boolean; error?: string; isCheckout: boolean; isBust: boolean } => {
    if (!room) return { valid: false, error: 'No room', isCheckout: false, isBust: false };
    
    const isPlayer1 = room.player1_id === currentUserId;
    const currentRemaining = isPlayer1 ? room.player1_remaining : room.player2_remaining;
    const newRemaining = currentRemaining - score;
    
    console.log('[VALIDATE] Checkout validation:', {
      score,
      currentRemaining,
      newRemaining,
      dartsCount: darts.length,
      lastDart: darts[darts.length - 1],
      doubleOut: room.double_out,
      isTypedScore
    });
    
    // Bust if score goes below 0
    if (newRemaining < 0) {
      console.log('[VALIDATE] Bust - below zero');
      return { valid: true, isCheckout: false, isBust: true };
    }
    
    // Bust if score is exactly 1 (can't finish on 1)
    if (newRemaining === 1) {
      console.log('[VALIDATE] Bust - left on 1');
      return { valid: true, isCheckout: false, isBust: true };
    }
    
    // Checkout - check if we reached exactly 0
    if (newRemaining === 0) {
      // Default to true for double_out if undefined (standard darts rules)
      const requireDouble = room.double_out !== false;
      
      if (requireDouble) {
        const lastDart = darts[darts.length - 1];
        console.log('[VALIDATE] Checking double requirement:', { lastDartIsDouble: lastDart?.is_double, lastDart });
        if (!lastDart?.is_double) {
          console.log('[VALIDATE] Bust - must finish on double');
          return { valid: true, isCheckout: false, isBust: true };
        }
      }
      console.log('[VALIDATE] Valid checkout!');
      return { valid: true, isCheckout: true, isBust: false };
    }
    
    return { valid: true, isCheckout: false, isBust: false };
  };

  const handleBust = async () => {
    if (!room || !currentUserId || submitting) return;
    if (matchState?.currentTurnPlayer !== matchState?.youArePlayer) {
      toast.error('Not your turn');
      return;
    }
    // Bust always counts as 3 darts thrown
    // If no darts entered, create 3 miss darts
    let bustDarts = [...currentVisit];
    while (bustDarts.length < 3) {
      bustDarts.push({ type: 'single', number: 0, value: 0, multiplier: 1, label: 'Miss', score: 0, is_double: false });
    }
    await submitScore(0, true, bustDarts);
  };

  const handleSubmitVisit = async () => {
    console.log('[SUBMIT] CLICKED');

    if (!matchId) {
      console.error('[SUBMIT] Missing roomId');
      toast.error('Missing room ID');
      return;
    }

    if (!currentUserId) {
      console.error('[SUBMIT] Missing user id');
      toast.error('User not authenticated');
      return;
    }

    if (submitting) {
      console.warn('[SUBMIT] Already submitting - blocked');
      return;
    }

    if (!room) {
      console.error('[SUBMIT] Missing room data');
      toast.error('Room data not loaded');
      return;
    }

    if (!matchState || matchState.currentTurnPlayer !== matchState.youArePlayer) {
      console.warn('[SUBMIT] Not your turn – blocked');
      toast.error('Not your turn');
      return;
    }

    if (currentVisit.length === 0) {
      console.warn('[SUBMIT] No darts entered');
      toast.error('Please enter darts');
      return;
    }

    const visitTotal = currentVisit.reduce((sum, dart) => sum + dart.value, 0);
    const validation = validateCheckout(visitTotal, currentVisit, false);  // false = button input

    console.log('[SUBMIT] Validation result:', validation);

    // If bust, submit with score 0
    if (validation.isBust) {
      console.log('[SUBMIT] Bust detected, submitting with score 0');
      await submitScore(0, true, currentVisit, false);
      return;
    }

    console.log('[SUBMIT] All checks passed, proceeding to submitScore');
    await submitScore(visitTotal, false, currentVisit, validation.isCheckout);
  };

  // Store pending checkout info for typed scores
  const [pendingCheckoutInfo, setPendingCheckoutInfo] = useState<{
    score: number;
    remainingBefore: number;
    isBust: boolean;
  } | null>(null);

  // Helper to get darts options based on score
  const getDartsOptions = (checkoutScore: number, isBust: boolean) => {
    if (isBust) return [1, 2, 3]; // Busts can be 1-3 darts
    
    // For checkouts:
    if (checkoutScore >= 141) return [3]; // Must use 3 darts
    if (checkoutScore >= 110) return [2, 3]; // 2 or 3 darts possible
    if (checkoutScore > 50) return [2, 3]; // 2 or 3 darts
    return [1, 2, 3]; // Lower scores can be any
  };

  const handleInputScoreSubmit = async () => {
    console.log('[TYPED SCORE] Submit clicked, scoreInput:', scoreInput);
    
    if (!scoreInput || scoreInput.trim() === '') {
      toast.error('Please enter a score');
      return;
    }
    
    const score = parseInt(scoreInput.trim());
    console.log('[TYPED SCORE] Parsed score:', score);
    
    if (isNaN(score) || score < 0 || score > 180) {
      toast.error('Invalid score (0-180)');
      return;
    }
    
    if (!room || !matchState) {
      toast.error('Game not ready');
      return;
    }
    
    if (matchState.currentTurnPlayer !== matchState.youArePlayer) {
      toast.error('Not your turn');
      return;
    }
    
    // For typed scores, create generic darts (not a double)
    // Typed scores can checkout (win leg) - double only required for button inputs
    const genericDarts: Dart[] = [
      { type: 'single', number: score, value: score, multiplier: 1, label: score.toString(), score, is_double: false }
    ];
    
    // IMPORTANT: For typed scores, we check if it would be a checkout (remaining = 0)
    // Typed scores can checkout WITHOUT requiring a double
    const isPlayer1 = room.player1_id === currentUserId;
    const currentRemaining = isPlayer1 ? room.player1_remaining : room.player2_remaining;
    const newRemaining = currentRemaining - score;
    
    // Check for bust conditions
    const isBust = newRemaining < 0 || newRemaining === 1;
    const isCheckout = newRemaining === 0;
    
    // If it's a BUST or CHECKOUT, check how many darts options there are
    if (isBust || isCheckout) {
      const dartsOptions = getDartsOptions(score, isBust);
      
      // If only 1 option, auto-pick it and don't show dialog
      if (dartsOptions.length === 1) {
        const dartsThrown = dartsOptions[0];
        console.log('[TYPED SCORE] Auto-picking', dartsThrown, 'darts (only option)');
        
        // Create darts array
        const darts: Dart[] = [];
        if (isBust) {
          // Bust: all misses
          for (let i = 0; i < dartsThrown; i++) {
            darts.push({
              type: 'single', number: 0, value: 0, multiplier: 1,
              label: 'Miss', score: 0, is_double: false
            });
          }
          await submitScore(0, true, darts, false, true);
        } else {
          // Checkout: last dart is the checkout
          for (let i = 0; i < dartsThrown; i++) {
            const isLastDart = i === dartsThrown - 1;
            darts.push({
              type: isLastDart ? 'double' : 'single',
              number: isLastDart ? score : 0,
              value: isLastDart ? score : 0,
              multiplier: isLastDart ? 2 : 1,
              label: isLastDart ? `D${score/2}` : 'Miss',
              score: isLastDart ? score : 0,
              is_double: isLastDart
            });
          }
          await submitScoreWithCheckoutDetails(score, darts, dartsThrown, 1);
        }
        setScoreInput('');
        return;
      }
      
      // Multiple options - show dialog
      console.log('[TYPED SCORE] Bust or Checkout detected, showing darts dialog');
      setPendingCheckoutInfo({ 
        score: isBust ? 0 : score,
        remainingBefore: currentRemaining,
        isBust 
      });
      setShowCheckoutDialog(true);
      return;
    }
    
    // Normal score - assume 3 darts thrown, submit immediately
    console.log('[TYPED SCORE] Normal score - assuming 3 darts, remaining:', newRemaining);
    
    // Create 3 darts for normal score
    const normalDarts: Dart[] = [
      { type: 'single', number: score, value: score, multiplier: 1, label: score.toString(), score, is_double: false },
      { type: 'single', number: 0, value: 0, multiplier: 1, label: 'Miss', score: 0, is_double: false },
      { type: 'single', number: 0, value: 0, multiplier: 1, label: 'Miss', score: 0, is_double: false }
    ];
    
    await submitScore(score, false, normalDarts, false, true);
    setScoreInput('');
  };

  // Handle checkout/bust details submission from dialog
  const handleCheckoutDetailsSubmit = async (dartsThrown: number, dartsAtDouble: number) => {
    if (!pendingCheckoutInfo) return;
    
    console.log('[TYPED SCORE] Details submitted:', { dartsThrown, dartsAtDouble, isBust: pendingCheckoutInfo.isBust });
    
    const { score, remainingBefore, isBust } = pendingCheckoutInfo;
    
    // Create darts array
    const darts: Dart[] = [];
    
    if (isBust) {
      // Bust: Add darts thrown (all misses that led to the bust)
      // The last dart caused the bust
      for (let i = 0; i < dartsThrown; i++) {
        darts.push({
          type: 'single',
          number: 0,
          value: 0,
          multiplier: 1,
          label: 'Miss',
          score: 0,
          is_double: false
        });
      }
      
      // Close dialog and clear pending state
      setShowCheckoutDialog(false);
      setPendingCheckoutInfo(null);
      setScoreInput('');
      
      // Submit as bust (score = 0)
      await submitScore(0, true, darts, false, true);
    } else {
      // Checkout: Add darts (last one is the checkout dart)
      for (let i = 0; i < dartsThrown; i++) {
        const isLastDart = i === dartsThrown - 1;
        darts.push({
          type: isLastDart ? 'double' : 'single',
          number: isLastDart ? score : 0,
          value: isLastDart ? score : 0,
          multiplier: isLastDart ? 2 : 1,
          label: isLastDart ? `D${score/2}` : 'Miss',
          score: isLastDart ? score : 0,
          is_double: isLastDart
        });
      }
      
      // Close dialog and clear pending state
      setShowCheckoutDialog(false);
      setPendingCheckoutInfo(null);
      setScoreInput('');
      
      // Submit with checkout details
      await submitScoreWithCheckoutDetails(score, darts, dartsThrown, dartsAtDouble);
    }
  };

  // Submit score with checkout details (darts thrown and darts at double)
  async function submitScoreWithCheckoutDetails(score: number, darts: Dart[], dartsThrown: number, dartsAtDouble: number) {
    console.log('[SUBMIT CHECKOUT] submitScoreWithCheckoutDetails called', { score, dartsThrown, dartsAtDouble });

    if (!room) {
      toast.error('Room data missing');
      return;
    }

    if (!matchState) {
      toast.error('Match state missing');
      return;
    }

    if (!currentUserId) {
      toast.error('User not authenticated');
      return;
    }

    setSubmitting(true);

    try {
      const dartsArray = darts.map(dart => {
        let mult: 'S' | 'D' | 'T' | 'SB' | 'DB' = 'S';
        if (dart.type === 'bull') mult = dart.value === 50 ? 'DB' : 'SB';
        else if (dart.type === 'double') mult = 'D';
        else if (dart.type === 'triple') mult = 'T';
        return { n: dart.number, mult };
      });

      console.log('[SUBMIT CHECKOUT] Submitting with dartsThrown:', dartsThrown, 'dartsAtDouble:', dartsAtDouble);

      const { data, error } = await supabase.rpc("rpc_quick_match_submit_visit_v3", {
        p_room_id: matchId,
        p_score: score,
        p_darts: dartsArray,
        p_is_bust: false,
        p_darts_thrown: dartsThrown,
        p_darts_at_double: dartsAtDouble,
        p_is_typed_score: true
      });

      if (error) {
        console.error('[SUBMIT CHECKOUT] Supabase RPC error:', error);
        toast.error(error.message || 'Failed to submit');
        return;
      }

      if (!data?.ok) {
        console.error('[SUBMIT CHECKOUT] RPC returned not ok:', data);
        toast.error(data?.error || 'Failed to submit visit');
        return;
      }

      console.log('[SUBMIT CHECKOUT] RPC success:', data);
      toast.success('🎯 CHECKOUT!');

      // Clear input
      setScoreInput('');
      setCurrentVisit([]);

      // Handle match won
      if (data.match_won) {
        // Stats and popup will be handled by the realtime subscription or the submit handler
        console.log('[SUBMIT CHECKOUT] Match won!');
      }

    } catch (error: any) {
      console.error('[SUBMIT CHECKOUT] Unexpected error:', error);
      toast.error(error?.message || 'Failed to submit visit');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitScore(score: number, isBust: boolean, darts: Dart[], isCheckout: boolean = false, isTypedScore: boolean = false) {
    console.log('[SUBMIT] submitScore called', { score, isBust, dartsCount: darts.length, isCheckout, isTypedScore });

    if (!room) {
      console.error('[SUBMIT] No room data');
      toast.error('Room data missing');
      return;
    }

    if (!matchState) {
      console.error('[SUBMIT] No match state');
      toast.error('Match state missing');
      return;
    }

    if (!currentUserId) {
      console.error('[SUBMIT] No current user ID');
      toast.error('User not authenticated');
      return;
    }

    if (matchState.currentTurnPlayer !== matchState.youArePlayer) {
      console.warn('[SUBMIT] Not your turn in submitScore');
      toast.error('Not your turn');
      return;
    }

    // DART COUNTING FIX:
    // - If bust, count as 3 darts thrown (per dart rules)
    // - If not checkout and fewer than 3 darts, pad to 3 darts (all darts count)
    let dartsToSubmit = [...darts];
    if (isBust) {
      // Bust always counts as 3 darts (or however many were entered, minimum 3)
      while (dartsToSubmit.length < 3) {
        dartsToSubmit.push({ type: 'single', number: 0, value: 0, multiplier: 1, label: 'Miss', score: 0, is_double: false });
      }
    } else if (!isCheckout && dartsToSubmit.length > 0 && dartsToSubmit.length < 3) {
      // Non-checkout visit with partial darts - pad to 3 darts
      while (dartsToSubmit.length < 3) {
        dartsToSubmit.push({ type: 'single', number: 0, value: 0, multiplier: 1, label: 'Miss', score: 0, is_double: false });
      }
    }

    const dartsArray = dartsToSubmit.map(dart => {
      let mult: 'S' | 'D' | 'T' | 'SB' | 'DB' = 'S';
      if (dart.type === 'bull') mult = dart.value === 50 ? 'DB' : 'SB';
      else if (dart.type === 'double') mult = 'D';
      else if (dart.type === 'triple') mult = 'T';
      return { n: dart.number, mult };
    });

    console.log('[SUBMIT] Submitting payload:', {
      roomId: matchId,
      score,
      isBust,
      darts: dartsArray,
      dartsThrown: dartsToSubmit.length,
      isCheckout
    });

    setSubmitting(true);

    try {
      console.log('[SUBMIT] Calling rpc_quick_match_submit_visit_v3...');

      const dartsThrown = dartsToSubmit.length;
      
      const { data, error } = await supabase.rpc("rpc_quick_match_submit_visit_v3", {
        p_room_id: matchId,
        p_score: score,
        p_darts: dartsArray,
        p_is_bust: isBust,
        p_darts_thrown: dartsThrown,
        p_is_typed_score: isTypedScore
      });

      console.log('[SUBMIT] RPC returned', { data, error });

      if (error) {
        console.error('[SUBMIT] Supabase RPC error:', error);
        toast.error(error.message || 'Failed to submit');
        return;
      }

      if (!data?.ok) {
        console.error('[SUBMIT] RPC returned not ok:', data);
        toast.error(data?.error || 'Failed to submit visit');
        return;
      }

      console.log('[SUBMIT] RPC success:', data);

      // Track score achievements (180s, 100+, 26s, 69s)
      if (!isBust && score > 0) {
        trackScoreAchievement(score, 'quick_match').catch(console.error);
      }

      // Clear local visit state for next turn
      console.log('[SUBMIT] Clearing local visit state');
      setScoreInput('');
      setCurrentVisit([]);

      if (data.leg_won) {
        console.log('[SUBMIT] Leg won!');
        toast.success('🎯 CHECKOUT! Leg won!');
        
        // Track checkout achievements
        if (!isBust && score > 0) {
          trackCheckoutAchievement(score).catch(console.error);
        }
        
        // Check if match was also won - calculate from current legs + this new leg
        const currentP1Legs = room.player1_legs || 0;
        const currentP2Legs = room.player2_legs || 0;
        const isPlayer1 = currentUserId === room.player1_id;
        
        // Add the leg we just won
        const newP1Legs = isPlayer1 ? currentP1Legs + 1 : currentP1Legs;
        const newP2Legs = !isPlayer1 ? currentP2Legs + 1 : currentP2Legs;
        const legsToWin = room.legs_to_win || 1;
        
        // Check if match is won (either from RPC response or our calculation)
        const isMatchWon = data.match_won || newP1Legs >= legsToWin || newP2Legs >= legsToWin;
        
        console.log('[SUBMIT] Checking match win - P1 legs:', newP1Legs, 'P2 legs:', newP2Legs, 
                    'Legs to win:', legsToWin, 'IsMatchWon:', isMatchWon, 'RPC match_won:', data.match_won);
        
        // Update room state with new leg counts (for both leg win and match win)
        setRoom({
          ...room,
          player1_legs: newP1Legs,
          player2_legs: newP2Legs,
        });
        
        if (isMatchWon) {
          console.log('[SUBMIT] MATCH WON!');
          toast.success('🏆 MATCH WON!');
          
          const winnerId = currentUserId;
          const isPlayer1Winner = winnerId === room.player1_id;
          const loserId = isPlayer1Winner ? room.player2_id : room.player1_id;
          
          // Ensure we have profiles loaded - fetch if needed
          let currentProfiles = profiles;
          if (currentProfiles.length === 0 || !currentProfiles.find(p => p.user_id === winnerId)) {
            console.log('[MATCH END] Fetching profiles...');
            const { data: freshProfiles } = await supabase
              .from('profiles')
              .select('user_id, username, trust_rating_letter')
              .in('user_id', [room.player1_id, room.player2_id]);
            if (freshProfiles) {
              currentProfiles = freshProfiles as Profile[];
              setProfiles(currentProfiles);
            }
          }
          
          const winnerProfile = currentProfiles.find(p => p.user_id === winnerId);
          const loserProfile = currentProfiles.find(p => p.user_id === loserId);
          
          const winnerLegs = isPlayer1Winner ? newP1Legs : newP2Legs;
          const loserLegs = isPlayer1Winner ? newP2Legs : newP1Legs;
          
          // Fetch ALL visits from database to ensure accurate stats for both players
          console.log('[MATCH END - SUBMIT] Fetching all visits for room:', matchId);
          const { data: allVisits, error: visitsError } = await supabase
            .from('quick_match_visits')
            .select('*')
            .eq('room_id', matchId)
            .order('leg', { ascending: true })
            .order('turn_no', { ascending: true });
          
          if (visitsError) {
            console.error('[MATCH END - SUBMIT] Error fetching visits:', visitsError);
          }
          
          console.log('[MATCH END - SUBMIT] Fetched visits:', { 
            count: allVisits?.length || 0, 
            p1Visits: allVisits?.filter(v => v.player_id === room.player1_id).length || 0,
            p2Visits: allVisits?.filter(v => v.player_id === room.player2_id).length || 0
          });
          
          // Add the final winning visit to the data
          const finalVisit: QuickMatchVisit = {
            id: 'temp-' + Date.now(),
            room_id: matchId,
            player_id: currentUserId,
            leg: room.current_leg,
            turn_no: 999,
            score: isBust ? 0 : score,
            remaining_before: isPlayer1 ? room.player1_remaining : room.player2_remaining,
            remaining_after: data.remaining_after,
            darts: darts.map(d => ({ n: d.number, mult: d.type === 'bull' ? (d.value === 50 ? 'DB' : 'SB') : d.type === 'double' ? 'D' : d.type === 'triple' ? 'T' : 'S' })),
            darts_thrown: darts.length,
            darts_at_double: darts.filter(d => d.is_double).length,
            is_bust: isBust,
            bust_reason: null,
            is_checkout: true,
            created_at: new Date().toISOString()
          };
          
          // Check if finalVisit already exists in allVisits (avoid duplication)
          const finalVisitExists = (allVisits as QuickMatchVisit[])?.some(v => 
            v.player_id === finalVisit.player_id && 
            v.leg === finalVisit.leg && 
            v.is_checkout
          );
          
          // Only add finalVisit if it doesn't already exist in the database
          const completeVisits = finalVisitExists 
            ? (allVisits as QuickMatchVisit[]) || visits
            : [...((allVisits as QuickMatchVisit[]) || visits), finalVisit];
          
          // Debug: Log all visits
          logVisitsDebug('SUBMIT_MATCH_END', completeVisits, room.player1_id, room.player2_id);
          
          // Use the room's leg counts directly - these are the source of truth
          // The room was already updated by the RPC with correct leg counts
          const finalP1Legs = newP1Legs;
          const finalP2Legs = newP2Legs;
          
          console.log('[MATCH END] Legs from room:', { finalP1Legs, finalP2Legs });
          
          // Calculate stats for BOTH players - pass ALL visits and let the function filter
          console.log('[MATCH_END_SUBMIT] Calculating winner stats:', { winnerId, name: winnerProfile?.username });
          let wStats = calculatePlayerStatsFromVisits(
            completeVisits,
            winnerId,
            winnerProfile?.username || 'Winner',
            isPlayer1Winner ? finalP1Legs : finalP2Legs
          );
          
          console.log('[MATCH_END_SUBMIT] Calculating loser stats:', { loserId, name: loserProfile?.username });
          let lStats = calculatePlayerStatsFromVisits(
            completeVisits,
            loserId,
            loserProfile?.username || 'Loser',
            isPlayer1Winner ? finalP2Legs : finalP1Legs
          );
          
          // Update visits state
          setVisits(completeVisits);
          
          // IMPORTANT: Re-fetch ALL visits from DB to ensure we have complete data for BOTH players
          // The completeVisits above includes the final visit we just added, but let's verify
          console.log('[MATCH_END_SUBMIT] Re-fetching visits to verify data...');
          const { data: verifyVisits } = await supabase
            .from('quick_match_visits')
            .select('*')
            .eq('room_id', matchId)
            .order('leg', { ascending: true })
            .order('turn_no', { ascending: true });
          
          if (verifyVisits) {
            console.log('[MATCH_END_SUBMIT] Verified visits from DB:', {
              count: verifyVisits.length,
              p1Visits: verifyVisits.filter(v => v.player_id === room.player1_id).length,
              p2Visits: verifyVisits.filter(v => v.player_id === room.player2_id).length,
              p1Checkouts: verifyVisits.filter(v => v.player_id === room.player1_id && v.is_checkout).length,
              p2Checkouts: verifyVisits.filter(v => v.player_id === room.player2_id && v.is_checkout).length,
            });
            
            // Use verified visits for stats calculation
            const verifiedVisits = verifyVisits as QuickMatchVisit[];
            
            // Re-calculate stats with verified data
            console.log('[MATCH_END_SUBMIT] Re-calculating with verified visits...');
            const wStatsVerified = calculatePlayerStatsFromVisits(
              verifiedVisits,
              winnerId,
              winnerProfile?.username || 'Winner',
              isPlayer1Winner ? finalP1Legs : finalP2Legs
            );
            const lStatsVerified = calculatePlayerStatsFromVisits(
              verifiedVisits,
              loserId,
              loserProfile?.username || 'Loser',
              isPlayer1Winner ? finalP2Legs : finalP1Legs
            );
            
            // Update stats with verified data
            console.log('[MATCH_END_SUBMIT] Verified stats:', {
              winner: { checkout: wStatsVerified.highestCheckout, checkoutPct: wStatsVerified.checkoutPercentage },
              loser: { checkout: lStatsVerified.highestCheckout, checkoutPct: lStatsVerified.checkoutPercentage }
            });
            
            // Use verified stats by reassigning
            wStats = wStatsVerified;
            lStats = lStatsVerified;
            
            // Update visits state with verified data
            setVisits(verifiedVisits);
          }
          
          // Show winner popup immediately for the winner
          // Determine player1 and player2 based on room data
          const p1Id = room.player1_id;
          const p2Id = room.player2_id;
          const p1Profile = currentProfiles.find(p => p.user_id === p1Id);
          const p2Profile = currentProfiles.find(p => p.user_id === p2Id);
          
          console.log('[MATCH END] Setting winner popup stats:', { finalP1Legs, finalP2Legs, winnerId, p1Name: p1Profile?.username, p2Name: p2Profile?.username });
          
          setMatchEndStats({
            player1: { id: p1Id, name: p1Profile?.username || room.player1_id?.substring(0, 8) || 'Player 1', legs: finalP1Legs },
            player2: { id: p2Id, name: p2Profile?.username || room.player2_id?.substring(0, 8) || 'Player 2', legs: finalP2Legs },
            player1FullStats: p1Id === winnerId ? wStats : lStats,
            player2FullStats: p2Id === winnerId ? wStats : lStats,
            winnerId: winnerId,
          });
          
          // Save stats to database for both players using accurate leg counts
          const finalWinnerLegs = isPlayer1Winner ? finalP1Legs : finalP2Legs;
          const finalLoserLegs = isPlayer1Winner ? finalP2Legs : finalP1Legs;
          await saveMatchStats(matchId, winnerId, loserId, finalWinnerLegs, finalLoserLegs, room.game_mode);
          
          // Track achievements for the winner
          const winnerStats = isPlayer1Winner ? wStats : lStats;
          if (currentUserId === winnerId) {
            processMatchEnd({
              winnerId,
              loserId,
              winnerLegs: finalWinnerLegs,
              loserLegs: finalLoserLegs,
              gameMode: room.game_mode,
              matchType: 'quick_match',
              playerStats: [{
                playerId: winnerId,
                average: winnerStats.threeDartAverage,
                oneEighties: winnerStats.oneEighties,
                tonPlus: winnerStats.count100Plus + winnerStats.count140Plus,
                highestCheckout: winnerStats.highestCheckout,
                checkouts: winnerStats.checkouts,
              }],
            }).catch(console.error);
          }
          
          // Update room state
          setRoom({
            ...room,
            player1_legs: finalP1Legs,
            player2_legs: finalP2Legs,
            status: 'finished',
            winner_id: winnerId,
          });
        }
      } else if (isBust) {
        toast.error('💥 BUST!');
      }
      
      // Update remaining score in local state (for non-checkout visits, checkout is handled above)
      if (!data.leg_won && room && data.remaining_after !== undefined) {
        const isPlayer1 = room.player1_id === currentUserId;
        setRoom({
          ...room,
          player1_remaining: isPlayer1 ? data.remaining_after : room.player1_remaining,
          player2_remaining: !isPlayer1 ? data.remaining_after : room.player2_remaining,
        });
      }

      console.log('[SUBMIT] Submit completed successfully');
    } catch (error: any) {
      console.error('[SUBMIT] Unexpected error:', error);
      toast.error(error?.message || 'Failed to submit visit');
    } finally {
      setSubmitting(false);
      console.log('[SUBMIT] Submitting flag cleared');
    }
  }

  async function forfeitMatch() {
    if (!room || !matchState || !currentUserId) return;
    if (['completed', 'finished', 'forfeited'].includes(room.status)) {
      toast.error("Match already ended");
      setShowEndMatchDialog(false);
      return;
    }

    // Can only forfeit on your turn
    if (!isMyTurn) {
      toast.error("You can only forfeit on your turn");
      setShowEndMatchDialog(false);
      return;
    }

    const opponentId = matchState.youArePlayer === 1 ? room.player2_id : room.player1_id;
    if (!opponentId) return;

    setForfeitLoading(true);
    setDidIForfeit(true);
    setShowEndMatchDialog(false);

    try {
      const { data, error } = await supabase.rpc('rpc_forfeit_match', { p_room_id: matchId });
      if (error) throw error;

      if (!data?.ok) {
        toast.error(data?.error || "Couldn't forfeit");
        setDidIForfeit(false);
        return;
      }

      await supabase.rpc('rpc_send_match_signal', {
        p_room_id: matchId,
        p_to_user_id: opponentId,
        p_type: 'forfeit',
        p_payload: { message: 'Opponent forfeited' }
      });

      toast.success('You forfeited the match');
      
      // Stats are automatically recorded by rpc_forfeit_match
      // No need to call saveMatchStats here - it would create duplicates
      
      cleanupMatchRef.current?.();
      await clearMatchState(matchId);
      router.push('/app/play');
    } catch (error: any) {
      toast.error("Couldn't forfeit—try again");
      setDidIForfeit(false);
    } finally {
      setForfeitLoading(false);
    }
  }

  // ============================================================
  // EDIT VISIT FUNCTIONS
  // ============================================================
  const handleEditVisit = (visit: QuickMatchVisit) => {
    if (visit.player_id !== currentUserId) {
      toast.error("You can only edit your own visits");
      return;
    }
    setEditingVisit(visit);
    setShowEditModal(true);
  };

  const handleSaveEditedVisit = async (updatedVisit: QuickMatchVisit, newScore: number, newDarts: any[]) => {
    try {
      console.log('[EDIT] Saving visit:', updatedVisit.id, 'New score:', newScore);

      // Calculate new remaining
      const newRemaining = updatedVisit.remaining_before - newScore;
      
      // Determine if this is now a checkout or bust
      let isCheckout = false;
      let isBust = false;
      let bustReason = null;
      let finalScore = newScore;  // If bust, score is 0

      if (newRemaining < 0) {
        // Bust: score goes below 0
        isBust = true;
        bustReason = 'Bust';
        finalScore = 0;  // Score is 0 on bust
      } else if (newRemaining === 1) {
        // Bust: can't finish on 1
        isBust = true;
        bustReason = 'Cannot finish on 1';
        finalScore = 0;
      } else if (newRemaining === 0) {
        // Edited score brings remaining to 0 - it's a checkout (win leg)!
        // Edited scores can checkout without requiring a double
        isCheckout = true;
      }

      // Calculate final remaining BEFORE using it
      const finalRemaining = isBust ? updatedVisit.remaining_before : newRemaining;
      const isPlayer1 = room?.player1_id === updatedVisit.player_id;

      // Use UPDATE instead of DELETE/INSERT to avoid unique constraint violation
      const { error: updateError } = await supabase
        .from('quick_match_visits')
        .update({
          score: finalScore,
          darts: newDarts,
          darts_thrown: newDarts.length,
          darts_at_double: newDarts.filter((d: any) => d.mult === 'D' || d.mult === 'DB').length,
          remaining_after: isBust ? updatedVisit.remaining_before : newRemaining,
          is_bust: isBust,
          is_checkout: isCheckout,
          bust_reason: bustReason,
          updated_at: new Date().toISOString()
        })
        .eq('id', updatedVisit.id);

      if (updateError) {
        console.error('[EDIT] Update error:', updateError);
        throw updateError;
      }

      toast.success('Visit updated');
      
      // Handle checkout - win the leg and possibly the match
      if (isCheckout && room) {
        toast.success('🎯 CHECKOUT! Leg won!');
        
        // Check if this is the current leg and there are no subsequent visits from the opponent
        const { data: subsequentVisits } = await supabase
          .from('quick_match_visits')
          .select('*')
          .eq('room_id', matchId)
          .eq('leg', updatedVisit.leg)
          .gt('turn_no', updatedVisit.turn_no)
          .order('turn_no', { ascending: true });
        
        // Also check for opponent visits after this one
        const opponentId = isPlayer1 ? room.player2_id : room.player1_id;
        const { data: opponentSubsequentVisits } = await supabase
          .from('quick_match_visits')
          .select('*')
          .eq('room_id', matchId)
          .eq('leg', updatedVisit.leg)
          .eq('player_id', opponentId)
          .order('turn_no', { ascending: true });
        
        // Find opponent visits that came after this edited visit
        const opponentVisitsAfter = opponentSubsequentVisits?.filter(v => 
          // Opponent turn number is higher than ours (they played after us)
          v.turn_no > updatedVisit.turn_no ||
          // Or if we don't have turn_no, use created_at
          (v.turn_no === updatedVisit.turn_no && new Date(v.created_at) > new Date(updatedVisit.created_at))
        ) || [];
        
        // If there are opponent visits after this one, we need to delete them since the leg is now over
        if (opponentVisitsAfter.length > 0) {
          console.log('[EDIT] Deleting opponent visits after edited checkout:', opponentVisitsAfter.map(v => v.id));
          for (const oppVisit of opponentVisitsAfter) {
            await supabase.from('quick_match_visits').delete().eq('id', oppVisit.id);
          }
        }
        
        // Calculate new leg counts
        const currentP1Legs = room.player1_legs || 0;
        const currentP2Legs = room.player2_legs || 0;
        const newP1Legs = isPlayer1 ? currentP1Legs + 1 : currentP1Legs;
        const newP2Legs = !isPlayer1 ? currentP2Legs + 1 : currentP2Legs;
        const legsToWin = room.legs_to_win || 1;
        
        // Check if match is won
        const isMatchWon = newP1Legs >= legsToWin || newP2Legs >= legsToWin;
        
        console.log('[EDIT] Leg won via edit - P1 legs:', newP1Legs, 'P2 legs:', newP2Legs, 'Match won:', isMatchWon);
        
        if (isMatchWon) {
          // Match won - end the match
          toast.success('🏆 MATCH WON!');
          
          const winnerId = updatedVisit.player_id;
          
          await supabase
            .from('match_rooms')
            .update({
              player1_legs: newP1Legs,
              player2_legs: newP2Legs,
              status: 'finished',
              winner_id: winnerId,
              current_turn: null,
            })
            .eq('id', matchId);
          
          // The subscription will detect the status change and show the match end modal
        } else {
          // Leg won but match continues - start new leg
          const newLeg = room.current_leg + 1;
          const gameMode = room.game_mode || 501;
          
          // Determine who starts the next leg (alternating)
          // Leg starter alternates: odd legs (1,3,5...) started by player who started leg 1
          // Even legs (2,4,6...) started by the other player
          const firstLegStarterId = room.leg_starter_id || room.player1_id;
          const isFirstLegStarterPlayer1 = firstLegStarterId === room.player1_id;
          // Odd legs: firstLegStarter starts, Even legs: other player starts
          const newLegStarterIsPlayer1 = newLeg % 2 === 1 ? isFirstLegStarterPlayer1 : !isFirstLegStarterPlayer1;
          const newCurrentTurn = newLegStarterIsPlayer1 ? room.player1_id : room.player2_id;
          
          await supabase
            .from('match_rooms')
            .update({
              player1_legs: newP1Legs,
              player2_legs: newP2Legs,
              current_leg: newLeg,
              player1_remaining: gameMode,
              player2_remaining: gameMode,
              current_turn: newCurrentTurn,
            })
            .eq('id', matchId);
          
          toast.success(`Starting leg ${newLeg}!`);
        }
      } else if (isBust) {
        toast.error('💥 BUST!');
      }
      
      // Recalculate all subsequent visits for this player (pass new remaining for room update)
      await recalculateSubsequentVisits(updatedVisit.player_id, updatedVisit.leg, updatedVisit.turn_no, finalRemaining);
      
      // Update local room state immediately for responsive UI
      if (room) {
        console.log('[EDIT] Updating room state:', { isPlayer1, finalRemaining });
        const newRoom = {
          ...room,
          player1_remaining: isPlayer1 ? finalRemaining : room.player1_remaining,
          player2_remaining: !isPlayer1 ? finalRemaining : room.player2_remaining,
        };
        console.log('[EDIT] New room state:', newRoom);
        setRoom(newRoom);
      }
      
      await loadMatchData();
    } catch (error: any) {
      console.error('[EDIT] Failed:', error);
      toast.error(`Failed to update: ${error.message}`);
      throw error;
    }
  };

  async function recalculateSubsequentVisits(playerId: string, leg: number, fromTurnNo: number, editedVisitNewRemaining?: number) {
    // Get all subsequent visits for this player in this leg
    const { data: subsequentVisits } = await supabase
      .from('quick_match_visits')
      .select('*')
      .eq('room_id', matchId)
      .eq('leg', leg)
      .eq('player_id', playerId)
      .gt('turn_no', fromTurnNo)
      .order('turn_no', { ascending: true });

    // If no subsequent visits, update room with the edited visit's remaining
    if (!subsequentVisits || subsequentVisits.length === 0) {
      if (editedVisitNewRemaining !== undefined) {
        const isPlayer1 = room?.player1_id === playerId;
        await supabase
          .from('match_rooms')
          .update(isPlayer1 ? { player1_remaining: editedVisitNewRemaining } : { player2_remaining: editedVisitNewRemaining })
          .eq('id', matchId);
      }
      return;
    }

    // Get the updated visit to find the new remaining_after
    const { data: updatedVisit } = await supabase
      .from('quick_match_visits')
      .select('remaining_after')
      .eq('room_id', matchId)
      .eq('leg', leg)
      .eq('player_id', playerId)
      .eq('turn_no', fromTurnNo)
      .single();

    let runningRemaining = updatedVisit?.remaining_after || 0;

    // Update each subsequent visit
    for (const visit of subsequentVisits) {
      const newRemaining = runningRemaining - visit.score;
      
      let isBust = false;
      let isCheckout = false;
      let bustReason = null;
      let finalRemaining = newRemaining;

      if (newRemaining < 0) {
        isBust = true;
        bustReason = 'Bust';
        finalRemaining = runningRemaining;
      } else if (newRemaining === 0) {
        const lastDart = visit.darts[visit.darts.length - 1];
        if (room?.double_out && lastDart?.mult !== 'D' && lastDart?.mult !== 'DB') {
          isBust = true;
          bustReason = 'Must finish on a double';
          finalRemaining = runningRemaining;
        } else {
          isCheckout = true;
        }
      }

      await supabase
        .from('quick_match_visits')
        .update({
          remaining_before: runningRemaining,
          remaining_after: finalRemaining,
          is_bust: isBust,
          is_checkout: isCheckout,
          bust_reason: bustReason
        })
        .eq('id', visit.id);

      if (!isBust) {
        runningRemaining = finalRemaining;
      }
    }

    // Update match_rooms with final remaining
    const isPlayer1 = room?.player1_id === playerId;
    await supabase
      .from('match_rooms')
      .update(isPlayer1 ? { player1_remaining: runningRemaining } : { player2_remaining: runningRemaining })
      .eq('id', matchId);
  }

  const handleDeleteVisit = async (visitId: string) => {
    try {
      const { error } = await supabase.from('quick_match_visits').delete().eq('id', visitId);
      if (error) throw error;
      toast.success('Visit deleted');
      await loadMatchData();
    } catch (error: any) {
      toast.error(`Failed to delete: ${error.message}`);
    }
  };

  const handleTrustRating = async (rating: string) => {
    if (!matchState || hasSubmittedRating || ratingLoading) return;
    const opponentId = matchState.youArePlayer === 1 ? room?.player2_id : room?.player1_id;
    if (!opponentId) return;

    setRatingLoading(true);
    try {
      const { error } = await supabase.rpc('rpc_submit_trust_rating', {
        p_rated_user_id: opponentId,
        p_rating: rating,
      });
      if (error) throw error;
      setSelectedRating(rating);
      setHasSubmittedRating(true);
      toast.success(`Rated ${rating}`);
    } catch (error: any) {
      toast.error(`Failed to submit rating: ${error.message}`);
    } finally {
      setRatingLoading(false);
    }
  };

  // Simple rematch handler - uses the new hook
  const handleRematch = async () => {
    if (rematchLoading) return;
    await requestRematch();
  };

  async function saveMatchStats(
    roomId: string, 
    winnerId: string, 
    loserId: string, 
    winnerLegs: number, 
    loserLegs: number,
    gameMode: number
  ) {
    console.log('[STATS] Saving match stats:', { roomId, winnerId, loserId, winnerLegs, loserLegs, gameMode });
    
    try {
      // Save winner stats
      const { data: winnerResult, error: winnerError } = await supabase.rpc('fn_update_player_match_stats', {
        p_room_id: roomId,
        p_user_id: winnerId,
        p_opponent_id: loserId,
        p_result: 'win',
        p_legs_won: winnerLegs,
        p_legs_lost: loserLegs,
        p_game_mode: gameMode
      });
      
      if (winnerError) {
        console.error('[STATS] Error saving winner stats:', winnerError);
        throw winnerError;
      }
      console.log('[STATS] Winner stats saved:', winnerResult);
      
      // Save loser stats
      const { data: loserResult, error: loserError } = await supabase.rpc('fn_update_player_match_stats', {
        p_room_id: roomId,
        p_user_id: loserId,
        p_opponent_id: winnerId,
        p_result: 'loss',
        p_legs_won: loserLegs,
        p_legs_lost: winnerLegs,
        p_game_mode: gameMode
      });
      
      if (loserError) {
        console.error('[STATS] Error saving loser stats:', loserError);
        throw loserError;
      }
      console.log('[STATS] Loser stats saved:', loserResult);
      
      toast.success('Match stats saved!');
      console.log('[STATS] Match stats saved successfully');
    } catch (error: any) {
      console.error('[STATS] Failed to save match stats:', error);
      toast.error('Failed to save match stats');
    }
  }

  const handleReturn = () => {
    cleanupMatchRef.current?.();
    router.push('/app/play');
  };

  // Handle camera refresh - restarts camera to try to fix connection issues
  const handleRefreshCamera = async () => {
    setIsRefreshingCamera(true);
    try {
      await refreshCamera();
      toast.success('Camera refreshed');
    } catch (error) {
      toast.error('Failed to refresh camera');
    } finally {
      setIsRefreshingCamera(false);
    }
  };

  // Handle connection refresh - reconnects to opponent's camera
  const handleRefreshConnection = async () => {
    setIsRefreshingConnection(true);
    try {
      await refreshConnection();
      toast.success('Reconnecting to opponent...');
    } catch (error) {
      toast.error('Failed to reconnect');
    } finally {
      // Keep loading state for a bit longer as connection takes time
      setTimeout(() => {
        setIsRefreshingConnection(false);
      }, 2000);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="text-white">Loading match...</div>
      </div>
    );
  }

  if (!room || !matchState) {
    return (
      <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <Card className="bg-slate-900/50 border-white/10 p-8 text-center">
          <p className="text-white text-lg mb-4">Match not found</p>
          <Button onClick={() => router.push('/app')} className="bg-emerald-500 hover:bg-emerald-600">
            Back to Home
          </Button>
        </Card>
      </div>
    );
  }

  const myPlayer = matchState.youArePlayer === 1 ? matchState.players[0] : matchState.players[1];
  const opponentPlayer = matchState.youArePlayer === 1 ? matchState.players[1] : matchState.players[0];
  const isMyTurn = matchState.currentTurnPlayer === matchState.youArePlayer;
  const opponentId = matchState.youArePlayer === 1 ? room.player2_id : room.player1_id;

  return (
    <>
      {/* Pre-Game Lobby Modal */}
      {showPreGameLobby && (
        <PreGameLobby
          player1={{
            id: room.player1_id,
            username: player1Stats?.username || 'Player 1',
            avatar_url: player1Stats?.avatar_url,
            threeDartAvg: player1Stats?.threeDartAvg,
            isReady: player1Ready,
          }}
          player2={room.player2_id ? {
            id: room.player2_id,
            username: player2Stats?.username || 'Player 2',
            avatar_url: player2Stats?.avatar_url,
            threeDartAvg: player2Stats?.threeDartAvg,
            isReady: player2Ready,
          } : null}
          currentUserId={currentUserId || ''}
          onReady={handleReady}
          onCancel={handlePregameCancel}
          onBothReady={handleBothReady}
          onTimeout={handlePregameTimeout}
          gameMode={room.game_mode.toString()}
          matchFormat={room.match_format}
        />
      )}

      <div className="h-screen w-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden flex flex-col">
        {/* Top Bar -->
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowEndMatchDialog(true)}
                  disabled={forfeitLoading || !isMyTurn}
                  className={`border-red-500/30 text-red-400 hover:bg-red-500/10 ${!isMyTurn ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  {!isMyTurn ? 'Opponent Turn' : 'Forfeit'}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {!isMyTurn 
                  ? "You can only forfeit on your turn" 
                  : "Forfeit the match (you will lose)"
                }
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
            {isConnected ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
            {matchState.matchFormat.replace('best-of-', 'Best of ')}
          </Badge>
        </div>

        <h2 className="text-xl font-bold text-white">
          Leg {room.current_leg} of {room.legs_to_win * 2 - 1}
        </h2>

        <Button variant="outline" size="sm" onClick={() => setShowChatDrawer(true)} className="border-white/10 text-white">
          <MessageCircle className="w-4 h-4 mr-2" />
          Chat
        </Button>
      </div>

      {/* Main Content - Single camera (shows active player's camera to BOTH users) + game panel */}
      <div className="flex-1 grid grid-cols-2 gap-4 p-4 overflow-hidden">
        {/* LEFT: Active Player Camera - Both users see whoever's turn it is */}
        <div className="flex flex-col">
          <Card className={`bg-slate-800/50 border-white/10 overflow-hidden flex-1 flex flex-col ${isMyTurn ? 'border-emerald-500/30 shadow-lg shadow-emerald-500/10' : 'border-blue-500/30 shadow-lg shadow-blue-500/10'}`}>
            <div className={`flex items-center justify-between p-3 border-b border-white/5 ${isMyTurn ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
              <span className={`text-sm font-bold ${isMyTurn ? 'text-emerald-400' : 'text-blue-400'}`}>
                {isMyTurn ? `🎯 ${myPlayer.name}'S TURN (You)` : `🎯 ${opponentPlayer.name}'S TURN`}
              </span>
              <div className="flex gap-2">
                {/* Show camera controls only if it's my turn AND I'm the active player */}
                {isMyTurn ? (
                  <>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={toggleCamera}>
                      {isCameraOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                    </Button>
                    {isCameraOn && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-8 w-8 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                              onClick={handleRefreshCamera}
                              disabled={isRefreshingCamera}
                            >
                              {isRefreshingCamera ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <RotateCcw className="w-4 h-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom">
                            <p>Refresh camera if opponent can't see you</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <span className="text-xs text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded">
                      <Wifi className="w-3 h-3" /> Live
                    </span>
                  </>
                ) : (
                  <>
                    {callStatus === 'connected' ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded">
                        <Wifi className="w-3 h-3" /> Connected
                      </span>
                    ) : callStatus === 'connecting' ? (
                      <span className="text-xs text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-1 rounded">
                        <Loader2 className="w-3 h-3 animate-spin" /> Connecting...
                      </span>
                    ) : callStatus === 'failed' ? (
                      <span className="text-xs text-red-400 flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded">
                        <WifiOff className="w-3 h-3" /> Failed
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">Not connected</span>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex-1 relative bg-slate-900">
              {/* MY TURN: Show MY local camera */}
              {isMyTurn ? (
                localStream ? (
                  <div className="relative w-full h-full">
                    <video 
                      ref={setLocalVideoRef}
                      autoPlay 
                      playsInline 
                      muted 
                      className="w-full h-full object-cover"
                    />
                    {/* Camera refresh overlay button */}
                    <div className="absolute bottom-4 right-4">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button 
                              size="sm"
                              variant="secondary"
                              className="bg-black/50 hover:bg-black/70 text-white backdrop-blur-sm"
                              onClick={handleRefreshCamera}
                              disabled={isRefreshingCamera}
                            >
                              {isRefreshingCamera ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <RotateCcw className="w-4 h-4 mr-2" />
                                  Refresh
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p>Restart camera if opponent can't see you</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 p-6">
                    <CameraOff className="w-16 h-16 mb-4 opacity-50" />
                    <span className="text-lg font-medium mb-2">Your camera is off</span>
                    <span className="text-sm text-slate-500 mb-4 text-center">
                      It's your turn! Enable your camera so your opponent can see you.
                    </span>
                    <Button 
                      onClick={toggleCamera}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      Enable Camera
                    </Button>
                  </div>
                )
              ) : (
                /* OPPONENT'S TURN: Show THEIR remote camera */
                remoteStream ? (
                  <video 
                    ref={setRemoteVideoRef}
                    autoPlay 
                    playsInline 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 p-6">
                    <UserPlus className="w-16 h-16 mb-4 opacity-50" />
                    <span className="text-lg font-medium mb-2">
                      {callStatus === 'failed' ? 'Connection failed' : `Waiting for ${opponentPlayer.name}...`}
                    </span>
                    <span className="text-sm text-slate-500 text-center mb-4">
                      {callStatus === 'failed' 
                        ? 'Video connection failed. This may be due to firewall or network restrictions.'
                        : "It's their turn. Their camera will appear when they enable it."
                      }
                    </span>
                    {callStatus === 'failed' && (
                      <Button 
                        onClick={forceTurnAndRestart}
                        variant="outline"
                        className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10 mb-2"
                      >
                        <Loader2 className="w-4 h-4 mr-2" />
                        Retry with TURN Relay
                      </Button>
                    )}
                    {isCameraOn && (
                      <Button 
                        onClick={handleRefreshCamera}
                        variant="outline"
                        size="sm"
                        className="border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 mt-2"
                        disabled={isRefreshingCamera}
                      >
                        {isRefreshingCamera ? (
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                          <RotateCcw className="w-4 h-4 mr-2" />
                        )}
                        Refresh My Camera
                      </Button>
                    )}
                    {/* Refresh connection to opponent button */}
                    <Button 
                      onClick={handleRefreshConnection}
                      variant="outline"
                      size="sm"
                      className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10 mt-2"
                      disabled={isRefreshingConnection}
                    >
                      {isRefreshingConnection ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Wifi className="w-4 h-4 mr-2" />
                      )}
                      Reconnect to Opponent
                    </Button>
                    {!isCameraOn && callStatus !== 'failed' && (
                      <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <span className="text-sm text-amber-400">
                          ⚠️ You should also enable your camera for your turn
                        </span>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT: Player Cards + Scoring Panel OR Visit History */}
        <div className="flex flex-col gap-4 overflow-hidden">
          {/* Player Cards - Stats reset per leg */}
          <div className="grid grid-cols-2 gap-4">
            <QuickMatchPlayerCard
              name={myPlayer.name}
              remaining={myPlayer.remaining}
              legs={myPlayer.legsWon}
              legsToWin={matchState.legsToWin}
              isActive={isMyTurn && room.status === 'active'}
              color="text-emerald-400"
              position="left"
              stats={calculateMatchStats(currentUserId || '')}
            />
            <QuickMatchPlayerCard
              name={opponentPlayer.name}
              remaining={opponentPlayer.remaining}
              legs={opponentPlayer.legsWon}
              legsToWin={matchState.legsToWin}
              isActive={!isMyTurn && room.status === 'active'}
              color="text-blue-400"
              position="right"
              stats={calculateMatchStats(opponentId || '')}
            />
          </div>

          {/* CONDITIONAL: Show Scoring Panel when my turn AND game active, Visit History when not */}
          <Card className="flex-1 bg-slate-800/50 border-white/10 p-4 overflow-hidden">
            {isMyTurn && room.status === 'active' ? (
              <ScoringPanel
                scoreInput={scoreInput}
                onScoreInputChange={setScoreInput}
                onTypeScoreSubmit={handleInputScoreSubmit}
                onSubmitVisit={handleSubmitVisit}
                onMiss={handleMiss}
                onBust={handleBust}
                currentDarts={currentVisit}
                onDartClick={handleDartClick}
                onUndoDart={handleUndoDart}
                onClearVisit={handleClearVisit}
                submitting={submitting}
                currentRemaining={myPlayer.remaining}
                doubleOut={room.double_out}
              />
            ) : (
              <VisitHistoryPanel
                visits={visits}
                myUserId={currentUserId || ''}
                opponentUserId={opponentId || ''}
                myName={myPlayer.name}
                opponentName={opponentPlayer.name}
                myColor="text-emerald-400"
                opponentColor="text-blue-400"
                currentLeg={room.current_leg}
                onEditVisit={handleEditVisit}
                onDeleteVisit={handleDeleteVisit}
              />
            )}
          </Card>
        </div>
      </div>

      {/* Modals */}
      <AlertDialog open={showEndMatchDialog} onOpenChange={setShowEndMatchDialog}>
        <AlertDialogContent className="bg-slate-900 border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <LogOut className="w-5 h-5 text-red-400" />
              Forfeit Match?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-400 space-y-2">
              <p>Are you sure you want to forfeit? This will end the match and count as a loss.</p>
              {!isMyTurn && (
                <p className="text-amber-400 font-medium">⚠️ You can only forfeit on your turn.</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 text-white hover:bg-white/10">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={forfeitMatch} 
              disabled={forfeitLoading || !isMyTurn} 
              className="bg-red-500 hover:bg-red-600 disabled:opacity-50"
            >
              {forfeitLoading ? 'Forfeiting...' : !isMyTurn ? 'Not Your Turn' : 'Forfeit Match'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Opponent Forfeited Modal - Shows when opponent forfeits via database update */}
      <AlertDialog open={showOpponentForfeitModal} onOpenChange={(open) => {
        if (!open) {
          setShowOpponentForfeitModal(false);
          router.push('/app/play');
        }
      }}>
        <AlertDialogContent className="bg-slate-900 border-emerald-500/50">
          <AlertDialogHeader>
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/30">
                <Trophy className="w-10 h-10 text-white" />
              </div>
              <AlertDialogTitle className="text-2xl text-white font-bold mb-2">
                You Win!
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-400 text-base">
                <span className="text-emerald-400 font-medium">{opponentPlayer?.name || 'Your opponent'}</span> has forfeited the match.
                <br />You are the winner!
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-center">
            <AlertDialogAction 
              onClick={() => router.push('/app/play')} 
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 text-white px-8"
            >
              <Home className="w-4 h-4 mr-2" />
              Return to Play
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditVisitModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        visit={editingVisit}
        onSave={handleSaveEditedVisit}
        onDelete={handleDeleteVisit}
        doubleOutEnabled={room?.double_out || false}
        remainingBefore={editingVisit?.remaining_before || 0}
      />

      <MatchChatDrawer
        roomId={matchId}
        myUserId={currentUserId || ''}
        opponentName={opponentPlayer.name}
        isOpen={showChatDrawer}
        onOpenChange={setShowChatDrawer}
        onUnreadChange={setHasUnreadMessages}
      />

      {/* Edit Notification Popup */}
      {editNotification?.show && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-amber-500 text-white px-6 py-4 rounded-lg shadow-lg border-2 border-amber-400">
            <div className="flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              <span className="font-bold">{editNotification.playerName} edited their visit</span>
            </div>
            <div className="text-center mt-1 text-lg">
              <span className="line-through opacity-70">{editNotification.oldScore}</span>
              <span className="mx-2">→</span>
              <span className="font-bold">{editNotification.newScore}</span>
            </div>
          </div>
        </div>
      )}

      {/* Coin Toss Modal - shows at the start of the match */}
      {showCoinToss && room && profiles.length === 2 && currentUserId && (
        <CoinTossModal
          isOpen={showCoinToss}
          player1Name={profiles.find(p => p.user_id === room.player1_id)?.username || 'Player 1'}
          player2Name={profiles.find(p => p.user_id === room.player2_id)?.username || 'Player 2'}
          player1Id={room.player1_id}
          player2Id={room.player2_id}
          currentUserId={currentUserId}
          winnerId={room.coin_toss_winner_id}
          bothPlayersConnected={playersConnected.p1 && playersConnected.p2}
          syncStart={coinTossSyncStart}
          onComplete={handleCoinTossComplete}
          onStart={async () => {
            // Player 1 sends signal to Player 2 to start animation
            const opponentId = currentUserId === room.player1_id ? room.player2_id : room.player1_id;
            if (opponentId) {
              console.log('[COIN TOSS] Sending sync signal to opponent:', opponentId);
              await supabase.rpc('rpc_send_coin_toss_signal', {
                p_room_id: matchId,
                p_to_user_id: opponentId,
                p_coin_toss_data: { action: 'start' }
              });
            }
          }}
        />
      )}

      {/* Checkout Details Dialog - shows when typed score is a checkout or bust */}
      {showCheckoutDialog && pendingCheckoutInfo && (
        <CheckoutDetailsDialog
          isOpen={showCheckoutDialog}
          score={pendingCheckoutInfo.score}
          remainingBefore={pendingCheckoutInfo.remainingBefore}
          isBust={pendingCheckoutInfo.isBust}
          onSubmit={handleCheckoutDetailsSubmit}
        />
      )}

      {/* Winner Popup - shows when match is finished */}
      {matchEndStats && room?.status === 'finished' && (
        <WinnerPopup
          player1={matchEndStats.player1}
          player2={matchEndStats.player2}
          player1Stats={matchEndStats.player1FullStats}
          player2Stats={matchEndStats.player2FullStats}
          winnerId={matchEndStats.winnerId}
          gameMode={room?.game_mode?.toString() || '501'}
          bestOf={room?.legs_to_win ? room.legs_to_win * 2 - 1 : 1}
          onRematch={handleRematch}
          onReturn={handleReturn}
          rematchStatus={rematchStatus === 'pending' ? 'waiting' : rematchStatus === 'created' ? 'ready' : rematchStatus}
          opponentRematchReady={opponentRematchReady}
          youReady={iAmReadyForRematch}
          currentUserId={currentUserId || ''}
          readyCount={readyCount}
        />
      )}
    </div>
    </>
  );
}
