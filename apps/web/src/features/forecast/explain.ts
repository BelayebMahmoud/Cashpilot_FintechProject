import {
  explainPoint,
  fromFlowDto,
  LocalDate,
  Money,
  project,
  type Assumptions,
  type FlowDto,
} from '@cashpilot/domain';
import { type ExplanationPanelProps } from '@cashpilot/ui';

export function assumptionLabels(a: Assumptions): string[] {
  return [
    a.overduePolicy === 'ROLL_TO_TODAY' ? 'Retards reportés à aujourd’hui' : 'Retards exclus',
    a.includePendingExpenses ? 'Dépenses en attente incluses' : 'Dépenses en attente exclues',
    'Montants restants uniquement (paiements reçus déjà dans le solde réel)',
  ];
}

/**
 * Explanation of one day with the SAME domain functions as the server:
 * real (at today) + receipts expected up to d − disbursements expected up to d.
 */
export function explainDay(input: { realBalanceMillimes: number; today: string; horizon: number; assumptions: Assumptions; flows: FlowDto[]; date: string }): ExplanationPanelProps {
  const flows = input.flows.map(fromFlowDto);
  const projection = project(Money.ofMillimes(input.realBalanceMillimes), flows, LocalDate.parse(input.today), input.horizon, input.assumptions);
  const e = explainPoint(projection, flows, LocalDate.parse(input.date));
  return {
    date: input.date,
    realAsOf: input.today,
    realBalanceMillimes: e.realBalance.millimes,
    expectedInMillimes: e.expectedIn.millimes,
    expectedOutMillimes: e.expectedOut.millimes,
    balanceMillimes: e.balance.millimes,
    flows: e.flows.map((f) => ({
      key: f.key,
      date: f.date.toString(),
      label: f.label,
      amountMillimes: f.amount.millimes,
      ...(f.overdue ? { overdue: true } : {}),
      ...(f.pending ? { pending: true } : {}),
      ...(f.originalDate ? { originalDate: f.originalDate.toString() } : {}),
    })),
    assumptions: assumptionLabels(input.assumptions),
  };
}

export function flowLabelMap(flows: FlowDto[]): Record<string, { label: string; amountMillimes: number }> {
  return Object.fromEntries(flows.map((f) => [f.key, { label: f.label, amountMillimes: f.amountMillimes }]));
}
