import { defineBackground } from 'wxt/utils/define-background';
import { startBackgroundRuntime } from '../src/runtime/background-runtime';

/** Assembly only: commands, action, injection and message routing live in
    src/runtime/background-runtime.ts. No business logic in this entrypoint. */
export default defineBackground(() => {
  startBackgroundRuntime();
});
