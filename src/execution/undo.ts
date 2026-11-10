import type {
  FieldHandle,
  FillContext,
  FillResult,
  Filler,
  UndoManager,
  UndoSnapshot,
  UndoState,
} from '../contracts';
import { readDomValue } from '../fill/native-setter';
import { nowIso } from '../utils/time';

export interface UndoDeps {
  readonly filler: Filler;
  readonly ctx: FillContext;
  readonly currentStructureHash: () => string;
}

interface Session {
  state: UndoState;
  handles: Map<string, FieldHandle>;
}

/** In-memory session only. Never persisted, never in counters, never exported.
    Restore goes through the SAME P0 FillerStrategy so select / date-picker
    component state is restored, not just a hidden input. */
export function createUndoManager(deps: UndoDeps): UndoManager {
  const sessions = new Map<string, Session>();

  return {
    capture(sessionId: string, handles: readonly FieldHandle[]): UndoState {
      const items: UndoSnapshot[] = [];
      const handleMap = new Map<string, FieldHandle>();
      for (const handle of handles) {
        if (handle.descriptor.skipReason === 'has-value') continue;
        items.push({
          sessionId,
          fieldId: handle.descriptor.id,
          originalValue: readDomValue(handle),
          controlType: handle.descriptor.controlType,
          capturedAt: nowIso(),
        });
        handleMap.set(handle.descriptor.id, handle);
      }
      const state: UndoState = {
        valid: true,
        structureHash: deps.currentStructureHash(),
        items,
      };
      sessions.set(sessionId, { state, handles: handleMap });
      return state;
    },

    state(sessionId: string): UndoState {
      const entry = sessions.get(sessionId);
      if (!entry) {
        return {
          valid: false,
          invalidReason: 'snapshot-missing',
          structureHash: '',
          items: [],
        };
      }
      const connected = [...entry.handles.values()].every((handle) => handle.isConnected());
      if (!connected) {
        return { ...entry.state, valid: false, invalidReason: 'element-detached' };
      }
      if (entry.state.structureHash !== deps.currentStructureHash()) {
        return { ...entry.state, valid: false, invalidReason: 'structure-changed' };
      }
      return entry.state;
    },

    async restore(
      sessionId: string,
      handles: Map<string, FieldHandle>,
    ): Promise<readonly FillResult[]> {
      const entry = sessions.get(sessionId);
      if (!entry) return [];
      const results: FillResult[] = [];
      for (const item of entry.state.items) {
        const handle = handles.get(item.fieldId) ?? entry.handles.get(item.fieldId);
        if (!handle || !handle.isConnected()) continue;
        let result = await deps.filler.fill(handle, item.originalValue, deps.ctx);
        // An empty original value is a real snapshot. A required control will
        // legitimately show its required-state validation after restore; that
        // is not a failed restore.
        if (
          !result.verified &&
          item.originalValue === '' &&
          result.verification?.domValueMatched &&
          result.verification?.frameworkStateMatched
        ) {
          result = {
            ...result,
            status: 'filled',
            verified: true,
            verification: {
              ...result.verification,
              validationCleared: true,
              evidence: [...result.verification.evidence, 'restore-empty-value'],
            },
          };
        }
        results.push(result);
      }
      return results;
    },

    invalidate(sessionId: string, reason: 'page-navigated' | 'dialog-closed'): void {
      const entry = sessions.get(sessionId);
      if (!entry) return;
      entry.state = { ...entry.state, valid: false, invalidReason: reason };
    },
  };
}
