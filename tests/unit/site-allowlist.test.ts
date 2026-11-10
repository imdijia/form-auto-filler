/**
 * Allowlist input normalization for local development (no dot in hostname).
 * AC-6 stays intact: an empty allowlist still refuses every page.
 */
import { describe, it, expect } from 'vitest';
import {
  addLocalDevSites,
  addSite,
  normalizeSiteInput,
  readAllowlist,
} from '../../src/config/site-allowlist';
import { createSiteGuard } from '../../src/config/site-guard';
import { STORAGE_KEYS } from '../../src/contracts';
import type { StoragePort } from '../../src/infra/storage';

function fakeStorage(): { port: StoragePort; read: () => unknown } {
  const store = new Map<string, unknown>();
  return {
    port: {
      async get<T>(key: string): Promise<T | undefined> {
        return store.get(key) as T | undefined;
      },
      async set<T>(key: string, value: T): Promise<void> {
        store.set(key, value);
      },
      async remove(key: string): Promise<void> {
        store.delete(key);
      },
    },
    read: () => store.get(STORAGE_KEYS.SITE_ALLOWLIST),
  };
}

describe('normalizeSiteInput：完整地址自动提取域名', () => {
  it('本地完整 URL 归一为 hostname，端口与路径丢弃', () => {
    expect(normalizeSiteInput('http://localhost:9003/')).toBe('localhost');
    expect(normalizeSiteInput('http://localhost:9003/#/form?id=1')).toBe('localhost');
    expect(normalizeSiteInput('http://127.0.0.1:9003/')).toBe('127.0.0.1');
    expect(normalizeSiteInput('https://uat.example.com:8443/form')).toBe('uat.example.com');
  });

  it('无点主机名与带端口简写可配置', () => {
    expect(normalizeSiteInput('localhost')).toBe('localhost');
    expect(normalizeSiteInput('LOCALHOST:9003')).toBe('localhost');
    expect(normalizeSiteInput('127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeSiteInput('[::1]')).toBe('[::1]');
  });

  it('通配域名保留且仅允许前导 *.', () => {
    expect(normalizeSiteInput('*.test.example.com')).toBe('*.test.example.com');
    expect(normalizeSiteInput('test.*.example.com')).toBeNull();
    expect(normalizeSiteInput('*')).toBeNull();
  });

  it('危险或含糊输入一律拒绝，不放宽为全部站点', () => {
    const invalid = [
      '', '  ', 'a b', 'javascript:alert(1)', 'file:///etc/passwd',
      'http://user:pw@example.com', 'http://localhost:9003/ x',
      '..', '.example.com', 'example.com.',
    ];
    for (const input of invalid) {
      expect(normalizeSiteInput(input), input).toBeNull();
    }
  });
});

describe('写入路径：归一化值落盘，一键添加本机地址', () => {
  it('addSite 写入的是 hostname 而不是原始 URL', async () => {
    const { port, read } = fakeStorage();
    const list = await addSite(port, 'http://localhost:9003/');
    expect(list).toEqual(['localhost']);
    expect(read()).toEqual(['localhost']);
    expect(await readAllowlist(port)).toEqual(['localhost']);
  });

  it('addLocalDevSites 一次写入三个本机地址且可重复点击不产生重复项', async () => {
    const { port } = fakeStorage();
    await addLocalDevSites(port);
    const again = await addLocalDevSites(port);
    expect(again).toEqual(['localhost', '127.0.0.1', '[::1]']);
  });

  it('非法输入不写入任何值', async () => {
    const { port, read } = fakeStorage();
    await addSite(port, '*');
    expect(read()).toBeUndefined();
  });
});

describe('AC-6 安全契约不削弱', () => {
  it('空白名单仍拒绝 localhost；加入后仅放行本机，其它域名照旧拒绝', () => {
    const guard = createSiteGuard();
    guard.setAllowlist([]);
    expect(guard.assertAllowed('localhost', 'http://localhost:9003/').ok).toBe(false);

    guard.setAllowlist(['localhost']);
    expect(guard.assertAllowed('localhost', 'http://localhost:9003/').ok).toBe(true);
    expect(guard.assertAllowed('localhost', 'http://localhost:8080/').ok).toBe(true);
    expect(guard.assertAllowed('prod.example.com', 'https://prod.example.com/form').ok).toBe(false);
  });

  it('本机条目不会被环境标识规则外溢到不可信域名', () => {
    const guard = createSiteGuard();
    guard.setAllowlist(['localhost']);
    for (const host of ['test.localhost.evil.com', 'localhost.attacker.cn', 'test.example.com']) {
      expect(guard.assertAllowed(host, `https://${host}/form`).ok, host).toBe(false);
    }
  });
});
