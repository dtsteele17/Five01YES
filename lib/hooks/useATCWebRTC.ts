'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getIceServers } from '@/lib/webrtc/ice';
import { toast } from 'sonner';

export interface UseATCWebRTCProps {
  matchId: string | null;
  myUserId: string | null;
  isMatchActive?: boolean;
  currentPlayerId?: string | null;  // The player whose turn it is
  isMyTurn?: boolean;               // Whether it's the current user's turn
  allPlayerIds?: string[];          // All player IDs in the match
}

export interface UseATCWebRTCReturn {
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>; // playerId -> stream
  activeRemoteStream: MediaStream | null;  // Stream of current player whose turn it is
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
 * WebRTC Hook for ATC Quick Matches with Multi-Player Support
 * Creates a mesh network where each player connects to every other player
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

  // State
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'failed'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Refs - using a Map for multiple peer connections
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const makingOfferRef = useRef<Set<string>>(new Set());
  const localStreamRef = useRef<MediaStream | null>(null);
  const subscriptionsRef = useRef<(() => void)[]>([]);

  // Get the active stream (current player's stream)
  const activeRemoteStream = currentPlayerId ? remoteStreams.get(currentPlayerId) || null : null;

  console.log('[ATC WebRTC] State:', { 
    matchId, 
    myUserId, 
    playerCount: allPlayerIds.length,
    currentPlayerId,
    isMyTurn,
    connectedPeers: Array.from(peerConnectionsRef.current.keys()),
    remoteStreamOwners: Array.from(remoteStreams.keys())
  });

  // ========== SEND SIGNAL TO SPECIFIC PLAYER ==========
  const sendSignal = useCallback(async (recipientId: string, type: 'offer' | 'answer' | 'ice', data: any) => {
    if (!matchId || !myUserId) return;
    
    const { error } = await supabase.from('match_signals').insert({
      match_id: matchId,
      sender_id: myUserId,
      recipient_id: recipientId,
      signal_type: type,
      signal_data: data,
      created_at: new Date().toISOString(),
    });
    
    if (error) {
      console.error('[ATC WebRTC] Error sending signal to', recipientId, error);
    }
  }, [matchId, myUserId, supabase]);

  // ========== CREATE PEER CONNECTION TO SPECIFIC PLAYER ==========
  const createPeerConnection = useCallback((otherPlayerId: string, isInitiator: boolean) => {
    if (peerConnectionsRef.current.has(otherPlayerId)) {
      console.log('[ATC WebRTC] Already have connection to', otherPlayerId);
      return;
    }

    console.log('[ATC WebRTC] Creating peer connection to:', otherPlayerId, 'isInitiator:', isInitiator);

    try {
      const iceServers = getIceServers();
      
      const pc = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require'
      });

      peerConnectionsRef.current.set(otherPlayerId, pc);
      pendingIceCandidatesRef.current.set(otherPlayerId, []);

      // Connection state handlers
      pc.onconnectionstatechange = () => {
        console.log('[ATC WebRTC] Connection state with', otherPlayerId, ':', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setCallStatus('connected');
        } else if (pc.connectionState === 'connecting') {
          setCallStatus('connecting');
        } else if (pc.connectionState === 'failed') {
          setCallStatus('failed');
          pc.restartIce();
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('[ATC WebRTC] ICE state with', otherPlayerId, ':', pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          pc.restartIce();
        }
      };

      // ICE candidate handler
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('[ATC WebRTC] Sending ICE candidate to', otherPlayerId);
          await sendSignal(otherPlayerId, 'ice', { candidate: event.candidate.toJSON() });
        }
      };

      // Remote track handler
      pc.ontrack = (event) => {
        console.log('[ATC WebRTC] Remote track received from', otherPlayerId, event.track.kind);
        if (event.streams && event.streams[0]) {
          setRemoteStreams(prev => {
            const newMap = new Map(prev);
            newMap.set(otherPlayerId, event.streams[0]);
            return newMap;
          });
          setCallStatus('connected');
        }
      };

      // Negotiation needed - only for initiator
      pc.onnegotiationneeded = async () => {
        if (!isInitiator || makingOfferRef.current.has(otherPlayerId)) return;
        
        try {
          makingOfferRef.current.add(otherPlayerId);
          console.log('[ATC WebRTC] Creating offer for', otherPlayerId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal(otherPlayerId, 'offer', { offer: pc.localDescription?.toJSON() });
        } catch (error) {
          console.error('[ATC WebRTC] Error creating offer:', error);
        } finally {
          makingOfferRef.current.delete(otherPlayerId);
        }
      };

      // Add local stream tracks if we have them
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // If initiator and we have tracks, create offer immediately
      if (isInitiator && localStreamRef.current) {
        (async () => {
          try {
            makingOfferRef.current.add(otherPlayerId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal(otherPlayerId, 'offer', { offer: pc.localDescription?.toJSON() });
            console.log('[ATC WebRTC] Initial offer sent to', otherPlayerId);
          } catch (err) {
            console.error('[ATC WebRTC] Error sending initial offer:', err);
          } finally {
            makingOfferRef.current.delete(otherPlayerId);
          }
        })();
      }

    } catch (error) {
      console.error('[ATC WebRTC] Error creating peer connection:', error);
      setCameraError('Failed to initialize connection');
    }
  }, [sendSignal]);

  // ========== HANDLE SIGNALS FROM OTHER PLAYERS ==========
  const handleSignal = useCallback(async (senderId: string, signal: any) => {
    const pc = peerConnectionsRef.current.get(senderId);
    
    if (!pc) {
      // Create connection if it doesn't exist (we're not initiator)
      console.log('[ATC WebRTC] Creating new connection for signal from', senderId);
      createPeerConnection(senderId, false);
      // Wait a bit for connection to be created
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const peerConnection = peerConnectionsRef.current.get(senderId);
    if (!peerConnection) {
      console.error('[ATC WebRTC] No peer connection for', senderId);
      return;
    }

    try {
      if (signal.signal_type === 'offer') {
        console.log('[ATC WebRTC] Received offer from', senderId);
        
        // Add our stream before creating answer
        if (localStreamRef.current) {
          const senders = peerConnection.getSenders();
          const hasVideo = senders.some(s => s.track?.kind === 'video');
          if (!hasVideo) {
            localStreamRef.current.getTracks().forEach(track => {
              peerConnection.addTrack(track, localStreamRef.current!);
            });
          }
        }

        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.signal_data.offer));
        
        // Process pending ICE candidates
        const pending = pendingIceCandidatesRef.current.get(senderId) || [];
        for (const candidate of pending) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('[ATC WebRTC] Error adding pending ICE:', e);
          }
        }
        pendingIceCandidatesRef.current.set(senderId, []);

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        await sendSignal(senderId, 'answer', { answer: peerConnection.localDescription?.toJSON() });
        console.log('[ATC WebRTC] Answer sent to', senderId);

      } else if (signal.signal_type === 'answer') {
        console.log('[ATC WebRTC] Received answer from', senderId);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal.signal_data.answer));
        
        // Process pending ICE candidates
        const pending = pendingIceCandidatesRef.current.get(senderId) || [];
        for (const candidate of pending) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('[ATC WebRTC] Error adding pending ICE:', e);
          }
        }
        pendingIceCandidatesRef.current.set(senderId, []);

      } else if (signal.signal_type === 'ice') {
        console.log('[ATC WebRTC] Received ICE from', senderId);
        if (peerConnection.remoteDescription) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(signal.signal_data.candidate));
        } else {
          // Queue ICE candidate
          const pending = pendingIceCandidatesRef.current.get(senderId) || [];
          pending.push(signal.signal_data.candidate);
          pendingIceCandidatesRef.current.set(senderId, pending);
        }
      }
    } catch (error) {
      console.error('[ATC WebRTC] Error handling signal:', error);
    }
  }, [createPeerConnection, sendSignal]);

  // ========== SETUP SIGNALING SUBSCRIPTION ==========
  useEffect(() => {
    if (!matchId || !myUserId) return;

    console.log('[ATC WebRTC] Setting up signal subscription');

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
          if (signal.sender_id === myUserId) return; // Ignore our own signals
          
          console.log('[ATC WebRTC] Received signal from:', signal.sender_id, 'type:', signal.signal_type);
          handleSignal(signal.sender_id, signal);
        }
      )
      .subscribe();

    subscriptionsRef.current.push(() => subscription.unsubscribe());

    return () => {
      subscription.unsubscribe();
    };
  }, [matchId, myUserId, handleSignal, supabase]);

  // ========== CREATE CONNECTIONS TO ALL OTHER PLAYERS ==========
  useEffect(() => {
    if (!matchId || !myUserId || !isMatchActive) return;
    if (allPlayerIds.length < 2) return;

    console.log('[ATC WebRTC] Setting up connections to all players:', allPlayerIds);

    // Create connections to all other players
    // We'll be the initiator if our ID is alphabetically first (simple tie-breaker)
    allPlayerIds.forEach((playerId, index) => {
      if (playerId === myUserId) return;
      
      const isInitiator = myUserId < playerId; // Simple tie-breaker
      createPeerConnection(playerId, isInitiator);
    });

    return () => {
      // Cleanup connections
      peerConnectionsRef.current.forEach((pc) => {
        pc.close();
      });
      peerConnectionsRef.current.clear();
    };
  }, [matchId, myUserId, allPlayerIds, isMatchActive, createPeerConnection]);

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
      
      // Add tracks to all existing peer connections
      peerConnectionsRef.current.forEach((pc, playerId) => {
        const senders = pc.getSenders();
        const hasVideo = senders.some(s => s.track?.kind === 'video');
        if (!hasVideo) {
          console.log('[ATC WebRTC] Adding track to peer connection:', playerId);
          stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
          });
        }
      });
    } catch (err) {
      console.error('[ATC WebRTC] Could not access camera:', err);
      setCameraError('Could not access camera');
      toast.error('Could not access camera');
    }
  };
  
  // Auto-start camera when it's my turn
  useEffect(() => {
    if (isMyTurn && isMatchActive && !isCameraOn && !cameraError) {
      console.log('[ATC WebRTC] Auto-starting camera - it\'s my turn');
      startCamera();
    }
  }, [isMyTurn, isMatchActive]);

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
    console.log('[ATC WebRTC] Refreshing all connections...');
    
    // Close all connections
    peerConnectionsRef.current.forEach((pc) => {
      pc.close();
    });
    peerConnectionsRef.current.clear();
    setRemoteStreams(new Map());
    setCallStatus('idle');

    // Restart camera if it was on
    if (isCameraOn) {
      await refreshCamera();
    }
  };

  const forceTurnAndRestart = () => {
    console.log('[ATC WebRTC] Forcing TURN relay and restarting');
    refreshConnection();
  };

  return {
    localStream,
    remoteStreams,
    activeRemoteStream,
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
