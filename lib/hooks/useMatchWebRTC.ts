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
  callStatus: 'idle' | 'connecting' | 'connected';
  cameraError: string | null;
  toggleCamera: () => Promise<void>;
  toggleMic: () => void;
  toggleVideo: () => void;
  stopCamera: (reason?: string) => void;
  liveVideoRef: React.RefObject<HTMLVideoElement>;
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
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoDisabled, setIsVideoDisabled] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [opponentUserId, setOpponentUserId] = useState<string | null>(null);
  const [isPlayer1, setIsPlayer1] = useState<boolean>(false);

  // Refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const subscriptionCleanupRef = useRef<(() => void) | null>(null);

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

    const streamToShow = isMyTurn ? localStream : remoteStream;
    const turnLabel = isMyTurn ? 'ME' : 'OPPONENT';

    console.log('[WEBRTC QS] Video display - Turn:', turnLabel, 'Stream:', streamToShow ? 'YES' : 'NO');

    if (streamToShow) {
      liveVideoRef.current.srcObject = streamToShow;
      liveVideoRef.current.muted = isMyTurn; // Mute own video
      liveVideoRef.current.autoplay = true;
      liveVideoRef.current.playsInline = true;
      liveVideoRef.current.play().catch((err) => {
        console.error('[WEBRTC QS] Error playing video:', err);
      });
    } else {
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
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10
      });

      peerConnectionRef.current = pc;
      console.log('[WEBRTC QS] ✅ RTCPeerConnection created');

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
          setCallStatus('idle');
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

    const handleState = (state: any) => {
      console.log('[WEBRTC QS] 📊 State update from opponent:', state);
      // Could update UI to show opponent camera status
    };

    // Subscribe to signals
    const cleanup = subscribeSignals(roomId, myUserId, {
      onOffer: handleOffer,
      onAnswer: handleAnswer,
      onIce: handleIce,
      onState: handleState
    });

    subscriptionCleanupRef.current = cleanup;

    return () => {
      if (subscriptionCleanupRef.current) {
        subscriptionCleanupRef.current();
        subscriptionCleanupRef.current = null;
      }
    };
  }, [roomId, myUserId, opponentUserId, isPlayer1]);

  // ========== CREATE OFFER (PLAYER1 ONLY) ==========
  useEffect(() => {
    // Only player1 creates the offer, and only when:
    // 1. Peer connection exists
    // 2. Local stream is ready (tracks added)
    // 3. Subscription is active

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

    if (!subscriptionCleanupRef.current) {
      console.log('[WEBRTC QS] Subscription not ready yet');
      return;
    }

    const createOffer = async () => {
      const pc = peerConnectionRef.current;
      if (!pc || pc.signalingState !== 'stable') {
        console.log('[WEBRTC QS] Cannot create offer, signaling state:', pc?.signalingState);
        return;
      }

      console.log('[WEBRTC QS] ========== CREATING OFFER (PLAYER1) ==========');

      try {
        makingOfferRef.current = true;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log('[WEBRTC QS] ✅ Local description set (offer)');

        await sendSignal(roomId!, myUserId!, opponentUserId!, 'offer', {
          offer: pc.localDescription?.toJSON()
        });
        console.log('[WEBRTC QS] ✅ Offer sent to player2');

      } catch (error) {
        console.error('[WEBRTC QS] ❌ Error creating offer:', error);
      } finally {
        makingOfferRef.current = false;
      }
    };

    // Small delay to ensure subscription is fully ready
    const timer = setTimeout(createOffer, 500);
    return () => clearTimeout(timer);

  }, [isPlayer1, localStream, roomId, opponentUserId]);

  // ========== CAMERA CONTROLS ==========
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      console.log('[WEBRTC QS] 📹 User toggling camera OFF');
      stopCamera('user turned off camera');
    } else {
      console.log('[WEBRTC QS] 📹 User toggling camera ON');
      await startCamera();
    }
  }, [isCameraOn]);

  const startCamera = async () => {
    console.log('[WEBRTC QS] ========== START CAMERA ==========');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
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

        // Remove old senders
        pc.getSenders().forEach(sender => {
          if (sender.track) {
            pc.removeTrack(sender);
          }
        });

        // Add new tracks
        stream.getTracks().forEach(track => {
          console.log('[WEBRTC QS] Adding track:', track.kind);
          pc.addTrack(track, stream);
        });

        console.log('[WEBRTC QS] ✅ All tracks added to peer connection');

        // If player1 and no remote description yet, will trigger offer creation
        // via the useEffect that watches localStream
      }

      // Send camera state to opponent
      if (roomId && myUserId && opponentUserId) {
        await sendSignal(roomId, myUserId, opponentUserId, 'state', { camera: true });
      }

    } catch (error: any) {
      console.error('[WEBRTC QS] ❌ Error starting camera:', error);
      setCameraError(error.message || 'Failed to access camera');
      setIsCameraOn(false);
    }
  };

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
    liveVideoRef
  };
}
