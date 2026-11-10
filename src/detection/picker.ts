import type {
  EffectiveRules,
  FieldDescriptor,
  FieldLocator,
  FieldOverride,
  FieldType,
} from '../contracts';

function locatorMatches(field: FieldDescriptor, locator: FieldLocator): boolean {
  const label = field.textFeatures.label;
  const name = field.textFeatures.name;
  const id = field.textFeatures.elementId;
  const value = locator.value;
  const fallbacks = locator.fallbacks ?? [];
  switch (locator.strategy) {
    case 'labelText':
      return label === value || field.locator.value === value ||
        (value.length > 1 && label.includes(value));
    case 'attr':
      return name === value || id === value || fallbacks.includes(name) || fallbacks.includes(id);
    case 'rowAnchor':
      return field.container.readablePath === value ||
        field.container.readablePath.includes(value);
    case 'domPath':
      // Human-readable position hint only. Never a CSS / XPath selector.
      return field.container.readablePath.includes(value);
    default:
      return false;
  }
}

/** L3: incremental corrections only. Never a full field map. */
export function applyOverrides(
  fields: FieldDescriptor[],
  rules: EffectiveRules,
): FieldDescriptor[] {
  for (const override of rules.pageOverrides) {
    for (const field of fields) {
      if (!locatorMatches(field, override.locator)) continue;
      if (override.action === 'setType' && override.fieldType) {
        field.inferredType = override.fieldType;
        field.confidence = 1;
        field.source = 'RULE';
        if (field.skipReason === 'low-confidence') delete field.skipReason;
      } else if (override.action === 'skip') {
        field.skipReason = 'rule-excluded';
      }
      // forceValue is reserved for PresetProvider and is not applied in v1.
    }
  }
  return fields;
}

/** Builds the single page-level incremental rule written by the picker. */
export function buildTypeOverride(
  field: FieldDescriptor,
  fieldType: Exclude<FieldType, 'unknown'>,
  note = '',
): FieldOverride {
  const locator: FieldLocator = {
    strategy: field.locator.strategy,
    value: field.locator.value,
    fallbacks: [...field.locator.fallbacks],
    scope: field.locator.scope,
    frame: field.locator.frame,
    anchorLabel: field.locator.anchorLabel ?? field.container.readablePath,
  };
  return { locator, action: 'setType', fieldType, note };
}
