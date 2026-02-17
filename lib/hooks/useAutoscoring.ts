'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface CalibrationData {
  homography: number[][];
  points: { x: number; y: number }[];
  createdAt: string;
}

interface AutoscoringState {
  isCalibrated: boolean;
  calibrationData: CalibrationData | null;
  isEnabled: boolean;
  videoElement: HTMLVideoElement | null;
  stream: MediaStream | null;
}

export function useAutoscoring() {
  const [state, setState] = useState<AutoscoringState>({
    isCalibrated: false,
    calibrationData: null,
    isEnabled: false,
    videoElement: null,
    stream: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Load calibration on mount
  useEffect(() => {
    loadCalibration();
  }, []);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [state.stream]);

  const loadCalibration = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Check localStorage first
      const localCalibration = localStorage.getItem(`dartboard_calibration_${user.id}`);
      if (localCalibration) {
        const parsed = JSON.parse(localCalibration);
        setState(prev => ({
          ...prev,
          isCalibrated: true,
          calibrationData: parsed
        }));
      }

      // Also check Supabase
      const { data, error } = await supabase
        .from('user_settings')
        .select('dartboard_calibration')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data?.dartboard_calibration) {
        setState(prev => ({
          ...prev,
          isCalibrated: true,
          calibrationData: data.dartboard_calibration
        }));
        localStorage.setItem(`dartboard_calibration_${user.id}`, JSON.stringify(data.dartboard_calibration));
      }
    } catch (error) {
      console.error('Error loading calibration:', error);
    } finally {
      setIsLoading(false);
    }
  };

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
      
      setState(prev => ({ ...prev, stream: mediaStream }));
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
      return mediaStream;
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('Could not access camera. Please allow camera permissions.');
      return null;
    }
  };

  const stopCamera = () => {
    if (state.stream) {
      state.stream.getTracks().forEach(track => track.stop());
      setState(prev => ({ ...prev, stream: null, videoElement: null }));
    }
  };

  const enableAutoscoring = useCallback(async () => {
    if (!state.isCalibrated) {
      toast.error('Please calibrate your dartboard first in the Play menu');
      return false;
    }

    const stream = await startCamera();
    if (!stream) {
      return false;
    }

    // Create video element if not exists
    if (!videoRef.current) {
      videoRef.current = document.createElement('video');
      videoRef.current.autoplay = true;
      videoRef.current.playsInline = true;
      videoRef.current.muted = true;
    }
    
    videoRef.current.srcObject = stream;
    
    setState(prev => ({ 
      ...prev, 
      isEnabled: true, 
      stream,
      videoElement: videoRef.current 
    }));
    
    toast.success('AutoScoring enabled! Camera is active.');
    return true;
  }, [state.isCalibrated]);

  const disableAutoscoring = useCallback(() => {
    stopCamera();
    setState(prev => ({ 
      ...prev, 
      isEnabled: false, 
      stream: null,
      videoElement: null 
    }));
    toast.info('AutoScoring disabled');
  }, []);

  const toggleAutoscoring = useCallback(async () => {
    if (state.isEnabled) {
      disableAutoscoring();
      return false;
    } else {
      return await enableAutoscoring();
    }
  }, [state.isEnabled, enableAutoscoring, disableAutoscoring]);

  return {
    ...state,
    isLoading,
    videoRef,
    enableAutoscoring,
    disableAutoscoring,
    toggleAutoscoring,
    refreshCalibration: loadCalibration
  };
}
