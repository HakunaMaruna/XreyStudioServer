export const APP_VERSION = '2.48.10';

// Панель и агент релизятся вместе, поэтому устаревший агент — тот, чья версия
// не совпадает с версией панели.
export function isAgentOutdated(version: string | null | undefined): boolean {
  return Boolean(version && version !== APP_VERSION);
}
