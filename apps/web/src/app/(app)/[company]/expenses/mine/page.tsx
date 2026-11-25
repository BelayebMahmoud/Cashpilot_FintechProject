import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, ReceiptText } from 'lucide-react';
import { EXPENSE_CATEGORY_LABELS } from '@cashpilot/domain';
import { Alert, AlertDescription, Amount, Button, EmptyState, PageHeader, Pagination, StatusBadge } from '@cashpilot/ui';
import { formatDate } from '@cashpilot/ui/format';
import { CircleCheck } from 'lucide-react';
import { Denied } from '@/components/denied';
import { AppLink } from '@/components/forms';
import { container } from '@/container';
import { ExpenseTimeline } from '@/features/expenses/expense-timeline';
import { routes } from '@/lib/routes';
import { pageParam, sp } from '@/lib/search-params';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Mes dépenses' };

/** The collaborator's home: their own requests as cards with a status timeline. */
export default async function MyExpensesPage({ params, searchParams }: PageProps<'/[company]/expenses/mine'>) {
  const [{ company }, raw] = await Promise.all([params, searchParams]);
  const search = sp(raw);
  const actor = await getActor(company);
  const { useCases } = await container();
  const r = await useCases.listExpenses.execute(actor, { scope: 'mine', page: pageParam(search.page) });
  if (!r.ok) return <Denied code={r.code} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Mes dépenses"
        description="Vos demandes de remboursement et leur avancement."
        actions={
          <Button asChild size="lg">
            <Link href={routes.newExpense(company)}>
              <Plus /> Nouvelle dépense
            </Link>
          </Button>
        }
      />
      {search.created && (
        <Alert tone="success">
          <CircleCheck />
          <AlertDescription>{search.created === 'draft' ? 'Brouillon enregistré.' : 'Dépense soumise : le dirigeant va la valider.'}</AlertDescription>
        </Alert>
      )}
      {r.value.total === 0 ? (
        <EmptyState
          icon={<ReceiptText />}
          title="Aucune dépense pour l'instant"
          description="Photographiez un justificatif et soumettez votre première dépense en quelques secondes."
          action={
            <Button asChild>
              <Link href={routes.newExpense(company)}>Nouvelle dépense</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {r.value.items.map((e) => (
            <li key={e.id}>
              <article className="space-y-4 rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={routes.expense(company, e.id)} className="block truncate font-medium hover:underline">
                      {e.label}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {EXPENSE_CATEGORY_LABELS[e.category]} · {formatDate(e.expenseDate)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Amount value={e.amountMillimes} size="md" />
                    <StatusBadge kind="expense" status={e.status} />
                  </div>
                </div>
                <ExpenseTimeline e={e} />
              </article>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={r.value.page} pageSize={r.value.pageSize} total={r.value.total} hrefFor={(page) => routes.myExpenses(company, { page })} linkAs={AppLink} />
    </div>
  );
}
