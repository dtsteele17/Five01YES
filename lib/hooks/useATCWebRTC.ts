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

  // Store peer connections for each player (key = player ID)
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedSignals = useRef<Set<string>>(new Set());
  const isInitiatorRef = useRef<Map<string, boolean>>(new Map());

  // Get all other player IDs (excluding myself)
  const otherPlayerIds = allPlayerIds.filter(id => id !== myUserId);

  // Determine which stream to display
  // If it's my turn, show local stream. Otherwise show the current player's stream
  const activePlayerId = currentPlayerId || null;
  const activeStream = isMyTurn 
    ? localStream 
    : (activePlayerId ? remoteStreams.get(activePlayerId) || null : null);

  console.log('[ATC Camera] Status:', {
    myUserId,
    otherPlayers: otherPlayerIds,
    isMyTurn,
    hasLocal: !!localStream,
    remoteCount: remoteStreams.size,
    remotePlayers: Array.from(remoteStreams.keys()),
    activeStream: activeStream ? (isMyTurn ? 'local' : 'remote') : 'none',
    activePlayerId,
    callStatus
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
    if (peerConnectionsRef.current.has(playerId)) {
      console.log(`[ATC Camera] Using existing PC for ${playerId}`);
      return peerConnectionsRef.current.get(playerId)!;
    }

    console.log(`[ATC Camera] Creating new PC for player: ${playerId}`);
    
    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceCandidatePoolSize: 10
    });

    peerConnectionsRef.current.set(playerId, pc);

    pc.onconnectionstatechange = () => {
      console.log(`[ATC Camera] Connection state for ${playerId}:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        // Remove failed connection
        peerConnectionsRef.current.delete(playerId);
      }
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

    return pc;
  }, [sendSignal]);

  // Handle signals from other players
  const handleSignal = useCallback(async (signal: any) => {
    const senderId = signal.sender_id;
    const sigId = `${senderId}-${signal.signal_type}-${signal.created_at}`;
    
    if (processedSignals.current.has(sigId)) return;
    processedSignals.current.add(sigId);

    console.log(`[ATC Camera] Processing ${signal.signal_type} from ${senderId}`);

    // Create or get peer connection for this sender
    const pc = createPeerConnection(senderId);

    try {
      if (signal.signal_type === 'offer') {
        // Add local stream before answering
        if (localStreamRef.current) {
          const hasVideoTrack = pc.getSenders().some(s => s.track?.kind === 'video');
          if (!hasVideoTrack) {
            localStreamRef.current.getTracks().forEach(t => {
              pc.addTrack(t, localStreamRef.current!);
            });
          }
        }

        // Only process if we're in the right state
        if (pc.signalingState === 'stable' || pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(senderId, 'answer', { answer: pc.localDescription?.toJSON() });
          console.log(`[ATC Camera] Sent answer to ${senderId}`);
        }

      } else if (signal.signal_type === 'answer') {
        // Only process if we sent an offer
        if (isInitiatorRef.current.get(senderId) && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data.answer));
          console.log(`[ATC Camera] Answer processed from ${senderId}`);
        }

      } else if (signal.signal_type === 'ice') {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.signal_data.candidate));
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
        if (s.sender_id !== myUserId) {
          handleSignal(s);
        }
      })
      .subscribe();

    return () => { 
      sub.unsubscribe();
      // Clean up all peer connections
      peerConnectionsRef.current.forEach((pc, id) => {
        console.log(`[ATC Camera] Closing PC for ${id}`);
        pc.close();
      });
      peerConnectionsRef.current.clear();
    };
  }, [matchId, myUserId, handleSignal, supabase]);

  // Start camera and connect to all other players
  const startCamera = async () => {
    try {
      console.log('[ATC Camera] Starting camera and connecting to all players...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsCameraOn(true);

      // Connect to ALL other players
      for (const playerId of otherPlayerIds) {
        // Determine initiator based on user ID comparison
        const isInitiator = myUserId! < playerId;
        isInitiatorRef.current.set(playerId, isInitiator);

        const pc = createPeerConnection(playerId);

        // Add local tracks
        stream.getTracks().forEach(t => pc.addTrack(t, stream));

        // If initiator, send offer
        if (isInitiator) {
          console.log(`[ATC Camera] Sending offer to ${playerId}...`);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal(playerId, 'offer', { offer: pc.localDescription?.toJSON() });
        } else {
          console.log(`[ATC Camera] Waiting for offer from ${playerId}...`);
        }
      }

      return true;
    } catch (err) {
      console.error('[ATC Camera] Start failed:', err);
      return false;
    }
  };

  const stopCamera = () => {
    console.log('[ATC Camera] Stopping camera and closing connections');
    
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setIsCameraOn(false);

    // Close all peer connections
    peerConnectionsRef.current.forEach((pc, id) => {
      console.log(`[ATC Camera] Closing PC for ${id}`);
      pc.close();
    });
    peerConnectionsRef.current.clear();
    isInitiatorRef.current.clear();
    
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
    setTimeout(() => startCamera(), 500);
  };

  // Auto-start camera on my turn
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
