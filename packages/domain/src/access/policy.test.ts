import { describe, expect, it } from 'vitest';
import { Forbidden } from '../shared/errors';
import { assertCan, can, type Permission, type Role } from './policy';

const actor = (role: Role, userId = 'u1') => ({ userId, companyId: 'c1', role });

/** The full matrix from the cadrage: every role × every permission. */
const EXPECTED: Record<Permission, Role[]> = {
  'company.settings': ['OWNER'],
  'members.manage': ['OWNER'],
  'dashboard.read': ['OWNER', 'FINANCE_MANAGER'],
  'treasury.read': ['OWNER', 'FINANCE_MANAGER'],
  'forecast.read': ['OWNER', 'FINANCE_MANAGER'],
  'simulation.use': ['OWNER', 'FINANCE_MANAGER'],
  'alerts.read': ['OWNER', 'FINANCE_MANAGER'],
  'party.read': ['OWNER', 'FINANCE_MANAGER'],
  'party.write': ['FINANCE_MANAGER'],
  'invoice.read': ['OWNER', 'FINANCE_MANAGER'],
  'invoice.write': ['FINANCE_MANAGER'],
  'payment.record': ['FINANCE_MANAGER'],
  'payment.reverse': ['FINANCE_MANAGER'],
  'expense.submit': ['OWNER', 'FINANCE_MANAGER', 'EMPLOYEE'],
  'expense.read': ['OWNER', 'FINANCE_MANAGER', 'EMPLOYEE'],
  'expense.readAll': ['OWNER', 'FINANCE_MANAGER'],
  'expense.approve': ['OWNER'],
  'expense.pay': ['FINANCE_MANAGER'],
  'ledger.adjust': ['FINANCE_MANAGER'],
  'plannedFlow.write': ['FINANCE_MANAGER'],
  'audit.read': ['OWNER', 'FINANCE_MANAGER'],
  'project.read': ['OWNER', 'FINANCE_MANAGER'],
  'project.write': ['FINANCE_MANAGER'],
};

const ROLES: Role[] = ['OWNER', 'FINANCE_MANAGER', 'EMPLOYEE'];

describe('permission matrix', () => {
  for (const [permission, allowed] of Object.entries(EXPECTED) as [Permission, Role[]][]) {
    for (const role of ROLES) {
      const expected = allowed.includes(role);
      it(`${role} ${expected ? 'can' : 'cannot'} ${permission}`, () => {
        expect(can(actor(role), permission)).toBe(expected);
      });
    }
  }
});

describe('ownership rules', () => {
  const ownExpense = { ownerUserId: 'u1' };
  const othersExpense = { ownerUserId: 'u2' };

  it('EMPLOYEE cannot read others\' expenses but can read their own', () => {
    expect(can(actor('EMPLOYEE'), 'expense.read', ownExpense)).toBe(true);
    expect(can(actor('EMPLOYEE'), 'expense.read', othersExpense)).toBe(false);
  });

  it('OWNER and FINANCE_MANAGER read every expense', () => {
    expect(can(actor('OWNER'), 'expense.read', othersExpense)).toBe(true);
    expect(can(actor('FINANCE_MANAGER'), 'expense.read', othersExpense)).toBe(true);
  });

  it('only the submitter edits / submits / withdraws an expense', () => {
    expect(can(actor('OWNER'), 'expense.submit', othersExpense)).toBe(false);
    expect(can(actor('EMPLOYEE'), 'expense.submit', ownExpense)).toBe(true);
  });

  it('OWNER may approve their own expense (flagged selfApproved by the entity)', () => {
    expect(can(actor('OWNER'), 'expense.approve', ownExpense)).toBe(true);
  });

  it('assertCan throws Forbidden', () => {
    expect(() => assertCan(actor('EMPLOYEE'), 'invoice.read')).toThrow(Forbidden);
    expect(() => assertCan(actor('OWNER'), 'invoice.read')).not.toThrow();
  });
});
