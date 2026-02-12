'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

import { LogOut, Wifi, WifiOff, UserPlus, Video, VideoOff, Mic, MicOff, Camera, CameraOff, Edit2, Trash2, RotateCcw, Check, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { mapRoomToMatchState, type MappedMatchState } from '@/lib/match/mapRoomToMatchState';
import { TrustRatingBadge } from '@/components/app/TrustRatingBadge';
import { useMatchWebRTC } from '@/lib/hooks/useMatchWebRTC';
import { clearMatchState } from '@/lib/utils/match-resume';
import { getTrustRatingDescription, getUnratedLabel } from '@/lib/utils/trust-rating';
import { QuickMatchPlayerCard } from '@/components/match/QuickMatchPlayerCard';
import { MatchChatDrawer } from '@/components/match/MatchChatDrawer';
import { Separator } from '@/components/ui/separator';
import { MessageCircle } from 'lucide-react';
import { WinnerPopup } from '@/components/game/WinnerPopup';
import { CoinTossModal } from '@/components/game/CoinTossModal';
import { CheckoutDetailsDialog } from '@/components/game/CheckoutDetailsDialog';

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

// 2-dart checkout routes
const CHECKOUT_ROUTES_2_DARTS: Record<number, string[]> = {
  110: ['T20', 'DB'], 107: ['T19', 'DB'], 104: ['T18', 'DB'], 101: ['T17', 'DB'],
  100: ['T20', 'D20'], 98: ['T20', 'D19'], 97: ['T19', 'D20'], 96: ['T20', 'D18'],
  95: ['T19', 'D19'], 94: ['T18', 'D20'], 93: ['T19', 'D18'], 92: ['T20', 'D16'],
  91: ['T17', 'D20'], 90: ['T20', 'D15'], 89: ['T19', 'D16'], 88: ['T20', 'D14'],
  87: ['T17', 'D18'], 86: ['T18', 'D16'], 85: ['T19', 'D14'], 84: ['T20', 'D12'],
  83: ['T17', 'D16'], 82: ['T14', 'D20'], 81: ['T19', 'D12'], 80: ['T20', 'D10'],
  79: ['T13', 'D20'], 78: ['T18', 'D12'], 77: ['T19', 'D10'], 76: ['T20', 'D8'],
  75: ['T17', 'D12'], 74: ['T14', 'D16'], 73: ['T19', 'D8'], 72: ['T16', 'D12'],
  71: ['T13', 'D16'], 70: ['T20', 'D5'], 69: ['T19', 'D6'], 68: ['T20', 'D4'],
  67: ['T17', 'D8'], 66: ['T10', 'D18'], 65: ['T19', 'D4'], 64: ['T16', 'D8'],
  63: ['T13', 'D12'], 62: ['T10', 'D16'], 61: ['T15', 'D8'], 60: ['20', 'D20'],
  59: ['19', 'D20'], 58: ['18', 'D20'], 57: ['17', 'D20'], 56: ['16', 'D20'],
  55: ['15', 'D20'], 54: ['14', 'D20'], 53: ['13', 'D20'], 52: ['12', 'D20'],
  51: ['11', 'D20'], 50: ['10', 'D20'], 49: ['9', 'D20'], 48: ['8', 'D20'],
  47: ['15', 'D16'], 46: ['6', 'D20'], 45: ['13', 'D16'], 44: ['12', 'D16'],
  43: ['11', 'D16'], 42: ['10', 'D16'], 41: ['9', 'D16'], 40: ['D20'],
  39: ['7', 'D16'], 38: ['D19'], 37: ['5', 'D16'], 36: ['D18'], 35: ['3', 'D16'],
  34: ['D17'], 33: ['1', 'D16'], 32: ['D16'], 31: ['7', 'D12'], 30: ['D15'],
  29: ['13', 'D8'], 28: ['D14'], 27: ['11', 'D8'], 26: ['D13'], 25: ['9', 'D8'],
  24: ['D12'], 23: ['7', 'D8'], 22: ['D11'], 21: ['5', 'D8'], 20: ['D10'],
  19: ['3', 'D8'], 18: ['D9'], 17: ['1', 'D8'], 16: ['D8'], 15: ['7', 'D4'],
  14: ['D7'], 13: ['5', 'D4'], 12: ['D6'], 11: ['3', 'D4'], 10: ['D5'],
  9: ['1', 'D4'], 8: ['D4'], 7: ['3', 'D2'], 6: ['D3'], 5: ['1', 'D2'],
  4: ['D2'], 3: ['1', 'D1'], 2: ['D1'],
};

// 1-dart checkout routes
const CHECKOUT_ROUTES_1_DART: Record<number, string[]> = {
  40: ['D20'], 38: ['D19'], 36: ['D18'], 34: ['D17'], 32: ['D16'],
  30: ['D15'], 28: ['D14'], 26: ['D13'], 24: ['D12'], 22: ['D11'],
  20: ['D10'], 18: ['D9'], 16: ['D8'], 14: ['D7'], 12: ['D6'],
  10: ['D5'], 8: ['D4'], 6: ['D3'], 4: ['D2'], 2: ['D1'], 50: ['DB'],
};

// Visit History Panel Component
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
  const currentLegVisits = useMemo(() => {
    return visits.filter(v => v.leg === currentLeg);
  }, [visits, currentLeg]);
  
  const actualOpponentId = useMemo(() => {
    const opponentVisit = currentLegVisits.find(v => v.player_id !== myUserId);
    return opponentVisit?.player_id || opponentUserId;
  }, [currentLegVisits, myUserId, opponentUserId]);
  
  const myVisits = currentLegVisits.filter(v => v.player_id === myUserId).sort((a, b) => b.turn_no - a.turn_no);
  const opponentVisits = currentLegVisits.filter(v => v.player_id === actualOpponentId).sort((a, b) => b.turn_no - a.turn_no);
  const maxVisits = Math.max(myVisits.length, opponentVisits.length);

  return (
    <div className="h-full flex flex-col">
      <h3 className="text-sm font-semibold text-white mb-3">Visit History - Leg {currentLeg}</h3>
      
      <div className="flex-1 overflow-auto space-y-2">
        <div className="grid grid-cols-2 gap-4 text-xs text-gray-400 border-b border-white/10 pb-2">
          <div className={`text-center font-bold ${myColor}`}>{myName}</div>
          <div className={`text-center font-bold ${opponentColor}`}>{opponentName}</div>
        </div>

        {maxVisits === 0 ? (
          <div className="text-center text-gray-500 py-8">No visits yet</div>
        ) : (
          Array.from({ length: maxVisits }, (_, i) => {
            const myVisit = myVisits[i];
            const opponentVisit = opponentVisits[i];
            const isLatestMyVisit = myVisit && i === 0;
            
            return (
              <div key={i} className="grid grid-cols-2 gap-4 py-2 border-b border-white/5">
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

// Edit Visit Modal
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visit) {
      setScoreInput(visit.score.toString());
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

  const handleSave = async () => {
    const newScore = parseInt(scoreInput);
    if (isNaN(newScore) || newScore < 0 || newScore > 180) {
      toast.error('Invalid score (0-180)');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(visit!, newScore, []);
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

// Scoring Panel
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

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const visitTotal = currentDarts.reduce((sum, d) => sum + d.value, 0);
  const previewRemaining = currentRemaining - visitTotal;
  const dartsThrown = currentDarts.length;
  const dartsRemaining = 3 - dartsThrown;

  const getCheckoutSuggestion = () => {
    if (previewRemaining <= 0 || previewRemaining > 170) return null;
    if (dartsRemaining === 3) return CHECKOUT_ROUTES[previewRemaining] || null;
    if (dartsRemaining === 2) return CHECKOUT_ROUTES_2_DARTS[previewRemaining] || null;
    if (dartsRemaining === 1) return CHECKOUT_ROUTES_1_DART[previewRemaining] || null;
    return null;
  };

  const checkoutSuggestion = getCheckoutSuggestion();

  return (
    <div className="h-full flex flex-col">
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
            onClick={onTypeScoreSubmit}
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

      <div className="flex gap-2 mb-2">
        <Button size="sm" variant={activeTab === 'singles' ? 'default' : 'outline'} onClick={() => setActiveTab('singles')} className="flex-1">Singles</Button>
        <Button size="sm" variant={activeTab === 'doubles' ? 'default' : 'outline'} onClick={() => setActiveTab('doubles')} className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30">Doubles</Button>
        <Button size="sm" variant={activeTab === 'triples' ? 'default' : 'outline'} onClick={() => setActiveTab('triples')} className="flex-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30">Triples</Button>
        <Button size="sm" variant={activeTab === 'bulls' ? 'default' : 'outline'} onClick={() => setActiveTab('bulls')} className="flex-1 bg-green-500/20 text-green-400 hover:bg-green-500/30">Bulls</Button>
      </div>

      <div className="flex-1 grid grid-cols-5 gap-1 mb-4">
        {activeTab === 'bulls' ? (
          <>
            <Button onClick={() => onDartClick('bull', 25)} className="h-full bg-green-500/20 text-green-400 hover:bg-green-500/30 text-lg">25</Button>
            <Button onClick={() => onDartClick('bull', 50)} className="h-full bg-red-500/20 text-red-400 hover:bg-red-500/30 text-lg font-bold">50</Button>
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

      <div className="flex gap-2">
        <Button variant="outline" onClick={onUndoDart} disabled={currentDarts.length === 0} className="flex-1 border-white/10 text-white hover:bg-white/5">Undo</Button>
        <Button variant="outline" onClick={onClearVisit} disabled={currentDarts.length === 0} className="flex-1 border-white/10 text-white hover:bg-white/5">Clear</Button>
        <Button onClick={onMiss} disabled={currentDarts.length >= 3} className="flex-1 bg-slate-700 hover:bg-slate-600">Miss</Button>
        <Button onClick={onBust} disabled={submitting} className="flex-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50">Bust</Button>
        <Button onClick={onSubmitVisit} disabled={currentDarts.length === 0 || submitting} className="flex-1 bg-emerald-500 hover:bg-emerald-600">Submit</Button>
      </div>
    </div>
  );
}

export default function QuickMatchPage() {
  // ... (implementation continues)
  return <div>Quick Match Implementation</div>;
}
