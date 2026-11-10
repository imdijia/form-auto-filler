import type { Logger } from '../contracts';

/** Content scripts and injected UI MUST use this silent logger.
    Console output is only allowed in extension-owned pages / background. */
export const nullLogger: Logger = Object.freeze({
  debug(): void { /* intentionally silent */ },
  warn(): void { /* intentionally silent */ },
});

export function createConsoleLogger(scope: string): Logger {
  return {
    debug(event, data): void {
      console.debug('[FAF:' + scope + ']', event, data ?? {});
    },
    warn(event, data): void {
      console.warn('[FAF:' + scope + ']', event, data ?? {});
    },
  };
}
