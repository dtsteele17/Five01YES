'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getIceServers } from '@/lib/webrtc/ice';
import { toast } from 'sonner';

export interface UseATCWebRTCProps {
  matchId: string | null;
  myUserId: string | null;
  isMatchActive?: boolean;
  currentPlayerId?: string | null;
  isMyTurn?: boolean;
  allPlayerIds?: string[];
}

export interface UseATCWebRTCReturn {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  activeStream: MediaStream | null;
  activePlayerId: string | null;
  isCameraOn: boolean;
  callStatus: 'idle' | 'connecting' | 'connected' | 'failed';
  cameraError: string | null;
  toggleCamera: () => Promise<void>;
  stopCamera: () => void;
  refreshCamera: () => Promise<void>;
  refreshConnection: () => Promise<void>;
}

/**
 * WebRTC Hook for ATC Quick Matches
 * Shows ONLY the current player's camera to everyone
 */
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
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const localStreamRef = useRef<MediaStream | null>(null);
  const processedSignalsRef = useRef<Set<string>>(new Set());

  // Determine which stream to show: local if my turn, remote if opponent's turn
  const activePlayerId = currentPlayerId || null;
  const activeStream = isMyTurn ? localStream : (activePlayerId ? remoteStreams.get(activePlayerId) || null : null);

  console.log('[ATC Camera] State:', {
    matchId,
    myUserId,
    currentPlayerId,
    isMyTurn,
    hasLocalStream: !!localStream,
    remoteStreamCount: remoteStreams.size,
    remoteStreamIds: Array.from(remoteStreams.keys()),
    activeStream: activeStream ? (isMyTurn ? 'local' : 'remote') : 'none',
  });

  // Send signal to match (broadcast)
  const sendSignal = useCallback(async (targetPlayerId: string, type: 'offer' | 'answer' | 'ice', data: any) => {
    if (!matchId || !myUserId) return;
    
    console.log('[ATC Camera] Sending signal to:', targetPlayerId, 'type:', type);
    
    const { data: rpcResult, error } = await supabase.rpc('rpc_send_atc_signal', {
      p_match_id: matchId,
      p_recipient_id: targetPlayerId,
      p_signal_type: type,
      p_signal_data: data
    });
    
    if (error) {
      console.error('[ATC Camera] Send signal error:', error);
    } else {
      console.log('[ATC Camera] Signal sent successfully to:', targetPlayerId, 'type:', type);
    }
  }, [matchId, myUserId, supabase]);

  // Create peer connection to another player
  const createPeerConnection = useCallback((otherPlayerId: string, isInitiator: boolean) => {
    if (peerConnectionsRef.current.has(otherPlayerId)) {
      console.log('[ATC Camera] Already have connection to:', otherPlayerId);
      return peerConnectionsRef.current.get(otherPlayerId)!;
    }

    console.log('[ATC Camera] Creating peer connection to:', otherPlayerId, 'initiator:', isInitiator);

    try {
      const iceServers = getIceServers();
      
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
      });

      peerConnectionsRef.current.set(otherPlayerId, pc);
      pendingIceCandidatesRef.current.set(otherPlayerId, []);

      pc.onconnectionstatechange = () => {
        console.log('[ATC Camera] Connection state with', otherPlayerId, ':', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setCallStatus('connected');
        } else if (pc.connectionState === 'connecting') {
          setCallStatus('connecting');
        } else if (pc.connectionState === 'failed') {
          console.error('[ATC Camera] Connection failed with', otherPlayerId);
          pc.restartIce();
        }
      };

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('[ATC Camera] Sending ICE candidate to:', otherPlayerId);
          await sendSignal(otherPlayerId, 'ice', { candidate: event.candidate.toJSON() });
        }
      };

      pc.ontrack = (event) => {
        console.log('[ATC Camera] 🎥 GOT REMOTE TRACK from:', otherPlayerId, 'streams:', event.streams?.length);
        if (event.streams && event.streams[0]) {
          console.log('[ATC Camera] 🎥 Setting remote stream for:', otherPlayerId);
          setRemoteStreams(prev => {
            const newMap = new Map(prev);
            newMap.set(otherPlayerId, event.streams[0]);
            console.log('[ATC Camera] 🎥 RemoteStreams now:', Array.from(newMap.keys()));
            return newMap;
          });
        }
      };

      // Add local stream if we have it
      if (localStreamRef.current) {
        console.log('[ATC Camera] Adding local tracks to new connection for:', otherPlayerId);
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      return pc;
    } catch (error) {
      console.error('[ATC Camera] Error creating peer connection:', error);
      return null;
    }
  }, [sendSignal]);

  // Handle incoming signal
  const handleSignal = useCallback(async (senderId: string, signal: any) => {
    // Prevent processing duplicate signals
    const signalId = `${senderId}-${signal.signal_type}-${signal.created_at}`;
    if (processedSignalsRef.current.has(signalId)) {
      return;
    }
    processedSignalsRef.current.add(signalId);
    
    // Keep set size manageable
    if (processedSignalsRef.current.size > 100) {
      const iter = processedSignalsRef.current.values();
      processedSignalsRef.current.delete(iter.next().value);
    }

    console.log('[ATC Camera] 📨 Received signal from:', senderId, 'type:', signal.signal_type);
    
    let pc = peerConnectionsRef.current.get(senderId);
    
    // For offer, always create connection if doesn't exist
    if (!pc && signal.signal_type === 'offer') {
      console.log('[ATC Camera] Creating new connection for offer from:', senderId);
      pc = createPeerConnection(senderId, false) ?? undefined;
    }

    if (!pc) {
      console.log('[ATC Camera] No peer connection for:', senderId, 'ignoring', signal.signal_type);
      return;
    }

    const conn: RTCPeerConnection = pc;

    try {
      if (signal.signal_type === 'offer') {
        console.log('[ATC Camera] 📨 Processing OFFER from:', senderId);

        // Add local stream before creating answer
        if (localStreamRef.current) {
          const senders = conn.getSenders();
          const hasVideo = senders.some(s => s.track?.kind === 'video');
          if (!hasVideo) {
            console.log('[ATC Camera] Adding local tracks before answer');
            localStreamRef.current.getTracks().forEach(track => {
              conn.addTrack(track, localStreamRef.current!);
            });
          }
        }

        const offerData = signal.signal_data?.offer || signal.offer;
        await conn.setRemoteDescription(new RTCSessionDescription(offerData));
        console.log('[ATC Camera] Remote description set for offer');
        
        // Process pending ICE candidates
        const pending = pendingIceCandidatesRef.current.get(senderId) || [];
        for (const candidate of pending) {
          try {
            await conn.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('[ATC Camera] Added pending ICE candidate');
          } catch (e) {
            console.error('[ATC Camera] Error adding pending ICE:', e);
          }
        }
        pendingIceCandidatesRef.current.set(senderId, []);

        console.log('[ATC Camera] Creating ANSWER for:', senderId);
        const answer = await conn.createAnswer();
        await conn.setLocalDescription(answer);
        await sendSignal(senderId, 'answer', { answer: conn.localDescription?.toJSON() });
        console.log('[ATC Camera] ✅ ANSWER sent to:', senderId);

      } else if (signal.signal_type === 'answer') {
        console.log('[ATC Camera] 📨 Processing ANSWER from:', senderId);
        const answerData = signal.signal_data?.answer || signal.answer;
        await conn.setRemoteDescription(new RTCSessionDescription(answerData));
        console.log('[ATC Camera] Remote description set for answer');

        // Process pending ICE candidates
        const pending = pendingIceCandidatesRef.current.get(senderId) || [];
        for (const candidate of pending) {
          try {
            await conn.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('[ATC Camera] Error adding pending ICE:', e);
          }
        }
        pendingIceCandidatesRef.current.set(senderId, []);
        console.log('[ATC Camera] ✅ Answer processed, connection should establish');

      } else if (signal.signal_type === 'ice') {
        const candidateData = signal.signal_data?.candidate || signal.candidate;
        if (conn.remoteDescription && conn.remoteDescription.type) {
          console.log('[ATC Camera] Adding ICE candidate from:', senderId);
          await conn.addIceCandidate(new RTCIceCandidate(candidateData));
        } else {
          console.log('[ATC Camera] Queuing ICE candidate (no remote desc yet)');
          const pending = pendingIceCandidatesRef.current.get(senderId) || [];
          pending.push(candidateData);
          pendingIceCandidatesRef.current.set(senderId, pending);
        }
      }
    } catch (error) {
      console.error('[ATC Camera] Error handling signal:', error);
    }
  }, [createPeerConnection, sendSignal]);

  // Setup signaling subscription
  useEffect(() => {
    if (!matchId || !myUserId) return;

    console.log('[ATC Camera] Setting up signaling subscription');

    const subscription = supabase
      .channel(`atc_${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'atc_match_signals',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const signal = payload.new as any;
          if (signal.sender_id === myUserId) return;
          handleSignal(signal.sender_id, signal);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [matchId, myUserId, handleSignal, supabase]);

  // Create connections to all other players - ONLY ONCE
  useEffect(() => {
    if (!matchId || !myUserId) return;
    if (allPlayerIds.length < 2) return;

    console.log('[ATC Camera] Creating initial connections to all players:', allPlayerIds);

    allPlayerIds.forEach((playerId) => {
      if (playerId === myUserId) return;
      const isInitiator = myUserId < playerId;
      createPeerConnection(playerId, isInitiator);
    });

    // Cleanup on unmount only
    return () => {
      console.log('[ATC Camera] Cleanup - closing all connections');
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, myUserId]); // Only recreate when matchId or myUserId changes

  // Send offers to all connections when we get camera (if initiator)
  useEffect(() => {
    if (!localStream || !myUserId) return;

    console.log('[ATC Camera] Camera ready, checking if we need to send offers');

    peerConnectionsRef.current.forEach((pc, playerId) => {
      const isInitiator = myUserId < playerId;
      if (isInitiator && pc.signalingState === 'stable') {
        console.log('[ATC Camera] Sending initial offer to:', playerId);
        (async () => {
          try {
            // Add tracks first
            const senders = pc.getSenders();
            const hasVideo = senders.some(s => s.track?.kind === 'video');
            if (!hasVideo) {
              localStream.getTracks().forEach(track => {
                pc.addTrack(track, localStream);
              });
            }
            
            makingOfferRef.current.add(playerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal(playerId, 'offer', { offer: pc.localDescription?.toJSON() });
            console.log('[ATC Camera] Initial offer sent to:', playerId);
          } catch (err) {
            console.error('[ATC Camera] Error sending offer:', err);
          } finally {
            makingOfferRef.current.delete(playerId);
          }
        })();
      }
    });
  }, [localStream, myUserId, sendSignal]);

  // Camera controls
  const startCamera = async () => {
    try {
      console.log('[ATC Camera] Starting camera...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false 
      });
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsCameraOn(true);
      setCameraError(null);
      
      console.log('[ATC Camera] ✅ Camera started');
    } catch (err) {
      console.error('[ATC Camera] Camera error:', err);
      setCameraError('Could not access camera');
      toast.error('Could not access camera');
    }
  };

  const stopCamera = () => {
    console.log('[ATC Camera] Stopping camera');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setIsCameraOn(false);
  };

  const toggleCamera = async () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      await startCamera();
    }
  };

  // Auto-start camera when it's my turn - BUT DON'T STOP when turn ends immediately
  // Wait for remote stream first
  useEffect(() => {
    if (isMyTurn && isMatchActive && !isCameraOn && !cameraError) {
      console.log('[ATC Camera] Auto-starting - my turn');
      startCamera();
    }
  }, [isMyTurn, isMatchActive, cameraError]); // Don't include isCameraOn

  const refreshCamera = async () => {
    stopCamera();
    await new Promise(resolve => setTimeout(resolve, 300));
    await startCamera();
  };

  const refreshConnection = async () => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setRemoteStreams(new Map());
    setCallStatus('idle');
    if (isCameraOn) {
      await refreshCamera();
    }
  };

  return {
    localStream,
    remoteStreams,
    activeStream,
    activePlayerId,
    isCameraOn,
    callStatus,
    cameraError,
    toggleCamera,
    stopCamera,
    refreshCamera,
    refreshConnection,
  };
}
