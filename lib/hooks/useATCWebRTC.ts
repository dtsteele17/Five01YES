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
  const pendingSignals = useRef<Map<string, any[]>>(new Map());

  // Get other player IDs
  const otherPlayerIds = allPlayerIds.filter(id => id !== myUserId);

  // Determine active stream
  const activePlayerId = currentPlayerId || null;
  const activeStream = isMyTurn 
    ? localStream 
    : (activePlayerId ? remoteStreams.get(activePlayerId) || null : null);

  // Send signal to specific recipient
  const sendSignal = useCallback(async (recipientId: string, type: string, data: any) => {
    if (!matchId || !myUserId) return;
    await supabase.rpc('rpc_send_atc_signal', {
      p_match_id: matchId,
      p_recipient_id: recipientId,
      p_signal_type: type,
      p_signal_data: data
    });
  }, [matchId, myUserId, supabase]);

  // Create peer connection
  const createPeerConnection = useCallback((playerId: string) => {
    if (peerConnectionsRef.current.has(playerId)) {
      const existing = peerConnectionsRef.current.get(playerId)!;
      if (existing.connectionState !== 'closed' && existing.connectionState !== 'failed') {
        return existing;
      }
      // Close failed connection and create new one
      existing.close();
    }

    console.log(`[ATC Camera] Creating new PC for ${playerId}`);
    
    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceCandidatePoolSize: 10
    });

    peerConnectionsRef.current.set(playerId, pc);

    pc.onconnectionstatechange = () => {
      console.log(`[ATC Camera] Connection ${playerId}: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal(playerId, 'ice', { candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      console.log(`[ATC Camera] Got stream from ${playerId}`);
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

  // Process pending signals for a player
  const processPendingSignals = useCallback(async (playerId: string) => {
    const pc = peerConnectionsRef.current.get(playerId);
    if (!pc) return;

    const pending = pendingSignals.current.get(playerId) || [];
    pendingSignals.current.delete(playerId);

    for (const signal of pending) {
      try {
        if (signal.signal_type === 'ice' && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.signal_data.candidate));
        }
      } catch (err) {
        console.error(`[ATC Camera] Error processing pending signal:`, err);
      }
    }
  }, []);

  // Handle signals
  const handleSignal = useCallback(async (signal: any) => {
    const senderId = signal.sender_id;
    const sigId = `${senderId}-${signal.signal_type}-${signal.created_at}`;
    
    if (processedSignals.current.has(sigId)) return;
    processedSignals.current.add(sigId);

    console.log(`[ATC Camera] ${signal.signal_type} from ${senderId}`);

    const pc = createPeerConnection(senderId);

    try {
      if (signal.signal_type === 'offer') {
        // Only process if we haven't already set remote description for this offer
        if (pc.signalingState === 'stable') {
          // Add local stream
          if (localStreamRef.current) {
            const senders = pc.getSenders();
            localStreamRef.current.getTracks().forEach(track => {
              if (!senders.find(s => s.track === track)) {
                pc.addTrack(track, localStreamRef.current!);
              }
            });
          }

          await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(senderId, 'answer', { answer: pc.localDescription?.toJSON() });
          
          // Process any pending ICE candidates
          await processPendingSignals(senderId);
        }

      } else if (signal.signal_type === 'answer') {
        // Only set answer if we're expecting one
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data.answer));
          await processPendingSignals(senderId);
        }

      } else if (signal.signal_type === 'ice') {
        // Queue ICE if no remote description yet
        if (!pc.remoteDescription) {
          if (!pendingSignals.current.has(senderId)) {
            pendingSignals.current.set(senderId, []);
          }
          pendingSignals.current.get(senderId)!.push(signal);
        } else {
          await pc.addIceCandidate(new RTCIceCandidate(signal.signal_data.candidate));
        }
      }
    } catch (err) {
      console.error(`[ATC Camera] Signal error:`, err);
    }
  }, [createPeerConnection, sendSignal, processPendingSignals]);

  // Subscribe to signals
  useEffect(() => {
    if (!matchId || !myUserId) return;

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
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();
      pendingSignals.current.clear();
    };
  }, [matchId, myUserId, handleSignal, supabase]);

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsCameraOn(true);

      // Connect to all other players
      for (const playerId of otherPlayerIds) {
        const pc = createPeerConnection(playerId);
        
        // Add tracks
        stream.getTracks().forEach(track => {
          if (!pc.getSenders().find(s => s.track === track)) {
            pc.addTrack(track, stream);
          }
        });

        // Determine who initiates (lower ID initiates)
        if (myUserId! < playerId) {
          console.log(`[ATC Camera] Initiating to ${playerId}`);
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
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setIsCameraOn(false);

    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    pendingSignals.current.clear();
    
    setRemoteStreams(new Map());
    setCallStatus('idle');
  };

  const refreshCamera = async () => {
    stopCamera();
    await new Promise(r => setTimeout(r, 300));
    await startCamera();
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
    refreshConnection: refreshCamera,
    cameraError: null
  };
}
