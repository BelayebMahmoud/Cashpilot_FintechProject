import type { Metadata } from 'next';
import { Card, PageHeader } from '@cashpilot/ui';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { AlertList } from '@/features/alerts/alert-list';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Alertes' };

export default async function AlertsPage({ params }: PageProps<'/[company]/alerts'>) {
  const { company } = await params;
  const actor = await getActor(company);
  const { useCases } = await container();
  const alerts = await useCases.getAlerts.execute(actor);
  if (!alerts.ok) return <Denied code={alerts.code} />;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Alertes"
        description="Calculées en temps réel : factures en retard ou proches de l'échéance, dépenses à valider, solde prévisionnel négatif."
      />
      <Card className="py-2">
        <AlertList company={company} alerts={alerts.value} />
      </Card>
    </div>
  );
}
