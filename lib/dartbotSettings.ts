const DARTBOT_VISUALIZATION_KEY = 'dartbot_visualization_enabled';
const DARTBOT_DEBUG_MODE_KEY = 'dartbot_debug_mode_enabled';

export function isDartbotVisualizationEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(DARTBOT_VISUALIZATION_KEY);
  return stored === null ? true : stored === 'true';
}

export function setDartbotVisualizationEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DARTBOT_VISUALIZATION_KEY, enabled.toString());
}

export function isDartbotDebugModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(DARTBOT_DEBUG_MODE_KEY);
  return stored === 'true';
}

export function setDartbotDebugModeEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DARTBOT_DEBUG_MODE_KEY, enabled.toString());
}
