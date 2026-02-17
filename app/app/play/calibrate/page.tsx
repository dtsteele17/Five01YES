'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Camera, 
  CheckCircle2, 
  AlertCircle, 
  RotateCcw,
  ArrowLeft,
  Info,
  Crosshair,
  Save
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { DartboardAutoscorer } from '@/components/app/DartboardAutoscorer';

interface CalibrationData {
  homography: number[][];
  points: { x: number; y: number }[];
  createdAt: string;
}

export default function CalibratePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCalibrated, setIsCalibrated] = useState(false);
  const [savedCalibration, setSavedCalibration] = useState<CalibrationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  // Load saved calibration on mount
  useEffect(() => {
    loadCalibration();
  }, []);

  // Start camera when component mounts
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'environment'
        },
        audio: false
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('Could not access camera. Please allow camera permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const loadCalibration = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please sign in to save calibration');
        return;
      }

      // Check localStorage first for quick access
      const localCalibration = localStorage.getItem(`dartboard_calibration_${user.id}`);
      if (localCalibration) {
        const parsed = JSON.parse(localCalibration);
        setSavedCalibration(parsed);
        setIsCalibrated(true);
      }

      // Also check Supabase for persistence across devices
      const { data, error } = await supabase
        .from('user_settings')
        .select('dartboard_calibration')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading calibration:', error);
      }

      if (data?.dartboard_calibration) {
        setSavedCalibration(data.dartboard_calibration);
        setIsCalibrated(true);
        // Update localStorage
        localStorage.setItem(`dartboard_calibration_${user.id}`, JSON.stringify(data.dartboard_calibration));
      }
    } catch (error) {
      console.error('Error loading calibration:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveCalibration = async (homography: number[][], points: { x: number; y: number }[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Please sign in to save calibration');
        return;
      }

      const calibrationData: CalibrationData = {
        homography,
        points,
        createdAt: new Date().toISOString()
      };

      // Save to localStorage for quick access
      localStorage.setItem(`dartboard_calibration_${user.id}`, JSON.stringify(calibrationData));

      // Save to Supabase for persistence
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          dartboard_calibration: calibrationData,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error saving to Supabase:', error);
        toast.error('Saved locally but failed to sync to cloud');
      } else {
        toast.success('Calibration saved successfully!');
      }

      setSavedCalibration(calibrationData);
      setIsCalibrated(true);
    } catch (error) {
      console.error('Error saving calibration:', error);
      toast.error('Failed to save calibration');
    }
  };

  const handleCalibrationComplete = (homography: number[][], points: { x: number; y: number }[]) => {
    saveCalibration(homography, points);
  };

  const handleReset = () => {
    setIsCalibrated(false);
    setSavedCalibration(null);
    toast.info('Calibration reset. Please calibrate your dartboard.');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/app/play">
              <Button variant="outline" size="sm" className="border-slate-600">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </Link>
            <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">
              <Camera className="w-3 h-3 mr-1" />
              Beta
            </Badge>
          </div>
          <h1 className="text-3xl font-bold text-white">AutoScoring Calibration</h1>
          <p className="text-slate-400 mt-1">
            Set up automatic dart detection using your camera
          </p>
        </div>

        {isCalibrated && (
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-medium">Calibrated</span>
          </div>
        )}
      </div>

      {/* Info Card */}
      <Card className="bg-blue-500/10 border-blue-500/30 p-4">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-200 space-y-1">
            <p className="font-medium text-blue-100">How to calibrate:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Position your camera to see the entire dartboard clearly</li>
              <li>Ensure good lighting - avoid shadows on the board</li>
              <li>Click on the wire where two segment numbers meet (e.g., 20 and 1)</li>
              <li>Continue clicking all 20 boundaries around the board</li>
              <li>For best accuracy, complete all 20 points, but you can start with 4</li>
            </ol>
          </div>
        </div>
      </Card>

      {/* Main Content */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Camera Feed */}
        <Card className="bg-slate-900 border-slate-700 p-4">
          <h3 className="text-white font-medium mb-4 flex items-center gap-2">
            <Camera className="w-4 h-4" />
            Camera Feed
          </h3>
          
          <div className="relative aspect-video bg-slate-800 rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            
            {!stream && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Camera className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-500">Camera not available</p>
                  <Button 
                    onClick={startCamera} 
                    variant="outline" 
                    size="sm"
                    className="mt-2 border-slate-600"
                  >
                    Retry Camera
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Calibration Status */}
          {isCalibrated && savedCalibration && (
            <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm">
                    Calibrated with {savedCalibration.points.length} points
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  {new Date(savedCalibration.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Calibration Interface */}
        <Card className="bg-slate-900 border-slate-700 p-4">
          <h3 className="text-white font-medium mb-4 flex items-center gap-2">
            <Crosshair className="w-4 h-4" />
            Calibration
          </h3>

          {stream ? (
            <DartboardAutoscorer
              videoElement={videoRef.current}
              onCalibrationComplete={handleCalibrationComplete}
              isCalibrated={isCalibrated}
              savedHomography={savedCalibration?.homography || null}
              mode="calibration"
            />
          ) : (
            <div className="text-center py-12">
              <Camera className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-500">Camera access required for calibration</p>
            </div>
          )}
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <Link href="/app/play">
          <Button variant="outline" className="border-slate-600">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Play
          </Button>
        </Link>

        {isCalibrated && (
          <Button 
            onClick={handleReset}
            variant="outline"
            className="border-rose-500/50 text-rose-400"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Calibration
          </Button>
        )}
      </div>
    </div>
  );
}
