import { browser } from 'wxt/browser';
import { mountShadowUi, SHADOW_HOST_ID } from '../ui/shadow';
import InjectedApp from '../ui/components/InjectedApp.vue';
import { isControlMessage, type ControlMessage } from '../infra/messages';
import { assembleRuntime, type RuntimeParts } from './assembly';
import { createPlanSession, type PlanSession } from './plan-session';
import { createUiActions } from './ui-actions';
import type { UiActions } from './ui-state';

/**
 * Unlisted script entry (ISOLATED world). Injected only on a user gesture by
 * background.ts. The message listener is registered BEFORE async assembly so
 * a command dispatched immediately after injection is never lost.
 */
export async function startContentRuntime(): Promise<void> {
  if (document.getElementById(SHADOW_HOST_ID)) return;
  let parts: RuntimeParts | null = null;
  let session: PlanSession | null = null;
  let actions: UiActions | null = null;
  const pending: ControlMessage[] = [];

  function apply(message: ControlMessage): void {
    if (!parts || !session || !actions) {
      pending.push(message);
      return;
    }
    const activeSession = session;
    const activeActions = actions;
    switch (message.name) {
      // v2: all fill gestures are one shot. The three legacy scope commands
      // resolve to the same automatic-container fill; no gating, no preview.
      case 'open-plan':
      case 'scope-current-form':
      case 'scope-current-row':
        activeActions.openPlan();
        break;
      case 'open-picker':
        activeActions.openPicker();
        break;
      case 'undo':
        activeActions.undo();
        break;
      case 'refresh-plan': {
        const seed = message.payload.seed;
        if (typeof seed === 'number' && Number.isFinite(seed)) {
          void activeSession.setSeed(Math.trunc(seed)).then(() => activeActions.openPlan());
        } else {
          activeActions.openPlan();
        }
        break;
      }
      case 'locate': {
        const fieldId = message.payload.fieldId;
        if (typeof fieldId === 'string') activeSession.locate(fieldId);
        break;
      }
      case 'close-panels':
        activeActions.closePlan();
        activeActions.closePicker();
        activeActions.closeResult();
        break;
      default:
        break;
    }
  }

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isControlMessage(message)) queueMicrotask(() => apply(message));
    return false;
  });

  parts = await assembleRuntime();
  session = createPlanSession(parts);
  actions = createUiActions(parts, session);
  mountShadowUi(InjectedApp, { state: parts.state, actions });
  await session.refresh();
  for (const queued of pending.splice(0)) apply(queued);
}
