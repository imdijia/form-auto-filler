import type { EffectiveRules } from '../../contracts';
import { weightOf } from '../../config/default-rules';

/** Confidence is normalized by the strongest realistic evidence combination,
    not by the sum of every possible feature. A single exact label match is
    enough to clear 0.6; a lone nearbyText hint never clears it. */
export function confidenceDenominator(weights: EffectiveRules['weights']): number {
  return Math.max(0.5, weightOf(weights, 'label') + weightOf(weights, 'regexFeature'));
}

export function confidenceFrom(top: number, second: number, denominator: number): number {
  let confidence = Math.min(1, Math.max(0, top / denominator));
  if (top > 0 && second > 0 && top - second < Math.max(0.08, top * 0.12)) {
    confidence = Math.max(0, confidence - 0.15);
  }
  return Math.round(confidence * 100) / 100;
}
