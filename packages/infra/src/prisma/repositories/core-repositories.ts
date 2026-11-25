import {
  type AlertDismissalRepository,
  type CompanyRepository,
  type MembershipRepository,
  type PartyFilter,
  type PartyRepository,
  type UserDirectory,
} from '@cashpilot/application';
import { Company, Membership, Party } from '@cashpilot/domain';
import { type PrismaTx } from '@cashpilot/db';
import { fromDbDate, toBigInt, toDbDate, toMoney } from '../mappers';

export class PrismaUserDirectory implements UserDirectory {
  constructor(private readonly db: PrismaTx) {}

  async byId(id: string) {
    return this.db.user.findUnique({ where: { id }, select: { id: true, name: true, email: true } });
  }

  async byEmail(email: string) {
    return this.db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true, name: true, email: true } });
  }

  async namesByIds(ids: readonly string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map<string, string>();
    const rows = await this.db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

type CompanyRow = Awaited<ReturnType<PrismaTx['company']['findUniqueOrThrow']>>;

function companyToDomain(r: CompanyRow): Company {
  return Company.restore(r.id, {
    name: r.name,
    slug: r.slug,
    sector: r.sector,
    openingBalance: toMoney(r.openingBalanceMillimes),
    openingDate: fromDbDate(r.openingDate),
    stampDuty: toMoney(r.stampDutyMillimes),
  });
}

export class PrismaCompanyRepository implements CompanyRepository {
  constructor(private readonly db: PrismaTx) {}

  async byId(id: string) {
    const r = await this.db.company.findUnique({ where: { id } });
    return r ? companyToDomain(r) : null;
  }

  async bySlug(slug: string) {
    const r = await this.db.company.findUnique({ where: { slug } });
    return r ? companyToDomain(r) : null;
  }

  async slugExists(slug: string) {
    return (await this.db.company.count({ where: { slug } })) > 0;
  }

  async save(c: Company) {
    const s = c.snapshot();
    const data = {
      name: s.name,
      slug: s.slug,
      sector: s.sector,
      openingBalanceMillimes: toBigInt(s.openingBalance),
      openingDate: toDbDate(s.openingDate),
      stampDutyMillimes: toBigInt(s.stampDuty),
    };
    await this.db.company.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
  }
}

export class PrismaMembershipRepository implements MembershipRepository {
  constructor(private readonly db: PrismaTx) {}

  async get(companyId: string, userId: string) {
    const r = await this.db.membership.findUnique({ where: { userId_companyId: { userId, companyId } } });
    return r ? Membership.restore({ userId: r.userId, companyId: r.companyId, role: r.role }) : null;
  }

  async listByCompany(companyId: string) {
    const rows = await this.db.membership.findMany({
      where: { companyId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({ userId: r.userId, name: r.user.name, email: r.user.email, role: r.role }));
  }

  async listByUser(userId: string) {
    const rows = await this.db.membership.findMany({
      where: { userId },
      include: { company: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({ companyId: r.company.id, companyName: r.company.name, companySlug: r.company.slug, role: r.role }));
  }

  async countOwners(companyId: string) {
    return this.db.membership.count({ where: { companyId, role: 'OWNER' } });
  }

  async save(m: Membership) {
    await this.db.membership.upsert({
      where: { userId_companyId: { userId: m.userId, companyId: m.companyId } },
      create: { userId: m.userId, companyId: m.companyId, role: m.role },
      update: { role: m.role },
    });
  }

  async remove(companyId: string, userId: string) {
    await this.db.membership.deleteMany({ where: { companyId, userId } });
  }
}

type PartyRow = Awaited<ReturnType<PrismaTx['party']['findUniqueOrThrow']>>;

function partyToDomain(r: PartyRow): Party {
  return Party.restore(r.id, {
    companyId: r.companyId,
    kind: r.kind,
    name: r.name,
    email: r.email,
    phone: r.phone,
    address: r.address,
    taxId: r.taxId,
    notes: r.notes,
    archived: r.archived,
  });
}

export class PrismaPartyRepository implements PartyRepository {
  constructor(private readonly db: PrismaTx) {}

  async byId(companyId: string, id: string) {
    const r = await this.db.party.findFirst({ where: { id, companyId } });
    return r ? partyToDomain(r) : null;
  }

  async list(companyId: string, f: PartyFilter = {}) {
    const rows = await this.db.party.findMany({
      where: { companyId, ...(f.kind ? { kind: f.kind } : {}), ...(f.includeArchived ? {} : { archived: false }) },
      orderBy: { name: 'asc' },
    });
    return rows.map(partyToDomain);
  }

  async save(p: Party) {
    const { id, ...data } = p.snapshot();
    await this.db.party.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
}

export class PrismaAlertDismissalRepository implements AlertDismissalRepository {
  constructor(private readonly db: PrismaTx) {}

  async keys(companyId: string, userId: string) {
    const rows = await this.db.alertDismissal.findMany({ where: { companyId, userId }, select: { key: true } });
    return new Set(rows.map((r) => r.key));
  }

  async dismiss(companyId: string, userId: string, key: string) {
    await this.db.alertDismissal.createMany({ data: [{ companyId, userId, key }], skipDuplicates: true });
  }
}
