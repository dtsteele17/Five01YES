const CAREER_TRAINING_ROUTE_POOL = [
  '/app/play/training/121',
  '/app/play/training/bobs-27',
  '/app/play/training/jdc-challenge',
  '/app/play/training/killer',
  '/app/play/training/pdc-challenge',
] as const;

export const CAREER_TRAINING_RETURN_KEY = 'career_training_return';
export const CAREER_TRAINING_AUTO_PROMOTE_KEY = 'career_training_auto_promote';

export function getRandomCareerTrainingRoute() {
  const index = Math.floor(Math.random() * CAREER_TRAINING_ROUTE_POOL.length);
  return CAREER_TRAINING_ROUTE_POOL[index];
}
