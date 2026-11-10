// @vitest-environment jsdom
/**
 * Three locked thresholds (SPEC-v1 §6/§9, ARCH-v1 §17.2/§18 #8).
 *
 * Cases 01-04 run against the locked contract artifacts TODAY. Cases 05-07
 * bind to the real runtime exports infer / scan / createFillPlanner and also
 * run for real. Skipped cases would carry an explicit reason; none are muted
 * to obtain a green run.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { LIMITS } from '../../docs/contracts/types';
import fieldTypesDoc from '../../docs/contracts/field-types.json';
import rulesSchema from '../../docs/contracts/rules.schema.json';
import { createDefaultRules } from '../../src/config/default-rules';
import { loadContract, loadGateMessage, modOf, skipTag } from '../helpers/load-contract';
import { makeContext, makeField } from '../helpers/fixtures';

function readDoc(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

const prdSource = readDoc('../../docs/PRD-v1.md');
const specSource = readDoc('../../docs/SPEC-v1.md');

/* eslint-disable @typescript-eslint/no-explicit-any */
const schema: any = rulesSchema;
const doc: any = fieldTypesDoc;

type MirrorModule = { LIMITS: Record<string, number> };
type InferModule = { infer: (handles: readonly unknown[], ctx: unknown) => Array<{ inferredType: string }> };
type ScanModule = {
  scan: (ctx: unknown) => { handles: unknown[]; totalFound: number; truncated: boolean };
};
type PlanLike = { items: unknown[]; batches: unknown[][] };
type PlannerModule = {
  createFillPlanner: (init: { structureHash: string; driftDetected: boolean }) => {
    plan(fields: unknown[], rules: unknown, ctx: unknown, provider: unknown): Promise<PlanLike>;
  };
};

const detectionGlobs = import.meta.glob('../../src/detection/**/*.ts');

const mirrorLoad = await loadContract<MirrorModule>(
  import.meta.glob('../../src/contracts/**/*.ts'),
  'src/contracts/** (LIMITS mirror)',
  ['LIMITS'],
);
const inferLoad = await loadContract<InferModule>(detectionGlobs, 'src/detection/** (infer)', ['infer']);
const scanLoad = await loadContract<ScanModule>(detectionGlobs, 'src/detection/** (scan)', ['scan']);
const plannerLoad = await loadContract<PlannerModule>(
  import.meta.glob('../../src/execution/**/*.ts'),
  'src/execution/** (createFillPlanner)',
  ['createFillPlanner'],
);

const mirrorT = mirrorLoad.state === 'ready' ? it : it.skip;
const mirrorTag = skipTag(mirrorLoad);
const mirrorMod = modOf(mirrorLoad);
const inferT = inferLoad.state === 'ready' ? it : it.skip;
const inferTag = skipTag(inferLoad);
const inferMod = modOf(inferLoad);
const scanT = scanLoad.state === 'ready' ? it : it.skip;
const scanTag = skipTag(scanLoad);
const scanMod = modOf(scanLoad);
const planT = plannerLoad.state === 'ready' ? it : it.skip;
const planTag = skipTag(plannerLoad);
const planMod = modOf(plannerLoad);

function effectiveRules(threshold = LIMITS.CONFIDENCE_THRESHOLD) {
  const defaults = createDefaultRules();
  return {
    aliasDictionary: defaults.global.aliasDictionary,
    weights: { ...defaults.global.weights, confidenceThreshold: threshold },
    generators: defaults.global.generators,
    confidenceThreshold: threshold,
    pageOverrides: [],
    presets: defaults.global.presets,
  };
}

function detectionContext(root: ParentNode, threshold = LIMITS.CONFIDENCE_THRESHOLD) {
  return {
    root,
    scope: 'form',
    rules: effectiveRules(threshold),
    logger: { debug: () => {}, warn: () => {} },
  };
}

describe('三阈值：权威值与文档/契约镜像一致（真跑）', () => {
  it('TC-LIM-01 LIMITS 三值精确为 0.6 / 100 / 200', () => {
    expect({
      confidence: LIMITS.CONFIDENCE_THRESHOLD,
      virtualScroll: LIMITS.VIRTUAL_SCROLL_THRESHOLD,
      maxFields: LIMITS.MAX_FIELDS_PER_PAGE,
    }).toEqual({ confidence: 0.6, virtualScroll: 100, maxFields: 200 });
  });

  it('TC-LIM-02 field-types.json 镜像与 rules.schema.json 权重定义与 LIMITS 对齐', () => {
    expect(doc.confidenceThresholdDefault).toBe(LIMITS.CONFIDENCE_THRESHOLD);
    expect(schema.$defs.Weights.properties.confidenceThreshold.type).toBe('number');
    expect(schema.$defs.Limits.properties.maxFieldsPerPage.type).toBe('integer');
    expect(schema.$defs.Limits.properties.virtualScrollThreshold.type).toBe('integer');
  });

  it('TC-LIM-03 PRD AC-5 与 SPEC §6/§9 使用同一个 0.6 口径', () => {
    expect(prdSource).toContain('LIMITS.CONFIDENCE_THRESHOLD');
    expect(prdSource).toContain('0.6');
    expect(specSource).toContain('置信度 < 0.6 不硬猜');
    expect(specSource).toContain('CONFIDENCE_THRESHOLD 0.6');
  });

  const gate = loadGateMessage(mirrorLoad);
  if (gate) {
    it(`契约模块必须可加载并可导入: ${mirrorLoad.path}`, () => {
      throw new Error(gate);
    });
  }
  mirrorT(`${mirrorTag}TC-LIM-04 前端 src/contracts 副本的 LIMITS 必须与 docs 全字段一致`, () => {
    for (const [key, value] of Object.entries(LIMITS)) {
      expect({ key, mirrored: mirrorMod.LIMITS[key], authoritative: value }).toEqual({
        key,
        mirrored: value,
        authoritative: value,
      });
    }
  });
});

describe('三阈值运行期边界（AC-5 / §18 #8）', () => {
  for (const [load, name] of [
    [inferLoad, 'infer'],
    [scanLoad, 'scan'],
    [plannerLoad, 'createFillPlanner'],
  ] as const) {
    const gate = loadGateMessage(load);
    if (gate) {
      it(`契约模块必须可加载并可导入: ${name}`, () => {
        throw new Error(gate);
      });
    }
  }

  inferT(`${inferTag}TC-LIM-05 同一证据在阈值 0.6 通过、阈值 0.8 落 unknown（0.6 是真实边界）`, () => {
    const field = () => makeField({
      textFeatures: { ...makeField().textFeatures, label: '手机号码' },
    });
    const run = (threshold: number) => {
      const handle = {
        descriptor: field(),
        element: document.createElement('div'),
        isConnected: () => true,
      };
      return inferMod.infer([handle], detectionContext(document.body, threshold))[0].inferredType;
    };
    expect({ at060: run(0.6), at080: run(0.8) }).toEqual({ at060: 'phone', at080: 'unknown' });
  });

  scanT(`${scanTag}TC-LIM-06 单页 250 控件必须截断到 MAX_FIELDS_PER_PAGE=200`, () => {
    const form = document.createElement('form');
    for (let i = 0; i < 250; i += 1) {
      const input = document.createElement('input');
      input.type = 'text';
      input.name = `field${i}`;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    const report = scanMod.scan(detectionContext(form));
    expect({
      totalFound: report.totalFound,
      handles: report.handles.length,
      truncated: report.truncated,
    }).toEqual({ totalFound: 250, handles: LIMITS.MAX_FIELDS_PER_PAGE, truncated: true });
  });

  planT(`${planTag}TC-LIM-07 120 条计划项（> 100）必须分批，单批不超过 FILL_BATCH_SIZE`, async () => {
    const planner = planMod.createFillPlanner({ structureHash: 'qa-hash', driftDetected: false });
    const fields = Array.from({ length: 120 }, (_, i) =>
      makeField({ id: `f-${i}`, inferredType: 'personName' as const, confidence: 0.9, source: 'L2' as const }),
    );
    const provider = { id: 'qa-stub', getValue: async () => 'stub-value' };
    const plan = await planner.plan(fields, effectiveRules(), makeContext(3), provider);
    expect(plan.items).toHaveLength(120);
    expect(plan.batches.length).toBeGreaterThan(1);
    for (const batch of plan.batches) {
      expect(batch.length).toBeLessThanOrEqual(LIMITS.FILL_BATCH_SIZE);
    }
  });
});
