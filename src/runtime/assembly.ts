import type {
  DataProvider, DetectionContext, EffectiveRules, FieldHandle, FillContext,
  FieldType, Filler, FillExecutor, UndoManager, DiagnosticCounter,
} from '../contracts';
import { newSessionId } from '../utils/id';
import { nowIso } from '../utils/time';
import { computeStructureHash } from '../config/structure-hash';
import { createDiagnosticCounter } from '../config/counters';
import { createRuleStore, type RuleStoreEx } from '../config/rule-store';
import { readSettings, writeSettings, type ScopeMode, type Settings } from '../config/session-store';
import { createBrowserStorage, type StoragePort } from '../infra/storage';
import { nullLogger } from '../infra/logger';
import { runtimeEvent } from '../infra/messages';
import { broadcastRuntimeEvent } from '../infra/runtime';
import { createGeneratedRecord, type GeneratedRecord } from '../data/consistency';
import { createRandomProvider } from '../data/providers/random-provider';
import { createDetector, type DetectorEx } from '../detection/detector';
import { autoSelectRoot, type ContainerAwareContext } from '../detection/scope-selector';
import { createDefaultFiller } from '../fill/default-filler';
import { createStateVerifier } from '../fill/readback';
import { createFillExecutor } from '../execution/fill-executor';
import { createMutationWaiter } from '../execution/mutation-waiter';
import { createUndoManager } from '../execution/undo';
import { createUiState, type UiState } from './ui-state';
import { readPageContext, scopeLabelOf, type PageContextInfo } from './page-context';

export interface DataBundle {
  ctx: FillContext;
  provider: DataProvider;
  record: GeneratedRecord;
}

export interface RuntimeParts {
  readonly storage: StoragePort;
  readonly page: PageContextInfo;
  readonly state: UiState;
  readonly ruleStore: RuleStoreEx;
  readonly counter: DiagnosticCounter;
  readonly detector: DetectorEx;
  readonly filler: Filler;
  readonly executor: FillExecutor;
  readonly undo: UndoManager;
  readonly rules: EffectiveRules;
  readonly data: DataBundle;
  readonly structureHash: string;
  readonly detectionContext: () => DetectionContext;
  readonly currentStructureHash: () => string;
  /** v2: the container picked for the one-shot fill. */
  readonly currentRoot: () => ParentNode;
  readonly setContainerRoot: (root: ParentNode | null) => void;
  readonly setScope: (mode: ScopeMode, rowOnly: boolean) => Promise<void>;
  readonly setSeed: (seed: number) => Promise<void>;
}

function createDataBundle(
  seed: number,
  rules: EffectiveRules,
  page: PageContextInfo,
): DataBundle {
  const generated = new Map<FieldType, string>();
  const record = createGeneratedRecord(seed);
  const ctx: FillContext = {
    sessionId: newSessionId(),
    seed,
    siteKey: page.siteKey,
    pageKey: page.pageKey,
    generated,
    locale: 'zh-CN',
    now: nowIso(),
  };
  return { ctx, provider: createRandomProvider(record, rules, seed, generated), record };
}

/** Composition root. Pure layers receive ports only; no Vue / chrome / wxt
    import appears below this layer. */
export async function assembleRuntime(): Promise<RuntimeParts> {
  const storage = createBrowserStorage();
  const page = readPageContext(window.location);
  const settings: Settings = await readSettings(storage);
  const state = createUiState();
  state.seed = settings.seed;
  state.scopeLabel = scopeLabelOf(settings.scope, false);

  // v2 (SPEC-v2 A): filling is allowed on every page by default. The
  // site-allowlist module is kept as an optional, non-blocking settings entry
  // but is NEVER consulted as a fill precondition in the main path.
  state.allowed = true;
  state.denyReason = '';
  state.fabHint = '';

  const ruleStore = createRuleStore(storage);
  const rules = await ruleStore.getEffectiveRules(page.siteKey, page.pageKey);
  const structureHash = computeStructureHash(document);
  ruleStore.setPageContext(page.pageKey, { urlPattern: page.urlPattern, structureHash });

  const data = createDataBundle(settings.seed, rules, page);
  const counter = createDiagnosticCounter(storage);
  const detector = createDetector();
  const verifier = createStateVerifier();
  const waiter = createMutationWaiter(document);
  const filler = createDefaultFiller({ verifier, waiter, rules });

  let scope: ScopeMode = settings.scope;
  let selectedRoot: ParentNode | null = null;
  const currentRoot = (): ParentNode => {
    if (!selectedRoot) selectedRoot = autoSelectRoot(document);
    return selectedRoot;
  };
  const setContainerRoot = (root: ParentNode | null): void => {
    selectedRoot = root;
  };
  /** Always container-aware: every visible control under the chosen root is
      in fill scope, never narrowed to the nearest <form>. */
  const detectionContext = (): ContainerAwareContext => ({
    root: currentRoot(),
    scope,
    rules,
    logger: nullLogger,
    containerAware: true,
  });
  const currentStructureHash = (): string => computeStructureHash(document);

  const undo: UndoManager = createUndoManager({ filler, ctx: data.ctx, currentStructureHash });
  // A delegate keeps the linkage rescan on the CURRENT provider after a seed
  // change; a captured provider would silently generate values for the old seed.
  const providerRef = { current: data.provider };
  const handlesOf = (): FieldHandle[] => detector.lastScan?.handles ?? [];
  const executor = createFillExecutor({
    waiter,
    counter,
    undo,
    provider: {
      id: 'runtime-provider',
      getValue: (field, ctx) => providerRef.current.getValue(field, ctx),
    },
    rescan: () => {
      detector.detect(detectionContext());
      return handlesOf();
    },
    onProgress: (done, total) => {
      state.progressDone = done;
      state.progressTotal = total;
    },
    onRuntimeEvent: (type, sessionId, done = 0, total = 0) => {
      void broadcastRuntimeEvent(runtimeEvent(type, sessionId, done, total));
    },
  });

  const parts: RuntimeParts = {
    storage, page, state, ruleStore, counter, detector, filler,
    executor, undo, rules, data, structureHash,
    detectionContext, currentStructureHash, currentRoot, setContainerRoot,
    async setScope(mode: ScopeMode, nextRowOnly: boolean): Promise<void> {
      scope = mode;
      state.scopeLabel = scopeLabelOf(mode, nextRowOnly);
      await writeSettings(storage, { scope: mode });
    },
    async setSeed(seed: number): Promise<void> {
      const next = createDataBundle(seed, rules, page);
      // Keep the original ctx (and sessionId) so an existing undo snapshot is
      // still addressable after the user picks another seed.
      parts.data.ctx.seed = seed;
      parts.data.record = next.record;
      parts.data.provider = next.provider;
      providerRef.current = next.provider;
      state.seed = seed;
      await writeSettings(storage, { seed });
    },
  };
  return parts;
}
