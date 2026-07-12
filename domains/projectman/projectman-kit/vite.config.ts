import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: __dirname,
  cacheDir: '../node_modules/.vite/projectman-kit',
  resolve: {
    dedupe: ['uuid'],
  },
  optimizeDeps: {
    exclude: ['uuid'],
    force: true,
  },
  test: {
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    maxConcurrency: 1,
    sequence: {
      concurrent: false,
    },
    coverage: {
      reportsDirectory: '../coverage/projectman-kit',
      provider: 'v8',
    },
  },
})
