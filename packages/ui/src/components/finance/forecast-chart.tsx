'use client';

import * as React from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Table as TableIcon } from 'lucide-react';
import { compactMoney, formatDate, formatMoney } from '../../lib/format';
import { cn } from '../../lib/utils';
import { Button } from '../primitives/button';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '../primitives/table';

export interface ChartPoint {
  date: string;
  balanceMillimes: number;
  inflowMillimes: number;
  outflowMillimes: number;
  flowKeys: string[];
}

export interface ChartShortfall {
  from: string;
  to: string;
  minBalanceMillimes: number;
  days: number;
}

export interface ForecastChartProps {
  points: ChartPoint[];
  scenarioPoints?: ChartPoint[];
  shortfalls: ChartShortfall[];
  today: string;
  /** key → label, to name the flows of a day in the tooltip. */
  flowLabels?: Record<string, { label: string; amountMillimes: number }>;
  onSelectDate?: (date: string) => void;
  selectedDate?: string | null;
  height?: number;
  className?: string;
}

interface Row {
  date: string;
  base: number;
  sim?: number;
  flowsIn: number;
  flowsOut: number;
  keys: string[];
  simKeys?: string[];
}

/** "Solde minimal −1 000 DT le 16 déc., négatif pendant 15 jours" */
export function summarizeProjection(points: ChartPoint[], shortfalls: ChartShortfall[]): string {
  if (points.length === 0) return 'Aucune donnée';
  const min = points.reduce((m, p) => (p.balanceMillimes < m.balanceMillimes ? p : m), points[0]!);
  const negDays = shortfalls.reduce((s, x) => s + x.days, 0);
  const end = points[points.length - 1]!;
  return `Solde minimal ${formatMoney(min.balanceMillimes)} le ${formatDate(min.date, 'short')}, ${
    negDays > 0 ? `négatif pendant ${negDays} jour${negDays > 1 ? 's' : ''}` : 'jamais négatif'
  } ; solde final ${formatMoney(end.balanceMillimes)} le ${formatDate(end.date, 'short')}.`;
}

/**
 * The "flight-path" forecast chart: step line (the balance changes on a date), zero line,
 * tinted shortfall zones, today marker, dashed scenario line, accessible summary + data table.
 */
export function ForecastChart({
  points,
  scenarioPoints,
  shortfalls,
  today,
  flowLabels,
  onSelectDate,
  selectedDate,
  height = 300,
  className,
}: ForecastChartProps) {
  const [showTable, setShowTable] = React.useState(false);
  const rows: Row[] = points.map((p, i) => ({
    date: p.date,
    base: p.balanceMillimes,
    flowsIn: p.inflowMillimes,
    flowsOut: p.outflowMillimes,
    keys: p.flowKeys,
    ...(scenarioPoints?.[i] ? { sim: scenarioPoints[i]!.balanceMillimes, simKeys: scenarioPoints[i]!.flowKeys } : {}),
  }));
  const summary = summarizeProjection(scenarioPoints ?? points, shortfalls);
  const horizon = points.length - 1;
  const tickInterval = horizon <= 31 ? 4 : horizon <= 61 ? 9 : 14;

  return (
    <div className={cn('space-y-2', className)}>
      <div role="img" aria-label={`${scenarioPoints ? 'Projection simulée. ' : 'Projection du solde. '}${summary}`} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={rows}
            margin={{ top: 16, right: 12, bottom: 0, left: 0 }}
            onClick={(state) => {
              const label = (state as { activeLabel?: string | number } | null)?.activeLabel;
              if (label && onSelectDate) onSelectDate(String(label));
            }}
          >
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => formatDate(d, 'short')}
              interval={tickInterval}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <YAxis
              tickFormatter={(v: number) => compactMoney(v)}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              width={72}
              tickCount={5}
              domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(0, max)]}
            />
            {shortfalls.map((s) => (
              <ReferenceArea key={s.from} x1={s.from} x2={s.to} fill="var(--chart-negative-zone)" strokeOpacity={0} ifOverflow="extendDomain" />
            ))}
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.6} />
            <ReferenceLine
              x={today}
              stroke="var(--muted-foreground)"
              strokeDasharray="2 3"
              label={{ value: "Aujourd'hui", position: 'insideTopLeft', fontSize: 11, fill: 'var(--muted-foreground)' }}
            />
            {selectedDate && <ReferenceLine x={selectedDate} stroke="var(--primary)" strokeOpacity={0.5} />}
            <Tooltip
              content={(props) => (
                <ChartTooltip active={props.active} payload={props.payload} flowLabels={flowLabels} scenario={!!scenarioPoints} />
              )}
            />
            <Line
              type="stepAfter"
              dataKey="base"
              name="Prévision"
              stroke="var(--chart-baseline)"
              strokeWidth={2}
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: Row; index?: number }) => <FlowDot key={`b${props.index}`} {...props} />}
              activeDot={{ r: 4 }}
            />
            {scenarioPoints && (
              <Line
                type="stepAfter"
                dataKey="sim"
                name="Scénario"
                stroke="var(--chart-scenario)"
                strokeWidth={2}
                strokeDasharray="4 4"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 4 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4" aria-hidden>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 bg-chart-baseline" /> Prévision
          </span>
          {scenarioPoints && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-5 border-t-2 border-dashed border-chart-scenario" /> Scénario
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-danger/15" /> Manque de trésorerie
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
          <TableIcon /> {showTable ? 'Masquer les données' : 'Voir les données'}
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {summary}
      </p>
      {showTable && (
        <div className="max-h-80 overflow-auto rounded-md border">
          <Table>
            <TableCaption>Solde prévisionnel jour par jour</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead numeric>Entrées</TableHead>
                <TableHead numeric>Sorties</TableHead>
                <TableHead numeric>Solde prévu</TableHead>
                {scenarioPoints && <TableHead numeric>Scénario</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.date}>
                  <TableCell>{formatDate(r.date)}</TableCell>
                  <TableCell numeric>{r.flowsIn ? formatMoney(r.flowsIn) : '—'}</TableCell>
                  <TableCell numeric>{r.flowsOut ? formatMoney(r.flowsOut) : '—'}</TableCell>
                  <TableCell numeric className={cn(r.base < 0 && 'text-danger')}>
                    {formatMoney(r.base)}
                  </TableCell>
                  {scenarioPoints && (
                    <TableCell numeric className={cn((r.sim ?? 0) < 0 && 'text-danger')}>
                      {formatMoney(r.sim ?? 0)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** Small up/down markers on days with flows (inflow above the line, outflow below). */
function FlowDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: Row }) {
  if (cx == null || cy == null || !payload) return <g />;
  return (
    <g aria-hidden>
      {payload.flowsIn > 0 && <path d={`M${cx - 4},${cy - 6} L${cx + 4},${cy - 6} L${cx},${cy - 11} Z`} fill="var(--inflow)" />}
      {payload.flowsOut > 0 && <path d={`M${cx - 4},${cy + 6} L${cx + 4},${cy + 6} L${cx},${cy + 11} Z`} fill="var(--muted-foreground)" />}
    </g>
  );
}

function ChartTooltip({
  active,
  payload,
  flowLabels,
  scenario,
}: {
  active?: boolean;
  payload?: readonly { payload?: unknown }[];
  flowLabels?: ForecastChartProps['flowLabels'];
  scenario: boolean;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]!.payload as Row;
  const keys = scenario ? (row.simKeys ?? row.keys) : row.keys;
  const flows = keys.map((k) => flowLabels?.[k]).filter((f): f is { label: string; amountMillimes: number } => !!f);
  return (
    <div className="max-w-72 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{formatDate(row.date, 'long')}</p>
      <p className="tabular-nums">
        Solde prévu : <strong className={cn(row.base < 0 && 'text-danger')}>{formatMoney(row.base)}</strong>
      </p>
      {row.sim !== undefined && (
        <p className="tabular-nums">
          Scénario : <strong className={cn(row.sim < 0 && 'text-danger')}>{formatMoney(row.sim)}</strong>{' '}
          <span className="text-muted-foreground">({formatMoney(row.sim - row.base, { signed: true })})</span>
        </p>
      )}
      {flows.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t pt-2">
          {flows.slice(0, 6).map((f, i) => (
            <li key={i} className="flex justify-between gap-3 tabular-nums">
              <span className="truncate">{f.label}</span>
              <span className={cn(f.amountMillimes > 0 && 'text-inflow')}>{formatMoney(f.amountMillimes, { signed: true })}</span>
            </li>
          ))}
          {flows.length > 6 && <li className="text-muted-foreground">+ {flows.length - 6} autres flux</li>}
        </ul>
      )}
    </div>
  );
}
