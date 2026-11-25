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
    <div className={cn('space-y-6', pending && 'opacity-70 transition-opacity')}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <ToggleGroup type="single" value={String(data.horizon)} onValueChange={(v) => v && set({ horizon: v === '30' ? undefined : v })} aria-label="Horizon de prévision">
          {['30', '60', '90'].map((h) => (
            <ToggleGroupItem key={h} value={h} aria-label={`${h} jours`}>
              {h} j
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex flex-wrap items-center gap-4" role="group" aria-label="Hypothèses">
          <div className="flex items-center gap-2">
            <Switch
              id="overdue-policy"
              checked={data.assumptions.overduePolicy === 'ROLL_TO_TODAY'}
              onCheckedChange={(v) => set({ overdue: v ? undefined : 'exclude' })}
            />
            <Label htmlFor="overdue-policy">Inclure les retards (reportés à aujourd’hui)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="pending" checked={data.assumptions.includePendingExpenses} onCheckedChange={(v) => set({ pending: v ? undefined : '0' })} />
            <Label htmlFor="pending">Inclure les dépenses en attente</Label>
          </div>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Solde prévisionnel — {data.horizon} jours</h2>
          <p className="text-sm text-muted-foreground">
            Fin de période : <strong className={cn(p.endBalanceMillimes < 0 && 'text-danger')}>{formatMoney(p.endBalanceMillimes)}</strong> · point bas :{' '}
            <strong className={cn(p.min.balanceMillimes < 0 && 'text-danger')}>{formatMoney(p.min.balanceMillimes)}</strong> le {formatDate(p.min.date, 'short')}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Cliquez sur un jour du graphique pour voir le détail du calcul.</p>
        <ForecastChart points={p.points} shortfalls={p.shortfalls} today={data.today} flowLabels={labels} onSelectDate={setSelected} selectedDate={date} />
      </Card>

      <ExplanationPanel {...explanation} />
    </div>
  );
}
