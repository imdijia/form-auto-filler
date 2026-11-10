/** Local-only storage keys. Counters stay isolated in faf.counters.v1. */
export const PENDING_COMMAND_KEY = 'faf.pendingCommand.v1';
export const SETTINGS_KEY = 'faf.settings.v1';

export interface PendingCommand {
  readonly command: string;
  readonly issuedAt: number;
}
