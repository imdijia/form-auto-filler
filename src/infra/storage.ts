import { browser } from 'wxt/browser';

/** Storage port. Keeps chrome.* out of the pure logic layers. */
export interface StoragePort {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createBrowserStorage(): StoragePort {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const result = await browser.storage.local.get(key);
      return result[key] as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      await browser.storage.local.set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await browser.storage.local.remove(key);
    },
  };
}
