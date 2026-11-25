'use client';

import * as React from 'react';
import { useDeferredValue, useReducer } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarClock, ChevronDown, FlaskConical, Minus, Plus, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import { type Adjustment, type Assumptions, type ErrorCode, type FlowDto } from '@cashpilot/domain';
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  cn,
  DateField,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  Input,
  Label,
  MoneyInput,
  NativeSelect,
  toast,
  ToggleGroup,
  ToggleGroupItem,
} from '@cashpilot/ui';
import { formatDate, formatMoney } from '@cashpilot/ui/format';
import { ForecastChart } from '@/components/charts';
import { CompanyField, FormError, SubmitButton } from '@/components/forms';
import { useFormAction } from '@/hooks/use-form-action';
import { type ActionState } from '@/lib/action-state';
import { messageFor } from '@/lib/errors';
import { flowLabelMap } from '@/features/forecast/explain';
import { saveScenarioAction } from './actions';
import { isComplete, scenarioReducer, simulate, type AdjustmentItem } from './scenario-reducer';

export interface WorkbenchProps {
  company: string;
  today: string;
  realBalanceMillimes: number;
  assumptions: Assumptions;
  baseFlows: FlowDto[];
  initialHorizon: 30 | 60 | 90;
  scenario?: { id: string; name: string; adjustments: Adjustment[] };
  staleCount?: number;
}

let seq = 0;
const newId = () => `adj-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/**
 * Three zones: hypotheses (left), chart baseline vs scenario (centre), comparison strip (top).
 * Recomputed live in the browser with the pure domain engine; `useDeferredValue` keeps typing fluid.
 */
export function SimulationWorkbench({ company, today, realBalanceMillimes, assumptions, baseFlows, initialHorizon, scenario, staleCount = 0 }: WorkbenchProps) {
  const [items, dispatch] = useReducer(scenarioReducer, scenario?.adjustments.map((adjustment) => ({ id: newId(), adjustment })) ?? []);
  const [horizon, setHorizon] = React.useState<30 | 60 | 90>(initialHorizon);
  const deferredItems = useDeferredValue(items);
  const stale = deferredItems !== items;

  const applied = deferredItems.map((i) => i.adjustment).filter(isComplete);
  const result = simulate({ realBalanceMillimes, today, horizon, assumptions, baseFlows, adjustments: applied });
  const labels = flowLabelMap(baseFlows);
  const c = result.comparison;

  const receivables = baseFlows.filter((f) => f.kind === 'RECEIVABLE');
  const payables = baseFlows.filter((f) => f.kind === 'PAYABLE');

  function add(type: Adjustment['type']) {
    const defaults: Record<Adjustment['type'], Adjustment> = {
      DELAY_RECEIVABLE: { type: 'DELAY_RECEIVABLE', invoiceId: receivables[0]?.key.slice('invoice:'.length) ?? '', days: 20 },
      SHIFT_PAYABLE: { type: 'SHIFT_PAYABLE', expenseId: payables[0]?.key.slice('expense:'.length) ?? '', days: 15 },
      ADD_OUTFLOW: { type: 'ADD_OUTFLOW', label: '', amountMillimes: 0, date: today },
      ADD_INFLOW: { type: 'ADD_INFLOW', label: '', amountMillimes: 0, date: today },
      EXCLUDE_FLOW: { type: 'EXCLUDE_FLOW', flowKey: baseFlows[0]?.key ?? '' },
    };
    dispatch({ type: 'add', item: { id: newId(), adjustment: defaults[type] } });
  }

  return (
    <div className="space-y-4">
      <Alert tone="info" className="sticky top-14 z-10">
        <FlaskConical />
        <AlertDescription>
          <strong>Simulation</strong> — aucune donnée réelle n&apos;est modifiée.
        </AlertDescription>
      </Alert>
      {staleCount > 0 && (
        <Alert tone="warning">
          <TriangleAlert />
          <AlertDescription>
            {staleCount} hypothèse{staleCount > 1 ? 's visaient' : ' visait'} un flux qui n&apos;existe plus (facture réglée, dépense payée…) et {staleCount > 1 ? 'ont été retirées' : 'a été retirée'}.
          </AlertDescription>
        </Alert>
      )}

      {/* comparison strip */}
      <section aria-label="Comparaison prévision / scénario" className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', stale && 'opacity-70')}>
        <Compare label="Point le plus bas" base={formatMoney(c.min.base.balanceMillimes)} sim={formatMoney(c.min.sim.balanceMillimes)} delta={c.min.deltaMillimes} hint={`le ${formatDate(c.min.sim.date, 'short')}`} />
        <Compare
          label="Premier jour négatif"
          base={c.firstNegativeDate.base ? formatDate(c.firstNegativeDate.base, 'short') : 'aucun'}
          sim={c.firstNegativeDate.sim ? formatDate(c.firstNegativeDate.sim, 'short') : 'aucun'}
          worse={!!c.firstNegativeDate.sim && (!c.firstNegativeDate.base || c.firstNegativeDate.sim < c.firstNegativeDate.base)}
          better={!c.firstNegativeDate.sim && !!c.firstNegativeDate.base}
        />
        <Compare
          label="Autonomie"
          base={c.runwayDays.base === null ? `> ${horizon} j` : `${c.runwayDays.base} j`}
          sim={c.runwayDays.sim === null ? `> ${horizon} j` : `${c.runwayDays.sim} j`}
          worse={(c.runwayDays.sim ?? Infinity) < (c.runwayDays.base ?? Infinity)}
          better={(c.runwayDays.sim ?? Infinity) > (c.runwayDays.base ?? Infinity)}
        />
        <Compare label={`Solde à J+${horizon}`} base={formatMoney(c.endBalance.baseMillimes)} sim={formatMoney(c.endBalance.simMillimes)} delta={c.endBalance.deltaMillimes} />
      </section>
      <p className="sr-only" aria-live="polite">
        Scénario : point bas {formatMoney(c.min.sim.balanceMillimes)}, {c.firstNegativeDate.sim ? `premier jour négatif le ${formatDate(c.firstNegativeDate.sim)}` : 'jamais négatif'}, {c.shortfallDays.sim} jours de manque.
      </p>

      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        {/* hypotheses */}
        <Card className="gap-3 self-start">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Hypothèses ({items.length})</h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <Plus /> Ajouter une hypothèse <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={receivables.length === 0} onSelect={() => add('DELAY_RECEIVABLE')}>
                  <CalendarClock /> Retarder un encaissement
                </DropdownMenuItem>
                <DropdownMenuItem disabled={payables.length === 0} onSelect={() => add('SHIFT_PAYABLE')}>
                  <CalendarClock /> Décaler une dépense
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => add('ADD_OUTFLOW')}>
                  <Minus /> Ajouter une dépense
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => add('ADD_INFLOW')}>
                  <Plus /> Ajouter une rentrée
                </DropdownMenuItem>
                <DropdownMenuItem disabled={baseFlows.length === 0} onSelect={() => add('EXCLUDE_FLOW')}>
                  <Trash2 /> Exclure un flux
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {result.error && (
            <p className="text-sm text-danger" role="alert">
              {messageFor(result.error as ErrorCode)}
            </p>
          )}
          {items.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Ajoutez une hypothèse (retard client, nouvelle dépense, rentrée prévue…) : la courbe violette se met à jour instantanément.
            </p>
          ) : (
            <ol className="space-y-3">
              {items.map((item, i) => (
                <li key={item.id}>
                  <AdjustmentCard
                    index={i}
                    item={item}
                    receivables={receivables}
                    payables={payables}
                    flows={baseFlows}
                    onChange={(adjustment) => dispatch({ type: 'update', id: item.id, adjustment })}
                    onRemove={() => dispatch({ type: 'remove', id: item.id })}
                  />
                </li>
              ))}
            </ol>
          )}
          {items.length > 0 && (
            <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => dispatch({ type: 'reset', items: [] })}>
              <RotateCcw /> Tout retirer
            </Button>
          )}
          <SaveScenarioForm company={company} scenario={scenario} horizon={horizon} adjustments={items.map((i) => i.adjustment).filter(isComplete)} />
        </Card>

        {/* chart */}
        <Card className={cn('min-w-0', stale && 'opacity-80')}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Prévision (trait plein) vs scénario (pointillés)</h2>
            <ToggleGroup type="single" value={String(horizon)} onValueChange={(v) => v && setHorizon(Number(v) as 30 | 60 | 90)} aria-label="Horizon">
              {[30, 60, 90].map((h) => (
                <ToggleGroupItem key={h} value={String(h)}>
                  {h} j
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <ForecastChart
            points={result.base.points}
            scenarioPoints={result.sim.points}
            shortfalls={result.sim.shortfalls}
            today={today}
            flowLabels={labels}
            height={360}
          />
          {result.sim.shortfalls.length > 0 && (
            <ul className="space-y-1 text-sm">
              {result.sim.shortfalls.map((s) => (
                <li key={s.from} className="text-danger">
                  Manque de trésorerie du {formatDate(s.from)} au {formatDate(s.to)} ({s.days} j), jusqu&apos;à {formatMoney(s.minBalanceMillimes)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Compare({ label, base, sim, delta, hint, worse, better }: { label: string; base: string; sim: string; delta?: number; hint?: string; worse?: boolean; better?: boolean }) {
  const bad = worse ?? (delta !== undefined && delta < 0);
  const good = better ?? (delta !== undefined && delta > 0);
  return (
    <Card className="gap-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="flex flex-wrap items-center gap-2 tabular-nums">
        <span className="text-muted-foreground">{base}</span>
        <ArrowRight className="size-3.5 text-muted-foreground" aria-label="devient" />
        <strong className={cn(bad && 'text-danger', good && 'text-inflow')}>{sim}</strong>
      </p>
      {(delta !== undefined || hint) && (
        <p className={cn('text-xs', bad ? 'text-danger' : good ? 'text-inflow' : 'text-muted-foreground')}>
          {delta !== undefined && delta !== 0 ? formatMoney(delta, { signed: true }) : delta === 0 ? 'inchangé' : ''} {hint}
        </p>
      )}
    </Card>
  );
}

function AdjustmentCard({
  index,
  item,
  receivables,
  payables,
  flows,
  onChange,
  onRemove,
}: {
  index: number;
  item: AdjustmentItem;
  receivables: FlowDto[];
  payables: FlowDto[];
  flows: FlowDto[];
  onChange: (a: Adjustment) => void;
  onRemove: () => void;
}) {
  const a = item.adjustment;
  const id = item.id;
  const title = {
    DELAY_RECEIVABLE: 'Retarder un encaissement',
    SHIFT_PAYABLE: 'Décaler une dépense',
    ADD_OUTFLOW: 'Ajouter une dépense',
    ADD_INFLOW: 'Ajouter une rentrée',
    EXCLUDE_FLOW: 'Exclure un flux',
  }[a.type];

  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="sr-only">
        Hypothèse {index + 1} : {title}
      </legend>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <Button variant="ghost" size="icon-sm" aria-label={`Retirer l'hypothèse ${index + 1}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      {a.type === 'DELAY_RECEIVABLE' && (
        <>
          <Field id={`${id}-t`} label="Facture">
            <NativeSelect value={a.invoiceId} onChange={(e) => onChange({ ...a, invoiceId: e.target.value })}>
              {receivables.map((f) => (
                <option key={f.key} value={f.key.slice('invoice:'.length)}>
                  {f.label} — {formatMoney(f.amountMillimes)} ({formatDate(f.originalDate ?? f.date, 'short')})
                </option>
              ))}
            </NativeSelect>
          </Field>
          <DaysInput id={`${id}-d`} label="Retard (jours)" value={a.days} onChange={(days) => onChange({ ...a, days })} />
        </>
      )}
      {a.type === 'SHIFT_PAYABLE' && (
        <>
          <Field id={`${id}-t`} label="Dépense">
            <NativeSelect value={a.expenseId} onChange={(e) => onChange({ ...a, expenseId: e.target.value })}>
              {payables.map((f) => (
                <option key={f.key} value={f.key.slice('expense:'.length)}>
                  {f.label} — {formatMoney(-f.amountMillimes)} ({formatDate(f.originalDate ?? f.date, 'short')})
                </option>
              ))}
            </NativeSelect>
          </Field>
          <DaysInput id={`${id}-d`} label="Décalage (jours, négatif = avancer)" value={a.days} onChange={(days) => onChange({ ...a, days })} />
        </>
      )}
      {(a.type === 'ADD_OUTFLOW' || a.type === 'ADD_INFLOW') && (
        <>
          <Field id={`${id}-l`} label="Libellé">
            <Input value={a.label} onChange={(e) => onChange({ ...a, label: e.target.value })} placeholder={a.type === 'ADD_OUTFLOW' ? 'Ex. recrutement' : 'Ex. subvention'} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field id={`${id}-a`} label="Montant">
              <MoneyInput
                defaultMillimes={a.amountMillimes > 0 ? a.amountMillimes : null}
                onValueChange={(_raw, millimes) => onChange({ ...a, amountMillimes: millimes !== null && millimes > 0 ? millimes : 0 })}
              />
            </Field>
            <Field id={`${id}-dt`} label="Date">
              <DateField value={a.date} onValueChange={(date) => onChange({ ...a, date })} />
            </Field>
          </div>
        </>
      )}
      {a.type === 'EXCLUDE_FLOW' && (
        <Field id={`${id}-t`} label="Flux à exclure">
          <NativeSelect value={a.flowKey} onChange={(e) => onChange({ ...a, flowKey: e.target.value })}>
            {flows.map((f) => (
              <option key={f.key} value={f.key}>
                {formatDate(f.date, 'short')} — {f.label} ({formatMoney(f.amountMillimes, { signed: true })})
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
    </fieldset>
  );
}

function DaysInput({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={-365}
        max={365}
        step={1}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Math.trunc(Number(e.target.value) || 0))}
        className="tabular-nums"
      />
    </div>
  );
}

function SaveScenarioForm({ company, scenario, horizon, adjustments }: { company: string; scenario?: WorkbenchProps['scenario']; horizon: number; adjustments: Adjustment[] }) {
  const router = useRouter();
  const [state, formAction, formPending] = useFormAction(async (prev: ActionState<unknown>, fd: FormData) => {
    const r = await saveScenarioAction(prev, fd);
    if (r?.ok) {
      toast.success('Scénario enregistré');
      router.refresh();
    }
    return r;
  });
  return (
    <form onSubmit={formAction} className="grid gap-3 border-t pt-3">
      <CompanyField company={company} />
      {scenario && <input type="hidden" name="id" value={scenario.id} />}
      <input type="hidden" name="horizon" value={String(horizon)} />
      <input type="hidden" name="adjustments" value={JSON.stringify(adjustments)} />
      <FormError state={state} />
      <Field id="scenario-name" label="Nom du scénario" required>
        <Input name="name" defaultValue={scenario?.name ?? ''} required minLength={2} maxLength={120} placeholder="Ex. Retard client + recrutement" />
      </Field>
      <SubmitButton pending={formPending} variant="secondary">Enregistrer le scénario</SubmitButton>
    </form>
  );
}
