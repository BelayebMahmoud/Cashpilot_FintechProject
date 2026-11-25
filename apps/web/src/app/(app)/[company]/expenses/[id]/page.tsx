import type { Metadata } from 'next';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { can, EXPENSE_CATEGORY_LABELS } from '@cashpilot/domain';
import { Amount, Badge, Button, Card, PageHeader, StatusBadge } from '@cashpilot/ui';
import { formatDate } from '@cashpilot/ui/format';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { ExpenseActions } from '@/features/expenses/expense-actions';
import { ReceiptPreview } from '@/features/expenses/approval-inbox';
import { ExpenseTimeline } from '@/features/expenses/expense-timeline';
import { routes } from '@/lib/routes';
import { getActor } from '@/lib/session';
import { todayIso } from '@/lib/today';

export const metadata: Metadata = { title: 'Dépense' };

export default async function ExpensePage({ params }: PageProps<'/[company]/expenses/[id]'>) {
  const { company, id } = await params;
  const actor = await getActor(company);
  const { useCases } = await container();
  const r = await useCases.getExpense.execute(actor, { id });
  if (!r.ok) return <Denied code={r.code} />;
  const e = r.value;
  const mine = e.submittedById === actor.userId;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        breadcrumb={
          <Link href={can(actor, 'expense.readAll') ? routes.expenses(company) : routes.myExpenses(company)} className="hover:underline">
            {can(actor, 'expense.readAll') ? 'Dépenses' : 'Mes dépenses'}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {e.label} <StatusBadge kind="expense" status={e.status} />
          </span>
        }
        description={`${EXPENSE_CATEGORY_LABELS[e.category]} · soumise par ${e.submittedByName}`}
        actions={
          <>
            {mine && e.status === 'DRAFT' && (
              <Button variant="outline" asChild>
                <Link href={routes.editExpense(company, e.id)}>
                  <Pencil /> Modifier
                </Link>
              </Button>
            )}
            <ExpenseActions
              company={company}
              expense={e}
              currentUserId={actor.userId}
              canApprove={can(actor, 'expense.approve')}
              canPay={can(actor, 'expense.pay')}
              today={todayIso()}
            />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="gap-5">
          <div className="flex items-end justify-between">
            <span className="text-sm text-muted-foreground">Montant</span>
            <Amount value={e.amountMillimes} size="xl" />
          </div>
          <ExpenseTimeline e={e} />
          {e.status === 'REJECTED' && e.rejectReason && (
            <p className="rounded-md bg-danger-soft p-3 text-sm">
              <strong>Motif du refus :</strong> {e.rejectReason}
            </p>
          )}
          {e.selfApproved && <Badge tone="warning">Auto-approbation (tracée dans le journal)</Badge>}
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Date de la dépense</dt>
              <dd>{formatDate(e.expenseDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">À payer avant le</dt>
              <dd>{formatDate(e.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Fournisseur</dt>
              <dd>{e.supplierName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Payée le</dt>
              <dd>{e.paidAt ? formatDate(e.paidAt) : '—'}</dd>
            </div>
          </dl>
          {e.note && <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-line">{e.note}</p>}
        </Card>
        <Card className="gap-3 self-start">
          <h2 className="font-semibold">Justificatif</h2>
          <ReceiptPreview company={company} expense={e} />
        </Card>
      </div>
    </div>
  );
}
