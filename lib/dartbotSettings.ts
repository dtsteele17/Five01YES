const DARTBOT_VISUALIZATION_KEY = 'dartbot_visualization_enabled';

export function isDartbotVisualizationEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(DARTBOT_VISUALIZATION_KEY);
  return stored === null ? true : stored === 'true';
}

export function setDartbotVisualizationEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DARTBOT_VISUALIZATION_KEY, enabled.toString());
}
