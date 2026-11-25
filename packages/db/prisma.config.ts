import { config } from 'dotenv';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 does not load .env by itself: read the package's .env, then the repo root's.
config({ path: path.resolve(import.meta.dirname, '.env'), quiet: true });
config({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'pnpm --filter @cashpilot/infra seed',
  },
  datasource: {
    // `prisma generate` does not need a live database; migrate/deploy do.
    url: process.env.DATABASE_URL ?? 'postgresql://cashpilot:cashpilot@localhost:5433/cashpilot',
  },
});
