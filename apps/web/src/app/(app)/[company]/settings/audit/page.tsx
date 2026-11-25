import type { Metadata } from 'next';
import { History } from 'lucide-react';
import { Card, EmptyState, PageHeader, Pagination } from '@cashpilot/ui';
import { formatDateTime } from '@cashpilot/ui/format';
import { Denied } from '@/components/denied';
import { FilterBar } from '@/components/filter-bar';
import { AppLink } from '@/components/forms';
import { container } from '@/container';
import { routes } from '@/lib/routes';
import { isoDate, pageParam, sp } from '@/lib/search-params';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Journal' };

const ENTITY_TYPES = [
  ['Invoice', 'Factures'],
  ['Expense', 'Dépenses'],
  ['CashMovement', 'Trésorerie'],
  ['Party', 'Tiers'],
  ['Membership', 'Membres'],
  ['Company', 'Entreprise'],
  ['PlannedFlow', 'Flux prévus'],
  ['Scenario', 'Scénarios'],
  ['Project', 'Projets'],
] as const;

/** Paramètres › Journal: every mutation with its author and before/after values. */
export default async function AuditPage({ params, searchParams }: PageProps<'/[company]/settings/audit'>) {
  const [{ company }, raw] = await Promise.all([params, searchParams]);
  const search = sp(raw);
  const actor = await getActor(company);
  const { useCases } = await container();
  const r = await useCases.listAuditEntries.execute(actor, {
    action: search.q?.trim() || undefined,
    entityType: search.entity,
    from: isoDate(search.from),
    to: isoDate(search.to),
    page: pageParam(search.page),
  });
  if (!r.ok) return <Denied code={r.code} />;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Journal d'audit" description="Chaque opération est tracée : qui, quoi, quand, avant / après. Rien n'y est modifiable." />
      <FilterBar
        searchPlaceholder="Action (ex. invoice, payment.reversed)…"
        selects={[{ name: 'entity', label: 'Objet', options: ENTITY_TYPES.map(([value, label]) => ({ value, label })) }]}
        dateRange={{ from: 'from', to: 'to', label: 'Date' }}
      />
      {r.value.items.length === 0 ? (
        <EmptyState icon={<History />} variant="no-results" title="Aucune entrée" description="Aucune opération ne correspond à ces filtres." />
      ) : (
        <ol className="space-y-3">
          {r.value.items.map((e) => (
            <li key={e.id}>
              <Card className="gap-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm">
                    <span className="font-mono text-xs font-medium">{e.action}</span> · <span className="text-muted-foreground">{e.entityType}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {e.actorName} · {formatDateTime(e.at)}
                  </p>
                </div>
                {(e.before != null || e.after != null) && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Voir les valeurs avant / après</summary>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <pre className="overflow-x-auto rounded-md bg-muted p-2">{e.before != null ? JSON.stringify(e.before, null, 2) : '—'}</pre>
                      <pre className="overflow-x-auto rounded-md bg-muted p-2">{e.after != null ? JSON.stringify(e.after, null, 2) : '—'}</pre>
                    </div>
                  </details>
                )}
              </Card>
            </li>
          ))}
        </ol>
      )}
      <Pagination page={r.value.page} pageSize={r.value.pageSize} total={r.value.total} hrefFor={(page) => routes.audit(company, { ...search, page })} linkAs={AppLink} />
    </div>
  );
}
