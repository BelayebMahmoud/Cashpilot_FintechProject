import type { Metadata } from 'next';
import { PageHeader } from '@cashpilot/ui';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { MembersManager } from '@/features/company/components';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Membres' };

export default async function MembersPage({ params }: PageProps<'/[company]/settings/members'>) {
  const { company } = await params;
  const actor = await getActor(company);
  const { useCases } = await container();
  const r = await useCases.listMembers.execute(actor);
  if (!r.ok) return <Denied code={r.code} />;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Membres et rôles"
        description="Dirigeant : pilote et approuve. Gestionnaire financier : factures, paiements, prévisions. Collaborateur : soumet ses dépenses."
      />
      <MembersManager company={company} members={r.value} currentUserId={actor.userId} />
    </div>
  );
}
