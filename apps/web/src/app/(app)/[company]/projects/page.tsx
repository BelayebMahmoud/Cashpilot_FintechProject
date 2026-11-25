import type { Metadata } from 'next';
import Link from 'next/link';
import { FolderKanban } from 'lucide-react';
import { can } from '@cashpilot/domain';
import { Amount, Badge, Card, cn, EmptyState, PageHeader, Progress } from '@cashpilot/ui';
import { formatPercentBp } from '@cashpilot/ui/format';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { ProjectDialog } from '@/features/projects/components';
import { routes } from '@/lib/routes';
import { getActor } from '@/lib/session';
import { todayIso } from '@/lib/today';

export const metadata: Metadata = { title: 'Projets' };

/** Sector feature (digital agency): projects, budget and profitability. */
export default async function ProjectsPage({ params }: PageProps<'/[company]/projects'>) {
  const { company } = await params;
  const actor = await getActor(company);
  const { useCases } = await container();
  const [r, clients] = await Promise.all([
    useCases.listProjects.execute(actor),
    useCases.listParties.execute(actor, { kind: 'CLIENT', page: 1, pageSize: 1000 }),
  ]);
  if (!r.ok) return <Denied code={r.code} />;
  const canWrite = can(actor, 'project.write');
  const dialog = canWrite && clients.ok && <ProjectDialog company={company} clients={clients.value.items.map((c) => ({ id: c.id, name: c.name }))} today={todayIso()} />;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Projets" description="Agence digitale : budget, jalons de paiement et marge par projet (facturé HT − dépenses engagées)." actions={dialog} />
      {r.value.length === 0 ? (
        <EmptyState icon={<FolderKanban />} title="Aucun projet" description="Créez un projet pour suivre sa rentabilité et ses acomptes." action={dialog} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {r.value.map((p) => (
            <li key={p.id}>
              <Card className="h-full gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={routes.project(company, p.id)} className="block truncate font-semibold hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">{p.clientName}</p>
                  </div>
                  <Badge tone={p.status === 'ACTIVE' ? 'info' : 'neutral'}>{p.status === 'ACTIVE' ? 'En cours' : 'Clôturé'}</Badge>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Facturé HT</dt>
                    <dd>
                      <Amount value={p.invoicedHTMillimes} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Dépenses</dt>
                    <dd>
                      <Amount value={p.expensesMillimes} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Marge</dt>
                    <dd className={cn(p.marginMillimes < 0 && 'text-danger')}>
                      <Amount value={p.marginMillimes} tone="balance" /> <span className="text-xs">({formatPercentBp(p.marginRateBp)})</span>
                    </dd>
                  </div>
                </dl>
                {p.budgetConsumedBp !== null && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Budget consommé : {formatPercentBp(p.budgetConsumedBp)}</p>
                    <Progress value={p.budgetConsumedBp / 100} label="Budget consommé" tone={p.budgetConsumedBp > 10_000 ? 'danger' : 'primary'} />
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
