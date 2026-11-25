import type { Metadata } from 'next';
import { Badge, Card, PageHeader, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, Amount } from '@cashpilot/ui';
import { formatDate } from '@cashpilot/ui/format';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { ForecastExplorer } from '@/features/forecast/forecast-explorer';
import { ForecastTabs } from '@/features/forecast/forecast-tabs';
import { sp } from '@/lib/search-params';
import { getActor } from '@/lib/session';

export const metadata: Metadata = { title: 'Prévisions' };

export default async function ForecastPage({ params, searchParams }: PageProps<'/[company]/forecast'>) {
  const [{ company }, raw] = await Promise.all([params, searchParams]);
  const search = sp(raw);
  const actor = await getActor(company);
  const { useCases } = await container();
  const horizon = search.horizon === '60' ? 60 : search.horizon === '90' ? 90 : 30;
  const r = await useCases.getForecast.execute(actor, {
    horizon,
    assumptions: {
      overduePolicy: search.overdue === 'exclude' ? 'EXCLUDE' : 'ROLL_TO_TODAY',
      includePendingExpenses: search.pending !== '0',
    },
  });
  if (!r.ok) return <Denied code={r.code} />;
  const weeks = r.value.weeks;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Prévisions"
        description="Suivez le solde réel et l’effet des encaissements et décaissements prévus"
        actions={<ForecastTabs company={company} active="forecast" />}
      />
      <ForecastExplorer data={r.value} />
      <Card className="min-w-0 gap-0 rounded-xl p-0">
        <h2 className="border-b px-4 py-4 text-sm font-medium sm:px-6">Flux par semaine</h2>
        <Table>
          <TableCaption>Flux prévus regroupés par semaine</TableCaption>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead>Semaine du</TableHead>
              <TableHead>Flux</TableHead>
              <TableHead numeric>Entrées</TableHead>
              <TableHead numeric>Sorties</TableHead>
              <TableHead numeric>Solde fin de semaine</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {weeks.map((w) => (
              <TableRow key={w.weekStart} className="align-top">
                <TableCell className="font-mono text-xs whitespace-nowrap">{formatDate(w.weekStart)}</TableCell>
                <TableCell>
                  {w.flows.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ul className="space-y-1 py-1">
                      {w.flows.map((f) => (
                        <li key={f.key} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="text-xs text-muted-foreground tabular-nums">{formatDate(f.date, 'short')}</span>
                          <span>{f.label}</span>
                          <Amount value={f.amountMillimes} signed />
                          {f.overdue && <Badge tone="danger">En retard</Badge>}
                          {f.pending && <Badge tone="warning">En attente</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell numeric>{w.inMillimes ? <Amount value={w.inMillimes} signed /> : '—'}</TableCell>
                <TableCell numeric>{w.outMillimes ? <Amount value={-w.outMillimes} /> : '—'}</TableCell>
                <TableCell numeric>
                  <Amount value={w.endBalanceMillimes} tone="balance" className="font-mono font-medium" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
