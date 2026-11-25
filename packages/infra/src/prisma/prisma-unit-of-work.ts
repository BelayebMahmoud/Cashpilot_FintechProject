import { type IdGenerator, type Repositories, type UnitOfWork } from '@cashpilot/application';
import { type PrismaClient, type PrismaTx } from '@cashpilot/db';
import {
  PrismaAlertDismissalRepository,
  PrismaCompanyRepository,
  PrismaMembershipRepository,
  PrismaPartyRepository,
  PrismaUserDirectory,
} from './repositories/core-repositories';
import { PrismaInvoiceRepository } from './repositories/invoice-repository';
import { PrismaAuditLog, PrismaLedgerRepository } from './repositories/ledger-audit';
import {
  PrismaExpenseRepository,
  PrismaPlannedFlowRepository,
  PrismaProjectRepository,
  PrismaScenarioRepository,
} from './repositories/operations-repositories';

/** Every repository bound to the same client (a transaction or the base client). */
export function prismaRepositories(db: PrismaTx, ids: IdGenerator, inTransaction: boolean): Repositories {
  return {
    users: new PrismaUserDirectory(db),
    companies: new PrismaCompanyRepository(db),
    memberships: new PrismaMembershipRepository(db),
    parties: new PrismaPartyRepository(db),
    invoices: new PrismaInvoiceRepository(db, inTransaction),
    expenses: new PrismaExpenseRepository(db, inTransaction),
    ledger: new PrismaLedgerRepository(db),
    plannedFlows: new PrismaPlannedFlowRepository(db),
    scenarios: new PrismaScenarioRepository(db),
    projects: new PrismaProjectRepository(db),
    audit: new PrismaAuditLog(db, ids),
    alertDismissals: new PrismaAlertDismissalRepository(db),
  };
}

/**
 * `run` wraps the use case in `prisma.$transaction`: the change, its ledger movement
 * and its audit entry are committed together, or nothing is.
 */
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ids: IdGenerator,
  ) {}

  run<T>(work: (tx: Repositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(prismaRepositories(tx, this.ids, true)), {
      maxWait: 10_000,
      timeout: 20_000,
    });
  }

  read<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return work(prismaRepositories(this.prisma, this.ids, false));
  }
}
