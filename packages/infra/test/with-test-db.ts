import { execSync } from 'node:child_process';
import path from 'node:path';
import { createPrismaClient, type PrismaClient } from '@cashpilot/db';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export interface TestDb {
  prisma: PrismaClient;
  url: string;
  stop: () => Promise<void>;
}

/**
 * Starts a throw-away PostgreSQL 16 (Testcontainers), applies the real migrations
 * and returns a Prisma client. Set TEST_DATABASE_URL to reuse an existing empty database instead.
 */
export async function withTestDb(): Promise<TestDb> {
  let container: StartedPostgreSqlContainer | null = null;
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    container = await new PostgreSqlContainer('postgres:16').start();
    url = container.getConnectionUri();
  }
  execSync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '../../db'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  const prisma = createPrismaClient(url);
  return {
    prisma,
    url,
    stop: async () => {
      await prisma.$disconnect();
      await container?.stop();
    },
  };
}

/** True when a Docker daemon is reachable (or a test DB URL is provided). */
export async function dockerAvailable(): Promise<boolean> {
  if (process.env.TEST_DATABASE_URL) return true;
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}
