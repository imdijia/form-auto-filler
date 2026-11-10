import type { ContainerInfo } from '../contracts';
import { normalizeText } from '../utils/text';
import { autoSelectRoot } from './scope-selector';

/** v2 (SPEC-v2 C): the single whole-container root for a one-shot fill.
    Public contract thin wrapper over the four-tier selector below; the
    algorithm itself lives in scope-selector.ts and is not duplicated here.
    A Document result degrades to document.body, never to a Document node. */
export function selectAutoContainer(document: Document): HTMLElement {
  const root = autoSelectRoot(document);
  if (typeof HTMLElement !== 'undefined' && root instanceof HTMLElement) return root;
  return document.body;
}

/** Nearest form container. Search / toolbar containers are explicitly scoped
    out so a page-level search box is never silently filled (PRD AC-6). */
export const FORM_CONTAINER_SELECTOR = [
  'form',
  '[role="dialog"]',
  '[role="form"]',
  '[role="search"]',
  '.ant-modal',
  '.el-dialog',
  '.ant-drawer',
  '.el-drawer',
  '.ant-form',
  '.el-form',
  '.ant-table-toolbar',
  '.el-table__toolbar',
  '.table-toolbar',
  '.search-bar',
  '.filter-bar',
  '[data-faf-form]',
].join(', ');

const SEARCH_SELECTOR = [
  '[role="search"]',
  '.ant-table-toolbar',
  '.el-table__toolbar',
  '.table-toolbar',
  '.search-bar',
  '.filter-bar',
].join(', ');

const TITLE_SELECTOR = [
  '.ant-modal-title',
  '.el-dialog__title',
  '.ant-drawer-title',
  'legend',
  'h1',
  'h2',
  'h3',
  'h4',
  '[data-faf-title]',
].join(', ');

function containerTitle(container: HTMLElement): string {
  const explicit =
    container.getAttribute('aria-label') ??
    container.getAttribute('data-faf-title') ??
    container.getAttribute('title');
  if (explicit && explicit.trim().length > 0) return normalizeText(explicit);
  const titleNode = container.querySelector<HTMLElement>(TITLE_SELECTOR);
  return normalizeText(titleNode?.textContent ?? '') || '当前表单';
}

export function readContainer(
  element: HTMLElement,
  label: string,
  inScope = false,
): ContainerInfo {
  const nearest = element.closest<HTMLElement>(FORM_CONTAINER_SELECTOR);
  if (inScope) {
    // v2: one overall DOM container was selected. Every visible control under
    // it is in fill scope; the nearest-form heuristic must never shrink it.
    const host = nearest ?? element.parentElement ?? element;
    const dialog = host.matches(
      '[role="dialog"], [role="alertdialog"], .ant-modal, .el-dialog, .ant-drawer, .el-drawer',
    );
    return {
      kind: dialog ? 'dialog' : 'form',
      readablePath: containerTitle(host) + ' > ' + (label || '未命名控件'),
      inFormScope: true,
      isExcluded: false,
    };
  }
  if (!nearest) {
    return {
      kind: 'standalone',
      readablePath: '页面独立控件 > ' + (label || '未命名控件'),
      inFormScope: false,
      isExcluded: true,
      excludeReason: 'outside-form',
    };
  }
  if (nearest.matches(SEARCH_SELECTOR)) {
    const kind = nearest.matches('.table-toolbar, .ant-table-toolbar, .el-table__toolbar')
      ? 'table-toolbar'
      : 'search';
    return {
      kind,
      readablePath: containerTitle(nearest) + ' > ' + (label || '未命名控件'),
      inFormScope: false,
      isExcluded: true,
      excludeReason: 'search-or-filter',
    };
  }
  const kind = nearest.matches('[role="dialog"], .ant-modal, .el-dialog, .ant-drawer, .el-drawer')
    ? 'dialog'
    : 'form';
  const row = element.closest<HTMLElement>('.ant-form-item, .el-form-item, tr, [class*="form-row"]');
  let rowIndex = 0;
  if (row?.parentElement) {
    rowIndex = Array.from(row.parentElement.children).indexOf(row) + 1;
  }
  const title = containerTitle(nearest);
  const readablePath = rowIndex > 0
    ? title + ' > 第 ' + rowIndex + ' 行 > ' + (label || '未命名控件')
    : title + ' > ' + (label || '未命名控件');
  return {
    kind,
    readablePath,
    inFormScope: true,
    isExcluded: false,
    rowIndex: rowIndex > 0 ? rowIndex : undefined,
  };
}
