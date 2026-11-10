// @vitest-environment jsdom
/**
 * A4 RuleStore (SPEC-v1 §6 / §9 AC-5/AC-8, PRD-v1 §8 AC-8,
 * rules.schema.json, ARCH-v1 §5.2 / §18 #6/#8).
 *
 * Bound to the real public exports `createRuleStore` and
 * `computeStructureHash` under src/config/**. These cases RUN FOR REAL.
 */
import { describe, it, expect } from 'vitest';
import { loadContract, loadGateMessage, modOf, skipTag } from '../helpers/load-contract';

type RulesDocLike = {
  schemaVersion: number;
  global: Record<string, unknown>;
  sites: Record<string, unknown>;
  pages: Array<{ pageId: string; overrides: Array<Record<string, unknown>> }>;
};

type RuleStoreModule = {
  createRuleStore: (storage: unknown) => {
    load(): Promise<RulesDocLike>;
    getEffectiveRules(siteKey: string, pageKey: string): Promise<unknown>;
    savePageOverride(pageKey: string, override: unknown): Promise<void>;
    exportJson(): Promise<string>;
    importJson(raw: string): Promise<{ ok: boolean; code?: string; message?: string }>;
  };
};

type HashModule = {
  computeStructureHash: (root: ParentNode) => string;
};

const storeLoad = await loadContract<RuleStoreModule>(
  import.meta.glob('../../src/config/**/*.ts'),
  'src/config/** (createRuleStore)',
  ['createRuleStore'],
);
const hashLoad = await loadContract<HashModule>(
  import.meta.glob('../../src/config/**/*.ts'),
  'src/config/** (computeStructureHash)',
  ['computeStructureHash'],
);

const storeT = storeLoad.state === 'ready' ? it : it.skip;
const storeTag = skipTag(storeLoad);
const storeMod = modOf(storeLoad);
const hashT = hashLoad.state === 'ready' ? it : it.skip;
const hashTag = skipTag(hashLoad);
const hashMod = modOf(hashLoad);

function memoryStorage() {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key: string) => data.get(key),
    set: async (key: string, value: unknown) => { data.set(key, value); },
    remove: async (key: string) => { data.delete(key); },
  };
}

function newStore() {
  return storeMod.createRuleStore(memoryStorage());
}

/** Distinct letter-based names: numeric suffixes are normalized away by the
    form-skeleton-v1 hash on purpose, so they cannot be used to test drift. */
const NAMES = ['personName', 'phoneNo', 'homeAddress', 'emailAddr', 'orgName', 'schoolName'];

function buildForm(inputCount: number): HTMLFormElement {
  const form = document.createElement('form');
  for (let i = 0; i < inputCount; i += 1) {
    const input = document.createElement('input');
    input.type = 'text';
    input.name = NAMES[i % NAMES.length] ?? `extra${String.fromCharCode(97 + i)}`;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  return form;
}

describe('结构 hash：漂移检测与归一化（AC-5）', () => {
  const gate = loadGateMessage(hashLoad);
  if (gate) {
    it(`契约模块必须可加载并可导入: ${hashLoad.path}`, () => {
      throw new Error(gate);
    });
  }

  hashT(`${hashTag}TC-RULE-01 同一结构 hash 稳定，新增不同控件后 hash 变化`, () => {
    const form = buildForm(3);
    const first = hashMod.computeStructureHash(form);
    expect(hashMod.computeStructureHash(form)).toBe(first);
    const extra = document.createElement('input');
    extra.type = 'email';
    extra.name = 'brandNewEmail';
    form.appendChild(extra);
    expect(hashMod.computeStructureHash(form)).not.toBe(first);
  });

  hashT(`${hashTag}TC-RULE-02 动态 id / 随机 class / data-v-* / 时间戳不引起漂移`, () => {
    const a = buildForm(2);
    a.id = 'form-1001';
    a.className = 'css-a1b2c3';
    a.setAttribute('data-v-aaa', '');
    a.setAttribute('data-timestamp', '1700000000000');
    const b = buildForm(2);
    b.id = 'form-9999';
    b.className = 'css-z9y8x7';
    b.setAttribute('data-v-bbb', '');
    b.setAttribute('data-timestamp', '1799999999999');
    expect(hashMod.computeStructureHash(b)).toBe(hashMod.computeStructureHash(a));
  });
});

describe('RuleStore：只存增量 / 导出不含计数 / 导入校验 / 禁 CSS-XPath 主键', () => {
  const gate = loadGateMessage(storeLoad);
  if (gate) {
    it(`契约模块必须可加载并可导入: ${storeLoad.path}`, () => {
      throw new Error(gate);
    });
  }

  const legalOverride = {
    locator: {
      strategy: 'labelText',
      value: '姓名',
      fallbacks: [],
      scope: 'form',
      frame: 'top',
    },
    action: 'setType',
    fieldType: 'personName',
  };

  storeT(`${storeTag}TC-RULE-03 改绑只新增一条页面级增量规则，不改全局/站点配置`, async () => {
    const store = newStore();
    const before = await store.load();
    await store.savePageOverride('page-1', legalOverride);
    const after = await store.load();
    expect(after.global).toEqual(before.global);
    expect(after.sites).toEqual(before.sites);
    expect(after.pages).toHaveLength(1);
    expect(after.pages[0].overrides).toHaveLength(1);
    expect(after.pages[0].overrides[0].action).toBe('setType');
  });

  storeT(`${storeTag}TC-RULE-04 exportJson 不含诊断计数（faf.counters.v1 / 计数事件名）`, async () => {
    const store = newStore();
    await store.savePageOverride('page-1', legalOverride);
    const raw = await store.exportJson();
    const parsed: unknown = JSON.parse(raw);
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain('faf.counters.v1');
    expect(serialized).not.toContain('field_inferred');
    expect(serialized).not.toContain('fill_triggered');
    expect(Object.keys(parsed as object)).not.toContain('counters');
  });

  storeT(`${storeTag}TC-RULE-05 importJson 拒绝不兼容 schemaVersion，返回 E_RULE_SCHEMA_INVALID`, async () => {
    const store = newStore();
    const bad = JSON.stringify({ schemaVersion: 999, global: {}, sites: {}, pages: [] });
    const res = await store.importJson(bad);
    expect({ ok: res.ok, code: res.code }).toEqual({ ok: false, code: 'E_RULE_SCHEMA_INVALID' });
  });

  storeT(`${storeTag}TC-RULE-06 CSS/XPath 不得作为规则主键落盘（拾取器写入路径同样受 schema 约束）`, async () => {
    const store = newStore();
    const illegal = {
      ...legalOverride,
      locator: { ...legalOverride.locator, strategy: 'css', value: '#app > input:nth-child(2)' },
    };
    let rejected = false;
    try {
      await store.savePageOverride('page-2', illegal);
    } catch {
      rejected = true;
    }
    const doc = await store.load();
    const serialized = JSON.stringify(doc);
    // Silently accepting an illegal primary key is itself a contract breach:
    // the exported document would fail its own import validation.
    expect(rejected).toBe(true);
    expect(serialized).not.toContain('"strategy":"css"');
    expect(serialized).not.toContain('"strategy":"xpath"');
    for (const page of doc.pages) {
      for (const override of page.overrides) {
        const locator = override.locator as { strategy?: string } | undefined;
        expect(['labelText', 'attr', 'domPath', 'rowAnchor']).toContain(locator?.strategy);
      }
    }
  });
});
