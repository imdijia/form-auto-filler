import type { Result, SiteGuard } from '../contracts';
import { matchGlob } from '../utils/glob';
import { err, ok } from '../utils/result';

/**
 * Two independent layers (ARCH 15.2): activeTab decides whether injection is
 * possible; this guard decides whether filling is allowed afterwards.
 *
 * The allowlist is the ONLY authorizer. An environment marker is a validator
 * for a subdomain of an allowlisted parent domain, never a wildcard that lets
 * an unrelated host containing the substring "test" through (AC-6).
 * The locked contract is synchronous, so the allowlist is refreshed before
 * each scan by the content runtime.
 */
const ENV_MARKERS = ['test', 'uat', 'staging', 'sandbox', 'dev', 'local', 'localhost'] as const;

function labelsOf(hostname: string): string[] {
  return hostname.toLowerCase().split('.').filter((part) => part.length > 0);
}

function isEnvironmentLabel(label: string): boolean {
  const parts = label.split(/[-_]/);
  return ENV_MARKERS.some((marker) => parts.includes(marker));
}

/** Informational: a marker must occupy a whole hostname label (or a
    hyphen/underscore separated part of one), never a raw substring. */
export function hasEnvironmentMarker(hostname: string): boolean {
  const labels = labelsOf(hostname);
  return labels.slice(0, -1).some(isEnvironmentLabel);
}

/** A marker may extend an explicitly trusted PARENT domain to its test-like
    subdomain. It never authorizes a host whose parent is untrusted. */
function markerExtendsAllowlist(
  labels: readonly string[],
  allowlist: readonly string[],
): boolean {
  if (labels.length < 3 || !isEnvironmentLabel(labels[0] ?? '')) return false;
  const parent = labels.slice(1).join('.');
  return allowlist.some(
    (entry) => entry.toLowerCase() === parent || matchGlob(parent, entry.toLowerCase()),
  );
}

export interface SiteGuardEx extends SiteGuard {
  setAllowlist(entries: readonly string[]): void;
}

export function createSiteGuard(): SiteGuardEx {
  let allowlist: readonly string[] = [];
  return {
    setAllowlist(entries: readonly string[]): void {
      allowlist = entries.map((entry) => entry.toLowerCase());
    },
    assertAllowed(hostname: string, _url: string): Result<void> {
      const host = hostname.toLowerCase();
      if (!host) {
        return err('E_SITE_NOT_ALLOWED', '无法确认当前页面域名，未执行任何填充');
      }
      const labels = labelsOf(host);
      const explicitlyAllowed = allowlist.some(
        (entry) => entry === host || matchGlob(host, entry),
      );
      const allowed = explicitlyAllowed || markerExtendsAllowlist(labels, allowlist);
      if (!allowed) {
        return err('E_SITE_NOT_ALLOWED', '当前页面不在测试站点白名单内，未执行任何填充');
      }
      return ok(undefined);
    },
  };
}
