import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: __dirname,
  cacheDir: '../node_modules/.vite/docman-dm',
  resolve: {
    dedupe: ['uuid']
  },
  optimizeDeps: {
    exclude: ['uuid'],
    force: true
  },
  test: {
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    // Run tests in a single worker/process to avoid cross-file interference.
    pool: 'forks',
    maxConcurrency: 1,
    sequence: {
      concurrent: false,
    },
    coverage: {
      reportsDirectory: '../coverage/docman-dm',
      provider: 'v8',
    },
  },
});
