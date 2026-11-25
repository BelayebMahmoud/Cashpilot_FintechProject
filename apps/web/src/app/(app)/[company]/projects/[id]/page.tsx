import type { Metadata } from 'next';
import Link from 'next/link';
import { FilePlus2 } from 'lucide-react';
import { can, EXPENSE_CATEGORY_LABELS } from '@cashpilot/domain';
import {
  Amount,
  Badge,
  Button,
  Card,
  PageHeader,
  StatList,
  StatusBadge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@cashpilot/ui';
import { formatDate, formatPercentBp } from '@cashpilot/ui/format';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { CloseProjectButton, MilestoneDialog, ProjectDialog, RemoveMilestoneButton } from '@/features/projects/components';
import { routes } from '@/lib/routes';
import { getActor } from '@/lib/session';
import { todayIso } from '@/lib/today';

export const metadata: Metadata = { title: 'Projet' };

export default async function ProjectPage({ params }: PageProps<'/[company]/projects/[id]'>) {
  const { company, id } = await params;
  const actor = await getActor(company);
  const { useCases } = await container();
  const [r, clients] = await Promise.all([
    useCases.getProject.execute(actor, { id }),
    useCases.listParties.execute(actor, { kind: 'CLIENT', page: 1, pageSize: 1000 }),
  ]);
  if (!r.ok) return <Denied code={r.code} />;
  const p = r.value;
  const canWrite = can(actor, 'project.write') && p.status === 'ACTIVE';
  const canInvoice = can(actor, 'invoice.write') && p.status === 'ACTIVE';
  const today = todayIso();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        breadcrumb={
          <Link href={routes.projects(company)} className="hover:underline">
            Projets
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-2">
            {p.name} <Badge tone={p.status === 'ACTIVE' ? 'info' : 'neutral'}>{p.status === 'ACTIVE' ? 'En cours' : 'Clôturé'}</Badge>
          </span>
        }
        description={
          <>
            <Link href={routes.client(company, p.clientId)} className="hover:underline">
              {p.clientName}
            </Link>{' '}
            · du {formatDate(p.startDate)}
            {p.endDate ? ` au ${formatDate(p.endDate)}` : ''}
          </>
        }
        actions={
          canWrite && (
            <>
              {clients.ok && <ProjectDialog company={company} clients={clients.value.items.map((c) => ({ id: c.id, name: c.name }))} today={today} project={p} />}
              <CloseProjectButton company={company} id={p.id} name={p.name} />
            </>
          )
        }
      />
      <Card>
        <StatList
          items={[
            { label: 'Budget HT', value: p.budgetMillimes },
            { label: 'Facturé HT', value: p.invoicedHTMillimes },
            { label: 'Dépenses engagées', value: p.expensesMillimes },
            { label: `Marge (${formatPercentBp(p.marginRateBp)})`, value: p.marginMillimes, tone: 'balance' },
          ]}
        />
      </Card>

      <Card className="gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Jalons de paiement</h2>
            <p className="text-sm text-muted-foreground">
              Non facturés : <Amount value={p.pendingMilestonesMillimes} /> attendus, inclus dans la prévision.
            </p>
          </div>
          {canWrite && <MilestoneDialog company={company} projectId={p.id} today={today} />}
        </div>
        {p.milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun jalon.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {p.milestones.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground">Attendu le {formatDate(m.expectedDate)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Amount value={m.amountMillimes} />
                  {m.invoiceId ? (
                    <Link href={routes.invoice(company, m.invoiceId)}>
                      <Badge tone="success">Facturé</Badge>
                    </Link>
                  ) : (
                    <>
                      {canInvoice && (
                        <Button size="sm" variant="secondary" asChild>
                          <Link href={routes.newInvoice(company, { project: p.id, milestone: m.id })}>
                            <FilePlus2 /> Facturer ce jalon
                          </Link>
                        </Button>
                      )}
                      {canWrite && <RemoveMilestoneButton company={company} projectId={p.id} milestoneId={m.id} label={m.label} amountMillimes={m.amountMillimes} />}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="gap-0 p-0">
          <h2 className="p-5 pb-2 font-semibold">Factures ({p.invoices.length})</h2>
          <Table>
            <TableCaption>Factures du projet</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead numeric>Total</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.invoices.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link href={routes.invoice(company, i.id)} className="font-mono text-xs whitespace-nowrap text-primary hover:underline">
                      {i.number ?? 'Brouillon'}
                    </Link>
                  </TableCell>
                  <TableCell numeric>
                    <Amount value={i.totalMillimes} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="invoice" status={i.status} settlement={i.settlement} overdue={i.overdue} daysOverdue={i.daysOverdue} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Card className="gap-0 p-0">
          <h2 className="p-5 pb-2 font-semibold">Dépenses ({p.expenses.length})</h2>
          <Table>
            <TableCaption>Dépenses du projet</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Libellé</TableHead>
                <TableHead numeric>Montant</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link href={routes.expense(company, e.id)} className="text-primary hover:underline">
                      {e.label}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{EXPENSE_CATEGORY_LABELS[e.category]}</span>
                  </TableCell>
                  <TableCell numeric>
                    <Amount value={e.amountMillimes} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="expense" status={e.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
