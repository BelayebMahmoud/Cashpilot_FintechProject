import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export { PrismaClient, Prisma } from './generated/prisma/client';
export type * from './generated/prisma/models';

/** Creates a Prisma client on the node-postgres driver adapter (Prisma 7). */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForPrisma = globalThis as unknown as { __cashpilotPrisma?: PrismaClient };

/** One client per process (survives Next.js dev hot reloads). */
export function getPrisma(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  globalForPrisma.__cashpilotPrisma ??= createPrismaClient(connectionString);
  return globalForPrisma.__cashpilotPrisma;
}

/** Transaction client type (what `$transaction(async (tx) => …)` receives). */
export type PrismaTx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;
