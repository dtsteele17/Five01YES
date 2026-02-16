'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface QuickMatchGame {
  id: string;
  room_id: string;
  opponent_id: string;
  opponent_username: string;
  game_mode: number;
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

export function useRecentQuickMatches(limit: number = 5) {
  const [matches, setMatches] = useState<QuickMatchGame[]>([]);
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

      console.log('[useRecentQuickMatches] Fetching 301/501 quick matches for user:', user.id);

      // Fetch only 301/501 quick matches (not ATC or dartbot)
      const { data: historyData, error: fetchError } = await supabase
        .from('match_history')
        .select(`
          *,
          opponent:opponent_id (username)
        `)
        .eq('user_id', user.id)
        .eq('match_format', 'quick')
        .in('game_mode', [301, 501])
        .order('played_at', { ascending: false })
        .limit(limit);

      if (fetchError) {
        console.error('[useRecentQuickMatches] Error fetching matches:', fetchError);
        setError(fetchError.message);
        return;
      }

      console.log('[useRecentQuickMatches] Fetched matches:', historyData?.length || 0);

      // Transform data to include opponent username and all stats
      const transformedData: QuickMatchGame[] = (historyData || []).map((match: any) => ({
        id: match.id,
        room_id: match.room_id,
        opponent_id: match.opponent_id,
        opponent_username: match.opponent?.username || 'Unknown',
        game_mode: match.game_mode,
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
        // Opponent stats
        opponent_three_dart_avg: match.opponent_three_dart_avg,
        opponent_first9_avg: match.opponent_first9_avg,
        opponent_highest_checkout: match.opponent_highest_checkout,
        opponent_checkout_percentage: match.opponent_checkout_percentage,
        opponent_darts_thrown: match.opponent_darts_thrown,
        opponent_visits_100_plus: match.opponent_visits_100_plus,
        opponent_visits_140_plus: match.opponent_visits_140_plus,
        opponent_visits_180: match.opponent_visits_180,
      }));

      setMatches(transformedData);
    } catch (err) {
      console.error('[useRecentQuickMatches] Unexpected error:', err);
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
        .channel('match_history_quick_changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'match_history',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('[useRecentQuickMatches] Realtime update:', payload);
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
