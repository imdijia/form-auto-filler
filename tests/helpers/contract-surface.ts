/**
 * QA <-> frontend contract surface (Phase 2, test-first).
 *
 * BASELINE (QA preset, derived from interfaces.ts + ARCH-v1 §5.2):
 *   inferFieldType / RandomProvider / Filler / RuleStore / SiteGuard / ...
 *
 * ALIGNED (2026-11-09, after frontend produced src/):
 *   The frontend uses factory functions (createXxx) and a GENERATORS map,
 *   which is a legitimate reading of "entrypoints only assemble" and does NOT
 *   violate any locked interface. QA therefore re-bound its tests to the real
 *   public exports instead of asking the frontend to rename code. NO assertion
 *   was deleted or weakened during this re-binding.
 *
 * Modules are discovered by export name under the listed glob, so file renames
 * are harmless. If an export moves, team-lead aligns it with QA and the test
 * binding is updated - never muted.
 *
 * This file contains no implementation. Mirrored in docs/QA-TEST-PLAN.md §2.
 */
export const CONTRACT_SURFACE = {
  inference: {
    glob: 'src/detection/**/*.ts',
    exports: ['infer'],
    signature: 'infer(handles: readonly FieldHandle[], ctx: DetectionContext): FieldDescriptor[]',
    basis: 'interfaces.ts FieldDetector.infer; ARCH-v1 §5.2 src/detection/infer.ts; SPEC-v1 §2 A2',
  },
  scanning: {
    glob: 'src/detection/**/*.ts',
    exports: ['scan'],
    signature: 'scan(ctx: DetectionContext): ScanReport { handles, totalFound, truncated }',
    basis: 'interfaces.ts FieldDetector.scan; SPEC-v1 §2 A1; field.ts ContainerInfo',
  },
  generators: {
    glob: 'src/data/generators/**/*.ts',
    exports: ['GENERATORS'],
    signature: 'GENERATORS[fieldType](input: GeneratorInput): string',
    basis: 'interfaces.ts DataProvider; SPEC-v1 §6 B1/B2; field-types.json 20 generator ids',
  },
  generatedRecord: {
    glob: 'src/data/**/*.ts',
    exports: ['createGeneratedRecord'],
    signature: 'createGeneratedRecord(seed: number): GeneratedRecord (identity consistency group)',
    basis: 'ARCH-v1 §5.2 src/data/consistency.ts; SPEC-v1 §6 identity group',
  },
  rng: {
    glob: 'src/utils/**/*.ts',
    exports: ['createRng'],
    signature: 'createRng(seed: number): Rng',
    basis: 'SPEC-v1 §6 B2 fixed-seed reproducibility',
  },
  defaultRules: {
    glob: 'src/config/**/*.ts',
    exports: ['createDefaultRules'],
    signature: 'createDefaultRules(): RulesDocument',
    basis: 'rules.schema.json; docs/contracts/field-types.json alias dictionary',
  },
  filler: {
    glob: 'src/fill/**/*.ts',
    exports: ['createDefaultFiller'],
    signature: 'createDefaultFiller(): Filler (six mandatory P0 strategies assembled)',
    basis: 'ARCH-v1 §14.1 / §14.2; interfaces.ts Filler / StateVerifier',
    status: 'NOT PRODUCED YET - cases are skipped with reason',
  },
  nativeSetter: {
    glob: 'src/fill/**/*.ts',
    exports: ['setNativeValue'],
    signature: 'setNativeValue(el: HTMLElement, value: string): void',
    basis: 'SPEC-v1 §11 bare value assignment pitfall; ARCH-v1 §5.2 native-setter.ts',
    status: 'NOT PRODUCED YET - cases are skipped with reason',
  },
  ruleStore: {
    glob: 'src/config/**/*.ts',
    exports: ['createRuleStore'],
    signature: 'createRuleStore(storage: StoragePort): RuleStoreEx',
    basis: 'interfaces.ts RuleStore; rules.schema.json; SPEC-v1 §6',
  },
  structureHash: {
    glob: 'src/config/**/*.ts',
    exports: ['computeStructureHash'],
    signature: 'computeStructureHash(root: ParentNode): string',
    basis: 'ARCH-v1 §5.2 structure-hash.ts; rules.schema.json#PageOverride.structureHash',
  },
  siteGuard: {
    glob: 'src/config/**/*.ts',
    exports: ['createSiteGuard'],
    signature: 'createSiteGuard(): SiteGuardEx; .setAllowlist(entries); .assertAllowed(hostname, url)',
    basis: 'interfaces.ts SiteGuard; SPEC-v1 §9 AC-6; PRD-v1 §8 AC-6',
  },
  planner: {
    glob: 'src/execution/**/*.ts',
    exports: ['FillPlanner'],
    signature: 'FillPlanner.plan(...): Promise<FillPlan>',
    basis: 'interfaces.ts FillPlanner; types.ts FillPlan; ARCH-v1 §17.2',
    status: 'NOT PRODUCED YET - cases are skipped with reason',
  },
  limitsMirror: {
    glob: 'src/contracts/**/*.ts',
    exports: ['LIMITS'],
    signature: 'LIMITS (must equal docs/contracts/types.ts#LIMITS field by field)',
    basis: 'ARCH-v1 §17.2; SPEC-v1 §6 three locked thresholds',
  },
} as const;

export type ContractSurfaceKey = keyof typeof CONTRACT_SURFACE;
