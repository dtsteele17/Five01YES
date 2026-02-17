'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface RecentMatch {
  id: string;
  room_id: string;
  opponent_id: string;
  opponent_username: string;
  game_mode: number;
  match_format: string;
  result: 'win' | 'loss' | 'draw';
  legs_won: number;
  legs_lost: number;
  three_dart_avg: number;
  first9_avg: number;
  highest_checkout: number;
  checkout_percentage: number;
  darts_thrown: number;
  total_score: number;
  visits_100_plus: number;
  visits_140_plus: number;
  visits_180: number;
  played_at: string;
  bot_level?: number;
  // Opponent stats
  opponent_three_dart_avg?: number;
  opponent_first9_avg?: number;
  opponent_highest_checkout?: number;
  opponent_checkout_percentage?: number;
  opponent_darts_thrown?: number;
  opponent_visits_100_plus?: number;
  opponent_visits_140_plus?: number;
  opponent_visits_180?: number;
}

export function useRecentMatches(limit: number = 5) {
  const [matches, setMatches] = useState<RecentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const loadRecentMatches = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      console.log('[useRecentMatches] Fetching matches for user:', user.id);

      // Fetch from match_history - 301/501 quick matches AND dartbot matches for play menu
      // Simple query without joins to avoid 400 errors
      const { data: historyData, error: fetchError } = await supabase
        .from('match_history')
        .select('*')
        .eq('user_id', user.id)
        .in('match_format', ['quick', 'dartbot'])
        .in('game_mode', [301, 501])
        .order('played_at', { ascending: false })
        .limit(limit);

      if (fetchError) {
        console.error('[useRecentMatches] Error fetching matches:', fetchError);
        setError(fetchError.message);
        return;
      }

      console.log('[useRecentMatches] Fetched matches:', historyData?.length || 0);
      
      // Debug: Log dartbot matches and their opponent stats
      const dartbotMatches = (historyData || []).filter((m: any) => m.match_format === 'dartbot');
      if (dartbotMatches.length > 0) {
        console.log('[useRecentMatches] Dartbot matches found:', dartbotMatches.length);
        dartbotMatches.forEach((m: any, i: number) => {
          console.log(`  [Dartbot ${i + 1}]`, {
            opponent_avg: m.opponent_three_dart_avg,
            opponent_180s: m.opponent_visits_180,
            bot_level: m.bot_level,
          });
        });
      }

      // Get unique opponent IDs
      const opponentIds = [...new Set((historyData || []).map(m => m.opponent_id).filter(Boolean))];
      
      // Fetch opponent usernames separately
      let opponentMap: Record<string, string> = {};
      if (opponentIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('user_id, username')
          .in('user_id', opponentIds);
        
        opponentMap = (profilesData || []).reduce((acc, profile) => {
          acc[profile.user_id] = profile.username;
          return acc;
        }, {} as Record<string, string>);
      }

      // Transform data to include opponent username and all stats
      const transformedData: RecentMatch[] = (historyData || []).map((match: any) => ({
        id: match.id,
        room_id: match.room_id,
        opponent_id: match.opponent_id,
        opponent_username: match.match_format === 'dartbot' 
          ? `DartBot (${match.bot_level || '?'})`
          : opponentMap[match.opponent_id] || 'Unknown',
        game_mode: match.game_mode,
        match_format: match.match_format,
        result: match.result,
        legs_won: match.legs_won,
        legs_lost: match.legs_lost,
        three_dart_avg: match.three_dart_avg || 0,
        first9_avg: match.first9_avg || 0,
        highest_checkout: match.highest_checkout || 0,
        checkout_percentage: match.checkout_percentage || 0,
        darts_thrown: match.darts_thrown || 0,
        total_score: match.total_score || 0,
        visits_100_plus: match.visits_100_plus || 0,
        visits_140_plus: match.visits_140_plus || 0,
        visits_180: match.visits_180 || 0,
        played_at: match.played_at,
        bot_level: match.bot_level,
        // Opponent stats - provide defaults if missing
        opponent_three_dart_avg: match.opponent_three_dart_avg || 0,
        opponent_first9_avg: match.opponent_first9_avg || 0,
        opponent_highest_checkout: match.opponent_highest_checkout || 0,
        opponent_checkout_percentage: match.opponent_checkout_percentage || 0,
        opponent_darts_thrown: match.opponent_darts_thrown || 0,
        opponent_visits_100_plus: match.opponent_visits_100_plus || 0,
        opponent_visits_140_plus: match.opponent_visits_140_plus || 0,
        opponent_visits_180: match.opponent_visits_180 || 0,
      }));

      setMatches(transformedData);
    } catch (err) {
      console.error('[useRecentMatches] Unexpected error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [supabase, limit]);

  useEffect(() => {
    loadRecentMatches();
  }, [loadRecentMatches]);

  // Subscribe to realtime changes
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel>;

    async function setupSubscription() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      channel = supabase
        .channel('match_history_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'match_history',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('[useRecentMatches] Realtime update:', payload);
            // Refresh matches when data changes
            loadRecentMatches();
          }
        )
        .subscribe();
    }

    setupSubscription();

    return () => {
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [supabase, loadRecentMatches]);

  return { matches, loading, error, refresh: loadRecentMatches };
}

// Hook for fetching all matches (last 3 months)
export function useAllMatches(days: number = 90) {
  const [matches, setMatches] = useState<RecentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadAllMatches() {
      try {
        setLoading(true);
        setError(null);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const since = new Date();
        since.setDate(since.getDate() - days);

        const { data: historyData, error: fetchError } = await supabase
          .from('match_history')
          .select('*')
          .eq('user_id', user.id)
          .gte('played_at', since.toISOString())
          .order('played_at', { ascending: false });

        if (fetchError) {
          console.error('[useAllMatches] Error fetching matches:', fetchError);
          setError(fetchError.message);
          return;
        }

        // Get unique opponent IDs
        const opponentIds = [...new Set((historyData || []).map(m => m.opponent_id).filter(Boolean))];
        
        // Fetch opponent usernames separately
        let opponentMap: Record<string, string> = {};
        if (opponentIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('user_id, username')
            .in('user_id', opponentIds);
          
          opponentMap = (profilesData || []).reduce((acc, profile) => {
            acc[profile.user_id] = profile.username;
            return acc;
          }, {} as Record<string, string>);
        }

        const transformedData: RecentMatch[] = (historyData || []).map((match: any) => ({
          id: match.id,
          room_id: match.room_id,
          opponent_id: match.opponent_id,
          opponent_username: match.match_format === 'dartbot' 
            ? `DartBot (${match.bot_level || '?'})`
            : opponentMap[match.opponent_id] || 'Unknown',
          game_mode: match.game_mode,
          match_format: match.match_format,
          result: match.result,
          legs_won: match.legs_won,
          legs_lost: match.legs_lost,
          three_dart_avg: match.three_dart_avg || 0,
          first9_avg: match.first9_avg || 0,
          highest_checkout: match.highest_checkout || 0,
          checkout_percentage: match.checkout_percentage || 0,
          darts_thrown: match.darts_thrown || 0,
          total_score: match.total_score || 0,
          visits_100_plus: match.visits_100_plus || 0,
          visits_140_plus: match.visits_140_plus || 0,
          visits_180: match.visits_180 || 0,
          played_at: match.played_at,
          bot_level: match.bot_level,
        }));

        setMatches(transformedData);
      } catch (err) {
        console.error('[useAllMatches] Unexpected error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadAllMatches();
  }, [supabase, days]);

  return { matches, loading, error };
}
