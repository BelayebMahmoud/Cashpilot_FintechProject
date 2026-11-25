import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, ReceiptText } from 'lucide-react';
import { EXPENSE_TABS, type ExpenseTab } from '@cashpilot/application';
import { can, EXPENSE_CATEGORY_LABELS } from '@cashpilot/domain';
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
import { MarkPaidDialog } from '@/features/expenses/expense-actions';
import { routes } from '@/lib/routes';
import { oneOf, pageParam, sp } from '@/lib/search-params';
import { getActor } from '@/lib/session';
import { todayIso } from '@/lib/today';

export const metadata: Metadata = { title: 'Dépenses' };

const TAB_LABELS: Record<ExpenseTab, string> = {
  all: 'Toutes',
  draft: 'Brouillons',
  submitted: 'À valider',
  toPay: 'À payer',
  paid: 'Payées',
  rejected: 'Refusées',
};

/** Finance view of every expense; the "À payer" tab offers "Marquer comme payée". */
export default async function ExpensesPage({ params, searchParams }: PageProps<'/[company]/expenses'>) {
  const [{ company }, raw] = await Promise.all([params, searchParams]);
  const search = sp(raw);
  const actor = await getActor(company);
  if (!can(actor, 'expense.readAll')) return <Denied code="FORBIDDEN" />;
  const { useCases } = await container();
  const tab = oneOf(search.tab, EXPENSE_TABS, 'all');
  const r = await useCases.listExpenses.execute(actor, { scope: 'all', tab, q: search.q, page: pageParam(search.page) });
  if (!r.ok) return <Denied code={r.code} />;
  const today = todayIso();
  const canPay = can(actor, 'expense.pay');
  const { items, counts } = r.value;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Dépenses"
        description="Toutes les dépenses de l'entreprise, de la soumission au paiement."
        actions={
          <Button asChild>
            <Link href={routes.newExpense(company)}>
              <Plus /> Nouvelle dépense
            </Link>
          </Button>
        }
      />
      <nav aria-label="Filtrer par statut" className="-mx-1 overflow-x-auto">
        <ul className="flex w-max gap-1 rounded-lg bg-muted p-1">
          {EXPENSE_TABS.map((t) => (
            <li key={t}>
              <Link
                href={routes.expenses(company, { ...search, tab: t === 'all' ? undefined : t, page: undefined })}
                aria-current={tab === t ? 'page' : undefined}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                  tab === t && 'bg-card text-foreground shadow-sm',
                )}
              >
                {TAB_LABELS[t]} <span className="tabular-nums opacity-70">{counts[t]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <FilterBar searchPlaceholder="Libellé, personne, fournisseur…" keep={['tab']} />
      {items.length === 0 ? (
        search.q || tab !== 'all' ? (
          <EmptyState variant="no-results" title="Aucun résultat pour ces filtres" description="Changez d'onglet ou réinitialisez la recherche." />
        ) : (
          <EmptyState icon={<ReceiptText />} title="Aucune dépense pour l'instant" description="Les dépenses soumises par l'équipe apparaîtront ici." />
        )
      ) : (
        <>
          <Card className="hidden gap-0 p-0 md:flex">
            <Table>
              <TableCaption>Dépenses — {TAB_LABELS[tab]}</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Libellé</TableHead>
                  <TableHead>Soumise par</TableHead>
                  <TableHead className="hidden lg:table-cell">Catégorie</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead numeric>Montant</TableHead>
                  <TableHead>Statut</TableHead>
                  {canPay && tab === 'toPay' && (
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="max-w-64">
                      <Link href={routes.expense(company, e.id)} className="block truncate text-primary hover:underline">
                        {e.label}
                      </Link>
                      {e.supplierName && <span className="block truncate text-xs text-muted-foreground">{e.supplierName}</span>}
                    </TableCell>
                    <TableCell>{e.submittedByName}</TableCell>
                    <TableCell className="hidden lg:table-cell">{EXPENSE_CATEGORY_LABELS[e.category]}</TableCell>
                    <TableCell>{e.status === 'APPROVED' ? formatRelativeDue(e.dueDate, today) : formatDate(e.dueDate)}</TableCell>
                    <TableCell numeric>
                      <Amount value={e.amountMillimes} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge kind="expense" status={e.status} />
                    </TableCell>
                    {canPay && tab === 'toPay' && (
                      <TableCell className="text-right">
                        <MarkPaidDialog company={company} expense={e} today={today} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <ul className="space-y-3 md:hidden">
            {items.map((e) => (
              <li key={e.id} className="space-y-3 rounded-lg border bg-card p-4">
                <Link href={routes.expense(company, e.id)} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{e.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {e.submittedByName} · {formatDate(e.expenseDate)}
                    </span>
                  </span>
                  <Amount value={e.amountMillimes} size="md" />
                </Link>
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge kind="expense" status={e.status} />
                  {canPay && e.status === 'APPROVED' && <MarkPaidDialog company={company} expense={e} today={today} />}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <Pagination page={r.value.page} pageSize={r.value.pageSize} total={r.value.total} hrefFor={(page) => routes.expenses(company, { ...search, page })} linkAs={AppLink} />
    </div>
  );
}
