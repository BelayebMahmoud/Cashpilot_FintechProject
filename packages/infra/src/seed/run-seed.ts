/**
 * `pnpm db:seed` — (re)creates the "Atlas Digital" demo company in PostgreSQL.
 * Idempotent: the previous demo company is removed first; demo accounts are reused.
 */
import { config } from 'dotenv';
import path from 'node:path';
import { createUseCases } from '@cashpilot/application';
import { createPrismaClient } from '@cashpilot/db';
import { createAuth } from '../auth/better-auth';
import { createPrismaDeps } from '../index';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DEMO_SLUG, seedDemo } from './demo-seed';

config({ path: path.resolve(import.meta.dirname, '../../../../.env'), quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example)');
  const prisma = createPrismaClient(url);
  const deps = createPrismaDeps(prisma, {
    storageDir: path.resolve(import.meta.dirname, '../../../../', process.env.STORAGE_DIR ?? 'storage'),
    timeZone: process.env.APP_TIMEZONE ?? 'Africa/Tunis',
  });
  const auth = createAuth({
    secret: process.env.BETTER_AUTH_SECRET ?? 'seed-secret-seed-secret-seed-secret!',
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    storage: { kind: 'prisma', prisma },
  });

  const existing = await prisma.company.findUnique({ where: { slug: DEMO_SLUG } });
  if (existing) {
    const companyId = existing.id;
    console.info(`Removing previous demo company ${companyId}…`);
    await prisma.$transaction([
      prisma.auditEntry.deleteMany({ where: { companyId } }),
      prisma.cashMovement.deleteMany({ where: { companyId } }),
      prisma.payment.deleteMany({ where: { companyId } }),
      prisma.invoiceLine.deleteMany({ where: { invoice: { companyId } } }),
      prisma.invoice.deleteMany({ where: { companyId } }),
      prisma.expense.deleteMany({ where: { companyId } }),
      prisma.milestone.deleteMany({ where: { project: { companyId } } }),
      prisma.project.deleteMany({ where: { companyId } }),
      prisma.plannedFlow.deleteMany({ where: { companyId } }),
      prisma.scenario.deleteMany({ where: { companyId } }),
      prisma.alertDismissal.deleteMany({ where: { companyId } }),
      prisma.invoiceCounter.deleteMany({ where: { companyId } }),
      prisma.party.deleteMany({ where: { companyId } }),
      prisma.membership.deleteMany({ where: { companyId } }),
      prisma.company.delete({ where: { id: companyId } }),
    ]);
  }

  const { slug } = await seedDemo(createUseCases(deps), {
    today: deps.clock.today(),
    ensureUser: async ({ email, name, password }) => {
      const found = await prisma.user.findUnique({ where: { email } });
      if (found) return found.id;
      const res = await auth.api.signUpEmail({ body: { email, name, password } });
      return res.user.id;
    },
  });

  console.info(`Demo company ready: /${slug}/dashboard`);
  for (const a of DEMO_ACCOUNTS) console.info(`  ${a.role.padEnd(16)} ${a.email} / ${DEMO_PASSWORD}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
