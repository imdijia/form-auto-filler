import { createApp, type App as VueApp, type Component } from 'vue';
import tokensCss from '../styles/tokens.css?inline';
import injectedCss from './styles/injected.css?inline';

export interface ShadowUi {
  readonly host: HTMLElement;
  readonly app: VueApp<Element>;
  unmount(): void;
}

export const SHADOW_HOST_ID = 'faf-shadow-root';

/** esbuild's CSS minifier rounds 2.1e9 z-index tokens to 7 significant digits
    (2147483000 -> 2147480000). Layer order is a hard ARCH 16.1 requirement, so
    the exact values are re-declared here after the minified stylesheet. */
const Z_LAYERS = ':host{--z-inject:2147483000;--z-highlight:2147483645;' +
  '--z-toolbar:2147483646;--z-panel:2147483647}';

/** Outer-document author rules (a page-wide `div {}`) outrank :host rules.
    Inline !important is the only reliable way to pin the host box model. The
    last four override UA :popover-open defaults (fit-content, CanvasText,
    overflow:auto), which would otherwise clip the injected UI. */
const HOST_STYLE: Readonly<Record<string, string>> = {
  position: 'fixed',
  inset: '0',
  width: '100%',
  height: '100%',
  'z-index': '2147483647',
  'pointer-events': 'none',
  border: '0',
  padding: '0',
  margin: '0',
  background: 'transparent',
  color: 'inherit',
  overflow: 'visible',
};

type PopoverHost = HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

/** Engines without showModal() (jsdom / older WebViews) silently return zero
    matches for dialog:modal instead of throwing. Only in those engines do we
    fall back to dialog[open]; in a real browser a .show() dialog is NOT modal
    and must never be treated as one. */
const MODAL_SELECTOR_USABLE = ((): boolean => {
  try {
    const probe = document.createElement('dialog') as HTMLElement & { showModal?: () => void };
    return typeof probe.showModal === 'function';
  } catch { return false; }
})();

/** Custom Shadow DOM mount. No global style injection, no external fonts,
    fixed extension theme. All CSS is inlined into the shadow root. */
export function mountShadowUi(
  rootComponent: Component,
  props?: Record<string, unknown>,
): ShadowUi {
  const existing = document.getElementById(SHADOW_HOST_ID);
  if (existing) existing.remove();

  const host = document.createElement('div');
  host.id = SHADOW_HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const mount = document.createElement('div');
  mount.className = 'f-root';
  shadow.appendChild(mount);

  // The style element is appended AFTER the UI container on purpose: a single
  // stylesheet still applies to the whole shadow tree regardless of position,
  // but shadowRoot.textContent then starts with the real UI text instead of
  // ~16 KB of CSS. Observability probes (QA E2E) read that textContent.
  // Z_LAYERS stays last INSIDE the stylesheet so it still overrides the
  // minified z-index tokens, exactly as before.
  const style = document.createElement('style');
  style.textContent = tokensCss + '\n' + injectedCss + '\n' + Z_LAYERS;
  shadow.appendChild(style);

  for (const [key, value] of Object.entries(HOST_STYLE)) {
    host.style.setProperty(key, value, 'important');
  }
  document.documentElement.appendChild(host);

  const popHost = host as PopoverHost;
  let popoverOpen = false;

  const isPopoverOpen = (): boolean => {
    try { return host.matches(':popover-open'); } catch { return popoverOpen; }
  };

  /** Best-effort top-layer promotion. Any failure degrades to pure z-index
      and must never hide or break injection / filling. */
  const ensurePopover = (): void => {
    if (typeof popHost.showPopover !== 'function') return;
    try {
      if (!host.hasAttribute('popover')) host.setAttribute('popover', 'manual');
      if (!isPopoverOpen()) popHost.showPopover();
      popoverOpen = true;
    } catch {
      // showPopover() throws InvalidStateError when already open. Only drop the
      // attribute when it truly is not showing: the UA rule
      // [popover]:not(:popover-open) { display:none } would hide the UI.
      const open = isPopoverOpen();
      popoverOpen = open;
      if (!open) {
        try { host.removeAttribute('popover'); } catch { /* already detached */ }
      }
    }
  };
  ensurePopover();

  /** toggle / beforetoggle arrive in open order, so "last opened" is exact
      even when two modal dialogs are stacked out of DOM order. */
  const openOrder: HTMLElement[] = [];
  const trackDialog = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.tagName !== 'DIALOG') return;
    const index = openOrder.indexOf(target);
    if (index >= 0) openOrder.splice(index, 1);
    const state = (event as Event & { newState?: string }).newState;
    if (state === 'open' || (state !== 'closed' && target.hasAttribute('open'))) {
      openOrder.push(target);
    }
  };

  const activeModal = (): HTMLElement | null => {
    let modals: HTMLElement[] = [];
    try {
      modals = MODAL_SELECTOR_USABLE
        ? Array.from(document.querySelectorAll<HTMLElement>('dialog:modal'))
        : Array.from(document.querySelectorAll<HTMLElement>('dialog[open]'));
    } catch {
      modals = Array.from(document.querySelectorAll<HTMLElement>('dialog[open]'));
    }
    if (modals.length === 0) return null;
    for (let i = openOrder.length - 1; i >= 0; i -= 1) {
      const candidate = openOrder[i];
      if (candidate && candidate.isConnected && modals.includes(candidate)) return candidate;
    }
    return modals[modals.length - 1] ?? null;
  };

  /** AC-V2-22 / S3: NO normal-layer z-index can cover <dialog>.showModal().
      Move the host INTO the active modal instead, keeping the open popover
      state (never hidePopover). Hit tests then see [fab, pageDlg, HTML] while
      the dialog's own inputs stay interactive - S6 (our own modal) would
      inert the page and is deliberately not used. */
  const syncPlacement = (): void => {
    try {
      const modal = activeModal();
      const target = modal ?? document.documentElement;
      // Re-parenting is the ONLY thing that can invalidate the open popover.
      // Already in place + already open => no work, so our own append cannot
      // start an observer loop or call showPopover() twice.
      const moved = host.parentNode !== target;
      if (moved) target.appendChild(host);
      if (moved || !popoverOpen) ensurePopover();
    } catch {
      // Layering bookkeeping must never break injection or filling.
    }
  };

  let observer: MutationObserver | null = new MutationObserver(() => syncPlacement());
  observer.observe(document, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['open'],
  });
  document.addEventListener('toggle', trackDialog, true);
  document.addEventListener('beforetoggle', trackDialog, true);
  syncPlacement();

  const app = createApp(rootComponent, props);
  app.mount(mount);
  return {
    host,
    app,
    unmount(): void {
      observer?.disconnect();
      observer = null;
      document.removeEventListener('toggle', trackDialog, true);
      document.removeEventListener('beforetoggle', trackDialog, true);
      openOrder.length = 0;
      if (popoverOpen) {
        try { popHost.hidePopover?.(); } catch { /* already hidden */ }
        popoverOpen = false;
      }
      app.unmount();
      host.remove();
    },
  };
}
