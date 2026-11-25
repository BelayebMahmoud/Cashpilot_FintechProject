import { describe, expect, it } from 'vitest';
import { Party } from '../party/party';
import { computeProfitability, Project } from '../project/project';
import { DomainError } from '../shared/errors';
import { LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';
import { Company, slugify } from './company';
import { Membership } from './membership';

const today = LocalDate.parse('2026-12-01');

describe('Company', () => {
  const input = { name: ' Atlas Digital ', slug: 'atlas-digital', sector: 'DIGITAL_AGENCY' as const, openingBalance: Money.dinars(5000), openingDate: today };

  it('creates with trimmed name and zero stamp duty', () => {
    const c = Company.create('c1', input, today);
    expect(c.name).toBe('Atlas Digital');
    expect(c.stampDuty.isZero()).toBe(true);
    c.updateSettings({ name: 'Atlas', sector: 'SERVICES', stampDuty: Money.parse('1') });
    expect(c.snapshot()).toMatchObject({ name: 'Atlas', sector: 'SERVICES' });
  });

  it('refuses invalid names, slugs and future opening dates', () => {
    expect(() => Company.create('c', { ...input, name: 'A' }, today)).toThrow(DomainError);
    expect(() => Company.create('c', { ...input, slug: 'Bad Slug' }, today)).toThrow(DomainError);
    expect(() => Company.create('c', { ...input, openingDate: today.addDays(1) }, today)).toThrow(DomainError);
    const c = Company.create('c1', input, today);
    expect(() => c.updateSettings({ name: 'ok', sector: 'RETAIL', stampDuty: Money.dinars(-1) })).toThrow(DomainError);
  });

  it('slugifies names', () => {
    expect(slugify('Atlas Digital SARL')).toBe('atlas-digital-sarl');
    expect(slugify('  Société Générale d’Études ')).toBe('societe-generale-d-etudes');
  });
});

describe('Membership', () => {
  it('last owner cannot be removed or demoted', () => {
    const owner = Membership.create({ userId: 'u1', companyId: 'c1', role: 'OWNER' });
    expect(() => owner.changeRole('EMPLOYEE', 0)).toThrow(DomainError);
    expect(() => owner.assertRemovable(0)).toThrow(DomainError);
    owner.changeRole('FINANCE_MANAGER', 1);
    expect(owner.role).toBe('FINANCE_MANAGER');
    expect(() => owner.assertRemovable(0)).not.toThrow();
  });
});

describe('Party', () => {
  it('validates name, email and phone; normalises email and tax id', () => {
    const p = Party.create('p1', 'c1', 'CLIENT', { name: 'Client A', email: 'A@B.TN', phone: '+216 71 000 000', taxId: '1234567a/a/m/000' });
    expect(p.snapshot()).toMatchObject({ email: 'a@b.tn', taxId: '1234567A/A/M/000', archived: false });
    expect(() => Party.create('p', 'c1', 'CLIENT', { name: 'A' })).toThrow(DomainError);
    expect(() => Party.create('p', 'c1', 'CLIENT', { name: 'Ok', email: 'nope' })).toThrow(DomainError);
    expect(() => Party.create('p', 'c1', 'CLIENT', { name: 'Ok', phone: 'abc' })).toThrow(DomainError);
  });

  it('archived parties cannot be edited until unarchived', () => {
    const p = Party.create('p1', 'c1', 'SUPPLIER', { name: 'Fournisseur' });
    p.archive();
    expect(p.archived).toBe(true);
    expect(() => p.update({ name: 'Nouveau' })).toThrow(DomainError);
    p.unarchive();
    p.update({ name: 'Nouveau' });
    expect(p.name).toBe('Nouveau');
  });
});

describe('Project (sector: digital agency)', () => {
  const make = () =>
    Project.create('pr1', 'c1', { clientId: 'p1', name: 'Site e-commerce', budget: Money.dinars(10_000), startDate: today });

  it('milestones feed the forecast until invoiced', () => {
    const pr = make();
    pr.addMilestone({ id: 'm1', label: 'Acompte 30 %', amount: Money.dinars(3000), expectedDate: today.addDays(5) });
    pr.addMilestone({ id: 'm2', label: 'Livraison', amount: Money.dinars(7000), expectedDate: today.addDays(40) });
    expect(pr.pendingMilestones().map((m) => m.id)).toEqual(['m1', 'm2']);
    pr.markMilestoneInvoiced('m1', 'inv1');
    expect(pr.pendingMilestones().map((m) => m.id)).toEqual(['m2']);
    expect(() => pr.markMilestoneInvoiced('m1', 'inv2')).toThrow(DomainError);
    expect(() => pr.removeMilestone('m1')).toThrow(DomainError);
    pr.removeMilestone('m2');
    expect(pr.milestones).toHaveLength(1);
    pr.close();
    expect(pr.pendingMilestones()).toEqual([]);
    expect(() => pr.addMilestone({ id: 'm3', label: 'x', amount: Money.dinars(1), expectedDate: today })).toThrow(DomainError);
  });

  it('validates name, budget and dates', () => {
    expect(() => Project.create('p', 'c', { clientId: 'x', name: 'A', budget: Money.zero(), startDate: today })).toThrow(DomainError);
    expect(() => Project.create('p', 'c', { clientId: 'x', name: 'Ok', budget: Money.dinars(-1), startDate: today })).toThrow(DomainError);
    expect(() =>
      Project.create('p', 'c', { clientId: 'x', name: 'Ok', budget: Money.zero(), startDate: today, endDate: today.addDays(-1) }),
    ).toThrow(DomainError);
  });

  it('profitability: margin = invoiced HT − expenses', () => {
    const p = computeProfitability(Money.dinars(10_000), Money.dinars(8_000), Money.dinars(2_000));
    expect(p.margin.millimes).toBe(6_000_000);
    expect(p.marginRateBp).toBe(7500);
    expect(p.budgetConsumedBp).toBe(2000);
    expect(computeProfitability(Money.zero(), Money.zero(), Money.zero()).marginRateBp).toBeNull();
  });
});
