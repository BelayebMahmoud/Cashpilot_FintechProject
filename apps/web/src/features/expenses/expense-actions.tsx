'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Send, Undo2, Wallet, X } from 'lucide-react';
import { type ExpenseDto } from '@cashpilot/application';
import {
  Button,
  ConfirmDialog,
  DateField,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  toast,
} from '@cashpilot/ui';
import { formatDate, formatMoney } from '@cashpilot/ui/format';
import { type ActionState } from '@/lib/action-state';
import {
  approveExpenseAction,
  markExpensePaidAction,
  rejectExpenseAction,
  reverseExpensePaymentAction,
  submitExpenseAction,
  withdrawExpenseAction,
} from './actions';

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

export function useExpenseCommand() {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const run = React.useCallback(
    (fn: () => Promise<ActionState<unknown>>, success: string, after?: () => void) =>
      startTransition(async () => {
        const r = await fn();
        if (r?.ok) {
          toast.success(success);
          after?.();
          router.refresh();
        } else if (r) toast.error(r.message);
      }),
    [router],
  );
  return { pending, run };
}

export interface ExpenseActionsProps {
  company: string;
  expense: Pick<ExpenseDto, 'id' | 'label' | 'amountMillimes' | 'status' | 'submittedById' | 'submittedByName' | 'dueDate'>;
  currentUserId: string;
  canApprove: boolean;
  canPay: boolean;
  today: string;
}

/** Context-dependent actions on an expense, each one explaining its consequences. */
export function ExpenseActions({ company, expense, currentUserId, canApprove, canPay, today }: ExpenseActionsProps) {
  const { pending, run } = useExpenseCommand();
  const mine = expense.submittedById === currentUserId;
  const what = `${expense.label} — ${formatMoney(expense.amountMillimes)}`;
  return (
    <div className="flex flex-wrap gap-2">
      {mine && expense.status === 'DRAFT' && (
        <Button loading={pending} onClick={() => run(() => submitExpenseAction(null, fd({ company, id: expense.id })), 'Dépense soumise pour validation')}>
          <Send /> Soumettre
        </Button>
      )}
      {mine && expense.status === 'SUBMITTED' && (
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <Undo2 /> Retirer la demande
            </Button>
          }
          title="Retirer la demande"
          consequences={['La dépense repasse en brouillon : vous pourrez la modifier puis la soumettre à nouveau.']}
          confirmLabel="Retirer la demande"
          pending={pending}
          onConfirm={() => run(() => withdrawExpenseAction(null, fd({ company, id: expense.id })), 'Demande retirée')}
        />
      )}
      {canApprove && expense.status === 'SUBMITTED' && <ApproveRejectButtons company={company} expense={expense} self={mine} />}
      {canPay && expense.status === 'APPROVED' && <MarkPaidDialog company={company} expense={expense} today={today} />}
      {canPay && expense.status === 'PAID' && (
        <ConfirmDialog
          trigger={
            <Button variant="outline">
              <Undo2 /> Annuler le paiement
            </Button>
          }
          title="Annuler le paiement de la dépense"
          description={what}
          consequences={['Une écriture inverse est ajoutée en trésorerie ; le paiement d’origine reste dans l’historique.', 'La dépense redevient « Approuvée » (à payer).']}
          reasonLabel="Motif"
          confirmLabel="Annuler le paiement"
          destructive
          pending={pending}
          onConfirm={(reason) => run(() => reverseExpensePaymentAction(null, fd({ company, id: expense.id, reason })), 'Paiement annulé')}
        />
      )}
    </div>
  );
}

export function ApproveRejectButtons({
  company,
  expense,
  self,
  onDone,
}: {
  company: string;
  expense: Pick<ExpenseDto, 'id' | 'label' | 'amountMillimes' | 'submittedByName'>;
  self: boolean;
  onDone?: () => void;
}) {
  const { pending, run } = useExpenseCommand();
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const what = `${expense.label} — ${formatMoney(expense.amountMillimes)} (${expense.submittedByName})`;
  return (
    <>
      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        trigger={
          <Button data-shortcut="approve">
            <Check /> Approuver
          </Button>
        }
        title="Approuver la dépense"
        description={what}
        consequences={[
          'Elle devient « à payer » et entre dans la prévision à sa date d’échéance.',
          ...(self ? ['Il s’agit de votre propre dépense : l’approbation sera tracée comme auto-approbation.'] : []),
        ]}
        confirmLabel="Approuver la dépense"
        pending={pending}
        onConfirm={() => run(() => approveExpenseAction(null, fd({ company, id: expense.id })), 'Dépense approuvée', () => (setApproveOpen(false), onDone?.()))}
      />
      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        trigger={
          <Button variant="outline" data-shortcut="reject">
            <X /> Refuser
          </Button>
        }
        title="Refuser la dépense"
        description={what}
        consequences={['Le refus est définitif : la dépense ne pourra jamais être payée.', 'Le motif sera visible par la personne qui l’a soumise.']}
        reasonLabel="Motif du refus"
        confirmLabel="Refuser la dépense"
        destructive
        pending={pending}
        onConfirm={(reason) => run(() => rejectExpenseAction(null, fd({ company, id: expense.id, reason })), 'Dépense refusée', () => (setRejectOpen(false), onDone?.()))}
      />
    </>
  );
}

export function MarkPaidDialog({ company, expense, today }: { company: string; expense: Pick<ExpenseDto, 'id' | 'label' | 'amountMillimes' | 'dueDate'>; today: string }) {
  const { pending, run } = useExpenseCommand();
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState(today);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Wallet /> Marquer comme payée
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marquer comme payée</DialogTitle>
          <DialogDescription>
            {expense.label} — <strong>{formatMoney(expense.amountMillimes)}</strong> (échéance {formatDate(expense.dueDate)})
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Un décaissement du même montant est enregistré en trésorerie à la date choisie.</li>
          <li>Le solde réel diminue d’autant ; la dépense sort de la prévision.</li>
        </ul>
        <Field id={`paid-date-${expense.id}`} label="Date du paiement" required>
          <DateField value={date} onValueChange={setDate} max={today} required />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Annuler
          </Button>
          <Button loading={pending} onClick={() => run(() => markExpensePaidAction(null, fd({ company, id: expense.id, date })), 'Dépense marquée comme payée', () => setOpen(false))}>
            Enregistrer le paiement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
