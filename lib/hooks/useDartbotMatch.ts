/**
 * React Hook for Dartbot Matches
 * 
 * Provides state management and functions for dartbot matches
 * Mirrors the useMatchWebRTC hook for online matches
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  createDartbotMatch,
  submitDartbotVisit,
  getDartbotMatch,
  forfeitDartbotMatch,
  requestDartbotRematch,
  subscribeToDartbotMatch,
  subscribeToDartbotVisits,
  type DartbotMatchRoom,
  type DartbotVisit,
  type CreateMatchParams,
  type Dart,
  type GameMode,
  type DartbotLevel,
  getLegsToWin,
} from '@/lib/dartbot';
import { calculateFirst9Average } from '@/lib/match-logic';

export interface UseDartbotMatchReturn {
  // State
  match: DartbotMatchRoom | null;
  visits: DartbotVisit[];
  isLoading: boolean;
  error: string | null;
  
  // Match actions
  createMatch: (params: CreateMatchParams) => Promise<string | null>;
  submitPlayerVisit: (params: SubmitPlayerVisitParams) => Promise<boolean>;
  submitDartbotVisit: (params: SubmitDartbotVisitParams) => Promise<boolean>;
  forfeit: () => Promise<boolean>;
  rematch: () => Promise<string | null>;
  refresh: () => Promise<void>;
  
  // Computed values
  isPlayerTurn: boolean;
  currentLegVisits: DartbotVisit[];
  playerFirst9Avg: number;
  dartbotFirst9Avg: number;
  playerMatchAvg: number;
  dartbotMatchAvg: number;
  canCheckOut: boolean;
  minCheckoutDarts: number | null;
}

export interface SubmitPlayerVisitParams {
  score: number;
  remainingAfter: number;
  isBust?: boolean;
  isCheckout?: boolean;
  darts?: Dart[];
  bustReason?: string;
}

export interface SubmitDartbotVisitParams {
  score: number;
  remainingAfter: number;
  isCheckout?: boolean;
  darts?: Dart[];
}

export function useDartbotMatch(roomId?: string): UseDartbotMatchReturn {
  const [match, setMatch] = useState<DartbotMatchRoom | null>(null);
  const [visits, setVisits] = useState<DartbotVisit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const matchSubscriptionRef = useRef<any>(null);
  const visitsSubscriptionRef = useRef<any>(null);

  // Fetch initial match state
  const fetchMatch = useCallback(async () => {
    if (!roomId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await getDartbotMatch(roomId);
      
      if (result.success && result.match) {
        setMatch(result.match);
        setVisits(result.visits || []);
      } else {
        setError(result.error || 'Failed to load match');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!roomId) return;

    fetchMatch();

    // Subscribe to match state changes
    matchSubscriptionRef.current = subscribeToDartbotMatch(roomId, (payload) => {
      if (payload.new) {
        setMatch(payload.new);
      }
    });

    // Subscribe to new visits
    visitsSubscriptionRef.current = subscribeToDartbotVisits(roomId, (payload) => {
      if (payload.new) {
        setVisits((prev) => [...prev, payload.new]);
      }
    });

    return () => {
      matchSubscriptionRef.current?.unsubscribe();
      visitsSubscriptionRef.current?.unsubscribe();
    };
  }, [roomId, fetchMatch]);

  // Create a new match
  const createMatch = useCallback(async (params: CreateMatchParams): Promise<string | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await createDartbotMatch(params);
      
      if (result.success && result.room_id) {
        return result.room_id;
      } else {
        setError(result.error || 'Failed to create match');
        return null;
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Submit player visit
  const submitPlayerVisit = useCallback(async (params: SubmitPlayerVisitParams): Promise<boolean> => {
    if (!roomId || !match) return false;
    
    try {
      const result = await submitDartbotVisit({
        roomId,
        playerType: 'player',
        score: params.score,
        remainingAfter: params.remainingAfter,
        isBust: params.isBust,
        isCheckout: params.isCheckout,
        darts: params.darts,
        bustReason: params.bustReason,
      });
      
      if (result.success) {
        // Update local state immediately for responsiveness
        if (result.room_state) {
          setMatch((prev) => prev ? { ...prev, ...result.room_state } : null);
        }
        return true;
      } else {
        setError(result.error || 'Failed to submit visit');
        return false;
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      return false;
    }
  }, [roomId, match]);

  // Submit dartbot visit
  const submitBotVisit = useCallback(async (params: SubmitDartbotVisitParams): Promise<boolean> => {
    if (!roomId || !match) return false;
    
    try {
      const result = await submitDartbotVisit({
        roomId,
        playerType: 'dartbot',
        score: params.score,
        remainingAfter: params.remainingAfter,
        isCheckout: params.isCheckout,
        darts: params.darts,
      });
      
      if (result.success) {
        if (result.room_state) {
          setMatch((prev) => prev ? { ...prev, ...result.room_state } : null);
        }
        return true;
      } else {
        setError(result.error || 'Failed to submit dartbot visit');
        return false;
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      return false;
    }
  }, [roomId, match]);

  // Forfeit match
  const forfeit = useCallback(async (): Promise<boolean> => {
    if (!roomId) return false;
    
    try {
      const result = await forfeitDartbotMatch(roomId);
      
      if (result.success) {
        await fetchMatch();
        return true;
      } else {
        setError(result.error || 'Failed to forfeit');
        return false;
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      return false;
    }
  }, [roomId, fetchMatch]);

  // Request rematch
  const rematch = useCallback(async (): Promise<string | null> => {
    if (!roomId) return null;
    
    try {
      const result = await requestDartbotRematch(roomId);
      
      if (result.success && result.new_room_id) {
        return result.new_room_id;
      } else {
        setError(result.error || 'Failed to create rematch');
        return null;
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      return null;
    }
  }, [roomId]);

  // Computed values
  const isPlayerTurn = match?.current_turn === 'player';
  
  const currentLegVisits = visits.filter(
    (v) => v.leg === match?.current_leg
  );
  
  const playerFirst9Avg = match?.player_first9_darts 
    ? calculateFirst9Average([{
        dartsThrown: match.player_first9_darts,
        pointsScored: match.player_first9_score
      }])
    : 0;
    
  const dartbotFirst9Avg = match?.dartbot_first9_darts
    ? calculateFirst9Average([{
        dartsThrown: match.dartbot_first9_darts,
        pointsScored: match.dartbot_first9_score
      }])
    : 0;

  // Calculate match averages
  const playerVisits = visits.filter(v => v.player_type === 'player' && !v.is_bust);
  const dartbotVisits = visits.filter(v => v.player_type === 'dartbot' && !v.is_bust);
  
  const playerMatchAvg = playerVisits.length > 0
    ? (playerVisits.reduce((sum, v) => sum + v.score, 0) / (playerVisits.length * 3)) * 3
    : 0;
    
  const dartbotMatchAvg = dartbotVisits.length > 0
    ? (dartbotVisits.reduce((sum, v) => sum + v.score, 0) / (dartbotVisits.length * 3)) * 3
    : 0;

  // Checkout detection
  const canCheckOut = match?.player_remaining 
    ? match.player_remaining <= 170 && match.player_remaining > 1
    : false;
    
  const minCheckoutDarts = canCheckOut && match?.player_remaining
    ? getMinDartsToCheckout(match.player_remaining, match.double_out)
    : null;

  return {
    match,
    visits,
    isLoading,
    error,
    createMatch,
    submitPlayerVisit,
    submitDartbotVisit: submitBotVisit,
    forfeit,
    rematch,
    refresh: fetchMatch,
    isPlayerTurn,
    currentLegVisits,
    playerFirst9Avg,
    dartbotFirst9Avg,
    playerMatchAvg,
    dartbotMatchAvg,
    canCheckOut,
    minCheckoutDarts,
  };
}

// Helper function (should be imported from match-logic)
function getMinDartsToCheckout(remaining: number, doubleOut: boolean): 1 | 2 | 3 | null {
  if (remaining <= 0 || remaining > 170) return null;

  if (!doubleOut) {
    if (remaining <= 60) return 1;
    if (remaining <= 120) return 2;
    return 3;
  }

  const doubles = [50];
  for (let i = 1; i <= 20; i++) {
    doubles.push(i * 2);
  }

  const allScores = [0];
  for (let i = 1; i <= 20; i++) {
    allScores.push(i);
    allScores.push(i * 2);
    allScores.push(i * 3);
  }
  allScores.push(25);
  allScores.push(50);

  if (doubles.includes(remaining)) {
    return 1;
  }

  for (const s1 of allScores) {
    if (s1 >= remaining) continue;
    const r1 = remaining - s1;
    if (doubles.includes(r1)) {
      return 2;
    }
  }

  for (const s1 of allScores) {
    if (s1 >= remaining) continue;
    const r1 = remaining - s1;
    for (const s2 of allScores) {
      if (s2 >= r1) continue;
      const r2 = r1 - s2;
      if (doubles.includes(r2)) {
        return 3;
      }
    }
  }

  return null;
}
