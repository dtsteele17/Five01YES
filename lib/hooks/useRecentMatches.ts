'use client';

import { useEffect, useState } from 'react';
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
  played_at: string;
  bot_level?: number;
}

export function useRecentMatches(limit: number = 3) {
  const [matches, setMatches] = useState<RecentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadRecentMatches() {
      try {
        setLoading(true);
        setError(null);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data: historyData, error: fetchError } = await supabase
          .from('match_history')
          .select(`
            *,
            opponent:opponent_id (username)
          `)
          .eq('user_id', user.id)
          .order('played_at', { ascending: false })
          .limit(limit);

        if (fetchError) {
          console.error('[useRecentMatches] Error fetching matches:', fetchError);
          setError(fetchError.message);
          return;
        }

        // Transform data to include opponent username
        const transformedData: RecentMatch[] = (historyData || []).map((match: any) => ({
          id: match.id,
          room_id: match.room_id,
          opponent_id: match.opponent_id,
          opponent_username: match.match_format === 'dartbot' 
            ? `DartBot (${match.bot_level || '?'})`
            : match.opponent?.username || 'Unknown',
          game_mode: match.game_mode,
          match_format: match.match_format,
          result: match.result,
          legs_won: match.legs_won,
          legs_lost: match.legs_lost,
          three_dart_avg: match.three_dart_avg,
          played_at: match.played_at,
          bot_level: match.bot_level,
        }));

        setMatches(transformedData);
      } catch (err) {
        console.error('[useRecentMatches] Unexpected error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    loadRecentMatches();
  }, [supabase, limit]);

  return { matches, loading, error };
}
