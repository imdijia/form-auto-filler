// @vitest-environment jsdom
/**
 * AC-V2-05 口径修正的核心判别器（项目总监裁决，SPEC-v2 该条由 PM 定点修正中）：
 *
 *   成功 = DOM 值匹配 + 两个渲染帧稳定；
 *   validationCleared 仅为 advisory 证据，不再作为硬判失败层。
 *
 * 为什么这是「修复前必然失败、修复后必然通过」的判别断言：
 *   v1 的 src/fill/strategies/common.ts verifyAndBuild 要求三层全过
 *   （domValueMatched && frameworkStateMatched && validationCleared），
 *   且 failingLayer 会把 validationCleared=false 报成失败层。
 *   在页面自身校验态未清除、但值确实写入且两帧稳定的常见场景下，
 *   v1 会把明明填成功的字段判为「失败」——这正是「填不进去 / 填错」的一类根因。
 *   本文件的判别断言在 v1 代码上必然变红，修正为 advisory 口径后必然变绿。
 *
 * 本文件刻意不写「三层全过才算成功」的断言，也不把 validationCleared 从证据里抹掉。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as common from '../../src/fill/strategies/common';
import * as readback from '../../src/fill/readback';
import type { FieldHandle, FieldDescriptor } from '../../src/contracts/field';
import type { VerificationDetail } from '../../src/contracts/types';

function detail(overrides: Partial<VerificationDetail> = {}): VerificationDetail {
  const cleared = overrides.validationCleared ?? true;
  return {
    domValueMatched: true,
    frameworkStateMatched: true,
    validationCleared: cleared,
    evidence: ['dom-value-match', 'rerender-stable', cleared ? 'validation-clear' : 'validation-error'],
    checkedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function depsWith(d: VerificationDetail): common.StrategyDeps {
  return {
    verifier: { verify: vi.fn(async () => d) },
    waiter: { waitFor: vi.fn(async () => ({ ok: true, value: undefined })) },
    rules: {} as unknown as common.StrategyDeps['rules'],
  } as unknown as common.StrategyDeps;
}

function makeHandle(value: string, ariaInvalid: boolean): FieldHandle {
  const el = document.createElement('input');
  el.type = 'text';
  el.value = value;
  if (ariaInvalid) el.setAttribute('aria-invalid', 'true');
  document.body.appendChild(el);
  return {
    descriptor: {
      id: 'f0', controlType: 'input', tagName: 'INPUT', inputType: 'text',
    } as unknown as FieldDescriptor,
    element: el,
    isConnected: () => el.isConnected,
  };
}

describe('AC-V2-05 校验态仅作 advisory 证据（黑盒契约）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // readback 的 twoRenderFrames 依赖 rAF + MessageChannel；jsdom 里同步化，
    // 避免异步挂起，同时不改变「两个渲染帧」的语义。
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    class FakeMessageChannel {
      port1: { onmessage: ((event: unknown) => void) | null } = { onmessage: null };
      port2 = { postMessage: () => { /* rAF 已同步完成，无需回退链 */ } };
    }
    vi.stubGlobal('MessageChannel', FakeMessageChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('判别器：DOM 值匹配 + 两帧稳定，但校验态未清除时仍判成功（v1 必然失败）', async () => {
    const verification = detail({
      validationCleared: false,
      evidence: ['dom-value-match', 'rerender-stable', 'validation-error'],
    });
    const result = await common.verifyAndBuild(
      makeHandle('张三', false), '张三', depsWith(verification), 0, 'native-input',
    );
    expect(result.status).toBe('filled');
    expect(result.verified).toBe(true);
  });

  it('advisory 证据不被抹掉：validationCleared=false 仍保留在 verification 里', async () => {
    const verification = detail({ validationCleared: false });
    const result = await common.verifyAndBuild(
      makeHandle('张三', false), '张三', depsWith(verification), 0, 'native-input',
    );
    expect(result.verification).toBeTruthy();
    expect(result.verification?.validationCleared).toBe(false);
    expect(result.verification?.evidence).toContain('validation-error');
  });

  it('DOM 值不匹配时仍判失败（不得放宽到只看事件派发）', async () => {
    const verification = detail({ domValueMatched: false, frameworkStateMatched: false });
    const result = await common.verifyAndBuild(
      makeHandle('', false), '张三', depsWith(verification), 0, 'native-input',
    );
    expect(result.status).toBe('failed');
    expect(result.verified).toBe(false);
    expect(result.code).toBe('E_READBACK_MISMATCH');
  });

  it('两个渲染帧后值被框架回滚时仍判失败', async () => {
    const verification = detail({ frameworkStateMatched: false });
    const result = await common.verifyAndBuild(
      makeHandle('张三', false), '张三', depsWith(verification), 0, 'native-input',
    );
    expect(result.status).toBe('failed');
    expect(result.verified).toBe(false);
  });

  it('failingLayer 不再把 validationCleared 报成失败层', () => {
    const fn = (readback as unknown as Record<string, unknown>).failingLayer;
    expect(typeof fn, 'failingLayer 应继续作为公开导出保留').toBe('function');
    const text = (fn as (d: VerificationDetail) => string)(detail({ validationCleared: false }));
    expect(text).not.toMatch(/validationCleared|校验态未清除/);
  });

  it('端到端判别器：真实 StateVerifier 采到「值已写入 + 两帧稳定 + 校验态未清」时应判成功', async () => {
    // 页面自身把 aria-invalid 置为 true 表示校验态未清；值本身已稳定写入。
    const handle = makeHandle('张三', true);
    const verifier = readback.createStateVerifier();
    const observed = await verifier.verify(handle, '张三', 'native-input');
    expect(observed.domValueMatched).toBe(true);
    expect(observed.frameworkStateMatched).toBe(true);
    expect(observed.validationCleared).toBe(false);

    const result = await common.verifyAndBuild(
      handle, '张三',
      {
        verifier,
        waiter: { waitFor: vi.fn(async () => ({ ok: true, value: undefined })) },
        rules: {} as unknown as common.StrategyDeps['rules'],
      } as unknown as common.StrategyDeps,
      0, 'native-input',
    );
    expect(result.status, '校验态未清不得再把已写入且稳定的字段判为失败').toBe('filled');
    expect(result.verified).toBe(true);
    expect(result.verification?.validationCleared).toBe(false);
  });
});
