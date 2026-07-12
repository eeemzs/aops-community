import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: __dirname,
  cacheDir: '../node_modules/.vite/sys-dm',
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
    // Run tests in a single worker/process to avoid cross-file interference
    // Vitest v3: prefer a single fork (no parallel files), and disable concurrent sequencing.
    // See: https://vitest.dev/config/#pool and poolOptions
    // NOTE: keep both pool/forks and sequence settings for clarity and future-proofing.
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    maxConcurrency: 1,
    sequence: {
      concurrent: false,
    },
    coverage: {
      reportsDirectory: '../coverage/sys-dm',
      provider: 'v8',
    },
  },
});
