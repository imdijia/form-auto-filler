import { pageKey, siteKey, urlPattern } from '../utils/hash';

/** Hashes only. No raw hostname / URL plaintext is ever persisted or logged. */
export interface PageContextInfo {
  readonly hostname: string;
  readonly siteKey: string;
  readonly pageKey: string;
  readonly urlPattern: string;
}

export function readPageContext(location: Location): PageContextInfo {
  const hostname = location.hostname || '';
  return {
    hostname,
    siteKey: siteKey(hostname),
    pageKey: pageKey(location.href),
    urlPattern: urlPattern(location.href),
  };
}

/** Scope root for L1. Default is the narrowest useful container, so a page
    level search box outside the form never enters the fill set (AC-6). */
export function resolveScopeRoot(
  scope: 'dialog' | 'form' | 'document',
  rowOnly: boolean,
  document: Document,
): ParentNode {
  if (scope === 'document') return document;
  const active = document.activeElement;
  if (rowOnly && active instanceof HTMLElement) {
    const row = active.closest<HTMLElement>(
      '.ant-form-item, .el-form-item, tr, [class*="form-row"], [class*="field-row"]',
    );
    return row ?? active.parentElement ?? document;
  }
  if (active instanceof HTMLElement) {
    const selector = scope === 'dialog'
      ? '[role="dialog"], .ant-modal, .el-dialog, .ant-drawer, .el-drawer, form'
      : 'form, [role="form"], .ant-form, .el-form';
    const nearest = active.closest<HTMLElement>(selector);
    if (nearest) return nearest;
  }
  const fallback = document.querySelector<HTMLElement>(
    scope === 'dialog'
      ? '[role="dialog"], .ant-modal, .el-dialog, form'
      : 'form',
  );
  return fallback ?? document;
}

export function scopeLabelOf(
  scope: 'dialog' | 'form' | 'document',
  rowOnly: boolean,
): string {
  if (rowOnly) return '当前表单行';
  if (scope === 'dialog') return '当前弹窗';
  if (scope === 'form') return '当前表单';
  return '整页';
}
