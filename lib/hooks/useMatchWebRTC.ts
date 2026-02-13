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
  refreshCamera: () => Promise<void>;
  refreshConnection: () => Promise<void>;
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
    console.log('[WebRTC] ICE servers:', getIceServers().length);

    try {
      const iceServers = getIceServers();
      
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
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
          // Try to restart ICE on failure
          if (pc.connectionState === 'failed') {
            console.log('[WebRTC] Connection failed, attempting ICE restart...');
            pc.restartIce();
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          console.log('[WebRTC] ICE failed, restarting...');
          pc.restartIce();
        }
      };
      
      pc.onicegatheringstatechange = () => {
        console.log('[WebRTC] ICE gathering state:', pc.iceGatheringState);
      };

      // ICE candidate handler
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('[WebRTC] Sending ICE candidate:', event.candidate.type, event.candidate.protocol);
          await sendSignal(roomId, myUserId, opponentUserId, 'ice', {
            candidate: event.candidate.toJSON()
          });
        } else {
          console.log('[WebRTC] ICE gathering complete');
        }
      };

      // Remote track handler - CRITICAL
      pc.ontrack = (event) => {
        console.log('[WebRTC] Remote track received:', event.track.kind, event.track.id);
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
          console.log('[WebRTC] Creating offer...');
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

  // Auto-reconnect on failure
  useEffect(() => {
    if (callStatus === 'failed' && peerConnectionRef.current) {
      console.log('[WebRTC] Attempting to restart connection...');
      peerConnectionRef.current.restartIce();
    }
  }, [callStatus]);

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

        // Ensure local stream is added before creating answer
        if (localStream) {
          const senders = pc.getSenders();
          const hasVideo = senders.some(s => s.track?.kind === 'video');
          if (!hasVideo) {
            console.log('[WebRTC] Adding local tracks before creating answer');
            localStream.getTracks().forEach(track => {
              pc.addTrack(track, localStream);
            });
          }
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
  }, [roomId, myUserId, opponentUserId, isPlayer1, coinTossComplete, localStream]);

  // ========== ADD TRACKS AND CREATE OFFER ==========
  useEffect(() => {
    if (!localStream || !peerConnectionRef.current) return;

    const pc = peerConnectionRef.current;
    
    // Add tracks if not already added
    const senders = pc.getSenders();
    const hasVideo = senders.some(s => s.track?.kind === 'video');
    
    if (!hasVideo) {
      localStream.getTracks().forEach(track => {
        console.log('[WebRTC] Adding track:', track.kind);
        pc.addTrack(track, localStream);
      });
      
      // Player 1 creates offer after adding tracks
      if (isPlayer1 && roomId && myUserId && opponentUserId) {
        console.log('[WebRTC] Player 1 creating offer after adding tracks...');
        (async () => {
          try {
            makingOfferRef.current = true;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            
            await sendSignal(roomId, myUserId, opponentUserId, 'offer', {
              offer: pc.localDescription?.toJSON()
            });
            console.log('[WebRTC] ✅ Offer sent to Player 2');
          } catch (err) {
            console.error('[WebRTC] Error creating offer:', err);
          } finally {
            makingOfferRef.current = false;
          }
        })();
      }
    }
  }, [isPlayer1, localStream, roomId, myUserId, opponentUserId]);

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

      // Tracks will be added to PC via useEffect above
      // Send state signal
      if (roomId && myUserId && opponentUserId) {
        await sendSignal(roomId, myUserId, opponentUserId, 'state', { camera: true });
      }

    } catch (error: any) {
      console.error('[WebRTC] Error starting camera:', error);
      setCameraError(error.message || 'Failed to access camera');
      setIsCameraOn(false);
    }
  }, [roomId, myUserId, opponentUserId]);

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

  // Refresh camera - stop and restart to try to fix connection issues
  const refreshCamera = useCallback(async () => {
    console.log('[WebRTC] Refreshing camera...');
    
    // Stop current camera
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
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

    setLocalStream(null);
    setIsCameraOn(false);

    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 300));

    // Restart camera
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      console.log('[WebRTC] Camera refreshed successfully');
      setLocalStream(stream);
      setIsCameraOn(true);
      setCameraError(null);

      // Re-add tracks to peer connection if it exists
      if (pc && stream) {
        stream.getTracks().forEach(track => {
          console.log('[WebRTC] Re-adding track after refresh:', track.kind);
          pc.addTrack(track, stream);
        });
      }

      // Send state signal
      if (roomId && myUserId && opponentUserId) {
        await sendSignal(roomId, myUserId, opponentUserId, 'state', { camera: true, refreshed: true });
      }

    } catch (error: any) {
      console.error('[WebRTC] Error refreshing camera:', error);
      setCameraError(error.message || 'Failed to refresh camera');
      setIsCameraOn(false);
    }
  }, [localStream, myUserId, opponentUserId, roomId]);

  const forceTurnAndRestart = useCallback(() => {
    console.log('[WebRTC] Forcing TURN relay and restarting connection');

    // Close existing peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Reset state
    setCallStatus('connecting');
    setRemoteStream(null);

    // Create new peer connection with forced TURN relay
    if (!roomId || !myUserId || !opponentUserId) return;

    try {
      const iceServers = getIceServers();

      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'relay' // Force TURN relay only
      });

      peerConnectionRef.current = pc;

      // Re-setup connection handlers
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

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('[WebRTC] Sending ICE candidate');
          await sendSignal(roomId, myUserId, opponentUserId, 'ice', {
            candidate: event.candidate
          });
        }
      };

      pc.ontrack = (event) => {
        console.log('[WebRTC] Remote track received:', event.track.kind);
        if (event.streams && event.streams[0]) {
          console.log('[WebRTC] Setting remote stream');
          setRemoteStream(event.streams[0]);
          setCallStatus('connected');
        }
      };

      pc.onnegotiationneeded = async () => {
        if (!isPlayer1 || makingOfferRef.current) return;

        try {
          makingOfferRef.current = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          await sendSignal(roomId, myUserId, opponentUserId, 'offer', {
            offer: pc.localDescription?.toJSON()
          });
          console.log('[WebRTC] Offer sent (with TURN relay)');
        } catch (error) {
          console.error('[WebRTC] Error creating offer:', error);
        } finally {
          makingOfferRef.current = false;
        }
      };

      // Re-add local stream if camera is on
      if (localStream) {
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream);
        });
      }

      console.log('[WebRTC] Connection restarted with TURN relay');
    } catch (error) {
      console.error('[WebRTC] Error restarting connection with TURN:', error);
      setCameraError('Failed to restart connection with TURN relay');
    }
  }, [roomId, myUserId, opponentUserId, isPlayer1, localStream]);

  // Refresh connection to opponent - restarts peer connection to reconnect
  const refreshConnection = useCallback(async () => {
    console.log('[WebRTC] Refreshing connection to opponent...');
    setCallStatus('connecting');
    setRemoteStream(null);

    // Close existing peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Clear pending ICE candidates
    pendingIceCandidatesRef.current = [];
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;

    // Small delay to ensure cleanup
    await new Promise(resolve => setTimeout(resolve, 300));

    if (!roomId || !myUserId || !opponentUserId) {
      console.error('[WebRTC] Cannot refresh - missing required IDs');
      setCallStatus('failed');
      return;
    }

    try {
      const iceServers = getIceServers();
      
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });

      peerConnectionRef.current = pc;

      // Re-setup connection handlers
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

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('[WebRTC] Sending ICE candidate');
          await sendSignal(roomId, myUserId, opponentUserId, 'ice', {
            candidate: event.candidate
          });
        }
      };

      pc.ontrack = (event) => {
        console.log('[WebRTC] Remote track received:', event.track.kind);
        if (event.streams && event.streams[0]) {
          console.log('[WebRTC] Setting remote stream');
          setRemoteStream(event.streams[0]);
          setCallStatus('connected');
        }
      };

      pc.onnegotiationneeded = async () => {
        console.log('[WebRTC] Negotiation needed');
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

      // Re-add local stream if camera is on
      if (localStream) {
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream);
        });
      }

      // Player 1 creates offer to restart connection
      if (isPlayer1) {
        console.log('[WebRTC] Player 1 creating new offer after refresh...');
        try {
          makingOfferRef.current = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          await sendSignal(roomId, myUserId, opponentUserId, 'offer', {
            offer: pc.localDescription?.toJSON()
          });
          console.log('[WebRTC] New offer sent after refresh');
        } catch (error) {
          console.error('[WebRTC] Error creating offer after refresh:', error);
        } finally {
          makingOfferRef.current = false;
        }
      } else {
        console.log('[WebRTC] Player 2 waiting for offer after refresh...');
      }

      console.log('[WebRTC] Connection refresh complete');
    } catch (error) {
      console.error('[WebRTC] Error refreshing connection:', error);
      setCallStatus('failed');
    }
  }, [roomId, myUserId, opponentUserId, isPlayer1, localStream]);

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
    refreshCamera,
    refreshConnection,
    forceTurnAndRestart,
  };
}
