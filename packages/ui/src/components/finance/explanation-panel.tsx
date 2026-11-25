import * as React from 'react';
import { Calculator } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatDate } from '../../lib/format';
import { Badge, Card } from '../primitives/layout';
import { Amount } from './amount';

export interface ExplanationFlow {
  key: string;
  date: string;
  label: string;
  amountMillimes: number;
  overdue?: boolean;
  pending?: boolean;
  originalDate?: string;
}

export interface ExplanationPanelProps {
  date: string;
  realAsOf: string;
  realBalanceMillimes: number;
  expectedInMillimes: number;
  expectedOutMillimes: number;
  balanceMillimes: number;
  flows: ExplanationFlow[];
  assumptions: string[];
  className?: string;
}

/** "Comment ce montant est calculé" — real + expected receipts − expected disbursements = projected. */
export function ExplanationPanel({
  date,
  realAsOf,
  realBalanceMillimes,
  expectedInMillimes,
  expectedOutMillimes,
  balanceMillimes,
  flows,
  assumptions,
  className,
}: ExplanationPanelProps) {
  return (
    <Card className={cn('gap-4', className)} aria-live="polite">
      <div className="flex items-center gap-2">
        <Calculator className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-base font-semibold">Comment ce montant est calculé — {formatDate(date, 'long')}</h2>
      </div>
      <div className="grid grid-cols-2 items-end gap-3 rounded-md bg-muted/60 p-3 text-sm md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
        <Term label={`Solde réel au ${formatDate(realAsOf, 'short')}`} value={realBalanceMillimes} />
        <Op>+</Op>
        <Term label="Encaissements attendus" value={expectedInMillimes} />
        <Op>−</Op>
        <Term label="Décaissements prévus" value={expectedOutMillimes} />
        <Op>=</Op>
        <Term label="Solde prévisionnel" value={balanceMillimes} strong />
      </div>
      {flows.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Flux pris en compte ({flows.length})</h3>
          <ul tabIndex={0} aria-label="Flux pris en compte" className="max-h-64 divide-y overflow-auto rounded-md border text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {flows.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate">{f.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(f.date)}
                    {f.originalDate && f.originalDate !== f.date && ` (échéance initiale ${formatDate(f.originalDate)})`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {f.overdue && <Badge tone="danger">En retard</Badge>}
                  {f.pending && <Badge tone="warning">En attente</Badge>}
                  <Amount value={f.amountMillimes} signed />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Aucun flux prévu jusqu’à cette date : le solde prévisionnel est égal au solde réel.</p>
      )}
      <div className="flex flex-wrap gap-2" aria-label="Hypothèses utilisées">
        {assumptions.map((a) => (
          <Badge key={a} tone="outline">
            {a}
          </Badge>
        ))}
      </div>
    </Card>
  );
}

function Term({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Amount value={value} tone={strong ? 'balance' : 'neutral'} size={strong ? 'lg' : 'md'} />
    </div>
  );
}

function Op({ children }: { children: React.ReactNode }) {
  return (
    <span aria-hidden className="hidden pb-0.5 text-lg text-muted-foreground md:block">
      {children}
    </span>
  );
}
