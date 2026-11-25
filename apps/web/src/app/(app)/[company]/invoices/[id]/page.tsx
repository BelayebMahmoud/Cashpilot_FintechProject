import type { Metadata } from 'next';
import Link from 'next/link';
import { Undo2 } from 'lucide-react';
import { can, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@cashpilot/domain';
import {
  Alert,
  AlertDescription,
  Amount,
  Badge,
  Card,
  cn,
  PageHeader,
  Progress,
  Separator,
  StatusBadge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@cashpilot/ui';
import { formatDate, formatMoney, formatQuantity, formatRelativeDue } from '@cashpilot/ui/format';
import { Denied } from '@/components/denied';
import { container } from '@/container';
import { InvoiceActions, ReversePaymentButton } from '@/features/invoices/invoice-actions';
import { routes } from '@/lib/routes';
import { getActor } from '@/lib/session';
import { todayIso } from '@/lib/today';

export const metadata: Metadata = { title: 'Facture' };

export default async function InvoicePage({ params }: PageProps<'/[company]/invoices/[id]'>) {
  const { company, id } = await params;
  const actor = await getActor(company);
  const { useCases } = await container();
  const r = await useCases.getInvoice.execute(actor, { id });
  if (!r.ok) return <Denied code={r.code} />;
  const inv = r.value;
  const today = todayIso();
  const paidPct = inv.totalMillimes > 0 ? (inv.paidMillimes / inv.totalMillimes) * 100 : 0;
  const canReverse = can(actor, 'payment.reverse') && inv.status === 'ISSUED';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        breadcrumb={
          <Link href={routes.invoices(company)} className="hover:underline">
            Factures
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className={cn('font-mono', inv.status === 'CANCELLED' && 'line-through')}>{inv.number ?? 'Brouillon'}</span>
            <StatusBadge kind="invoice" status={inv.status} settlement={inv.settlement} overdue={inv.overdue} daysOverdue={inv.daysOverdue} />
          </span>
        }
        description={
          <>
            <Link href={routes.client(company, inv.clientId)} className="font-medium text-foreground hover:underline">
              {inv.clientName}
            </Link>{' '}
            · émise le {formatDate(inv.issueDate)} · échéance {formatDate(inv.dueDate)}
            {inv.status === 'ISSUED' && inv.remainingMillimes > 0 && (
              <span className={cn(inv.overdue && 'text-danger')}> ({formatRelativeDue(inv.dueDate, today)})</span>
            )}
          </>
        }
        actions={
          <InvoiceActions
            company={company}
            invoice={inv}
            canWrite={can(actor, 'invoice.write')}
            canPay={can(actor, 'payment.record')}
            today={today}
          />
        }
      />

      {inv.status === 'CANCELLED' && (
        <Alert tone="neutral">
          <Undo2 />
          <AlertDescription>
            Facture annulée — motif : <strong>{inv.cancelReason}</strong>. Elle est conservée pour l&apos;historique.
          </AlertDescription>
        </Alert>
      )}

      {inv.status === 'ISSUED' && (
        <Card className="gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Reste à payer</p>
              <Amount value={inv.remainingMillimes} size="xl" />
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>
                Encaissé <Amount value={inv.paidMillimes} className="text-foreground" /> sur <Amount value={inv.totalMillimes} className="text-foreground" />
              </p>
            </div>
          </div>
          <Progress value={paidPct} label={`Facture payée à ${Math.round(paidPct)} %`} tone={inv.settlement === 'PAID' ? 'inflow' : 'primary'} />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="gap-0 p-0">
          <Table>
            <TableCaption>Lignes de la facture</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Désignation</TableHead>
                <TableHead numeric>Qté</TableHead>
                <TableHead numeric className="hidden sm:table-cell">PU HT</TableHead>
                <TableHead numeric className="hidden sm:table-cell">TVA</TableHead>
                <TableHead numeric>Total HT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inv.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell numeric>{formatQuantity(l.qtyHundredths)}</TableCell>
                  <TableCell numeric className="hidden sm:table-cell">
                    <Amount value={l.unitMillimes} />
                  </TableCell>
                  <TableCell numeric className="hidden sm:table-cell">
                    {l.vatRateBp / 100} %
                  </TableCell>
                  <TableCell numeric>
                    <Amount value={l.htMillimes} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={2} className="sm:hidden">
                  Total HT
                </TableCell>
                <TableCell colSpan={4} className="hidden sm:table-cell">
                  Total HT
                </TableCell>
                <TableCell numeric>
                  <Amount value={inv.htMillimes} />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
          <div className="space-y-2 border-t p-5 text-sm">
            {inv.vatByRate.map((v) => (
              <div key={v.rateBp} className="flex justify-between">
                <span className="text-muted-foreground">
                  TVA {v.rateBp / 100} % sur {formatMoney(v.baseMillimes)}
                </span>
                <Amount value={v.vatMillimes} />
              </div>
            ))}
            {inv.stampDutyMillimes > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Timbre fiscal</span>
                <Amount value={inv.stampDutyMillimes} />
              </div>
            )}
            <Separator />
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Total TTC</span>
              <Amount value={inv.totalMillimes} size="lg" />
            </div>
            {inv.notes && <p className="pt-2 whitespace-pre-line text-muted-foreground">{inv.notes}</p>}
          </div>
        </Card>

        <Card className="gap-3 self-start">
          <h2 className="font-semibold">Encaissements</h2>
          {inv.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {inv.status === 'DRAFT' ? 'Validez la facture pour pouvoir enregistrer des encaissements.' : 'Aucun encaissement pour le moment.'}
            </p>
          ) : (
            <ol className="relative space-y-4 border-l pl-4" aria-label="Historique des encaissements">
              {inv.payments.map((p) => {
                const reversed = !!p.reversedById;
                return (
                  <li key={p.id} id={`payment-${p.id}`} className="relative">
                    <span
                      aria-hidden
                      className={cn('absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-card', p.isReversal ? 'bg-warning' : reversed ? 'bg-muted-foreground' : 'bg-inflow')}
                    />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {p.isReversal ? 'Contre-passation' : 'Encaissement'} · {formatDate(p.date)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method} · {p.createdByName}
                        </p>
                        {p.reason && <p className="text-xs text-muted-foreground">Motif : {p.reason}</p>}
                        {p.isReversal && p.reversesId && (
                          <a href={`#payment-${p.reversesId}`} className="text-xs text-primary hover:underline">
                            Annule l&apos;encaissement d&apos;origine
                          </a>
                        )}
                        {reversed && (
                          <Badge tone="warning" className="mt-1">
                            Contre-passé
                          </Badge>
                        )}
                      </div>
                      <Amount value={p.isReversal ? -p.amountMillimes : p.amountMillimes} signed strike={reversed} />
                    </div>
                    {canReverse && !p.isReversal && !reversed && (
                      <ReversePaymentButton
                        company={company}
                        invoiceId={inv.id}
                        paymentId={p.id}
                        label={`${formatMoney(p.amountMillimes)} reçus le ${formatDate(p.date)}`}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
