/**
 * B1/B2 generator legality (SPEC-v1 §6 / §9 AC-4, PRD-v1 §8 AC-4 / §11).
 *
 * Bound to the real public exports GENERATORS / createGeneratedRecord /
 * createRng / createDefaultRules. These cases RUN FOR REAL. Legality is
 * computed by an INDEPENDENT oracle in tests/helpers/legality.ts (GB 11643
 * weighting, CN mobile plan, calendar validation) - never by importing the
 * implementation's own isValidIdCard.
 *
 * Fixed-seed reproducibility also asserts a DIFFERENT seed produces a
 * DIFFERENT dataset, which kills the "hard-code a constant" cheat.
 */
import { describe, it, expect } from 'vitest';
import { FIELD_TYPES, LIMITS, type FieldType } from '../../docs/contracts/types';
import { createGeneratedRecord } from '../../src/data/consistency';
import { createRng } from '../../src/utils/rng';
import { createDefaultRules } from '../../src/config/default-rules';
import { loadContract, loadGateMessage, modOf, skipTag } from '../helpers/load-contract';
import { makeConstraints, typedField } from '../helpers/fixtures';
import {
  checkIdCard,
  PHONE_PATTERN,
  stripDateSeparators,
  genderMatchesIdCard,
  onStepLattice,
} from '../helpers/legality';

type GeneratorMap = Record<string, (input: unknown) => string>;
type GeneratorModule = { GENERATORS: GeneratorMap };

const load = await loadContract<GeneratorModule>(
  import.meta.glob('../../src/data/generators/**/*.ts'),
  'src/data/generators/** (GENERATORS)',
  ['GENERATORS'],
);

const t = load.state === 'ready' ? it : it.skip;
const tag = skipTag(load);
const m = modOf(load);

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

function valueFor(
  fieldType: FieldType,
  overrides: Parameters<typeof typedField>[1],
  seed: number,
): string {
  const generator = m.GENERATORS[fieldType];
  if (!generator) throw new Error(`GENERATORS 缺少 ${fieldType}`);
  return generator({
    field: typedField(fieldType, overrides),
    record: createGeneratedRecord(seed),
    rng: createRng(seed),
    rules: effectiveRules(),
  });
}

const OPTION_TYPES: FieldType[] = ['dictEnum', 'gender', 'education', 'jobTitle', 'region'];

function optionsFor(fieldType: FieldType): string[] {
  return fieldType === 'gender' ? ['男', '女'] : ['中共党员', '共青团员', '群众'];
}

describe('生成器合法性：身份证 / 号段 / 一致性组 / 种子 / 枚举 / 数值约束', () => {
  const gate = loadGateMessage(load);
  if (gate) {
    it(`契约模块必须可加载并可导入: ${load.path}`, () => {
      throw new Error(gate);
    });
  }

  t(`${tag}TC-GEN-01 身份证 200 个种子均为 18 位 + GB11643 校验位 + 合法地区码 + 合法出生日期`, () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const raw = valueFor('idCard', undefined, seed);
      const verdict = checkIdCard(raw);
      expect({ seed, raw, ok: verdict.ok, reasons: verdict.reasons }).toEqual({
        seed,
        raw,
        ok: true,
        reasons: [],
      });
    }
  });

  t(`${tag}TC-GEN-02 手机号 200 个种子均命中 ^1[3-9][0-9]{9}$ 且长度 11`, () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const raw = valueFor('phone', undefined, seed);
      expect({ seed, raw, matched: PHONE_PATTERN.test(raw), length: raw.length }).toEqual({
        seed,
        raw,
        matched: true,
        length: 11,
      });
    }
  });

  t(`${tag}TC-GEN-03 identity 一致性组：日期=证件 7-14 位、性别=第 17 位奇偶、同种子同一条记录`, () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const idCard = valueFor('idCard', undefined, seed);
      const date = valueFor('date', undefined, seed);
      const gender = valueFor('gender', { enumOptions: ['男', '女'] }, seed);
      const personName = valueFor('personName', undefined, seed);
      expect(checkIdCard(idCard).ok).toBe(true);
      expect({ seed, date, birth: stripDateSeparators(date), idCardBirth: idCard.slice(6, 14) }).toEqual({
        seed,
        date,
        birth: idCard.slice(6, 14),
        idCardBirth: idCard.slice(6, 14),
      });
      // AC-4: gender MUST follow the parity of ID position 17.
      expect({ seed, gender, parity: Number(idCard[16]) % 2, matched: genderMatchesIdCard(idCard, gender) }).toEqual({
        seed,
        gender,
        parity: Number(idCard[16]) % 2,
        matched: true,
      });
      expect(personName).toMatch(/^[\u4e00-\u9fa5]{2,4}$/);
    }
  });

  t(`${tag}TC-GEN-04 固定种子可复现，且换种子必须产生不同数据集（反硬编码）`, () => {
    const run = (seed: number): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const ft of FIELD_TYPES) {
        const overrides = OPTION_TYPES.includes(ft) ? { enumOptions: optionsFor(ft) } : undefined;
        out[ft] = valueFor(ft, overrides, seed);
      }
      return out;
    };
    const first = run(20261109);
    const second = run(20261109);
    const other = run(20261110);
    expect(second).toEqual(first);
    expect(other).not.toEqual(first);
  });

  t(`${tag}TC-GEN-05 枚举值必须来自页面 option 集合，50 个种子不出现集合外值`, () => {
    for (const ft of OPTION_TYPES) {
      const options = optionsFor(ft);
      for (let seed = 1; seed <= 50; seed += 1) {
        const raw = valueFor(ft, { enumOptions: options }, seed);
        expect({ ft, seed, raw, inOptions: options.includes(raw) }).toEqual({
          ft,
          seed,
          raw,
          inOptions: true,
        });
      }
    }
  });

  t(`${tag}TC-GEN-06 金额尊重 min/max/step 且小数位 <= 2`, () => {
    const constraints = makeConstraints({ min: '10.5', max: '99.9', step: '0.5' });
    for (let seed = 1; seed <= 50; seed += 1) {
      const raw = valueFor('amount', { constraints }, seed);
      const value = Number(raw);
      expect({
        seed,
        raw,
        inRange: value >= 10.5 && value <= 99.9,
        onLattice: onStepLattice(value, 10.5, 0.5),
        decimals: /^\d+(\.\d{1,2})?$/.test(raw),
      }).toEqual({ seed, raw, inRange: true, onLattice: true, decimals: true });
    }
  });

  t(`${tag}TC-GEN-07 数量尊重 min/max/step 且为整数`, () => {
    const constraints = makeConstraints({ min: '1', max: '10', step: '2' });
    for (let seed = 1; seed <= 50; seed += 1) {
      const raw = valueFor('quantity', { constraints }, seed);
      const value = Number(raw);
      expect({
        seed,
        raw,
        integer: Number.isInteger(value),
        inRange: value >= 1 && value <= 10,
        onLattice: onStepLattice(value, 1, 2),
      }).toEqual({ seed, raw, integer: true, inRange: true, onLattice: true });
    }
  });

  t(`${tag}TC-GEN-08 百分比落在 0..100，去掉后缀后仍是合法数值`, () => {
    const constraints = makeConstraints({ min: '0', max: '100' });
    for (let seed = 1; seed <= 50; seed += 1) {
      const raw = valueFor('percentage', { constraints }, seed);
      const value = Number(raw.replace(/%$/, ''));
      expect({ seed, raw, inRange: value >= 0 && value <= 100 }).toEqual({ seed, raw, inRange: true });
    }
  });

  t(`${tag}TC-GEN-09 code 尊重 pattern（含标准 HTML 锚点）/maxLength、longText 中文短句、email ASCII、date 按 valueFormat`, () => {
    for (const pattern of ['[A-Z]{2}\\d{4}', '^[A-Z]{2}\\d{4}$']) {
      const raw = valueFor('code', { constraints: makeConstraints({ pattern, maxLength: 6 }) }, 7);
      expect({ pattern, raw, matched: new RegExp(pattern).test(raw), withinMax: raw.length <= 6 }).toEqual({
        pattern,
        raw,
        matched: true,
        withinMax: true,
      });
    }

    const longRaw = valueFor('longText', { constraints: makeConstraints({ maxLength: 30 }) }, 7);
    expect({ longRaw, withinMax: longRaw.length <= 30, chinese: /[\u4e00-\u9fa5]/.test(longRaw) }).toEqual({
      longRaw,
      withinMax: true,
      chinese: true,
    });

    const mailRaw = valueFor('email', undefined, 7);
    expect({ mailRaw, ascii: /^[\x00-\x7F]+$/.test(mailRaw), hasAt: mailRaw.includes('@') }).toEqual({
      mailRaw,
      ascii: true,
      hasAt: true,
    });

    const dateRaw = valueFor('date', { constraints: makeConstraints({ valueFormat: 'YYYY/MM/DD' }) }, 7);
    expect({ dateRaw, formatted: /^\d{4}\/\d{2}\/\d{2}$/.test(dateRaw) }).toEqual({
      dateRaw,
      formatted: true,
    });
  });
});
