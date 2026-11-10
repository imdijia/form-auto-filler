import { browser } from 'wxt/browser';
import { injectFiller, probeInjected } from '../infra/inject';
import { control, isControlMessage, isRuntimeMessage, type CommandName } from '../infra/messages';
import { sendControlToTab } from '../infra/runtime';
import { createConsoleLogger } from '../infra/logger';
import { PENDING_COMMAND_KEY, type PendingCommand } from '../infra/keys';

const logger = createConsoleLogger('background');

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function ensureInjected(tabId: number): Promise<boolean> {
  if (await probeInjected(tabId)) return true;
  try {
    await injectFiller(tabId);
    return true;
  } catch {
    return false;
  }
}

async function rememberPending(command: string): Promise<void> {
  const entry: PendingCommand = { command, issuedAt: Date.now() };
  await browser.storage.local.set({ [PENDING_COMMAND_KEY]: entry });
}

async function ensureActiveTab(): Promise<void> {
  const tabId = await activeTabId();
  if (tabId !== undefined) await ensureInjected(tabId);
}

async function dispatch(
  name: CommandName,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const tabId = await activeTabId();
  if (tabId === undefined) return;
  if (!(await ensureInjected(tabId))) {
    await rememberPending(name);
    return;
  }
  await browser.storage.local.remove(PENDING_COMMAND_KEY);
  try {
    await sendControlToTab(tabId, control(name, payload));
  } catch {
    // A restricted page or a navigation can reject the injection. The popup
    // reads the pending marker and tells the user to trigger again by gesture.
    await rememberPending(name);
  }
}

/** Validates that the four suggested keys really took effect. A conflict is
    surfaced as plain text in the popup, never silently ignored (ARCH 16.2). */
async function checkShortcuts(): Promise<void> {
  try {
    const all = await browser.commands.getAll();
    const missing = all.filter((item) => !item.shortcut || item.shortcut.length === 0);
    if (missing.length > 0) {
      logger.warn('shortcuts_not_bound', { count: missing.length });
    }
  } catch {
    logger.warn('shortcuts_query_failed');
  }
}

export function startBackgroundRuntime(): void {
  void checkShortcuts();

  browser.commands.onCommand.addListener((command) => {
    void dispatch(command as CommandName);
  });

  // When WXT generates action.default_popup from entrypoints/popup, Chrome
  // opens the popup instead of firing onClicked. The popup sends 'ping' on
  // mount, which injects the script and makes the floating ball resident.
  browser.action.onClicked.addListener((tab) => {
    if (tab.id !== undefined) void ensureInjected(tab.id).then(() => dispatch('open-plan'));
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isControlMessage(message)) {
      queueMicrotask(() => {
        if (message.name === 'open-options') {
          void browser.runtime.openOptionsPage();
        } else if (message.name === 'ping') {
          void ensureActiveTab();
        } else {
          void dispatch(message.name, { ...message.payload });
        }
      });
      return false;
    }
    if (isRuntimeMessage(message)) {
      // Chrome delivers runtime.sendMessage to every extension context except
      // the sender. The popup therefore already sees PLAN_READY / PROGRESS.
      // RESULT_READY / UNDO are relayed explicitly so a popup that opens in
      // the same tick also refreshes from faf.lastResult.v1.
      queueMicrotask(() => {
        if (message.type === 'RESULT_READY' || message.type === 'UNDO') {
          void browser.runtime.sendMessage(message).catch(() => { /* popup closed */ });
        }
      });
      return false;
    }
    return false;
  });
}
