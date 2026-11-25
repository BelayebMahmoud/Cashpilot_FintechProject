import type { Metadata } from 'next';
import { CalendarClock } from 'lucide-react';
import { can } from '@cashpilot/domain';
import { EmptyState, PageHeader } from '@cashpilot/ui';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { ForecastTabs } from '@/features/forecast/forecast-tabs';
import { NewPlannedFlowDialog, PlannedFlowList } from '@/features/forecast/planned-flows';
import { getActor } from '@/lib/session';
import { todayIso } from '@/lib/today';

export const metadata: Metadata = { title: 'Flux prévus' };

export default async function PlannedFlowsPage({ params }: PageProps<'/[company]/forecast/planned'>) {
  const { company } = await params;
  const actor = await getActor(company);
  const { useCases } = await container();
  const r = await useCases.listPlannedFlows.execute(actor);
  if (!r.ok) return <Denied code={r.code} />;
  const canWrite = can(actor, 'plannedFlow.write');
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Flux prévus"
        description="Entrées et sorties attendues hors factures et dépenses (salaires, loyer, rentrées sans facture)."
        actions={
          <>
            <ForecastTabs company={company} active="planned" />
            {canWrite && <NewPlannedFlowDialog company={company} today={todayIso()} />}
          </>
        }
      />
      {r.value.length === 0 ? (
        <EmptyState
          icon={<CalendarClock />}
          title="Aucun flux prévu"
          description="Ajoutez vos charges récurrentes pour une prévision réaliste."
          action={canWrite && <NewPlannedFlowDialog company={company} today={todayIso()} />}
        />
      ) : (
        <PlannedFlowList company={company} flows={r.value} canWrite={canWrite} />
      )}
    </div>
  );
}
