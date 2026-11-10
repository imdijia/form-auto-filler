// @vitest-environment jsdom
/**
 * AC-V2-03 契约级单测：可见性过滤与容器子树扫描。
 *
 * 从需求反推，只断言可观测行为：
 *  - 不可见控件不得进入可填集合；
 *  - 扫描作用域必须是「选定容器的子树」，容器外控件不得出现；
 *  - 只读 / 禁用 / 文件上传 / 密码 / 验证码 / 搜索类控件必须带跳过原因。
 *
 * 这些断言绑定公开的 detection 契约（isVisuallyHidden / exclusionReason / scan），
 * 不读取任何私有实现细节；重构实现只要行为不变就不会误伤。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { isVisuallyHidden, readControlShape } from '../../src/detection/control-type';
import { readConstraints, readTextFeatures, readHasValue } from '../../src/detection/text-features';
import { readContainer } from '../../src/detection/container';
import { exclusionReason, isNonControlInput } from '../../src/detection/field-descriptor';
import { scan } from '../../src/detection/scan';
import type { DetectionContext } from '../../src/contracts/field';

function reasonFor(el: HTMLElement): string | undefined {
  const shape = readControlShape(el);
  const features = readTextFeatures(el, document);
  const constraints = readConstraints(el, shape, document);
  const container = readContainer(el, features.label || features.placeholder || features.name);
  const hasValue = readHasValue(el, shape);
  return exclusionReason(el, shape, features, constraints, container, hasValue, document);
}

function contextFor(root: ParentNode): DetectionContext {
  return {
    root,
    scope: 'dialog',
    rules: {} as unknown as DetectionContext['rules'],
    logger: { debug() {}, warn() {} },
  } as DetectionContext;
}

describe('AC-V2-03 可见性过滤（黑盒契约）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('正常可见 input 不被判为隐藏，且无排除原因', () => {
    document.body.innerHTML = '<form id="f"><input id="normal"></form>';
    const el = document.getElementById('normal') as HTMLElement;
    expect(isVisuallyHidden(el, document)).toBe(false);
    expect(reasonFor(el)).toBeUndefined();
  });

  it.each([
    ['hidden 属性', '<input id="t" hidden>'],
    ['display:none', '<input id="t" style="display:none">'],
    ['visibility:hidden', '<input id="t" style="visibility:hidden">'],
    ['opacity:0', '<input id="t" style="opacity:0">'],
    ['祖先 hidden', '<div hidden><input id="t"></div>'],
  ])('%s 的控件被判为隐藏 / 带 hidden 跳过原因', (_label, html) => {
    document.body.innerHTML = '<form id="f">' + html + '</form>';
    const el = document.getElementById('t') as HTMLElement;
    expect(isVisuallyHidden(el, document)).toBe(true);
    expect(reasonFor(el)).toBe('hidden');
  });

  // 需求只要求「计入跳过」，不锁定具体原因码命名；允许 v2 引入新码，
  // 但绝不允许返回 undefined（静默填值 / 静默丢弃都是缺陷）。
  it.each([
    ['disabled', '<input id="t" disabled>', ['disabled']],
    ['readonly', '<input id="t" readonly>', ['readonly']],
    ['type=file', '<input id="t" type="file">', ['file']],
    ['type=password', '<input id="t" type="password">', ['captcha', 'password']],
    ['验证码文案', '<input id="t" aria-label="图形验证码">', ['captcha']],
    ['type=search', '<input id="t" type="search">', ['search-or-filter', 'search', 'filter']],
  ])('%s 的控件带对应跳过原因', (_label, html, allowed) => {
    document.body.innerHTML = '<form id="f">' + html + '</form>';
    const el = document.getElementById('t') as HTMLElement;
    expect(allowed).toContain(reasonFor(el));
  });

  it.each(['hidden', 'submit', 'button', 'reset', 'image'])(
    'type=%s 不属于输入控件（扫描阶段即被排除）',
    (type) => {
      const el = document.createElement('input');
      el.type = type;
      expect(isNonControlInput(readControlShape(el))).toBe(true);
    },
  );

  it('text / textarea / select 属于输入控件', () => {
    const input = document.createElement('input');
    input.type = 'text';
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    for (const el of [input, textarea, select]) {
      expect(isNonControlInput(readControlShape(el))).toBe(false);
    }
  });

  it('子树扫描只返回选定容器内的控件，容器外搜索框不进入结果（判别器）', () => {
    document.body.innerHTML = `
      <div class="search-bar"><input id="outside-search" type="search"><input id="outside-text"></div>
      <div role="dialog" id="dlg">
        <section><input id="in-a"><textarea id="in-b"></textarea></section>
        <section><select id="in-c"><option value="x">x</option></select></section>
      </div>`;
    const dlg = document.getElementById('dlg') as HTMLElement;
    const handles = scan(contextFor(dlg)).handles;
    const ids = handles.map((h) => h.element.id);
    expect(ids).toEqual(expect.arrayContaining(['in-a', 'in-b', 'in-c']));
    expect(ids).not.toContain('outside-search');
    expect(ids).not.toContain('outside-text');
  });

  it('子树扫描中不可见 / 禁用 / 只读控件均带 skipReason（不进入可填集合）', () => {
    document.body.innerHTML = `
      <div role="dialog" id="dlg">
        <input id="ok">
        <input id="hid" hidden>
        <input id="disp" style="display:none">
        <input id="dis" disabled>
        <input id="ro" readonly>
      </div>`;
    const dlg = document.getElementById('dlg') as HTMLElement;
    const byId = new Map(scan(contextFor(dlg)).handles.map((h) => [h.element.id, h.descriptor]));
    expect(byId.get('ok')?.skipReason).toBeUndefined();
    for (const id of ['hid', 'disp', 'dis', 'ro']) {
      expect(byId.get(id)?.skipReason, id + ' 必须有跳过原因').toBeTruthy();
    }
  });
});
