'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import {
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
import { formatMoney } from '@cashpilot/ui/format';
import { CompanyField, FormError, SubmitButton } from '@/components/forms';
import { useFormAction } from '@/hooks/use-form-action';
import { fieldError, type ActionState } from '@/lib/action-state';
import { addMilestoneAction, closeProjectAction, removeMilestoneAction, saveProjectAction } from './actions';

export function ProjectDialog({
  company,
  clients,
  today,
  project,
}: {
  company: string;
  clients: { id: string; name: string }[];
  today: string;
  project?: { id: string; name: string; clientId: string; budgetMillimes: number; startDate: string; endDate: string | null };
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const [state, formAction, formPending] = useFormAction(async (prev: ActionState<unknown>, fd: FormData) => {
    const r = await saveProjectAction(prev, fd);
    if (r?.ok) {
      toast.success('Projet enregistré');
      setOpen(false);
      router.refresh();
    }
    return r;
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {project ? (
          <Button variant="outline">
            <Pencil /> Modifier
          </Button>
        ) : (
          <Button>
            <Plus /> Nouveau projet
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{project ? 'Modifier le projet' : 'Nouveau projet'}</DialogTitle>
          <DialogDescription>Rattachez factures et dépenses au projet pour suivre sa rentabilité.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={formAction} className="grid gap-4">
          <CompanyField company={company} />
          {project && <input type="hidden" name="id" value={project.id} />}
          <FormError state={state} formRef={formRef} />
          <Field id="pr-name" label="Nom du projet" required error={fieldError(state, 'name')}>
            <Input name="name" defaultValue={project?.name} required minLength={2} />
          </Field>
          <Field id="pr-client" label="Client" required error={fieldError(state, 'clientId')}>
            <NativeSelect name="clientId" defaultValue={project?.clientId ?? ''} required>
              <option value="" disabled>
                Choisir…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="pr-budget" label="Budget HT" required error={fieldError(state, 'budget')}>
            <MoneyInput name="budget" defaultMillimes={project?.budgetMillimes ?? null} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="pr-start" label="Début" required error={fieldError(state, 'startDate')}>
              <DateField name="startDate" defaultValue={project?.startDate ?? today} required />
            </Field>
            <Field id="pr-end" label="Fin prévue" error={fieldError(state, 'endDate')}>
              <DateField name="endDate" defaultValue={project?.endDate ?? ''} />
            </Field>
          </div>
          <SubmitButton pending={formPending}>{project ? 'Enregistrer le projet' : 'Créer le projet'}</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MilestoneDialog({ company, projectId, today }: { company: string; projectId: string; today: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [state, formAction, formPending] = useFormAction(async (prev: ActionState<unknown>, fd: FormData) => {
    const r = await addMilestoneAction(prev, fd);
    if (r?.ok) {
      toast.success('Jalon ajouté : il alimente la prévision');
      setOpen(false);
      router.refresh();
    }
    return r;
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus /> Ajouter un jalon
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un jalon de paiement</DialogTitle>
          <DialogDescription>Acompte ou étape facturable : tant qu&apos;il n&apos;est pas facturé, il compte comme encaissement attendu.</DialogDescription>
        </DialogHeader>
        <form onSubmit={formAction} className="grid gap-4">
          <CompanyField company={company} />
          <input type="hidden" name="projectId" value={projectId} />
          <FormError state={state} />
          <Field id="ms-label" label="Libellé" required error={fieldError(state, 'label')}>
            <Input name="label" required placeholder="Ex. Acompte 30 %" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ms-amount" label="Montant attendu" required error={fieldError(state, 'amount')}>
              <MoneyInput name="amount" required />
            </Field>
            <Field id="ms-date" label="Date attendue" required error={fieldError(state, 'expectedDate')}>
              <DateField name="expectedDate" defaultValue={today} required />
            </Field>
          </div>
          <SubmitButton pending={formPending}>Ajouter le jalon</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveMilestoneButton({ company, projectId, milestoneId, label, amountMillimes }: { company: string; projectId: string; milestoneId: string; label: string; amountMillimes: number }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Supprimer le jalon ${label}`}>
          <Trash2 />
        </Button>
      }
      title={`Supprimer le jalon « ${label} »`}
      consequences={[`${formatMoney(amountMillimes)} sortent de la prévision.`]}
      confirmLabel="Supprimer le jalon"
      destructive
      pending={pending}
      onConfirm={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set('company', company);
          fd.set('projectId', projectId);
          fd.set('milestoneId', milestoneId);
          const r = await removeMilestoneAction(null, fd);
          if (r?.ok) {
            toast.success('Jalon supprimé');
            router.refresh();
          } else if (r) toast.error(r.message);
        })
      }
    />
  );
}

export function CloseProjectButton({ company, id, name }: { company: string; id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost">
          <Lock /> Clôturer
        </Button>
      }
      title={`Clôturer le projet « ${name} »`}
      consequences={['Les jalons non facturés sortent de la prévision.', 'Les factures et dépenses rattachées restent inchangées.']}
      confirmLabel="Clôturer le projet"
      pending={pending}
      onConfirm={() =>
        startTransition(async () => {
          const fd = new FormData();
          fd.set('company', company);
          fd.set('id', id);
          const r = await closeProjectAction(null, fd);
          if (r?.ok) {
            toast.success('Projet clôturé');
            router.refresh();
          } else if (r) toast.error(r.message);
        })
      }
    />
  );
}
