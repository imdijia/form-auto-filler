import { browser } from 'wxt/browser';
import type { RuntimeMessage } from '../contracts';
import type { ControlMessage } from './messages';

export async function sendControlToBackground(message: ControlMessage): Promise<void> {
  await browser.runtime.sendMessage(message);
}

export async function sendControlToTab(tabId: number, message: ControlMessage): Promise<void> {
  await browser.tabs.sendMessage(tabId, message);
}

export async function broadcastRuntimeEvent(event: RuntimeMessage): Promise<void> {
  try {
    await browser.runtime.sendMessage(event);
  } catch {
    // Popup may be closed. Results always live in local storage as well.
  }
}

/** Registers a passive message listener. Async work is scheduled outside the
    listener so Chrome never sees an unhandled promise from the callback. */
export function addRuntimeListener(handler: (message: unknown) => void): void {
  browser.runtime.onMessage.addListener((message: unknown) => {
    queueMicrotask(() => handler(message));
    return false;
  });
}
