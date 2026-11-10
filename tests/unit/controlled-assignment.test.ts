// @vitest-environment jsdom
/**
 * C1 controlled assignment + three-layer readback
 * (SPEC-v1 §5/§9 AC-3/§11, PRD-v1 §8 AC-3/§12, ARCH-v1 §14.1/§14.2/§18 #1).
 *
 * Bound to the real public exports: setNativeValue, createStateVerifier,
 * createFiller + the six mandatory P0 strategies, verifyAndBuild.
 * These cases RUN FOR REAL.
 *
 * v2: the single source of truth for success is FillResult.verified driven
 * by domValueMatched + frameworkStateMatched. validationCleared stays in the
 * VerificationDetail as advisory evidence only, never a success condition.
 * "Events were dispatched" is NEVER a success condition here.
 *
 * TC-FILL-05 is the mandatory mutation case: events ARE dispatched but the
 * framework rolls the value back on the second render frame. The rollback is
 * injected as an observable DOM proxy (ISOLATED world cannot read framework
 * state objects - ARCH 14.2), which is exactly what the two-frame readback
 * observes. It MUST be reported as failed with E_READBACK_MISMATCH.
 */
import { describe, it, expect } from 'vitest';
import { LIMITS } from '../../docs/contracts/types';
import { createDefaultRules } from '../../src/config/default-rules';
import { createStateVerifier } from '../../src/fill/readback';
import { verifyAndBuild } from '../../src/fill/strategies/common';
import { createNativeInputStrategy } from '../../src/fill/strategies/native-input';
import { createNativeSelectStrategy } from '../../src/fill/strategies/native-select';
import { createAntDesignVueSelectStrategy } from '../../src/fill/strategies/ant-design-vue-select';
import { createAntDesignVueDatePickerStrategy } from '../../src/fill/strategies/ant-design-vue-date-picker';
import { createElementPlusSelectStrategy } from '../../src/fill/strategies/element-plus-select';
import { createElementPlusDatePickerStrategy } from '../../src/fill/strategies/element-plus-date-picker';
import { loadContract, loadGateMessage, modOf, skipTag } from '../helpers/load-contract';
import { makeContext, makeHandle, typedField } from '../helpers/fixtures';

type VerificationLike = {
  domValueMatched: boolean;
  frameworkStateMatched: boolean;
  validationCleared: boolean;
  evidence: string[];
  checkedAt: string;
};

type FillResultLike = {
  status: 'filled' | 'skipped' | 'failed';
  verified: boolean;
  code?: string;
  failureReason?: string;
  verification?: VerificationLike;
};

type SetterModule = { setNativeValue: (el: HTMLElement, value: string) => void };
type FillerModule = {
  createFiller: (strategies: readonly unknown[]) => {
    fill(handle: unknown, value: string, ctx: unknown): Promise<FillResultLike>;
  };
};

const setterLoad = await loadContract<SetterModule>(
  import.meta.glob('../../src/fill/**/*.ts'),
  'src/fill/** (setNativeValue)',
  ['setNativeValue'],
);
const fillerLoad = await loadContract<FillerModule>(
  import.meta.glob('../../src/fill/**/*.ts'),
  'src/fill/** (createFiller)',
  ['createFiller'],
);

const setterT = setterLoad.state === 'ready' ? it : it.skip;
const setterTag = skipTag(setterLoad);
const setter = modOf(setterLoad);
const fillerT = fillerLoad.state === 'ready' ? it : it.skip;
const fillerTag = skipTag(fillerLoad);
const fillerMod = modOf(fillerLoad);

function effectiveRules() {
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

function strategyDeps(verifier: unknown = createStateVerifier()) {
  return {
    verifier,
    waiter: { waitFor: async () => ({ ok: true as const, value: undefined }) },
    rules: effectiveRules(),
  };
}

/** The same six P0 strategies the WXT entrypoint registers unconditionally. */
function buildFiller(deps = strategyDeps()) {
  return fillerMod.createFiller([
    createNativeInputStrategy(deps as never),
    createNativeSelectStrategy(deps as never),
    createAntDesignVueSelectStrategy(deps as never),
    createAntDesignVueDatePickerStrategy(deps as never),
    createElementPlusSelectStrategy(deps as never),
    createElementPlusDatePickerStrategy(deps as never),
  ]);
}

function inputInForm(): HTMLInputElement {
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.type = 'text';
  form.appendChild(input);
  document.body.appendChild(form);
  return input;
}

function runFill(handle: unknown, value: string, deps = strategyDeps()): Promise<FillResultLike> {
  return buildFiller(deps).fill(handle, value, makeContext(1));
}

function detail(overrides: Partial<VerificationLike>): VerificationLike {
  return {
    domValueMatched: true,
    frameworkStateMatched: true,
    validationCleared: true,
    evidence: ['dom-value-match', 'rerender-stable', 'validation-clear'],
    checkedAt: '2026-11-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('受控赋值：原生 setter 与冒泡事件（SPEC §11 已知坑）', () => {
  const gate = loadGateMessage(setterLoad);
  if (gate) {
    it(`契约模块必须可加载并可导入: ${setterLoad.path}`, () => {
      throw new Error(gate);
    });
  }

  setterT(`${setterTag}TC-FILL-01 原生 setter 写入并派发冒泡 input/change 事件`, () => {
    const input = inputInForm();
    let inputEvents = 0;
    let changeEvents = 0;
    input.addEventListener('input', () => { inputEvents += 1; });
    input.addEventListener('change', () => { changeEvents += 1; });
    setter.setNativeValue(input, '张三');
    expect({ value: input.value, inputEvents, changeEvents }).toEqual({
      value: '张三',
      inputEvents: 1,
      changeEvents: 1,
    });
  });

  setterT(`${setterTag}TC-FILL-02 禁止裸 value 赋值：必须绕过实例 setter（模拟 React inputValueTracking）`, () => {
    const input = inputInForm();
    let instanceSetterCalls = 0;
    Object.defineProperty(input, 'value', {
      configurable: true,
      get(this: HTMLInputElement & { _shadow?: string }) {
        return this._shadow ?? '';
      },
      set(this: HTMLInputElement & { _shadow?: string }, v: string) {
        instanceSetterCalls += 1;
        this._shadow = v;
      },
    });
    setter.setNativeValue(input, '李四');
    expect(instanceSetterCalls).toBe(0);
    const protoGetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.get;
    expect(protoGetter?.call(input)).toBe('李四');
  });
});

describe('三层回读：verified 是唯一成功判据（ARCH §14.2）', () => {
  const gate = loadGateMessage(fillerLoad);
  if (gate) {
    it(`契约模块必须可加载并可导入: ${fillerLoad.path}`, () => {
      throw new Error(gate);
    });
  }

  fillerT(`${fillerTag}TC-FILL-03 三层证据全 true 才能 verified=true / status=filled`, async () => {
    const input = inputInForm();
    const result = await runFill(makeHandle(typedField('personName'), input), '张三');
    expect({
      dom: result.verification?.domValueMatched,
      framework: result.verification?.frameworkStateMatched,
      validation: result.verification?.validationCleared,
      verified: result.verified,
      status: result.status,
    }).toEqual({ dom: true, framework: true, validation: true, verified: true, status: 'filled' });
    expect(result.verification?.evidence.every((e) => !e.includes('张三'))).toBe(true);
  });

  // v2: validationCleared is advisory evidence only. The two hard layers are
  // the ones whose failure must produce E_READBACK_MISMATCH.
  for (const layer of ['domValueMatched', 'frameworkStateMatched'] as const) {
    fillerT(`${fillerTag}TC-FILL-04 任一层失败即 E_READBACK_MISMATCH（${layer}）`, async () => {
      const failedDetail = detail({ [layer]: false });
      const verifier = { verify: async () => failedDetail };
      const handle = makeHandle(typedField('personName'), inputInForm());
      const result = await verifyAndBuild(
        handle,
        '张三',
        strategyDeps(verifier) as never,
        performance.now(),
        'qa-stub',
      );
      expect({
        verified: result.verified,
        status: result.status,
        code: result.code,
        failedLayer: result.failureReason?.includes(layer),
      }).toEqual({ verified: false, status: 'failed', code: 'E_READBACK_MISMATCH', failedLayer: true });
      expect(result.verification?.[layer]).toBe(false);
    });
  }

  fillerT(`${fillerTag}TC-FILL-04b 【v2】校验态仅作 advisory：DOM 值匹配 + 两帧稳定即成功`, async () => {
    const advisory = detail({
      validationCleared: false,
      evidence: [
        'dom-value-match', 'rerender-stable',
        'validation-advisory:页面仍有校验提示', 'adapter:qa-stub',
      ],
    });
    const verifier = { verify: async () => advisory };
    const handle = makeHandle(typedField('personName'), inputInForm());
    const result = await verifyAndBuild(
      handle,
      '张三',
      strategyDeps(verifier) as never,
      performance.now(),
      'qa-stub',
    );
    expect({
      verified: result.verified,
      status: result.status,
      code: result.code,
      validation: result.verification?.validationCleared,
      advisory: result.verification?.evidence.some((entry) => entry.includes('validation-advisory')),
    }).toEqual({
      verified: true,
      status: 'filled',
      code: undefined,
      validation: false,
      advisory: true,
    });
  });

  fillerT(`${fillerTag}TC-FILL-05 【变异必过项】事件已派发但框架在两帧后回滚值，必须判失败`, async () => {
    const input = inputInForm();
    let dispatched = 0;
    input.addEventListener('change', () => { dispatched += 1; });

    // Mutation: a controlled component re-renders with its old state. The
    // first DOM read sees the new value; the second (two frames later) sees
    // the framework's rollback. This is the observable proxy for state.
    let reads = 0;
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() {
        reads += 1;
        return reads <= 1 ? '王五' : '';
      },
      set() {},
    });
    // makeStrategy retries once; reset the proxy on each assignment so both
    // attempts fail at the SAME layer (frameworkStateMatched), not a
    // downstream domValueMatched artifact of the test double.
    input.addEventListener('input', () => { reads = 0; });

    const result = await runFill(makeHandle(typedField('personName'), input), '王五');
    expect(dispatched).toBeGreaterThan(0);
    expect(reads).toBeGreaterThanOrEqual(2);
    expect({
      verified: result.verified,
      status: result.status,
      code: result.code,
      layer: result.failureReason?.includes('frameworkStateMatched'),
      countedAsSuccess: result.status === 'filled',
    }).toEqual({
      verified: false,
      status: 'failed',
      code: 'E_READBACK_MISMATCH',
      layer: true,
      countedAsSuccess: false,
    });
  });

  fillerT(`${fillerTag}TC-FILL-06 超 v1 适配范围控件记 E_UNSUPPORTED_CONTROL，不得判成功`, async () => {
    const root = document.createElement('div');
    root.className = 'el-cascader';
    document.body.appendChild(root);
    const result = await runFill(makeHandle(typedField('region', { controlType: 'other' }), root), '任意值');
    expect({ code: result.code, verified: result.verified, status: result.status }).toEqual({
      code: 'E_UNSUPPORTED_CONTROL',
      verified: false,
      status: 'failed',
    });
  });
});
