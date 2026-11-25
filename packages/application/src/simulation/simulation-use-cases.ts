import {
  applyAdjustments,
  assertCan,
  compareProjections,
  DEFAULT_ASSUMPTIONS,
  DomainError,
  LocalDate,
  NotFound,
  project,
  toComparisonDto,
  toFlowDto,
  toProjectionDto,
  type Adjustment,
  type Assumptions,
  type ComparisonDto,
  type FlowDto,
  type ProjectionDto,
} from '@cashpilot/domain';
import { type ScenarioRecord } from '../ports';
import { type Actor } from '../shared/actor';
import { type Deps } from '../shared/deps';
import { attempt, ok, type Result } from '../shared/result';
import { loadBaseline } from '../forecast/forecast-use-cases';

/*
 * Simulation depends ONLY on the ForecastReadModel (read) and the ScenarioRepository.
 * It never receives invoice, expense or ledger repositories for writing: real data cannot change.
 */

export interface SimulationInput {
  horizon: 30 | 60 | 90;
  assumptions?: Partial<Assumptions>;
  adjustments: Adjustment[];
}

export interface SimulationDto {
  today: string;
  horizon: number;
  assumptions: Assumptions;
  baseFlows: FlowDto[];
  base: ProjectionDto;
  sim: ProjectionDto;
  comparison: ComparisonDto;
}

export class SimulateScenario {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: SimulationInput): Promise<Result<SimulationDto>> {
    return attempt(async () => {
      assertCan(actor, 'simulation.use');
      return ok(await simulate(this.deps, actor.companyId, input));
    });
  }
}

async function simulate(deps: Deps, companyId: string, input: SimulationInput): Promise<SimulationDto> {
  const assumptions = { ...DEFAULT_ASSUMPTIONS, ...input.assumptions };
  const baseline = await loadBaseline(deps, companyId, assumptions);
  const simFlows = applyAdjustments(baseline.flows, input.adjustments);
  const base = project(baseline.realBalance, baseline.flows, baseline.today, input.horizon, assumptions);
  const sim = project(baseline.realBalance, simFlows, baseline.today, input.horizon, assumptions);
  return {
    today: baseline.today.toString(),
    horizon: input.horizon,
    assumptions,
    baseFlows: baseline.flows.map(toFlowDto),
    base: toProjectionDto(base),
    sim: toProjectionDto(sim),
    comparison: toComparisonDto(compareProjections(base, sim)),
  };
}

export interface ScenarioDto {
  id: string;
  name: string;
  baseDate: string;
  horizonDays: number;
  assumptions: Assumptions;
  adjustments: Adjustment[];
  createdById: string;
  updatedAt: string;
}

function toScenarioDto(s: ScenarioRecord): ScenarioDto {
  return {
    id: s.id,
    name: s.name,
    baseDate: s.baseDate.toString(),
    horizonDays: s.horizonDays,
    assumptions: s.assumptions,
    adjustments: s.adjustments,
    createdById: s.createdById,
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Saves (creates or updates) a scenario after recomputing it server-side, which validates every adjustment. */
export class SaveScenario {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: SimulationInput & { id?: string; name: string }): Promise<Result<ScenarioDto>> {
    return attempt(async () => {
      assertCan(actor, 'simulation.use');
      const name = input.name.trim();
      if (name.length < 2) throw new DomainError('VALIDATION', 'Name required', { field: 'name' });
      const result = await simulate(this.deps, actor.companyId, input); // throws ADJUSTMENT_TARGET_NOT_FOUND
      return this.deps.uow.run(async (tx) => {
        const existing = input.id ? await tx.scenarios.byId(actor.companyId, input.id) : null;
        if (input.id && !existing) throw new NotFound();
        const record: ScenarioRecord = {
          id: existing?.id ?? this.deps.ids.next(),
          companyId: actor.companyId,
          name,
          baseDate: LocalDate.parse(result.today),
          horizonDays: input.horizon,
          assumptions: result.assumptions,
          adjustments: input.adjustments,
          createdById: existing?.createdById ?? actor.userId,
          updatedAt: this.deps.clock.now(),
        };
        await tx.scenarios.save(record);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: existing ? 'scenario.updated' : 'scenario.created',
          entityType: 'Scenario',
          entityId: record.id,
          after: { name, adjustments: input.adjustments.length, horizon: input.horizon },
        });
        return ok(toScenarioDto(record));
      });
    });
  }
}

export class ListScenarios {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor): Promise<Result<ScenarioDto[]>> {
    return attempt(async () => {
      assertCan(actor, 'simulation.use');
      const list = await this.deps.uow.read((r) => r.scenarios.list(actor.companyId));
      return ok(list.map(toScenarioDto).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    });
  }
}

/**
 * A saved scenario re-simulated on today's real data. Adjustments whose target no
 * longer exists (invoice paid, expense settled…) are reported instead of failing.
 */
export class GetScenario {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<{ scenario: ScenarioDto; simulation: SimulationDto; staleAdjustments: number[] }>> {
    return attempt(async () => {
      assertCan(actor, 'simulation.use');
      const scenario = await this.deps.uow.read((r) => r.scenarios.byId(actor.companyId, input.id));
      if (!scenario) throw new NotFound();
      const horizon = ([30, 60, 90] as const).find((h) => h === scenario.horizonDays) ?? 30;
      const baseline = await loadBaseline(this.deps, actor.companyId, scenario.assumptions);
      const stale: number[] = [];
      const valid = scenario.adjustments.filter((adj, i) => {
        try {
          applyAdjustments(baseline.flows, [adj]);
          return true;
        } catch {
          stale.push(i);
          return false;
        }
      });
      const simulation = await simulate(this.deps, actor.companyId, { horizon, assumptions: scenario.assumptions, adjustments: valid });
      return ok({ scenario: toScenarioDto(scenario), simulation, staleAdjustments: stale });
    });
  }
}

export class DuplicateScenario {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<ScenarioDto>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'simulation.use');
        const source = await tx.scenarios.byId(actor.companyId, input.id);
        if (!source) throw new NotFound();
        const copy: ScenarioRecord = {
          ...source,
          id: this.deps.ids.next(),
          name: `${source.name} (copie)`,
          createdById: actor.userId,
          updatedAt: this.deps.clock.now(),
        };
        await tx.scenarios.save(copy);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'scenario.duplicated',
          entityType: 'Scenario',
          entityId: copy.id,
          after: { from: source.id, name: copy.name },
        });
        return ok(toScenarioDto(copy));
      }),
    );
  }
}

export class DeleteScenario {
  constructor(private readonly deps: Deps) {}

  async execute(actor: Actor, input: { id: string }): Promise<Result<void>> {
    return attempt(() =>
      this.deps.uow.run(async (tx) => {
        assertCan(actor, 'simulation.use');
        const s = await tx.scenarios.byId(actor.companyId, input.id);
        if (!s) throw new NotFound();
        await tx.scenarios.delete(actor.companyId, s.id);
        await tx.audit.record({
          companyId: actor.companyId,
          actorId: actor.userId,
          action: 'scenario.deleted',
          entityType: 'Scenario',
          entityId: s.id,
          before: { name: s.name },
        });
        return ok(undefined);
      }),
    );
  }
}
