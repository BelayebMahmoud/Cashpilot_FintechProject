import { LocalDate } from '../shared/local-date';
import { Money } from '../shared/money';
import { type Comparison } from './simulation';
import { type Assumptions, type Flow, type FlowKind, type Projection } from './types';

/**
 * Serializable shapes (millimes + ISO dates) that cross the server → client boundary.
 * The simulator rebuilds domain flows from these to recompute projections in the browser.
 */
export interface FlowDto {
  key: string;
  date: string;
  amountMillimes: number;
  kind: FlowKind;
  label: string;
  overdue?: boolean;
  pending?: boolean;
  originalDate?: string;
}

export interface ProjectionPointDto {
  date: string;
  balanceMillimes: number;
  inflowMillimes: number;
  outflowMillimes: number;
  flowKeys: string[];
}

export interface ProjectionDto {
  from: string;
  horizon: number;
  realBalanceMillimes: number;
  points: ProjectionPointDto[];
  endBalanceMillimes: number;
  min: { date: string; balanceMillimes: number };
  firstNegativeDate: string | null;
  shortfalls: { from: string; to: string; minBalanceMillimes: number; days: number }[];
  totals: { inMillimes: number; outMillimes: number };
  assumptions: Assumptions;
}

export interface ComparisonDto {
  min: { base: { date: string; balanceMillimes: number }; sim: { date: string; balanceMillimes: number }; deltaMillimes: number };
  firstNegativeDate: { base: string | null; sim: string | null };
  runwayDays: { base: number | null; sim: number | null };
  endBalance: { baseMillimes: number; simMillimes: number; deltaMillimes: number };
  shortfallDays: { base: number; sim: number };
}

export function toFlowDto(f: Flow): FlowDto {
  return {
    key: f.key,
    date: f.date.toString(),
    amountMillimes: f.amount.millimes,
    kind: f.kind,
    label: f.label,
    ...(f.overdue ? { overdue: true } : {}),
    ...(f.pending ? { pending: true } : {}),
    ...(f.originalDate ? { originalDate: f.originalDate.toString() } : {}),
  };
}

export function fromFlowDto(d: FlowDto): Flow {
  return {
    key: d.key,
    date: LocalDate.parse(d.date),
    amount: Money.ofMillimes(d.amountMillimes),
    kind: d.kind,
    label: d.label,
    ...(d.overdue ? { overdue: true } : {}),
    ...(d.pending ? { pending: true } : {}),
    ...(d.originalDate ? { originalDate: LocalDate.parse(d.originalDate) } : {}),
  };
}

export function toProjectionDto(p: Projection): ProjectionDto {
  return {
    from: p.from.toString(),
    horizon: p.horizon,
    realBalanceMillimes: p.realBalance.millimes,
    points: p.points.map((pt) => ({
      date: pt.date.toString(),
      balanceMillimes: pt.balance.millimes,
      inflowMillimes: pt.inflow.millimes,
      outflowMillimes: pt.outflow.millimes,
      flowKeys: pt.flowKeys,
    })),
    endBalanceMillimes: p.endBalance.millimes,
    min: { date: p.min.date.toString(), balanceMillimes: p.min.balance.millimes },
    firstNegativeDate: p.firstNegativeDate?.toString() ?? null,
    shortfalls: p.shortfalls.map((s) => ({
      from: s.from.toString(),
      to: s.to.toString(),
      minBalanceMillimes: s.minBalance.millimes,
      days: s.days,
    })),
    totals: { inMillimes: p.totals.in.millimes, outMillimes: p.totals.out.millimes },
    assumptions: p.assumptions,
  };
}

export function toComparisonDto(c: Comparison): ComparisonDto {
  return {
    min: {
      base: { date: c.min.base.date.toString(), balanceMillimes: c.min.base.balance.millimes },
      sim: { date: c.min.sim.date.toString(), balanceMillimes: c.min.sim.balance.millimes },
      deltaMillimes: c.min.delta.millimes,
    },
    firstNegativeDate: {
      base: c.firstNegativeDate.base?.toString() ?? null,
      sim: c.firstNegativeDate.sim?.toString() ?? null,
    },
    runwayDays: c.runwayDays,
    endBalance: {
      baseMillimes: c.endBalance.base.millimes,
      simMillimes: c.endBalance.sim.millimes,
      deltaMillimes: c.endBalance.delta.millimes,
    },
    shortfallDays: c.shortfallDays,
  };
}
