import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { INVOICE_TABS, type InvoiceTab } from '@cashpilot/application';
import { can } from '@cashpilot/domain';
import {
  Amount,
  Button,
  Card,
  cn,
  EmptyState,
  PageHeader,
  Pagination,
  StatusBadge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@cashpilot/ui';
import { formatDate, formatRelativeDue } from '@cashpilot/ui/format';
import { Denied } from '@/components/denied';
import { FilterBar } from '@/components/filter-bar';
import { AppLink } from '@/components/forms';
import { container } from '@/container';
import { routes } from '@/lib/routes';
import { isoDate, oneOf, pageParam, sp } from '@/lib/search-params';
import { getActor } from '@/lib/session';
import { todayIso } from '@/lib/today';

export const metadata: Metadata = { title: 'Factures' };

const TAB_LABELS: Record<InvoiceTab, string> = {
  all: 'Toutes',
  draft: 'Brouillons',
  receivable: 'À encaisser',
  overdue: 'En retard',
  paid: 'Payées',
  cancelled: 'Annulées',
};

export default async function InvoicesPage({ params, searchParams }: PageProps<'/[company]/invoices'>) {
  const [{ company }, raw] = await Promise.all([params, searchParams]);
  const search = sp(raw);
  const actor = await getActor(company);
  const { useCases } = await container();
  const tab = oneOf(search.tab, INVOICE_TABS, 'all');
  const [list, clients] = await Promise.all([
    useCases.listInvoices.execute(actor, {
      tab,
      q: search.q,
      clientId: search.client,
      dueFrom: isoDate(search.from),
      dueTo: isoDate(search.to),
      page: pageParam(search.page),
    }),
    useCases.listParties.execute(actor, { kind: 'CLIENT', page: 1, pageSize: 1000, includeArchived: true }),
  ]);
  if (!list.ok) return <Denied code={list.code} />;
  const today = todayIso();
  const canWrite = can(actor, 'invoice.write');
  const filtered = !!(search.q || search.client || search.from || search.to);
  const { items, counts } = list.value;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Factures"
        description="Suivez les échéances et les montants restant à encaisser"
        actions={
          canWrite && (
            <Button asChild>
              <Link href={routes.newInvoice(company)}>
                <Plus strokeWidth={1.5} /> Nouvelle facture
              </Link>
            </Button>
          )
        }
      />
      <Card className="min-w-0 gap-0 rounded-xl p-0">
        <nav aria-label="Filtrer par statut" className="overflow-x-auto border-b px-3">
          <ul className="flex w-max gap-1">
            {INVOICE_TABS.map((t) => (
              <li key={t}>
                <Link
                  href={routes.invoices(company, { ...search, tab: t === 'all' ? undefined : t, page: undefined })}
                  aria-current={tab === t ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-11 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                    tab === t && 'border-b-primary text-foreground',
                    t === 'overdue' && counts.overdue > 0 && 'text-danger-foreground',
                  )}
                >
                  {TAB_LABELS[t]} <span className="font-mono text-xs tabular-nums">{counts[t]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <FilterBar
          className="gap-3 p-4 [&_input[type=date]]:min-w-0"
          searchPlaceholder="N° de facture ou client"
          keep={['tab']}
          selects={[{ name: 'client', label: 'Client', options: clients.ok ? clients.value.items.map((c) => ({ value: c.id, label: c.name })) : [] }]}
          dateRange={{ from: 'from', to: 'to', label: 'Échéance' }}
        />
      </Card>

      {items.length === 0 ? (
        filtered || tab !== 'all' ? (
          <EmptyState variant="no-results" title="Aucun résultat pour ces filtres" description="Changez d'onglet ou réinitialisez les filtres." />
        ) : (
          <EmptyState
            icon={<FileText />}
            title="Aucune facture pour l'instant"
            description="Créez votre première facture pour suivre vos encaissements."
            action={
              canWrite && (
                <Button asChild>
                  <Link href={routes.newInvoice(company)}>
                    <Plus /> Créer une facture
                  </Link>
                </Button>
              )
            }
          />
        )
      ) : (
        <>
          <Card className="hidden min-w-0 gap-0 overflow-hidden rounded-xl p-0 lg:flex">
            <Table>
              <TableCaption>Factures — {TAB_LABELS[tab]}</TableCaption>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead numeric>Total</TableHead>
                  <TableHead numeric>Reste à payer</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id} className="h-12 focus-within:bg-accent/50">
                    <TableCell>
                      <Link href={routes.invoice(company, i.id)} className={cn('font-mono text-xs whitespace-nowrap text-primary hover:underline', i.status === 'CANCELLED' && 'line-through')}>
                        {i.number ?? 'Brouillon'}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-56 truncate font-medium">{i.clientName}</TableCell>
                    <TableCell className={cn(i.overdue && 'text-danger-foreground')}>
                      {i.status === 'ISSUED' && i.remainingMillimes > 0 ? (
                        <span title={formatDate(i.dueDate)}>{formatRelativeDue(i.dueDate, today)}</span>
                      ) : (
                        formatDate(i.dueDate)
                      )}
                    </TableCell>
                    <TableCell numeric>
                      <Amount value={i.totalMillimes} className="font-mono text-muted-foreground" />
                    </TableCell>
                    <TableCell numeric>
                      <Amount value={i.remainingMillimes} className={cn("font-mono", i.remainingMillimes > 0 ? "font-medium" : "text-muted-foreground")} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="invoice" status={i.status} settlement={i.settlement} overdue={i.overdue} daysOverdue={i.daysOverdue} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <ul className="space-y-3 lg:hidden">
            {items.map((i) => (
              <li key={i.id}>
                <Link href={routes.invoice(company, i.id)} className="block rounded-lg border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{i.clientName}</p>
                      <p className="font-mono text-xs text-muted-foreground">{i.number ?? 'Brouillon'}</p>
                    </div>
                    <StatusBadge kind="invoice" status={i.status} settlement={i.settlement} overdue={i.overdue} daysOverdue={i.daysOverdue} />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3 border-t pt-3">
                    <span className={cn('text-xs text-muted-foreground', i.overdue && 'text-danger-foreground')}>
                      {i.status === 'ISSUED' && i.remainingMillimes > 0 ? formatRelativeDue(i.dueDate, today) : formatDate(i.dueDate)}
                    </span>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Reste à payer</p>
                      <Amount value={i.remainingMillimes} size="md" className="font-mono font-medium" />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <Pagination
        page={list.value.page}
        pageSize={list.value.pageSize}
        total={list.value.total}
        hrefFor={(page) => routes.invoices(company, { ...search, page })}
        linkAs={AppLink}
      />
    </div>
  );
}
