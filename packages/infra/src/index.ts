// Public API of @cashpilot/infra — imported ONLY by the composition root (apps/web/src/container).
import { type Deps } from '@cashpilot/application';
import { type PrismaClient } from '@cashpilot/db';
import { ReactPdfInvoiceRenderer } from './pdf/react-pdf-invoice-renderer';
import { PrismaForecastReadModel } from './prisma/prisma-forecast-read-model';
import { PrismaUnitOfWork } from './prisma/prisma-unit-of-work';
import { LocalFileStorage } from './storage/local-file-storage';
import { SystemClock, UuidGenerator } from './system/system';

export { PrismaUnitOfWork, prismaRepositories } from './prisma/prisma-unit-of-work';
export { PrismaForecastReadModel } from './prisma/prisma-forecast-read-model';
export { toBigInt, fromBigInt } from './prisma/mappers';
export { SystemClock, UuidGenerator, JsonLogger } from './system/system';
export { LocalFileStorage } from './storage/local-file-storage';
export { ReactPdfInvoiceRenderer } from './pdf/react-pdf-invoice-renderer';
export { createAuth, BetterAuthSessionReader, type Auth, type AuthOptions } from './auth/better-auth';
export { seedDemo, DEMO_PASSWORD, DEMO_ACCOUNTS, DEMO_SLUG } from './seed/demo-seed';
export { getPrisma, createPrismaClient } from '@cashpilot/db';

/** Adapters for the PostgreSQL deployment. */
export function createPrismaDeps(prisma: PrismaClient, options: { storageDir: string; timeZone: string }): Deps {
  const ids = new UuidGenerator();
  return {
    uow: new PrismaUnitOfWork(prisma, ids),
    clock: new SystemClock(options.timeZone),
    ids,
    forecast: new PrismaForecastReadModel(prisma),
    storage: new LocalFileStorage(options.storageDir),
    pdf: new ReactPdfInvoiceRenderer(),
  };
}
