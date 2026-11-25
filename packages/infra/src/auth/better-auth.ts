import { type SessionReader, type UserView } from '@cashpilot/application';
import { type PrismaClient } from '@cashpilot/db';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { prismaAdapter } from 'better-auth/adapters/prisma';

/*
 * Authentication only (who is this?). Authorization (what may they do in this company?)
 * lives in the domain policies and is enforced by the use cases.
 */

export interface AuthOptions {
  secret: string;
  baseURL: string;
  /** Postgres via Prisma, or the in-memory store (DEMO_IN_MEMORY=1). */
  storage: { kind: 'prisma'; prisma: PrismaClient } | { kind: 'memory' };
  /** Called after an account is created (in-memory mode mirrors users into the app's UserDirectory). */
  onUserCreated?: (user: UserView) => void | Promise<void>;
}

export function createAuth(options: AuthOptions) {
  return betterAuth({
    secret: options.secret,
    baseURL: options.baseURL,
    database:
      options.storage.kind === 'prisma'
        ? prismaAdapter(options.storage.prisma, { provider: 'postgresql' })
        : memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, autoSignIn: true },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    // Login brute-force protection
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: { '/sign-in/email': { window: 60, max: 5 }, '/sign-up/email': { window: 60, max: 5 } },
    },
    advanced: { database: { generateId: () => crypto.randomUUID() } },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await options.onUserCreated?.({ id: user.id, name: user.name, email: user.email });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** The single entry point the web layer uses to know who is signed in. */
export class BetterAuthSessionReader implements SessionReader {
  constructor(private readonly auth: Auth) {}

  async currentUser(headers: Headers): Promise<UserView | null> {
    const session = await this.auth.api.getSession({ headers });
    if (!session) return null;
    return { id: session.user.id, name: session.user.name, email: session.user.email };
  }
}
