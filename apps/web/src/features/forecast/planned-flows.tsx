'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Plus } from 'lucide-react';
import { type PlannedFlowDto } from '@cashpilot/application';
import {
  Amount,
  Badge,
  Button,
  ConfirmDialog,
  DateField,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  MoneyInput,
  NativeSelect,
  toast,
} from '@cashpilot/ui';
import { formatDate, formatMoney } from '@cashpilot/ui/format';
import { CompanyField, FormError, SubmitButton } from '@/components/forms';
import { useFormAction } from '@/hooks/use-form-action';
import { fieldError, type ActionState } from '@/lib/action-state';
import { cancelPlannedFlowAction, createPlannedFlowAction } from './actions';

export function NewPlannedFlowDialog({ company, today }: { company: string; today: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [recurrence, setRecurrence] = React.useState('NONE');
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, formAction, formPending] = useFormAction(async (prev: ActionState<PlannedFlowDto>, fd: FormData) => {
    const r = await createPlannedFlowAction(prev, fd);
    if (r?.ok) {
      toast.success('Flux prévu ajouté à la prévision');
      setOpen(false);
      router.refresh();
    }
    return r;
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Ajouter un flux prévu
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un flux prévu</DialogTitle>
          <DialogDescription>Salaires, loyer, rentrée attendue sans facture… Il alimente la prévision, jamais le solde réel.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={formAction} className="grid gap-4">
          <CompanyField company={company} />
          <FormError state={state} formRef={formRef} />
          <Field id="pf-label" label="Libellé" required error={fieldError(state, 'label')}>
            <Input name="label" required minLength={2} maxLength={120} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="pf-direction" label="Sens" required>
              <NativeSelect name="direction" defaultValue="OUT">
                <option value="OUT">Décaissement</option>
                <option value="IN">Encaissement</option>
              </NativeSelect>
            </Field>
            <Field id="pf-amount" label="Montant" required error={fieldError(state, 'amount')}>
              <MoneyInput name="amount" required />
            </Field>
            <Field id="pf-date" label="Date prévue" required error={fieldError(state, 'expectedDate')}>
              <DateField name="expectedDate" defaultValue={today} required />
            </Field>
            <Field id="pf-recurrence" label="Récurrence" required>
              <NativeSelect name="recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                <option value="NONE">Ponctuel</option>
                <option value="MONTHLY">Mensuel</option>
              </NativeSelect>
            </Field>
          </div>
          {recurrence === 'MONTHLY' && (
            <Field id="pf-end" label="Jusqu'au (optionnel)" error={fieldError(state, 'endDate')}>
              <DateField name="endDate" />
            </Field>
          )}
          <SubmitButton pending={formPending}>Ajouter le flux</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlannedFlowList({ company, flows, canWrite }: { company: string; flows: PlannedFlowDto[]; canWrite: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {flows.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="font-medium">
              {f.label} {f.cancelled && <Badge tone="outline">Annulé</Badge>}
            </p>
            <p className="text-xs text-muted-foreground">
              {f.recurrence === 'MONTHLY' ? `Chaque mois depuis le ${formatDate(f.expectedDate)}${f.endDate ? ` jusqu'au ${formatDate(f.endDate)}` : ''}` : `Le ${formatDate(f.expectedDate)}`}
              {!f.cancelled && f.nextOccurrence ? ` · prochaine : ${formatDate(f.nextOccurrence)}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Amount value={f.direction === 'IN' ? f.amountMillimes : -f.amountMillimes} signed strike={f.cancelled} />
            {canWrite && !f.cancelled && (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm">
                    <Ban /> Annuler
                  </Button>
                }
                title={`Annuler « ${f.label} »`}
                consequences={[`Le flux de ${formatMoney(f.amountMillimes)} sort de la prévision.`, 'Il reste visible dans cette liste (historique).']}
                confirmLabel="Annuler le flux prévu"
                destructive
                pending={pending}
                onConfirm={() =>
                  startTransition(async () => {
                    const fd = new FormData();
                    fd.set('company', company);
                    fd.set('id', f.id);
                    const r = await cancelPlannedFlowAction(null, fd);
                    if (r?.ok) {
                      toast.success('Flux prévu annulé');
                      router.refresh();
                    } else if (r) toast.error(r.message);
                  })
                }
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
