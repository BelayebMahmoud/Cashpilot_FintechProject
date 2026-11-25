import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@cashpilot/ui';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { ScenarioButtons } from '@/features/simulations/scenario-buttons';
import { SimulationWorkbench } from '@/features/simulations/simulation-workbench';
import { routes } from '@/lib/routes';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Scénario' };

export default async function ScenarioPage({ params }: PageProps<'/[company]/simulations/[id]'>) {
  const { company, id } = await params;
  const actor = await getActor(company);
  const { useCases } = await container();
  const r = await useCases.getScenario.execute(actor, { id });
  if (!r.ok) return <Denied code={r.code} />;
  const { scenario, simulation, staleAdjustments } = r.value;
  const valid = scenario.adjustments.filter((_, i) => !staleAdjustments.includes(i));
  const horizon = ([30, 60, 90] as const).find((h) => h === scenario.horizonDays) ?? 30;
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <Link href={routes.simulations(company)} className="hover:underline">
            Simulations
          </Link>
        }
        title={scenario.name}
        description="Le scénario est recalculé sur les données réelles du jour."
        actions={<ScenarioButtons company={company} id={scenario.id} name={scenario.name} />}
      />
      <SimulationWorkbench
        key={scenario.updatedAt}
        company={company}
        today={simulation.today}
        realBalanceMillimes={simulation.base.realBalanceMillimes}
        assumptions={simulation.assumptions}
        baseFlows={simulation.baseFlows}
        initialHorizon={horizon}
        scenario={{ id: scenario.id, name: scenario.name, adjustments: valid }}
        staleCount={staleAdjustments.length}
      />
    </div>
  );
}
