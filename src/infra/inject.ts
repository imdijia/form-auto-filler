import { browser } from 'wxt/browser';

/** Unlisted script produced by WXT at the extension root: entrypoints/filler.ts
    -> .output/chrome-mv3/filler.js. Injected into ISOLATED world on a user
    gesture. No static content_scripts, no host_permissions. */
export const FILLER_SCRIPT = 'filler.js';

export async function injectFiller(tabId: number): Promise<void> {
  // WXT generates ScriptPublicPath as '/filler.js'; Chrome's scripting API
  // expects a root-relative path without the leading slash. The cast bridges
  // the generated literal union with the runtime path.
  await browser.scripting.executeScript({
    target: { tabId },
    files: [FILLER_SCRIPT] as never,
  });
}

/** Cheap probe for an already-injected tab. Uses func injection, not a network
    request and not a global page object. */
export async function probeInjected(tabId: number): Promise<boolean> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => Boolean(document.getElementById('faf-shadow-root')),
    });
    return Boolean(results[0]?.result);
  } catch {
    return false;
  }
}
