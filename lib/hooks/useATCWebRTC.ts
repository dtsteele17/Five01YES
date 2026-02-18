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
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected'>('idle');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedSignals = useRef<Set<string>>(new Set());
  const otherPlayerId = useRef<string | null>(null);

  // Get the other player's ID (simplified for 2 players)
  useEffect(() => {
    if (allPlayerIds.length >= 2 && myUserId) {
      otherPlayerId.current = allPlayerIds.find(id => id !== myUserId) || null;
      console.log('[ATC Camera] Other player:', otherPlayerId.current);
    }
  }, [allPlayerIds, myUserId]);

  // Determine active stream
  const activePlayerId = currentPlayerId || null;
  const activeStream = isMyTurn ? localStream : (activePlayerId ? remoteStreams.get(activePlayerId) || null : null);

  console.log('[ATC Camera] Status:', {
    myUserId,
    otherPlayer: otherPlayerId.current,
    isMyTurn,
    hasLocal: !!localStream,
    remoteCount: remoteStreams.size,
    activeStream: activeStream ? (isMyTurn ? 'local' : 'remote') : 'none',
    callStatus
  });

  // Send signal
  const sendSignal = useCallback(async (type: string, data: any) => {
    if (!matchId || !myUserId) return;
    await supabase.rpc('rpc_send_atc_signal', {
      p_match_id: matchId,
      p_recipient_id: otherPlayerId.current,
      p_signal_type: type,
      p_signal_data: data
    });
  }, [matchId, myUserId, supabase]);

  // Create peer connection
  const createPC = useCallback((isInitiator: boolean) => {
    if (pcRef.current) {
      console.log('[ATC Camera] PC already exists');
      return pcRef.current;
    }

    console.log('[ATC Camera] Creating PC, initiator:', isInitiator);
    
    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceCandidatePoolSize: 10
    });

    pcRef.current = pc;

    pc.onconnectionstatechange = () => {
      console.log('[ATC Camera] Connection state:', pc.connectionState);
      setCallStatus(pc.connectionState === 'connected' ? 'connected' : 
                    pc.connectionState === 'connecting' ? 'connecting' : 'idle');
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal('ice', { candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      console.log('[ATC Camera] Got remote track!');
      if (e.streams?.[0] && otherPlayerId.current) {
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.set(otherPlayerId.current!, e.streams[0]);
          return next;
        });
      }
    };

    return pc;
  }, [sendSignal]);

  // Handle signals
  const handleSignal = useCallback(async (signal: any) => {
    const sigId = `${signal.sender_id}-${signal.signal_type}-${signal.created_at}`;
    if (processedSignals.current.has(sigId)) return;
    processedSignals.current.add(sigId);

    console.log('[ATC Camera] Signal:', signal.signal_type, 'from:', signal.sender_id);

    const pc = pcRef.current || createPC(false);

    try {
      if (signal.signal_type === 'offer') {
        // Add local stream before answering
        if (localStreamRef.current) {
          const hasTrack = pc.getSenders().some(s => s.track?.kind === 'video');
          if (!hasTrack) {
            localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal('answer', { answer: pc.localDescription?.toJSON() });
        console.log('[ATC Camera] Sent answer');

      } else if (signal.signal_type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.signal_data.answer));
        console.log('[ATC Camera] Answer processed');

      } else if (signal.signal_type === 'ice') {
        await pc.addIceCandidate(new RTCIceCandidate(signal.signal_data.candidate));
      }
    } catch (err) {
      console.error('[ATC Camera] Signal error:', err);
    }
  }, [createPC, sendSignal]);

  // Subscribe to signals
  useEffect(() => {
    if (!matchId || !myUserId) return;

    console.log('[ATC Camera] Subscribing to signals');

    const sub = supabase
      .channel(`atc-${matchId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'atc_match_signals',
        filter: `match_id=eq.${matchId}`
      }, (payload) => {
        const s = payload.new as any;
        if (s.sender_id !== myUserId) handleSignal(s);
      })
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, [matchId, myUserId, handleSignal, supabase]);

  // Create PC and send offer when camera starts (if initiator)
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

      // Create PC and add tracks
      const isInitiator = myUserId! < otherPlayerId.current!;
      const pc = createPC(isInitiator);

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      // If initiator, send offer
      if (isInitiator) {
        console.log('[ATC Camera] Sending offer...');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal('offer', { offer: pc.localDescription?.toJSON() });
      }

      return true;
    } catch (err) {
      console.error('[ATC Camera] Start failed:', err);
      return false;
    }
  };

  const stopCamera = () => {
    console.log('[ATC Camera] Stopping camera');
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setIsCameraOn(false);
  };

  const refreshCamera = async () => {
    stopCamera();
    await new Promise(r => setTimeout(r, 300));
    await startCamera();
  };

  const refreshConnection = () => {
    pcRef.current?.close();
    pcRef.current = null;
    setRemoteStreams(new Map());
    setCallStatus('idle');
    refreshCamera();
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
