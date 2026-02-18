'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getIceServers } from '@/lib/webrtc/ice';

interface UseATCWebRTCProps {
  matchId: string | null;
  myUserId: string | null;
  isMatchActive?: boolean;
  currentPlayerId?: string | null;
  isMyTurn?: boolean;
  allPlayerIds?: string[];
}

export function useATCWebRTC({
  matchId,
  myUserId,
  isMatchActive = true,
  currentPlayerId,
  isMyTurn = false,
  allPlayerIds = [],
}: UseATCWebRTCProps) {
  const supabase = createClient();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');

  // Store peer connections for each player
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedSignals = useRef<Set<string>>(new Set());
  const isInitiatorRef = useRef<Set<string>>(new Set());

  // Get other player IDs (excluding myself)
  const otherPlayerIds = allPlayerIds.filter(id => id !== myUserId);

  // Determine active stream based on whose turn it is
  const activePlayerId = currentPlayerId || null;
  const activeStream = isMyTurn 
    ? localStream 
    : (activePlayerId ? remoteStreams.get(activePlayerId) || null : null);

  // Update overall connection status based on all peer connections
  useEffect(() => {
    const pcs = peerConnectionsRef.current;
    if (pcs.size === 0) {
      setCallStatus('idle');
      return;
    }

    const states = Array.from(pcs.values()).map(pc => pc.connectionState);
    const hasConnected = states.some(s => s === 'connected');
    const hasConnecting = states.some(s => s === 'connecting');
    
    if (hasConnected) {
      setCallStatus('connected');
    } else if (hasConnecting) {
      setCallStatus('connecting');
    } else {
      setCallStatus('idle');
    }
  }, [remoteStreams.size]);

  console.log('[ATC Camera] Status:', {
    myUserId,
    otherPlayers: otherPlayerIds,
    isMyTurn,
    hasLocal: !!localStream,
    remoteCount: remoteStreams.size,
    activeStream: activeStream ? (isMyTurn ? 'local' : 'remote') : 'none',
    callStatus,
    peerConnections: Array.from(peerConnectionsRef.current.keys())
  });

  // Send signal to specific recipient
  const sendSignal = useCallback(async (recipientId: string, type: string, data: any) => {
    if (!matchId || !myUserId) return;
    
    console.log(`[ATC Camera] Sending ${type} to ${recipientId}`);
    
    await supabase.rpc('rpc_send_atc_signal', {
      p_match_id: matchId,
      p_recipient_id: recipientId,
      p_signal_type: type,
      p_signal_data: data
    });
  }, [matchId, myUserId, supabase]);

  // Create peer connection for a specific player
  const createPeerConnection = useCallback((playerId: string) => {
    // Return existing if already created
    if (peerConnectionsRef.current.has(playerId)) {
      console.log(`[ATC Camera] PC for ${playerId} already exists`);
      return peerConnectionsRef.current.get(playerId)!;
    }

    console.log(`[ATC Camera] Creating PC for player: ${playerId}`);
    
    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceCandidatePoolSize: 10
    });

    peerConnectionsRef.current.set(playerId, pc);

    pc.onconnectionstatechange = () => {
      console.log(`[ATC Camera] Connection state for ${playerId}:`, pc.connectionState);
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal(playerId, 'ice', { candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      console.log(`[ATC Camera] Got remote track from ${playerId}!`);
      if (e.streams?.[0]) {
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.set(playerId, e.streams[0]);
          return next;
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[ATC Camera] ICE state for ${playerId}:`, pc.iceConnectionState);
    };

    return pc;
  }, [sendSignal]);

  // Handle signals from other players
  const handleSignal = useCallback(async (signal: any) => {
    const sigId = `${signal.sender_id}-${signal.signal_type}-${signal.created_at}`;
    if (processedSignals.current.has(sigId)) return;
    processedSignals.current.add(sigId);

    const senderId = signal.sender_id;
    console.log(`[ATC Camera] Signal: ${signal.signal_type} from: ${senderId}`);

    // Create or get peer connection for this sender
    const pc = createPeerConnection(senderId);

    try {
      if (signal.signal_type === 'offer') {
        // Add local stream before answering (if available)
        if (localStreamRef.current) {
          const hasVideoTrack = pc.getSenders().some(s => s.track?.kind === 'video');
          if (!hasVideoTrack) {
            localStreamRef.current.getTracks().forEach(t => {
              pc.addTrack(t, localStreamRef.current!);
            });
          }
        }

        // Only set remote description if we're not already connected
        if (pc.signalingState !== 'stable') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(senderId, 'answer', { answer: pc.localDescription?.toJSON() });
          console.log(`[ATC Camera] Sent answer to ${senderId}`);
        } else {
          console.log(`[ATC Camera] Already in stable state, ignoring offer from ${senderId}`);
        }

      } else if (signal.signal_type === 'answer') {
        // Only set remote description if we sent an offer (we're the initiator)
        if (isInitiatorRef.current.has(senderId) && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data.answer));
          console.log(`[ATC Camera] Answer processed from ${senderId}`);
        } else {
          console.log(`[ATC Camera] Ignoring answer from ${senderId}, state: ${pc.signalingState}`);
        }

      } else if (signal.signal_type === 'ice') {
        // Only add ICE candidate if we have a remote description
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.signal_data.candidate));
        } else {
          // Queue the ICE candidate for later
          console.log(`[ATC Camera] Queuing ICE candidate from ${senderId}`);
        }
      }
    } catch (err) {
      console.error(`[ATC Camera] Signal error from ${senderId}:`, err);
    }
  }, [createPeerConnection, sendSignal]);

  // Subscribe to signals
  useEffect(() => {
    if (!matchId || !myUserId) return;

    console.log('[ATC Camera] Subscribing to signals for match:', matchId);

    const sub = supabase
      .channel(`atc-${matchId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'atc_match_signals',
        filter: `match_id=eq.${matchId}`
      }, (payload) => {
        const s = payload.new as any;
        // Only process signals from other players, not myself
        if (s.sender_id !== myUserId) {
          handleSignal(s);
        }
      })
      .subscribe();

    return () => { 
      console.log('[ATC Camera] Unsubscribing from signals');
      sub.unsubscribe(); 
    };
  }, [matchId, myUserId, handleSignal, supabase]);

  // Start camera and create connections with all other players
  const startCamera = async () => {
    try {
      console.log('[ATC Camera] Starting camera...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsCameraOn(true);

      // Create peer connections with ALL other players
      for (const playerId of otherPlayerIds) {
        // Simple initiator logic: user ID with lower string value initiates
        const isInitiator = myUserId! < playerId;
        
        if (isInitiator) {
          isInitiatorRef.current.add(playerId);
          console.log(`[ATC Camera] I am initiator for ${playerId}`);
        }

        const pc = createPeerConnection(playerId);

        // Add local tracks to peer connection
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        // If I'm the initiator, create and send offer
        if (isInitiator) {
          console.log(`[ATC Camera] Sending offer to ${playerId}...`);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal(playerId, 'offer', { offer: pc.localDescription?.toJSON() });
        }
      }

      return true;
    } catch (err) {
      console.error('[ATC Camera] Start failed:', err);
      return false;
    }
  };

  const stopCamera = () => {
    console.log('[ATC Camera] Stopping camera and closing all connections');
    
    // Stop local stream
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setIsCameraOn(false);

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc, playerId) => {
      console.log(`[ATC Camera] Closing PC for ${playerId}`);
      pc.close();
    });
    peerConnectionsRef.current.clear();
    isInitiatorRef.current.clear();
    
    // Clear remote streams
    setRemoteStreams(new Map());
    setCallStatus('idle');
  };

  const refreshCamera = async () => {
    stopCamera();
    await new Promise(r => setTimeout(r, 300));
    await startCamera();
  };

  const refreshConnection = () => {
    stopCamera();
    setTimeout(() => {
      startCamera();
    }, 500);
  };

  // Auto-start on my turn
  useEffect(() => {
    if (isMyTurn && isMatchActive && !isCameraOn) {
      startCamera();
    }
  }, [isMyTurn, isMatchActive]);

  return {
    localStream,
    remoteStreams,
    activeStream,
    activePlayerId,
    isCameraOn,
    callStatus,
    toggleCamera: async () => isCameraOn ? stopCamera() : await startCamera(),
    stopCamera,
    refreshCamera,
    refreshConnection,
    cameraError: null
  };
}
