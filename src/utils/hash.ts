/** Pure hashing helpers. No DOM, no chrome, no I/O. */

export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function hashString(input: string): string {
  return fnv1a(input).toString(16).padStart(8, '0');
}

/** Structural similarity used by the drift monitor (ARCH 17.3). */
export function jaccard(left: readonly string[], right: readonly string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/** Keys are hashes only. Raw hostnames and URLs are never persisted. */
export function siteKey(hostname: string): string {
  return 's-' + hashString(hostname.toLowerCase());
}

/** Keys are hashes only. Query strings and fragments are dropped. */
export function pageKey(url: string): string {
  let path = '/';
  try {
    path = new URL(url).pathname || '/';
  } catch {
    path = url.split('?')[0] ?? '/';
  }
  return 'p-' + hashString(path);
}

/** A data-only URL pattern for rule documents. Numeric ids become wildcards. */
export function urlPattern(url: string): string {
  try {
    const parsed = new URL(url);
    return (parsed.pathname || '/').replace(/\/\d+(?=\/|$)/g, '/*');
  } catch {
    return '/';
  }
}
