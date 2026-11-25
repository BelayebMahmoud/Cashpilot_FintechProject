import { notFound } from 'next/navigation';
import { can, ROLE_LABELS } from '@cashpilot/domain';
import { AppShell } from '@/components/shell/app-shell';
import { container } from '@/container';
import { navFor } from '@/lib/nav';
import { getActor, requireUser } from '@/lib/session';

/**
 * Company shell. Membership is checked HERE (defense in depth, after proxy.ts) and again
 * in every use case. A non-member gets the same 404 as an unknown company.
 */
export default async function CompanyLayout({ children, params }: LayoutProps<'/[company]'>) {
  const { company: slug } = await params;
  const [user, actor] = await Promise.all([requireUser(), getActor(slug)]);
  const { useCases } = await container();
  const [companies, company, alerts] = await Promise.all([
    useCases.listMyCompanies.execute(user.id),
    useCases.getCompany.execute(actor),
    can(actor, 'alerts.read') ? useCases.getAlerts.execute(actor) : Promise.resolve(null),
  ]);
  if (!company.ok || !companies.ok) notFound();

  const quickActions = [
    ...(can(actor, 'invoice.write') ? [{ label: 'Nouvelle facture', path: 'invoices/new' }] : []),
    ...(can(actor, 'expense.submit') ? [{ label: 'Nouvelle dépense', path: 'expenses/new' }] : []),
    ...(can(actor, 'party.write') ? [{ label: 'Nouveau client', path: 'clients?new=1' }] : []),
    ...(can(actor, 'simulation.use') ? [{ label: 'Nouvelle simulation', path: 'simulations/new' }] : []),
  ];

  return (
    <AppShell
      company={{ slug, name: company.value.name }}
      companies={companies.value.map((c) => ({ slug: c.slug, name: c.name, roleLabel: ROLE_LABELS[c.role] }))}
      user={{ name: user.name, email: user.email }}
      roleLabel={ROLE_LABELS[actor.role]}
      nav={navFor(actor.role)}
      alertCount={alerts?.ok ? alerts.value.length : 0}
      quickActions={quickActions}
    >
      {children}
    </AppShell>
  );
}
