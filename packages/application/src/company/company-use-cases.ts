import {
  assertCan,
  CashMovement,
  Company,
  LocalDate,
  Membership,
  Money,
  NotFound,
  slugify,
  type Role,
  type Sector,
} from '@cashpilot/domain';
import { type MemberView } from '../ports';
import { type Actor } from '../shared/actor';
import { type Deps } from '../shared/deps';
import { attempt, fail, ok, type Result } from '../shared/result';

export interface CompanyDto {
  id: string;
  name: string;
  slug: string;
  sector: Sector;
  openingBalanceMillimes: number;
  openingDate: string;
  stampDutyMillimes: number;
}

function toCompanyDto(c: Company): CompanyDto {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    sector: c.sector,
    openingBalanceMillimes: c.openingBalance.millimes,
    openingDate: c.openingDate.toString(),
    stampDutyMillimes: c.stampDuty.millimes,
  };
}

export interface CreateCompanyInput {
  name: string;
  sector: Sector;
  openingBalanceMillimes: number;
  openingDate: string;
}

/**
 * Creates a company. In ONE transaction: the company, the creator's OWNER membership,
 * the single OPENING ledger movement and the audit entry.
 */
export class CreateCompany {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string, input: CreateCompanyInput): Promise<Result<{ companyId: string; slug: string }>> {
    const { uow, clock, ids } = this.deps;
    return attempt(() =>
      uow.run(async (tx) => {
        const base = slugify(input.name) || 'entreprise';
        let slug = base;
        for (let n = 2; await tx.companies.slugExists(slug); n++) slug = `${base}-${n}`;

        const company = Company.create(
          ids.next(),
          {
            name: input.name,
            slug,
            sector: input.sector,
            openingBalance: Money.ofMillimes(input.openingBalanceMillimes),
            openingDate: LocalDate.parse(input.openingDate),
          },
          clock.today(),
        );
        await tx.companies.save(company);
        await tx.memberships.save(Membership.create({ userId, companyId: company.id, role: 'OWNER' }));
        const opening = CashMovement.fromOpening(ids.next(), company, userId);
        if (opening) await tx.ledger.append(opening);
        await tx.audit.record({
          companyId: company.id,
          actorId: userId,
          action: 'company.created',
          entityType: 'Company',
          entityId: company.id,
          after: toCompanyDto(company),
        });
        return ok({ companyId: company.id, slug });
      }),
    );
  }
}

export interface MyCompany {
  id: string;
  name: string;
  slug: string;
  role: Role;
}

export class ListMyCompanies {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string): Promise<Result<MyCompany[]>> {
    const rows = await this.deps.uow.read((r) => r.memberships.listByUser(userId));
    return ok(rows.map((m) => ({ id: m.companyId, name: m.companyName, slug: m.companySlug, role: m.role })));
  }
}

/**
 * Session user + company slug → Actor. A non-member gets NOT_FOUND (never FORBIDDEN),
 * so another company's existence never leaks.
 */
export class ResolveActor {
  constructor(private readonly deps: Deps) {}

  async execute(userId: string, slug: string): Promise<Result<Actor>> {
    return this.deps.uow.read(async (r) => {
      const company = await r.companies.bySlug(slug);
      if (!company) return fail('NOT_FOUND');
      const membership = await r.memberships.get(company.id, userId);
      if (!membership) return fail('NOT_FOUND');
      return ok({ userId, companyId: company.id, companySlug: company.slug, role: membership.role });
    });
  }
}

export class GetCompany {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor): Promise<Result<CompanyDto>> {
    return attempt(() =>
      this.deps.uow.read(async (r) => {
        const company = await r.companies.byId(actor.companyId);
        if (!company) throw new NotFound();
        return ok(toCompanyDto(company));
      }),
    );
  }
}

export class UpdateCompanySettings {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { name: string; sector: Sector; stampDutyMillimes: number }): Promise<Result<CompanyDto>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'company.settings');
        const company = await tx.companies.byId(actor.companyId);
        if (!company) throw new NotFound();
        const before = toCompanyDto(company);
        company.updateSettings({ name: input.name, sector: input.sector, stampDuty: Money.ofMillimes(input.stampDutyMillimes) });
        await tx.companies.save(company);
        const after = toCompanyDto(company);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'company.updated',
          entityType: 'Company',
          entityId: company.id,
          before,
          after,
        });
        return ok(after);
      }),
    );
  }
}

export class ListMembers {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor): Promise<Result<MemberView[]>> {
    return attempt(async () => {
      assertCan(actor, 'members.manage');
      return ok(await this.deps.uow.read((r) => r.memberships.listByCompany(actor.companyId)));
    });
  }
}

export class AddMember {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { email: string; role: Role }): Promise<Result<{ userId: string }>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'members.manage');
        const user = await tx.users.byEmail(input.email.trim().toLowerCase());
        if (!user) return fail('USER_NOT_FOUND');
        if (await tx.memberships.get(actor.companyId, user.id)) return fail('ALREADY_MEMBER');
        await tx.memberships.save(Membership.create({ userId: user.id, companyId: actor.companyId, role: input.role }));
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'member.added',
          entityType: 'Membership',
          entityId: user.id,
          after: { email: user.email, role: input.role },
        });
        return ok({ userId: user.id });
      }),
    );
  }
}

export class ChangeRole {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { userId: string; role: Role }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'members.manage');
        const membership = await tx.memberships.get(actor.companyId, input.userId);
        if (!membership) throw new NotFound();
        const before = membership.role;
        const owners = await tx.memberships.countOwners(actor.companyId);
        membership.changeRole(input.role, owners - (before === 'OWNER' ? 1 : 0));
        await tx.memberships.save(membership);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'member.roleChanged',
          entityType: 'Membership',
          entityId: input.userId,
          before: { role: before },
          after: { role: input.role },
        });
        return ok(undefined);
      }),
    );
  }
}

export class RemoveMember {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { userId: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'members.manage');
        const membership = await tx.memberships.get(actor.companyId, input.userId);
        if (!membership) throw new NotFound();
        const owners = await tx.memberships.countOwners(actor.companyId);
        membership.assertRemovable(owners - (membership.role === 'OWNER' ? 1 : 0));
        await tx.memberships.remove(actor.companyId, input.userId);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'member.removed',
          entityType: 'Membership',
          entityId: input.userId,
          before: { role: membership.role },
        });
        return ok(undefined);
      }),
    );
  }
}
