import type { FieldType } from '../../contracts';
import { normalizeText } from '../../utils/text';

export interface AliasHit {
  readonly fieldType: FieldType;
  readonly score: number;
  readonly matched: string;
}

/** Chinese-first alias matching. Exact > text contains alias > alias contains
    text. Dictionary keys must be the 20 authoritative slugs. */
export function matchAlias(
  rawText: string,
  dictionary: Readonly<Record<string, readonly string[]>>,
): AliasHit | undefined {
  const text = normalizeText(rawText).toLowerCase();
  if (text.length === 0) return undefined;
  let best: AliasHit | undefined;
  for (const [key, aliases] of Object.entries(dictionary)) {
    for (const alias of aliases) {
      const target = alias.toLowerCase();
      if (target.length === 0) continue;
      let score = 0;
      if (text === target) score = 1;
      else if (text.includes(target)) {
        score = Math.min(0.95, 0.8 + 0.15 * (target.length / Math.max(1, text.length)));
      } else if (target.includes(text) && text.length >= 2) {
        score = 0.55;
      }
      if (score === 0) continue;
      if (!best || score > best.score || (score === best.score && target.length > best.matched.length)) {
        best = { fieldType: key as FieldType, score, matched: alias };
      }
    }
  }
  return best;
}
