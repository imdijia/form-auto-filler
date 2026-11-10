/**
 * v2 whole-container auto selection (SPEC-v2 section C).
 *
 * Pure DOM logic: no Vue, no extension APIs, no network. It runs in the
 * ISOLATED content world where layout geometry is real. A DOM without a
 * layout engine (jsdom) reports zero geometry for every node, so the
 * visibility verdict degrades to style/attribute checks there and the
 * algorithm stays testable.
 */
import type { DetectionContext } from '../contracts';

/** v2 detection context. Extra field is read structurally by scan(); the
    locked contract file is never modified. */
export interface ContainerAwareContext extends DetectionContext {
  readonly containerAware?: boolean;
}

export const DIALOG_SELECTOR = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '.ant-modal',
  '.el-dialog',
  '[aria-modal="true"]',
  '.ant-drawer',
  '.el-drawer',
].join(', ');

const CONTROL_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const WRAPPER_SELECTOR = [
  '.ant-select', '.el-select', '.ant-picker', '.el-date-editor',
  '.ant-cascader', '.el-cascader',
].join(', ');

const BLOCKED_INPUT_TYPES = new Set([
  'file', 'password', 'submit', 'button', 'image', 'reset', 'hidden',
]);

function styleOf(element: Element, document: Document): CSSStyleDeclaration | null {
  return document.defaultView?.getComputedStyle(element) ?? null;
}

function hiddenByStyle(style: CSSStyleDeclaration | null): boolean {
  return Boolean(
    style &&
    (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0'),
  );
}

/** A visible, non-protected input control. Used for container ranking. */
export function isVisibleControl(element: HTMLElement, document: Document): boolean {
  if (element.hidden || element.closest('[hidden]')) return false;
  if (element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') return false;
  if (element.hasAttribute('readonly') || element.getAttribute('aria-readonly') === 'true') return false;
  if (typeof HTMLInputElement !== 'undefined' && element instanceof HTMLInputElement) {
    if (BLOCKED_INPUT_TYPES.has((element.type || 'text').toLowerCase())) return false;
  }
  return !hiddenByStyle(styleOf(element, document));
}

/** Native controls plus component-library wrapper nodes. */
export function visibleControlsIn(root: ParentNode, document: Document): HTMLElement[] {
  const selector = CONTROL_SELECTOR + ', ' + WRAPPER_SELECTOR;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(selector));
  if (typeof HTMLElement !== 'undefined' && root instanceof HTMLElement && root.matches(selector)) {
    nodes.unshift(root);
  }
  return nodes.filter((node) => isVisibleControl(node, document));
}

/** jsdom gives every node a zero rect and null offsetParent. */
function layoutSupported(document: Document): boolean {
  const body = document.body;
  if (!body) return false;
  return (
    body.offsetParent !== null ||
    body.offsetWidth > 0 ||
    body.getBoundingClientRect().width > 0
  );
}

/** Container must be attached, sized and not visibility:hidden. */
export function isVisibleContainer(element: HTMLElement, document: Document): boolean {
  if (element.hidden || element.closest('[hidden]')) return false;
  const style = styleOf(element, document);
  if (hiddenByStyle(style)) return false;
  if (!layoutSupported(document)) return true;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  // A position:fixed dialog legitimately has offsetParent === null.
  const position = style?.position ?? '';
  return element.offsetParent !== null || position === 'fixed' || position === 'sticky';
}

function ancestorDepth(element: Element): number {
  let depth = 0;
  for (let node: Element | null = element.parentElement; node; node = node.parentElement) {
    depth += 1;
  }
  return depth;
}

/** Tier 3 candidates: every ancestor that could own a fill run. A control
    node is never a container, and body/html are excluded so a single stray
    control (page-level search box, toolbar) cannot drag the whole selection
    up to document.body. Ranking by visible-control count then picks the
    tightest container covering the dominant cluster. */
function containerCandidates(
  controls: readonly HTMLElement[],
  document: Document,
): HTMLElement[] {
  const body = document.body;
  const html = document.documentElement;
  const controlSet = new Set<Element>(controls);
  const seen = new Set<HTMLElement>();
  for (const control of controls) {
    for (let node: Element | null = control.parentElement; node; node = node.parentElement) {
      if (node === body || node === html) break;
      if (typeof HTMLElement === 'undefined' || !(node instanceof HTMLElement)) continue;
      if (controlSet.has(node) || seen.has(node)) continue;
      seen.add(node);
    }
  }
  return Array.from(seen).filter((element) => isVisibleContainer(element, document));
}

interface Ranked {
  readonly element: HTMLElement;
  readonly order: number;
  readonly count: number;
}

/** DEF-01: Tier 1/2 pass allowEmpty=true. A VISIBLE dialog/form is the
    user's chosen DOM boundary even when its subtree currently holds zero
    fillable controls (read-only detail dialog, or fields not mounted yet).
    Filtering those out by count>0 used to fall through to a page-level
    ancestor and fill controls OUTSIDE the boundary. Tier 3 keeps the strict
    count>0 filter so the LCA behaviour is untouched. */
function rank(
  elements: readonly HTMLElement[],
  document: Document,
  allowEmpty = false,
): Ranked[] {
  return elements
    .map((element, order) => ({
      element,
      order,
      count: visibleControlsIn(element, document).length,
    }))
    .filter((entry) => allowEmpty || entry.count > 0)
    .sort((a, b) => b.count - a.count || b.order - a.order);
}

/**
 * Priority (SPEC-v2 C, DEF-01):
 *   1. any visible dialog, most fillable controls first (zero allowed)
 *   2. otherwise any visible form, most fillable controls first (zero allowed)
 *   3. otherwise the tightest common ancestor of all visible controls that
 *      has the most controls and is neither body nor html
 *   4. otherwise document.body
 * Tier 1/2 are checked BEFORE the zero-control early return: a read-only
 * dialog is still the boundary, never a licence to scan the whole page.
 */
export function autoSelectRoot(document: Document): ParentNode {
  const body = document.body;
  if (!body) return document;

  const dialogs = rank(
    Array.from(document.querySelectorAll<HTMLElement>(DIALOG_SELECTOR))
      .filter((element) => isVisibleContainer(element, document)),
    document,
    true,
  );
  if (dialogs.length > 0) return dialogs[0]!.element;

  const forms = rank(
    Array.from(document.querySelectorAll<HTMLFormElement>('form'))
      .filter((element) => isVisibleContainer(element, document)),
    document,
    true,
  );
  if (forms.length > 0) return forms[0]!.element;

  const all = visibleControlsIn(document, document);
  if (all.length === 0) return body;

  // Unchanged Tier 3: strict count>0 filter + dominant-cluster LCA.
  const candidates = rank(containerCandidates(all, document), document);
  if (candidates.length > 0) {
    const top = candidates[0]!.count;
    const tied = candidates.filter((entry) => entry.count === top);
    // On a tie prefer the smaller (deeper) container: a page-level wrapper
    // must not swallow the actual form region just because it also contains
    // every control plus the stray search box.
    const tightest = tied.reduce((winner, entry) =>
      ancestorDepth(entry.element) > ancestorDepth(winner.element) ? entry : winner,
    );
    return tightest.element;
  }
  return body;
}
