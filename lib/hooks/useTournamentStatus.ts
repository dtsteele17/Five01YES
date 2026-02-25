'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface Tournament {
  id: string;
  name: string;
  status: string;
  start_at: string;
  max_participants: number;
}

interface TournamentStatusHook {
  tournament: Tournament | null;
  timeUntilStart: number | null;
  showCountdown: boolean;
  checkStatus: () => Promise<void>;
}

export function useTournamentStatus(tournamentId: string): TournamentStatusHook {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [timeUntilStart, setTimeUntilStart] = useState<number | null>(null);
  const [showCountdown, setShowCountdown] = useState(false);
  const supabase = createClient();

  const loadTournament = async () => {
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, status, start_at, max_participants')
        .eq('id', tournamentId)
        .single();

      if (error) throw error;
      setTournament(data);

      // Calculate time until start
      if (data.start_at && ['registration', 'scheduled', 'checkin'].includes(data.status)) {
        const startTime = new Date(data.start_at);
        const now = new Date();
        const timeDiff = startTime.getTime() - now.getTime();
        const secondsUntilStart = Math.ceil(timeDiff / 1000);
        
        setTimeUntilStart(secondsUntilStart);
        
        // Show countdown if tournament starts in next 60 seconds
        if (secondsUntilStart > 0 && secondsUntilStart <= 60) {
          setShowCountdown(true);
        } else {
          setShowCountdown(false);
        }
      } else {
        setTimeUntilStart(null);
        setShowCountdown(false);
      }
    } catch (error) {
      console.error('Error loading tournament:', error);
    }
  };

  const checkStatus = async () => {
    try {
      console.log('Checking tournament status for:', tournamentId);
      
      // Use the SQL function to check and update tournament status
      const { data: statusResult, error: statusError } = await supabase
        .rpc('check_tournament_status', { p_tournament_id: tournamentId });

      if (statusError) {
        console.error('Error checking tournament status:', statusError);
        return;
      }

      console.log('Tournament status check result:', statusResult);

      // If tournament was cancelled, show toast
      if (statusResult?.action === 'cancelled') {
        toast.error(`Tournament cancelled: ${statusResult.reason || 'Insufficient participants'}`);
      } else if (statusResult?.action === 'started') {
        toast.success('Tournament has started!');
      }

      // Reload tournament data
      await loadTournament();

    } catch (error) {
      console.error('Error in tournament status check:', error);
    }
  };

  useEffect(() => {
    if (!tournamentId) return;

    loadTournament();

    // Set up interval to check status every 10 seconds
    const interval = setInterval(checkStatus, 10000);

    // Set up countdown timer if needed
    let countdownInterval: NodeJS.Timeout | null = null;
    if (timeUntilStart && timeUntilStart > 0) {
      countdownInterval = setInterval(() => {
        setTimeUntilStart(prev => {
          if (prev && prev > 0) {
            return prev - 1;
          } else {
            if (countdownInterval) clearInterval(countdownInterval);
            setShowCountdown(false);
            checkStatus();
            return 0;
          }
        });
      }, 1000);
    }

    return () => {
      clearInterval(interval);
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [tournamentId]);

  return {
    tournament,
    timeUntilStart,
    showCountdown,
    checkStatus
  };
}