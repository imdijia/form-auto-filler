import type {
  DataProvider,
  EffectiveRules,
  FieldDescriptor,
  FieldType,
  FillContext,
  PresetsConfig,
} from '../../contracts';
import type { FieldTypeKey } from '../../contracts/field-metadata';
import type { GeneratedRecord } from '../consistency';
import { GENERATORS } from '../generators';
import { generateFallbackValue } from '../generators/fallback-text';
import { createRng, deriveSeed } from '../../utils/rng';

/** presets schema is reserved in v1: an empty string falls back to random.
    The UI does not expose it, and no preset value is ever logged or sent. */
function resolvePreset(
  field: FieldDescriptor,
  ctx: FillContext,
  presets: PresetsConfig,
  seed: number,
): string {
  const key = field.inferredType;
  // 'unknown' has no preset bucket and no generator class. It is filled by a
  // deterministic, label-derived value instead of being left blank.
  if (key === 'unknown') {
    return generateFallbackValue(field, createRng(deriveSeed(seed, field.id)));
  }
  return (
    presets.byPage[ctx.pageKey]?.[key] ||
    presets.bySite[ctx.siteKey]?.[key] ||
    presets.global[key] ||
    ''
  );
}

export function createRandomProvider(
  record: GeneratedRecord,
  rules: EffectiveRules,
  seed: number,
  generated?: Map<FieldType, string>,
): DataProvider {
  return {
    id: 'random',
    getValue(field: FieldDescriptor, ctx: FillContext): string {
      if (field.inferredType === 'unknown') {
        // The 20 generator switches do not cover the 'unknown' sentinel, so
        // this fallback is intentionally NOT gated by rules.generators.
        return generateFallbackValue(field, createRng(deriveSeed(seed, field.id)));
      }
      // The options-page generator switch is real, not decorative.
      if (rules.generators[field.inferredType]?.enabled === false) return '';
      const preset = resolvePreset(field, ctx, rules.presets, seed);
      if (preset.length > 0) {
        generated?.set(field.inferredType, preset);
        return preset;
      }
      const generator = GENERATORS[field.inferredType as FieldTypeKey];
      if (!generator) return '';
      // Per-field sub-seed is derived from the field identity only, never from
      // the session id, so the same seed reproduces the same values.
      const rng = createRng(deriveSeed(seed, field.id));
      const value = generator({ field, record, rng, rules });
      generated?.set(field.inferredType, value);
      return value;
    },
  };
}
