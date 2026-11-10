import {
  evaluateDrift, newSkeletonRecord, readSkeleton, writeSkeleton,
} from '../config/structure-hash';
import type { RuntimeParts } from './assembly';

export interface DriftOutcome {
  readonly structureHash: string;
  readonly drift: boolean;
  readonly consecutive: number;
  readonly reminded: boolean;
}

/**
 * ARCH 17.3: exact locator hit-rate first, Jaccard similarity only as a
 * secondary signal with a 2-scan debounce, 7-day cooldown and one reminder
 * per page session. A brand-new page records its hash without any prompt.
 */
export async function resolveDrift(
  parts: RuntimeParts,
  labels: readonly string[],
  consecutive: number,
  reminded: boolean,
): Promise<DriftOutcome> {
  const skeleton = newSkeletonRecord(parts.page.pageKey, document);
  const prior = await readSkeleton(parts.storage, parts.page.pageKey);
  let drift = false;
  let nextConsecutive = consecutive;
  let nextReminded = reminded;

  if (prior) {
    const pageRecord = await parts.ruleStore.getPageRecord(parts.page.pageKey);
    const decision = evaluateDrift({
      storedTokens: prior.tokens,
      currentTokens: skeleton.tokens,
      locatorValues: (pageRecord?.overrides ?? []).map((entry) => entry.locator.value),
      labels,
      consecutive,
      reminded,
      detectedAt: prior.detectedAt,
    });
    nextConsecutive = decision.consecutive;
    drift = decision.drift;
    if (drift) {
      nextReminded = true;
      parts.counter.increment('rule_hash_drift');
    }
    if (prior.structureHash !== skeleton.structureHash) {
      await writeSkeleton(parts.storage, { ...skeleton, detectedAt: prior.detectedAt });
    }
  } else {
    await writeSkeleton(parts.storage, skeleton);
  }

  parts.ruleStore.setPageContext(parts.page.pageKey, {
    urlPattern: parts.page.urlPattern,
    structureHash: skeleton.structureHash,
  });
  return {
    structureHash: skeleton.structureHash,
    drift,
    consecutive: nextConsecutive,
    reminded: nextReminded,
  };
}
