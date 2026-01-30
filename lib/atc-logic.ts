export interface ATCSettings {
  startNumber: number;
  endNumber: number;
  includeBull: boolean;
  increaseBySegment: boolean;
  overshootHandling: 'cap' | 'exact';
}

export interface ATCDart {
  type: 'miss' | 'single' | 'double' | 'treble' | 'single-bull' | 'double-bull';
  number?: number;
  hit: boolean;
}

export interface ATCVisit {
  darts: ATCDart[];
  targetBefore: number | 'bull';
  targetAfter: number | 'bull';
  progressMade: number;
}

export interface ATCPlayerState {
  name: string;
  currentTarget: number | 'bull';
  visits: ATCVisit[];
  completed: boolean;
}

export function getInitialTarget(settings: ATCSettings): number | 'bull' {
  return settings.startNumber;
}

export function getFinalTarget(settings: ATCSettings): number | 'bull' {
  return settings.includeBull ? 'bull' : settings.endNumber;
}

export function getNextTarget(
  currentTarget: number | 'bull',
  settings: ATCSettings
): number | 'bull' | null {
  if (currentTarget === 'bull') return null;

  const next = currentTarget + 1;

  if (next > settings.endNumber) {
    return settings.includeBull ? 'bull' : null;
  }

  return next;
}

export function advanceTarget(
  currentTarget: number | 'bull',
  steps: number,
  settings: ATCSettings
): number | 'bull' {
  if (currentTarget === 'bull') return 'bull';

  const finalTarget = getFinalTarget(settings);
  const finalNumber = finalTarget === 'bull' ? settings.endNumber : settings.endNumber;

  let newTarget = currentTarget + steps;

  if (settings.overshootHandling === 'cap') {
    if (newTarget > finalNumber) {
      return finalTarget;
    }
  } else {
    if (newTarget > finalNumber) {
      return currentTarget;
    }
  }

  if (newTarget > settings.endNumber) {
    return settings.includeBull ? 'bull' : settings.endNumber;
  }

  return newTarget;
}

export function processDart(
  dart: ATCDart,
  currentTarget: number | 'bull',
  settings: ATCSettings
): { hit: boolean; progress: number; newTarget: number | 'bull' } {
  if (dart.type === 'miss') {
    return { hit: false, progress: 0, newTarget: currentTarget };
  }

  if (currentTarget === 'bull') {
    const hitBull = dart.type === 'single-bull' || dart.type === 'double-bull';
    if (hitBull) {
      return { hit: true, progress: 1, newTarget: 'bull' };
    }
    return { hit: false, progress: 0, newTarget: currentTarget };
  }

  const hitTarget = dart.number === currentTarget;

  if (!hitTarget) {
    return { hit: false, progress: 0, newTarget: currentTarget };
  }

  let steps = 1;

  if (settings.increaseBySegment) {
    if (dart.type === 'single') steps = 1;
    else if (dart.type === 'double') steps = 2;
    else if (dart.type === 'treble') steps = 3;
  }

  const newTarget = advanceTarget(currentTarget, steps, settings);

  return { hit: true, progress: steps, newTarget };
}

export function processVisit(
  darts: ATCDart[],
  currentTarget: number | 'bull',
  settings: ATCSettings
): { targetAfter: number | 'bull'; totalProgress: number; completed: boolean } {
  let target = currentTarget;
  let totalProgress = 0;

  for (const dart of darts) {
    const result = processDart(dart, target, settings);
    if (result.hit) {
      totalProgress += result.progress;
      target = result.newTarget;

      if (target === getFinalTarget(settings) && result.hit) {
        return { targetAfter: target, totalProgress, completed: true };
      }
    }
  }

  return { targetAfter: target, totalProgress, completed: false };
}

export function calculateATCStats(player: ATCPlayerState) {
  let totalDarts = 0;
  let totalHits = 0;
  let maxProgressInVisit = 0;

  player.visits.forEach((visit) => {
    totalDarts += visit.darts.length;
    visit.darts.forEach((dart) => {
      if (dart.hit) totalHits++;
    });
    if (visit.progressMade > maxProgressInVisit) {
      maxProgressInVisit = visit.progressMade;
    }
  });

  const hitRate = totalDarts > 0 ? (totalHits / totalDarts) * 100 : 0;
  const avgProgressPerVisit = player.visits.length > 0
    ? player.visits.reduce((sum, v) => sum + v.progressMade, 0) / player.visits.length
    : 0;

  return {
    totalVisits: player.visits.length,
    totalDarts,
    totalHits,
    hitRate,
    maxProgressInVisit,
    avgProgressPerVisit,
  };
}
