/**
 * Safety Rating Events
 * 
 * Provides a simple event system for refreshing safety ratings
 * across the application when a rating is submitted.
 */

type SafetyRatingListener = (userId: string) => void;

const listeners: SafetyRatingListener[] = [];

/**
 * Subscribe to safety rating updates
 * @param listener Function to call when a rating is updated
 * @returns Unsubscribe function
 */
export function onSafetyRatingUpdated(listener: SafetyRatingListener): () => void {
  listeners.push(listener);
  
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}

/**
 * Notify all listeners that a safety rating has been updated
 * @param userId The user whose rating was updated
 */
export function notifySafetyRatingUpdated(userId: string): void {
  listeners.forEach(listener => listener(userId));
}

/**
 * Global refresh trigger for all safety ratings
 * Use this when you want to refresh all safety rating displays
 */
export function refreshAllSafetyRatings(): void {
  listeners.forEach(listener => listener('all'));
}
