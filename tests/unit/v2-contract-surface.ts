/**
 * QA v2 契约发现层（独立测试作者，黑盒 / 从需求反推）。
 *
 * 本文件只查找公开导出的「容器自动选择」契约，不读实现源码、不复述实现假设。
 * 前端产物尚未定型时找不到契约属预期：由测试用例给出明确的判别失败信息，
 * 而不是让模块加载崩溃，也不是写成恒真断言。
 *
 * 主契约（已同步前端）：src/detection/container.ts 导出
 *   selectAutoContainer(document: Document): HTMLElement | { element: HTMLElement; tier?: string }
 * 也兼容 detection 目录下其余既有模块中的同义导出名，避免绑定单一私有命名。
 */
import * as containerModule from '../../src/detection/container';
import * as detectorModule from '../../src/detection/detector';
import * as scanModule from '../../src/detection/scan';
import * as pickerModule from '../../src/detection/picker';

export interface ContainerResolution {
  raw: unknown;
  element: HTMLElement | null;
  tier: string | null;
}

export interface ContainerContract {
  found: boolean;
  exportName: string | null;
  modulePath: string | null;
  resolve: (doc: Document) => ContainerResolution | null;
  detail: string;
}

type AnyFn = (...args: unknown[]) => unknown;

const MODULES: Array<{ path: string; mod: Record<string, unknown> }> = [
  { path: 'src/detection/container.ts', mod: containerModule as unknown as Record<string, unknown> },
  { path: 'src/detection/detector.ts', mod: detectorModule as unknown as Record<string, unknown> },
  { path: 'src/detection/scan.ts', mod: scanModule as unknown as Record<string, unknown> },
  { path: 'src/detection/picker.ts', mod: pickerModule as unknown as Record<string, unknown> },
];

/** 候选导出名按可读性优先级排列；命中任意一个即视为契约成立。 */
const CANDIDATE_NAMES = [
  'selectAutoContainer',
  'autoSelectContainer',
  'selectContainer',
  'resolveAutoContainer',
  'resolveContainer',
  'chooseContainer',
  'pickContainer',
  'detectContainer',
  'autoDetectContainer',
  'findFillContainer',
  'selectFillScope',
  'autoSelectScope',
];

function asElement(value: unknown): HTMLElement | null {
  if (typeof HTMLElement !== 'undefined' && value instanceof HTMLElement) return value;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['element', 'container', 'root', 'node', 'target']) {
      const candidate = obj[key];
      if (typeof HTMLElement !== 'undefined' && candidate instanceof HTMLElement) {
        return candidate as HTMLElement;
      }
    }
  }
  return null;
}

function asTier(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of ['tier', 'priority', 'level', 'kind', 'source']) {
      if (typeof obj[key] === 'string') return obj[key] as string;
    }
  }
  return null;
}

export function findContainerContract(): ContainerContract {
  const attempts: Array<{ path: string; name: string; fn: AnyFn }> = [];
  for (const m of MODULES) {
    for (const name of CANDIDATE_NAMES) {
      const fn = m.mod[name];
      if (typeof fn === 'function') attempts.push({ path: m.path, name, fn: fn as AnyFn });
    }
  }

  const resolve = (doc: Document): ContainerResolution | null => {
    for (const attempt of attempts) {
      // 兼容 (document) / (root) / (root, document) / () 四种公开签名。
      const argSets: unknown[][] = [
        [doc], [doc.body], [doc.body, doc], [doc.documentElement], [], [doc, doc.body],
      ];
      for (const args of argSets) {
        try {
          const raw = attempt.fn(...args);
          const element = asElement(raw);
          if (element) return { raw, element, tier: asTier(raw) };
        } catch {
          // 签名不匹配，尝试下一种调用形态。
        }
      }
    }
    return null;
  };

  return {
    found: attempts.length > 0,
    exportName: attempts[0]?.name ?? null,
    modulePath: attempts[0]?.path ?? null,
    resolve,
    detail: attempts.length > 0
      ? '发现候选导出：' + attempts.map((a) => a.path + '#' + a.name).join(', ')
      : [
        '未发现容器自动选择导出。',
        '主契约：src/detection/container.ts 需导出 selectAutoContainer(document)，',
        '返回选定容器 HTMLElement（或含 element 字段的结果对象）。',
        '四级优先级：可见 dialog → 可见控件最多的 form → 最小公共祖先 → body。',
      ].join(''),
  };
}
