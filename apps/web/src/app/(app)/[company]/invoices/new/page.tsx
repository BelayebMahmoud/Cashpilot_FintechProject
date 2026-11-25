import type { Metadata } from 'next';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { can } from '@cashpilot/domain';
import { Button, EmptyState, PageHeader } from '@cashpilot/ui';
import { formatMoneyInput } from '@cashpilot/ui/format';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { InvoiceEditor } from '@/features/invoices/invoice-editor';
import { routes } from '@/lib/routes';
import { sp } from '@/lib/search-params';
import { getActor } from '@/lib/session';
import { todayIso } from '@/lib/today';

export const metadata: Metadata = { title: 'Nouvelle facture' };

export default async function NewInvoicePage({ params, searchParams }: PageProps<'/[company]/invoices/new'>) {
  const [{ company }, raw] = await Promise.all([params, searchParams]);
  const search = sp(raw);
  const actor = await getActor(company);
  if (!can(actor, 'invoice.write')) return <Denied code="FORBIDDEN" />;
  const { useCases } = await container();
  const [clients, companyDto, projects] = await Promise.all([
    useCases.listParties.execute(actor, { kind: 'CLIENT', page: 1, pageSize: 1000 }),
    useCases.getCompany.execute(actor),
    useCases.listProjects.execute(actor, { status: 'ACTIVE' }),
  ]);
  if (!clients.ok || !companyDto.ok) return <Denied code="NOT_FOUND" />;

  // sector feature: "Facturer ce jalon" from a project
  let milestone;
  if (search.project && search.milestone) {
    const p = await useCases.getProject.execute(actor, { id: search.project });
    const m = p.ok ? p.value.milestones.find((x) => x.id === search.milestone && !x.invoiceId) : undefined;
    if (p.ok && m) {
      milestone = { projectId: p.value.id, milestoneId: m.id, clientId: p.value.clientId, label: `${p.value.name} — ${m.label}`, amount: formatMoneyInput(m.amountMillimes) };
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        breadcrumb={
          <Link href={routes.invoices(company)} className="hover:underline">
            Factures
          </Link>
        }
        title="Nouvelle facture"
        description="Enregistrez un brouillon, puis validez-le pour lui attribuer son numéro."
      />
      {clients.value.total === 0 ? (
        <EmptyState
          icon={<Users />}
          title="Aucun client"
          description="Créez d'abord le client à facturer."
          action={
            <Button asChild>
              <Link href={routes.clients(company, { new: 1 })}>Créer un client</Link>
            </Button>
          }
        />
      ) : (
        <InvoiceEditor
          company={company}
          clients={clients.value.items.map((c) => ({ id: c.id, name: c.name }))}
          projects={projects.ok ? projects.value.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId })) : []}
          stampDutyMillimes={companyDto.value.stampDutyMillimes}
          today={todayIso()}
          {...(milestone ? { milestone } : {})}
        />
      )}
    </div>
  );
}
