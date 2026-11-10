import type { Result } from '../contracts';
import { err, ok } from '../utils/result';

export function parseJsonSafe(raw: string): Result<unknown> {
  try {
    return ok(JSON.parse(raw) as unknown);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown parse error';
    return err('E_RULE_SCHEMA_INVALID', 'JSON 解析失败：' + message);
  }
}

export function stringifyPretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
