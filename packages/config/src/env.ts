import { z } from 'zod';

/**
 * Server environment, validated once at boot: a missing or malformed variable
 * makes the app fail fast instead of failing on the first request.
 * Only NEXT_PUBLIC_* variables ever reach the browser.
 */
const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DEMO_IN_MEMORY: z.enum(['0', '1']).default('0'),
    DATABASE_URL: z.string().url().optional(),
    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET doit contenir au moins 32 caractères'),
    BETTER_AUTH_URL: z.string().url(),
    NEXT_PUBLIC_APP_URL: z.string().url(),
    STORAGE_DIR: z.string().min(1).default('./storage'),
    APP_TIMEZONE: z.string().default('Africa/Tunis'),
  })
  .refine((e) => e.DEMO_IN_MEMORY === '1' || !!e.DATABASE_URL, {
    message: 'DATABASE_URL est obligatoire (ou DEMO_IN_MEMORY=1)',
    path: ['DATABASE_URL'],
  });

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  return parsed.data;
}

let cached: Env | undefined;
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
