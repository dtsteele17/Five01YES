'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Target, 
  CheckCircle2, 
  Camera, 
  AlertCircle,
  RotateCcw,
  Play,
  Crosshair
} from 'lucide-react';
import { toast } from 'sonner';

interface Point { x: number; y: number; }

interface DartboardAutoscorerProps {
  videoElement: HTMLVideoElement | null;
  onScore?: (score: { segment: number; multiplier: number; points: number }) => void;
  onCalibrationComplete?: (homography: number[][], points: Point[]) => void;
  isCalibrated?: boolean;
  savedHomography?: number[][] | null;
  mode?: 'calibration' | 'scoring';
}

const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

const CALIBRATION_POINTS = [
  { seg1: 20, seg2: 1, angle: 0 }, { seg1: 1, seg2: 18, angle: 18 },
  { seg1: 18, seg2: 4, angle: 36 }, { seg1: 4, seg2: 13, angle: 54 },
  { seg1: 13, seg2: 6, angle: 72 }, { seg1: 6, seg2: 10, angle: 90 },
  { seg1: 10, seg2: 15, angle: 108 }, { seg1: 15, seg2: 2, angle: 126 },
  { seg1: 2, seg2: 17, angle: 144 }, { seg1: 17, seg2: 3, angle: 162 },
  { seg1: 3, seg2: 19, angle: 180 }, { seg1: 19, seg2: 7, angle: 198 },
  { seg1: 7, seg2: 16, angle: 216 }, { seg1: 16, seg2: 8, angle: 234 },
  { seg1: 8, seg2: 11, angle: 252 }, { seg1: 11, seg2: 14, angle: 270 },
  { seg1: 14, seg2: 9, angle: 288 }, { seg1: 9, seg2: 12, angle: 306 },
  { seg1: 12, seg2: 5, angle: 324 }, { seg1: 5, seg2: 20, angle: 342 },
];

export function DartboardAutoscorer({ 
  videoElement, 
  onScore,
  onCalibrationComplete,
  isCalibrated = false,
  savedHomography = null,
  mode = 'calibration'
}: DartboardAutoscorerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const referenceCanvasRef = useRef<HTMLCanvasElement>(null);
  const [internalMode, setInternalMode] = useState<'calibrating' | 'ready' | 'detecting'>(
    isCalibrated ? 'ready' : 'calibrating'
  );
  const [clickedPoints, setClickedPoints] = useState<Point[]>([]);
  const [score, setScore] = useState<{ segment: number; multiplier: number; points: number } | null>(null);
  const [homography, setHomography] = useState<number[][] | null>(savedHomography);
  const [lastDetection, setLastDetection] = useState<number>(0);
  const [isDetecting, setIsDetecting] = useState(false);

  const currentMode = mode === 'scoring' && isCalibrated ? 'scoring' : internalMode;
  const currentTarget = CALIBRATION_POINTS[clickedPoints.length];

  // Reset when saved homography changes
  useEffect(() => {
    if (savedHomography) {
      setHomography(savedHomography);
      setInternalMode('ready');
    }
  }, [savedHomography]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (currentMode !== 'calibrating' || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 640 / rect.width;
    const scaleY = 480 / rect.height;
    const point = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
    
    const newPoints = [...clickedPoints, point];
    setClickedPoints(newPoints);
    
    if (newPoints.length >= 4) {
      const H = computeHomography(newPoints.slice(0, 4));
      setHomography(H);
    }
    
    if (newPoints.length === 20) {
      setInternalMode('ready');
      const finalH = computeHomography(newPoints);
      setHomography(finalH);
      onCalibrationComplete?.(finalH, newPoints);
      toast.success('Calibration complete! You can now start detection.');
    }
  };

  const startDetection = () => {
    if (!canvasRef.current || !referenceCanvasRef.current || !videoElement) {
      toast.error('Camera not available');
      return;
    }
    
    const ctx = canvasRef.current.getContext('2d');
    const refCtx = referenceCanvasRef.current.getContext('2d');
    if (!ctx || !refCtx) return;
    
    // Capture reference frame
    ctx.drawImage(videoElement, 0, 0, 640, 480);
    refCtx.drawImage(videoElement, 0, 0, 640, 480);
    
    setInternalMode('detecting');
    setIsDetecting(true);
    toast.success('Detection started! Throw your darts.');
  };

  const stopDetection = () => {
    setIsDetecting(false);
    setInternalMode('ready');
  };

  const resetCalibration = () => {
    setClickedPoints([]);
    setHomography(null);
    setInternalMode('calibrating');
    setScore(null);
    setIsDetecting(false);
    toast.info('Calibration reset. Click on the dartboard to calibrate.');
  };

  const computeHomography = (srcPoints: Point[]): number[][] => {
    const size = 400;
    const center = { x: size/2, y: size/2 };
    const radius = size/2 - 20;
    
    const dstPoints = srcPoints.map((_, i) => {
      const angle = (CALIBRATION_POINTS[i].angle - 90) * Math.PI / 180;
      return {
        x: center.x + radius * Math.cos(angle),
        y: center.y + radius * Math.sin(angle)
      };
    });
    
    return solveHomography(srcPoints, dstPoints);
  };

  const solveHomography = (src: Point[], dst: Point[]): number[][] => {
    const sx = src.map(p => p.x), sy = src.map(p => p.y);
    const dx = dst.map(p => p.x), dy = dst.map(p => p.y);
    
    const cx = sx.reduce((a, b) => a + b) / 4;
    const cy = sy.reduce((a, b) => a + b) / 4;
    const cX = dx.reduce((a, b) => a + b) / 4;
    const cY = dy.reduce((a, b) => a + b) / 4;
    
    const A: number[][] = [];
    for (let i = 0; i < 4; i++) {
      const x = sx[i] - cx, y = sy[i] - cy;
      const X = dx[i] - cX, Y = dy[i] - cY;
      A.push([x, y, 1, 0, 0, 0, -X*x, -X*y, -X]);
      A.push([0, 0, 0, x, y, 1, -Y*x, -Y*y, -Y]);
    }
    
    const h = solveLinearSystem(A);
    return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], h[8]]];
  };

  const solveLinearSystem = (A: number[][]): number[] => {
    try {
      const result = gaussianElimination(A, new Array(A.length).fill(0));
      return result;
    } catch {
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
  };

  const gaussianElimination = (A: number[][], b: number[]): number[] => {
    const n = A.length;
    const m = A[0].length;
    const aug = A.map((row, i) => [...row.slice(0, m), b[i]]);
    
    for (let i = 0; i < n; i++) {
      let maxEl = Math.abs(aug[i][i]);
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(aug[k][i]) > maxEl) {
          maxEl = Math.abs(aug[k][i]);
          maxRow = k;
        }
      }
      
      [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
      
      if (Math.abs(aug[i][i]) < 1e-10) continue;
      
      for (let k = i + 1; k < n; k++) {
        const c = -aug[k][i] / aug[i][i];
        for (let j = i; j <= m; j++) {
          aug[k][j] += c * aug[i][j];
        }
      }
    }
    
    const x = new Array(n).fill(0);
    for (let i = Math.min(n, m) - 1; i >= 0; i--) {
      if (Math.abs(aug[i][i]) < 1e-10) continue;
      x[i] = aug[i][m] / aug[i][i];
      for (let k = i - 1; k >= 0; k--) {
        aug[k][m] -= aug[k][i] * x[i];
      }
    }
    
    return [...x, ...new Array(9 - x.length).fill(0)];
  };

  const applyHomography = (point: Point, H: number[][]): Point => {
    const x = H[0][0] * point.x + H[0][1] * point.y + H[0][2];
    const y = H[1][0] * point.x + H[1][1] * point.y + H[1][2];
    const w = H[2][0] * point.x + H[2][1] * point.y + H[2][2];
    return { x: x / w, y: y / w };
  };

  const calculateScoreFromBoardCoords = (tip: Point) => {
    const center = { x: 200, y: 200 };
    const dx = tip.x - center.x;
    const dy = tip.y - center.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    
    let degrees = (angle * 180 / Math.PI + 360 + 90) % 360;
    const segmentIndex = Math.floor(degrees / 18) % 20;
    const segment = SEGMENTS[segmentIndex];
    
    const scale = 170 / 200;
    const r = distance * scale;
    
    let multiplier = 1;
    if (r < 12.7) multiplier = 50;
    else if (r < 31.8) multiplier = 25;
    else if (r >= 99 && r <= 107) multiplier = 3;
    else if (r >= 162 && r <= 170) multiplier = 2;
    else if (r > 170) multiplier = 0;
    
    const points = multiplier > 20 ? multiplier : segment * multiplier;
    return { segment, multiplier, points };
  };

  const detectDart = useCallback(() => {
    if (!canvasRef.current || !referenceCanvasRef.current || !videoElement || !homography) return;
    
    const canvas = canvasRef.current;
    const refCanvas = referenceCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const refCtx = refCanvas.getContext('2d');
    if (!ctx || !refCtx) return;
    
    ctx.drawImage(videoElement, 0, 0, 640, 480);
    
    const current = ctx.getImageData(0, 0, 640, 480);
    const reference = refCtx.getImageData(0, 0, 640, 480);
    
    const threshold = 30;
    let dartPixels: Point[] = [];
    
    for (let i = 0; i < current.data.length; i += 4) {
      const diff = Math.abs(current.data[i] - reference.data[i]) +
                   Math.abs(current.data[i + 1] - reference.data[i + 1]) +
                   Math.abs(current.data[i + 2] - reference.data[i + 2]);
      
      if (diff > threshold * 3) {
        const pixelIndex = i / 4;
        dartPixels.push({
          x: pixelIndex % 640,
          y: Math.floor(pixelIndex / 640)
        });
      }
    }
    
    if (dartPixels.length < 100) return;
    
    const centroid = {
      x: dartPixels.reduce((s, p) => s + p.x, 0) / dartPixels.length,
      y: dartPixels.reduce((s, p) => s + p.y, 0) / dartPixels.length
    };
    
    // Find tip as farthest point from centroid
    let tip = dartPixels[0];
    let maxDist = 0;
    for (const p of dartPixels) {
      const dist = Math.pow(p.x - centroid.x, 2) + Math.pow(p.y - centroid.y, 2);
      if (dist > maxDist) {
        maxDist = dist;
        tip = p;
      }
    }
    
    const boardTip = applyHomography(tip, homography);
    const newScore = calculateScoreFromBoardCoords(boardTip);
    
    // Debounce detection (1 second cooldown)
    if (Date.now() - lastDetection > 1000) {
      setScore(newScore);
      setLastDetection(Date.now());
      onScore?.(newScore);
      
      // Draw detection indicator
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 15, 0, Math.PI * 2);
      ctx.stroke();
      
      // Draw label
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`${newScore.points}`, tip.x + 20, tip.y);
    }
    
  }, [videoElement, homography, lastDetection, onScore]);

  useEffect(() => {
    if (!isDetecting || currentMode !== 'detecting') return;
    const interval = setInterval(detectDart, 100);
    return () => clearInterval(interval);
  }, [isDetecting, currentMode, detectDart]);

  const progress = Math.min((clickedPoints.length / 20) * 100, 100);
  const canStartWithPartial = clickedPoints.length >= 4 && internalMode === 'calibrating';

  return (
    <div className="space-y-4">
      {/* Status Card */}
      <Card className="bg-slate-900 border-slate-700 p-4">
        {internalMode === 'calibrating' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-amber-400" />
              <span className="text-white font-medium">
                Click where segments {currentTarget?.seg1} and {currentTarget?.seg2} meet
              </span>
            </div>
            <div className="text-sm text-slate-400">
              Progress: {clickedPoints.length}/20 ({Math.round(progress)}%)
              {canStartWithPartial && ' - Can start now or continue for better accuracy'}
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2">
              <div 
                className="bg-amber-500 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            {canStartWithPartial && (
              <Button 
                onClick={() => {
                  setInternalMode('ready');
                  onCalibrationComplete?.(homography!, clickedPoints);
                }}
                variant="outline"
                className="border-amber-500/50 text-amber-400"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Start with {clickedPoints.length} points
              </Button>
            )}
          </div>
        )}
        
        {internalMode === 'ready' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">
                ✓ Calibrated with {clickedPoints.length || 4}+ points
              </span>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={startDetection}
                className="bg-emerald-500 hover:bg-emerald-600"
              >
                <Play className="w-4 h-4 mr-2" />
                Start Detection
              </Button>
              <Button 
                onClick={resetCalibration}
                variant="outline"
                className="border-slate-600"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Recalibrate
              </Button>
            </div>
          </div>
        )}
        
        {internalMode === 'detecting' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-rose-400 animate-pulse">
              <Camera className="w-5 h-5" />
              <span className="font-medium">🔴 Detecting darts...</span>
            </div>
            <Button 
              onClick={stopDetection}
              variant="outline"
              className="border-rose-500/50 text-rose-400"
            >
              Stop Detection
            </Button>
          </div>
        )}
      </Card>
      
      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          onClick={handleCanvasClick}
          className={`w-full max-w-[640px] border-2 rounded-lg ${
            internalMode === 'calibrating' 
              ? 'border-amber-500/50 cursor-crosshair' 
              : 'border-slate-700'
          }`}
        />
        
        {/* Clicked points overlay */}
        {clickedPoints.length > 0 && internalMode === 'calibrating' && (
          <div className="absolute top-2 left-2 flex flex-wrap gap-1 max-w-[200px]">
            {clickedPoints.map((_, i) => (
              <Badge 
                key={i} 
                className="bg-slate-900/80 text-amber-400 border-amber-500/30 text-xs"
              >
                {CALIBRATION_POINTS[i]?.seg1}-{CALIBRATION_POINTS[i]?.seg2} ✓
              </Badge>
            ))}
          </div>
        )}
      </div>
      
      {/* Hidden reference canvas */}
      <canvas 
        ref={referenceCanvasRef} 
        width={640} 
        height={480} 
        className="hidden" 
      />
      
      {/* Score Display */}
      {score && (
        <Card className="bg-gradient-to-br from-slate-900 to-slate-950 border-rose-500/30 p-6">
          <div className="text-center">
            <div className="text-6xl font-black text-rose-400 mb-2">
              {score.points}
            </div>
            <div className="text-slate-300 text-lg">
              {score.multiplier === 50 ? '🎯 BULLSEYE!' : 
               score.multiplier === 25 ? '🎯 Outer Bull' :
               `${score.multiplier === 3 ? 'Triple' : score.multiplier === 2 ? 'Double' : 'Single'} ${score.segment}`}
            </div>
          </div>
        </Card>
      )}
      
      {/* Instructions */}
      <Card className="bg-slate-800/50 border-slate-700 p-4">
        <h4 className="text-white font-medium mb-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-blue-400" />
          How to use AutoScoring
        </h4>
        <ul className="text-sm text-slate-400 space-y-1 list-disc list-inside">
          <li>Click on all 20 segment boundaries for best accuracy (or at least 4)</li>
          <li>Click where the wire between two numbers meets the outer ring</li>
          <li>Once calibrated, click &quot;Start Detection&quot;</li>
          <li>The system will detect new darts by comparing frames</li>
          <li>Throw your darts - scores will appear automatically</li>
        </ul>
      </Card>
    </div>
  );
}
