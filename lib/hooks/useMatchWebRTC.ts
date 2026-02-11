import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { sendSignal, subscribeSignals, fetchOpponentId } from '@/lib/webrtc/signaling-adapter';
import { getIceServers } from '@/lib/webrtc/ice';

export interface UseMatchWebRTCProps {
  roomId: string | null;
  myUserId: string | null;
  isMyTurn: boolean; // Only for UI display
}

export interface UseMatchWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isCameraOn: boolean;
  isMicMuted: boolean;
  isVideoDisabled: boolean;
  callStatus: 'idle' | 'connecting' | 'connected' | 'failed';
  cameraError: string | null;
  toggleCamera: () => Promise<void>;
  toggleMic: () => void;
  toggleVideo: () => void;
  stopCamera: (reason?: string) => void;
  liveVideoRef: React.RefObject<HTMLVideoElement>;
  forceTurnAndRestart: () => void;
}

/**
 * Unified WebRTC Hook for Quick Match Camera
 *
 * Works for ALL match formats:
 * - Best of 1 (301, 501)
 * - Best of 3 (301, 501)
 * - Best of 5 (301, 501)
 * - Best of 7 (301, 501)
 *
 * Uses public.match_signals table for signaling
 * Shared ICE configuration (STUN + optional TURN)
 *
 * State Machine:
 * 1. Get ICE servers from shared config
 * 2. Fetch opponent from match_rooms
 * 3. Create RTCPeerConnection (stable across turns/legs)
 * 4. Subscribe to match_signals
 * 5. Player1 creates offer when ready
 * 6. Peer connection stays alive for entire match
 */
export function useMatchWebRTC({
  roomId,
  myUserId,
  isMyTurn
}: UseMatchWebRTCProps): UseMatchWebRTCReturn {
  const supabase = createClient();

  // State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(true); // Always muted by default
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [opponentUserId, setOpponentUserId] = useState<string | null>(null);
  const [isPlayer1, setIsPlayer1] = useState<boolean>(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [opponentCameraOn, setOpponentCameraOn] = useState(false);
  const [opponentReady, setOpponentReady] = useState(false);

  // Refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const subscriptionCleanupRef = useRef<(() => void) | null>(null);
  const forceTurnRef = useRef(false); // Set to true to force TURN relay
  const connectionAttemptRef = useRef(0);
  const lastStreamRef = useRef<MediaStream | null>(null); // Keep last valid stream
  const opponentCameraOnRef = useRef(false); // Track opponent camera state

  console.log('[WEBRTC QS] Render with:', {
    roomId,
    myUserId,
    opponentUserId,
    isPlayer1,
    isMyTurn: isMyTurn ? 'ME' : 'OPPONENT'
  });

  // ========== FETCH OPPONENT FROM MATCH_ROOMS ==========
  useEffect(() => {
    if (!roomId || !myUserId) {
      console.log('[WEBRTC QS] Waiting for roomId and myUserId');
      return;
    }

    const fetchOpponent = async () => {
      const opponentId = await fetchOpponentId(roomId, myUserId);
      setOpponentUserId(opponentId);

      // Determine if I'm player1 (creates offer) or player2 (waits for offer)
      if (opponentId) {
        const { data } = await supabase
          .from('match_rooms')
          .select('player1_id')
          .eq('id', roomId)
          .single();

        if (data) {
          const amPlayer1 = data.player1_id === myUserId;
          setIsPlayer1(amPlayer1);
          console.log('[WEBRTC QS] I am:', amPlayer1 ? 'PLAYER1 (will create offer)' : 'PLAYER2 (will wait for offer)');
        }
      }
    };

    fetchOpponent();
  }, [roomId, myUserId]);

  // ========== VIDEO DISPLAY SWITCHING (UI ONLY) ==========
  useEffect(() => {
    if (!liveVideoRef.current) return;

    // Determine which stream to show based on whose turn it is
    let streamToShow: MediaStream | null = null;
    
    if (isMyTurn) {
      // My turn - show my local camera
      streamToShow = localStream;
    } else {
      // Opponent's turn - show their remote camera
      streamToShow = remoteStream;
      // Keep last remote stream as fallback while waiting for connection
      if (remoteStream) {
        lastStreamRef.current = remoteStream;
      }
    }
    
    const turnLabel = isMyTurn ? 'ME' : 'OPPONENT';
    console.log('[WEBRTC QS] Video display - Turn:', turnLabel, 'Stream:', streamToShow ? 'YES' : 'NO');

    if (streamToShow) {
      // Only update if stream changed
      if (liveVideoRef.current.srcObject !== streamToShow) {
        liveVideoRef.current.srcObject = streamToShow;
        liveVideoRef.current.muted = isMyTurn; // Mute own video
        liveVideoRef.current.autoplay = true;
        liveVideoRef.current.playsInline = true;
        liveVideoRef.current.play().catch((err) => {
          console.error('[WEBRTC QS] Error playing video:', err);
        });
      }
    } else if (!isMyTurn && lastStreamRef.current) {
      // Opponent's turn but no remote stream yet - show cached stream if available
      console.log('[WEBRTC QS] Using cached remote stream');
      liveVideoRef.current.srcObject = lastStreamRef.current;
    } else if (isMyTurn) {
      // My turn but no local stream - clear video
      liveVideoRef.current.srcObject = null;
    }
  }, [isMyTurn, localStream, remoteStream]);

  // ========== CREATE PEER CONNECTION ==========
  useEffect(() => {
    // Prerequisites check
    if (!roomId) {
      console.log('[WEBRTC QS] Waiting for roomId');
      return;
    }
    if (!myUserId) {
      console.log('[WEBRTC QS] Waiting for myUserId');
      return;
    }
    if (!opponentUserId) {
      console.log('[WEBRTC QS] Waiting for opponentUserId');
      return;
    }

    // Only create once
    if (peerConnectionRef.current) {
      console.log('[WEBRTC QS] Peer connection already exists');
      return;
    }

    console.log('[WEBRTC QS] ========== CREATING PEER CONNECTION ==========');
    console.log('[WEBRTC QS] Prerequisites resolved:', {
      roomId,
      myUserId,
      opponentUserId,
      isPlayer1
    });

    try {
      const iceServers = getIceServers();
      connectionAttemptRef.current++;
      
      // If previous attempts failed, force TURN relay
      const shouldForceTurn = forceTurnRef.current || connectionAttemptRef.current > 1;
      
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: shouldForceTurn ? 'relay' : 'all'
      });
      
      console.log('[WEBRTC QS] ICE transport policy:', shouldForceTurn ? 'relay (forced)' : 'all');

      peerConnectionRef.current = pc;
      console.log('[WEBRTC QS] ✅ RTCPeerConnection created');

      // Log ICE configuration for debugging
      console.log('[WEBRTC QS] ICE servers count:', iceServers.length);
      const hasTurn = iceServers.some(s => 
        Array.isArray(s.urls) 
          ? s.urls.some((u: string) => u.startsWith('turn'))
          : (s.urls as string).startsWith('turn')
      );
      console.log('[WEBRTC QS] TURN configured:', hasTurn);

      // Connection state handlers
      pc.onconnectionstatechange = () => {
        console.log('[WEBRTC QS] 🌐 connectionState:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setCallStatus('connected');
          console.log('[WEBRTC QS] ✅ PEER CONNECTION ESTABLISHED');
        } else if (pc.connectionState === 'connecting') {
          setCallStatus('connecting');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          console.error('[WEBRTC QS] ❌ Connection failed/disconnected');
          setCallStatus(pc.connectionState === 'failed' ? 'failed' : 'idle');
          
          // If connection failed and we have TURN, suggest checking credentials
          if (pc.connectionState === 'failed' && hasTurn) {
            console.warn('[WEBRTC QS] 💡 Connection failed despite TURN. Check:');
            console.warn('   1. Xirsys credentials are correct in .env.local');
            console.warn('   2. Xirsys account is active (not expired)');
            console.warn('   3. Try refreshing Xirsys token if using dynamic credentials');
          }
          
          // Auto-retry with forced TURN relay on next connection attempt
          if (pc.connectionState === 'failed' && !forceTurnRef.current && connectionAttemptRef.current < 3) {
            console.log('[WEBRTC QS] 🔄 Will retry with forced TURN relay on next camera start');
            forceTurnRef.current = true;
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[WEBRTC QS] 🧊 iceConnectionState:', pc.iceConnectionState);
      };

      pc.onsignalingstatechange = () => {
        console.log('[WEBRTC QS] 📡 signalingState:', pc.signalingState);
      };

      // ICE candidate handler
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('[WEBRTC QS] 🧊 Local ICE candidate generated:', event.candidate.type);
          await sendSignal(roomId, myUserId, opponentUserId, 'ice', {
            candidate: event.candidate
          });
        } else {
          console.log('[WEBRTC QS] 🧊 All ICE candidates generated');
        }
      };

      // Remote track handler - CRITICAL for receiving opponent video
      pc.ontrack = (event) => {
        console.log('[WEBRTC QS] ========== ONTRACK FIRED ==========');
        console.log('[WEBRTC QS] Track kind:', event.track.kind);
        console.log('[WEBRTC QS] Track readyState:', event.track.readyState);
        console.log('[WEBRTC QS] Track enabled:', event.track.enabled);
        console.log('[WEBRTC QS] Streams count:', event.streams.length);

        if (event.streams && event.streams[0]) {
          console.log('[WEBRTC QS] ✅ Setting remote stream from event.streams[0]');
          setRemoteStream(event.streams[0]);

          // Also set on hidden remote video element for stability
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = event.streams[0];
            remoteVideoRef.current.autoplay = true;
            remoteVideoRef.current.playsInline = true;
            remoteVideoRef.current.play().catch(err => {
              console.error('[WEBRTC QS] Error playing remote video:', err);
            });
          }
        } else {
          console.warn('[WEBRTC QS] ⚠️ No streams in ontrack event');
        }
      };

      // Handle renegotiation when tracks are added/removed
      pc.onnegotiationneeded = async () => {
        console.log('[WEBRTC QS] ========== RENEGOTIATION NEEDED ==========');
        
        // Only Player 1 (who creates the initial offer) handles renegotiation
        if (!isPlayer1) {
          console.log('[WEBRTC QS] Ignoring negotiationneeded - not Player 1');
          return;
        }
        
        try {
          makingOfferRef.current = true;
          
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          console.log('[WEBRTC QS] ✅ Renegotiation offer created');
          
          await sendSignal(roomId, myUserId, opponentUserId, 'offer', {
            offer: pc.localDescription?.toJSON()
          });
          
          console.log('[WEBRTC QS] ✅ Renegotiation offer sent');
        } catch (error) {
          console.error('[WEBRTC QS] ❌ Error during renegotiation:', error);
        } finally {
          makingOfferRef.current = false;
        }
      };

      console.log('[WEBRTC QS] ✅ Peer connection setup complete');

    } catch (error) {
      console.error('[WEBRTC QS] ❌ Error creating peer connection:', error);
      setCameraError('Failed to initialize connection');
    }

    // Cleanup on unmount only
    return () => {
      console.log('[WEBRTC QS] ========== PEER CONNECTION CLEANUP ==========');
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
        console.log('[WEBRTC QS] Peer connection closed');
      }
    };
  }, [roomId, myUserId, opponentUserId, isPlayer1]);

  // ========== SIGNALING SUBSCRIPTION ==========
  useEffect(() => {
    // Prerequisites check
    if (!roomId) {
      console.log('[WEBRTC QS] Subscription waiting for roomId');
      return;
    }
    if (!myUserId) {
      console.log('[WEBRTC QS] Subscription waiting for myUserId');
      return;
    }
    if (!opponentUserId) {
      console.log('[WEBRTC QS] Subscription waiting for opponentUserId');
      return;
    }

    // Signal handlers
    const handleOffer = async (offer: RTCSessionDescriptionInit) => {
      console.log('[WEBRTC QS] 📥 Processing OFFER');

      const pc = peerConnectionRef.current;
      if (!pc) {
        console.error('[WEBRTC QS] ❌ No peer connection');
        return;
      }

      try {
        // Perfect negotiation: detect offer collision
        const offerCollision =
          offer.type === 'offer' &&
          (makingOfferRef.current || pc.signalingState !== 'stable');

        console.log('[WEBRTC QS] Collision check:', {
          offerCollision,
          makingOffer: makingOfferRef.current,
          signalingState: pc.signalingState,
          isPlayer1
        });

        // Player1 is impolite (rejects collision), Player2 is polite (accepts)
        ignoreOfferRef.current = isPlayer1 && offerCollision;

        if (ignoreOfferRef.current) {
          console.log('[WEBRTC QS] ⛔ Ignoring offer (player1 in collision)');
          return;
        }

        console.log('[WEBRTC QS] Setting remote description (offer)');
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log('[WEBRTC QS] ✅ Remote description set');

        // Process pending ICE candidates
        if (pendingIceCandidatesRef.current.length > 0) {
          console.log('[WEBRTC QS] Processing', pendingIceCandidatesRef.current.length, 'pending ICE candidates');
          for (const candidate of pendingIceCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
              console.error('[WEBRTC QS] Error adding pending ICE candidate:', error);
            }
          }
          pendingIceCandidatesRef.current = [];
        }

        // Create and send answer
        console.log('[WEBRTC QS] Creating answer');
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('[WEBRTC QS] ✅ Local description set (answer)');

        await sendSignal(roomId, myUserId, opponentUserId, 'answer', {
          answer: pc.localDescription?.toJSON()
        });
        console.log('[WEBRTC QS] ✅ Answer sent');

      } catch (error) {
        console.error('[WEBRTC QS] ❌ Error handling offer:', error);
      }
    };

    const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
      console.log('[WEBRTC QS] 📥 Processing ANSWER');

      const pc = peerConnectionRef.current;
      if (!pc) {
        console.error('[WEBRTC QS] ❌ No peer connection');
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('[WEBRTC QS] ✅ Answer applied');

        // Process pending ICE candidates
        if (pendingIceCandidatesRef.current.length > 0) {
          console.log('[WEBRTC QS] Processing', pendingIceCandidatesRef.current.length, 'pending ICE candidates');
          for (const candidate of pendingIceCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
              console.error('[WEBRTC QS] Error adding pending ICE candidate:', error);
            }
          }
          pendingIceCandidatesRef.current = [];
        }
      } catch (error) {
        console.error('[WEBRTC QS] ❌ Error handling answer:', error);
      }
    };

    const handleIce = async (candidate: RTCIceCandidateInit) => {
      console.log('[WEBRTC QS] 🧊 Processing ICE candidate');

      if (!peerConnectionRef.current) {
        console.warn('[WEBRTC QS] No PC yet, queueing ICE candidate');
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }

      if (!peerConnectionRef.current.remoteDescription) {
        console.warn('[WEBRTC QS] Remote description not set yet, queueing ICE candidate');
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }

      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('[WEBRTC QS] ✅ ICE candidate added');
      } catch (error) {
        console.error('[WEBRTC QS] ❌ Error adding ICE candidate:', error);
      }
    };

    const handleState = async (state: any) => {
      console.log('[WEBRTC QS] 📊 State update from opponent:', state);
      
      // Track opponent camera state
      if (state.camera !== undefined) {
        opponentCameraOnRef.current = state.camera;
        setOpponentCameraOn(state.camera);
        console.log('[WEBRTC QS] Opponent camera state:', state.camera);
      }
      
      // If opponent camera is on but we have no remote stream, request reconnection
      if (state.camera === true && !remoteStream && !isPlayer1 && roomId && myUserId && opponentUserId) {
        console.log('[WEBRTC QS] 🔄 Opponent camera on but no remote stream - requesting reconnect');
        // Small delay to avoid signal storm
        setTimeout(() => {
          if (roomId && myUserId && opponentUserId) {
            sendSignal(roomId, myUserId, opponentUserId, 'state', { requestReconnect: true });
          }
        }, 500);
      }
      
      // Player 1 receives reconnect request - reset offerCreatedRef to trigger new offer
      if (state.requestReconnect === true && isPlayer1) {
        console.log('[WEBRTC QS] 🔄 Received reconnect request - resetting offerCreatedRef');
        offerCreatedRef.current = false;
      }
      
      // Player 2 sends ready signal - Player 1 receives it
      if (state.ready === true && isPlayer1) {
        console.log('[WEBRTC QS] ✅ Opponent (Player 2) is ready');
        setOpponentReady(true);
      }
    };

    // Subscribe to signals
    const cleanup = subscribeSignals(roomId, myUserId, {
      onOffer: handleOffer,
      onAnswer: handleAnswer,
      onIce: handleIce,
      onState: handleState
    });

    subscriptionCleanupRef.current = cleanup;
    setIsSubscribed(true);
    console.log('[WEBRTC QS] ✅ Subscription active');
    
    // Player 2 sends ready signal to Player 1
    if (!isPlayer1 && roomId && myUserId && opponentUserId) {
      console.log('[WEBRTC QS] 📢 Sending ready signal to Player 1');
      sendSignal(roomId, myUserId, opponentUserId, 'state', { ready: true });
    }

    return () => {
      if (subscriptionCleanupRef.current) {
        subscriptionCleanupRef.current();
        subscriptionCleanupRef.current = null;
      }
      setIsSubscribed(false);
    };
  }, [roomId, myUserId, opponentUserId, isPlayer1]);

  // Refs to prevent duplicate operations
  const offerCreatedRef = useRef(false);
  
  // Reset offerCreatedRef when local stream changes (for renegotiation)
  useEffect(() => {
    if (!localStream) {
      offerCreatedRef.current = false;
      console.log('[WEBRTC QS] Reset offerCreatedRef - no local stream');
    }
  }, [localStream]);

  // ========== CREATE OFFER (PLAYER1 ONLY) ==========
  useEffect(() => {
    // Only player1 creates the offer, and only when:
    // 1. Peer connection exists
    // 2. Local stream is ready (tracks added)
    // 3. Subscription is active
    // 4. Offer hasn't been created yet

    console.log('[WEBRTC QS] Offer creation check:', {
      isPlayer1,
      hasPeerConnection: !!peerConnectionRef.current,
      hasLocalStream: !!localStream,
      isSubscribed,
      offerCreated: offerCreatedRef.current,
      opponentCameraOn,
      opponentReady
    });

    if (!isPlayer1) {
      console.log('[WEBRTC QS] Not player1, waiting for offer');
      return;
    }

    if (!peerConnectionRef.current) {
      console.log('[WEBRTC QS] No peer connection yet');
      return;
    }

    if (!localStream) {
      console.log('[WEBRTC QS] No local stream yet, waiting to create offer');
      return;
    }

    if (!isSubscribed) {
      console.log('[WEBRTC QS] Subscription not ready yet');
      return;
    }
    
    // Wait for Player 2 to be ready (subscribed) before creating first offer
    if (!opponentReady && !opponentCameraOn) {
      console.log('[WEBRTC QS] Waiting for Player 2 to be ready...');
      return;
    }

    // CRITICAL: Prevent duplicate offer creation
    if (offerCreatedRef.current) {
      console.log('[WEBRTC QS] Offer already created, skipping');
      return;
    }

    const createOffer = async () => {
      const pc = peerConnectionRef.current;
      if (!pc) {
        console.log('[WEBRTC QS] No peer connection in createOffer');
        return;
      }

      // Handle stuck state - rollback if we have local offer but no answer
      if (pc.signalingState === 'have-local-offer') {
        console.log('[WEBRTC QS] Stuck in have-local-offer, rolling back...');
        try {
          await pc.setLocalDescription({type: 'rollback'});
          console.log('[WEBRTC QS] ✅ Rolled back to stable');
        } catch (e) {
          console.error('[WEBRTC QS] Rollback failed:', e);
          // Create new peer connection
          pc.close();
          peerConnectionRef.current = null;
          offerCreatedRef.current = false;
          return;
        }
      }

      // Double-check signaling state
      if (pc.signalingState !== 'stable') {
        console.log('[WEBRTC QS] Cannot create offer, signaling state:', pc.signalingState);
        return;
      }

      // Mark as created BEFORE async operations to prevent race conditions
      offerCreatedRef.current = true;

      console.log('[WEBRTC QS] ========== CREATING OFFER (PLAYER1) ==========');

      try {
        makingOfferRef.current = true;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log('[WEBRTC QS] ✅ Local description set (offer)');

        // Only send if we still have all required data
        if (roomId && myUserId && opponentUserId) {
          await sendSignal(roomId, myUserId, opponentUserId, 'offer', {
            offer: pc.localDescription?.toJSON()
          });
          console.log('[WEBRTC QS] ✅ Offer sent to player2');
        } else {
          console.warn('[WEBRTC QS] Missing required IDs for sending offer');
        }

      } catch (error) {
        console.error('[WEBRTC QS] ❌ Error creating offer:', error);
        // Reset on error so we can retry
        offerCreatedRef.current = false;
      } finally {
        makingOfferRef.current = false;
      }
    };

    // Small delay to ensure subscription is fully ready
    const timer = setTimeout(createOffer, 1000);
    return () => clearTimeout(timer);

  }, [isPlayer1, localStream, roomId, myUserId, opponentUserId, isSubscribed, opponentCameraOn, opponentReady]);

  // ========== CAMERA CONTROLS ==========
  
  const startCamera = useCallback(async () => {
    console.log('[WEBRTC QS] ========== START CAMERA ==========');

    try {
      // VIDEO ONLY - no audio for privacy
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false  // Always disabled
      });

      console.log('[WEBRTC QS] ✅ Camera stream obtained');
      console.log('[WEBRTC QS] Tracks:', stream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        readyState: t.readyState
      })));

      setLocalStream(stream);
      setIsCameraOn(true);
      setCameraError(null);

      // Add tracks to peer connection if it exists
      const pc = peerConnectionRef.current;
      if (pc) {
        console.log('[WEBRTC QS] Adding tracks to peer connection');
        console.log('[WEBRTC QS] PC signaling state:', pc.signalingState);
        console.log('[WEBRTC QS] PC connection state:', pc.connectionState);

        // Remove old senders
        pc.getSenders().forEach(sender => {
          if (sender.track) {
            console.log('[WEBRTC QS] Removing old track:', sender.track.kind);
            pc.removeTrack(sender);
          }
        });

        // Add new tracks
        stream.getTracks().forEach(track => {
          console.log('[WEBRTC QS] Adding track:', track.kind);
          pc.addTrack(track, stream);
        });

        console.log('[WEBRTC QS] ✅ All tracks added to peer connection');
        console.log('[WEBRTC QS] Current senders:', pc.getSenders().length);

        // Manually trigger negotiation if Player 1
        // onnegotiationneeded doesn't always fire reliably
        if (isPlayer1 && pc.signalingState === 'stable' && roomId && myUserId && opponentUserId) {
          console.log('[WEBRTC QS] 🔄 Manually triggering negotiation as Player 1');
          setTimeout(async () => {
            try {
              makingOfferRef.current = true;
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              console.log('[WEBRTC QS] ✅ Manual renegotiation offer created');
              
              await sendSignal(roomId, myUserId, opponentUserId, 'offer', {
                offer: pc.localDescription?.toJSON()
              });
              console.log('[WEBRTC QS] ✅ Manual renegotiation offer sent');
            } catch (err) {
              console.error('[WEBRTC QS] ❌ Error in manual negotiation:', err);
            } finally {
              makingOfferRef.current = false;
            }
          }, 100);
        }
      }

      // Send camera state to opponent
      if (roomId && myUserId && opponentUserId) {
        await sendSignal(roomId, myUserId, opponentUserId, 'state', { camera: true });
      }

    } catch (error: any) {
      console.error('[WEBRTC QS] ❌ Error starting camera:', error);
      setCameraError(error.message || 'Failed to access camera');
      setIsCameraOn(false);
      throw error;  // Re-throw so caller knows it failed
    }
  }, [roomId, myUserId, opponentUserId]);

  const stopCamera = useCallback((reason?: string) => {
    console.log('[WEBRTC QS] ========== STOP CAMERA ==========');
    console.log('[WEBRTC QS] Reason:', reason || 'user request');

    if (localStream) {
      localStream.getTracks().forEach(track => {
        track.stop();
        console.log('[WEBRTC QS] Stopped track:', track.kind);
      });
      setLocalStream(null);
    }

    setIsCameraOn(false);
    setCallStatus('idle');

    // Send camera state to opponent
    if (roomId && myUserId && opponentUserId) {
      sendSignal(roomId, myUserId, opponentUserId, 'state', { camera: false });
    }

    console.log('[WEBRTC QS] Camera stopped, peer connection stays alive');
  }, [localStream, myUserId, opponentUserId, roomId]);

  // Define toggleCamera AFTER startCamera and stopCamera
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      console.log('[WEBRTC QS] 📹 User toggling camera OFF');
      stopCamera('user turned off camera');
    } else {
      console.log('[WEBRTC QS] 📹 User toggling camera ON');
      await startCamera();
    }
  }, [isCameraOn, startCamera, stopCamera]);

  const toggleMic = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);
        console.log('[WEBRTC QS] 🎤 Mic', audioTrack.enabled ? 'unmuted' : 'muted');
      }
    }
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoDisabled(!videoTrack.enabled);
        console.log('[WEBRTC QS] 📹 Video', videoTrack.enabled ? 'enabled' : 'disabled');
      }
    }
  }, [localStream]);

  // Force TURN relay and restart connection
  const forceTurnAndRestart = useCallback(() => {
    console.log('[WEBRTC QS] ========== FORCE TURN RESTART ==========');
    forceTurnRef.current = true;
    
    // Close existing connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      console.log('[WEBRTC QS] Closed existing peer connection');
    }
    
    // Reset state
    setRemoteStream(null);
    setCallStatus('idle');
    connectionAttemptRef.current = 0;
    
    console.log('[WEBRTC QS] Will create new connection with TURN relay forced on next camera start');
    
    // Restart camera if it was on
    if (isCameraOn && localStream) {
      console.log('[WEBRTC QS] Restarting camera with TURN relay...');
      // The peer connection will be recreated on the next effect run
    }
  }, [isCameraOn, localStream]);

  // ========== CLEANUP ON UNMOUNT ==========
  useEffect(() => {
    return () => {
      console.log('[WEBRTC QS] Component unmounting, cleaning up');
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    localStream,
    remoteStream,
    isCameraOn,
    isMicMuted,
    isVideoDisabled,
    callStatus,
    cameraError,
    toggleCamera,
    toggleMic,
    toggleVideo,
    stopCamera,
    liveVideoRef,
    forceTurnAndRestart
  };
}
