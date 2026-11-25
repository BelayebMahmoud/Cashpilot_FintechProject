import { type Route } from 'next';

/** Central, typed route builders (typedRoutes is on): one place to change a URL. */
type Q = Record<string, string | number | undefined | null>;

function qs(query?: Q): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

const r = (path: string, query?: Q) => `${path}${qs(query)}` as Route;

export const routes = {
  home: () => r('/'),
  login: () => r('/login'),
  register: () => r('/register'),
  onboarding: () => r('/onboarding'),
  company: (c: string) => r(`/${c}`),
  dashboard: (c: string) => r(`/${c}/dashboard`),
  invoices: (c: string, q?: Q) => r(`/${c}/invoices`, q),
  newInvoice: (c: string, q?: Q) => r(`/${c}/invoices/new`, q),
  invoice: (c: string, id: string) => r(`/${c}/invoices/${id}`),
  editInvoice: (c: string, id: string) => r(`/${c}/invoices/${id}/edit`),
  invoicePdf: (c: string, id: string) => r(`/api/invoices/${id}/pdf`, { company: c }),
  payments: (c: string, q?: Q) => r(`/${c}/payments`, q),
  clients: (c: string, q?: Q) => r(`/${c}/clients`, q),
  client: (c: string, id: string) => r(`/${c}/clients/${id}`),
  suppliers: (c: string, q?: Q) => r(`/${c}/suppliers`, q),
  supplier: (c: string, id: string) => r(`/${c}/suppliers/${id}`),
  expenses: (c: string, q?: Q) => r(`/${c}/expenses`, q),
  myExpenses: (c: string, q?: Q) => r(`/${c}/expenses/mine`, q),
  newExpense: (c: string) => r(`/${c}/expenses/new`),
  approvals: (c: string, q?: Q) => r(`/${c}/expenses/approvals`, q),
  expense: (c: string, id: string) => r(`/${c}/expenses/${id}`),
  editExpense: (c: string, id: string) => r(`/${c}/expenses/${id}/edit`),
  receipt: (c: string, id: string) => r(`/api/expenses/${id}/receipt`, { company: c }),
  treasury: (c: string, q?: Q) => r(`/${c}/treasury`, q),
  forecast: (c: string, q?: Q) => r(`/${c}/forecast`, q),
  plannedFlows: (c: string) => r(`/${c}/forecast/planned`),
  simulations: (c: string) => r(`/${c}/simulations`),
  newSimulation: (c: string) => r(`/${c}/simulations/new`),
  simulation: (c: string, id: string) => r(`/${c}/simulations/${id}`),
  alerts: (c: string) => r(`/${c}/alerts`),
  projects: (c: string) => r(`/${c}/projects`),
  project: (c: string, id: string) => r(`/${c}/projects/${id}`),
  settings: (c: string) => r(`/${c}/settings`),
  members: (c: string) => r(`/${c}/settings/members`),
  audit: (c: string, q?: Q) => r(`/${c}/settings/audit`, q),
};

/** Builds a URL that keeps the current search params and overrides some. */
export function withParams(path: string, current: Record<string, string | undefined>, patch: Q): Route {
  const merged: Q = { ...current, ...patch };
  return r(path, merged);
}
