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
  myName: string;
  opponentName: string;
}

export function MatchCameraPanel({
  localStream,
  remoteStream,
  isCameraOn,
  callStatus,
  cameraError,
  toggleCamera,
  myName,
  opponentName,
}: MatchCameraPanelProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Handle local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(err => {
        console.error('[CameraPanel] Error playing local video:', err);
      });
    }
  }, [localStream]);

  // Handle remote stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(err => {
        console.error('[CameraPanel] Error playing remote video:', err);
      });
    }
  }, [remoteStream]);

  const isConnected = callStatus === 'connected';
  const isConnecting = callStatus === 'connecting';
  const showRemote = isConnected || remoteStream;

  return (
    <Card className="bg-slate-900/50 border-white/10 p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          Camera
          {isConnecting && (
            <span className="text-xs text-amber-400 animate-pulse">Connecting...</span>
          )}
          {isConnected && (
            <span className="text-xs text-emerald-400">● Connected</span>
          )}
        </h3>
        <div className="flex items-center space-x-2">
          <Button
            onClick={toggleCamera}
            disabled={isConnecting}
            variant="outline"
            size="sm"
            className="border-white/10 text-white hover:bg-white/5 text-xs h-8"
          >
            {isConnecting ? '...' : isCameraOn ? (
              <><VideoOff className="w-3 h-3 mr-1" /> Off</>
            ) : (
              <><Video className="w-3 h-3 mr-1" /> On</>
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
        {/* Main Video (Remote/Opponent) */}
        <div className="absolute inset-0">
          {showRemote ? (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover rounded-lg"
              />
              <div className="absolute bottom-4 left-4 px-4 py-2 bg-black/70 rounded-lg text-base text-white font-medium">
                {opponentName}
              </div>
              {isConnected && (
                <div className="absolute top-3 right-3 w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              <VideoOff className="w-12 h-12 mb-2 opacity-50" />
              <p className="text-sm">
                {isConnecting 
                  ? 'Connecting to opponent...' 
                  : 'Opponent camera off'}
              </p>
            </div>
          )}
        </div>

        {/* Picture-in-Picture (Local) */}
        <div className="absolute bottom-4 right-4 w-32 h-24 rounded-lg overflow-hidden border-2 border-white/20 bg-slate-800 shadow-lg">
          {isCameraOn && localStream ? (
            <>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-1 left-1 px-2 py-0.5 bg-black/60 rounded text-xs text-white">
                {myName}
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-800">
              <VideoOff className="w-6 h-6 text-gray-500" />
            </div>
          )}
        </div>
      </div>

      {/* Connection Status Footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            isCameraOn ? 'bg-emerald-500' : 'bg-gray-500'
          }`} />
          <span>Your camera: {isCameraOn ? 'On' : 'Off'}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-emerald-500' : 
            isConnecting ? 'bg-amber-500 animate-pulse' : 'bg-gray-500'
          }`} />
          <span>Opponent: {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Off'}</span>
        </div>
      </div>
    </Card>
  );
}
