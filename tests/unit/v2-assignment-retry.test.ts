// @vitest-environment jsdom
/**
 * AC-V2-05 契约级单测：赋值失败重试路径与错误隔离。
 *
 * 从需求反推的可观测行为：
 *  - 赋值未通过回读时必须重试，且有重试上限（不得超过 2 次）；
 *  - 适配器抛异常不得泄漏到宿主页、不得中断其余字段；
 *  - 6 个 P0 赋值策略必须齐全（缺一即快速失败）；
 *  - 「事件已派发」绝不等于成功，DOM 值不匹配必须记失败。
 *
 * 注意：本文件刻意不写「三层全过才算成功」的断言，口径以项目总监裁决为准
 * （成功 = DOM 值匹配 + 两渲染帧稳定，validationCleared 仅 advisory）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as common from '../../src/fill/strategies/common';
import { createFiller, P0_STRATEGY_IDS } from '../../src/fill/filler';
import type { FieldHandle, FieldDescriptor } from '../../src/contracts/field';
import type { FillResult, VerificationDetail } from '../../src/contracts/types';

function makeHandle(id = 'f0'): FieldHandle {
  const el = document.createElement('input');
  el.id = id;
  el.type = 'text';
  document.body.appendChild(el);
  return {
    descriptor: {
      id, controlType: 'input', tagName: 'INPUT', inputType: 'text',
    } as unknown as FieldDescriptor,
    element: el,
    isConnected: () => el.isConnected,
  };
}

function failed(id = 'f0'): FillResult {
  return {
    fieldId: id, status: 'failed', verified: false,
    code: 'E_READBACK_MISMATCH', failureReason: 'domValueMatched: 赋值后 DOM 值与预期不一致',
    controlType: 'input', attempts: 1, elapsedMs: 1,
  };
}

function succeeded(id = 'f0'): FillResult {
  return {
    fieldId: id, status: 'filled', verified: true, value: '张三',
    controlType: 'input', attempts: 1, elapsedMs: 1,
  };
}

function p0Strategies(): Array<{ id: string; supports: () => boolean; fill: () => Promise<FillResult> }> {
  return P0_STRATEGY_IDS.map((id) => ({
    id,
    supports: () => false,
    fill: async () => failed(),
  }));
}

function depsWith(detail: VerificationDetail): common.StrategyDeps {
  return {
    verifier: { verify: vi.fn(async () => detail) },
    waiter: { waitFor: vi.fn(async () => ({ ok: true, value: undefined })) },
    rules: {} as unknown as common.StrategyDeps['rules'],
  } as unknown as common.StrategyDeps;
}

describe('AC-V2-05 赋值失败重试与错误隔离（黑盒契约）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('第一次失败、第二次成功：attempts=2 且返回 verified=true', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(failed())
      .mockResolvedValueOnce(succeeded());
    const strategy = common.makeStrategy('stub', () => true, run);
    const result = await strategy.fill(makeHandle(), '张三', {} as never);
    expect(run).toHaveBeenCalledTimes(2);
    expect(result.attempts).toBe(2);
    expect(result.status).toBe('filled');
    expect(result.verified).toBe(true);
  });

  it('两次都失败：attempts=2、status=failed、不无限重试', async () => {
    const run = vi.fn().mockResolvedValue(failed());
    const strategy = common.makeStrategy('stub', () => true, run);
    const result = await strategy.fill(makeHandle(), '张三', {} as never);
    expect(run).toHaveBeenCalledTimes(2);
    expect(result.attempts).toBe(2);
    expect(result.status).toBe('failed');
    expect(result.verified).toBe(false);
    expect(result.code).toBe('E_READBACK_MISMATCH');
  });

  it('适配器抛异常时错误被隔离：不抛出、返回失败结果、不波及其余字段', async () => {
    const run = vi.fn().mockRejectedValue(new Error('adapter boom'));
    const strategy = common.makeStrategy('stub', () => true, run);
    await expect(strategy.fill(makeHandle(), '张三', {} as never)).resolves.toMatchObject({
      status: 'failed', verified: false, code: 'E_READBACK_MISMATCH',
    });
  });

  it('createFiller 缺少任一 P0 策略时快速失败（6 个策略不可降级为插件）', () => {
    const incomplete = p0Strategies().slice(1);
    expect(() => createFiller(incomplete as never)).toThrow(/missing mandatory P0 filler strategy/);
  });

  it('createFiller 具备全部 6 个 P0 策略时构造成功', () => {
    expect(() => createFiller(p0Strategies() as never)).not.toThrow();
    expect(P0_STRATEGY_IDS).toHaveLength(6);
  });

  it('某个策略的 fill 抛异常时 filler.fill 仍返回失败结果而不抛出（不中断批量填充）', async () => {
    const strategies = p0Strategies();
    strategies[0] = {
      id: strategies[0].id,
      supports: () => true,
      fill: async () => { throw new Error('boom'); },
    };
    const filler = createFiller(strategies as never);
    await expect(filler.fill(makeHandle(), '张三', {} as never)).resolves.toMatchObject({
      status: 'failed', verified: false, code: 'E_READBACK_MISMATCH',
    });
  });

  it('DOM 值不匹配时 verifyAndBuild 判失败（不得把「事件已派发」当成功）', async () => {
    const detail: VerificationDetail = {
      domValueMatched: false, frameworkStateMatched: false, validationCleared: true,
      evidence: ['dom-value-mismatch'], checkedAt: '2026-01-01T00:00:00.000Z',
    };
    const result = await common.verifyAndBuild(
      makeHandle(), '张三', depsWith(detail), 0, 'native-input',
    );
    expect(result.status).toBe('failed');
    expect(result.verified).toBe(false);
    expect(result.code).toBe('E_READBACK_MISMATCH');
    expect(result.verification?.domValueMatched).toBe(false);
  });
});
