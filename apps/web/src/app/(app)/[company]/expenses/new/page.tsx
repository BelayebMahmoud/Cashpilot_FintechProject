import type { Metadata } from 'next';
import Link from 'next/link';
import { can } from '@cashpilot/domain';
import { PageHeader } from '@cashpilot/ui';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { ExpenseForm } from '@/features/expenses/expense-form';
import { routes } from '@/lib/routes';
import { getActor } from '@/lib/session';
import { todayIso } from '@/lib/today';

export const metadata: Metadata = { title: 'Nouvelle dépense' };

export default async function NewExpensePage({ params }: PageProps<'/[company]/expenses/new'>) {
  const { company } = await params;
  const actor = await getActor(company);
  if (!can(actor, 'expense.submit')) return <Denied code="FORBIDDEN" />;
  const { useCases } = await container();
  // suppliers and projects are only offered to roles that can read them
  const [suppliers, projects] = await Promise.all([
    can(actor, 'party.read') ? useCases.listParties.execute(actor, { kind: 'SUPPLIER', page: 1, pageSize: 1000 }) : null,
    can(actor, 'project.read') ? useCases.listProjects.execute(actor, { status: 'ACTIVE' }) : null,
  ]);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        breadcrumb={
          <Link href={routes.myExpenses(company)} className="hover:underline">
            Mes dépenses
          </Link>
        }
        title="Nouvelle dépense"
        description="Montant, catégorie, justificatif : c'est tout."
      />
      <ExpenseForm
        company={company}
        today={todayIso()}
        suppliers={suppliers?.ok ? suppliers.value.items.map((s) => ({ id: s.id, name: s.name })) : []}
        projects={projects?.ok ? projects.value.map((p) => ({ id: p.id, name: p.name })) : []}
      />
    </div>
  );
}
