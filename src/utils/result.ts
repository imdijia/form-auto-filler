import type { ErrorCode, Result } from '../contracts';

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(
  code: ErrorCode,
  message: string,
  detail?: Record<string, unknown>,
): Result<T> {
  return detail ? { ok: false, code, message, detail } : { ok: false, code, message };
}

export function unwrap<T>(result: Result<T>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
