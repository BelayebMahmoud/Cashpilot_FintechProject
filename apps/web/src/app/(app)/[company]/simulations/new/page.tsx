import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@cashpilot/ui';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { SimulationWorkbench } from '@/features/simulations/simulation-workbench';
import { routes } from '@/lib/routes';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Nouvelle simulation' };

export default async function NewSimulationPage({ params }: PageProps<'/[company]/simulations/new'>) {
  const { company } = await params;
  const actor = await getActor(company);
  const { useCases } = await container();
  // baseline only (no adjustment): the browser recomputes scenarios live from these flows
  const r = await useCases.simulateScenario.execute(actor, { horizon: 90, adjustments: [] });
  if (!r.ok) return <Denied code={r.code} />;
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <Link href={routes.simulations(company)} className="hover:underline">
            Simulations
          </Link>
        }
        title="Nouvelle simulation"
        description="Et si… ? Ajoutez des hypothèses et comparez immédiatement les deux courbes."
      />
      <SimulationWorkbench
        company={company}
        today={r.value.today}
        realBalanceMillimes={r.value.base.realBalanceMillimes}
        assumptions={r.value.assumptions}
        baseFlows={r.value.baseFlows}
        initialHorizon={30}
      />
    </div>
  );
}
