import type {
  DetectionContext,
  FieldDescriptor,
  FieldHandle,
  FieldType,
} from '../contracts';
import { weightOf } from '../config/default-rules';
import type { FeatureKey } from '../config/default-rules';
import { matchAlias } from './scoring/alias-dictionary';
import { confidenceDenominator, confidenceFrom } from './scoring/feature-weights';
import { regexHints } from './scoring/regex-features';

const HARD_EXCLUSIONS = new Set([
  'hidden', 'disabled', 'readonly', 'file', 'captcha',
  'outside-form', 'search-or-filter', 'unsupported-control',
  'field-limit-exceeded', 'rule-excluded', 'user-unchecked',
]);

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** L2. Weighted score across label > placeholder > nameId > ariaLabel >
    nearbyText > formRowStructure > regex/attribute. Below the threshold the
    field becomes the 'unknown' sentinel; we never hard-guess. */
export function infer(
  handles: readonly FieldHandle[],
  ctx: DetectionContext,
): FieldDescriptor[] {
  const dictionary = ctx.rules.aliasDictionary;
  const weights = ctx.rules.weights;
  const threshold = ctx.rules.confidenceThreshold;
  const denominator = confidenceDenominator(weights);

  return handles.map((handle) => {
    const field = handle.descriptor;
    field.scoreBreakdown = {};
    if (field.skipReason && HARD_EXCLUSIONS.has(field.skipReason)) {
      field.inferredType = 'unknown';
      field.confidence = 0;
      field.source = 'L1';
      return field;
    }

    const scores = new Map<FieldType, number>();
    const breakdown: Record<string, number> = {};
    const add = (type: FieldType, amount: number, feature: string): void => {
      if (type === 'unknown' || amount <= 0) return;
      scores.set(type, (scores.get(type) ?? 0) + amount);
      breakdown[feature] = round((breakdown[feature] ?? 0) + amount);
    };

    const textFeatures: readonly { key: FeatureKey; text: string }[] = [
      { key: 'label', text: field.textFeatures.label },
      { key: 'placeholder', text: field.textFeatures.placeholder },
      { key: 'nameId', text: field.textFeatures.name + ' ' + field.textFeatures.elementId },
      { key: 'ariaLabel', text: field.textFeatures.ariaLabel },
      { key: 'nearbyText', text: field.textFeatures.nearbyText },
    ];
    for (const feature of textFeatures) {
      const hit = matchAlias(feature.text, dictionary);
      if (hit) add(hit.fieldType, hit.score * weightOf(weights, feature.key), feature.key);
    }

    // v2.1 P0: component libraries often emit no <label for> at all, so the
    // label slot is empty and a lone placeholder hit (0.7 weight) can never
    // clear the fixed denominator of label(1.0) + regexFeature(0.4). Here the
    // placeholder IS the primary evidence, so re-weight that same hit at the
    // label weight on the same fieldType. Deliberately NOT a dynamic
    // denominator: TC-L2-03 (no features) and TC-L2-05 (regex only) must stay
    // below threshold, and this branch only fires on an actual alias hit.
    if ((field.textFeatures.label ?? '').length === 0) {
      const placeholderHit = matchAlias(field.textFeatures.placeholder ?? '', dictionary);
      if (placeholderHit) {
        add(placeholderHit.fieldType, placeholderHit.score * weightOf(weights, 'label'), 'placeholder');
      }
    }

    const rowHit = matchAlias(field.container.readablePath, dictionary);
    if (rowHit) {
      add(rowHit.fieldType, rowHit.score * weightOf(weights, 'formRowStructure') * 0.6, 'formRowStructure');
    }

    for (const hint of regexHints(field)) {
      add(hint.fieldType, hint.score * weightOf(weights, 'regexFeature'), 'regexFeature');
    }

    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked[0]?.[1] ?? 0;
    const second = ranked[1]?.[1] ?? 0;
    const bestType: FieldType = ranked[0]?.[0] ?? 'unknown';
    let confidence = confidenceFrom(top, second, denominator);
    if (bestType === 'dictEnum' && field.enumOptions.length === 0) {
      confidence = Math.min(confidence, 0.45);
    }
    if (bestType === 'unknown') confidence = 0;
    field.confidence = confidence;
    field.scoreBreakdown = breakdown;
    field.source = 'L2';
    field.inferredType = confidence < threshold || bestType === 'unknown' ? 'unknown' : bestType;
    if (field.inferredType === 'unknown' && !field.skipReason) {
      field.skipReason = 'low-confidence';
    }
    return field;
  });
}
