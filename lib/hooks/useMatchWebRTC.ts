import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { sendSignal, subscribeSignals, fetchOpponentId } from '@/lib/webrtc/signaling-adapter';
import { getIceServers } from '@/lib/webrtc/ice';

export interface UseMatchWebRTCProps {
  roomId: string | null;
  myUserId: string | null;
  coinTossComplete?: boolean; // Optional: wait for coin toss before connecting
}

export interface UseMatchWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isCameraOn: boolean;
  isMicMuted: boolean;
  callStatus: 'idle' | 'connecting' | 'connected' | 'failed';
  cameraError: string | null;
  toggleCamera: () => Promise<void>;
  stopCamera: () => void;
  forceTurnAndRestart: () => void;
}

/**
 * Unified WebRTC Hook for Quick Match Camera
 * Handles both local and remote video streams
 */
export function useMatchWebRTC({
  roomId,
  myUserId,
  coinTossComplete = true,
}: UseMatchWebRTCProps): UseMatchWebRTCReturn {
  const supabase = createClient();

  // State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [opponentUserId, setOpponentUserId] = useState<string | null>(null);
  const [isPlayer1, setIsPlayer1] = useState<boolean>(false);

  // Refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const subscriptionCleanupRef = useRef<(() => void) | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  console.log('[WebRTC] State:', { roomId, myUserId, opponentUserId, isPlayer1, callStatus });

  // ========== FETCH OPPONENT ==========
  useEffect(() => {
    if (!roomId || !myUserId) return;

    const fetchOpponent = async () => {
      const opponentId = await fetchOpponentId(roomId, myUserId);
      setOpponentUserId(opponentId);

      if (opponentId) {
        const { data } = await supabase
          .from('match_rooms')
          .select('player1_id')
          .eq('id', roomId)
          .single();

        if (data) {
          setIsPlayer1(data.player1_id === myUserId);
        }
      }
    };

    fetchOpponent();
  }, [roomId, myUserId]);

  // ========== CREATE PEER CONNECTION ==========
  useEffect(() => {
    if (!roomId || !myUserId || !opponentUserId) return;
    if (!coinTossComplete) return; // Wait for coin toss
    if (peerConnectionRef.current) return; // Already exists

    console.log('[WebRTC] Creating peer connection');

    try {
      const iceServers = getIceServers();
      
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all'
      });

      peerConnectionRef.current = pc;

      // Connection state handlers
      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setCallStatus('connected');
        } else if (pc.connectionState === 'connecting') {
          setCallStatus('connecting');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setCallStatus('failed');
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE state:', pc.iceConnectionState);
      };

      // ICE candidate handler
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('[WebRTC] Sending ICE candidate');
          await sendSignal(roomId, myUserId, opponentUserId, 'ice', {
            candidate: event.candidate
          });
        }
      };

      // Remote track handler - CRITICAL
      pc.ontrack = (event) => {
        console.log('[WebRTC] Remote track received:', event.track.kind);
        if (event.streams && event.streams[0]) {
          console.log('[WebRTC] Setting remote stream');
          setRemoteStream(event.streams[0]);
          setCallStatus('connected');
        }
      };

      // Negotiation needed
      pc.onnegotiationneeded = async () => {
        if (!isPlayer1 || makingOfferRef.current) return;
        
        try {
          makingOfferRef.current = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          await sendSignal(roomId, myUserId, opponentUserId, 'offer', {
            offer: pc.localDescription?.toJSON()
          });
          console.log('[WebRTC] Offer sent');
        } catch (error) {
          console.error('[WebRTC] Error creating offer:', error);
        } finally {
          makingOfferRef.current = false;
        }
      };

    } catch (error) {
      console.error('[WebRTC] Error creating peer connection:', error);
      setCameraError('Failed to initialize connection');
    }

    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, [roomId, myUserId, opponentUserId, isPlayer1, coinTossComplete]);

  // ========== SIGNALING SUBSCRIPTION ==========
  useEffect(() => {
    if (!roomId || !myUserId || !opponentUserId) return;
    if (!coinTossComplete) return; // Wait for coin toss

    const handleOffer = async (offer: RTCSessionDescriptionInit) => {
      console.log('[WebRTC] ========== RECEIVED OFFER ==========');
      console.log('[WebRTC] I am Player 1:', isPlayer1);

      const pc = peerConnectionRef.current;
      if (!pc) {
        console.error('[WebRTC] ❌ No peer connection');
        return;
      }

      try {
        // Perfect negotiation: detect collision
        const offerCollision = offer.type === 'offer' && 
          (makingOfferRef.current || pc.signalingState !== 'stable');

        console.log('[WebRTC] Signaling state:', pc.signalingState, 'Offer collision:', offerCollision);

        ignoreOfferRef.current = isPlayer1 && offerCollision;
        if (ignoreOfferRef.current) {
          console.log('[WebRTC] ⛔ Ignoring offer (collision)');
          return;
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Process pending ICE candidates
        if (pendingIceCandidatesRef.current.length > 0) {
          for (const candidate of pendingIceCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
              console.error('[WebRTC] Error adding pending ICE:', error);
            }
          }
          pendingIceCandidatesRef.current = [];
        }

        // Create answer
        console.log('[WebRTC] Creating answer...');
        const answer = await pc.createAnswer();
        console.log('[WebRTC] Setting local description (answer)...');
        await pc.setLocalDescription(answer);
        console.log('[WebRTC] Local description set');

        console.log('[WebRTC] Sending answer...');
        await sendSignal(roomId, myUserId, opponentUserId, 'answer', {
          answer: pc.localDescription?.toJSON()
        });
        console.log('[WebRTC] ✅ Answer sent successfully');

      } catch (error) {
        console.error('[WebRTC] Error handling offer:', error);
      }
    };

    const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log('[WebRTC] Answer applied');

        // Process pending ICE candidates
        if (pendingIceCandidatesRef.current.length > 0) {
          for (const candidate of pendingIceCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
              console.error('[WebRTC] Error adding pending ICE:', error);
            }
          }
          pendingIceCandidatesRef.current = [];
        }
      } catch (error) {
        console.error('[WebRTC] Error handling answer:', error);
      }
    };

    const handleIce = async (candidate: RTCIceCandidateInit) => {
      const pc = peerConnectionRef.current;
      if (!pc) {
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }

      if (!pc.remoteDescription) {
        pendingIceCandidatesRef.current.push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('[WebRTC] Error adding ICE candidate:', error);
      }
    };

    console.log('[WebRTC] Setting up signal subscription...');
    console.log('[WebRTC] Room:', roomId, 'My ID:', myUserId, 'Opponent:', opponentUserId);

    const cleanup = subscribeSignals(roomId, myUserId, {
      onOffer: handleOffer,
      onAnswer: handleAnswer,
      onIce: handleIce
    });

    subscriptionCleanupRef.current = cleanup;
    console.log('[WebRTC] ✅ Signal subscription set up');

    return () => {
      if (subscriptionCleanupRef.current) {
        subscriptionCleanupRef.current();
        subscriptionCleanupRef.current = null;
      }
    };
  }, [roomId, myUserId, opponentUserId, isPlayer1, coinTossComplete]);

  // ========== CREATE OFFER (PLAYER1 ONLY) ==========
  useEffect(() => {
    if (!isPlayer1 || !localStream || !peerConnectionRef.current) return;

    const pc = peerConnectionRef.current;
    
    // Add tracks if not already added
    const senders = pc.getSenders();
    const hasVideo = senders.some(s => s.track?.kind === 'video');
    
    if (!hasVideo) {
      localStream.getTracks().forEach(track => {
        console.log('[WebRTC] Adding track:', track.kind);
        pc.addTrack(track, localStream);
      });
    }
  }, [isPlayer1, localStream]);

  // ========== CAMERA CONTROLS ==========
  
  const startCamera = useCallback(async () => {
    console.log('[WebRTC] Starting camera');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      console.log('[WebRTC] Camera stream obtained');
      setLocalStream(stream);
      setIsCameraOn(true);
      setCameraError(null);

      // Add tracks to peer connection and create offer if Player 1
      const pc = peerConnectionRef.current;
      if (pc) {
        stream.getTracks().forEach(track => {
          console.log('[WebRTC] Adding track to PC:', track.kind);
          pc.addTrack(track, stream);
        });

        // Player 1 creates offer after adding tracks
        if (isPlayer1 && roomId && myUserId && opponentUserId) {
          console.log('[WebRTC] Player 1 creating offer...');
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            await sendSignal(roomId, myUserId, opponentUserId, 'offer', {
              offer: pc.localDescription?.toJSON()
            });
            console.log('[WebRTC] ✅ Offer sent to Player 2');
          } catch (err) {
            console.error('[WebRTC] Error creating offer:', err);
          }
        }
      }

      // Send state signal
      if (roomId && myUserId && opponentUserId) {
        await sendSignal(roomId, myUserId, opponentUserId, 'state', { camera: true });
      }

    } catch (error: any) {
      console.error('[WebRTC] Error starting camera:', error);
      setCameraError(error.message || 'Failed to access camera');
      setIsCameraOn(false);
    }
  }, [roomId, myUserId, opponentUserId, isPlayer1]);

  const stopCamera = useCallback(() => {
    console.log('[WebRTC] Stopping camera');

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    // Remove tracks from peer connection
    const pc = peerConnectionRef.current;
    if (pc) {
      pc.getSenders().forEach(sender => {
        if (sender.track) {
          pc.removeTrack(sender);
        }
      });
    }

    setIsCameraOn(false);

    if (roomId && myUserId && opponentUserId) {
      sendSignal(roomId, myUserId, opponentUserId, 'state', { camera: false });
    }
  }, [localStream, myUserId, opponentUserId, roomId]);

  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      await startCamera();
    }
  }, [isCameraOn, startCamera, stopCamera]);

  // ========== CLEANUP ==========
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  return {
    localStream,
    remoteStream,
    isCameraOn,
    isMicMuted,
    callStatus,
    cameraError,
    toggleCamera,
    stopCamera,
    forceTurnAndRestart,
  };
}
