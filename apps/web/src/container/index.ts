import 'server-only';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import { createUseCases, type SessionReader, type UseCases } from '@cashpilot/application';
import { createInMemoryApp } from '@cashpilot/application/testing';
import { env } from '@cashpilot/config/env';
import {
  BetterAuthSessionReader,
  createAuth,
  createPrismaDeps,
  getPrisma,
  JsonLogger,
  ReactPdfInvoiceRenderer,
  seedDemo,
  SystemClock,
  UuidGenerator,
  type Auth,
} from '@cashpilot/infra';

/**
 * Composition root — the ONLY place that instantiates adapters.
 * - PostgreSQL (default): Prisma repositories, local private file storage, React-PDF.
 * - DEMO_IN_MEMORY=1: in-memory repositories + Better Auth memory adapter, seeded with the demo company.
 */
export interface Container {
  mode: 'postgres' | 'memory';
  useCases: UseCases;
  auth: Auth;
  sessions: SessionReader;
  logger: JsonLogger;
}

async function build(): Promise<Container> {
  loadEnvConfig(path.resolve(process.cwd(), '../..')); // the single .env lives at the monorepo root
  const config = env(); // fails fast on invalid configuration
  const logger = new JsonLogger({ app: 'cashpilot' });
  const storageDir = path.resolve(process.cwd(), config.STORAGE_DIR);

  if (config.DEMO_IN_MEMORY === '1') {
    const clock = new SystemClock(config.APP_TIMEZONE);
    const app = createInMemoryApp({ clock, ids: new UuidGenerator(), pdf: new ReactPdfInvoiceRenderer() });
    const auth = createAuth({
      secret: config.BETTER_AUTH_SECRET,
      baseURL: config.BETTER_AUTH_URL,
      storage: { kind: 'memory' },
      rateLimit: process.env.AUTH_RATE_LIMIT !== '0',
      onUserCreated: (u) => app.uow.addUser(u),
    });
    await seedDemo(app.useCases, {
      today: clock.today(),
      ensureUser: async ({ email, name, password }) => (await auth.api.signUpEmail({ body: { email, name, password } })).user.id,
    });
    logger.info('container.ready', { mode: 'memory' });
    return { mode: 'memory', useCases: app.useCases, auth, sessions: new BetterAuthSessionReader(auth), logger };
  }

  const prisma = getPrisma(config.DATABASE_URL);
  const auth = createAuth({
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    storage: { kind: 'prisma', prisma },
    rateLimit: process.env.AUTH_RATE_LIMIT !== '0',
  });
  const useCases = createUseCases(createPrismaDeps(prisma, { storageDir, timeZone: config.APP_TIMEZONE }));
  logger.info('container.ready', { mode: 'postgres' });
  return { mode: 'postgres', useCases, auth, sessions: new BetterAuthSessionReader(auth), logger };
}

const g = globalThis as unknown as { __cashpilotContainer?: Promise<Container> };

/** One container per server process (kept across dev hot reloads). */
export function container(): Promise<Container> {
  g.__cashpilotContainer ??= build().catch((e) => {
    g.__cashpilotContainer = undefined;
    throw e;
  });
  return g.__cashpilotContainer;
}
