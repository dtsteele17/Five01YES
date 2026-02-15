'use client';

import { createClient } from './supabase/client';

export interface SafetyRating {
  letter: string;
  avg: number;
  count: number;
}

const supabase = createClient();

export async function submitSafetyRating(
  matchId: string,
  ratedId: string,
  rating: 'A' | 'B' | 'C' | 'D' | 'E'
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('submit_safety_rating', {
      p_match_id: matchId,
      p_rated_id: ratedId,
      p_rating: rating,
    });

    if (error) {
      console.error('Error submitting safety rating:', error);
      return { success: false, error: error.message };
    }

    return { success: data?.success ?? true };
  } catch (err) {
    console.error('Unexpected error submitting rating:', err);
    return { success: false, error: 'Unexpected error' };
  }
}

export async function getUserSafetyRating(userId: string): Promise<SafetyRating> {
  try {
    const { data, error } = await supabase.rpc('get_user_safety_rating', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Error getting safety rating:', error);
      return { letter: 'C', avg: 0, count: 0 };
    }

    return {
      letter: data?.letter || 'C',
      avg: data?.avg || 0,
      count: data?.count || 0,
    };
  } catch (err) {
    console.error('Unexpected error getting rating:', err);
    return { letter: 'C', avg: 0, count: 0 };
  }
}

export async function hasRatedInMatch(
  matchId: string,
  ratedId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('has_rated_in_match', {
      p_match_id: matchId,
      p_rated_id: ratedId,
    });

    if (error) {
      console.error('Error checking if rated:', error);
      return false;
    }

    return data ?? false;
  } catch (err) {
    console.error('Unexpected error checking rating:', err);
    return false;
  }
}

// Subscribe to new ratings for real-time notifications
export function subscribeToRatings(
  userId: string,
  onRating: (rating: { rating: string; rater_name: string }) => void
) {
  return supabase
    .channel(`safety-ratings:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'safety_ratings',
        filter: `rated_id=eq.${userId}`,
      },
      async (payload) => {
        const rating = payload.new;
        
        // Get rater's name
        const { data: rater } = await supabase
          .from('profiles')
          .select('username')
          .eq('user_id', rating.rater_id)
          .single();

        onRating({
          rating: rating.rating,
          rater_name: rater?.username || 'Anonymous',
        });
      }
    )
    .subscribe();
}
