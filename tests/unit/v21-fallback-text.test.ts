// @vitest-environment jsdom
/**
 * AC-V2-16 / AC-V2-17 单元测试：兜底取值优先级、主体文案、同页去重、
 * maxlength、pattern、格式约束、硬保护跳过。全部引用前端真实模块
 * src/data/generators/fallback-text.ts，测试内不复制任何实现逻辑。
 *
 * 判别前提：R2 之前不存在该模块（导入即失败）；v2.1 落地后本文件必须全绿。
 */
import { describe, it, expect } from 'vitest';
import {
  generateFallbackValue,
  resolveSemanticSource,
  FALLBACK_PATTERN_FAIL_REASON,
} from '../../src/data/generators/fallback-text';
import { makeV21Field, v21Rng, LOCKED_SKIP_REASONS } from './v21-helpers';

const gen = (field: ReturnType<typeof makeV21Field>) =>
  generateFallbackValue(field, v21Rng(field.id));

describe('AC-V2-13 / 4.2 兜底语义词取值优先级', () => {
  it('label 优先于 placeholder，来源标记为 label', () => {
    const field = makeV21Field({
      textFeatures: {
        label: '来源表', placeholder: '请输入自定义编号', name: '', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
    });
    expect(resolveSemanticSource(field)).toEqual({ word: '来源表', source: 'label' });
  });

  it('label 为空时取 placeholder', () => {
    const field = makeV21Field({
      textFeatures: {
        label: '', placeholder: '请输入自定义编号', name: '', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
    });
    const resolved = resolveSemanticSource(field);
    expect(resolved.source).toBe('placeholder');
    expect(resolved.word).toContain('自定义编号');
  });

  it('label / placeholder 为空时依次取 ariaLabel / nearbyText', () => {
    const aria = makeV21Field({
      textFeatures: {
        label: '', placeholder: '', name: '', elementId: '',
        ariaLabel: '辅助提示词', nearbyText: '',
      },
    });
    expect(resolveSemanticSource(aria)).toEqual({ word: '辅助提示词', source: 'ariaLabel' });

    const nearby = makeV21Field({
      textFeatures: {
        label: '', placeholder: '', name: '', elementId: '',
        ariaLabel: '', nearbyText: '邻近提示词',
      },
    });
    expect(resolveSemanticSource(nearby)).toEqual({ word: '邻近提示词', source: 'nearbyText' });
  });

  it('name / elementId 取词时去除技术前缀与连字符，不把 f-org 原样写入', () => {
    const byName = makeV21Field({
      textFeatures: {
        label: '', placeholder: '', name: 'f-org', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
    });
    expect(resolveSemanticSource(byName)).toEqual({ word: 'org', source: 'name' });

    const byId = makeV21Field({
      textFeatures: {
        label: '', placeholder: '', name: '', elementId: 'f-decoy',
        ariaLabel: '', nearbyText: '',
      },
    });
    expect(resolveSemanticSource(byId)).toEqual({ word: 'decoy', source: 'elementId' });

    const value = gen(byName);
    expect(value).toContain('org');
    expect(value).not.toContain('f-org');
  });

  it('全部语义来源取不到时统一使用「该字段」，不得使用控件类型名', () => {
    const field = makeV21Field();
    const resolved = resolveSemanticSource(field);
    expect(resolved).toEqual({ word: '该字段', source: 'default' });
    const value = gen(field);
    expect(value).toContain('我是该字段测试数据');
    expect(value).not.toMatch(/INPUT|text|unknown/i);
  });
});

describe('AC-V2-16 主体文案「我是{语义词}测试数据」、随机后缀与同页去重', () => {
  it('产品级范例：label「来源表」生成「我是来源表测试数据」并带 2 位随机后缀', () => {
    const field = makeV21Field({
      id: 'f0-0-source',
      textFeatures: {
        label: '来源表', placeholder: '', name: '', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
    });
    const value = gen(field);
    expect(value).toMatch(/^我是来源表测试数据·\d{2}$/);
  });

  it('同页两个同名标签字段因 field.id 派生种子不同而值不重复', () => {
    const a = makeV21Field({
      id: 'f0-0-dup-a',
      textFeatures: {
        label: '同名登记项', placeholder: '', name: '', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
    });
    const b = makeV21Field({
      id: 'f0-0-dup-b',
      textFeatures: {
        label: '同名登记项', placeholder: '', name: '', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
    });
    const va = gen(a);
    const vb = gen(b);
    expect(va).toContain('我是同名登记项测试数据');
    expect(vb).toContain('我是同名登记项测试数据');
    expect(va).not.toBe(vb);
  });

  it('maxlength=8 时值长度不超过 8 且保留语义词可辨识前缀，不留空', () => {
    const field = makeV21Field({
      id: 'f0-0-max8',
      textFeatures: {
        label: '长度受限项', placeholder: '', name: '', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
      constraints: {
        required: false, readOnly: false, disabled: false, hidden: false, maxLength: 8,
      },
    });
    const value = gen(field);
    expect(value.length).toBeGreaterThan(0);
    expect(Array.from(value).length).toBeLessThanOrEqual(8);
    expect(value.startsWith('我是')).toBe(true);
    expect(value).toContain('长度受限项');
  });

  it('maxlength 极小（3）时仍生成非空值且保留「我是」前缀', () => {
    const field = makeV21Field({
      id: 'f0-0-max3',
      textFeatures: {
        label: '来源表', placeholder: '', name: '', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
      constraints: {
        required: false, readOnly: false, disabled: false, hidden: false, maxLength: 3,
      },
    });
    const value = gen(field);
    expect(value.length).toBeGreaterThan(0);
    expect(Array.from(value).length).toBeLessThanOrEqual(3);
    expect(value.startsWith('我是')).toBe(true);
  });
});

describe('AC-V2-17 pattern 与格式约束（格式合法 > 语义词 > 模板字面）', () => {
  it('四位数字 pattern + maxlength=4 时产出合法 4 位数字', () => {
    const field = makeV21Field({
      id: 'f0-0-pattern4',
      textFeatures: {
        label: '四位数字约束项', placeholder: '', name: '', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
      constraints: {
        required: false, readOnly: false, disabled: false, hidden: false,
        maxLength: 4, pattern: '[0-9]{4}',
      },
    });
    const value = gen(field);
    expect(value).toMatch(/^\d{4}$/);
  });

  it('任何兜底候选都无法满足的 pattern 返回空串（仅跳过该字段）', () => {
    const field = makeV21Field({
      id: 'f0-0-pattern-unsat',
      textFeatures: {
        label: '格式受限项', placeholder: '', name: '', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
      constraints: {
        required: false, readOnly: false, disabled: false, hidden: false,
        pattern: '[A-Z]{3}-[0-9]{4}',
      },
    });
    expect(gen(field)).toBe('');
  });

  it('pattern 字段返回空串不影响同批其它字段继续生成（不阻塞）', () => {
    const blocked = makeV21Field({
      id: 'f0-0-blocked',
      constraints: {
        required: false, readOnly: false, disabled: false, hidden: false,
        pattern: '[A-Z]{3}-[0-9]{4}',
      },
    });
    const sibling = makeV21Field({
      id: 'f0-0-sibling',
      textFeatures: {
        label: '来源表', placeholder: '', name: '', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
    });
    expect(gen(blocked)).toBe('');
    expect(gen(sibling)).toContain('我是来源表测试数据');
  });

  it('诊断原因文案锁定为「pattern 无法满足，未生成值」', () => {
    expect(FALLBACK_PATTERN_FAIL_REASON).toBe('pattern 无法满足，未生成值');
  });

  it('number 字段产出 min/max/step 范围内整数（不塞中文）', () => {
    const field = makeV21Field({
      id: 'f0-0-number',
      inputType: 'number',
      constraints: {
        required: false, readOnly: false, disabled: false, hidden: false,
        min: '1', max: '9', step: '2',
      },
    });
    const value = gen(field);
    expect(value).toMatch(/^\d+$/);
    const n = Number(value);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(9);
    expect((n - 1) % 2).toBe(0);
  });

  it('date / time / email / select 产出格式合法值且非空', () => {
    const date = makeV21Field({
      id: 'f0-0-date', inputType: 'date',
      constraints: {
        required: false, readOnly: false, disabled: false, hidden: false,
        min: '2026-01-01', max: '2026-12-31',
      },
    });
    const dateValue = gen(date);
    expect(dateValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateValue >= '2026-01-01' && dateValue <= '2026-12-31').toBe(true);

    const time = makeV21Field({ id: 'f0-0-time', inputType: 'time' });
    expect(gen(time)).toMatch(/^\d{2}:\d{2}$/);

    const email = makeV21Field({ id: 'f0-0-email', inputType: 'email' });
    expect(gen(email)).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

    const select = makeV21Field({
      id: 'f0-0-select', tagName: 'SELECT', controlType: 'select',
      enumOptions: ['甲档', '乙档', '丙档'],
    });
    expect(['甲档', '乙档', '丙档']).toContain(gen(select));
  });

  it('checkbox / radio 仍产出非空兜底值（合法选中态由执行层写入）', () => {
    const checkbox = makeV21Field({ id: 'f0-0-checkbox', inputType: 'checkbox' });
    const radio = makeV21Field({ id: 'f0-0-radio', inputType: 'radio' });
    expect(gen(checkbox).length).toBeGreaterThan(0);
    expect(gen(radio).length).toBeGreaterThan(0);
  });
});

describe('AC-V2-15 / 4.3 硬保护与未知字段边界', () => {
  it('所有硬保护 skipReason 一律不进入兜底生成', () => {
    const hard = [
      'readonly', 'disabled', 'hidden', 'file', 'captcha', 'outside-form',
      'search-or-filter', 'has-value', 'user-unchecked', 'rule-excluded',
      'unsupported-control', 'field-limit-exceeded',
    ] as const;
    for (const reason of hard) {
      const field = makeV21Field({ id: 'f0-0-' + reason, skipReason: reason });
      expect(gen(field)).toBe('');
    }
    expect(LOCKED_SKIP_REASONS).toContain('unsupported-control');
  });

  it('low-confidence 不再是跳过理由：该标记下仍生成兜底值', () => {
    const field = makeV21Field({
      id: 'f0-0-lowconf', skipReason: 'low-confidence',
      textFeatures: {
        label: '来源表', placeholder: '', name: '', elementId: '',
        ariaLabel: '', nearbyText: '',
      },
    });
    expect(gen(field)).toContain('我是来源表测试数据');
  });

  it('已识别字段（inferredType !== unknown）不进入兜底生成', () => {
    const field = makeV21Field({ id: 'f0-0-known', inferredType: 'personName' });
    expect(gen(field)).toBe('');
  });
});
