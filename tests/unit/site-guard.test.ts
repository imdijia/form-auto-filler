// @vitest-environment jsdom
/**
 * C3 SiteGuard + L1 form-scope exclusion (SPEC-v1 §9 AC-1/AC-6, PRD-v1 §8 AC-6,
 * PRD-v1 §11 「误填次数 = 0」, SPEC-v1 §11 已知坑).
 *
 * Bound to the real public exports `createSiteGuard` and `scan`.
 * These cases RUN FOR REAL. The three hard indicators (mis-fill / auto-submit /
 * outbound requests = 0) are additionally enforced by the E2E checklist in
 * docs/QA-TEST-PLAN.md.
 */
import { describe, it, expect } from 'vitest';
import { LIMITS } from '../../docs/contracts/types';
import { createDefaultRules } from '../../src/config/default-rules';
import { loadContract, loadGateMessage, modOf, skipTag } from '../helpers/load-contract';

type GuardResult = { ok: boolean; code?: string; message?: string };

type GuardModule = {
  createSiteGuard: () => {
    setAllowlist(entries: readonly string[]): void;
    assertAllowed(hostname: string, url: string): GuardResult;
  };
};

type ScannedField = {
  skipReason?: string;
  hasValue: boolean;
  container: { inFormScope: boolean; isExcluded: boolean; excludeReason?: string };
};

type ScanModule = {
  scan: (ctx: unknown) => { handles: Array<{ descriptor: ScannedField }> };
};

const guardLoad = await loadContract<GuardModule>(
  import.meta.glob('../../src/config/**/*.ts'),
  'src/config/** (createSiteGuard)',
  ['createSiteGuard'],
);
const scanLoad = await loadContract<ScanModule>(
  import.meta.glob('../../src/detection/**/*.ts'),
  'src/detection/** (scan)',
  ['scan'],
);

const guardT = guardLoad.state === 'ready' ? it : it.skip;
const guardTag = skipTag(guardLoad);
const guardMod = modOf(guardLoad);
const scanT = scanLoad.state === 'ready' ? it : it.skip;
const scanTag = skipTag(scanLoad);
const scanMod = modOf(scanLoad);

const ALLOWLIST = ['*.test.example.com'];

function guard() {
  const instance = guardMod.createSiteGuard();
  instance.setAllowlist(ALLOWLIST);
  return instance;
}

function detectionContext(root: ParentNode) {
  const doc = createDefaultRules();
  return {
    root,
    scope: 'document',
    rules: {
      aliasDictionary: doc.global.aliasDictionary,
      weights: doc.global.weights,
      generators: doc.global.generators,
      confidenceThreshold: LIMITS.CONFIDENCE_THRESHOLD,
      pageOverrides: [],
      presets: doc.global.presets,
    },
    logger: { debug: () => {}, warn: () => {} },
  };
}

function textInput(): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'text';
  return el;
}

describe('SiteGuard：白名单拒绝（AC-6 / E_SITE_NOT_ALLOWED）', () => {
  const gate = loadGateMessage(guardLoad);
  if (gate) {
    it(`契约模块必须可加载并可导入: ${guardLoad.path}`, () => {
      throw new Error(gate);
    });
  }

  guardT(`${guardTag}TC-GUARD-01 非白名单域名必须拒绝且记 E_SITE_NOT_ALLOWED`, () => {
    const res = guard().assertAllowed('prod.example.com', 'https://prod.example.com/form');
    expect({ ok: res.ok, code: res.code }).toEqual({ ok: false, code: 'E_SITE_NOT_ALLOWED' });
  });

  guardT(`${guardTag}TC-GUARD-02 白名单内 test/uat 子域必须放行`, () => {
    const res = guard().assertAllowed('uat.test.example.com', 'https://uat.test.example.com/form');
    expect(res.ok).toBe(true);
  });

  guardT(`${guardTag}TC-GUARD-03 不在白名单的域名不得因含 test 子串被放行（AC-6 硬门槛）`, () => {
    const res = guard().assertAllowed('test.example.com.evil.com', 'https://test.example.com.evil.com/form');
    expect({ ok: res.ok, code: res.code }).toEqual({ ok: false, code: 'E_SITE_NOT_ALLOWED' });
  });
});

describe('L1 扫描：表单容器外控件排除与误填防护（安全硬指标）', () => {
  const gate = loadGateMessage(scanLoad);
  if (gate) {
    it(`契约模块必须可加载并可导入: ${scanLoad.path}`, () => {
      throw new Error(gate);
    });
  }

  scanT(`${scanTag}TC-GUARD-04 搜索框/筛选框在表单容器外：不得进入可填集合，排除项必须带原因`, () => {
    const form = document.createElement('form');
    const normal = textInput();
    normal.setAttribute('aria-label', '姓名');
    form.appendChild(normal);
    document.body.appendChild(form);

    const search = textInput();
    search.type = 'search';
    search.setAttribute('aria-label', '搜索');
    document.body.appendChild(search);

    const filter = document.createElement('select');
    filter.setAttribute('aria-label', '筛选条件');
    document.body.appendChild(filter);

    const report = scanMod.scan(detectionContext(document.body));
    const fields = report.handles.map((h) => h.descriptor);
    const fillable = fields.filter((f) => !f.skipReason && !f.container.isExcluded);
    const excluded = fields.filter((f) => f.skipReason || f.container.isExcluded);

    expect(fillable.length).toBeGreaterThan(0);
    for (const field of fillable) {
      expect(field.container.inFormScope).toBe(true);
    }
    expect(excluded.length).toBeGreaterThan(0);
    for (const field of excluded) {
      expect(Boolean(field.skipReason || field.container.excludeReason)).toBe(true);
      expect(field.container.isExcluded).toBe(true);
    }
  });

  scanT(`${scanTag}TC-GUARD-05 只读/禁用/隐藏/文件/密码/验证码/已有值控件：可填集合为空且原值不被改写`, () => {
    const form = document.createElement('form');
    const protectedInputs: HTMLInputElement[] = [];
    const specs: Array<{ type: string; setup: (el: HTMLInputElement) => void }> = [
      { type: 'text', setup: (el) => { el.readOnly = true; } },
      { type: 'text', setup: (el) => { el.disabled = true; } },
      { type: 'hidden', setup: () => {} },
      { type: 'file', setup: () => {} },
      { type: 'password', setup: () => {} },
      { type: 'text', setup: (el) => { el.setAttribute('aria-label', '验证码'); } },
    ];
    for (const spec of specs) {
      const el = textInput();
      el.type = spec.type;
      spec.setup(el);
      form.appendChild(el);
      protectedInputs.push(el);
    }
    const withValue = textInput();
    withValue.value = '原有值';
    form.appendChild(withValue);
    document.body.appendChild(form);

    const report = scanMod.scan(detectionContext(form));
    const fields = report.handles.map((h) => h.descriptor);
    const fillable = fields.filter(
      (f) => !f.skipReason && !f.container.isExcluded && !f.hasValue,
    );
    expect(fillable).toHaveLength(0);
    expect(withValue.value).toBe('原有值');
    for (const el of protectedInputs) {
      expect(el.value).toBe('');
    }
  });
});
