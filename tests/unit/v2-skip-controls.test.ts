// @vitest-environment jsdom
/**
 * AC-V2-03 / AC-V2-12 契约级单测：跳过类控件、容器外控件、空状态。
 *
 * 判别器：
 *  - 容器外普通文本框一旦进入可填集合即失败（若实现兜底 body 或只找最近 form 会变红）。
 *  - 容器子树内可见可填控件数为 0 时，扫描结果必须全部带 skipReason，不得报错。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readControlShape } from '../../src/detection/control-type';
import { scan } from '../../src/detection/scan';
import type { DetectionContext } from '../../src/contracts/field';
import { findContainerContract } from './v2-contract-surface';

const contract = findContainerContract();

function contextFor(root: ParentNode): DetectionContext {
  return {
    root,
    scope: 'dialog',
    rules: {} as unknown as DetectionContext['rules'],
    logger: { debug() {}, warn() {} },
  } as DetectionContext;
}

describe('AC-V2-03 跳过类控件与作用域隔离（黑盒契约）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('判别器：容器外普通文本框不进入可填集合，容器子树内控件全部纳入', () => {
    document.body.innerHTML = `
      <div class="search-bar">
        <input id="global-search" type="search">
        <input id="outside-text" value="OUTSIDE-SENTINEL">
      </div>
      <div id="common-ancestor">
        <section id="group-a"><input id="a1"><input id="a2"></section>
        <section id="group-b"><input id="b1"><textarea id="b2"></textarea></section>
      </div>`;
    expect(contract.found, contract.detail).toBe(true);
    const resolution = contract.resolve(document);
    const root = resolution?.element ?? document.body;
    const ids = scan(contextFor(root)).handles.map((h) => h.element.id);
    expect(ids).toEqual(expect.arrayContaining(['a1', 'a2', 'b1', 'b2']));
    expect(ids).not.toContain('outside-text');
    expect(ids).not.toContain('global-search');
  });

  it('跳过类控件逐类带 skipReason（hidden / display / visibility / disabled / readonly / file / password / captcha）', () => {
    document.body.innerHTML = `
      <div role="dialog" id="dlg">
        <input id="ok">
        <input id="skip-hidden-attr" hidden value="SENTINEL">
        <input id="skip-display-none" style="display:none" value="SENTINEL">
        <input id="skip-visibility" style="visibility:hidden" value="SENTINEL">
        <input id="skip-disabled" disabled value="SENTINEL">
        <input id="skip-readonly" readonly value="SENTINEL">
        <input id="skip-file" type="file">
        <input id="skip-password" type="password" value="SENTINEL">
        <input id="skip-captcha" aria-label="验证码" value="SENTINEL">
        <input id="skip-hidden-type" type="hidden" value="SENTINEL">
      </div>`;
    const dlg = document.getElementById('dlg') as HTMLElement;
    const handles = scan(contextFor(dlg)).handles;
    const byId = new Map(handles.map((h) => [h.element.id, h.descriptor]));
    expect(byId.get('ok')?.skipReason).toBeUndefined();
    for (const id of [
      'skip-hidden-attr', 'skip-display-none', 'skip-visibility', 'skip-disabled',
      'skip-readonly', 'skip-file', 'skip-password', 'skip-captcha',
    ]) {
      expect(byId.get(id)?.skipReason, id + ' 必须有跳过原因').toBeTruthy();
    }
    // type=hidden 属于非输入控件，扫描阶段直接排除，不进入结果集。
    expect(byId.has('skip-hidden-type')).toBe(false);
  });

  it('AC-V2-12：容器子树内可填控件数为 0 时扫描结果全带跳过原因，且无异常', () => {
    document.body.innerHTML = `
      <div role="dialog" id="empty-dialog">
        <p>仅展示信息</p>
        <input id="e-readonly" readonly value="SENTINEL">
        <input id="e-disabled" disabled value="SENTINEL">
        <input id="e-hidden" hidden value="SENTINEL">
        <input id="e-display" style="display:none" value="SENTINEL">
        <input id="e-password" type="password" value="SENTINEL">
        <input id="e-hidden-type" type="hidden" value="SENTINEL">
      </div>`;
    const dlg = document.getElementById('empty-dialog') as HTMLElement;
    let handles: ReturnType<typeof scan>['handles'] | null = null;
    expect(() => { handles = scan(contextFor(dlg)).handles; }).not.toThrow();
    expect(handles).not.toBeNull();
    const fillable = (handles ?? []).filter((h) => !h.descriptor.skipReason);
    expect(fillable.map((h) => h.element.id)).toEqual([]);
  });

  it('Ant Design Vue / Element Plus 的 select 与 date-picker DOM 形状被识别为组件库控件', () => {
    document.body.innerHTML = `
      <div class="ant-select" id="ant-select-root">
        <div class="ant-select-selector"><input id="f-ant-select" class="ant-select-selection-search-input"></div>
      </div>
      <div class="el-select" id="el-select-root">
        <div class="el-select__wrapper"><input id="f-el-select"></div>
      </div>
      <div class="ant-picker" id="ant-picker-root"><input id="f-ant-date"></div>
      <div class="el-date-editor" id="el-date-root"><input id="f-el-date"></div>`;
    const shapeOf = (id: string) => readControlShape(document.getElementById(id) as HTMLElement);
    expect(shapeOf('f-ant-select').library).toBe('ant-design-vue');
    expect(shapeOf('f-ant-select').controlType).toBe('select');
    expect(shapeOf('f-el-select').library).toBe('element-plus');
    expect(shapeOf('f-el-select').controlType).toBe('select');
    expect(shapeOf('f-ant-date').library).toBe('ant-design-vue');
    expect(shapeOf('f-ant-date').controlType).toBe('date');
    expect(shapeOf('f-el-date').library).toBe('element-plus');
    expect(shapeOf('f-el-date').controlType).toBe('date');
  });
});
