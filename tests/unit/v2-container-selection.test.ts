// @vitest-environment jsdom
/**
 * AC-V2-02 / AC-V2-12 契约级单测：容器自动选择四级优先级。
 *
 * 判别器说明（修复前必然失败、修复后必然通过）：
 *  - v1 只有 readContainer(element)「最近 form」，没有整体容器自动选择导出；
 *    契约存在性断言与 Tier 1 / Tier 3 断言在 v1 代码上必然变红。
 *  - 夹具刻意让 dialog 挂 body、字段分散在多个非 form 容器，并放一个只有 1 个控件的诱饵 form：
 *    「只找最近 form」的实现只能命中诱饵 form，覆盖不了 dialog 子树。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { findContainerContract } from './v2-contract-surface';

const contract = findContainerContract();

function requireContract(): void {
  expect(contract.found, contract.detail).toBe(true);
}

function selected(doc: Document = document): HTMLElement {
  requireContract();
  const result = contract.resolve(doc);
  if (!result || !result.element) {
    throw new Error('容器自动选择未返回可判定元素。' + contract.detail);
  }
  return result.element;
}

describe('AC-V2-02 容器自动选择四级优先级（黑盒契约）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('契约存在：前端须导出容器自动选择函数（修复前必然失败）', () => {
    requireContract();
    expect(contract.exportName).toBeTruthy();
  });

  it('Tier 1：可见 dialog 优先，即使页面存在可见控件更多的 form', () => {
    document.body.innerHTML = `
      <form id="big-form">
        <input id="a1"><input id="a2"><input id="a3">
        <input id="a4"><input id="a5"><input id="a6">
      </form>
      <div role="dialog" id="dlg">
        <section id="s1"><input id="d1"></section>
        <section id="s2"><input id="d2"></section>
      </div>`;
    expect(selected().id).toBe('dlg');
  });

  it('Tier 1 判别器：dialog 挂 body、字段跨多个非 form 容器、含诱饵 form 时仍选整个 dialog', () => {
    document.body.innerHTML = `
      <div class="search-bar"><input id="outside-search" type="search"><input id="outside-text"></div>
      <div role="dialog" id="main-dialog" class="ant-modal" aria-label="人员信息登记">
        <section id="section-basic">
          <input id="f-name"><input id="f-phone"><input id="f-idcard">
          <textarea id="f-note"></textarea><div id="f-rich" contenteditable="true"></div>
        </section>
        <section id="section-extra">
          <input id="f-email"><input id="f-org">
          <select id="f-gender"><option value="男">男</option><option value="女">女</option></select>
        </section>
        <form id="decoy-form"><input id="f-decoy"></form>
      </div>`;
    const el = selected();
    expect(el.id).toBe('main-dialog');
    expect(el.querySelector('#section-basic')).not.toBeNull();
    expect(el.querySelector('#section-extra')).not.toBeNull();
    expect(el.querySelector('#outside-text')).toBeNull();
  });

  it('Tier 2：无 dialog 时选可见控件最多的 form（焦点在小 form 也不改判）', () => {
    document.body.innerHTML = `
      <div class="search-bar"><input id="outside-text"></div>
      <form id="form-small"><input id="s1"><input id="s2"></form>
      <form id="form-large">
        <input id="l1"><input id="l2"><input id="l3">
        <input id="l4"><input id="l5"><textarea id="l6"></textarea>
      </form>`;
    (document.getElementById('s1') as HTMLInputElement).focus();
    expect(selected().id).toBe('form-large');
  });

  it('隐藏 dialog 不参与优先级，回落到可见 form', () => {
    document.body.innerHTML = `
      <div role="dialog" id="hidden-dlg" style="display:none">
        <input id="h1"><input id="h2"><input id="h3"><input id="h4"><input id="h5">
      </div>
      <form id="visible-form"><input id="v1"><input id="v2"><input id="v3"></form>`;
    expect(selected().id).toBe('visible-form');
  });

  it('Tier 3 判别器：无 form / dialog 时取最小公共祖先，不直接兜底 body', () => {
    document.body.innerHTML = `
      <div class="search-bar"><input id="outside-free-text"></div>
      <div id="common-ancestor">
        <section id="group-a"><input id="x1"><input id="x2"><input id="x3"></section>
        <section id="group-b"><input id="x4"><input id="x5"><textarea id="x6"></textarea></section>
      </div>`;
    const el = selected();
    expect(el.id).toBe('common-ancestor');
    expect(el.querySelector('#outside-free-text')).toBeNull();
  });

  it('Tier 4：无容器、单个孤立控件时兜底 body', () => {
    document.body.innerHTML = '<p>孤立控件页</p><input id="solo-name">';
    expect(selected()).toBe(document.body);
  });

  it('AC-V2-12：dialog 子树内可填控件数为 0 时不抛异常', () => {
    document.body.innerHTML = `
      <div role="dialog" id="empty-dialog">
        <p>仅展示</p>
        <input id="e-readonly" readonly value="SENTINEL">
        <input id="e-disabled" disabled value="SENTINEL">
        <input id="e-hidden" hidden value="SENTINEL">
      </div>`;
    expect(() => contract.resolve(document)).not.toThrow();
  });
});
