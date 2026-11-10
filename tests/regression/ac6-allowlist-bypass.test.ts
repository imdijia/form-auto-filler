/**
 * Regression: QA-B01 (P0) — a hostname containing the substring "test" but
 * NOT on the allowlist was allowed to be filled (AC-6 hard gate).
 *
 * Discovered: 2026-11-09 by TC-GUARD-03 (`tests/unit/site-guard.test.ts:102`).
 * Fixed by: `src/config/site-guard.ts` — the allowlist is now the ONLY
 * authorizer; environment markers may only extend an explicitly trusted
 * PARENT domain to a test-like subdomain, and matching uses whole hostname
 * labels instead of raw substrings.
 *
 * This is a persistent project-level regression case. Do not delete, skip or
 * weaken it. Every subsequent change runs this file.
 */
import { describe, it, expect } from 'vitest';
import { createSiteGuard } from '../../src/config/site-guard';

function guard() {
  const instance = createSiteGuard();
  instance.setAllowlist(['*.test.example.com']);
  return instance;
}

describe('Regression: AC-6 白名单不得被环境标识子串绕过', () => {
  it('含 test 子串但父域不可信的域名一律 E_SITE_NOT_ALLOWED', () => {
    const hosts = [
      'test.example.com.evil.com',
      'latest.prod.com',
      'mytest.attacker.cn',
      'test.evil.com',
      'uat.notwhitelisted.com',
    ];
    for (const host of hosts) {
      const res = guard().assertAllowed(host, `https://${host}/form`);
      expect({ host, ok: res.ok, code: res.code }).toEqual({
        host,
        ok: false,
        code: 'E_SITE_NOT_ALLOWED',
      });
    }
  });

  it('白名单内 test/uat 子域仍必须放行（修复不得误伤正常路径）', () => {
    expect(guard().assertAllowed('uat.test.example.com', 'https://uat.test.example.com/form').ok).toBe(true);
  });

  it('空域名必须拒绝，不降级为尽力填', () => {
    expect(guard().assertAllowed('', 'https://uat.test.example.com/form').ok).toBe(false);
  });
});
