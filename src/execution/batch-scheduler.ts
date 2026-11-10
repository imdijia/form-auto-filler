/** Batch scheduling with requestIdleCallback to yield the main thread.
    setTimeout is permitted ONLY here, as the fallback when rIC is missing. */

interface IdleHost {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
}

export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    const host = globalThis as unknown as IdleHost;
    if (typeof host.requestIdleCallback === 'function') {
      host.requestIdleCallback(() => resolve(), { timeout: 50 });
      return;
    }
    setTimeout(resolve, 0);
  });
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
