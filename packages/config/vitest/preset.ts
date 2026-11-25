import { defineConfig } from 'vitest/config';

/** Shared Vitest settings: deterministic timezone-free tests, coverage on src/. */
export const vitestPreset = defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
    environment: 'node',
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/**/*.test.ts', 'src/**/index.ts'] },
  },
});
