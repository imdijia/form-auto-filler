/** form-skeleton-v1: normalized structure hash. Dynamic ids, random classes,
    data-v-* attributes, timestamps and index suffixes are never included. */
import { LIMITS } from '../contracts';
import type { StoragePort } from '../infra/storage';
import { hashString, jaccard } from '../utils/hash';
import { normalizeText, unique } from '../utils/text';
import { nowIso } from '../utils/time';

const CONTROL_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
export const SKELETON_KEY = 'faf.skeleton.v1';
export const HASH_ALGORITHM = 'form-skeleton-v1';

function tokenFor(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const type = (element.getAttribute('type') ?? '').toLowerCase();
  const name = (element.getAttribute('name') ?? '').replace(/\d+/g, '#').toLowerCase();
  const placeholder = normalizeText(element.getAttribute('placeholder') ?? '')
    .replace(/\d+/g, '#')
    .toLowerCase();
  return [tag, type, name, placeholder].filter((part) => part.length > 0).join(':');
}

export function skeletonTokens(root: ParentNode): string[] {
  const nodes = Array.from(root.querySelectorAll(CONTROL_SELECTOR));
  const tokens: string[] = [];
  for (const node of nodes) {
    if (node instanceof HTMLInputElement && node.type === 'hidden') continue;
    tokens.push(tokenFor(node));
  }
  return unique(tokens).sort();
}

export function computeStructureHash(root: ParentNode): string {
  return hashString(skeletonTokens(root).join('|'));
}

export interface SkeletonRecord {
  readonly pageKey: string;
  readonly structureHash: string;
  readonly tokens: readonly string[];
  readonly detectedAt: string;
}

export async function readSkeleton(
  storage: StoragePort,
  pageKey: string,
): Promise<SkeletonRecord | undefined> {
  const all = await storage.get<Record<string, SkeletonRecord>>(SKELETON_KEY);
  return all?.[pageKey];
}

export async function writeSkeleton(
  storage: StoragePort,
  record: SkeletonRecord,
): Promise<void> {
  const all = (await storage.get<Record<string, SkeletonRecord>>(SKELETON_KEY)) ?? {};
  await storage.set(SKELETON_KEY, { ...all, [record.pageKey]: record });
}

export interface DriftInput {
  readonly storedTokens: readonly string[];
  readonly currentTokens: readonly string[];
  readonly locatorValues: readonly string[];
  readonly labels: readonly string[];
  readonly consecutive: number;
  readonly reminded: boolean;
  readonly detectedAt?: string;
}

export interface DriftDecision {
  readonly drift: boolean;
  readonly consecutive: number;
  readonly reason: string;
}

/** ARCH 17.3: exact locator-uniqueness check first, Jaccard only as a
    secondary signal with a 2-scan debounce, 7-day cooldown, once per session. */
export function evaluateDrift(input: DriftInput): DriftDecision {
  if (input.reminded) {
    return { drift: false, consecutive: 0, reason: '' };
  }
  const detectedAt = input.detectedAt ? Date.parse(input.detectedAt) : 0;
  const withinCooldown =
    Number.isFinite(detectedAt) &&
    detectedAt > 0 &&
    Date.now() - detectedAt < LIMITS.DRIFT_REMIND_COOLDOWN_DAYS * 86400000;
  if (withinCooldown) {
    return { drift: false, consecutive: input.consecutive, reason: '' };
  }

  if (input.locatorValues.length > 0) {
    const hits = input.locatorValues.filter((value) => {
      const matches = input.labels.filter(
        (label) => label === value || label.includes(value) || value.includes(label),
      );
      return matches.length === 1;
    });
    if (hits.length < input.locatorValues.length) {
      return {
        drift: true,
        consecutive: 0,
        reason: '页面规则定位不再唯一命中，建议重新校验',
      };
    }
  }

  const similarity = jaccard(input.storedTokens, input.currentTokens);
  if (similarity < LIMITS.DRIFT_JACCARD_THRESHOLD) {
    const next = input.consecutive + 1;
    if (next >= LIMITS.DRIFT_CONSECUTIVE_SCANS) {
      return { drift: true, consecutive: next, reason: '结构已变化，建议重校验' };
    }
    return { drift: false, consecutive: next, reason: '' };
  }
  return { drift: false, consecutive: 0, reason: '' };
}

export function newSkeletonRecord(pageKey: string, root: ParentNode): SkeletonRecord {
  return {
    pageKey,
    structureHash: computeStructureHash(root),
    tokens: skeletonTokens(root),
    detectedAt: nowIso(),
  };
}
