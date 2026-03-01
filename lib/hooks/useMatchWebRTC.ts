import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { sendSignal, subscribeSignals, fetchOpponentId } from '@/lib/webrtc/signaling-adapter';
import { fetchIceServers } from '@/lib/webrtc/ice';

export interface UseMatchWebRTCProps {
  roomId: string | null;
  myUserId: string | null;
  coinTossComplete?: boolean;
  autoStartCamera?: boolean;
  isMatchActive?: boolean;
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
  switchCamera: () => Promise<void>;
  facingMode: 'user' | 'environment';
}

/**
 * Unified WebRTC Hook for Quick Match Camera
 * 
 * Features:
 * - Dynamic TURN credentials from Xirsys via /api/turn
 * - Auto-start camera on mount (optional)
 * - Bidirectional video stream
 * - Perfect negotiation pattern
 * - Auto-reconnect on failure
 */
export function useMatchWebRTC({
  roomId,
  myUserId,
  coinTossComplete = true,
  autoStartCamera = false,
  isMatchActive = false,
}: UseMatchWebRTCProps): UseMatchWebRTCReturn {
  const supabase = createClient();

  // State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMicMuted] = useState(true);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [opponentUserId, setOpponentUserId] = useState<string | null>(null);
  const [isPlayer1, setIsPlayer1] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  // Refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const subscriptionCleanupRef = useRef<(() => void) | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const hasAutoStarted = useRef(false);
  const isSettingUp = useRef(false);
  const isRebuildingRef = useRef(false);
  const healthIssueStartedAtRef = useRef<number | null>(null);

  // Keep localStreamRef in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  const facingModeRef = useRef<'user' | 'environment'>('environment');
  useEffect(() => { facingModeRef.current = facingMode; }, [facingMode]);

  const sendReconnectSignal = useCallback(async (reason: string) => {
    if (!roomId || !myUserId || !opponentUserId) return;
    await sendSignal(roomId, myUserId, opponentUserId, 'reconnect', {
      reason,
      at: new Date().toISOString(),
    });
  }, [roomId, myUserId, opponentUserId]);

  // ========== START CAMERA ==========
  const startCamera = useCallback(async (overrideFacing?: 'user' | 'environment'): Promise<MediaStream | null> => {
    const facing = overrideFacing || facingModeRef.current;
    console.log('[WebRTC] Starting camera...', { facingMode: facing });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: facing,
        },
        audio: false,
      });

      console.log('[WebRTC] Camera stream obtained');
      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsCameraOn(true);
      setCameraError(null);
      return stream;
    } catch (error: any) {
      console.error('[WebRTC] Camera error:', error);
      setCameraError(error.message || 'Failed to access camera');
      setIsCameraOn(false);
      return null;
    }
  }, []);

  // ========== STOP CAMERA ==========
  const stopCamera = useCallback(() => {
    console.log('[WebRTC] Stopping camera');
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
      localStreamRef.current = null;
    }

    const pc = peerConnectionRef.current;
    if (pc) {
      pc.getSenders().forEach((sender) => {
        if (sender.track) {
          try { pc.removeTrack(sender); } catch (e) {}
        }
      });
    }

    setIsCameraOn(false);

    if (roomId && myUserId && opponentUserId) {
      sendSignal(roomId, myUserId, opponentUserId, 'state', { camera: false });
    }
  }, [roomId, myUserId, opponentUserId]);

  // ========== CREATE PEER CONNECTION ==========
  const createPeerConnection = useCallback(async (
    _roomId: string,
    _myUserId: string,
    _opponentUserId: string,
    _isPlayer1: boolean,
    stream: MediaStream | null,
  ): Promise<RTCPeerConnection> => {
    console.log('[WebRTC] Creating peer connection...');
    setCallStatus('connecting');

    // Fetch dynamic TURN credentials from Xirsys
    const iceServers = await fetchIceServers();
    console.log('[WebRTC] Got', iceServers.length, 'ICE servers');

    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });

    peerConnectionRef.current = pc;

    // Add local tracks if camera is on
    if (stream) {
      stream.getTracks().forEach((track) => {
        console.log('[WebRTC] Adding local track:', track.kind);
        pc.addTrack(track, stream);
      });
    }

    // Connection state
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      switch (pc.connectionState) {
        case 'connected':
          setCallStatus('connected');
          break;
        case 'connecting':
          setCallStatus('connecting');
          break;
        case 'failed':
          setCallStatus('failed');
          console.log('[WebRTC] Connection failed, restarting ICE...');
          pc.restartIce();
          break;
        case 'disconnected':
          // Don't immediately set failed — ICE reconnect may recover
          setCallStatus('connecting');
          break;
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected') {
        // Temporary disconnection — wait 3s then restart ICE if still disconnected
        setTimeout(() => {
          if (peerConnectionRef.current === pc && pc.iceConnectionState === 'disconnected') {
            console.log('[WebRTC] Still disconnected after 3s, restarting ICE...');
            pc.restartIce();
          }
        }, 3000);
      }
      if (pc.iceConnectionState === 'failed') {
        console.log('[WebRTC] ICE failed, restarting...');
        pc.restartIce();
      }
    };

    // ICE candidates → send to opponent via Supabase
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await sendSignal(_roomId, _myUserId, _opponentUserId, 'ice', {
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Remote track received → set remote stream
    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track received:', event.track.kind);
      if (event.streams && event.streams[0]) {
        console.log('[WebRTC] ✅ Setting remote stream');
        setRemoteStream(event.streams[0]);
        setCallStatus('connected');
      }
    };

    // Negotiation needed — Player 1 creates the offer
    pc.onnegotiationneeded = async () => {
      if (!_isPlayer1 || makingOfferRef.current) return;
      try {
        makingOfferRef.current = true;
        console.log('[WebRTC] Player 1 creating offer...');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal(_roomId, _myUserId, _opponentUserId, 'offer', {
          offer: pc.localDescription?.toJSON(),
        });
        console.log('[WebRTC] ✅ Offer sent');
      } catch (error) {
        console.error('[WebRTC] Error creating offer:', error);
      } finally {
        makingOfferRef.current = false;
      }
    };

    return pc;
  }, []);

  // ========== MAIN SETUP EFFECT ==========
  useEffect(() => {
    if (!roomId || !myUserId || !coinTossComplete) return;
    if (isSettingUp.current) return;

    let cancelled = false;

    const setup = async () => {
      isSettingUp.current = true;

      // 1. Fetch opponent
      console.log('[WebRTC] Fetching opponent...');
      const opponentId = await fetchOpponentId(roomId, myUserId);
      if (!opponentId || cancelled) {
        isSettingUp.current = false;
        return;
      }

      setOpponentUserId(opponentId);

      // Determine player role
      const { data } = await supabase
        .from('match_rooms')
        .select('player1_id, status')
        .eq('id', roomId)
        .single();

      const amPlayer1 = data?.player1_id === myUserId;
      setIsPlayer1(amPlayer1);
      console.log('[WebRTC] I am Player', amPlayer1 ? '1' : '2');

      // 2. Auto-start camera if enabled
      let stream: MediaStream | null = localStreamRef.current;
      if (autoStartCamera && !hasAutoStarted.current) {
        hasAutoStarted.current = true;
        stream = await startCamera();
      }

      if (cancelled) {
        isSettingUp.current = false;
        return;
      }

      // 3. Create peer connection
      const pc = await createPeerConnection(roomId, myUserId, opponentId, amPlayer1, stream);

      if (cancelled) {
        pc.close();
        peerConnectionRef.current = null;
        isSettingUp.current = false;
        return;
      }

      // 4. Set up signaling subscription
      const handleOffer = async (offer: RTCSessionDescriptionInit) => {
        console.log('[WebRTC] Received OFFER');
        if (!peerConnectionRef.current) return;
        const _pc = peerConnectionRef.current;

        try {
          const offerCollision =
            offer.type === 'offer' &&
            (makingOfferRef.current || _pc.signalingState !== 'stable');

          ignoreOfferRef.current = amPlayer1 && offerCollision;
          if (ignoreOfferRef.current) {
            console.log('[WebRTC] Ignoring colliding offer');
            return;
          }

          // Ensure local tracks are added before answering
          const currentStream = localStreamRef.current;
          if (currentStream) {
            const senders = _pc.getSenders();
            const hasVideo = senders.some((s) => s.track?.kind === 'video');
            if (!hasVideo) {
              currentStream.getTracks().forEach((track) => {
                _pc.addTrack(track, currentStream);
              });
            }
          }

          await _pc.setRemoteDescription(new RTCSessionDescription(offer));

          // Flush pending ICE candidates
          for (const candidate of pendingIceCandidatesRef.current) {
            try {
              await _pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {}
          }
          pendingIceCandidatesRef.current = [];

          const answer = await _pc.createAnswer();
          await _pc.setLocalDescription(answer);

          await sendSignal(roomId, myUserId, opponentId, 'answer', {
            answer: _pc.localDescription?.toJSON(),
          });
          console.log('[WebRTC] ✅ Answer sent');
        } catch (error) {
          console.error('[WebRTC] Error handling offer:', error);
        }
      };

      const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
        const _pc = peerConnectionRef.current;
        if (!_pc) return;

        // Guard: only apply answer when we're expecting one (have-local-offer state)
        if (_pc.signalingState !== 'have-local-offer') {
          console.log('[WebRTC] Ignoring stale answer (state:', _pc.signalingState, ')');
          return;
        }

        try {
          await _pc.setRemoteDescription(new RTCSessionDescription(answer));
          for (const candidate of pendingIceCandidatesRef.current) {
            try {
              await _pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {}
          }
          pendingIceCandidatesRef.current = [];
          console.log('[WebRTC] ✅ Answer applied');
        } catch (error) {
          console.error('[WebRTC] Error handling answer:', error);
        }
      };

      const handleIce = async (candidate: RTCIceCandidateInit) => {
        const _pc = peerConnectionRef.current;
        if (!_pc || !_pc.remoteDescription) {
          pendingIceCandidatesRef.current.push(candidate);
          return;
        }
        try {
          await _pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('[WebRTC] Error adding ICE:', error);
        }
      };

      const cleanup = subscribeSignals(roomId, myUserId, {
        onOffer: handleOffer,
        onAnswer: handleAnswer,
        onIce: handleIce,
        onReconnect: async () => {
          console.log('[WebRTC] Reconnect signal received from opponent, rebuilding peer connection');
          await refreshConnection(true, false);
        },
      });
      subscriptionCleanupRef.current = cleanup;

      // 5. If Player 1 and has tracks, create initial offer
      if (amPlayer1 && stream) {
        try {
          makingOfferRef.current = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal(roomId, myUserId, opponentId, 'offer', {
            offer: pc.localDescription?.toJSON(),
          });
          console.log('[WebRTC] ✅ Initial offer sent');
        } catch (e) {
          console.error('[WebRTC] Error sending initial offer:', e);
        } finally {
          makingOfferRef.current = false;
        }
      }

      // If user reloads while match is active, notify opponent to rebuild as well.
      if (data?.status === 'active') {
        await sendReconnectSignal('page_reconnect');
      }

      isSettingUp.current = false;
    };

    setup();

    return () => {
      cancelled = true;
      if (subscriptionCleanupRef.current) {
        subscriptionCleanupRef.current();
        subscriptionCleanupRef.current = null;
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      isSettingUp.current = false;
    };
  }, [roomId, myUserId, coinTossComplete, autoStartCamera]);

  // ========== RE-NEGOTIATE WHEN LOCAL STREAM CHANGES ==========
  useEffect(() => {
    if (!localStream || !peerConnectionRef.current || !roomId || !myUserId || !opponentUserId) return;

    const pc = peerConnectionRef.current;
    const senders = pc.getSenders();
    const hasVideo = senders.some((s) => s.track?.kind === 'video');

    if (!hasVideo) {
      localStream.getTracks().forEach((track) => {
        console.log('[WebRTC] Adding new track:', track.kind);
        pc.addTrack(track, localStream);
      });

      // Player 1 re-offers after adding tracks
      if (isPlayer1) {
        (async () => {
          try {
            makingOfferRef.current = true;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal(roomId, myUserId, opponentUserId, 'offer', {
              offer: pc.localDescription?.toJSON(),
            });
          } catch (e) {
            console.error('[WebRTC] Re-offer error:', e);
          } finally {
            makingOfferRef.current = false;
          }
        })();
      }
    }
  }, [localStream, isPlayer1, roomId, myUserId, opponentUserId]);

  // ========== TOGGLE CAMERA ==========
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      await startCamera();
    }
  }, [isCameraOn, startCamera, stopCamera]);

  // ========== REFRESH CAMERA ==========
  const refreshCamera = useCallback(async () => {
    stopCamera();
    await new Promise((r) => setTimeout(r, 300));
    const stream = await startCamera();

    if (stream && peerConnectionRef.current) {
      const pc = peerConnectionRef.current;
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
      // Re-negotiate so opponent picks up the new stream
      if (isPlayer1 && roomId && myUserId && opponentUserId) {
        try {
          makingOfferRef.current = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal(roomId, myUserId, opponentUserId, 'offer', {
            offer: pc.localDescription?.toJSON(),
          });
        } catch (e) {
          console.error('[WebRTC] Re-offer after refreshCamera error:', e);
        } finally {
          makingOfferRef.current = false;
        }
      }
    }
  }, [startCamera, stopCamera, isPlayer1, roomId, myUserId, opponentUserId]);

  // ========== SWITCH CAMERA (front/back) ==========
  const switchCamera = useCallback(async () => {
    const newFacing = facingModeRef.current === 'user' ? 'environment' : 'user';
    console.log('[WebRTC] Switching camera to:', newFacing);
    setFacingMode(newFacing);
    facingModeRef.current = newFacing;

    // Stop current tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
    }

    // Get new stream with different facing mode
    const stream = await startCamera(newFacing);
    if (stream && peerConnectionRef.current) {
      const pc = peerConnectionRef.current;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        // Replace the track on the existing sender
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          try {
            await sender.replaceTrack(videoTrack);
          } catch (e) {
            console.warn('[WebRTC] replaceTrack failed, falling back to remove+add:', e);
            try { pc.removeTrack(sender); } catch (_) {}
            pc.addTrack(videoTrack, stream);
            // Re-negotiate after track change
            if (isPlayer1 && roomId && myUserId && opponentUserId) {
              try {
                makingOfferRef.current = true;
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                await sendSignal(roomId, myUserId, opponentUserId, 'offer', {
                  offer: pc.localDescription?.toJSON(),
                });
              } catch (err) {
                console.error('[WebRTC] Re-offer after switchCamera fallback error:', err);
              } finally {
                makingOfferRef.current = false;
              }
            }
          }
        } else {
          pc.addTrack(videoTrack, stream);
        }
      }
    }
  }, [startCamera]);

  // ========== REFRESH CONNECTION ==========
  const refreshConnection = useCallback(async (refreshRole = false, notifyOpponent = true) => {
    if (!roomId || !myUserId || !opponentUserId) return;
    if (isRebuildingRef.current) return;
    isRebuildingRef.current = true;

    try {
      setCallStatus('connecting');
      setRemoteStream(null);

      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      pendingIceCandidatesRef.current = [];
      makingOfferRef.current = false;
      ignoreOfferRef.current = false;

      let amPlayer1 = isPlayer1;
      if (refreshRole) {
        const { data } = await supabase
          .from('match_rooms')
          .select('player1_id')
          .eq('id', roomId)
          .single();
        amPlayer1 = data?.player1_id === myUserId;
        setIsPlayer1(amPlayer1);
      }

      await new Promise((r) => setTimeout(r, 300));

      const pc = await createPeerConnection(roomId, myUserId, opponentUserId, amPlayer1, localStreamRef.current);

      if (notifyOpponent) {
        await sendReconnectSignal('connection_rebuild');
      }

      if (amPlayer1 && localStreamRef.current) {
        try {
          makingOfferRef.current = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal(roomId, myUserId, opponentUserId, 'offer', {
            offer: pc.localDescription?.toJSON(),
          });
        } catch (e) {
          console.error('[WebRTC] Refresh offer error:', e);
        } finally {
          makingOfferRef.current = false;
        }
      }
    } finally {
      isRebuildingRef.current = false;
    }
  }, [roomId, myUserId, opponentUserId, isPlayer1, createPeerConnection, sendReconnectSignal, supabase]);

  // ========== CONNECTION HEALTH WATCHDOG ==========
  useEffect(() => {
    if (!isMatchActive) {
      healthIssueStartedAtRef.current = null;
      return;
    }

    const interval = setInterval(() => {
      const stream = remoteStream;
      if (!stream) {
        healthIssueStartedAtRef.current = null;
        return;
      }

      const hasLiveTrack = stream
        .getTracks()
        .some((track) => track.readyState === 'live' && track.enabled);

      if (hasLiveTrack) {
        healthIssueStartedAtRef.current = null;
        return;
      }

      if (!healthIssueStartedAtRef.current) {
        healthIssueStartedAtRef.current = Date.now();
        return;
      }

      if (Date.now() - healthIssueStartedAtRef.current > 5000) {
        console.log('[WebRTC] Remote stream has no live tracks for >5s, triggering reconnect');
        healthIssueStartedAtRef.current = null;
        refreshConnection(true, true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isMatchActive, remoteStream, refreshConnection]);

  // ========== FORCE TURN RELAY ==========
  const forceTurnAndRestart = useCallback(() => {
    if (!roomId || !myUserId || !opponentUserId) return;

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    setCallStatus('connecting');
    setRemoteStream(null);

    (async () => {
      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'relay', // Force TURN only
      });

      peerConnectionRef.current = pc;

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setCallStatus('connected');
        else if (pc.connectionState === 'failed') setCallStatus('failed');
      };

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await sendSignal(roomId, myUserId, opponentUserId, 'ice', {
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        if (event.streams?.[0]) {
          setRemoteStream(event.streams[0]);
          setCallStatus('connected');
        }
      };

      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }

      if (isPlayer1) {
        try {
          makingOfferRef.current = true;
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal(roomId, myUserId, opponentUserId, 'offer', {
            offer: pc.localDescription?.toJSON(),
          });
        } catch (e) {
          console.error('[WebRTC] TURN offer error:', e);
        } finally {
          makingOfferRef.current = false;
        }
      }
    })();
  }, [roomId, myUserId, opponentUserId, isPlayer1]);

  // ========== CLEANUP ON UNMOUNT ==========
  useEffect(() => {
    return () => {
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
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
    switchCamera,
    facingMode,
  };
}
