import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can } from '@cashpilot/domain';
import { PageHeader } from '@cashpilot/ui';
import { formatMoneyInput, formatQuantity } from '@cashpilot/ui/format';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { InvoiceEditor } from '@/features/invoices/invoice-editor';
import { routes } from '@/lib/routes';
import { getActor } from '@/lib/session';
import { todayIso } from '@/lib/today';

export const metadata: Metadata = { title: 'Modifier le brouillon' };

export default async function EditInvoicePage({ params }: PageProps<'/[company]/invoices/[id]/edit'>) {
  const { company, id } = await params;
  const actor = await getActor(company);
  if (!can(actor, 'invoice.write')) return <Denied code="FORBIDDEN" />;
  const { useCases } = await container();
  const [invoice, clients, companyDto, projects] = await Promise.all([
    useCases.getInvoice.execute(actor, { id }),
    useCases.listParties.execute(actor, { kind: 'CLIENT', page: 1, pageSize: 1000 }),
    useCases.getCompany.execute(actor),
    useCases.listProjects.execute(actor, { status: 'ACTIVE' }),
  ]);
  if (!invoice.ok) return <Denied code={invoice.code} />;
  if (invoice.value.status !== 'DRAFT') redirect(routes.invoice(company, id)); // issued invoices are locked
  if (!clients.ok || !companyDto.ok) return <Denied code="NOT_FOUND" />;
  const inv = invoice.value;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        breadcrumb={
          <Link href={routes.invoice(company, id)} className="hover:underline">
            Brouillon — {inv.clientName}
          </Link>
        }
        title="Modifier le brouillon"
      />
      <InvoiceEditor
        company={company}
        clients={clients.value.items.map((c) => ({ id: c.id, name: c.name }))}
        projects={projects.ok ? projects.value.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId })) : []}
        stampDutyMillimes={inv.stampDutyMillimes}
        today={todayIso()}
        initial={{
          id: inv.id,
          clientId: inv.clientId,
          issueDate: inv.issueDate,
          dueDate: inv.dueDate,
          notes: inv.notes,
          projectId: inv.projectId,
          lines: inv.lines.map((l) => ({
            key: l.id,
            description: l.description,
            quantity: formatQuantity(l.qtyHundredths),
            unitPrice: formatMoneyInput(l.unitMillimes),
            vatRateBp: l.vatRateBp,
          })),
        }}
      />
    </div>
  );
}
