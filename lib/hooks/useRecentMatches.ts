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
  // Career-specific fields
  career_tier?: number;
  career_event?: string;
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

      // Also fetch career matches
      const { data: careerData } = await supabase
        .from('career_matches')
        .select(`
          id, result, player_legs_won, opponent_legs_won,
          player_average, opponent_average, player_checkout_pct,
          player_180s, player_highest_checkout, updated_at,
          career_opponents!inner(first_name, last_name, nickname),
          career_events!inner(event_name, event_type),
          career_profiles!inner(tier)
        `)
        .not('result', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(limit);

      if (fetchError) {
        console.error('[useRecentMatches] Error fetching matches:', fetchError);
        setError(fetchError.message);
        return;
      }

      console.log('[useRecentMatches] Fetched matches:', historyData?.length || 0);
      
      // Debug: Log matches with opponent stats
      const quickMatches = (historyData || []).filter((m: any) => m.match_format === 'quick');
      const dartbotMatches = (historyData || []).filter((m: any) => m.match_format === 'dartbot');
      
      if (quickMatches.length > 0) {
        console.log('[useRecentMatches] Quick matches found:', quickMatches.length);
        quickMatches.slice(0, 3).forEach((m: any, i: number) => {
          console.log(`  [Quick ${i + 1}]`, {
            user_avg: m.three_dart_avg?.toFixed?.(1) || m.three_dart_avg,
            opponent_avg: m.opponent_three_dart_avg?.toFixed?.(1) || m.opponent_three_dart_avg,
            opponent_180s: m.opponent_visits_180,
            has_opponent: !!m.opponent_id,
          });
        });
      }
      
      if (dartbotMatches.length > 0) {
        console.log('[useRecentMatches] Dartbot matches found:', dartbotMatches.length);
        dartbotMatches.slice(0, 3).forEach((m: any, i: number) => {
          console.log(`  [Dartbot ${i + 1}]`, {
            opponent_avg: m.opponent_three_dart_avg?.toFixed?.(1) || m.opponent_three_dart_avg,
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

      // Transform career matches
      const careerMatches: RecentMatch[] = (careerData || []).map((match: any) => {
        const opponent = match.career_opponents;
        const event = match.career_events;
        const profile = match.career_profiles;
        
        // Build opponent name with nickname if available
        const opponentName = opponent.nickname 
          ? `${opponent.first_name} "${opponent.nickname}" ${opponent.last_name}`
          : `${opponent.first_name} ${opponent.last_name}`;
        
        // Map tier to tier name
        const tierNames: Record<number, string> = {
          1: 'Local League',
          2: 'Pub League', 
          3: 'County League',
          4: 'National Tour',
          5: 'Pro Tour'
        };
        
        const tierName = tierNames[profile.tier] || `Tier ${profile.tier}`;
        const eventContext = event.event_type === 'tournament' ? event.event_name : tierName;
        
        return {
          id: match.id,
          room_id: '', // Career matches don't use room_id
          opponent_id: '', // Not applicable for AI
          opponent_username: opponentName,
          game_mode: 501, // Career is always 501
          match_format: 'career',
          result: match.result,
          legs_won: match.player_legs_won || 0,
          legs_lost: match.opponent_legs_won || 0,
          three_dart_avg: match.player_average || 0,
          first9_avg: 0, // Not tracked in career
          highest_checkout: match.player_highest_checkout || 0,
          checkout_percentage: match.player_checkout_pct || 0,
          darts_thrown: 0, // Not tracked
          total_score: 0, // Not tracked  
          visits_100_plus: 0, // Not tracked
          visits_140_plus: 0, // Not tracked
          visits_180: match.player_180s || 0,
          played_at: match.updated_at,
          // Career-specific fields
          career_tier: profile.tier,
          career_event: eventContext,
          // Opponent stats
          opponent_three_dart_avg: match.opponent_average || 0,
          opponent_first9_avg: 0,
          opponent_highest_checkout: 0,
          opponent_checkout_percentage: 0,
          opponent_darts_thrown: 0,
          opponent_visits_100_plus: 0,
          opponent_visits_140_plus: 0,
          opponent_visits_180: 0,
        };
      });

      // Transform regular match history data to include opponent username and all stats
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

      // Combine career matches and regular matches, then sort by date
      const allMatches = [...careerMatches, ...transformedData]
        .sort((a, b) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime())
        .slice(0, limit);

      setMatches(allMatches);
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
