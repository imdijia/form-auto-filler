import type { RuntimeMessage } from '../contracts';
import { newRequestId } from '../utils/id';

export const RUNTIME_CHANNEL = 'FAF_RUNTIME_V1';
export const CONTROL_CHANNEL = 'FAF_CONTROL_V1';

/** Internal control commands. These are not part of the RuntimeMessage union. */
export type CommandName =
  | 'open-plan'
  | 'scope-current-form'
  | 'scope-current-row'
  | 'open-picker'
  | 'undo'
  | 'refresh-plan'
  | 'close-panels'
  | 'open-options'
  | 'locate'
  | 'ping';

export interface ControlMessage {
  readonly channel: typeof CONTROL_CHANNEL;
  readonly requestId: string;
  readonly name: CommandName;
  readonly payload: Readonly<Record<string, unknown>>;
}

export function control(name: CommandName, payload: Record<string, unknown> = {}): ControlMessage {
  return { channel: CONTROL_CHANNEL, requestId: newRequestId(), name, payload };
}

export function isControlMessage(value: unknown): value is ControlMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ControlMessage>;
  return candidate.channel === CONTROL_CHANNEL && typeof candidate.name === 'string';
}

export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<RuntimeMessage>;
  return candidate.channel === RUNTIME_CHANNEL && typeof candidate.type === 'string';
}

export type RuntimeEventType = RuntimeMessage['type'];

/** PROGRESS carries only { done, total }. Every other event carries sessionId. */
export function runtimeEvent(
  type: RuntimeEventType,
  sessionId: string,
  done = 0,
  total = 0,
): RuntimeMessage {
  const requestId = newRequestId();
  if (type === 'PROGRESS') {
    return { channel: RUNTIME_CHANNEL, requestId, type: 'PROGRESS', payload: { done, total } };
  }
  return {
    channel: RUNTIME_CHANNEL,
    requestId,
    type,
    payload: { sessionId },
  } as RuntimeMessage;
}
