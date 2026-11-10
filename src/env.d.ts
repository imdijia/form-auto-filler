/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

/** @lucide/vue@1.70.0 ships no .d.ts. SFC scripts import named icons only;
    this shorthand keeps strict TS / vue-tsc quiet without adding a dependency. */
declare module '@lucide/vue';
