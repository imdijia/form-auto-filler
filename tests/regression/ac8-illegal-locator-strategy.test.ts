// @vitest-environment jsdom
/**
 * Regression: QA-B03 — the picker write path (`RuleStore.savePageOverride`)
 * persisted a `FieldOverride` whose `locator.strategy` was `css` / `xpath`.
 * The exported JSON then failed the store's OWN `importJson` validation with
 * `E_RULE_SCHEMA_INVALID`: a self-inconsistent rule document, and a breach of
 * "禁用 CSS / XPath 作规则主键" (PRD §12, rules.schema.json#FieldLocator).
 *
 * Discovered: 2026-11-09 by TC-RULE-06 (`tests/unit/rule-store.test.ts:166`).
 * Fixed by: `src/config/rule-validator.ts#validateFieldOverride` (reusing
 * `checkOverride`) called at the top of `src/config/rule-store.ts#savePageOverride`.
 *
 * Persistent project-level regression case. Do not delete, skip or weaken it.
 */
import { describe, it, expect } from 'vitest';
import { createRuleStore } from '../../src/config/rule-store';
import rulesSchema from '../../docs/contracts/rules.schema.json';

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
  return createRuleStore(memoryStorage());
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

describe('Regression: AC-8 拾取器写入路径必须拒绝 CSS / XPath 主键', () => {
  it('schema 层的 strategy 枚举不含 css / xpath（回归基线）', () => {
    const strategies: string[] = (rulesSchema as unknown as {
      $defs: { FieldLocator: { properties: { strategy: { enum: string[] } } } };
    }).$defs.FieldLocator.properties.strategy.enum;
    expect(strategies).toEqual(['labelText', 'attr', 'domPath', 'rowAnchor']);
    expect(strategies.some((s) => /css|xpath|selector/i.test(s))).toBe(false);
  });

  for (const strategy of ['css', 'xpath']) {
    it(`savePageOverride 显式拒绝 strategy='${strategy}'，且非法主键不落盘`, async () => {
      const store = newStore();
      const illegal = {
        ...legalOverride,
        locator: { ...legalOverride.locator, strategy, value: '#app > input:nth-child(2)' },
      };
      await expect(store.savePageOverride('page-regression', illegal)).rejects.toThrow(/E_RULE_SCHEMA_INVALID/);
      const doc = await store.load();
      const serialized = JSON.stringify(doc);
      expect({ hasCss: serialized.includes(`"strategy":"${strategy}"`), pages: doc.pages.length }).toEqual({
        hasCss: false,
        pages: 0,
      });
    });
  }

  it('合法改绑仍可写入，且导出 JSON 能被自身 importJson 往返接受（不得误伤正常路径）', async () => {
    const store = newStore();
    await store.savePageOverride('page-regression', legalOverride);
    const doc = await store.load();
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].overrides).toHaveLength(1);
    const exported = await store.exportJson();
    const imported = await newStore().importJson(exported);
    expect({ ok: imported.ok, code: imported.code }).toEqual({ ok: true, code: undefined });
  });

  it('写入前校验同时拦住其它非法 shape（empty locator.value / 非法 action）', async () => {
    const store = newStore();
    const badValue = {
      ...legalOverride,
      locator: { ...legalOverride.locator, value: '' },
    };
    const badAction = { ...legalOverride, action: 'eval' };
    await expect(store.savePageOverride('p1', badValue)).rejects.toThrow(/E_RULE_SCHEMA_INVALID/);
    await expect(store.savePageOverride('p2', badAction)).rejects.toThrow(/E_RULE_SCHEMA_INVALID/);
    expect((await store.load()).pages).toHaveLength(0);
  });
});
