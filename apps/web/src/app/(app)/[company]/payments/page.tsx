import type { Metadata } from 'next';
import Link from 'next/link';
import { HandCoins } from 'lucide-react';
import { PAYMENT_METHOD_LABELS } from '@cashpilot/domain';
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
import { Denied } from '@/components/denied';
import { FilterBar } from '@/components/filter-bar';
import { AppLink } from '@/components/forms';
import { container } from '@/container';
import { routes } from '@/lib/routes';
import { isoDate, pageParam, sp } from '@/lib/search-params';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Encaissements' };

export default async function PaymentsPage({ params, searchParams }: PageProps<'/[company]/payments'>) {
  const [{ company }, raw] = await Promise.all([params, searchParams]);
  const search = sp(raw);
  const actor = await getActor(company);
  const { useCases } = await container();
  const r = await useCases.listPayments.execute(actor, { q: search.q, from: isoDate(search.from), to: isoDate(search.to), page: pageParam(search.page) });
  if (!r.ok) return <Denied code={r.code} />;
  const filtered = !!(search.q || search.from || search.to);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Encaissements"
        description={
          <>
            Paiements reçus et contre-passations. Net sur la sélection : <Amount value={r.value.totalMillimes} />
          </>
        }
      />
      <FilterBar searchPlaceholder="N° de facture ou client…" dateRange={{ from: 'from', to: 'to', label: 'Date' }} />
      {r.value.total === 0 ? (
        filtered ? (
          <EmptyState variant="no-results" title="Aucun résultat pour ces filtres" description="Réinitialisez les filtres pour tout afficher." />
        ) : (
          <EmptyState icon={<HandCoins />} title="Aucun encaissement pour l'instant" description="Enregistrez un encaissement depuis une facture émise." />
        )
      ) : (
        <Card className="gap-0 p-0">
          <Table>
            <TableCaption>Encaissements</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Facture</TableHead>
                <TableHead className="hidden md:table-cell">Client</TableHead>
                <TableHead className="hidden md:table-cell">Mode</TableHead>
                <TableHead numeric>Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {r.value.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatDate(p.date)}</TableCell>
                  <TableCell>
                    <Link href={routes.invoice(company, p.invoiceId)} className="font-mono text-xs whitespace-nowrap text-primary hover:underline">
                      {p.invoiceNumber}
                    </Link>
                    {p.isReversal && (
                      <Badge tone="warning" className="ml-2">
                        Contre-passation
                      </Badge>
                    )}
                    {p.reversed && (
                      <Badge tone="outline" className="ml-2">
                        Contre-passé
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden max-w-56 truncate md:table-cell">{p.clientName}</TableCell>
                  <TableCell className="hidden md:table-cell">{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                  <TableCell numeric>
                    <Amount value={p.isReversal ? -p.amountMillimes : p.amountMillimes} signed strike={p.reversed} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pagination page={r.value.page} pageSize={r.value.pageSize} total={r.value.total} hrefFor={(page) => routes.payments(company, { ...search, page })} linkAs={AppLink} />
    </div>
  );
}
