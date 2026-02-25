import { createClient } from '@/lib/supabase/client';
import { notifySafetyRatingUpdated } from './safetyEvents';

export type SafetyGrade = 'A' | 'B' | 'C' | 'D' | 'E';

// Grade to numeric value mapping (for averaging)
export const GRADE_VALUES: Record<SafetyGrade, number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1
};

// Color schemes for each grade (matches existing emerald/green theme)
export const GRADE_COLORS: Record<SafetyGrade, string> = {
  A: 'bg-emerald-500 text-white',
  B: 'bg-emerald-400 text-white',
  C: 'bg-yellow-400 text-slate-900',
  D: 'bg-orange-400 text-white',
  E: 'bg-red-500 text-white'
};

// Full color classes for backgrounds
export const GRADE_BG_COLORS: Record<SafetyGrade, string> = {
  A: 'bg-emerald-500',
  B: 'bg-emerald-400',
  C: 'bg-yellow-400',
  D: 'bg-orange-400',
  E: 'bg-red-500'
};

// Text colors
export const GRADE_TEXT_COLORS: Record<SafetyGrade, string> = {
  A: 'text-emerald-500',
  B: 'text-emerald-400',
  C: 'text-yellow-400',
  D: 'text-orange-400',
  E: 'text-red-500'
};

// Grade labels
export const GRADE_LABELS: Record<SafetyGrade, string> = {
  A: 'Excellent',
  B: 'Good',
  C: 'Average',
  D: 'Poor',
  E: 'Avoid'
};

/**
 * Submit a safety rating for an opponent after a match
 * Uses the submit_safety_rating RPC function
 */
export async function submitRating(
  matchId: string,
  ratedId: string,
  grade: SafetyGrade
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    console.log('[SafetyRating] Submitting rating:', { matchId, ratedId, grade });
    
    const supabase = createClient();
    const { data, error } = await supabase
      .rpc('submit_safety_rating', {
        p_match_id: matchId,
        p_rated_id: ratedId,
        p_rating: grade
      });

    console.log('[SafetyRating] RPC response:', { data, error });

    if (error) {
      console.error('[SafetyRating] RPC error:', error);
      return { success: false, error: error.message };
    }

    // Check if the RPC returned an error in the JSONB result
    if (data && !data.success) {
      console.error('[SafetyRating] RPC returned error:', data.error);
      return { success: false, error: data.error };
    }

    // Notify all listeners that the rating has been updated
    notifySafetyRatingUpdated(ratedId);

    return { success: true, data };
  } catch (err: any) {
    console.error('[SafetyRating] Exception in submitRating:', err);
    return { success: false, error: err.message || 'Failed to submit rating' };
  }
}

/**
 * Check if user has already rated their opponent for a match
 * Uses the has_rated_in_match RPC function
 */
export async function hasRatedOpponent(
  matchId: string,
  ratedId: string
): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .rpc('has_rated_in_match', {
        p_match_id: matchId,
        p_rated_id: ratedId
      });

    if (error) {
      console.error('Error checking rating status:', error);
      return false;
    }

    return data || false;
  } catch {
    return false;
  }
}

/**
 * Get user's safety rating information
 * Uses the get_user_safety_rating RPC function
 */
export async function getUserSafetyRating(userId: string): Promise<{
  grade: SafetyGrade | null;
  average: number | null;
  totalRatings: number;
} | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .rpc('get_user_safety_rating', {
        p_user_id: userId
      });

    if (error) {
      console.error('Error fetching safety rating:', error);
      return null;
    }

    // Parse the JSONB result
    const result = data as {
      avg: number;
      count: number;
      letter: SafetyGrade;
    };

    if (!result || result.count === 0) {
      return {
        grade: null,
        average: null,
        totalRatings: 0
      };
    }

    return {
      grade: result.letter,
      average: result.avg,
      totalRatings: result.count
    };
  } catch (err) {
    console.error('Error in getUserSafetyRating:', err);
    return null;
  }
}

/**
 * Subscribe to new safety ratings for real-time notifications
 * Shows toast when someone rates the current user
 */
export function subscribeToRatings(
  userId: string,
  onNewRating: (grade: SafetyGrade, raterName?: string) => void
): () => void {
  const supabase = createClient();
  const subscription = supabase
    .channel('safety_ratings')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'safety_ratings',
        filter: `rated_id=eq.${userId}`
      },
      async (payload) => {
        const newRating = payload.new as {
          rating: SafetyGrade;
          rater_id: string;
        };

        // Get rater's profile
        const supabase = createClient();
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', newRating.rater_id)
          .single();

        onNewRating(newRating.rating, profile?.display_name);
      }
    )
    .subscribe();

  // Return unsubscribe function
  return () => {
    subscription.unsubscribe();
  };
}

/**
 * Get user's safety stats for profile display
 * Fetches breakdown of ratings from safety_ratings table
 */
export async function getUserSafetyStats(userId: string): Promise<{
  grade: SafetyGrade | null;
  breakdown: Record<SafetyGrade, number>;
  totalRatings: number;
  average: number | null;
} | null> {
  try {
    const supabase = createClient();
    // Get the basic rating info
    const { data: ratingData, error: ratingError } = await supabase
      .rpc('get_user_trust_rating_v2', {
        p_user_id: userId
      });

    if (ratingError) {
      console.error('Error fetching safety grade:', ratingError);
      return null;
    }

    const rating = ratingData as { avg: number; count: number; letter: SafetyGrade };

    // Get all ratings for breakdown from safety_ratings
    const { data: ratings, error: ratingsError } = await supabase
      .from('safety_ratings')
      .select('rating')
      .eq('rated_id', userId);

    if (ratingsError) {
      console.error('Error fetching ratings breakdown:', ratingsError);
      return null;
    }

    const totalRatings = ratings?.length || 0;
    const average = rating.count > 0 ? rating.avg : null;

    const breakdown: Record<SafetyGrade, number> = {
      A: 0, B: 0, C: 0, D: 0, E: 0
    };

    ratings?.forEach((r) => {
      const grade = r.rating as SafetyGrade;
      breakdown[grade]++;
    });

    return {
      grade: rating.count > 0 ? rating.letter : null,
      breakdown,
      totalRatings,
      average
    };
  } catch (err) {
    console.error('Error in getUserSafetyStats:', err);
    return null;
  }
}

/**
 * Quick check to get just the safety grade letter
 * Uses the user_safety_rating_view for efficient lookup
 */
export async function getSafetyGrade(userId: string): Promise<SafetyGrade | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('user_trust_rating_view')
      .select('rating_letter')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.rating_letter as SafetyGrade;
  } catch {
    return null;
  }
}
