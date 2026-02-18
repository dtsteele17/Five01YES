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
  activeStream: MediaStream | null;  // Current player's stream (local if my turn, remote if opponent's turn)
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
}: UseATCWebRTCProps): UseATCWebRTCReturn {
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
  const subscriptionRef = useRef<(() => void) | null>(null);

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
    activeStream: activeStream ? (isMyTurn ? 'local' : 'remote') : 'none',
  });

  // Send signal to match (broadcast - no specific recipient)
  const sendSignal = useCallback(async (targetPlayerId: string, type: 'offer' | 'answer' | 'ice', data: any) => {
    if (!matchId || !myUserId) return;
    
    const { data: rpcResult, error } = await supabase.rpc('rpc_send_atc_signal', {
      p_match_id: matchId,
      p_recipient_id: targetPlayerId, // Still passed but ignored by DB
      p_signal_type: type,
      p_signal_data: data
    });
    
    if (error) {
      console.error('[ATC Camera] Send signal error:', error);
    }
  }, [matchId, myUserId, supabase]);

  // Create peer connection to another player
  const createPeerConnection = useCallback((otherPlayerId: string, isInitiator: boolean) => {
    if (peerConnectionsRef.current.has(otherPlayerId)) {
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
        } else if (pc.connectionState === 'failed') {
          pc.restartIce();
        }
      };

      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          await sendSignal(otherPlayerId, 'ice', { candidate: event.candidate.toJSON() });
        }
      };

      pc.ontrack = (event) => {
        console.log('[ATC Camera] Got remote track from', otherPlayerId);
        if (event.streams && event.streams[0]) {
          setRemoteStreams(prev => {
            const newMap = new Map(prev);
            newMap.set(otherPlayerId, event.streams[0]);
            return newMap;
          });
        }
      };

      // Add local stream if we have it
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // If initiator, create offer
      if (isInitiator) {
        (async () => {
          try {
            makingOfferRef.current.add(otherPlayerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal(otherPlayerId, 'offer', { offer: pc.localDescription?.toJSON() });
          } catch (err) {
            console.error('[ATC Camera] Error creating offer:', err);
          } finally {
            makingOfferRef.current.delete(otherPlayerId);
          }
        })();
      }

      return pc;
    } catch (error) {
      console.error('[ATC Camera] Error creating peer connection:', error);
      return null;
    }
  }, [sendSignal]);

  // Handle incoming signal
  const handleSignal = useCallback(async (senderId: string, signal: any) => {
    console.log('[ATC Camera] Received signal from:', senderId, 'type:', signal.signal_type);
    
    let pc = peerConnectionsRef.current.get(senderId);
    
    if (!pc && signal.signal_type === 'offer') {
      // New connection - we're not initiator
      pc = createPeerConnection(senderId, false);
    }

    if (!pc) {
      console.log('[ATC Camera] No peer connection for', senderId);
      return;
    }

    try {
      if (signal.signal_type === 'offer') {
        // Add local stream before creating answer
        if (localStreamRef.current) {
          const senders = pc.getSenders();
          const hasVideo = senders.some(s => s.track?.kind === 'video');
          if (!hasVideo) {
            localStreamRef.current.getTracks().forEach(track => {
              pc.addTrack(track, localStreamRef.current!);
            });
          }
        }

        const offerData = signal.signal_data?.offer || signal.offer;
        await pc.setRemoteDescription(new RTCSessionDescription(offerData));
        
        // Process pending ICE
        const pending = pendingIceCandidatesRef.current.get(senderId) || [];
        for (const candidate of pending) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingIceCandidatesRef.current.set(senderId, []);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal(senderId, 'answer', { answer: pc.localDescription?.toJSON() });

      } else if (signal.signal_type === 'answer') {
        const answerData = signal.signal_data?.answer || signal.answer;
        await pc.setRemoteDescription(new RTCSessionDescription(answerData));
        
        // Process pending ICE
        const pending = pendingIceCandidatesRef.current.get(senderId) || [];
        for (const candidate of pending) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingIceCandidatesRef.current.set(senderId, []);

      } else if (signal.signal_type === 'ice') {
        const candidateData = signal.signal_data?.candidate || signal.candidate;
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidateData));
        } else {
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
          if (signal.sender_id === myUserId) return; // Ignore own signals
          handleSignal(signal.sender_id, signal);
        }
      )
      .subscribe();

    subscriptionRef.current = () => subscription.unsubscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [matchId, myUserId, handleSignal, supabase]);

  // Create connections to all other players
  useEffect(() => {
    if (!matchId || !myUserId || allPlayerIds.length < 2) return;

    console.log('[ATC Camera] Creating connections to all players:', allPlayerIds);

    allPlayerIds.forEach((playerId) => {
      if (playerId === myUserId) return;
      const isInitiator = myUserId < playerId;
      createPeerConnection(playerId, isInitiator);
    });

    return () => {
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
    };
  }, [matchId, myUserId, allPlayerIds, createPeerConnection]);

  // Camera controls
  const startCamera = async () => {
    try {
      console.log('[ATC Camera] Starting camera');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false 
      });
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      setIsCameraOn(true);
      setCameraError(null);
      
      // Add tracks to all existing peer connections
      peerConnectionsRef.current.forEach((pc, playerId) => {
        const senders = pc.getSenders();
        const hasVideo = senders.some(s => s.track?.kind === 'video');
        if (!hasVideo) {
          stream.getTracks().forEach(track => {
            try {
              pc.addTrack(track, stream);
            } catch (e) {
              console.error('[ATC Camera] Error adding track:', e);
            }
          });
        }
      });
      
      console.log('[ATC Camera] Camera started');
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

  // Auto-start camera when it's my turn
  useEffect(() => {
    if (isMyTurn && isMatchActive && !isCameraOn && !cameraError) {
      console.log('[ATC Camera] Auto-starting - my turn');
      startCamera();
    }
  }, [isMyTurn, isMatchActive]);

  // Stop camera when turn ends (optional - remove if you want camera to stay on)
  useEffect(() => {
    if (!isMyTurn && isCameraOn) {
      console.log('[ATC Camera] Stopping - turn ended');
      stopCamera();
    }
  }, [isMyTurn]);

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
