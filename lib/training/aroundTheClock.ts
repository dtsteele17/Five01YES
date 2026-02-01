/**
 * Around The Clock Training Engine
 *
 * Configurable training mode with 4 segment rules and 2 order modes.
 */

// ==================== TYPES ====================

export type AroundClockOrderMode = 'in_order' | 'random';

export type AroundClockSegmentRule =
  | 'singles_only'
  | 'doubles_only'
  | 'trebles_only'
  | 'increase_by_segment';

export interface AroundClockSettings {
  orderMode: AroundClockOrderMode;
  segmentRule: AroundClockSegmentRule;
  includeBull: boolean; // Always true for this implementation
}

export type ATCTarget = number | 'bull'; // 1-20 or 'bull'

export type ATCSegment = 'S' | 'D' | 'T' | 'SB' | 'DB' | 'MISS';

export interface ATCThrowInput {
  segment: ATCSegment;
  number?: number; // 1-20 for S/D/T, undefined for SB/DB/MISS
}

export interface ATCThrowResult {
  hit: boolean; // Did this throw satisfy the segment rule for the current target?
  progressDelta: number; // How many targets advanced (0, 1, 2, or 3)
  currentTargetBefore: ATCTarget;
  currentTargetAfter: ATCTarget;
  remainingTargetsCount: number; // How many targets left to complete
}

export interface ATCSessionState {
  settings: AroundClockSettings;
  currentTarget: ATCTarget;
  remainingTargets: ATCTarget[]; // Used for random mode
  completedTargets: ATCTarget[]; // History of completed targets
  totalThrows: number;
  hits: number;
  misses: number;
  isComplete: boolean;
  sessionId?: string; // Set when persisted to database
}

// ==================== CONSTANTS ====================

const ALL_TARGETS: ATCTarget[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  'bull'
];

// ==================== UTILITY FUNCTIONS ====================

/**
 * Shuffle array using Fisher-Yates algorithm
 * Stable for a given seed if you want deterministic random
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Get the next target in "in_order" mode
 */
function getNextInOrderTarget(current: ATCTarget): ATCTarget | null {
  if (current === 'bull') return null; // Session complete
  if (current === 20) return 'bull';
  return (current as number) + 1;
}

/**
 * Advance targets by N steps in "increase_by_segment" mode
 * Rules:
 * - Single = +1 target
 * - Double = +2 targets
 * - Treble = +3 targets
 * - Cannot skip beyond Bull (if you pass 20, go to Bull; if you pass Bull, session completes)
 */
function advanceBySteps(current: ATCTarget, steps: number): ATCTarget {
  if (current === 'bull') return 'bull'; // Already at end

  const newValue = (current as number) + steps;

  if (newValue > 20) {
    return 'bull'; // Cap at Bull
  }

  return newValue as ATCTarget;
}

// ==================== INITIALIZATION ====================

/**
 * Initialize a new Around The Clock session
 */
export function initSession(settings: AroundClockSettings): ATCSessionState {
  const { orderMode } = settings;

  let currentTarget: ATCTarget;
  let remainingTargets: ATCTarget[];

  if (orderMode === 'in_order') {
    currentTarget = 1;
    remainingTargets = []; // Not used in "in_order" mode
  } else {
    // Random mode: shuffle all targets
    remainingTargets = shuffleArray(ALL_TARGETS);
    currentTarget = remainingTargets[0];
  }

  return {
    settings,
    currentTarget,
    remainingTargets,
    completedTargets: [],
    totalThrows: 0,
    hits: 0,
    misses: 0,
    isComplete: false,
  };
}

// ==================== THROW PROCESSING ====================

/**
 * Check if a throw satisfies the segment rule for the current target
 */
function checkHit(
  throwInput: ATCThrowInput,
  currentTarget: ATCTarget,
  segmentRule: AroundClockSegmentRule
): { hit: boolean; progressDelta: number } {
  const { segment, number } = throwInput;

  // Handle Bull target
  if (currentTarget === 'bull') {
    if (segment === 'SB' || segment === 'DB') {
      // Bull is hit
      if (segmentRule === 'singles_only') {
        return { hit: true, progressDelta: 1 }; // Either SBull or DBull counts
      } else if (segmentRule === 'doubles_only') {
        return { hit: segment === 'DB', progressDelta: 1 }; // Only DBull counts
      } else if (segmentRule === 'trebles_only') {
        // Treble bull doesn't exist, so allow either SBull or DBull
        return { hit: true, progressDelta: 1 };
      } else if (segmentRule === 'increase_by_segment') {
        // SBull = +1, DBull = +2, but Bull completes the session regardless
        const delta = segment === 'SB' ? 1 : 2;
        return { hit: true, progressDelta: delta };
      }
    }
    return { hit: false, progressDelta: 0 };
  }

  // Handle number targets (1-20)
  if (segment === 'MISS' || segment === 'SB' || segment === 'DB') {
    // Not hitting the target number
    return { hit: false, progressDelta: 0 };
  }

  // Check if we hit the correct number
  if (number !== currentTarget) {
    return { hit: false, progressDelta: 0 };
  }

  // We hit the target number, now check segment rule
  if (segmentRule === 'singles_only') {
    // Only singles count
    if (segment === 'S') {
      return { hit: true, progressDelta: 1 };
    }
    return { hit: false, progressDelta: 0 };
  }

  if (segmentRule === 'doubles_only') {
    // Only doubles count
    if (segment === 'D') {
      return { hit: true, progressDelta: 1 };
    }
    return { hit: false, progressDelta: 0 };
  }

  if (segmentRule === 'trebles_only') {
    // Only trebles count
    if (segment === 'T') {
      return { hit: true, progressDelta: 1 };
    }
    return { hit: false, progressDelta: 0 };
  }

  if (segmentRule === 'increase_by_segment') {
    // Singles = +1, Doubles = +2, Trebles = +3
    let progressDelta = 0;
    if (segment === 'S') progressDelta = 1;
    else if (segment === 'D') progressDelta = 2;
    else if (segment === 'T') progressDelta = 3;

    return { hit: true, progressDelta };
  }

  return { hit: false, progressDelta: 0 };
}

/**
 * Apply a single throw to the session state
 */
export function applyThrow(
  state: ATCSessionState,
  throwInput: ATCThrowInput
): { newState: ATCSessionState; result: ATCThrowResult } {
  if (state.isComplete) {
    // Session already complete, return unchanged
    return {
      newState: state,
      result: {
        hit: false,
        progressDelta: 0,
        currentTargetBefore: state.currentTarget,
        currentTargetAfter: state.currentTarget,
        remainingTargetsCount: 0,
      },
    };
  }

  const { settings, currentTarget } = state;
  const { orderMode, segmentRule } = settings;

  // Check if this throw satisfies the segment rule
  const { hit, progressDelta } = checkHit(throwInput, currentTarget, segmentRule);

  // Update stats
  const totalThrows = state.totalThrows + 1;
  const hits = hit ? state.hits + 1 : state.hits;
  const misses = hit ? state.misses : state.misses + 1;

  let newTarget: ATCTarget = currentTarget;
  let newRemainingTargets = [...state.remainingTargets];
  let newCompletedTargets = [...state.completedTargets];
  let isComplete = false;

  if (hit) {
    // Target hit! Progress to next target
    if (orderMode === 'in_order') {
      // In order mode: advance based on segment rule
      if (segmentRule === 'increase_by_segment') {
        // Can skip multiple targets
        newTarget = advanceBySteps(currentTarget, progressDelta);
      } else {
        // Singles/Doubles/Trebles only: always advance by 1 target
        const next = getNextInOrderTarget(currentTarget);
        newTarget = next ?? currentTarget; // If null, session completes
      }

      // Add current target to completed
      newCompletedTargets.push(currentTarget);

      // Check if complete
      if (currentTarget === 'bull' || newTarget === null) {
        isComplete = true;
        newTarget = 'bull';
      }
    } else {
      // Random mode: remove current target from remaining, pick next
      newCompletedTargets.push(currentTarget);
      newRemainingTargets = newRemainingTargets.filter(t => t !== currentTarget);

      if (newRemainingTargets.length === 0) {
        // All targets completed!
        isComplete = true;
        newTarget = 'bull'; // Final state
      } else {
        // Move to next random target
        newTarget = newRemainingTargets[0];
      }
    }
  }

  const newState: ATCSessionState = {
    ...state,
    currentTarget: newTarget,
    remainingTargets: newRemainingTargets,
    completedTargets: newCompletedTargets,
    totalThrows,
    hits,
    misses,
    isComplete,
  };

  const remainingCount = orderMode === 'in_order'
    ? (isComplete ? 0 : ALL_TARGETS.length - newCompletedTargets.length)
    : newRemainingTargets.length;

  const result: ATCThrowResult = {
    hit,
    progressDelta,
    currentTargetBefore: currentTarget,
    currentTargetAfter: newTarget,
    remainingTargetsCount: remainingCount,
  };

  return { newState, result };
}

// ==================== HELPERS ====================

/**
 * Get a display label for a target
 */
export function getTargetLabel(target: ATCTarget): string {
  return target === 'bull' ? 'BULL' : target.toString();
}

/**
 * Get total targets count (always 21 for this mode)
 */
export function getTotalTargetsCount(): number {
  return ALL_TARGETS.length;
}

/**
 * Get completed targets count
 */
export function getCompletedCount(state: ATCSessionState): number {
  return state.completedTargets.length;
}

/**
 * Get accuracy percentage
 */
export function getAccuracy(state: ATCSessionState): number {
  if (state.totalThrows === 0) return 0;
  return Math.round((state.hits / state.totalThrows) * 100);
}

/**
 * Format throw input for display
 */
export function formatThrowInput(input: ATCThrowInput): string {
  const { segment, number } = input;

  if (segment === 'MISS') return 'MISS';
  if (segment === 'SB') return 'Bull';
  if (segment === 'DB') return 'Bullseye';
  if (segment === 'S') return `S${number}`;
  if (segment === 'D') return `D${number}`;
  if (segment === 'T') return `T${number}`;

  return 'UNKNOWN';
}
