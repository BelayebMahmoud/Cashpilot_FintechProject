import {
  assertCan,
  buildBaselineFlows,
  DEFAULT_ASSUMPTIONS,
  LocalDate,
  Money,
  NotFound,
  PlannedFlow,
  project,
  toFlowDto,
  toProjectionDto,
  type Assumptions,
  type Direction,
  type Flow,
  type FlowDto,
  type Projection,
  type ProjectionDto,
  type Recurrence,
} from '@cashpilot/domain';
import { type Actor } from '../shared/actor';
import { type Deps } from '../shared/deps';
import { attempt, ok, type Result } from '../shared/result';

/** Planned flows are expanded up to this many days ahead: the longest horizon plus room for simulation shifts. */
export const FORECAST_WINDOW_DAYS = 180;

export interface Baseline {
  today: LocalDate;
  realBalance: Money;
  flows: Flow[];
  assumptions: Assumptions;
}

/** Loads real data through the read port and builds the baseline flows (shared by forecast, simulation, dashboard). */
export async function loadBaseline(deps: Deps, companyId: string, assumptions: Assumptions): Promise<Baseline> {
  const today = deps.clock.today();
  const data = await deps.forecast.load(companyId, today, today.addDays(FORECAST_WINDOW_DAYS));
  return { today, realBalance: data.realBalance, flows: buildBaselineFlows(data, assumptions, today), assumptions };
}

export function projectBaseline(b: Baseline, horizon: number): Projection {
  return project(b.realBalance, b.flows, b.today, horizon, b.assumptions);
}

export interface WeekRow {
  weekStart: string;
  inMillimes: number;
  outMillimes: number;
  endBalanceMillimes: number;
  flows: FlowDto[];
}

export interface ForecastDto {
  today: string;
  horizon: number;
  assumptions: Assumptions;
  projection: ProjectionDto;
  /** All baseline flows in the window: the client explains points and simulates from these. */
  flows: FlowDto[];
  weeks: WeekRow[];
}

function groupByWeek(p: Projection, flows: Flow[]): WeekRow[] {
  const end = p.from.addDays(p.horizon);
  const weeks = new Map<string, WeekRow>();
  for (const pt of p.points) {
    const key = pt.date.startOfWeek().toString();
    const w = weeks.get(key) ?? { weekStart: key, inMillimes: 0, outMillimes: 0, endBalanceMillimes: 0, flows: [] };
    w.inMillimes += pt.inflow.millimes;
    w.outMillimes += pt.outflow.millimes;
    w.endBalanceMillimes = pt.balance.millimes;
    weeks.set(key, w);
  }
  for (const f of flows) {
    if (f.date.isAfter(end)) continue;
    const date = f.date.isBefore(p.from) ? p.from : f.date;
    weeks.get(date.startOfWeek().toString())?.flows.push(toFlowDto(f));
  }
  return [...weeks.values()];
}

export class GetForecast {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { horizon: 30 | 60 | 90; assumptions?: Partial<Assumptions> }): Promise<Result<ForecastDto>> {
    return attempt(async () => {
      assertCan(actor, 'forecast.read');
      const assumptions = { ...DEFAULT_ASSUMPTIONS, ...input.assumptions };
      const baseline = await loadBaseline(this.deps, actor.companyId, assumptions);
      const projection = projectBaseline(baseline, input.horizon);
      return ok({
        today: baseline.today.toString(),
        horizon: input.horizon,
        assumptions,
        projection: toProjectionDto(projection),
        flows: baseline.flows.map(toFlowDto),
        weeks: groupByWeek(projection, baseline.flows),
      });
    });
  }
}

export interface PlannedFlowDto {
  id: string;
  label: string;
  direction: Direction;
  amountMillimes: number;
  expectedDate: string;
  recurrence: Recurrence;
  endDate: string | null;
  cancelled: boolean;
  nextOccurrence: string | null;
}

function toPlannedFlowDto(f: PlannedFlow, today: LocalDate): PlannedFlowDto {
  const s = f.snapshot();
  return {
    id: s.id,
    label: s.label,
    direction: s.direction,
    amountMillimes: s.amount.millimes,
    expectedDate: s.expectedDate.toString(),
    recurrence: s.recurrence,
    endDate: s.endDate?.toString() ?? null,
    cancelled: s.cancelled,
    nextOccurrence: f.occurrencesBetween(today, today.addDays(400))[0]?.toString() ?? null,
  };
}

export class CreatePlannedFlow {
  constructor(private readonly deps: Deps) {}

  async execute(
    actor: Actor,
    input: { label: string; direction: Direction; amountMillimes: number; expectedDate: string; recurrence: Recurrence; endDate?: string | null },
  ): Promise<Result<PlannedFlowDto>> {
    const today = this.deps.clock.today();
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'plannedFlow.write');
        const flow = PlannedFlow.create(
          this.deps.ids.next(),
          actor.companyId,
          actor.userId,
          {
            label: input.label,
            direction: input.direction,
            amount: Money.ofMillimes(input.amountMillimes),
            expectedDate: LocalDate.parse(input.expectedDate),
            recurrence: input.recurrence,
            endDate: input.endDate ? LocalDate.parse(input.endDate) : null,
          },
          today,
        );
        await tx.plannedFlows.save(flow);
        const dto = toPlannedFlowDto(flow, today);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'plannedFlow.created',
          entityType: 'PlannedFlow',
          entityId: flow.id,
          after: dto,
        });
        return ok(dto);
      }),
    );
  }
}

export class CancelPlannedFlow {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'plannedFlow.write');
        const flow = await tx.plannedFlows.byId(actor.companyId, input.id);
        if (!flow) throw new NotFound();
        flow.cancel();
        await tx.plannedFlows.save(flow);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'plannedFlow.cancelled',
          entityType: 'PlannedFlow',
          entityId: flow.id,
          before: { cancelled: false },
          after: { cancelled: true },
        });
        return ok(undefined);
      }),
    );
  }
}

export class ListPlannedFlows {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor): Promise<Result<PlannedFlowDto[]>> {
    const today = this.deps.clock.today();
    return attempt(async () => {
      assertCan(actor, 'forecast.read');
      const flows = await this.deps.uow.read((r) => r.plannedFlows.list(actor.companyId, { includeCancelled: true }));
      return ok(
        flows
          .map((f) => toPlannedFlowDto(f, today))
          .sort((a, b) => Number(a.cancelled) - Number(b.cancelled) || a.expectedDate.localeCompare(b.expectedDate)),
      );
    });
  }
}
