import { Forbidden } from '../shared/errors';

export const ROLES = ['OWNER', 'FINANCE_MANAGER', 'EMPLOYEE'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Dirigeant',
  FINANCE_MANAGER: 'Gestionnaire financier',
  EMPLOYEE: 'Collaborateur',
};

export type Permission =
  | 'company.settings'
  | 'members.manage'
  | 'dashboard.read'
  | 'treasury.read'
  | 'forecast.read'
  | 'simulation.use'
  | 'alerts.read'
  | 'party.read'
  | 'party.write'
  | 'invoice.read'
  | 'invoice.write'
  | 'payment.record'
  | 'payment.reverse'
  | 'expense.submit'
  | 'expense.read'
  | 'expense.readAll'
  | 'expense.approve'
  | 'expense.pay'
  | 'ledger.adjust'
  | 'plannedFlow.write'
  | 'audit.read'
  | 'project.read'
  | 'project.write';

/** Who is acting. The application's Actor satisfies this shape. */
export interface AccessSubject {
  readonly userId: string;
  readonly companyId: string;
  readonly role: Role;
}

/** A resource owned by a user (e.g. an expense owned by its submitter). */
export interface OwnedResource {
  readonly ownerUserId: string;
}

const READ_PILOTAGE: Permission[] = [
  'dashboard.read',
  'treasury.read',
  'forecast.read',
  'simulation.use',
  'alerts.read',
  'party.read',
  'invoice.read',
  'expense.readAll',
  'audit.read',
  'project.read',
];

/** The permission matrix from the cadrage (finance-domain skill §2). */
export const PERMISSION_MATRIX: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set<Permission>([
    'company.settings',
    'members.manage',
    ...READ_PILOTAGE,
    'expense.submit',
    'expense.read',
    'expense.approve',
  ]),
  FINANCE_MANAGER: new Set<Permission>([
    ...READ_PILOTAGE,
    'party.write',
    'invoice.write',
    'payment.record',
    'payment.reverse',
    'expense.submit',
    'expense.read',
    'expense.pay',
    'ledger.adjust',
    'plannedFlow.write',
    'project.write',
  ]),
  EMPLOYEE: new Set<Permission>(['expense.submit', 'expense.read']),
};

/** Permissions that, for a role without `expense.readAll`, only apply to the actor's own resources. */
const OWN_ONLY: ReadonlySet<Permission> = new Set(['expense.read', 'expense.submit']);

/**
 * Pure authorization policy. The UI may call it to hide buttons,
 * but only the use cases enforce it (via `assertCan`).
 *
 * - `expense.read` on a resource: allowed for roles with `expense.readAll`, otherwise only own.
 * - `expense.submit` on a resource (edit/submit/withdraw): only the submitter.
 * - `expense.approve`: OWNER, including their own expense (flagged `selfApproved` and audited),
 *   so a single-owner company is never blocked.
 */
export function can(actor: AccessSubject, permission: Permission, resource?: OwnedResource): boolean {
  const granted = PERMISSION_MATRIX[actor.role];
  if (!granted.has(permission)) return false;
  if (!resource || !OWN_ONLY.has(permission)) return true;
  const isOwner = resource.ownerUserId === actor.userId;
  if (permission === 'expense.read') return isOwner || granted.has('expense.readAll');
  return isOwner; // expense.submit: only the submitter edits/submits/withdraws
}

export function assertCan(actor: AccessSubject, permission: Permission, resource?: OwnedResource): void {
  if (!can(actor, permission, resource)) throw new Forbidden(`${actor.role} cannot ${permission}`);
}
