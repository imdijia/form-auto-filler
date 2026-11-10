import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script';
import { startContentRuntime } from '../src/runtime/content-runtime';

/** Bundled as an IIFE and injected into the ISOLATED world on a user gesture.
    No static content_scripts and no host_permissions (ARCH 5.3). */
export default defineUnlistedScript(() => {
  void startContentRuntime();
});
