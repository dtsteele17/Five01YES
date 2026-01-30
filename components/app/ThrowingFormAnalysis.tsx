'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, Trash2, Activity, Loader2, ArrowLeft } from 'lucide-react';
import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

interface HandTrail {
  points: { x: number; y: number; phase: 'setup' | 'drawback' | 'release' }[];
  throwNumber: number;
  color: string;
}

const PHASE_COLORS = {
  setup: '#3b82f6',    // blue - initial movement
  drawback: '#f59e0b', // amber - peak/preparation
  release: '#10b981',  // green - forward throw
};

const THROW_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#8b5cf6', // purple
];

export default function ThrowingFormAnalysis() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [throwCount, setThrowCount] = useState(0);
  const [handTrails, setHandTrails] = useState<HandTrail[]>([]);
  const [currentTrail, setCurrentTrail] = useState<{ x: number; y: number; phase: 'setup' | 'drawback' | 'release' }[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [throwState, setThrowState] = useState<'idle' | 'ready' | 'throwing'>('idle');
  const [currentPhase, setCurrentPhase] = useState<'setup' | 'drawback' | 'release'>('setup');

  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastHandPositionRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const smoothedHandPositionRef = useRef<{ x: number; y: number } | null>(null);
  const smoothedLandmarksRef = useRef<any[]>([]);
  const isDetectingRef = useRef(false);
  const currentTrailRef = useRef<{ x: number; y: number; phase: 'setup' | 'drawback' | 'release' }[]>([]);
  const handTrailsRef = useRef<HandTrail[]>([]);
  const throwCountRef = useRef(0);
  const isTrackingRef = useRef(false);
  const throwStateRef = useRef<'idle' | 'ready' | 'throwing'>('idle');
  const currentPhaseRef = useRef<'setup' | 'drawback' | 'release'>('setup');
  const framesSinceMotionRef = useRef(0);
  const peakZRef = useRef<number>(0);
  const hasReachedPeakRef = useRef(false);
  const hasExtendedRef = useRef(false);
  const peakDistanceRef = useRef(0);

  useEffect(() => {
    initializePoseLandmarker();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      stopCamera();
    };
  }, []);

  const initializePoseLandmarker = async () => {
    try {
      setIsLoading(true);
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
      );

      const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });

      poseLandmarkerRef.current = poseLandmarker;
      setIsLoading(false);
      startCamera();
    } catch (err) {
      console.error('Error initializing pose detection:', err);
      setError('Failed to initialize pose detection. Please check your browser compatibility.');
      setIsLoading(false);
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          console.log('Camera loaded, starting detection');
          setCameraActive(true);
          isDetectingRef.current = true;
          detectPose();
        };
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Failed to access camera. Please grant camera permissions.');
    }
  };

  const stopCamera = () => {
    isDetectingRef.current = false;
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const detectPose = async () => {
    if (!isDetectingRef.current || !videoRef.current || !canvasRef.current || !poseLandmarkerRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx || video.readyState !== 4) {
      animationFrameRef.current = requestAnimationFrame(detectPose);
      return;
    }

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    try {
      const startTimeMs = performance.now();
      const result = poseLandmarkerRef.current.detectForVideo(video, startTimeMs);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (result.landmarks && result.landmarks.length > 0) {
        const landmarks = result.landmarks[0];

        // Apply heavy smoothing to all landmarks for stability
        const SMOOTHING_FACTOR = 0.8; // Higher = more smoothing, more stable
        if (smoothedLandmarksRef.current.length === 0) {
          smoothedLandmarksRef.current = landmarks.map(lm => ({ ...lm }));
        } else {
          smoothedLandmarksRef.current = landmarks.map((lm, i) => {
            const prev = smoothedLandmarksRef.current[i];
            if (!prev) return { ...lm };
            return {
              x: prev.x * SMOOTHING_FACTOR + lm.x * (1 - SMOOTHING_FACTOR),
              y: prev.y * SMOOTHING_FACTOR + lm.y * (1 - SMOOTHING_FACTOR),
              z: prev.z * SMOOTHING_FACTOR + lm.z * (1 - SMOOTHING_FACTOR),
              visibility: lm.visibility
            };
          });
        }

        drawSkeleton(ctx, smoothedLandmarksRef.current, canvas.width, canvas.height);

        // Use smoothed landmarks for tracking
        const rightWrist = smoothedLandmarksRef.current[16];
        const rightShoulder = smoothedLandmarksRef.current[12];
        const nose = smoothedLandmarksRef.current[0];

        if (rightWrist && rightShoulder && nose) {
          const handX = rightWrist.x * canvas.width;
          const handY = rightWrist.y * canvas.height;
          const handZ = rightWrist.z;

          // Apply smoothing to reduce jitter
          let smoothedX = handX;
          let smoothedY = handY;
          if (smoothedHandPositionRef.current) {
            const smoothing = 0.7;
            smoothedX = smoothedHandPositionRef.current.x * smoothing + handX * (1 - smoothing);
            smoothedY = smoothedHandPositionRef.current.y * smoothing + handY * (1 - smoothing);
          }
          smoothedHandPositionRef.current = { x: smoothedX, y: smoothedY };

          const shoulderX = rightShoulder.x * canvas.width;
          const shoulderY = rightShoulder.y * canvas.height;

          const noseY = nose.y * canvas.height;

          if (lastHandPositionRef.current) {
            const dx = smoothedX - lastHandPositionRef.current.x;
            const dy = smoothedY - lastHandPositionRef.current.y;
            const dz = handZ - lastHandPositionRef.current.z;

            const velocity2D = Math.sqrt(dx * dx + dy * dy) / canvas.width;
            const forwardVelocity = dz;

            const distToShoulder = Math.sqrt(
              Math.pow(smoothedX - shoulderX, 2) + Math.pow(smoothedY - shoulderY, 2)
            ) / canvas.width;

            const isHandHigh = smoothedY < shoulderY + 50;
            const isHandNearBody = distToShoulder < 0.15;

            if (throwStateRef.current === 'idle') {
              if (isHandHigh && isHandNearBody && velocity2D < 0.02) {
                throwStateRef.current = 'ready';
                setThrowState('ready');
              }
            }

            else if (throwStateRef.current === 'ready') {
              const isMovingForward = dz < -0.005 || velocity2D > 0.03;
              const isMovingDown = dy > 0;

              if (isMovingForward || (velocity2D > 0.03 && isMovingDown)) {
                throwStateRef.current = 'throwing';
                setThrowState('throwing');
                isTrackingRef.current = true;
                setIsTracking(true);
                currentPhaseRef.current = 'setup';
                setCurrentPhase('setup');
                currentTrailRef.current = [{ x: smoothedX, y: smoothedY, phase: 'setup' }];
                framesSinceMotionRef.current = 0;
                peakZRef.current = handZ;
                hasReachedPeakRef.current = false;
                hasExtendedRef.current = false;
                peakDistanceRef.current = distToShoulder;
              } else if (!isHandHigh || !isHandNearBody) {
                throwStateRef.current = 'idle';
                setThrowState('idle');
              }
            }

            else if (throwStateRef.current === 'throwing') {
              // Track if hand has extended away from body
              if (distToShoulder > peakDistanceRef.current) {
                peakDistanceRef.current = distToShoulder;
              }

              // Consider extended if hand is far from shoulder
              if (distToShoulder > 0.25) {
                hasExtendedRef.current = true;
              }

              // Determine current phase based on motion
              if (!hasReachedPeakRef.current) {
                // Still in setup/drawback phase - looking for peak
                if (handZ > peakZRef.current) {
                  // Hand is moving backward (drawback)
                  peakZRef.current = handZ;
                  currentPhaseRef.current = 'drawback';
                  setCurrentPhase('drawback');
                } else if (handZ < peakZRef.current - 0.02 || forwardVelocity < -0.01) {
                  // Started moving forward significantly - entering release
                  hasReachedPeakRef.current = true;
                  currentPhaseRef.current = 'release';
                  setCurrentPhase('release');
                }
              } else {
                // In release phase
                currentPhaseRef.current = 'release';
              }

              currentTrailRef.current.push({
                x: smoothedX,
                y: smoothedY,
                phase: currentPhaseRef.current
              });
              setCurrentTrail([...currentTrailRef.current]);

              // Check if throw is complete: hand extended and now moving downward
              const isMovingDown = dy > 0.015;
              const handIsLowering = smoothedY > shoulderY;

              if (hasExtendedRef.current && (isMovingDown || handIsLowering) && distToShoulder < peakDistanceRef.current - 0.1) {
                // Throw complete - hand extended and came back down
                if (currentTrailRef.current.length > 10) {
                  const color = THROW_COLORS[throwCountRef.current % THROW_COLORS.length];
                  const newTrail = {
                    points: [...currentTrailRef.current],
                    throwNumber: throwCountRef.current,
                    color
                  };
                  handTrailsRef.current.push(newTrail);
                  setHandTrails([...handTrailsRef.current]);
                  throwCountRef.current += 1;
                  setThrowCount(throwCountRef.current);
                }

                currentTrailRef.current = [];
                setCurrentTrail([]);
                isTrackingRef.current = false;
                setIsTracking(false);
                throwStateRef.current = 'idle';
                setThrowState('idle');
                currentPhaseRef.current = 'setup';
                setCurrentPhase('setup');
                framesSinceMotionRef.current = 0;
                peakZRef.current = 0;
                hasReachedPeakRef.current = false;
                hasExtendedRef.current = false;
                peakDistanceRef.current = 0;
              }
            }
          }

          lastHandPositionRef.current = { x: smoothedX, y: smoothedY, z: handZ };
        }

        drawHandTrails();
      }
    } catch (err) {
      console.error('Error detecting pose:', err);
    }

    animationFrameRef.current = requestAnimationFrame(detectPose);
  };

  const drawSkeleton = (
    ctx: CanvasRenderingContext2D,
    landmarks: any[],
    width: number,
    height: number
  ) => {
    const connections = [
      [11, 12], // Shoulders
      [11, 13], [13, 15], // Left arm
      [12, 14], [14, 16], // Right arm
      [11, 23], [12, 24], // Torso
      [23, 24], // Hips
      [23, 25], [25, 27], // Left leg
      [24, 26], [26, 28], // Right leg
    ];

    // Draw connections
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    connections.forEach(([start, end]) => {
      const startPoint = landmarks[start];
      const endPoint = landmarks[end];
      if (startPoint && endPoint) {
        ctx.beginPath();
        ctx.moveTo(startPoint.x * width, startPoint.y * height);
        ctx.lineTo(endPoint.x * width, endPoint.y * height);
        ctx.stroke();
      }
    });

    // Draw landmarks
    landmarks.forEach((landmark, index) => {
      if (landmark) {
        ctx.beginPath();
        ctx.arc(landmark.x * width, landmark.y * height, 4, 0, 2 * Math.PI);

        // Highlight hands
        if (index === 15 || index === 16) {
          ctx.fillStyle = '#ef4444';
        } else {
          ctx.fillStyle = '#10b981';
        }
        ctx.fill();
      }
    });
  };

  const drawHandTrails = () => {
    if (!trailCanvasRef.current || !canvasRef.current) return;

    const canvas = trailCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== canvasRef.current.width || canvas.height !== canvasRef.current.height) {
      canvas.width = canvasRef.current.width;
      canvas.height = canvasRef.current.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw completed trails - each throw gets its own solid color
    handTrailsRef.current.forEach((trail) => {
      if (trail.points.length > 1) {
        // Draw shadow/glow effect
        ctx.lineWidth = 11;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = trail.color;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.moveTo(trail.points[0].x, trail.points[0].y);
        for (let i = 1; i < trail.points.length; i++) {
          ctx.lineTo(trail.points[i].x, trail.points[i].y);
        }
        ctx.stroke();

        // Draw main trail line - single color per throw
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = 4;
        ctx.strokeStyle = trail.color;
        ctx.beginPath();
        ctx.moveTo(trail.points[0].x, trail.points[0].y);
        for (let i = 1; i < trail.points.length; i++) {
          ctx.lineTo(trail.points[i].x, trail.points[i].y);
        }
        ctx.stroke();
      }
    });

    // Draw current trail being tracked - single color
    if (currentTrailRef.current.length > 1) {
      const currentColor = THROW_COLORS[throwCountRef.current % THROW_COLORS.length];

      // Draw glow effect
      ctx.lineWidth = 13;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = currentColor;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(currentTrailRef.current[0].x, currentTrailRef.current[0].y);
      for (let i = 1; i < currentTrailRef.current.length; i++) {
        ctx.lineTo(currentTrailRef.current[i].x, currentTrailRef.current[i].y);
      }
      ctx.stroke();

      // Draw main trail - single color
      ctx.globalAlpha = 1.0;
      ctx.lineWidth = 5;
      ctx.strokeStyle = currentColor;
      ctx.beginPath();
      ctx.moveTo(currentTrailRef.current[0].x, currentTrailRef.current[0].y);
      for (let i = 1; i < currentTrailRef.current.length; i++) {
        ctx.lineTo(currentTrailRef.current[i].x, currentTrailRef.current[i].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  };

  const handleWipeTrails = () => {
    handTrailsRef.current = [];
    currentTrailRef.current = [];
    throwCountRef.current = 0;
    isTrackingRef.current = false;
    throwStateRef.current = 'idle';
    currentPhaseRef.current = 'setup';
    framesSinceMotionRef.current = 0;
    peakZRef.current = 0;
    hasReachedPeakRef.current = false;
    hasExtendedRef.current = false;
    peakDistanceRef.current = 0;
    lastHandPositionRef.current = null;
    smoothedHandPositionRef.current = null;
    smoothedLandmarksRef.current = [];

    setHandTrails([]);
    setCurrentTrail([]);
    setThrowCount(0);
    setIsTracking(false);
    setThrowState('idle');
    setCurrentPhase('setup');

    if (trailCanvasRef.current) {
      const ctx = trailCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, trailCanvasRef.current.width, trailCanvasRef.current.height);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-4">
          <Button
            onClick={() => router.push('/app/play')}
            variant="outline"
            size="sm"
            className="border-white/10 text-gray-300 hover:bg-white/5"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Play
          </Button>
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Throwing Form Analysis</h1>
            <p className="text-gray-400">Analyze your dart throwing technique with pose detection</p>
          </div>
        </div>
        <Button
          onClick={handleWipeTrails}
          variant="outline"
          className="border-red-500/30 text-red-400 hover:bg-red-500/10"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Wipe Trails
        </Button>
      </div>

      {error && (
        <Card className="bg-red-500/10 border-red-500/30 p-4">
          <p className="text-red-400">{error}</p>
        </Card>
      )}

      {isLoading && (
        <Card className="bg-slate-900/50 border-white/10 p-12">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
            <p className="text-gray-400">Loading pose detection model...</p>
          </div>
        </Card>
      )}

      <Card className="bg-slate-900/50 border-white/10 p-6">
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover transform -scale-x-100"
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full transform -scale-x-100"
          />
          <canvas
            ref={trailCanvasRef}
            className="absolute inset-0 w-full h-full transform -scale-x-100"
          />

          {!cameraActive && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center space-y-4">
                <Camera className="w-16 h-16 text-gray-400 mx-auto" />
                <p className="text-gray-400">Camera not active</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-4 gap-4">
          <Card className={`bg-slate-800/50 p-4 ${
            throwState === 'ready' ? 'border-yellow-500/50 ring-2 ring-yellow-500/20' :
            throwState === 'throwing' ? 'border-emerald-500/50 ring-2 ring-emerald-500/20' :
            'border-slate-700/30'
          }`}>
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                throwState === 'ready' ? 'bg-yellow-500/20' :
                throwState === 'throwing' ? 'bg-emerald-500/20' :
                'bg-slate-700/50'
              }`}>
                <Activity className={`w-5 h-5 ${
                  throwState === 'ready' ? 'text-yellow-400' :
                  throwState === 'throwing' ? 'text-emerald-400' :
                  'text-gray-500'
                }`} />
              </div>
              <div>
                <p className="text-xs text-gray-400">Throw State</p>
                <p className="text-lg font-bold text-white capitalize">
                  {throwState}
                </p>
              </div>
            </div>
          </Card>

          {isTracking && (
            <Card className="bg-slate-800/50 border-slate-700/30 p-4">
              <div className="flex items-center space-x-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: PHASE_COLORS[currentPhase] + '33' }}
                >
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: PHASE_COLORS[currentPhase] }}
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Current Phase</p>
                  <p className="text-lg font-bold text-white capitalize">
                    {currentPhase}
                  </p>
                </div>
              </div>
            </Card>
          )}

          <Card className="bg-slate-800/50 border-blue-500/30 p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                <span className="text-lg font-bold text-blue-400">{throwCount}</span>
              </div>
              <div>
                <p className="text-xs text-gray-400">Throws Detected</p>
                <p className="text-lg font-bold text-white">{throwCount} throws</p>
              </div>
            </div>
          </Card>

          <Card className="bg-slate-800/50 border-amber-500/30 p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                <span className="text-lg font-bold text-amber-400">{handTrails.length}</span>
              </div>
              <div>
                <p className="text-xs text-gray-400">Trails Recorded</p>
                <p className="text-lg font-bold text-white">{handTrails.length} trails</p>
              </div>
            </div>
          </Card>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-slate-900/50 border-white/10 p-6">
          <h3 className="text-xl font-bold text-white mb-4">How It Works</h3>
          <div className="space-y-3 text-gray-300">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-white">1</span>
              </div>
              <p>Position yourself sideways to the camera with your full body visible</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-white">2</span>
              </div>
              <p>The green skeleton overlay shows your detected pose in real-time</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-white">3</span>
              </div>
              <p>Bring your throwing hand up near your face - the status will change to "Ready"</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-xs font-bold text-white">4</span>
              </div>
              <p>Throw forward - the motion will be tracked with colored phases showing your technique</p>
            </div>
          </div>
        </Card>

        <Card className="bg-slate-900/50 border-white/10 p-6">
          <h3 className="text-xl font-bold text-white mb-4">Throw Colors</h3>
          <div className="space-y-4">
            <div>
              <p className="text-white font-semibold mb-3">Each throw gets a unique color</p>
              <div className="flex flex-wrap gap-3">
                {THROW_COLORS.map((color, i) => (
                  <div key={i} className="flex flex-col items-center space-y-1">
                    <div className="w-10 h-10 rounded-full border-2 border-white/20" style={{ backgroundColor: color }}></div>
                    <p className="text-xs text-gray-400">#{i + 1}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <p className="text-sm text-gray-300 mb-2">How it works:</p>
              <ul className="text-xs text-gray-400 space-y-1 ml-4 list-disc">
                <li>Each throw is tracked as you extend your arm</li>
                <li>After your hand comes down, the throw is saved with its color</li>
                <li>The next throw will be ready with a different color</li>
                <li>Compare multiple throws side-by-side easily</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
