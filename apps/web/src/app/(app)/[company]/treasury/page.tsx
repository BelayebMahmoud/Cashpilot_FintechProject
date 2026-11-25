import type { Metadata } from 'next';
import Link from 'next/link';
import { Landmark } from 'lucide-react';
import { can, MOVEMENT_SOURCES, type MovementSource } from '@cashpilot/domain';
import {
  Amount,
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@cashpilot/ui';
import { formatDate } from '@cashpilot/ui/format';
import { BalanceSparkline } from '@/components/balance-sparkline';
import { Denied } from '@/components/denied';
import { FilterBar } from '@/components/filter-bar';
import { AppLink } from '@/components/forms';
import { container } from '@/container';
import { AdjustmentDialog } from '@/features/treasury/treasury-components';
import { routes } from '@/lib/routes';
import { isoDate, oneOf, pageParam, sp } from '@/lib/search-params';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Trésorerie' };

const SOURCE_LABELS: Record<MovementSource, string> = {
  OPENING: 'Solde initial',
  PAYMENT: 'Encaissement',
  PAYMENT_REVERSAL: 'Contre-passation',
  EXPENSE_PAYMENT: 'Paiement dépense',
  EXPENSE_PAYMENT_REVERSAL: 'Annulation paiement',
  ADJUSTMENT: 'Mouvement manuel',
};

export default async function TreasuryPage({ params, searchParams }: PageProps<'/[company]/treasury'>) {
  const [{ company }, raw] = await Promise.all([params, searchParams]);
  const search = sp(raw);
  const actor = await getActor(company);
  const { useCases } = await container();
  const sourceType = search.source && (MOVEMENT_SOURCES as readonly string[]).includes(search.source) ? (search.source as MovementSource) : undefined;
  const direction = oneOf(search.direction, ['IN', 'OUT', ''] as const, '') || undefined;
  const [t, history] = await Promise.all([
    useCases.getTreasury.execute(actor, {
      from: isoDate(search.from),
      to: isoDate(search.to),
      ...(sourceType ? { sourceType } : {}),
      ...(direction ? { direction } : {}),
      page: pageParam(search.page),
    }),
    useCases.getBalanceHistory.execute(actor, { days: 90 }),
  ]);
  if (!t.ok) return <Denied code={t.code} />;
  const filtered = !!(search.from || search.to || sourceType || direction);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Trésorerie"
        description="Mouvements réalisés : historique append-only, les corrections passent par des écritures traçables."
        actions={can(actor, 'ledger.adjust') && <AdjustmentDialog company={company} today={t.value.today} openingDate={t.value.openingDate} />}
      />
      <Card className="gap-4 md:flex-row md:items-center">
        <div className="shrink-0 space-y-1">
          <p className="text-sm text-muted-foreground">Solde réel au {formatDate(t.value.today)}</p>
          <Amount value={t.value.balanceTodayMillimes} tone="balance" size="xl" />
        </div>
        {history.ok && (
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs text-muted-foreground">90 derniers jours</p>
            <BalanceSparkline points={history.value} />
          </div>
        )}
      </Card>
      <FilterBar
        showSearch={false}
        selects={[
          { name: 'source', label: 'Origine', options: MOVEMENT_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] })) },
          {
            name: 'direction',
            label: 'Sens',
            options: [
              { value: 'IN', label: 'Entrées' },
              { value: 'OUT', label: 'Sorties' },
            ],
          },
        ]}
        dateRange={{ from: 'from', to: 'to', label: 'Date' }}
      />
      {t.value.total === 0 ? (
        filtered ? (
          <EmptyState variant="no-results" title="Aucun résultat pour ces filtres" description="Réinitialisez les filtres pour voir tous les mouvements." />
        ) : (
          <EmptyState icon={<Landmark />} title="Aucun mouvement" description="Les encaissements, paiements de dépenses et corrections apparaîtront ici." />
        )
      ) : (
        <Card className="gap-0 p-0">
          <Table>
            <TableCaption>Grand livre de trésorerie, du plus récent au plus ancien, avec le solde cumulé</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead className="hidden md:table-cell">Origine</TableHead>
                <TableHead numeric>Entrée</TableHead>
                <TableHead numeric>Sortie</TableHead>
                <TableHead numeric>Solde cumulé</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {t.value.items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(m.date)}</TableCell>
                  <TableCell className="max-w-72">
                    <span className="block truncate">{m.label}</span>
                    {m.reason && m.sourceType !== 'ADJUSTMENT' && <span className="block truncate text-xs text-muted-foreground">Motif : {m.reason}</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {m.documentType && m.documentId ? (
                        <Link
                          href={m.documentType === 'invoice' ? routes.invoice(company, m.documentId) : routes.expense(company, m.documentId)}
                          className="text-primary hover:underline"
                        >
                          {SOURCE_LABELS[m.sourceType]}
                        </Link>
                      ) : (
                        SOURCE_LABELS[m.sourceType]
                      )}
                      {m.isReversal && <Badge tone="warning">Écriture inverse</Badge>}
                    </span>
                  </TableCell>
                  <TableCell numeric>{m.direction === 'IN' ? <Amount value={m.amountMillimes} signed /> : null}</TableCell>
                  <TableCell numeric>{m.direction === 'OUT' ? <Amount value={-m.amountMillimes} /> : null}</TableCell>
                  <TableCell numeric>
                    <Amount value={m.balanceAfterMillimes} tone="balance" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={t.value.page} pageSize={t.value.pageSize} total={t.value.total} hrefFor={(page) => routes.treasury(company, { ...search, page })} linkAs={AppLink} />
    </div>
  );
}
