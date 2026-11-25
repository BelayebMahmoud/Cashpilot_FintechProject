'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Ban, CheckCheck, Download, HandCoins, Pencil, Trash2, Undo2 } from 'lucide-react';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@cashpilot/domain';
import {
  Amount,
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
  MoneyInput,
  NativeSelect,
  toast,
  Tooltip,
} from '@cashpilot/ui';
import { formatMoney, formatMoneyInput } from '@cashpilot/ui/format';
import { CompanyField, FormError, SubmitButton } from '@/components/forms';
import { useFormAction } from '@/hooks/use-form-action';
import { fieldError, type ActionState } from '@/lib/action-state';
import { routes } from '@/lib/routes';
import { cancelInvoiceAction, deleteInvoiceDraftAction, recordPaymentAction, reversePaymentAction, validateInvoiceAction } from './actions';

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

export interface InvoiceActionsProps {
  company: string;
  invoice: { id: string; number: string | null; status: 'DRAFT' | 'ISSUED' | 'CANCELLED'; remainingMillimes: number; paidMillimes: number; issueDate: string; clientName: string; totalMillimes: number };
  canWrite: boolean;
  canPay: boolean;
  today: string;
}

/** Header actions of the invoice detail; irreversible ones go through ConfirmDialog. */
export function InvoiceActions({ company, invoice, canWrite, canPay, today }: InvoiceActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const run = (fn: () => Promise<ActionState<unknown>>, success: string, close?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      if (r?.ok) {
        toast.success(success);
        close?.();
        router.refresh();
      } else if (r) toast.error(r.message);
    });

  return (
    <div className="flex flex-wrap gap-2">
      {invoice.status === 'ISSUED' && canPay && invoice.remainingMillimes > 0 && (
        <RecordPaymentDialog company={company} invoiceId={invoice.id} remainingMillimes={invoice.remainingMillimes} today={today} minDate={invoice.issueDate} />
      )}
      {invoice.status !== 'DRAFT' && (
        <Button variant="outline" asChild>
          <a href={routes.invoicePdf(company, invoice.id)} download>
            <Download /> Télécharger le PDF
          </a>
        </Button>
      )}
      {invoice.status === 'DRAFT' && canWrite && (
        <>
          <ConfirmDialog
            trigger={
              <Button>
                <CheckCheck /> Valider la facture
              </Button>
            }
            title="Valider la facture"
            description="La facture recevra son numéro définitif et ne pourra plus être modifiée."
            consequences={[
              `${invoice.clientName} — ${formatMoney(invoice.totalMillimes)} TTC`,
              'Le montant alimentera la prévision à sa date d’échéance.',
              'Une erreur se corrigera ensuite par une annulation (motif obligatoire).',
            ]}
            confirmLabel="Valider la facture"
            pending={pending}
            onConfirm={() =>
              run(() => validateInvoiceAction(null, fd({ company, id: invoice.id })), 'Facture validée et numérotée')
            }
          />
          <Button variant="outline" asChild>
            <Link href={routes.editInvoice(company, invoice.id)}>
              <Pencil /> Modifier
            </Link>
          </Button>
          <ConfirmDialog
            trigger={
              <Button variant="ghost" aria-label="Supprimer le brouillon">
                <Trash2 /> Supprimer
              </Button>
            }
            title="Supprimer le brouillon"
            consequences={['Le brouillon sera définitivement supprimé.', 'Aucun numéro de facture n’est consommé.']}
            confirmLabel="Supprimer le brouillon"
            destructive
            pending={pending}
            onConfirm={() => run(() => deleteInvoiceDraftAction(null, fd({ company, id: invoice.id })), 'Brouillon supprimé')}
          />
        </>
      )}
      {invoice.status === 'ISSUED' && canWrite && (
        invoice.paidMillimes !== 0 ? (
          <Tooltip label="Annulation impossible : des encaissements existent. Contre-passez-les d'abord.">
            <span tabIndex={0}>
              <Button variant="ghost" disabled>
                <Ban /> Annuler
              </Button>
            </span>
          </Tooltip>
        ) : (
          <ConfirmDialog
            trigger={
              <Button variant="ghost">
                <Ban /> Annuler
              </Button>
            }
            title={`Annuler la facture ${invoice.number}`}
            consequences={[
              'La facture est conservée avec la mention « ANNULÉE » et son numéro n’est pas réutilisé.',
              'Elle ne compte plus dans le reste à encaisser ni dans la prévision.',
            ]}
            reasonLabel="Motif d'annulation"
            confirmLabel="Annuler la facture"
            destructive
            pending={pending}
            onConfirm={(reason) => run(() => cancelInvoiceAction(null, fd({ company, id: invoice.id, reason })), 'Facture annulée')}
          />
        )
      )}
    </div>
  );
}

/** "Enregistrer un encaissement": remaining shown, "Solder" chip, max = remaining, no future dates. */
export function RecordPaymentDialog({
  company,
  invoiceId,
  remainingMillimes,
  today,
  minDate,
}: {
  company: string;
  invoiceId: string;
  remainingMillimes: number;
  today: string;
  minDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState('');
  // idempotency key: a double submit of the same dialog records the payment once
  const [operationId, setOperationId] = React.useState('');
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, formAction, formPending] = useFormAction(async (prev: ActionState<{ paymentId: string; remainingMillimes: number }>, data: FormData) => {
    const r = await recordPaymentAction(prev, data);
    if (r?.ok) {
      toast.success(`Encaissement enregistré — reste à payer ${formatMoney(r.value.remainingMillimes)}`);
      setOpen(false);
      router.refresh();
    }
    return r;
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setAmount('');
          setOperationId(crypto.randomUUID());
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <HandCoins /> Enregistrer un encaissement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enregistrer un encaissement</DialogTitle>
          <DialogDescription>
            Reste à payer : <Amount value={remainingMillimes} className="font-semibold text-foreground" />
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={formAction} className="grid gap-4">
          <CompanyField company={company} />
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="operationId" value={operationId} />
          <FormError state={state} formRef={formRef} />
          <Field id="pay-amount" label="Montant" required error={fieldError(state, 'amount')} hint="Paiement total ou partiel.">
            <MoneyInput name="amount" value={amount} onValueChange={(raw) => setAmount(raw)} required size="lg" autoFocus />
          </Field>
          <Button type="button" variant="secondary" size="sm" className="justify-self-start" onClick={() => setAmount(formatMoneyInput(remainingMillimes))}>
            Solder ({formatMoney(remainingMillimes)})
          </Button>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="pay-date" label="Date d'encaissement" required error={fieldError(state, 'date')}>
              <DateField name="date" defaultValue={today} max={today} min={minDate} required />
            </Field>
            <Field id="pay-method" label="Mode de paiement" required>
              <NativeSelect name="method" defaultValue="TRANSFER">
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <SubmitButton pending={formPending}>Enregistrer l&apos;encaissement</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReversePaymentButton({ company, invoiceId, paymentId, label }: { company: string; invoiceId: string; paymentId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="sm">
          <Undo2 /> Contre-passer
        </Button>
      }
      title="Contre-passer l'encaissement"
      description={label}
      consequences={[
        "L'encaissement d'origine est conservé ; une écriture inverse est ajoutée.",
        'Le solde réel diminue du même montant et le reste à payer augmente.',
      ]}
      reasonLabel="Motif (ex. chèque impayé)"
      confirmLabel="Contre-passer l'encaissement"
      destructive
      pending={pending}
      onConfirm={(reason) =>
        startTransition(async () => {
          const r = await reversePaymentAction(null, fd({ company, invoiceId, paymentId, reason }));
          if (r?.ok) {
            toast.success('Encaissement contre-passé');
            setOpen(false);
            router.refresh();
          } else if (r) toast.error(r.message);
        })
      }
    />
  );
}
