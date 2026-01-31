import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface UseMatchWebRTCProps {
  roomId: string | null;
  myUserId: string | null;
  isMyTurn: boolean; // Only for UI display, does NOT gate signaling
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
 * Unified WebRTC hook for Quick Match camera streaming
 *
 * Works for ALL match formats (Best-of-1, 3, 5, 7)
 * Uses public.match_call_signals table for signaling
 * Xirsys ICE servers for STUN/TURN
 *
 * State Machine:
 * 1. Fetch ICE servers
 * 2. Fetch match_rooms row to compute opponent
 * 3. Create RTCPeerConnection
 * 4. Subscribe to realtime signals
 * 5. Begin negotiation (impolite peer sends offer)
 *
 * Signaling Prerequisites: roomId, myUserId, opponentUserId
 * NO gating on isMyTurn or match status - negotiation happens independently
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
  const [iceServers, setIceServers] = useState<RTCIceServer[] | null>(null);
  const [opponentUserId, setOpponentUserId] = useState<string | null>(null);

  // Refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const iceServersFetchedRef = useRef(false);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const isPoliteRef = useRef(false);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const videoSenderRef = useRef<RTCRtpSender | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  console.log('[WEBRTC HOOK] Render with:', {
    roomId,
    myUserId,
    opponentUserId,
    isMyTurn: isMyTurn ? 'ME' : 'OPPONENT'
  });

  // ========== FETCH OPPONENT FROM MATCH_ROOMS ==========
  useEffect(() => {
    if (!roomId || !myUserId) {
      console.log('[WEBRTC HOOK] Waiting for roomId and myUserId');
      return;
    }

    const fetchOpponent = async () => {
      console.log('[WEBRTC HOOK] ========== FETCHING OPPONENT ==========');
      console.log('[WEBRTC HOOK] Room ID:', roomId);
      console.log('[WEBRTC HOOK] My User ID:', myUserId);

      try {
        const { data, error } = await supabase
          .from('match_rooms')
          .select('player1_id, player2_id')
          .eq('id', roomId)
          .single();

        if (error) {
          console.error('[WEBRTC HOOK] ❌ Error fetching match_rooms:', error);
          return;
        }

        if (!data) {
          console.error('[WEBRTC HOOK] ❌ No match_rooms data found');
          return;
        }

        console.log('[WEBRTC HOOK] Match room data:', {
          player1_id: data.player1_id,
          player2_id: data.player2_id
        });

        // Compute opponent
        const opponent = myUserId === data.player1_id ? data.player2_id : data.player1_id;

        if (!opponent) {
          console.warn('[WEBRTC HOOK] ⚠️ No opponent yet (player2 not joined)');
          setOpponentUserId(null);
          return;
        }

        console.log('[WEBRTC HOOK] ✅ Opponent resolved:', opponent);
        setOpponentUserId(opponent);

      } catch (err) {
        console.error('[WEBRTC HOOK] ❌ Exception fetching opponent:', err);
      }
    };

    fetchOpponent();
  }, [roomId, myUserId]);

  // ========== VIDEO DISPLAY SWITCHING ==========
  // Updates video element based on whose turn it is (UI ONLY)
  useEffect(() => {
    if (!liveVideoRef.current) return;

    const liveStreamToShow = isMyTurn ? localStream : remoteStream;
    const turnLabel = isMyTurn ? 'ME' : 'OPPONENT';

    console.log('[WEBRTC HOOK] Video display - Turn:', turnLabel, 'Stream:', liveStreamToShow ? 'YES' : 'NO');

    if (!isMyTurn && remoteStream) {
      console.log('[WEBRTC HOOK] 👤 Opponent turn - showing remote stream');
    }

    if (liveStreamToShow) {
      liveVideoRef.current.srcObject = liveStreamToShow;
      liveVideoRef.current.muted = isMyTurn;
      liveVideoRef.current.autoplay = true;
      liveVideoRef.current.playsInline = true;
      liveVideoRef.current.play().catch((err) => {
        console.error('[WEBRTC HOOK] Error playing video:', err);
      });
    } else {
      liveVideoRef.current.srcObject = null;
    }
  }, [isMyTurn, localStream, remoteStream]);

  // ========== FETCH XIRSYS ICE SERVERS ==========
  useEffect(() => {
    if (!roomId || iceServersFetchedRef.current) return;

    const fetchIceServers = async () => {
      console.log('[WEBRTC HOOK] ========== FETCHING XIRSYS ICE SERVERS ==========');

      try {
        const res = await fetch('/api/turn');
        const data = await res.json();

        if (data.iceServers && data.iceServers.length > 0) {
          console.log('[WEBRTC HOOK] ✅ Xirsys ICE servers received:', data.iceServers.length);
          setIceServers(data.iceServers);
          iceServersFetchedRef.current = true;
        } else {
          console.warn('[WEBRTC HOOK] ⚠️ No ICE servers in response, using default STUN');
          setIceServers([{ urls: 'stun:stun.l.google.com:19302' }]);
          iceServersFetchedRef.current = true;
        }
      } catch (error) {
        console.error('[WEBRTC HOOK] ❌ Error fetching ICE servers:', error);
        setIceServers([{ urls: 'stun:stun.l.google.com:19302' }]);
        iceServersFetchedRef.current = true;
      }
    };

    fetchIceServers();
  }, [roomId]);

  // ========== CREATE PEER CONNECTION ==========
  useEffect(() => {
    // Prerequisites check
    if (!roomId) {
      console.log('[WEBRTC HOOK] Waiting for roomId');
      return;
    }
    if (!myUserId) {
      console.log('[WEBRTC HOOK] Waiting for myUserId');
      return;
    }
    if (!opponentUserId) {
      console.log('[WEBRTC HOOK] Waiting for opponentUserId');
      return;
    }
    if (!iceServers) {
      console.log('[WEBRTC HOOK] Waiting for iceServers');
      return;
    }

    // Only create once
    if (peerConnectionRef.current) {
      console.log('[WEBRTC HOOK] Peer connection already exists');
      return;
    }

    console.log('[WEBRTC HOOK] ========== CREATING PEER CONNECTION ==========');
    console.log('[WEBRTC HOOK] Prerequisites resolved:', {
      roomId,
      myUserId,
      opponentUserId
    });

    // Determine polite peer (player with larger UUID is polite)
    const isPolite = myUserId > opponentUserId;
    isPoliteRef.current = isPolite;
    console.log('[WEBRTC HOOK] I am', isPolite ? 'POLITE' : 'IMPOLITE', 'peer');

    try {
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10
      });

      peerConnectionRef.current = pc;
      console.log('[WEBRTC HOOK] ✅ RTCPeerConnection created');

      // Add stable transceivers for perfect negotiation
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      pc.addTransceiver('video', { direction: 'sendrecv' });
      console.log('[WEBRTC HOOK] ✅ Transceivers added (audio, video)');

      // Perfect negotiation - onnegotiationneeded
      pc.onnegotiationneeded = async () => {
        console.log('[WEBRTC HOOK] 🔄 NEGOTIATION NEEDED');

        // Prerequisites check before sending offer
        if (!roomId || !myUserId || !opponentUserId) {
          console.error('[WEBRTC HOOK] ❌ Cannot negotiate - missing prerequisites:', {
            roomId: !!roomId,
            myUserId: !!myUserId,
            opponentUserId: !!opponentUserId
          });
          return;
        }

        try {
          makingOfferRef.current = true;
          console.log('[WEBRTC HOOK] Creating offer...');

          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') {
            console.log('[WEBRTC HOOK] Signaling state changed during offer creation, aborting');
            return;
          }

          await pc.setLocalDescription(offer);
          console.log('[WEBRTC HOOK] ✅ Local description set (offer)');

          // Send offer via match_call_signals
          await sendSignal('offer', { offer: pc.localDescription });
          console.log('[WEBRTC HOOK] ✅ Offer sent to opponent');
        } catch (error) {
          console.error('[WEBRTC HOOK] ❌ Error in negotiation:', error);
        } finally {
          makingOfferRef.current = false;
        }
      };

      // Remote track handler
      pc.ontrack = (event) => {
        console.log('[WEBRTC HOOK] ========== ONTRACK FIRED ==========');
        console.log('[WEBRTC HOOK] Track received from opponent');
        console.log('[WEBRTC HOOK] Track kind:', event.track.kind);
        console.log('[WEBRTC HOOK] Track readyState:', event.track.readyState);
        console.log('[WEBRTC HOOK] Track enabled:', event.track.enabled);

        // Build stable remoteStream
        if (!remoteStreamRef.current) {
          console.log('[WEBRTC HOOK] Creating new MediaStream for remote tracks');
          remoteStreamRef.current = new MediaStream();
        }

        remoteStreamRef.current.addTrack(event.track);
        console.log('[WEBRTC HOOK] ✅ Track added to remoteStream');
        console.log('[WEBRTC HOOK] Total remote tracks now:', remoteStreamRef.current.getTracks().length);

        // Update state
        setRemoteStream(remoteStreamRef.current);
        console.log('[WEBRTC HOOK] ✅ remoteStream state updated');
      };

      // Connection state handler
      pc.onconnectionstatechange = () => {
        console.log('[WEBRTC HOOK] 🌐 connectionState:', pc.connectionState);

        if (pc.connectionState === 'connected') {
          setCallStatus('connected');
          console.log('[WEBRTC HOOK] ✅ PEER CONNECTION ESTABLISHED');
        } else if (pc.connectionState === 'connecting') {
          setCallStatus('connecting');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          console.error('[WEBRTC HOOK] ❌ Connection failed/disconnected');
          setCallStatus('idle');
        }
      };

      // ICE connection state handler
      pc.oniceconnectionstatechange = () => {
        console.log('[WEBRTC HOOK] 🧊 iceConnectionState:', pc.iceConnectionState);
      };

      // ICE candidate handler
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('[WEBRTC HOOK] 🧊 Local ICE candidate generated:', event.candidate.type);

          // Prerequisites check before sending ICE
          if (roomId && myUserId && opponentUserId) {
            await sendSignal('ice', { candidate: event.candidate });
            console.log('[WEBRTC HOOK] ✅ ICE candidate sent to opponent');
          } else {
            console.warn('[WEBRTC HOOK] ⚠️ Cannot send ICE - prerequisites missing');
          }
        } else {
          console.log('[WEBRTC HOOK] 🧊 All ICE candidates generated');
        }
      };

      console.log('[WEBRTC HOOK] ✅ Peer connection setup complete');

    } catch (error) {
      console.error('[WEBRTC HOOK] ❌ Error creating peer connection:', error);
      setCameraError('Failed to initialize connection');
    }

    // Cleanup on unmount
    return () => {
      console.log('[WEBRTC HOOK] ========== PEER CONNECTION CLEANUP ==========');
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
        console.log('[WEBRTC HOOK] Peer connection closed');
      }
    };
  }, [roomId, myUserId, opponentUserId, iceServers]);

  // ========== SIGNALING SUBSCRIPTION ==========
  useEffect(() => {
    // Prerequisites check
    if (!roomId) {
      console.log('[WEBRTC HOOK] Subscription waiting for roomId');
      return;
    }
    if (!myUserId) {
      console.log('[WEBRTC HOOK] Subscription waiting for myUserId');
      return;
    }
    if (!opponentUserId) {
      console.log('[WEBRTC HOOK] Subscription waiting for opponentUserId');
      return;
    }

    console.log('[WEBRTC HOOK] ========== SUBSCRIPTION SETUP ==========');
    console.log('[WEBRTC HOOK] Creating subscription for room:', roomId);
    console.log('[WEBRTC HOOK] My user ID:', myUserId);
    console.log('[WEBRTC HOOK] Opponent ID:', opponentUserId);
    console.log('[WEBRTC HOOK] Filter: room_id=eq.' + roomId + ',to_user=eq.' + myUserId);

    const callSignalChannel = supabase
      .channel(`call_signals:${roomId}:${myUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "match_call_signals",
          filter: `room_id=eq.${roomId},to_user=eq.${myUserId}`,
        },
        async (payload) => {
          const signal = payload.new as any;

          console.log('[WEBRTC HOOK] ========== SIGNAL RECEIVED ==========');
          console.log('[WEBRTC HOOK] Type:', signal.type);
          console.log('[WEBRTC HOOK] From:', signal.from_user);
          console.log('[WEBRTC HOOK] To:', signal.to_user);
          console.log('[WEBRTC HOOK] Room:', signal.room_id);

          // Safety checks
          if (signal.from_user === myUserId) {
            console.warn('[WEBRTC HOOK] WARNING: Received own signal');
            return;
          }

          if (signal.room_id !== roomId) {
            console.warn('[WEBRTC HOOK] WARNING: Signal for wrong room');
            return;
          }

          if (signal.to_user !== myUserId) {
            console.warn('[WEBRTC HOOK] WARNING: Signal for wrong user');
            return;
          }

          console.log('[WEBRTC HOOK] Signal validation passed, processing...');

          try {
            switch (signal.type) {
              case 'offer':
                console.log('[WEBRTC HOOK] Processing OFFER');
                await handleOffer(signal.payload.offer);
                break;
              case 'answer':
                console.log('[WEBRTC HOOK] Processing ANSWER');
                await handleAnswer(signal.payload.answer);
                break;
              case 'ice':
                console.log('[WEBRTC HOOK] Processing ICE candidate');
                await handleIceCandidate(signal.payload.candidate);
                break;
              case 'hangup':
                console.log('[WEBRTC HOOK] Received HANGUP');
                if (signal.payload.reason === 'match_ended' || signal.payload.reason === 'user_left' || signal.payload.reason === 'forfeit') {
                  stopCamera(`opponent ${signal.payload.reason || 'hung up'}`);
                }
                break;
              default:
                console.log('[WEBRTC HOOK] Ignoring signal type:', signal.type);
                break;
            }
          } catch (error) {
            console.error('[WEBRTC HOOK] ========== ERROR PROCESSING SIGNAL ==========');
            console.error('[WEBRTC HOOK] Signal type:', signal.type);
            console.error('[WEBRTC HOOK] Error:', error);
          }
        }
      )
      .subscribe((status) => {
        console.log('[WEBRTC HOOK] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('[WEBRTC HOOK] ✅ Successfully subscribed to match_call_signals');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[WEBRTC HOOK] ❌ Subscription error');
        } else if (status === 'TIMED_OUT') {
          console.error('[WEBRTC HOOK] ❌ Subscription timed out');
        }
      });

    return () => {
      console.log('[WEBRTC HOOK] ========== SUBSCRIPTION CLEANUP ==========');
      console.log('[WEBRTC HOOK] Removing channel for room:', roomId);
      supabase.removeChannel(callSignalChannel);
    };
  }, [roomId, myUserId, opponentUserId]);

  // ========== SIGNAL SENDING ==========
  const sendSignal = async (type: string, payload: any) => {
    // Prerequisites check with detailed logging
    console.log('[WEBRTC HOOK] ========== SEND SIGNAL ==========');
    console.log('[WEBRTC HOOK] Type:', type);
    console.log('[WEBRTC HOOK] Prerequisites check:', {
      roomId: roomId || 'MISSING',
      myUserId: myUserId || 'MISSING',
      opponentUserId: opponentUserId || 'MISSING'
    });

    if (!roomId) {
      console.error('[WEBRTC HOOK] ❌ Cannot send signal: roomId is missing');
      return;
    }

    if (!myUserId) {
      console.error('[WEBRTC HOOK] ❌ Cannot send signal: myUserId is missing');
      return;
    }

    if (!opponentUserId) {
      console.error('[WEBRTC HOOK] ❌ Cannot send signal: opponentUserId is missing');
      return;
    }

    const signalData = {
      room_id: roomId,
      from_user: myUserId,
      to_user: opponentUserId,
      type,
      payload
    };

    console.log('[WEBRTC HOOK] 📤 Inserting into match_call_signals:', {
      room_id: roomId,
      from_user: myUserId,
      to_user: opponentUserId,
      type
    });

    try {
      const { error } = await supabase.from('match_call_signals').insert(signalData);

      if (error) {
        console.error('[WEBRTC HOOK] ❌ Error sending signal:', error);
      } else {
        console.log('[WEBRTC HOOK] ✅ Signal sent successfully');
      }
    } catch (error) {
      console.error('[WEBRTC HOOK] ❌ Exception sending signal:', error);
    }
  };

  // ========== SIGNAL HANDLERS ==========
  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    console.log('[WEBRTC HOOK] 📥 Processing OFFER');

    const pc = peerConnectionRef.current;
    if (!pc) {
      console.error('[WEBRTC HOOK] ❌ No peer connection');
      return;
    }

    try {
      // Perfect negotiation: detect offer collision
      const offerCollision =
        offer.type === 'offer' &&
        (makingOfferRef.current || pc.signalingState !== 'stable');

      console.log('[WEBRTC HOOK] Collision check:', {
        offerCollision,
        makingOffer: makingOfferRef.current,
        signalingState: pc.signalingState,
        isPolite: isPoliteRef.current
      });

      ignoreOfferRef.current = !isPoliteRef.current && offerCollision;

      if (ignoreOfferRef.current) {
        console.log('[WEBRTC HOOK] ⛔ Ignoring offer (impolite peer in collision)');
        return;
      }

      console.log('[WEBRTC HOOK] Setting remote description (offer)');
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('[WEBRTC HOOK] ✅ Remote description set');

      // Process pending ICE candidates
      if (pendingIceCandidatesRef.current.length > 0) {
        console.log('[WEBRTC HOOK] Processing', pendingIceCandidatesRef.current.length, 'pending ICE candidates');
        for (const candidate of pendingIceCandidatesRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (error) {
            console.error('[WEBRTC HOOK] Error adding pending ICE candidate:', error);
          }
        }
        pendingIceCandidatesRef.current = [];
      }

      // Create and send answer
      console.log('[WEBRTC HOOK] Creating answer');
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[WEBRTC HOOK] ✅ Local description set (answer)');

      await sendSignal('answer', { answer: pc.localDescription });
      console.log('[WEBRTC HOOK] ✅ Answer sent');

    } catch (error) {
      console.error('[WEBRTC HOOK] ❌ Error handling offer:', error);
    }
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    console.log('[WEBRTC HOOK] 📥 Processing ANSWER');

    const pc = peerConnectionRef.current;
    if (!pc) {
      console.error('[WEBRTC HOOK] ❌ No peer connection');
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('[WEBRTC HOOK] ✅ Answer applied');

      // Process pending ICE candidates
      if (pendingIceCandidatesRef.current.length > 0) {
        console.log('[WEBRTC HOOK] Processing', pendingIceCandidatesRef.current.length, 'pending ICE candidates');
        for (const candidate of pendingIceCandidatesRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (error) {
            console.error('[WEBRTC HOOK] Error adding pending ICE candidate:', error);
          }
        }
        pendingIceCandidatesRef.current = [];
      }
    } catch (error) {
      console.error('[WEBRTC HOOK] ❌ Error handling answer:', error);
    }
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    console.log('[WEBRTC HOOK] 🧊 Processing ICE candidate');

    if (!peerConnectionRef.current) {
      console.warn('[WEBRTC HOOK] No PC yet, queueing ICE candidate');
      pendingIceCandidatesRef.current.push(candidate);
      return;
    }

    if (!peerConnectionRef.current.remoteDescription) {
      console.warn('[WEBRTC HOOK] Remote description not set yet, queueing ICE candidate');
      pendingIceCandidatesRef.current.push(candidate);
      return;
    }

    try {
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('[WEBRTC HOOK] ✅ ICE candidate added');
    } catch (error) {
      console.error('[WEBRTC HOOK] ❌ Error adding ICE candidate:', error);
    }
  };

  // ========== CAMERA CONTROLS ==========
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      console.log('[WEBRTC HOOK] 📹 User toggling camera OFF');
      stopCamera('user turned off camera');
    } else {
      console.log('[WEBRTC HOOK] 📹 User toggling camera ON');
      await startCamera();
    }
  }, [isCameraOn]);

  const startCamera = async () => {
    console.log('[WEBRTC HOOK] ========== START CAMERA ==========');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true
      });

      console.log('[WEBRTC HOOK] ✅ Camera stream obtained');
      console.log('[WEBRTC HOOK] Tracks:', stream.getTracks().map(t => ({ kind: t.kind, enabled: t.enabled })));

      setLocalStream(stream);
      setIsCameraOn(true);
      setCameraError(null);

      // Add tracks to peer connection
      const pc = peerConnectionRef.current;
      if (pc) {
        const videoTrack = stream.getVideoTracks()[0];
        const audioTrack = stream.getAudioTracks()[0];

        if (videoTrack) {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(videoTrack);
            videoSenderRef.current = sender;
            console.log('[WEBRTC HOOK] ✅ Video track added/replaced');
          }
        }

        if (audioTrack) {
          const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
          if (sender) {
            await sender.replaceTrack(audioTrack);
            audioSenderRef.current = sender;
            console.log('[WEBRTC HOOK] ✅ Audio track added/replaced');
          }
        }

        // Send camera state
        if (roomId && myUserId && opponentUserId) {
          await sendSignal('state', { camera: true });
        }
      }

    } catch (error: any) {
      console.error('[WEBRTC HOOK] ❌ Error starting camera:', error);
      setCameraError(error.message || 'Failed to access camera');
      setIsCameraOn(false);
    }
  };

  const stopCamera = useCallback((reason?: string) => {
    console.log('[WEBRTC HOOK] ========== STOP CAMERA ==========');
    console.log('[WEBRTC HOOK] Reason:', reason || 'user request');

    if (localStream) {
      localStream.getTracks().forEach(track => {
        track.stop();
        console.log('[WEBRTC HOOK] Stopped track:', track.kind);
      });
      setLocalStream(null);
    }

    setIsCameraOn(false);
    setCallStatus('idle');

    // Send camera state
    if (opponentUserId && roomId && myUserId) {
      sendSignal('state', { camera: false });
    }

    console.log('[WEBRTC HOOK] Camera stopped, keeping peer connection alive');
  }, [localStream, opponentUserId, roomId, myUserId]);

  const toggleMic = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);
        console.log('[WEBRTC HOOK] 🎤 Mic', audioTrack.enabled ? 'unmuted' : 'muted');
      }
    }
  }, [localStream]);

  const toggleVideo = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoDisabled(!videoTrack.enabled);
        console.log('[WEBRTC HOOK] 📹 Video', videoTrack.enabled ? 'enabled' : 'disabled');
      }
    }
  }, [localStream]);

  // ========== CLEANUP ON UNMOUNT ==========
  useEffect(() => {
    return () => {
      console.log('[WEBRTC HOOK] Component unmounting, cleaning up');
      stopCamera('component unmount');
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
