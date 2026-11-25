'use client';

import * as React from 'react';
import { useReducer } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { VAT_RATES_BP } from '@cashpilot/domain';
import { Amount, Button, Card, DateField, Field, Input, Label, MoneyInput, NativeSelect, Separator, Textarea } from '@cashpilot/ui';
import { CompanyField, FormError, SubmitButton } from '@/components/forms';
import { useFormAction } from '@/hooks/use-form-action';
import { fieldError } from '@/lib/action-state';
import { saveInvoiceDraftAction } from './actions';
import { lineReducer, liveTotals, type EditorLine } from './line-editor';

export interface InvoiceEditorProps {
  company: string;
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientId: string }[];
  stampDutyMillimes: number;
  today: string;
  initial?: {
    id: string;
    clientId: string;
    issueDate: string;
    dueDate: string;
    notes: string | null;
    projectId: string | null;
    lines: EditorLine[];
  };
  /** Prefill from a project milestone (sector feature). */
  milestone?: { projectId: string; milestoneId: string; clientId: string; label: string; amount: string };
}

let keySeq = 0;
const nextKey = () => `l${Date.now().toString(36)}${(keySeq++).toString(36)}`;

/**
 * Two columns: the form (client, dates, lines with a `useReducer` editor) and a sticky
 * totals card computed live with the domain's own `computeTotals`.
 */
export function InvoiceEditor({ company, clients, projects, stampDutyMillimes, today, initial, milestone }: InvoiceEditorProps) {
  const [state, formAction, formPending] = useFormAction(saveInvoiceDraftAction);
  const formRef = React.useRef<HTMLFormElement>(null);
  const [clientId, setClientId] = React.useState(initial?.clientId ?? milestone?.clientId ?? '');
  const [lines, dispatch] = useReducer(
    lineReducer,
    initial?.lines ??
      (milestone
        ? [{ key: nextKey(), description: milestone.label, quantity: '1', unitPrice: milestone.amount, vatRateBp: 1900 }]
        : [{ key: nextKey(), description: '', quantity: '1', unitPrice: '', vatRateBp: 1900 }]),
  );
  const lastDescription = React.useRef<HTMLInputElement>(null);
  const focusNewLine = React.useRef(false);

  // derive, don't sync: totals are computed during render
  const totals = liveTotals(lines, stampDutyMillimes);
  const clientProjects = projects.filter((p) => p.clientId === clientId);

  // DOM focus (outside React state): move focus to the line that was just added
  React.useEffect(() => {
    if (focusNewLine.current) {
      focusNewLine.current = false;
      lastDescription.current?.focus();
    }
  }, [lines.length]);

  function addLine() {
    focusNewLine.current = true;
    dispatch({ type: 'add', key: nextKey() });
  }

  const due30 = new Date(`${today}T00:00:00Z`);
  due30.setUTCDate(due30.getUTCDate() + 30);

  return (
    <form ref={formRef} onSubmit={formAction} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <CompanyField company={company} />
      {initial && <input type="hidden" name="id" value={initial.id} />}
      {milestone && <input type="hidden" name="milestoneId" value={milestone.milestoneId} />}
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(lines.map(({ description, quantity, unitPrice, vatRateBp }) => ({ description, quantity, unitPrice, vatRateBp })))}
      />

      <div className="min-w-0 space-y-6">
        <FormError state={state} formRef={formRef} />
        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="clientId" label="Client" required error={fieldError(state, 'clientId')} className="md:col-span-2">
              <NativeSelect name="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="" disabled>
                  Choisir un client…
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id="issueDate" label="Date d'émission" required error={fieldError(state, 'issueDate')}>
              <DateField name="issueDate" defaultValue={initial?.issueDate ?? today} required />
            </Field>
            <Field id="dueDate" label="Échéance" required error={fieldError(state, 'dueDate')} hint="Date à laquelle le paiement est attendu.">
              <DateField name="dueDate" defaultValue={initial?.dueDate ?? due30.toISOString().slice(0, 10)} required />
            </Field>
            {(clientProjects.length > 0 || milestone) && (
              <Field id="projectId" label="Projet (optionnel)" className="md:col-span-2">
                <NativeSelect name="projectId" defaultValue={initial?.projectId ?? milestone?.projectId ?? ''}>
                  <option value="">Aucun projet</option>
                  {clientProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </div>
        </Card>

        <Card className="gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Lignes</h2>
            <p className="text-xs text-muted-foreground">Entrée dans une désignation ajoute une ligne.</p>
          </div>
          {fieldError(state, 'lines') && <p className="text-sm text-danger">{fieldError(state, 'lines')}</p>}
          <ol className="space-y-3">
            {lines.map((l, i) => (
              <LineRow
                key={l.key}
                line={l}
                index={i}
                inputRef={i === lines.length - 1 ? lastDescription : undefined}
                htMillimes={totals.lines.length === lines.length ? (totals.lines[i]?.htMillimes ?? null) : null}
                onChange={(patch) => dispatch({ type: 'update', key: l.key, patch })}
                onRemove={() => dispatch({ type: 'remove', key: l.key })}
                onDuplicate={() => dispatch({ type: 'duplicate', key: l.key, newKey: nextKey() })}
                onEnter={addLine}
              />
            ))}
          </ol>
          <Button type="button" variant="outline" onClick={addLine} className="justify-self-start">
            <Plus /> Ajouter une ligne
          </Button>
        </Card>

        <Card>
          <Field id="notes" label="Notes (apparaissent sur la facture)">
            <Textarea name="notes" defaultValue={initial?.notes ?? ''} rows={3} maxLength={1000} />
          </Field>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start" aria-label="Totaux">
        <Card className="gap-3">
          <h2 className="font-semibold">Totaux</h2>
          <TotalRow label="Total HT" value={totals.htMillimes} />
          {totals.vatByRate.map((v) => (
            <TotalRow key={v.rateBp} label={`TVA ${v.rateBp / 100} %`} value={v.vatMillimes} />
          ))}
          {stampDutyMillimes > 0 && <TotalRow label="Timbre fiscal" value={stampDutyMillimes} />}
          <Separator />
          <div className="flex items-baseline justify-between" aria-live="polite">
            <span className="font-medium">Total TTC</span>
            <Amount value={totals.totalMillimes} size="lg" />
          </div>
          <div className="sticky bottom-0 -mx-5 -mb-5 border-t bg-card p-4 lg:static lg:m-0 lg:border-0 lg:p-0">
            <SubmitButton pending={formPending} className="w-full">Enregistrer le brouillon</SubmitButton>
            <p className="mt-2 text-xs text-muted-foreground">La facture reste modifiable tant qu&apos;elle n&apos;est pas validée.</p>
          </div>
        </Card>
      </aside>
    </form>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Amount value={value} />
    </div>
  );
}

function LineRow({
  line,
  index,
  inputRef,
  htMillimes,
  onChange,
  onRemove,
  onDuplicate,
  onEnter,
}: {
  line: EditorLine;
  index: number;
  inputRef?: React.Ref<HTMLInputElement>;
  htMillimes: number | null;
  onChange: (patch: Partial<EditorLine>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onEnter: () => void;
}) {
  const id = `line-${line.key}`;
  return (
    <li className="grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_80px_140px_100px_auto] md:items-end">
      <div className="grid gap-1">
        <Label htmlFor={`${id}-d`}>
          Désignation <span className="sr-only">ligne {index + 1}</span>
        </Label>
        <Input
          id={`${id}-d`}
          ref={inputRef}
          value={line.description}
          onChange={(e) => onChange({ description: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onEnter();
            }
          }}
          maxLength={300}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${id}-q`}>Qté</Label>
        <Input id={`${id}-q`} inputMode="decimal" value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} className="text-right tabular-nums" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${id}-u`}>Prix unitaire HT</Label>
        <MoneyInput id={`${id}-u`} value={line.unitPrice} onValueChange={(raw) => onChange({ unitPrice: raw })} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`${id}-v`}>TVA</Label>
        <NativeSelect id={`${id}-v`} value={line.vatRateBp} onChange={(e) => onChange({ vatRateBp: Number(e.target.value) })}>
          {VAT_RATES_BP.map((r) => (
            <option key={r} value={r}>
              {r / 100} %
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex items-center justify-between gap-1 md:justify-end">
        <span className="text-sm md:hidden">{htMillimes !== null ? <Amount value={htMillimes} /> : '—'}</span>
        <div className="flex">
          <Button type="button" variant="ghost" size="icon" aria-label={`Dupliquer la ligne ${index + 1}`} onClick={onDuplicate}>
            <Copy />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`Supprimer la ligne ${index + 1}`} onClick={onRemove}>
            <Trash2 />
          </Button>
        </div>
      </div>
    </li>
  );
}
