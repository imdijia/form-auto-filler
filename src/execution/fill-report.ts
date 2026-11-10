import type { FillReport, FillResult } from '../contracts';

/**
 * E_UNSUPPORTED_CONTROL is a separate disposition group (ARCH 17.6 / UIUX
 * R13). FillResult.status has no 'unsupported' member, so the marker is the
 * code / skipReason. Such an item is never counted as a failure and never
 * enters the success denominator.
 */
export function isOutOfScope(result: FillResult): boolean {
  return (
    result.code === 'E_UNSUPPORTED_CONTROL' ||
    result.skipReason === 'unsupported-control'
  );
}

/** A "success" is ONLY status=filled AND verified=true (ARCH 14.2). */
export function isVerifiedSuccess(result: FillResult): boolean {
  return result.status === 'filled' && result.verified && !isOutOfScope(result);
}

/** Unknown / out-of-scope are separate disposition groups. They do not enter
    the filled / skipped / failed counters (UIUX 4.6, ARCH 17.6). */
export function isSeparateGroup(result: FillResult): boolean {
  return isOutOfScope(result) || result.skipReason === 'low-confidence';
}

export function buildReport(
  sessionId: string,
  outcomes: readonly FillResult[],
  startedAt: number,
): FillReport {
  let filled = 0;
  let skipped = 0;
  let failed = 0;
  for (const outcome of outcomes) {
    if (isVerifiedSuccess(outcome)) filled += 1;
    else if (isSeparateGroup(outcome)) continue;
    else if (outcome.status === 'skipped') skipped += 1;
    else failed += 1;
  }
  return {
    sessionId,
    total: outcomes.length,
    filled,
    skipped,
    failed,
    outcomes: [...outcomes],
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}
