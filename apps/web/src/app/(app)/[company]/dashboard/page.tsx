import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { cache } from 'react';
import { ArrowRight, CircleCheckBig } from 'lucide-react';
import { type Actor } from '@cashpilot/application';
import {
  Amount,
  Button,
  Card,
  CardHeader,
  CardTitle,
  EmptyState,
  KpiCard,
  PageHeader,
  RunwayGauge,
  Skeleton,
  StatusBadge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@cashpilot/ui';
import { formatDate, formatMoney, formatRelativeDue } from '@cashpilot/ui/format';
import { ForecastChart } from '@/components/charts';
import { Denied } from '@/components/denied';
import { AppLink } from '@/components/forms';
import { container } from '@/container';
import { AlertList } from '@/features/alerts/alert-list';
import { routes } from '@/lib/routes';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Tableau de bord' };

/** One dashboard computation per request, shared by every widget below. */
const loadDashboard = cache(async (actor: Actor) => {
  const { useCases } = await container();
  return useCases.getDashboard.execute(actor);
});

export default async function DashboardPage({ params }: PageProps<'/[company]/dashboard'>) {
  const { company } = await params;
  const actor = await getActor(company);
  const first = await loadDashboard(actor);
  if (!first.ok) return <Denied code={first.code} />;

  return (
    <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
      <PageHeader title="Tableau de bord" description={`Situation au ${formatDate(first.value.today, 'long')}`} />
      <Suspense fallback={<KpiSkeleton />}>
        <Kpis actor={actor} />
      </Suspense>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-3 xl:gap-6">
        <Suspense fallback={<Skeleton className="h-[380px] lg:col-span-2" />}>
          <ForecastWidget actor={actor} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-[380px]" />}>
          <AlertsWidget actor={actor} />
        </Suspense>
      </div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2 xl:gap-6">
        <Suspense fallback={<Skeleton className="h-72" />}>
          <OverdueWidget actor={actor} />
        </Suspense>
        {actor.role === 'OWNER' && (
          <Suspense fallback={<Skeleton className="h-72" />}>
            <ApprovalsWidget actor={actor} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border min-[22.5rem]:grid-cols-2 lg:grid-cols-3 min-[85rem]:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-28 rounded-none last:min-[22.5rem]:col-span-2 last:min-[85rem]:col-span-1" />
      ))}
    </div>
  );
}

async function Kpis({ actor }: { actor: Actor }) {
  const r = await loadDashboard(actor);
  if (!r.ok) return null;
  const { kpis, runway } = r.value;
  const c = actor.companySlug;
  return (
    <section aria-label="Indicateurs clés" className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border min-[22.5rem]:grid-cols-2 lg:grid-cols-3 min-[85rem]:grid-cols-5">
      <KpiCard label="Solde réel" value={kpis.realBalanceMillimes} tone="balance" className="rounded-none border-0 p-4 sm:p-5" href={routes.treasury(c)} linkAs={AppLink} hint="Mouvements réalisés à ce jour" />
      <KpiCard
        label="Solde prévu J+30"
        value={kpis.forecast30Millimes}
        tone="balance"
        className="rounded-none border-0 p-4 sm:p-5"
        href={routes.forecast(c)}
        linkAs={AppLink}
        hint={
          <>
            Point bas 90 j : <span className={kpis.lowest90.balanceMillimes < 0 ? 'text-danger-foreground' : undefined}>{formatMoney(kpis.lowest90.balanceMillimes)}</span> le{' '}
            {formatDate(kpis.lowest90.date, 'short')}
          </>
        }
      />
      <KpiCard
        label="À encaisser"
        value={kpis.receivableMillimes}
        className="rounded-none border-0 p-4 sm:p-5"
        href={routes.invoices(c, { tab: 'receivable' })}
        linkAs={AppLink}
        hint={kpis.overdueReceivableMillimes > 0 ? <span className="text-danger-foreground">dont {formatMoney(kpis.overdueReceivableMillimes)} en retard</span> : 'Aucun retard'}
      />
      <KpiCard
        label="À décaisser"
        value={kpis.payableApprovedMillimes + kpis.payablePendingMillimes}
        className="rounded-none border-0 p-4 sm:p-5"
        href={routes.expenses(c, { tab: 'toPay' })}
        linkAs={AppLink}
        hint={`${formatMoney(kpis.payableApprovedMillimes)} approuvées · ${kpis.pendingExpenses} en attente`}
      />
      <RunwayGauge className="gap-2 rounded-none border-0 p-4 min-[22.5rem]:col-span-2 sm:p-5 min-[85rem]:col-span-1" days={runway.days} firstNegativeDate={runway.firstNegativeDate} />
    </section>
  );
}

async function ForecastWidget({ actor }: { actor: Actor }) {
  const r = await loadDashboard(actor);
  if (!r.ok) return null;
  const p = r.value.projection90;
  const endingBalance = p.points.at(-1);
  return (
    <Card className="min-w-0 gap-5 rounded-xl p-4 sm:p-6 lg:col-span-2">
      <CardHeader>
        <div>
          <CardTitle className="text-lg font-medium">Prévision de trésorerie</CardTitle>
          <p className="text-sm text-muted-foreground">Solde réel et flux attendus sur 90 jours</p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={routes.forecast(actor.companySlug, { horizon: 90 })}>
            Voir le détail <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      {endingBalance && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-y py-3">
          <p className="text-xs text-muted-foreground">Solde prévu à J+90</p>
          <Amount value={endingBalance.balanceMillimes} tone="balance" size="lg" className="font-mono font-medium whitespace-normal wrap-anywhere" />
        </div>
      )}
      <ForecastChart points={p.points} shortfalls={p.shortfalls} today={r.value.today} height={300} />
    </Card>
  );
}

async function AlertsWidget({ actor }: { actor: Actor }) {
  const r = await loadDashboard(actor);
  if (!r.ok) return null;
  return (
    <Card className="min-w-0 gap-3 rounded-xl p-4 sm:p-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-medium">Alertes <span className="font-mono text-xs text-muted-foreground">{r.value.alerts.length}</span></CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href={routes.alerts(actor.companySlug)}>
            Tout voir <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <div role="region" aria-label="Alertes récentes" tabIndex={0} className="rounded-md focus-visible:outline-2 focus-visible:outline-ring lg:max-h-96 lg:overflow-y-auto">
        <AlertList company={actor.companySlug} alerts={r.value.alerts} limit={5} />
      </div>
    </Card>
  );
}

async function OverdueWidget({ actor }: { actor: Actor }) {
  const r = await loadDashboard(actor);
  if (!r.ok) return null;
  const rows = r.value.overdueInvoices;
  const c = actor.companySlug;
  return (
    <Card className="min-w-0 gap-2 rounded-xl p-0">
      <CardHeader className="p-5 pb-2">
        <CardTitle>Factures en retard</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href={routes.invoices(c, { tab: 'overdue' })}>
            Toutes <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      {rows.length === 0 ? (
        <EmptyState icon={<CircleCheckBig />} title="Aucune facture en retard" description="Tous les encaissements échus ont été reçus." className="m-5 mt-0 py-8" />
      ) : (
        <Table>
          <TableCaption>Les 5 factures les plus en retard</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Échéance</TableHead>
              <TableHead numeric>Reste à payer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <Link href={routes.invoice(c, i.id)} className="font-mono text-xs whitespace-nowrap text-primary hover:underline">
                    {i.number}
                  </Link>
                </TableCell>
                <TableCell className="max-w-40 truncate">{i.clientName}</TableCell>
                <TableCell className="text-danger-foreground">{formatRelativeDue(i.dueDate, r.value.today)}</TableCell>
                <TableCell numeric>
                  <Amount value={i.remainingMillimes} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

async function ApprovalsWidget({ actor }: { actor: Actor }) {
  const r = await loadDashboard(actor);
  if (!r.ok) return null;
  const rows = r.value.pendingApprovals;
  const c = actor.companySlug;
  return (
    <Card className="min-w-0 gap-2 rounded-xl p-0">
      <CardHeader className="p-5 pb-2">
        <CardTitle>Dépenses à valider</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href={routes.approvals(c)}>
            Valider <ArrowRight />
          </Link>
        </Button>
      </CardHeader>
      {rows.length === 0 ? (
        <EmptyState icon={<CircleCheckBig />} title="Rien à valider" description="Toutes les dépenses soumises ont été traitées." className="m-5 mt-0 py-8" />
      ) : (
        <ul className="divide-y px-5 pb-3">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <Link href={routes.approvals(c, { id: e.id })} className="block truncate font-medium hover:underline">
                  {e.label}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {e.submittedByName} · {formatDate(e.expenseDate)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge kind="expense" status={e.status} />
                <Amount value={e.amountMillimes} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
