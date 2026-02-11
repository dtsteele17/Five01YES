import { createClient } from '@/lib/supabase/client';
import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Unified WebRTC Signaling Adapter for Quick Match
 *
 * Uses public.match_signals table for ALL match formats:
 * - Best of 1 (301, 501)
 * - Best of 3 (301, 501)
 * - Best of 5 (301, 501)
 * - Best of 7 (301, 501)
 *
 * Table Schema: match_signals
 * - id (uuid)
 * - room_id (uuid) - match room identifier
 * - from_user_id (uuid) - sender user id (auth.uid())
 * - to_user_id (uuid) - recipient user id
 * - type (text) - 'offer', 'answer', 'ice', 'state'
 * - payload (jsonb) - signal data
 * - created_at (timestamp)
 */

export interface SignalPayload {
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  camera?: boolean;
  [key: string]: any;
}

/**
 * Universal helper to send WebRTC signals via match_signals table
 *
 * CRITICAL: Use EXACT column names:
 * - room_id (NOT roomId)
 * - from_user_id (NOT from_user, fromUserId, sender_id, etc.)
 * - to_user_id (NOT to_user, toUserId, receiver_id, opponent_id, etc.)
 *
 * @param supabase - Supabase client instance
 * @param roomId - Match room UUID
 * @param fromUserId - Sender's user ID (current user)
 * @param toUserId - Recipient's user ID (opponent)
 * @param type - Signal type: 'offer', 'answer', 'ice', 'state'
 * @param payload - Signal payload data
 */
export async function sendMatchSignal(
  supabase: SupabaseClient,
  roomId: string,
  fromUserId: string,
  toUserId: string,
  type: 'offer' | 'answer' | 'ice' | 'state',
  payload: SignalPayload
): Promise<boolean> {
  console.log('[WEBRTC QS] ========== SEND MATCH SIGNAL ==========');
  console.log('[WEBRTC QS] room_id:', roomId);
  console.log('[WEBRTC QS] from_user_id:', fromUserId);
  console.log('[WEBRTC QS] to_user_id:', toUserId);
  console.log('[WEBRTC QS] type:', type);
  console.log('[WEBRTC QS] payload keys:', Object.keys(payload));

  // Validation
  if (!roomId) {
    console.error('[WEBRTC QS] ❌ VALIDATION ERROR: roomId is required');
    return false;
  }
  if (!fromUserId) {
    console.error('[WEBRTC QS] ❌ VALIDATION ERROR: fromUserId is required');
    return false;
  }
  if (!toUserId) {
    console.error('[WEBRTC QS] ❌ VALIDATION ERROR: toUserId is required');
    return false;
  }

  // Get current auth user to verify
  const { data: { user } } = await supabase.auth.getUser();
  console.log('[WEBRTC QS] 📤 Current auth user:', user?.id);
  console.log('[WEBRTC QS] 📤 from_user_id being sent:', fromUserId);
  console.log('[WEBRTC QS] 📤 Match:', user?.id === fromUserId);

  // Build insert payload with EXACT column names
  const signalData = {
    room_id: roomId,
    from_user_id: fromUserId,
    to_user_id: toUserId,
    type,
    payload
  };

  console.log('[WEBRTC QS] 📤 Inserting into match_signals:', signalData);

  try {
    const { data, error } = await supabase
      .from('match_signals')
      .insert(signalData)
      .select();

    if (error) {
      console.error('[WEBRTC QS] ❌ SUPABASE INSERT ERROR:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return false;
    }

    console.log('[WEBRTC QS] ✅ Signal inserted successfully, ID:', data?.[0]?.id);
    return true;

  } catch (error: any) {
    console.error('[WEBRTC QS] ❌ EXCEPTION during insert:', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack
    });
    return false;
  }
}

/**
 * Legacy wrapper for backward compatibility
 * @deprecated Use sendMatchSignal() instead for explicit control
 */
export async function sendSignal(
  roomId: string,
  fromUserId: string,
  toUserId: string,
  type: 'offer' | 'answer' | 'ice' | 'state',
  payload: SignalPayload
): Promise<boolean> {
  const supabase = createClient();
  return sendMatchSignal(supabase, roomId, fromUserId, toUserId, type, payload);
}

export interface SignalHandler {
  onOffer: (offer: RTCSessionDescriptionInit) => Promise<void>;
  onAnswer: (answer: RTCSessionDescriptionInit) => Promise<void>;
  onIce: (candidate: RTCIceCandidateInit) => Promise<void>;
  onState?: (state: any) => void;
}

/**
 * Subscribe to WebRTC signals for this room
 *
 * CRITICAL: Filters signals by:
 * 1. room_id = roomId
 * 2. to_user_id = myUserId (only signals addressed to me)
 *
 * RLS policy ensures we can only SELECT where to_user_id = auth.uid()
 *
 * @param roomId - Match room UUID
 * @param myUserId - Current user's ID
 * @param handler - Signal handlers
 */
export function subscribeSignals(
  roomId: string,
  myUserId: string,
  handler: SignalHandler
): () => void {
  const supabase = createClient();

  console.log('[WEBRTC QS] ========== SUBSCRIPTION SETUP ==========');
  console.log('[WEBRTC QS] room_id filter:', roomId);
  console.log('[WEBRTC QS] my user_id:', myUserId);
  console.log('[WEBRTC QS] Will receive signals where to_user_id =', myUserId);

  const channel = supabase
    .channel(`match_signals:${roomId}:${myUserId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'match_signals',
        filter: `room_id=eq.${roomId}`
      },
      async (payload) => {
        const signal = payload.new as any;

        console.log('[WEBRTC QS] ========== SIGNAL RECEIVED ==========');
        console.log('[WEBRTC QS] signal.room_id:', signal.room_id);
        console.log('[WEBRTC QS] signal.from_user_id:', signal.from_user_id);
        console.log('[WEBRTC QS] signal.to_user_id:', signal.to_user_id);
        console.log('[WEBRTC QS] signal.type:', signal.type);
        console.log('[WEBRTC QS] my user_id:', myUserId);

        // Double-check: Ignore signals not addressed to me
        // (RLS should already filter, but be defensive)
        if (signal.to_user_id !== myUserId) {
          console.log('[WEBRTC QS] ⏭️ SKIP: Signal not addressed to me (to_user_id mismatch)');
          console.log('[WEBRTC QS]   Expected to_user_id:', myUserId);
          console.log('[WEBRTC QS]   Actual to_user_id:', signal.to_user_id);
          return;
        }

        // Ignore own signals (shouldn't happen with RLS, but be defensive)
        if (signal.from_user_id === myUserId) {
          console.log('[WEBRTC QS] ⏭️ SKIP: Signal from myself');
          return;
        }

        console.log('[WEBRTC QS] ✅ Processing signal type:', signal.type);

        try {
          switch (signal.type) {
            case 'offer':
              if (signal.payload?.offer) {
                console.log('[WEBRTC QS] 📥 Calling onOffer handler');
                await handler.onOffer(signal.payload.offer);
              } else {
                console.warn('[WEBRTC QS] ⚠️ Offer signal missing payload.offer');
              }
              break;

            case 'answer':
              if (signal.payload?.answer) {
                console.log('[WEBRTC QS] 📥 Calling onAnswer handler');
                await handler.onAnswer(signal.payload.answer);
              } else {
                console.warn('[WEBRTC QS] ⚠️ Answer signal missing payload.answer');
              }
              break;

            case 'ice':
              if (signal.payload?.candidate) {
                console.log('[WEBRTC QS] 🧊 Calling onIce handler');
                await handler.onIce(signal.payload.candidate);
              } else {
                console.warn('[WEBRTC QS] ⚠️ ICE signal missing payload.candidate');
              }
              break;

            case 'state':
              if (handler.onState) {
                console.log('[WEBRTC QS] 📊 Calling onState handler');
                handler.onState(signal.payload);
              }
              break;

            default:
              console.log('[WEBRTC QS] ⚠️ Unknown signal type:', signal.type);
          }
        } catch (error: any) {
          console.error('[WEBRTC QS] ❌ Error processing signal:', {
            type: signal.type,
            error: error?.message,
            stack: error?.stack
          });
        }
      }
    )
    .subscribe((status) => {
      console.log('[WEBRTC QS] 📡 Subscription status:', status);

      if (status === 'SUBSCRIBED') {
        console.log('[WEBRTC QS] ✅ Successfully subscribed to match_signals');
        console.log('[WEBRTC QS]   Listening for signals in room:', roomId);
        console.log('[WEBRTC QS]   Addressed to user:', myUserId);
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[WEBRTC QS] ❌ Subscription channel error');
      } else if (status === 'TIMED_OUT') {
        console.error('[WEBRTC QS] ❌ Subscription timed out');
      } else if (status === 'CLOSED') {
        console.log('[WEBRTC QS] 🔒 Subscription closed');
      }
    });

  // Return cleanup function
  return () => {
    console.log('[WEBRTC QS] ========== SUBSCRIPTION CLEANUP ==========');
    console.log('[WEBRTC QS] Unsubscribing from room:', roomId);
    supabase.removeChannel(channel);
  };
}

/**
 * Fetch opponent ID from match_rooms table
 *
 * CRITICAL: Correctly computes opponent based on player positions:
 * - If I'm player1_id, opponent is player2_id
 * - If I'm player2_id, opponent is player1_id
 *
 * @param roomId - Match room UUID
 * @param myUserId - Current user's ID
 * @returns Opponent's user ID, or null if not found/not ready
 */
export async function fetchOpponentId(
  roomId: string,
  myUserId: string
): Promise<string | null> {
  const supabase = createClient();

  console.log('[WEBRTC QS] ========== FETCHING OPPONENT ==========');
  console.log('[WEBRTC QS] room_id:', roomId);
  console.log('[WEBRTC QS] my user_id:', myUserId);

  if (!roomId) {
    console.error('[WEBRTC QS] ❌ Cannot fetch opponent: roomId is null/undefined');
    return null;
  }

  if (!myUserId) {
    console.error('[WEBRTC QS] ❌ Cannot fetch opponent: myUserId is null/undefined');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('match_rooms')
      .select('player1_id, player2_id')
      .eq('id', roomId)
      .maybeSingle();

    if (error) {
      console.error('[WEBRTC QS] ❌ Supabase error fetching match_rooms:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      return null;
    }

    if (!data) {
      console.error('[WEBRTC QS] ❌ No match_rooms row found for room_id:', roomId);
      return null;
    }

    console.log('[WEBRTC QS] Match room data:', {
      player1_id: data.player1_id,
      player2_id: data.player2_id,
      my_user_id: myUserId
    });

    // Compute opponent: if I'm player1, opponent is player2 (and vice versa)
    let opponentId: string | null = null;

    if (myUserId === data.player1_id) {
      opponentId = data.player2_id;
      console.log('[WEBRTC QS] I am player1, opponent is player2:', opponentId);
    } else if (myUserId === data.player2_id) {
      opponentId = data.player1_id;
      console.log('[WEBRTC QS] I am player2, opponent is player1:', opponentId);
    } else {
      console.error('[WEBRTC QS] ❌ My user_id does not match player1_id or player2_id');
      console.error('[WEBRTC QS]   This should never happen - data integrity issue');
      return null;
    }

    if (!opponentId) {
      console.warn('[WEBRTC QS] ⚠️ Opponent ID is null (waiting for second player to join)');
      return null;
    }

    console.log('[WEBRTC QS] ✅ Opponent resolved:', opponentId);
    return opponentId;

  } catch (err: any) {
    console.error('[WEBRTC QS] ❌ Exception fetching opponent:', {
      message: err?.message,
      stack: err?.stack
    });
    return null;
  }
}
