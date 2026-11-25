import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from 'node:process';
import type { PrismaConfig } from 'prisma/config';

// Prisma 7 does not load .env by itself: read the package's .env, then the repo root's.
for (const filename of ['.env', '../../.env']) {
  const envPath = path.resolve(import.meta.dirname, filename);
  if (existsSync(envPath)) loadEnvFile(envPath);
}

export default {
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'pnpm --filter @cashpilot/infra seed',
  },
  datasource: {
    // `prisma generate` does not need a live database; migrate/deploy do.
    url: process.env.DATABASE_URL ?? 'postgresql://cashpilot:cashpilot@localhost:5433/cashpilot',
  },
} satisfies PrismaConfig;
