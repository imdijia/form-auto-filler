// @vitest-environment jsdom
/**
 * 持久回归用例：DEF-01 —— 可见但子树内「可填控件数为 0」的 dialog 必须仍是填充边界。
 *
 * Discovered: 2026-11-09（QA-V2 阶段二 S5-empty / docs/QA-V2-REPORT.md DEF-01）
 * Root cause: src/detection/scope-selector.ts 旧 rank() 用 .filter(entry => entry.count > 0)
 *             把可见空 dialog 直接丢弃，Tier 3 随后从全页控件聚合，把容器外
 *             global-filter（筛选项）与 outside-text 纳入填充范围。
 * Fixed by:   rank(..., allowEmpty=true) 且 Tier 1/2 前置到 all 计算之前；
 *             Tier 3 保持默认 allowEmpty=false，LCA 行为逐字不变。
 *
 * 判别器（修复前必然红、修复后必然绿）：
 *   修复前 autoSelectRoot(document) 返回 .search-bar（含 3 个容器外控件），
 *   本文件「必须选中 #empty-dialog」与「容器外控件不在边界内」两条断言必然失败。
 *
 * 本文件只新建，不修改 tests/unit/ 下任何既有用例断言。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { autoSelectRoot, visibleControlsIn } from '../../src/detection/scope-selector';

function emptyDialogMarkup(): string {
  return `
    <div class="search-bar" id="outside-search">
      <input id="global-search" type="search" placeholder="搜索关键字">
      <select id="global-filter"><option value="">全部</option><option value="draft">草稿</option></select>
      <input id="outside-text" type="text" value="OUTSIDE-SENTINEL">
    </div>
    <div role="dialog" id="empty-dialog" class="ant-modal" aria-label="只读详情">
      <div class="ant-modal-title">只读详情（无可填控件）</div>
      <div class="ant-modal-body">
        <p>本弹窗仅展示信息，不包含任何可填写的可见输入控件。</p>
        <input id="e-readonly" type="text" readonly value="SENTINEL-E-READONLY">
        <input id="e-disabled" type="text" disabled value="SENTINEL-E-DISABLED">
        <input id="e-hidden" type="text" hidden value="SENTINEL-E-HIDDEN">
        <input id="e-display-none" type="text" style="display:none" value="SENTINEL-E-DISPLAY">
        <input id="e-password" type="password" value="SENTINEL-E-PASSWORD">
      </div>
    </div>`;
}

describe('Regression DEF-01：可见空 dialog 不得误填容器外控件', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('判别前提：容器外确实存在可见控件（旧 Tier 3 会聚合它们）', () => {
    document.body.innerHTML = emptyDialogMarkup();
    const ids = visibleControlsIn(document, document).map((el) => el.id);
    expect(ids).toContain('global-filter');
    expect(ids).toContain('outside-text');
  });

  it('判别器：autoSelectRoot 必须选中可见空 dialog，而非容器外搜索栏或 body', () => {
    document.body.innerHTML = emptyDialogMarkup();
    const dialog = document.getElementById('empty-dialog') as HTMLElement;
    expect(autoSelectRoot(document)).toBe(dialog);
  });

  it('AC-V2-12 判据：dialog 子树内可填控件数为 0', () => {
    document.body.innerHTML = emptyDialogMarkup();
    const dialog = document.getElementById('empty-dialog') as HTMLElement;
    expect(visibleControlsIn(dialog, document)).toEqual([]);
  });

  it('判别器：容器外搜索框 / 筛选项 / 普通文本框不在选定边界内', () => {
    document.body.innerHTML = emptyDialogMarkup();
    const chosen = autoSelectRoot(document) as HTMLElement;
    for (const id of ['global-search', 'global-filter', 'outside-text']) {
      const el = document.getElementById(id);
      expect(el).not.toBeNull();
      expect(chosen.contains(el)).toBe(false);
    }
  });

  it('回归护栏：隐藏 dialog 不参与边界（修复不得过度）', () => {
    document.body.innerHTML = `
      <div class="search-bar"><input id="outside-text" value="SENTINEL"></div>
      <div role="dialog" id="hidden-dialog" style="display:none">
        <input id="h1"><input id="h2">
      </div>
      <form id="visible-form"><input id="v1"><input id="v2"></form>`;
    expect(autoSelectRoot(document)).toBe(document.getElementById('visible-form'));
  });

  it('回归护栏：dialog 内有可填控件时仍选 dialog，容器外控件不在边界内', () => {
    document.body.innerHTML = `
      <div class="search-bar"><input id="outside-text" value="SENTINEL"></div>
      <div role="dialog" id="normal-dialog"><input id="d1"><input id="d2"></div>`;
    const chosen = autoSelectRoot(document) as HTMLElement;
    expect(chosen.id).toBe('normal-dialog');
    expect(chosen.contains(document.getElementById('outside-text'))).toBe(false);
  });

  it('回归护栏：无 dialog 时可见空 form 仍是边界，容器外控件不纳入', () => {
    document.body.innerHTML = `
      <div class="search-bar"><input id="outside-text" value="SENTINEL"></div>
      <form id="empty-form"><input id="f-readonly" readonly value="SENTINEL"></form>`;
    const chosen = autoSelectRoot(document) as HTMLElement;
    expect(chosen.id).toBe('empty-form');
    expect(chosen.contains(document.getElementById('outside-text'))).toBe(false);
  });

  it('回归护栏：无任何 dialog / form 时 Tier 3 LCA 行为不变', () => {
    document.body.innerHTML = `
      <div class="search-bar"><input id="outside-free-text" value="SENTINEL"></div>
      <div id="common-ancestor">
        <section id="group-a"><input id="x1"><input id="x2"><input id="x3"></section>
        <section id="group-b"><input id="x4"><input id="x5"><textarea id="x6"></textarea></section>
      </div>`;
    const chosen = autoSelectRoot(document) as HTMLElement;
    expect(chosen.id).toBe('common-ancestor');
    expect(chosen.contains(document.getElementById('outside-free-text'))).toBe(false);
  });
});
