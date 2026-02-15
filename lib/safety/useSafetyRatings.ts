'use client';

import { useEffect, useState, useCallback } from 'react';
import type { SafetyGrade } from './safetyService';
import {
  getUserSafetyRating,
  getUserSafetyStats,
  subscribeToRatings,
  hasRatedOpponent,
  submitRating
} from './safetyService';

/**
 * Hook to fetch and refresh a user's safety rating
 */
export function useSafetyRating(userId: string | null | undefined) {
  const [rating, setRating] = useState<{
    grade: SafetyGrade | null;
    average: number | null;
    totalRatings: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await getUserSafetyRating(userId);
      setRating(data);
      setError(null);
    } catch (err) {
      setError('Failed to load safety rating');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rating, loading, error, refresh };
}

/**
 * Hook to fetch detailed safety stats including breakdown
 */
export function useSafetyStats(userId: string | null | undefined) {
  const [stats, setStats] = useState<{
    grade: SafetyGrade | null;
    breakdown: Record<SafetyGrade, number>;
    totalRatings: number;
    average: number | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      const data = await getUserSafetyStats(userId);
      setStats(data);
      setLoading(false);
    };

    fetchStats();
  }, [userId]);

  return { stats, loading };
}

/**
 * Hook to subscribe to real-time rating notifications
 */
export function useRatingNotifications(
  userId: string | null | undefined,
  onNewRating: (grade: SafetyGrade, raterName?: string) => void
) {
  useEffect(() => {
    if (!userId) return;

    const unsubscribe = subscribeToRatings(userId, (grade, raterName) => {
      onNewRating(grade, raterName);
    });

    return () => {
      unsubscribe();
    };
  }, [userId, onNewRating]);
}

/**
 * Hook to manage rating an opponent after a match
 */
export function useMatchRating(matchId: string | null | undefined, opponentId: string | null | undefined) {
  const [hasRated, setHasRated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const checkRatingStatus = async () => {
      if (!matchId || !opponentId) {
        setLoading(false);
        return;
      }

      const rated = await hasRatedOpponent(matchId, opponentId);
      setHasRated(rated);
      setLoading(false);
    };

    checkRatingStatus();
  }, [matchId, opponentId]);

  const submitMatchRating = useCallback(async (grade: SafetyGrade) => {
    if (!matchId || !opponentId) {
      return { success: false, error: 'Missing match or opponent info' };
    }

    setSubmitting(true);
    const result = await submitRating(matchId, opponentId, grade);
    if (result.success) {
      setHasRated(true);
    }
    setSubmitting(false);
    return result;
  }, [matchId, opponentId]);

  return { hasRated, loading, submitting, submitMatchRating };
}
