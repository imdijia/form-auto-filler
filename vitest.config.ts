/**
 * QA-owned Vitest configuration (Phase 2 test-first deliverable).
 *
 * This file deliberately does NOT merge wxt.config.ts: WXT drives the
 * extension build, while this config only runs pure-logic / contract tests.
 * Frontend: keep this file when adding a vite.config.ts for the app build.
 *
 * Environment is 'node' by default. Test files that need a DOM carry
 * `// @vitest-environment jsdom` as their first comment.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', '.output/**', '.wxt/**'],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    // Coverage is opt-in (`vitest run --coverage`) and needs
    // @vitest/coverage-v8; it is NOT a gate for this Phase 2 delivery.
    coverage: {
      provider: 'v8',
      include: ['src/detection/**', 'src/data/**', 'src/fill/**', 'src/config/**', 'src/execution/**'],
      reporter: ['text'],
    },
  },
});
