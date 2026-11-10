/**
 * Test-first contract loader with an explicit anti-false-green state machine.
 *
 *   missing -> implementation file not produced yet  => every case is it.skip
 *              with the reason in its title (honest, never pretends to pass).
 *   ready   -> module found with all required exports => cases run for real.
 *   error   -> source exists but exports/load are broken => an extra case
 *              FAILS loudly instead of silently skipping.
 *
 * Modules are discovered by export name via Vite's import.meta.glob, not by a
 * hard-coded file path: a missing file yields an empty map (no collection
 * error), and a renamed file still binds. No implementation is created here.
 */
export type GlobMap = Record<string, () => Promise<unknown>>;

export type ContractLoad<T> =
  | { readonly state: 'ready'; readonly mod: T; readonly path: string }
  | { readonly state: 'missing'; readonly path: string; readonly reason: string }
  | { readonly state: 'error'; readonly path: string; readonly reason: string };

function short(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.split('\n')[0].slice(0, 220);
}

export async function loadContract<T>(
  globs: GlobMap,
  contractHint: string,
  requiredExports: readonly string[],
): Promise<ContractLoad<T>> {
  const entries = Object.entries(globs);
  if (entries.length === 0) {
    return {
      state: 'missing',
      path: contractHint,
      reason: `实现模块尚未产出 (${contractHint})`,
    };
  }

  const loadFailures: string[] = [];
  for (const [key, loader] of entries) {
    try {
      const mod = (await loader()) as Record<string, unknown>;
      if (requiredExports.every((name) => name in mod)) {
        return { state: 'ready', mod: mod as T, path: key };
      }
    } catch (err) {
      loadFailures.push(`${key}: ${short(err)}`);
    }
  }

  return {
    state: 'error',
    path: contractHint,
    reason:
      `源码已产出，但未找到契约导出 [${requiredExports.join(', ')}]（或模块加载失败）。` +
      ` 需前端按 docs/QA-TEST-PLAN.md §2 对齐导出名，禁止删/弱化断言。` +
      ` 加载失败明细: ${loadFailures.length ? loadFailures.join(' | ') : '无'}`,
  };
}

/** Prefix put in front of every case title while the module is unavailable. */
export function skipTag<T>(load: ContractLoad<T>): string {
  return load.state === 'ready' ? '' : `[待接入] ${load.reason} :: `;
}

/** Standard guard: an existing-but-broken module must fail, not disappear. */
export function loadGateMessage<T>(load: ContractLoad<T>): string | null {
  return load.state === 'error' ? load.reason : null;
}

/**
 * Access the module inside a case body. When the case is skipped the body is
 * never executed, so the empty cast is unreachable; when it runs, `ready`
 * guarantees a real module. This keeps every assertion free of optional
 * chaining that could silently turn into a no-op.
 */
export function modOf<T>(load: ContractLoad<T>): T {
  return load.state === 'ready' ? load.mod : ({} as T);
}
