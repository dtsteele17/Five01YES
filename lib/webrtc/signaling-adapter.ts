import { createClient } from '@/lib/supabase/client';

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
 * - from_user_id (uuid) - sender auth.uid()
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
 * Send a WebRTC signal to opponent
 * Inserts into public.match_signals
 */
export async function sendSignal(
  roomId: string,
  opponentId: string,
  type: 'offer' | 'answer' | 'ice' | 'state',
  payload: SignalPayload
): Promise<boolean> {
  const supabase = createClient();

  console.log('[WEBRTC QS] ========== SEND SIGNAL ==========');
  console.log('[WEBRTC QS] Type:', type);
  console.log('[WEBRTC QS] Room ID:', roomId);
  console.log('[WEBRTC QS] To User ID:', opponentId);

  if (!roomId) {
    console.error('[WEBRTC QS] ❌ Cannot send signal: roomId missing');
    return false;
  }

  if (!opponentId) {
    console.error('[WEBRTC QS] ❌ Cannot send signal: opponentId missing');
    return false;
  }

  const signalData = {
    room_id: roomId,
    from_user_id: '@@AUTH_UID@@', // Will be replaced by RLS with auth.uid()
    to_user_id: opponentId,
    type,
    payload
  };

  // Remove the placeholder - Supabase RLS will use auth.uid()
  delete (signalData as any).from_user_id;

  try {
    const { error } = await supabase
      .from('match_signals')
      .insert(signalData);

    if (error) {
      console.error('[WEBRTC QS] ❌ Error inserting signal:', error);
      return false;
    }

    console.log('[WEBRTC QS] ✅ Signal sent successfully');
    return true;
  } catch (error) {
    console.error('[WEBRTC QS] ❌ Exception sending signal:', error);
    return false;
  }
}

export interface SignalHandler {
  onOffer: (offer: RTCSessionDescriptionInit) => Promise<void>;
  onAnswer: (answer: RTCSessionDescriptionInit) => Promise<void>;
  onIce: (candidate: RTCIceCandidateInit) => Promise<void>;
  onState?: (state: any) => void;
}

/**
 * Subscribe to WebRTC signals for this room
 * Filters to only signals addressed to myUserId
 */
export function subscribeSignals(
  roomId: string,
  myUserId: string,
  handler: SignalHandler
): () => void {
  const supabase = createClient();

  console.log('[WEBRTC QS] ========== SUBSCRIPTION SETUP ==========');
  console.log('[WEBRTC QS] Room ID:', roomId);
  console.log('[WEBRTC QS] My User ID:', myUserId);
  console.log('[WEBRTC QS] Filter: room_id=eq.' + roomId);

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
        console.log('[WEBRTC QS] Type:', signal.type);
        console.log('[WEBRTC QS] From User ID:', signal.from_user_id);
        console.log('[WEBRTC QS] To User ID:', signal.to_user_id);
        console.log('[WEBRTC QS] Room ID:', signal.room_id);

        // Ignore own signals
        if (signal.from_user_id === myUserId) {
          console.log('[WEBRTC QS] ⏭️ Ignoring own signal');
          return;
        }

        // Ignore signals not addressed to me
        if (signal.to_user_id !== myUserId) {
          console.log('[WEBRTC QS] ⏭️ Ignoring signal not addressed to me');
          return;
        }

        console.log('[WEBRTC QS] ✅ Processing signal:', signal.type);

        try {
          switch (signal.type) {
            case 'offer':
              if (signal.payload?.offer) {
                await handler.onOffer(signal.payload.offer);
              }
              break;
            case 'answer':
              if (signal.payload?.answer) {
                await handler.onAnswer(signal.payload.answer);
              }
              break;
            case 'ice':
              if (signal.payload?.candidate) {
                await handler.onIce(signal.payload.candidate);
              }
              break;
            case 'state':
              if (handler.onState) {
                handler.onState(signal.payload);
              }
              break;
            default:
              console.log('[WEBRTC QS] ⚠️ Unknown signal type:', signal.type);
          }
        } catch (error) {
          console.error('[WEBRTC QS] ❌ Error processing signal:', error);
        }
      }
    )
    .subscribe((status) => {
      console.log('[WEBRTC QS] Subscription status:', status);
      if (status === 'SUBSCRIBED') {
        console.log('[WEBRTC QS] ✅ Successfully subscribed to match_signals');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[WEBRTC QS] ❌ Subscription error');
      } else if (status === 'TIMED_OUT') {
        console.error('[WEBRTC QS] ❌ Subscription timed out');
      }
    });

  // Return cleanup function
  return () => {
    console.log('[WEBRTC QS] ========== SUBSCRIPTION CLEANUP ==========');
    supabase.removeChannel(channel);
  };
}

/**
 * Fetch opponent ID from match_rooms table
 */
export async function fetchOpponentId(
  roomId: string,
  myUserId: string
): Promise<string | null> {
  const supabase = createClient();

  console.log('[WEBRTC QS] ========== FETCHING OPPONENT ==========');
  console.log('[WEBRTC QS] Room ID:', roomId);
  console.log('[WEBRTC QS] My User ID:', myUserId);

  try {
    const { data, error } = await supabase
      .from('match_rooms')
      .select('player1_id, player2_id')
      .eq('id', roomId)
      .single();

    if (error) {
      console.error('[WEBRTC QS] ❌ Error fetching match_rooms:', error);
      return null;
    }

    if (!data) {
      console.error('[WEBRTC QS] ❌ No match_rooms data found');
      return null;
    }

    console.log('[WEBRTC QS] Match room data:', {
      player1_id: data.player1_id,
      player2_id: data.player2_id
    });

    // Compute opponent
    const opponentId = myUserId === data.player1_id ? data.player2_id : data.player1_id;

    if (!opponentId) {
      console.warn('[WEBRTC QS] ⚠️ No opponent yet (waiting for player2)');
      return null;
    }

    console.log('[WEBRTC QS] ✅ Opponent resolved:', opponentId);
    return opponentId;

  } catch (err) {
    console.error('[WEBRTC QS] ❌ Exception fetching opponent:', err);
    return null;
  }
}
