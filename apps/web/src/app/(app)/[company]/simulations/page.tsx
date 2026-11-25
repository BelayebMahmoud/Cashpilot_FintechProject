import type { Metadata } from 'next';
import Link from 'next/link';
import { FlaskConical, Plus } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader } from '@cashpilot/ui';
import { formatDateTime } from '@cashpilot/ui/format';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { routes } from '@/lib/routes';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Simulations' };

export default async function SimulationsPage({ params }: PageProps<'/[company]/simulations'>) {
  const { company } = await params;
  const actor = await getActor(company);
  const { useCases } = await container();
  const r = await useCases.listScenarios.execute(actor);
  if (!r.ok) return <Denied code={r.code} />;
  const newButton = (
    <Button asChild>
      <Link href={routes.newSimulation(company)}>
        <Plus /> Nouvelle simulation
      </Link>
    </Button>
  );
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Simulations" description="Testez un retard client, une nouvelle dépense ou une rentrée prévue — sans toucher aux données réelles." actions={newButton} />
      {r.value.length === 0 ? (
        <EmptyState icon={<FlaskConical />} title="Aucun scénario enregistré" description="Lancez une simulation « et si… ? » et comparez-la à la prévision." action={newButton} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {r.value.map((s) => (
            <li key={s.id}>
              <Link href={routes.simulation(company, s.id)} className="block h-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="h-full gap-2 transition-colors hover:bg-accent/40">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {s.adjustments.length} hypothèse{s.adjustments.length > 1 ? 's' : ''} · horizon {s.horizonDays} j
                  </p>
                  <p className="text-xs text-muted-foreground">Modifié le {formatDateTime(s.updatedAt)}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
