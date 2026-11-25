'use client';

import * as React from 'react';
import { type ForecastDto } from '@cashpilot/application';
import { Card, cn, ExplanationPanel, Label, Switch, ToggleGroup, ToggleGroupItem } from '@cashpilot/ui';
import { formatDate, formatMoney } from '@cashpilot/ui/format';
import { ForecastChart } from '@/components/charts';
import { useUrlFilters } from '@/hooks';
import { explainDay, flowLabelMap } from './explain';

/** Horizon toggle + editable assumptions (URL-synced), chart, and the explanation of the clicked day. */
export function ForecastExplorer({ data }: { data: ForecastDto }) {
  const { set, pending } = useUrlFilters();
  const p = data.projection;
  const defaultDate = p.firstNegativeDate ?? p.min.date;
  const [selected, setSelected] = React.useState<string>(defaultDate);
  // derived during render (no effect): the explanation of the selected day
  const date = p.points.some((pt) => pt.date === selected) ? selected : defaultDate;
  const explanation = explainDay({ realBalanceMillimes: p.realBalanceMillimes, today: data.today, horizon: data.horizon, assumptions: data.assumptions, flows: data.flows, date });
  const labels = flowLabelMap(data.flows); // memoised by the React Compiler

  return (
    <div className={cn('min-w-0 space-y-4 sm:space-y-6', pending && 'opacity-70 transition-opacity')}>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-3 sm:px-4">
        <ToggleGroup type="single" value={String(data.horizon)} onValueChange={(v) => v && set({ horizon: v === '30' ? undefined : v })} aria-label="Horizon de prévision">
          {['30', '60', '90'].map((h) => (
            <ToggleGroupItem key={h} value={h} aria-label={`${h} jours`}>
              {h} j
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3" role="group" aria-label="Hypothèses">
          <div className="flex min-w-0 items-center gap-2">
            <Switch
              id="overdue-policy"
              checked={data.assumptions.overduePolicy === 'ROLL_TO_TODAY'}
              onCheckedChange={(v) => set({ overdue: v ? undefined : 'exclude' })}
            />
            <Label htmlFor="overdue-policy">Reporter les retards à aujourd’hui</Label>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <Switch id="pending" checked={data.assumptions.includePendingExpenses} onCheckedChange={(v) => set({ pending: v ? undefined : '0' })} />
            <Label htmlFor="pending">Inclure les dépenses en attente</Label>
          </div>
        </div>
      </div>

      <Card className="min-w-0 gap-4 rounded-xl p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <h2 className="text-lg font-medium">Solde prévisionnel — {data.horizon} jours</h2>
          <p className="text-xs text-muted-foreground">Sélectionnez une date sur le graphique pour voir le calcul</p>
        </div>
        <dl className="grid gap-4 border-y py-4 sm:grid-cols-2 sm:gap-0 sm:divide-x">
          <div className="min-w-0 sm:pr-5">
            <dt className="text-xs text-muted-foreground">Fin de période : </dt>
            <dd className={cn('mt-1 font-mono text-2xl font-medium wrap-anywhere tabular-nums sm:text-3xl', p.endBalanceMillimes < 0 && 'text-danger-foreground')}>
              {formatMoney(p.endBalanceMillimes)}
            </dd>
          </div>
          <div className="min-w-0 sm:pl-5">
            <dt className="text-xs text-muted-foreground">Point bas · {formatDate(p.min.date, 'short')}</dt>
            <dd className={cn('mt-1 font-mono text-xl font-medium wrap-anywhere tabular-nums sm:text-2xl', p.min.balanceMillimes < 0 && 'text-danger-foreground')}>
              {formatMoney(p.min.balanceMillimes)}
            </dd>
          </div>
        </dl>
        <ForecastChart points={p.points} shortfalls={p.shortfalls} today={data.today} flowLabels={labels} onSelectDate={setSelected} selectedDate={date} />
      </Card>

      <ExplanationPanel {...explanation} />
    </div>
  );
}
