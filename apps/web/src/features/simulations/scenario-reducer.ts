import {
  applyAdjustments,
  compareProjections,
  DomainError,
  fromFlowDto,
  LocalDate,
  Money,
  project,
  toComparisonDto,
  toProjectionDto,
  type Adjustment,
  type Assumptions,
  type ComparisonDto,
  type FlowDto,
  type ProjectionDto,
} from '@cashpilot/domain';

/**
 * Simulator state: the list of what-if adjustments, edited with `useReducer`.
 * Each item has a stable `id` for React keys; `adjustment` is the plain domain JSON.
 */
export interface AdjustmentItem {
  id: string;
  adjustment: Adjustment;
}

export type ScenarioAction =
  | { type: 'add'; item: AdjustmentItem }
  | { type: 'update'; id: string; adjustment: Adjustment }
  | { type: 'remove'; id: string }
  | { type: 'reset'; items: AdjustmentItem[] };

export function scenarioReducer(state: AdjustmentItem[], action: ScenarioAction): AdjustmentItem[] {
  switch (action.type) {
    case 'add':
      return [...state, action.item];
    case 'update':
      return state.map((i) => (i.id === action.id ? { ...i, adjustment: action.adjustment } : i));
    case 'remove':
      return state.filter((i) => i.id !== action.id);
    case 'reset':
      return action.items;
  }
}

export interface SimulationResult {
  base: ProjectionDto;
  sim: ProjectionDto;
  comparison: ComparisonDto;
  error: string | null;
}

/**
 * Recomputes baseline and scenario in the browser with the pure domain engine.
 * The server recomputes again when the scenario is saved — real data is never touched.
 */
export function simulate(input: { realBalanceMillimes: number; today: string; horizon: number; assumptions: Assumptions; baseFlows: FlowDto[]; adjustments: Adjustment[] }): SimulationResult {
  const flows = input.baseFlows.map(fromFlowDto);
  const real = Money.ofMillimes(input.realBalanceMillimes);
  const today = LocalDate.parse(input.today);
  const base = project(real, flows, today, input.horizon, input.assumptions);
  let error: string | null = null;
  let simFlows = flows;
  try {
    simFlows = applyAdjustments(flows, input.adjustments);
  } catch (e) {
    error = e instanceof DomainError ? e.code : 'INVALID';
  }
  const sim = project(real, simFlows, today, input.horizon, input.assumptions);
  return { base: toProjectionDto(base), sim: toProjectionDto(sim), comparison: toComparisonDto(compareProjections(base, sim)), error };
}

/** Is the adjustment complete enough to be applied? (amounts > 0, dates set, targets chosen) */
export function isComplete(a: Adjustment): boolean {
  switch (a.type) {
    case 'DELAY_RECEIVABLE':
      return !!a.invoiceId && Number.isInteger(a.days);
    case 'SHIFT_PAYABLE':
      return !!a.expenseId && Number.isInteger(a.days);
    case 'ADD_INFLOW':
    case 'ADD_OUTFLOW':
      return a.amountMillimes > 0 && /^\d{4}-\d{2}-\d{2}$/.test(a.date);
    case 'EXCLUDE_FLOW':
      return !!a.flowKey;
  }
}
