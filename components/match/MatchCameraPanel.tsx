'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Video, VideoOff, Mic, MicOff } from 'lucide-react';
import { RefObject } from 'react';

interface MatchCameraPanelProps {
  liveVideoRef: RefObject<HTMLVideoElement>;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMyTurn: boolean;
  myName: string;
  opponentName: string;
  callStatus: string;
  isCameraOn: boolean;
  isMicMuted: boolean;
  isVideoDisabled: boolean;
  toggleCamera: () => void;
  toggleMic: () => void;
  toggleVideo: () => void;
}

export function MatchCameraPanel({
  liveVideoRef,
  localStream,
  remoteStream,
  isMyTurn,
  myName,
  opponentName,
  callStatus,
  isCameraOn,
  isMicMuted,
  isVideoDisabled,
  toggleCamera,
  toggleMic,
  toggleVideo,
}: MatchCameraPanelProps) {
  return (
    <Card className="bg-slate-900/50 border-white/10 p-4 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white">Camera</h3>
        <div className="flex items-center space-x-2">
          <Button
            onClick={toggleCamera}
            disabled={callStatus === 'connecting'}
            variant="outline"
            size="sm"
            className="border-white/10 text-white hover:bg-white/5 text-xs h-8"
          >
            {callStatus === 'connecting' ? 'Connecting...' : isCameraOn ? 'Off' : 'On'}
          </Button>
          {isCameraOn && (
            <>
              <Button
                onClick={toggleMic}
                variant="ghost"
                size="sm"
                className={`p-2 h-8 w-8 ${isMicMuted ? 'text-red-400 hover:text-red-300' : 'text-white hover:text-gray-300'}`}
                title={isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
              <Button
                onClick={toggleVideo}
                variant="ghost"
                size="sm"
                className={`p-2 h-8 w-8 ${isVideoDisabled ? 'text-red-400 hover:text-red-300' : 'text-white hover:text-gray-300'}`}
                title={isVideoDisabled ? 'Enable Camera' : 'Disable Camera'}
              >
                {isVideoDisabled ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 relative rounded-lg overflow-hidden bg-slate-950/50 min-h-0">
        <div className="absolute inset-0">
          <video
            ref={liveVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover rounded-lg"
            style={{ display: (isMyTurn && localStream) || (!isMyTurn && remoteStream) ? 'block' : 'none' }}
          />
          {((isMyTurn && localStream) || (!isMyTurn && remoteStream)) && (
            <>
              <div className="absolute bottom-4 left-4 px-4 py-2 bg-black/70 rounded-lg text-base text-white font-medium">
                {isMyTurn ? myName : opponentName}
              </div>
              {callStatus === 'connected' && !isMyTurn && remoteStream && (
                <div className="absolute top-3 right-3 w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
              )}
            </>
          )}
          {!((isMyTurn && localStream) || (!isMyTurn && remoteStream)) && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xl">
              {isMyTurn
                ? 'Your camera is off'
                : (callStatus === 'connected' || callStatus === 'connecting')
                  ? 'Opponent camera connecting...'
                  : 'Opponent camera is off'
              }
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
