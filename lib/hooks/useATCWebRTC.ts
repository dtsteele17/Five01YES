import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getIceServers } from '@/lib/webrtc/ice';
import { toast } from 'sonner';

export interface UseATCWebRTCProps {
  matchId: string | null;
  myUserId: string | null;
  isMatchActive?: boolean;
}

export interface UseATCWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isCameraOn: boolean;
  callStatus: 'idle' | 'connecting' | 'connected' | 'failed';
  cameraError: string | null;
  toggleCamera: () => Promise<void>;
  stopCamera: () => void;
  refreshCamera: () => Promise<void>;
  refreshConnection: () => Promise<void>;
  forceTurnAndRestart: () => void;
}

/**
 * WebRTC Hook specifically for ATC Quick Matches
 * Uses atc_matches table instead of match_rooms
 */
export function useATCWebRTC({
  matchId,
  myUserId,
  isMatchActive = true,
}: UseATCWebRTCProps): UseATCWebRTCReturn {
  const supabase = createClient();

  // State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
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
  const localStreamRef = useRef<MediaStream | null>(null);

  console.log('[ATC WebRTC] State:', { matchId, myUserId, opponentUserId, isPlayer1, callStatus });

  // ========== FETCH OPPONENT FROM ATC MATCHES ==========
  useEffect(() => {
    if (!matchId || !myUserId) return;

    const fetchOpponent = async () => {
      console.log('[ATC WebRTC] Fetching opponent from atc_matches:', matchId);
      
      const { data, error } = await supabase
        .from('atc_matches')
        .select('players')
        .eq('id', matchId)
        .maybeSingle();

      if (error) {
        console.error('[ATC WebRTC] Error fetching atc_matches:', error);
        return;
      }

      if (!data || !data.players || data.players.length < 2) {
        console.log('[ATC WebRTC] Waiting for players to join...');
        return;
      }

      // Find opponent from players array
      const players = data.players;
      const myIndex = players.findIndex((p: any) => p.id === myUserId);
      
      if (myIndex === -1) {
        console.error('[ATC WebRTC] Current user not found in players array');
        return;
      }

      setIsPlayer1(myIndex === 0);
      
      // Opponent is the other player
      const opponentIndex = myIndex === 0 ? 1 : 0;
      const opponent = players[opponentIndex];
      
      if (opponent) {
        console.log('[ATC WebRTC] Opponent found:', opponent.id, opponent.username);
        setOpponentUserId(opponent.id);
      }
    };

    fetchOpponent();
    
    // Subscribe to changes
    const channel = supabase
      .channel(`atc_match_players_${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'atc_matches',
          filter: `id=eq.${matchId}`,
        },
        () => {
          fetchOpponent();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [matchId, myUserId]);

  // ========== SIGNALING FUNCTIONS ==========
  const sendSignal = async (type: 'offer' | 'answer' | 'ice', data: any) => {
    if (!matchId || !myUserId || !opponentUserId) return;
    
    const { error } = await supabase.from('match_signals').insert({
      match_id: matchId,
      sender_id: myUserId,
      recipient_id: opponentUserId,
      signal_type: type,
      signal_data: data,
      created_at: new Date().toISOString(),
    });
    
    if (error) {
      console.error('[ATC WebRTC] Error sending signal:', error);
    }
  };

  // ========== CREATE PEER CONNECTION ==========
  useEffect(() => {
    if (!matchId || !myUserId || !opponentUserId) return;
    if (!isMatchActive) return;
    if (peerConnectionRef.current) return;

    console.log('[ATC WebRTC] Creating peer connection');

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
        console.log('[ATC WebRTC] Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setCallStatus('connected');
        } else if (pc.connectionState === 'connecting') {
          setCallStatus('connecting');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setCallStatus('failed');
          if (pc.connectionState === 'failed') {
            console.log('[ATC WebRTC] Connection failed, attempting ICE restart...');
            pc.restartIce();
          }
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[ATC WebRTC] ICE state:', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          pc.restartIce();
        }
      };

      // ICE candidate handler
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('[ATC WebRTC] Sending ICE candidate:', event.candidate.type);
          await sendSignal('ice', { candidate: event.candidate.toJSON() });
        }
      };

      // Remote track handler
      pc.ontrack = (event) => {
        console.log('[ATC WebRTC] Remote track received:', event.track.kind);
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          setCallStatus('connected');
        }
      };

      // Negotiation needed
      pc.onnegotiationneeded = async () => {
        if (!isPlayer1 || makingOfferRef.current) return;
        
        try {
          makingOfferRef.current = true;
          console.log('[ATC WebRTC] Creating offer...');
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          await sendSignal('offer', { offer: pc.localDescription?.toJSON() });
          console.log('[ATC WebRTC] Offer sent');
        } catch (error) {
          console.error('[ATC WebRTC] Error creating offer:', error);
        } finally {
          makingOfferRef.current = false;
        }
      };

    } catch (error) {
      console.error('[ATC WebRTC] Error creating peer connection:', error);
      setCameraError('Failed to initialize connection');
    }

    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, [matchId, myUserId, opponentUserId, isPlayer1, isMatchActive]);

  // ========== SIGNALING SUBSCRIPTION ==========
  useEffect(() => {
    if (!matchId || !myUserId || !opponentUserId) return;

    const handleOffer = async (offer: RTCSessionDescriptionInit) => {
      console.log('[ATC WebRTC] Received offer');
      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        const offerCollision = offer.type === 'offer' && 
          (makingOfferRef.current || pc.signalingState !== 'stable');

        ignoreOfferRef.current = isPlayer1 && offerCollision;
        if (ignoreOfferRef.current) return;

        if (localStreamRef.current) {
          const senders = pc.getSenders();
          const hasVideo = senders.some(s => s.track?.kind === 'video');
          if (!hasVideo) {
            localStreamRef.current.getTracks().forEach(track => {
              pc.addTrack(track, localStreamRef.current!);
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
              console.error('[ATC WebRTC] Error adding pending ICE:', error);
            }
          }
          pendingIceCandidatesRef.current = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal('answer', { answer: pc.localDescription?.toJSON() });
        console.log('[ATC WebRTC] Answer sent');

      } catch (error) {
        console.error('[ATC WebRTC] Error handling offer:', error);
      }
    };

    const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
      const pc = peerConnectionRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        
        if (pendingIceCandidatesRef.current.length > 0) {
          for (const candidate of pendingIceCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
              console.error('[ATC WebRTC] Error adding pending ICE:', error);
            }
          }
          pendingIceCandidatesRef.current = [];
        }
      } catch (error) {
        console.error('[ATC WebRTC] Error handling answer:', error);
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
        console.error('[ATC WebRTC] Error adding ICE candidate:', error);
      }
    };

    console.log('[ATC WebRTC] Setting up signal subscription...');

    // Subscribe to signals from match_signals table
    const subscription = supabase
      .channel(`atc_signals_${matchId}_${myUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_signals',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const signal = payload.new;
          if (signal.recipient_id !== myUserId) return;
          
          console.log('[ATC WebRTC] Received signal:', signal.signal_type);
          
          if (signal.signal_type === 'offer') {
            handleOffer(signal.signal_data.offer);
          } else if (signal.signal_type === 'answer') {
            handleAnswer(signal.signal_data.answer);
          } else if (signal.signal_type === 'ice') {
            handleIce(signal.signal_data.candidate);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [matchId, myUserId, opponentUserId, isPlayer1]);

  // ========== ADD TRACKS AND CREATE OFFER ==========
  useEffect(() => {
    if (!localStreamRef.current || !peerConnectionRef.current) return;

    const pc = peerConnectionRef.current;
    const senders = pc.getSenders();
    const hasVideo = senders.some(s => s.track?.kind === 'video');
    
    if (!hasVideo) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log('[ATC WebRTC] Adding track:', track.kind);
        pc.addTrack(track, localStreamRef.current!);
      });
      
      if (isPlayer1) {
        console.log('[ATC WebRTC] Player 1 creating offer after adding tracks...');
        (async () => {
          try {
            makingOfferRef.current = true;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal('offer', { offer: pc.localDescription?.toJSON() });
            console.log('[ATC WebRTC] Offer sent to Player 2');
          } catch (err) {
            console.error('[ATC WebRTC] Error creating offer:', err);
          } finally {
            makingOfferRef.current = false;
          }
        })();
      }
    }
  }, [isPlayer1, localStream]);

  // ========== CAMERA CONTROLS ==========
  const toggleCamera = async () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      await startCamera();
    }
  };

  const startCamera = async () => {
    try {
      console.log('[ATC WebRTC] Starting camera');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false 
      });
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsCameraOn(true);
      setCameraError(null);
      console.log('[ATC WebRTC] Camera stream obtained');
    } catch (err) {
      console.error('[ATC WebRTC] Could not access camera:', err);
      setCameraError('Could not access camera');
      toast.error('Could not access camera');
    }
  };

  const stopCamera = () => {
    console.log('[ATC WebRTC] Stopping camera');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setIsCameraOn(false);
  };

  const refreshCamera = async () => {
    console.log('[ATC WebRTC] Refreshing camera...');
    stopCamera();
    await new Promise(resolve => setTimeout(resolve, 300));
    await startCamera();
  };

  const refreshConnection = async () => {
    console.log('[ATC WebRTC] Refreshing connection...');
    
    if (!matchId || !myUserId || !opponentUserId) {
      console.error('[ATC WebRTC] Cannot refresh - missing required IDs');
      return;
    }

    // Close existing connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Clear remote stream
    setRemoteStream(null);
    setCallStatus('idle');

    // Restart camera if it was on
    if (isCameraOn) {
      await refreshCamera();
    }

    // Trigger reconnection by clearing opponent and fetching again
    setOpponentUserId(null);
    
    // Re-fetch opponent
    const { data } = await supabase
      .from('atc_matches')
      .select('players')
      .eq('id', matchId)
      .maybeSingle();

    if (data && data.players) {
      const players = data.players;
      const myIndex = players.findIndex((p: any) => p.id === myUserId);
      if (myIndex !== -1) {
        setIsPlayer1(myIndex === 0);
        const opponentIndex = myIndex === 0 ? 1 : 0;
        const opponent = players[opponentIndex];
        if (opponent) {
          setOpponentUserId(opponent.id);
        }
      }
    }
  };

  const forceTurnAndRestart = () => {
    console.log('[ATC WebRTC] Forcing TURN relay and restarting connection');
    refreshConnection();
  };

  return {
    localStream,
    remoteStream,
    isCameraOn,
    callStatus,
    cameraError,
    toggleCamera,
    stopCamera,
    refreshCamera,
    refreshConnection,
    forceTurnAndRestart,
  };
}
