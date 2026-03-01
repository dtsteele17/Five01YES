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
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const processedSignals = useRef<Set<string>>(new Set());
  const pendingSignals = useRef<Map<string, any[]>>(new Map());
  const rebuildingPeersRef = useRef<Set<string>>(new Set());
  const healthIssueStartedAtRef = useRef<Map<string, number>>(new Map());
  const reconnectBroadcastSentRef = useRef(false);

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

  const attachLocalTracks = useCallback((pc: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const senders = pc.getSenders();
    stream.getTracks().forEach(track => {
      if (!senders.find(s => s.track === track)) {
        pc.addTrack(track, stream);
      }
    });
  }, []);

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
    let disconnectedTimer: ReturnType<typeof setTimeout> | null = null;

    peerConnectionsRef.current.set(playerId, pc);

    pc.onconnectionstatechange = () => {
      console.log(`[ATC Camera] Connection ${playerId}: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[ATC Camera] ICE ${playerId}: ${pc.iceConnectionState}`);

      if (pc.iceConnectionState === 'disconnected') {
        if (disconnectedTimer) {
          clearTimeout(disconnectedTimer);
        }
        disconnectedTimer = setTimeout(() => {
          if (
            peerConnectionsRef.current.get(playerId) === pc &&
            pc.iceConnectionState === 'disconnected'
          ) {
            try {
              console.log(`[ATC Camera] ICE disconnected for ${playerId}, restarting ICE`);
              pc.restartIce();
            } catch (err) {
              console.error(`[ATC Camera] ICE restart failed for ${playerId}:`, err);
            }
          }
        }, 3000);
      } else if (pc.iceConnectionState === 'failed') {
        if (disconnectedTimer) {
          clearTimeout(disconnectedTimer);
          disconnectedTimer = null;
        }
        try {
          console.log(`[ATC Camera] ICE failed for ${playerId}, restarting ICE`);
          pc.restartIce();
        } catch (err) {
          console.error(`[ATC Camera] Immediate ICE restart failed for ${playerId}:`, err);
        }
      } else if (disconnectedTimer) {
        clearTimeout(disconnectedTimer);
        disconnectedTimer = null;
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
          remoteStreamsRef.current = next;
          return next;
        });
      }
    };

    return pc;
  }, [sendSignal]);

  const teardownPeerConnection = useCallback((playerId: string) => {
    const existing = peerConnectionsRef.current.get(playerId);
    if (existing) {
      try {
        existing.onicecandidate = null;
        existing.ontrack = null;
        existing.onconnectionstatechange = null;
        existing.oniceconnectionstatechange = null;
        existing.close();
      } catch (err) {
        console.warn(`[ATC Camera] Error closing peer ${playerId}:`, err);
      }
      peerConnectionsRef.current.delete(playerId);
    }

    pendingSignals.current.delete(playerId);
    healthIssueStartedAtRef.current.delete(playerId);

    setRemoteStreams(prev => {
      const next = new Map(prev);
      next.delete(playerId);
      remoteStreamsRef.current = next;
      return next;
    });
  }, []);

  const rebuildPeerConnection = useCallback(async (playerId: string, reason: string) => {
    if (!myUserId || rebuildingPeersRef.current.has(playerId)) return;
    rebuildingPeersRef.current.add(playerId);

    try {
      console.log(`[ATC Camera] Rebuilding peer ${playerId} (${reason})`);
      setCallStatus('connecting');
      teardownPeerConnection(playerId);

      const pc = createPeerConnection(playerId);
      attachLocalTracks(pc);

      // Keep deterministic initiator for all player counts, including 2-player matches.
      if (myUserId < playerId) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal(playerId, 'offer', { offer: pc.localDescription?.toJSON() });
      }
    } catch (err) {
      console.error(`[ATC Camera] Failed rebuilding peer ${playerId}:`, err);
    } finally {
      rebuildingPeersRef.current.delete(playerId);
    }
  }, [attachLocalTracks, createPeerConnection, myUserId, sendSignal, teardownPeerConnection]);

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

    if (signal.signal_type === 'reconnect') {
      await rebuildPeerConnection(senderId, 'remote_reconnect_signal');
      return;
    }

    const pc = createPeerConnection(senderId);

    try {
      if (signal.signal_type === 'offer') {
        // Only process if we haven't already set remote description for this offer
        if (pc.signalingState === 'stable') {
          // Add local stream
          attachLocalTracks(pc);

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
  }, [attachLocalTracks, createPeerConnection, processPendingSignals, rebuildPeerConnection, sendSignal]);

  // Subscribe to signals
  useEffect(() => {
    if (!matchId || !myUserId) return;

    const sub = supabase
      .channel(`atc-${matchId}-${myUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'atc_match_signals',
        filter: `match_id=eq.${matchId}`
      }, (payload) => {
        const s = payload.new as any;
        // Only process signals addressed to me (or broadcast)
        if (s.sender_id !== myUserId && (!s.recipient_id || s.recipient_id === myUserId)) {
          handleSignal(s);
        }
      })
      .subscribe();

    return () => { 
      sub.unsubscribe();
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();
      pendingSignals.current.clear();
      rebuildingPeersRef.current.clear();
      healthIssueStartedAtRef.current.clear();
      remoteStreamsRef.current = new Map();
    };
  }, [matchId, myUserId, handleSignal, supabase]);

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'environment' },
        audio: false
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsCameraOn(true);

      // Connect to all other players
      for (const playerId of otherPlayerIds) {
        const pc = createPeerConnection(playerId);
        
        // Add tracks
        attachLocalTracks(pc);

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
    rebuildingPeersRef.current.clear();
    healthIssueStartedAtRef.current.clear();
    
    setRemoteStreams(new Map());
    remoteStreamsRef.current = new Map();
    setCallStatus('idle');
  };

  const refreshCamera = async () => {
    stopCamera();
    await new Promise(r => setTimeout(r, 300));
    await startCamera();
  };

  // Auto-start camera when match is active (all players keep camera on)
  // This ensures the current turn player's stream is always available to others
  useEffect(() => {
    if (isMatchActive && !isCameraOn && allPlayerIds.length >= 2) {
      startCamera();
    }
  }, [isMatchActive, allPlayerIds.length]);

  useEffect(() => {
    remoteStreamsRef.current = remoteStreams;
  }, [remoteStreams]);

  // Recovery path for page refreshes while the match is already active.
  useEffect(() => {
    if (!isMatchActive || !matchId || !myUserId || otherPlayerIds.length === 0) {
      reconnectBroadcastSentRef.current = false;
      return;
    }
    if (reconnectBroadcastSentRef.current) return;

    reconnectBroadcastSentRef.current = true;
    Promise.all(
      otherPlayerIds.map(playerId =>
        sendSignal(playerId, 'reconnect', {
          reason: 'page_refresh_recovery',
          at: new Date().toISOString(),
        })
      )
    ).catch(err => {
      console.error('[ATC Camera] Failed sending reconnect broadcast:', err);
    });
  }, [isMatchActive, matchId, myUserId, otherPlayerIds, sendSignal]);

  // Stream health watchdog: rebuild stale peers with no live remote tracks for >5s.
  useEffect(() => {
    if (!isMatchActive) {
      healthIssueStartedAtRef.current.clear();
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const streamEntries = Array.from(remoteStreamsRef.current.entries());
      const activeRemoteIds = new Set(streamEntries.map(([playerId]) => playerId));

      for (const trackedId of Array.from(healthIssueStartedAtRef.current.keys())) {
        if (!activeRemoteIds.has(trackedId)) {
          healthIssueStartedAtRef.current.delete(trackedId);
        }
      }

      streamEntries.forEach(([playerId, stream]) => {
        const hasLiveTrack = stream.getTracks().some(track => track.readyState === 'live');
        if (hasLiveTrack) {
          healthIssueStartedAtRef.current.delete(playerId);
          return;
        }

        const startedAt = healthIssueStartedAtRef.current.get(playerId);
        if (!startedAt) {
          healthIssueStartedAtRef.current.set(playerId, now);
          return;
        }

        if (now - startedAt > 5000) {
          healthIssueStartedAtRef.current.delete(playerId);
          rebuildPeerConnection(playerId, 'health_watchdog_no_live_tracks');
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isMatchActive, rebuildPeerConnection]);

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
