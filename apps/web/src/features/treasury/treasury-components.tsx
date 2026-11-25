'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button, DateField, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Field, MoneyInput, NativeSelect, Textarea, toast } from '@cashpilot/ui';
import { CompanyField, FormError, SubmitButton } from '@/components/forms';
import { useFormAction } from '@/hooks/use-form-action';
import { fieldError, type ActionState } from '@/lib/action-state';
import { recordAdjustmentAction } from './actions';

/** "Mouvement manuel" (finance): a traceable correction with a mandatory reason. Never an edit. */
export function AdjustmentDialog({ company, today, openingDate }: { company: string; today: string; openingDate: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, formAction, formPending] = useFormAction(async (prev: ActionState<{ movementId: string }>, fd: FormData) => {
    const r = await recordAdjustmentAction(prev, fd);
    if (r?.ok) {
      toast.success('Mouvement manuel enregistré');
      setOpen(false);
      router.refresh();
    }
    return r;
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal /> Mouvement manuel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enregistrer un mouvement manuel</DialogTitle>
          <DialogDescription>Pour corriger le solde réel (frais bancaires, écart de caisse…). Le mouvement est définitif et tracé.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={formAction} className="grid gap-4">
          <CompanyField company={company} />
          <FormError state={state} formRef={formRef} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="adj-direction" label="Sens" required>
              <NativeSelect name="direction" defaultValue="OUT">
                <option value="OUT">Sortie (décaissement)</option>
                <option value="IN">Entrée (encaissement)</option>
              </NativeSelect>
            </Field>
            <Field id="adj-amount" label="Montant" required error={fieldError(state, 'amount')}>
              <MoneyInput name="amount" required />
            </Field>
          </div>
          <Field id="adj-date" label="Date" required error={fieldError(state, 'date')} hint={`Entre le ${openingDate} et aujourd'hui.`}>
            <DateField name="date" defaultValue={today} min={openingDate} max={today} required />
          </Field>
          <Field id="adj-reason" label="Motif" required error={fieldError(state, 'reason')}>
            <Textarea name="reason" required maxLength={300} rows={2} />
          </Field>
          <SubmitButton pending={formPending}>Enregistrer le mouvement</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
