import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    // Testcontainers: pulling/starting Postgres can take a while the first time
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
});
