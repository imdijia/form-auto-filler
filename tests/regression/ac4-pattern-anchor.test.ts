/**
 * Regression: QA-B02 — `code` generator ignored standard HTML `pattern`
 * attributes that carry `^...$` anchors. `fromPattern` returned null and the
 * generator silently fell back to `record.code`, producing a value that the
 * page's own `pattern` validation rejects (AC-4: 违反约束的值不得写入).
 *
 * Discovered: 2026-11-09 by TC-GEN-09 (`tests/unit/generator-legality.test.ts:201`).
 * Fixed by: `src/data/generators/shared.ts#fromPattern` stripping leading `^`
 * and trailing `$` before tokenizing; `src/data/generators/code.ts` unchanged.
 *
 * Persistent project-level regression case. Do not delete, skip or weaken it.
 * Every subsequent change runs this file.
 *
 * Discriminating power: the fallback value (`record.code = 'A' + 6 digits`)
 * provably does NOT match any pattern below, so a regression to the old
 * fallback path turns these assertions red instead of accidentally passing.
 */
import { describe, it, expect } from 'vitest';
import { LIMITS, type FieldType } from '../../docs/contracts/types';
import { GENERATORS } from '../../src/data/generators';
import { createGeneratedRecord } from '../../src/data/consistency';
import { createRng } from '../../src/utils/rng';
import { createDefaultRules } from '../../src/config/default-rules';
import { makeConstraints, typedField } from '../helpers/fixtures';

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

function generate(fieldType: FieldType, pattern: string, seed: number, maxLength?: number): string {
  const generator = GENERATORS[fieldType];
  if (!generator) throw new Error(`GENERATORS 缺少 ${fieldType}`);
  return generator({
    field: typedField(fieldType, {
      constraints: makeConstraints({ pattern, ...(maxLength === undefined ? {} : { maxLength }) }),
    }),
    record: createGeneratedRecord(seed),
    rng: createRng(seed),
    rules: effectiveRules(),
  } as never);
}

const ANCHORED = [
  '^[A-Z]{2}\\d{4}$',
  '^[A-Z]{3}\\d{3}$',
  '^[0-9]{6}$',
  '^\\d{4}[A-Z]{2}$',
];
const UNANCHORED = ['[A-Z]{2}\\d{4}', '\\d{6}'];

/**
 * HTML `pattern` is implicitly anchored to the WHOLE value. Using a bare
 * `new RegExp(pattern)` would accept `A974369` for `\d{6}` (substring match),
 * which is exactly the false-green this regression must not permit. The oracle
 * below is strictly stronger than the browser-side check, never weaker.
 */
function htmlPattern(pattern: string): RegExp {
  let source = pattern.trim();
  if (source.startsWith('^')) source = source.slice(1);
  if (source.endsWith('$') && !source.endsWith('\\$')) source = source.slice(0, -1);
  return new RegExp(`^(?:${source})$`);
}

describe('Regression: AC-4 code 生成器必须尊重带 ^...$ 锚点的 pattern', () => {
  it('回退值本身不可能命中这些 pattern（保证该用例能杀死旧缺陷）', () => {
    for (const pattern of [...ANCHORED, ...UNANCHORED]) {
      for (let seed = 1; seed <= 10; seed += 1) {
        const fallback = createGeneratedRecord(seed).code;
        expect({ pattern, seed, fallback, fallbackMatches: htmlPattern(pattern).test(fallback) }).toEqual({
          pattern,
          seed,
          fallback,
          fallbackMatches: false,
        });
      }
    }
  });

  it('4 个带锚点 pattern × 30 个种子，生成值全部通过 HTML 全串锚定校验', () => {
    for (const pattern of ANCHORED) {
      for (let seed = 1; seed <= 30; seed += 1) {
        const raw = generate('code', pattern, seed);
        expect({ pattern, seed, raw, matched: htmlPattern(pattern).test(raw), length: raw.length }).toEqual({
          pattern,
          seed,
          raw,
          matched: true,
          length: 6,
        });
      }
    }
  });

  it('无锚点 pattern 保持可用（修复不得误伤正常路径）', () => {
    for (const pattern of UNANCHORED) {
      for (let seed = 1; seed <= 30; seed += 1) {
        const raw = generate('code', pattern, seed);
        expect({ pattern, seed, raw, matched: htmlPattern(pattern).test(raw) }).toEqual({
          pattern,
          seed,
          raw,
          matched: true,
        });
      }
    }
  });

  it('锚点与非锚点写法产出同长度合法值，且 maxLength 仍被尊重', () => {
    const a = generate('code', '^[A-Z]{2}\\d{4}$', 7, 6);
    const b = generate('code', '[A-Z]{2}\\d{4}', 7, 6);
    expect({ aValid: /^[A-Z]{2}\d{4}$/.test(a), bValid: /^[A-Z]{2}\d{4}$/.test(b), aLen: a.length, bLen: b.length }).toEqual({
      aValid: true,
      bValid: true,
      aLen: 6,
      bLen: 6,
    });
  });
});
