'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Video, VideoOff, RefreshCw } from 'lucide-react';

interface MatchCameraPanelProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isCameraOn: boolean;
  callStatus: 'idle' | 'connecting' | 'connected' | 'failed';
  cameraError: string | null;
  toggleCamera: () => Promise<void>;
  refreshConnection?: () => Promise<void>;
  myName: string;
  opponentName: string;
  /** When true, show MY camera as main (it's my turn to throw) */
  isMyTurn: boolean;
}

/**
 * Match Camera Panel — Dartcounter-style turn-based view
 *
 * Main video: shows the active thrower's camera
 * PiP: shows the waiting player's camera
 *
 * When it's MY turn → main = my camera, PiP = opponent's
 * When it's OPPONENT's turn → main = opponent's camera, PiP = mine
 */
export function MatchCameraPanel({
  localStream,
  remoteStream,
  isCameraOn,
  callStatus,
  cameraError,
  toggleCamera,
  refreshConnection,
  myName,
  opponentName,
  isMyTurn,
}: MatchCameraPanelProps) {
  const mainVideoRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);

  // Determine which stream goes where based on turn
  const mainStream = isMyTurn ? localStream : remoteStream;
  const pipStream = isMyTurn ? remoteStream : localStream;
  const mainName = isMyTurn ? myName : opponentName;
  const pipName = isMyTurn ? opponentName : myName;
  const mainIsMuted = isMyTurn; // Mute own video to avoid echo

  // Bind main stream
  useEffect(() => {
    const el = mainVideoRef.current;
    if (el && mainStream) {
      el.srcObject = mainStream;
      el.play().catch((err) =>
        console.error('[CameraPanel] Main video play error:', err)
      );
    } else if (el) {
      el.srcObject = null;
    }
  }, [mainStream]);

  // Bind PiP stream
  useEffect(() => {
    const el = pipVideoRef.current;
    if (el && pipStream) {
      el.srcObject = pipStream;
      el.play().catch((err) =>
        console.error('[CameraPanel] PiP video play error:', err)
      );
    } else if (el) {
      el.srcObject = null;
    }
  }, [pipStream]);

  const isConnected = callStatus === 'connected';
  const isConnecting = callStatus === 'connecting';
  const isFailed = callStatus === 'failed';
  const hasMainStream = !!mainStream;

  return (
    <Card className="bg-slate-900/50 border-white/10 p-4 h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          Camera
          {isConnecting && (
            <span className="text-xs text-amber-400 animate-pulse">
              Connecting...
            </span>
          )}
          {isConnected && (
            <span className="text-xs text-emerald-400">● Live</span>
          )}
          {isFailed && (
            <span className="text-xs text-red-400">● Failed</span>
          )}
        </h3>
        <div className="flex items-center space-x-2">
          {isFailed && refreshConnection && (
            <Button
              onClick={refreshConnection}
              variant="outline"
              size="sm"
              className="border-white/10 text-white hover:bg-white/5 text-xs h-8"
            >
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          )}
          <Button
            onClick={toggleCamera}
            disabled={isConnecting}
            variant="outline"
            size="sm"
            className="border-white/10 text-white hover:bg-white/5 text-xs h-8"
          >
            {isCameraOn ? (
              <>
                <VideoOff className="w-3 h-3 mr-1" /> Off
              </>
            ) : (
              <>
                <Video className="w-3 h-3 mr-1" /> On
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Camera Error */}
      {cameraError && (
        <div className="mb-3 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-400">{cameraError}</p>
        </div>
      )}

      {/* Video Container */}
      <div className="flex-1 relative rounded-lg overflow-hidden bg-slate-950/50 min-h-0">
        {/* Main Video — Active thrower */}
        <div className="absolute inset-0">
          {hasMainStream ? (
            <>
              <video
                ref={mainVideoRef}
                autoPlay
                playsInline
                muted={mainIsMuted}
                className="w-full h-full object-cover rounded-lg"
              />
              <div className="absolute bottom-4 left-4 px-4 py-2 bg-black/70 rounded-lg text-base text-white font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                {mainName} — Throwing
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              <VideoOff className="w-12 h-12 mb-2 opacity-50" />
              <p className="text-sm">
                {isConnecting
                  ? 'Connecting camera...'
                  : isMyTurn
                    ? 'Your camera is off'
                    : 'Opponent camera off'}
              </p>
            </div>
          )}
        </div>

        {/* PiP — Waiting player */}
        <div className="absolute bottom-4 right-4 w-32 h-24 rounded-lg overflow-hidden border-2 border-white/20 bg-slate-800 shadow-lg">
          {pipStream ? (
            <>
              <video
                ref={pipVideoRef}
                autoPlay
                playsInline
                muted={!mainIsMuted}
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-1 left-1 px-2 py-0.5 bg-black/60 rounded text-xs text-white">
                {pipName}
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-800">
              <VideoOff className="w-6 h-6 text-gray-500" />
            </div>
          )}
        </div>
      </div>

      {/* Status Footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isCameraOn ? 'bg-emerald-500' : 'bg-gray-500'
            }`}
          />
          <span>Your camera: {isCameraOn ? 'On' : 'Off'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? 'bg-emerald-500'
                : isConnecting
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-gray-500'
            }`}
          />
          <span>
            {isConnected
              ? 'Connected'
              : isConnecting
                ? 'Connecting...'
                : isFailed
                  ? 'Disconnected'
                  : 'Waiting'}
          </span>
        </div>
      </div>
    </Card>
  );
}
