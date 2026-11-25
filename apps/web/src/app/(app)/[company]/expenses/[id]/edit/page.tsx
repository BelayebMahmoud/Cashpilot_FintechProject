import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can } from '@cashpilot/domain';
import { PageHeader } from '@cashpilot/ui';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { ExpenseForm } from '@/features/expenses/expense-form';
import { routes } from '@/lib/routes';
import { getActor } from '@/lib/session';
import { todayIso } from '@/lib/today';

export const metadata: Metadata = { title: 'Modifier la dépense' };

export default async function EditExpensePage({ params }: PageProps<'/[company]/expenses/[id]/edit'>) {
  const { company, id } = await params;
  const actor = await getActor(company);
  const { useCases } = await container();
  const r = await useCases.getExpense.execute(actor, { id });
  if (!r.ok) return <Denied code={r.code} />;
  const e = r.value;
  if (e.status !== 'DRAFT' || e.submittedById !== actor.userId) redirect(routes.expense(company, id));
  const [suppliers, projects] = await Promise.all([
    can(actor, 'party.read') ? useCases.listParties.execute(actor, { kind: 'SUPPLIER', page: 1, pageSize: 1000 }) : null,
    can(actor, 'project.read') ? useCases.listProjects.execute(actor, { status: 'ACTIVE' }) : null,
  ]);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        breadcrumb={
          <Link href={routes.expense(company, id)} className="hover:underline">
            {e.label}
          </Link>
        }
        title="Modifier la dépense"
      />
      <ExpenseForm
        company={company}
        today={todayIso()}
        suppliers={suppliers?.ok ? suppliers.value.items.map((s) => ({ id: s.id, name: s.name })) : []}
        projects={projects?.ok ? projects.value.map((p) => ({ id: p.id, name: p.name })) : []}
        initial={{
          id: e.id,
          label: e.label,
          category: e.category,
          amountMillimes: e.amountMillimes,
          expenseDate: e.expenseDate,
          dueDate: e.dueDate === e.expenseDate ? null : e.dueDate,
          supplierId: e.supplierId,
          projectId: e.projectId,
          note: e.note,
          hasReceipt: e.hasReceipt,
        }}
      />
    </div>
  );
}
