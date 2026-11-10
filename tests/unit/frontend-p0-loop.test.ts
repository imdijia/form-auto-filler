// @vitest-environment jsdom
/**
 * Frontend Phase 3 smoke test: L1 -> L2 -> plan -> six P0 strategies ->
 * three-layer readback -> report, on a synthetic form. It also locks the
 * identity consistency group (idCard / birth date / gender) to one record.
 */
import { describe, it, expect } from 'vitest';
import { LIMITS } from '../../docs/contracts/types';
import type { DiagnosticCounter, EffectiveRules, FieldHandle, FillContext } from '../../src/contracts';
import { createDefaultRules } from '../../src/config/default-rules';
import { createGeneratedRecord, birthDateOf, genderOf, isValidIdCard } from '../../src/data/consistency';
import { createRandomProvider } from '../../src/data/providers/random-provider';
import { scan } from '../../src/detection/scan';
import { infer } from '../../src/detection/infer';
import { applyOverrides } from '../../src/detection/picker';
import { createDefaultFiller } from '../../src/fill/default-filler';
import { createStateVerifier } from '../../src/fill/readback';
import { createFillPlanner } from '../../src/execution/fill-planner';
import { createFillExecutor } from '../../src/execution/fill-executor';
import { createMutationWaiter } from '../../src/execution/mutation-waiter';

const SEED = 4821;

function rules(): EffectiveRules {
  const doc = createDefaultRules();
  return {
    aliasDictionary: doc.global.aliasDictionary,
    weights: doc.global.weights,
    generators: doc.global.generators,
    confidenceThreshold: LIMITS.CONFIDENCE_THRESHOLD,
    pageOverrides: [],
    presets: doc.global.presets,
  };
}

function context(): FillContext {
  return {
    sessionId: 'smoke-session',
    seed: SEED,
    siteKey: 's-smoke',
    pageKey: 'p-smoke',
    generated: new Map(),
    locale: 'zh-CN',
    now: new Date().toISOString(),
  };
}

function buildForm(): HTMLFormElement {
  document.body.innerHTML = `
    <form id="smoke-form">
      <div><label for="a">姓名</label><input id="a" name="name" /></div>
      <div><label for="b">身份证号</label><input id="b" name="idCard" /></div>
      <div><label for="c">手机号码</label><input id="c" name="phone" /></div>
      <div><label for="d">出生日期</label><input id="d" name="birth" /></div>
      <div><label for="e">性别</label><input id="e" name="gender" /></div>
      <div><label for="f">邮箱</label><input id="f" name="email" /></div>
      <div><label for="g">详细地址</label><input id="g" name="address" /></div>
    </form>`;
  return document.getElementById('smoke-form') as HTMLFormElement;
}

function quietCounter(): DiagnosticCounter {
  return {
    increment: () => {},
    snapshot: () => ({} as ReturnType<DiagnosticCounter['snapshot']>),
    clear: () => {},
  };
}

describe('Phase 3 P0 closed loop', () => {
  it('scans, infers, plans, fills and verifies; identity group stays coherent', async () => {
    const form = buildForm();
    const effective = rules();
    const ctx = context();
    const detection = {
      root: form,
      scope: 'document' as const,
      rules: effective,
      logger: { debug: () => {}, warn: () => {} },
    };
    const report = scan(detection);
    const handles: FieldHandle[] = report.handles;
    expect(handles.length).toBe(7);
    const fields = applyOverrides(infer(handles, detection), effective);
    expect(fields.every((field) => field.container.inFormScope)).toBe(true);
    expect(fields.filter((field) => field.inferredType === 'unknown')).toHaveLength(0);

    const record = createGeneratedRecord(SEED);
    const provider = createRandomProvider(record, effective, SEED);
    const waiter = createMutationWaiter(document);
    const filler = createDefaultFiller({
      verifier: createStateVerifier(), waiter, rules: effective,
    });
    const planner = createFillPlanner({ structureHash: 'smoke-hash', driftDetected: false });
    const plan = await planner.plan(fields, effective, ctx, provider);
    expect(plan.items.filter((item) => item.selected)).toHaveLength(7);
    expect(plan.items.every((item) => item.value.length > 0)).toBe(true);

    const handleMap = new Map(handles.map((handle) => [handle.descriptor.id, handle]));
    const executor = createFillExecutor({ waiter, counter: quietCounter() });
    const result = await executor.execute(plan, handleMap, filler, ctx);
    expect(result.filled).toBe(7);
    expect(result.failed).toBe(0);
    for (const outcome of result.outcomes) {
      expect(outcome.verified).toBe(true);
      expect(outcome.verification?.domValueMatched).toBe(true);
      expect(outcome.verification?.frameworkStateMatched).toBe(true);
      expect(outcome.verification?.validationCleared).toBe(true);
    }

    const byType = new Map(
      plan.items.map((item) => [
        fields.find((field) => field.id === item.fieldId)?.inferredType,
        item.value,
      ]),
    );
    const idCard = byType.get('idCard') ?? '';
    expect(isValidIdCard(idCard)).toBe(true);
    expect(byType.get('date')).toBe(birthDateOf(idCard));
    expect(byType.get('gender')).toBe(genderOf(idCard));
    expect(byType.get('personName')).toBe(record.personName);
    expect((byType.get('phone') ?? '')).toMatch(/^1[3-9]\d{9}$/);

    const idInput = document.getElementById('b') as HTMLInputElement;
    expect(idInput.value).toBe(idCard);
  });
});
