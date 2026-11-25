import { describe, expect, it } from 'vitest';
import { unwrap } from '../src/shared/result';
import { DT, makeWorld } from './fixture';

describe('Entreprise et accès', () => {
  it('CreateCompany: creator is OWNER and the opening movement is created exactly once', async () => {
    const w = await makeWorld();
    const opening = w.uow.state.movements.filter((m) => m.companyId === w.owner.companyId && m.sourceType === 'OPENING');
    expect(opening).toHaveLength(1);
    expect(opening[0]!.amount.millimes).toBe(DT(5000));
    expect(w.owner.role).toBe('OWNER');
    expect(w.uow.auditEntries(w.owner.companyId).map((a) => a.action)).toContain('company.created');
    const companies = unwrap(await w.useCases.listMyCompanies.execute('u-owner'));
    expect(companies).toEqual([{ id: w.owner.companyId, name: 'Atlas', slug: 'atlas', role: 'OWNER' }]);
  });

  it('generates a unique slug when the name is taken', async () => {
    const w = await makeWorld();
    const r = unwrap(
      await w.useCases.createCompany.execute('u-owner', { name: 'Atlas', sector: 'SERVICES', openingBalanceMillimes: 0, openingDate: '2026-11-01' }),
    );
    expect(r.slug).toBe('atlas-2');
    // zero opening balance → no movement
    expect(w.uow.state.movements.filter((m) => m.companyId === r.companyId)).toHaveLength(0);
  });

  it('a failing CreateCompany persists nothing (transaction rollback)', async () => {
    const w = await makeWorld();
    const before = w.uow.state.companies.size;
    const r = await w.useCases.createCompany.execute('u-owner', {
      name: 'Future',
      sector: 'SERVICES',
      openingBalanceMillimes: DT(1),
      openingDate: '2027-01-01', // in the future → INVALID_DATE
    });
    expect(r).toMatchObject({ ok: false, code: 'INVALID_DATE' });
    expect(w.uow.state.companies.size).toBe(before);
  });

  it('cross-tenant ResolveActor returns NOT_FOUND', async () => {
    const w = await makeWorld();
    expect(await w.useCases.resolveActor.execute('u-out', 'atlas')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await w.useCases.resolveActor.execute('u-owner', 'nope')).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('last owner cannot be removed or demoted', async () => {
    const w = await makeWorld();
    expect(await w.useCases.removeMember.execute(w.owner, { userId: 'u-owner' })).toMatchObject({ code: 'LAST_OWNER' });
    expect(await w.useCases.changeRole.execute(w.owner, { userId: 'u-owner', role: 'EMPLOYEE' })).toMatchObject({ code: 'LAST_OWNER' });
    unwrap(await w.useCases.changeRole.execute(w.owner, { userId: 'u-fin', role: 'OWNER' }));
    unwrap(await w.useCases.changeRole.execute(w.owner, { userId: 'u-owner', role: 'FINANCE_MANAGER' }));
    expect(w.uow.auditEntries(w.owner.companyId).filter((a) => a.action === 'member.roleChanged')).toHaveLength(2);
  });

  it('EMPLOYEE and FINANCE_MANAGER are refused on members management', async () => {
    const w = await makeWorld();
    for (const actor of [w.employee, w.finance]) {
      expect(await w.useCases.listMembers.execute(actor)).toMatchObject({ ok: false, code: 'FORBIDDEN' });
      expect(await w.useCases.addMember.execute(actor, { email: 'autre@test.tn', role: 'OWNER' })).toMatchObject({ code: 'FORBIDDEN' });
      expect(await w.useCases.removeMember.execute(actor, { userId: 'u-emp' })).toMatchObject({ code: 'FORBIDDEN' });
    }
  });

  it('AddMember: unknown email, duplicates, removal', async () => {
    const w = await makeWorld();
    expect(await w.useCases.addMember.execute(w.owner, { email: 'x@y.tn', role: 'EMPLOYEE' })).toMatchObject({ code: 'USER_NOT_FOUND' });
    expect(await w.useCases.addMember.execute(w.owner, { email: 'COLLAB@test.tn', role: 'EMPLOYEE' })).toMatchObject({ code: 'ALREADY_MEMBER' });
    unwrap(await w.useCases.removeMember.execute(w.owner, { userId: 'u-emp' }));
    const members = unwrap(await w.useCases.listMembers.execute(w.owner));
    expect(members.map((m) => m.role).sort()).toEqual(['FINANCE_MANAGER', 'OWNER']);
  });

  it('UpdateCompanySettings is owner-only and audited with before/after', async () => {
    const w = await makeWorld();
    expect(await w.useCases.updateCompanySettings.execute(w.finance, { name: 'X', sector: 'RETAIL', stampDutyMillimes: 0 })).toMatchObject({
      code: 'FORBIDDEN',
    });
    const c = unwrap(await w.useCases.updateCompanySettings.execute(w.owner, { name: 'Atlas SARL', sector: 'DIGITAL_AGENCY', stampDutyMillimes: 1000 }));
    expect(c).toMatchObject({ name: 'Atlas SARL', stampDutyMillimes: 1000, slug: 'atlas' });
    const entry = w.uow.auditEntries(w.owner.companyId).find((a) => a.action === 'company.updated');
    expect(entry?.before).toMatchObject({ name: 'Atlas' });
    expect(entry?.after).toMatchObject({ name: 'Atlas SARL' });
  });
});
