import type { Metadata } from 'next';
import { can } from '@cashpilot/domain';
import { PageHeader } from '@cashpilot/ui';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { ApprovalInbox } from '@/features/expenses/approval-inbox';
import { sp } from '@/lib/search-params';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Dépenses à valider' };

export default async function ApprovalsPage({ params, searchParams }: PageProps<'/[company]/expenses/approvals'>) {
  const [{ company }, raw] = await Promise.all([params, searchParams]);
  const search = sp(raw);
  const actor = await getActor(company);
  if (!can(actor, 'expense.approve')) return <Denied code="FORBIDDEN" />;
  const { useCases } = await container();
  const r = await useCases.listExpenses.execute(actor, { scope: 'all', tab: 'submitted', page: 1 });
  if (!r.ok) return <Denied code={r.code} />;
  const items = [...r.value.items].sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader title="Dépenses à valider" description={`${r.value.total} demande${r.value.total > 1 ? 's' : ''} en attente de votre décision.`} />
      <ApprovalInbox company={company} items={items} currentUserId={actor.userId} {...(search.id ? { selectedId: search.id } : {})} />
    </div>
  );
}
