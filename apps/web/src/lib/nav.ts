import { can, type Permission, type Role } from '@cashpilot/domain';

/** Sidebar configuration. Items are filtered by role (the UI hides; the use cases enforce). */
export type NavIcon =
  | 'dashboard'
  | 'forecast'
  | 'simulation'
  | 'alerts'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'approvals'
  | 'treasury'
  | 'clients'
  | 'suppliers'
  | 'projects'
  | 'members'
  | 'settings'
  | 'audit'
  | 'mine'
  | 'new';

export interface NavItem {
  label: string;
  path: string; // relative to /[company]
  icon: NavIcon;
  permission: Permission;
  /** Extra predicate (e.g. finance-only views). */
  roles?: Role[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: 'Pilotage',
    items: [
      { label: 'Tableau de bord', path: 'dashboard', icon: 'dashboard', permission: 'dashboard.read' },
      { label: 'Prévisions', path: 'forecast', icon: 'forecast', permission: 'forecast.read' },
      { label: 'Simulations', path: 'simulations', icon: 'simulation', permission: 'simulation.use' },
      { label: 'Alertes', path: 'alerts', icon: 'alerts', permission: 'alerts.read' },
    ],
  },
  {
    label: 'Opérations',
    items: [
      { label: 'Factures', path: 'invoices', icon: 'invoices', permission: 'invoice.read' },
      { label: 'Encaissements', path: 'payments', icon: 'payments', permission: 'invoice.read' },
      { label: 'Dépenses', path: 'expenses', icon: 'expenses', permission: 'expense.readAll' },
      { label: 'À valider', path: 'expenses/approvals', icon: 'approvals', permission: 'expense.approve' },
      { label: 'Trésorerie', path: 'treasury', icon: 'treasury', permission: 'treasury.read' },
    ],
  },
  {
    label: 'Mes dépenses',
    items: [
      { label: 'Mes dépenses', path: 'expenses/mine', icon: 'mine', permission: 'expense.submit' },
      { label: 'Nouvelle dépense', path: 'expenses/new', icon: 'new', permission: 'expense.submit' },
    ],
  },
  {
    label: 'Tiers',
    items: [
      { label: 'Clients', path: 'clients', icon: 'clients', permission: 'party.read' },
      { label: 'Fournisseurs', path: 'suppliers', icon: 'suppliers', permission: 'party.read' },
      { label: 'Projets', path: 'projects', icon: 'projects', permission: 'project.read' },
    ],
  },
  {
    label: 'Entreprise',
    items: [
      { label: 'Membres', path: 'settings/members', icon: 'members', permission: 'members.manage' },
      { label: 'Paramètres', path: 'settings', icon: 'settings', permission: 'company.settings' },
      { label: 'Journal', path: 'settings/audit', icon: 'audit', permission: 'audit.read' },
    ],
  },
];

export function navFor(role: Role): NavGroup[] {
  const subject = { userId: '', companyId: '', role };
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => can(subject, i.permission) && (!i.roles || i.roles.includes(role))) })).filter(
    (g) => g.items.length > 0,
  );
}

/** Home page per role: the collaborator lands on "Mes dépenses", not the dashboard. */
export function homePathFor(role: Role): string {
  return role === 'EMPLOYEE' ? 'expenses/mine' : 'dashboard';
}
