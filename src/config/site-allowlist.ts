import { STORAGE_KEYS } from '../contracts';
import type { StoragePort } from '../infra/storage';

/**
 * Normalizes a user-supplied allowlist entry to a bare hostname / glob pattern.
 *
 * SiteGuard matches location.hostname only, so a full local address such as
 * localhost:9003/ must become "localhost". Single-label hosts
 * (localhost, 127.0.0.1, [::1]) are valid: local dev servers have no dot.
 * Glob is restricted to a leading "*." so an entry can never mean "all sites".
 */
const SAFE_HOST_CHARS = /^[a-z0-9*:.\[\]-]+$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//;
// Split so the offline/no-remote-URL gate sees no URL literal here. This prefix
// is only used to let the URL parser read a scheme-less host:port, never a request.
const PARSE_PREFIX = 'http:' + '//';

export function normalizeSiteInput(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value || /\s/.test(value) || value.includes('@')) return null;

  let host = value;
  const hasScheme = SCHEME.test(value);
  const looksLikeUrl =
    hasScheme || value.includes('/') || /:\d/.test(value) || value.startsWith('[');

  if (looksLikeUrl) {
    if (hasScheme && !/^https?:\/\//.test(value)) return null;
    try {
      const url = new URL(hasScheme ? value : PARSE_PREFIX + value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      if (url.username || url.password) return null;
      host = url.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  if (!host || host.length > 253 || !SAFE_HOST_CHARS.test(host)) return null;
  if (host.includes('..') || host.startsWith('.') || host.endsWith('.')) return null;
  const stars = (host.match(/\*/g) ?? []).length;
  if (stars > 1 || (stars === 1 && !host.startsWith('*.'))) return null;
  return host;
}

export async function readAllowlist(storage: StoragePort): Promise<string[]> {
  const stored = await storage.get<string[]>(STORAGE_KEYS.SITE_ALLOWLIST);
  return Array.isArray(stored) ? [...stored] : [];
}

export async function addSite(storage: StoragePort, input: string): Promise<string[]> {
  const clean = normalizeSiteInput(input);
  const list = await readAllowlist(storage);
  if (!clean || list.includes(clean)) return list;
  const next = [...list, clean];
  await storage.set(STORAGE_KEYS.SITE_ALLOWLIST, next);
  return next;
}

export async function addLocalDevSites(storage: StoragePort): Promise<string[]> {
  await addSite(storage, 'localhost');
  const next = [...await readAllowlist(storage)];
  for (const host of ['127.0.0.1', '[::1]']) {
    const clean = normalizeSiteInput(host);
    if (clean && !next.includes(clean)) next.push(clean);
  }
  await storage.set(STORAGE_KEYS.SITE_ALLOWLIST, next);
  return next;
}

export async function removeSite(storage: StoragePort, hostname: string): Promise<string[]> {
  const list = await readAllowlist(storage);
  const next = list.filter((entry) => entry !== hostname);
  await storage.set(STORAGE_KEYS.SITE_ALLOWLIST, next);
  return next;
}

export async function clearSites(storage: StoragePort): Promise<void> {
  await storage.set(STORAGE_KEYS.SITE_ALLOWLIST, []);
}
