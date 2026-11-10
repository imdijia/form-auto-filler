import { LIMITS } from '../contracts';
import type {
  DataProvider,
  EffectiveRules,
  FieldDescriptor,
  FillContext,
  FillPlan,
  FillPlanner,
  PlanItem,
  SkipReason,
} from '../contracts';
import { nowIso } from '../utils/time';

const HARD_SKIPS = new Set<SkipReason>([
  'readonly', 'disabled', 'hidden', 'file', 'captcha',
  'outside-form', 'search-or-filter', 'has-value',
  'user-unchecked', 'rule-excluded', 'unsupported-control',
  'field-limit-exceeded',
]);

const IDENTITY_TYPES = new Set(['idCard', 'date', 'gender', 'personName']);

/** Runtime-only annotation, not part of the locked PlanItem contract: the
    label-derived fallback could not satisfy field.constraints.pattern.
    execution/diagnostics.ts renders it as the human-readable reason. */
interface FallbackPlanItem extends PlanItem {
  fallbackFailure?: boolean;
}

export interface PlannerInit {
  readonly structureHash: string;
  readonly driftDetected: boolean;
}

/** Three-column plan: page control / inferred field type / value to write.
    Nothing is written before the user confirms. */
export function createFillPlanner(init: PlannerInit): FillPlanner {
  return {
    async plan(
      fields: FieldDescriptor[],
      _rules: EffectiveRules,
      ctx: FillContext,
      provider: DataProvider,
    ): Promise<FillPlan> {
      const identityIds = fields
        .filter((field) => IDENTITY_TYPES.has(field.inferredType))
        .map((field) => field.id);
      const items: PlanItem[] = [];
      for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index];
        if (!field) continue;
        const hardSkipped = Boolean(field.skipReason && HARD_SKIPS.has(field.skipReason));
        const isUnknown = field.inferredType === 'unknown';
        let value = '';
        // v2.1: 'unknown' is no longer excluded. The provider returns a
        // label-derived test value; hard-protected controls stay skipped.
        if (!hardSkipped) {
          value = await provider.getValue(field, ctx);
        }
        // dictEnum must use a real page option. With none available we do not
        // invent a value and the row is placed in the out-of-scope group.
        // A disabled generator returns '' as well: the field is excluded by
        // rule, never written as an empty string into the host form.
        const emptyEnum = field.inferredType === 'dictEnum' && value.length === 0;
        const generatorDisabled =
          !hardSkipped && !emptyEnum && value.length === 0;
        // AC-V2-17: an unsatisfiable fallback pattern uses the EXISTING
        // 'unsupported-control' enum. No new SkipReason value is introduced.
        const fallbackFailed = isUnknown && generatorDisabled;
        let skipReason: SkipReason | undefined = generatorDisabled
          ? (fallbackFailed ? 'unsupported-control' : 'rule-excluded')
          : emptyEnum
            ? 'unsupported-control'
            : field.skipReason;
        // A filled unknown field must be selected and must not keep the
        // misleading low-confidence tag in the per-field diagnosis.
        if (isUnknown && value.length > 0 && skipReason === 'low-confidence') {
          skipReason = undefined;
        }
        const item: FallbackPlanItem = {
          fieldId: field.id,
          fieldType: field.inferredType,
          value,
          selected: !hardSkipped && !emptyEnum && !generatorDisabled,
          skipReason,
          batch: Math.floor(index / LIMITS.FILL_BATCH_SIZE),
          dependsOn: IDENTITY_TYPES.has(field.inferredType)
            ? identityIds.filter((id) => id !== field.id)
            : [],
        };
        // Non-enumerable: the marker stays in memory for diagnostics but is
        // never serialized into LAST_PLAN, so the stored plan shape is intact.
        if (fallbackFailed) {
          Object.defineProperty(item, 'fallbackFailure', { value: true, enumerable: false });
        }
        items.push(item);
      }
      const batches: PlanItem[][] = [];
      for (const item of items) {
        const batch = batches[item.batch] ?? [];
        batch.push(item);
        batches[item.batch] = batch;
      }
      return {
        sessionId: ctx.sessionId,
        items,
        batches,
        structureHash: init.structureHash,
        driftDetected: init.driftDetected,
        createdAt: nowIso(),
      };
    },
  };
}
